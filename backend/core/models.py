"""
LegacyMind - Pydantic Models
All data models for the impact analysis pipeline, graph visualization, and agent orchestration.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────

class RiskLevel(str, Enum):
    """Risk classification levels for impact assessment."""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class TestType(str, Enum):
    """Types of generated test cases."""
    UNIT = "UNIT"
    INTEGRATION = "INTEGRATION"


class AgentStatusEnum(str, Enum):
    """Possible states for an agent in the pipeline."""
    IDLE = "idle"
    RUNNING = "running"
    COMPLETE = "complete"
    ERROR = "error"


# ─── Request Models ──────────────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    """Incoming change request to analyze impact for."""
    change_request: str = Field(
        ...,
        description="Natural-language description of the SAP change request",
        min_length=5,
        examples=["Modify employee salary calculation logic in ZHR_PAYROLL_CALC"],
    )
    target_modules: list[str] = Field(
        default=[],
        description="Optional list of SAP module codes to scope the analysis (e.g. ['HR', 'SD'])",
    )


# ─── Core Domain Models ─────────────────────────────────────────────────────

class ABAPObject(BaseModel):
    """Represents a single ABAP program / function module / include."""
    name: str = Field(..., description="Technical object name, e.g. ZHR_EMPLOYEE_MASTER")
    type: str = Field(..., description="Object type: REPORT, FUNCTION_MODULE, INCLUDE, CLASS")
    module: str = Field(..., description="SAP module: HR, SD, MM, FI, etc.")
    tables_used: list[str] = Field(default=[], description="Database tables read or written")
    calls: list[str] = Field(default=[], description="CALL FUNCTION targets")
    performs: list[str] = Field(default=[], description="PERFORM subroutine targets")
    description: str = Field(default="", description="Human-readable purpose")


class DependencyEdge(BaseModel):
    """A directed edge in the dependency graph."""
    source: str = Field(..., description="Calling object name")
    target: str = Field(..., description="Called object name")
    edge_type: str = Field(
        ...,
        description="Relationship type: CALL_FUNCTION, PERFORM, TABLE_ACCESS, CROSS_MODULE",
    )
    weight: float = Field(default=1.0, description="Edge weight for path analysis")


class RiskScore(BaseModel):
    """Risk assessment for a single affected object."""
    level: RiskLevel = Field(..., description="Qualitative risk level")
    score: float = Field(..., ge=0.0, le=10.0, description="Numeric score 0-10")
    reasoning: str = Field(..., description="Explanation of why this risk level was assigned")


class AffectedObject(BaseModel):
    """An object affected by the proposed change, with its risk context."""
    object: ABAPObject
    risk: RiskScore
    blast_radius: int = Field(
        ..., ge=0, description="Number of transitively reachable objects"
    )
    path: list[str] = Field(
        default=[], description="Dependency path from change source to this object"
    )


# ─── Reports ─────────────────────────────────────────────────────────────────

class ImpactReport(BaseModel):
    """Complete impact analysis report for a change request."""
    change_request: str
    affected_objects: list[AffectedObject] = Field(default=[])
    risk_summary: dict[str, int] = Field(
        default={},
        description="Counts per risk level, e.g. {'CRITICAL': 2, 'HIGH': 3}",
    )
    total_affected: int = Field(default=0)
    time_saved_weeks: float = Field(
        default=0.0,
        description="Estimated manual analysis weeks saved by automation",
    )
    cost_saved_estimate: float = Field(
        default=0.0,
        description="Estimated USD saved vs manual analysis",
    )
    timestamp: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat(),
    )


# ─── Test Generation ─────────────────────────────────────────────────────────

class TestCase(BaseModel):
    """A single generated test case."""
    name: str = Field(..., description="Test case identifier")
    type: TestType
    target_object: str = Field(..., description="ABAP object under test")
    abap_code: str = Field(..., description="Generated ABAP test source code")
    description: str = Field(default="")
    priority: int = Field(default=3, ge=1, le=5, description="1=highest priority")


class TestSuite(BaseModel):
    """Collection of test cases covering the affected objects."""
    test_cases: list[TestCase] = Field(default=[])
    coverage_percent: float = Field(
        default=0.0, ge=0.0, le=100.0,
        description="Percentage of affected objects covered by tests",
    )
    affected_objects_count: int = Field(default=0)


# ─── Graph / Visualization ──────────────────────────────────────────────────

class GraphNode(BaseModel):
    """A node for D3.js force-directed graph."""
    id: str
    name: str
    group: str = Field(default="default", description="Cluster / module name")
    type: str = Field(default="REPORT")
    risk: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    size: float = Field(default=10.0)
    description: str = Field(default="")


class GraphLink(BaseModel):
    """A link for D3.js force-directed graph."""
    source: str
    target: str
    type: str = Field(default="CALL_FUNCTION")
    weight: float = Field(default=1.0)


class GraphData(BaseModel):
    """D3.js-compatible graph payload."""
    nodes: list[GraphNode] = Field(default=[])
    edges: list[GraphLink] = Field(default=[])
    clusters: dict[str, list[str]] = Field(
        default={},
        description="Module -> list of object names",
    )


# ─── Agent Status ────────────────────────────────────────────────────────────

class AgentStatus(BaseModel):
    """Runtime status of a single agent."""
    name: str
    status: AgentStatusEnum = Field(default=AgentStatusEnum.IDLE)
    progress: float = Field(default=0.0, ge=0.0, le=100.0)
    message: str = Field(default="")
    duration_ms: Optional[float] = None


# ─── Final Pipeline Result ───────────────────────────────────────────────────

class AnalysisResult(BaseModel):
    """Top-level response returned by the orchestrator."""
    impact_report: ImpactReport
    test_suite: TestSuite
    graph_data: GraphData
    agent_statuses: list[AgentStatus] = Field(default=[])
    pipeline_duration_ms: float = Field(default=0.0)
    objects_parsed: int = Field(default=0, description="Total number of objects in the codebase")
