"""
LegacyMind - Orchestrator Agent
Coordinates the full analysis pipeline: parse → analyze → test.
"""

from __future__ import annotations

import logging
import time
import asyncio
from typing import Any, Callable, Optional

from core.ai_client import AIClient
from core.models import (
    AgentStatus, AgentStatusEnum, AnalysisRequest, AnalysisResult,
)
from agents.code_archaeologist import CodeArchaeologist
from agents.impact_analyzer import ImpactAnalyzer
from agents.test_generator import TestGenerator

logger = logging.getLogger("legacymind.orchestrator")


class Orchestrator:
    """Master coordinator for the LegacyMind agent pipeline.

    Runs three agents in sequence:
    1. CodeArchaeologist — Parse codebase, build dependency graph
    2. ImpactAnalyzer — Analyze change request, score risks
    3. TestGenerator — Generate test suite for affected objects
    """

    def __init__(self) -> None:
        self.ai_client = AIClient()
        self.archaeologist = CodeArchaeologist()
        self.analyzer: Optional[ImpactAnalyzer] = None
        self.test_gen = TestGenerator(self.ai_client)
        self.agent_statuses: dict[str, AgentStatus] = {
            "CodeArchaeologist": AgentStatus(name="CodeArchaeologist"),
            "ImpactAnalyzer": AgentStatus(name="ImpactAnalyzer"),
            "TestGenerator": AgentStatus(name="TestGenerator"),
        }
        self._codebase_parsed = False
        self._logs: list[dict[str, Any]] = []

    def _log(self, agent: str, message: str) -> None:
        """Add an entry to the activity log."""
        entry = {
            "timestamp": time.time(),
            "agent": agent,
            "message": message,
        }
        self._logs.append(entry)
        logger.info("[%s] %s", agent, message)

    def _update_status(
        self,
        agent_name: str,
        status: AgentStatusEnum,
        progress: float,
        message: str,
        duration_ms: Optional[float] = None,
    ) -> None:
        self.agent_statuses[agent_name] = AgentStatus(
            name=agent_name,
            status=status,
            progress=progress,
            message=message,
            duration_ms=duration_ms,
        )

    async def run_pipeline(
        self,
        request: AnalysisRequest,
        status_callback: Optional[Callable] = None,
    ) -> AnalysisResult:
        """Execute the full analysis pipeline.

        Args:
            request: The change request to analyze.
            status_callback: Optional async callback for real-time status updates.

        Returns:
            Complete AnalysisResult with impact report, test suite, and graph data.
        """
        pipeline_start = time.time()
        self._logs = []

        self._log("Orchestrator", f"Pipeline started for: {request.change_request[:80]}...")
        self._log("Orchestrator", f"AI Provider: {self.ai_client.provider_used or 'heuristic_engine_v2'}")

        # ── Phase 1: CodeArchaeologist ─────────────────────────────────────
        self._update_status("CodeArchaeologist", AgentStatusEnum.RUNNING, 0, "Starting ABAP code parsing...")
        self._log("CodeArchaeologist", "Initializing ABAP parser...")
        t0 = time.time()

        try:
            if not self._codebase_parsed:
                from agents.repo_fetcher import RepoFetcher
                try:
                    RepoFetcher.fetch_codebase()
                except Exception as e:
                    self._log("Orchestrator", f"Failed to fetch repo: {e}")
                    
                self._log("CodeArchaeologist", "Parsing real ABAP repository...")
                self._update_status("CodeArchaeologist", AgentStatusEnum.RUNNING, 20, "Extracting CALL FUNCTION references from real files...")

                parse_result = self.archaeologist.parse_codebase()

                self._log("CodeArchaeologist", f"Extracted dependencies from {parse_result['objects_parsed']} objects")
                self._update_status("CodeArchaeologist", AgentStatusEnum.RUNNING, 60, "Building dependency graph...")
                self._log("CodeArchaeologist", f"Graph: {parse_result['graph_stats']['node_count']} nodes, {parse_result['graph_stats']['edge_count']} edges")
                self._log("CodeArchaeologist", f"Modules found: {', '.join(parse_result['modules'])}")

                self._codebase_parsed = True
            else:
                self._log("CodeArchaeologist", "Using cached codebase parse results")
                await asyncio.sleep(0.5)
                parse_result = {
                    "objects_parsed": len(self.archaeologist.object_catalog),
                    "catalog": self.archaeologist.object_catalog,
                }

            t1 = time.time()
            self._update_status(
                "CodeArchaeologist", AgentStatusEnum.COMPLETE, 100,
                f"Parsed {parse_result['objects_parsed']} objects",
                duration_ms=round((t1 - t0) * 1000, 1),
            )
            self._log("CodeArchaeologist", f"Phase complete in {(t1-t0)*1000:.0f}ms")
        except Exception as exc:
            self._update_status("CodeArchaeologist", AgentStatusEnum.ERROR, 0, str(exc))
            self._log("CodeArchaeologist", f"ERROR: {exc}")
            raise

        # ── Phase 2: ImpactAnalyzer ───────────────────────────────────────
        self._update_status("ImpactAnalyzer", AgentStatusEnum.RUNNING, 0, "Interpreting change request...")
        self._log("ImpactAnalyzer", f"Analyzing: '{request.change_request[:60]}...'")
        t0 = time.time()

        try:
            # Create analyzer with the archaeologist's graph
            self.analyzer = ImpactAnalyzer(self.ai_client, self.archaeologist.graph_engine)

            self._update_status("ImpactAnalyzer", AgentStatusEnum.RUNNING, 30, "Extracting target objects and tables...")
            self._log("ImpactAnalyzer", "Extracting target objects using AI + regex...")
            await asyncio.sleep(1.5)

            impact_report = await self.analyzer.analyze_impact(
                request.change_request,
                self.archaeologist.object_catalog,
                self.archaeologist.raw_codebase,
            )

            self._update_status("ImpactAnalyzer", AgentStatusEnum.RUNNING, 70, f"Scoring risks for {impact_report.total_affected} objects...")
            self._log("ImpactAnalyzer", f"Found {impact_report.total_affected} affected objects")
            self._log("ImpactAnalyzer", f"Risk breakdown: {impact_report.risk_summary}")
            self._log("ImpactAnalyzer", f"Estimated time saved: {impact_report.time_saved_weeks} weeks")

            t1 = time.time()
            self._update_status(
                "ImpactAnalyzer", AgentStatusEnum.COMPLETE, 100,
                f"{impact_report.total_affected} objects affected, "
                f"{impact_report.risk_summary.get('CRITICAL', 0)} critical risks",
                duration_ms=round((t1 - t0) * 1000, 1),
            )
            self._log("ImpactAnalyzer", f"Phase complete in {(t1-t0)*1000:.0f}ms")
        except Exception as exc:
            self._update_status("ImpactAnalyzer", AgentStatusEnum.ERROR, 0, str(exc))
            self._log("ImpactAnalyzer", f"ERROR: {exc}")
            raise

        # ── Phase 3: TestGenerator ────────────────────────────────────────
        self._update_status("TestGenerator", AgentStatusEnum.RUNNING, 0, "Generating test suite...")
        self._log("TestGenerator", "Starting test generation...")
        t0 = time.time()

        try:
            self._update_status("TestGenerator", AgentStatusEnum.RUNNING, 20, "Generating unit tests for affected objects...")
            self._log("TestGenerator", "Generating unit tests for affected objects...")
            await asyncio.sleep(2.0)

            test_suite = await self.test_gen.generate_tests(
                impact_report,
                self.archaeologist.object_catalog,
            )

            self._update_status("TestGenerator", AgentStatusEnum.RUNNING, 70, "Compiling test suite...")
            await asyncio.sleep(1.0)
            self._log("TestGenerator", f"Generated {len(test_suite.test_cases)} test cases")
            self._log("TestGenerator", f"Coverage: {test_suite.coverage_percent}%")

            t1 = time.time()
            self._update_status(
                "TestGenerator", AgentStatusEnum.COMPLETE, 100,
                f"{len(test_suite.test_cases)} tests, {test_suite.coverage_percent}% coverage",
                duration_ms=round((t1 - t0) * 1000, 1),
            )
            self._log("TestGenerator", f"Phase complete in {(t1-t0)*1000:.0f}ms")
        except Exception as exc:
            self._update_status("TestGenerator", AgentStatusEnum.ERROR, 0, str(exc))
            self._log("TestGenerator", f"ERROR: {exc}")
            raise

        # ── Build final result ────────────────────────────────────────────
        affected_names = {ao.object.name for ao in impact_report.affected_objects}
        risk_map = {ao.object.name: ao.risk.level.value for ao in impact_report.affected_objects}
        graph_data = self.archaeologist.get_graph_data(affected_nodes=affected_names, risk_map=risk_map)

        pipeline_end = time.time()
        pipeline_ms = round((pipeline_end - pipeline_start) * 1000, 1)

        self._log("Orchestrator", f"Pipeline complete in {pipeline_ms}ms")
        self._log("Orchestrator", f"AI provider used: {self.ai_client.provider_used}")

        return AnalysisResult(
            impact_report=impact_report,
            test_suite=test_suite,
            graph_data=graph_data,
            agent_statuses=list(self.agent_statuses.values()),
            pipeline_duration_ms=pipeline_ms,
            objects_parsed=len(self.archaeologist.object_catalog),
        )

    def get_logs(self) -> list[dict[str, Any]]:
        """Return the activity log entries."""
        return self._logs

    def get_codebase_info(self) -> dict[str, Any]:
        """Return metadata about the parsed codebase."""
        if not self._codebase_parsed:
            from agents.repo_fetcher import RepoFetcher
            try:
                RepoFetcher.fetch_codebase()
            except Exception as e:
                self._log("Orchestrator", f"Failed to fetch repo: {e}")
                
            # Parse if not already done
            self.archaeologist.parse_codebase()
            self._codebase_parsed = True

        catalog = self.archaeologist.object_catalog
        modules: dict[str, list[dict]] = {}

        for name, attrs in catalog.items():
            mod = attrs.get("module", "UNKNOWN")
            modules.setdefault(mod, []).append({
                "name": name,
                "type": attrs.get("type"),
                "description": attrs.get("description"),
                "tables": attrs.get("tables_used", []),
                "calls": attrs.get("calls", []),
            })

        table_map = self.archaeologist.get_all_tables()

        return {
            "total_objects": len(catalog),
            "modules": modules,
            "total_tables": len(table_map),
            "table_usage": {t: len(objs) for t, objs in table_map.items()},
            "graph_stats": self.archaeologist.graph_engine.get_statistics(),
        }
