"""
LegacyMind - ImpactAnalyzer Agent
Maps change requests to affected objects, scores risk using advanced graph
analytics including PageRank centrality, Cyclomatic Complexity proxies,
and Inverse Square Law hop-distance from critical data tables.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any

from core.ai_client import AIClient
from core.graph_engine import GraphEngine
from core.models import (
    ABAPObject, AffectedObject, ImpactReport, RiskLevel, RiskScore,
)

logger = logging.getLogger("legacymind.impact_analyzer")


class ImpactAnalyzer:
    """Analyzes the impact of a change request on the SAP codebase.

    Risk scoring uses a multi-dimensional formula combining:
        1. PageRank Centrality   – network-wide influence score
        2. Cyclomatic Complexity – branching count from raw ABAP source
        3. Inverse Square Law   – proximity to Tier-1 critical tables
        4. Blast Radius         – transitively reachable object count
        5. Cross-Module Flag    – architectural boundary violations
    """

    # ── Table classification ──────────────────────────────────────────────

    CRITICAL_TABLES: dict[str, str] = {
        "PA0001": "Employee Org Assignment",
        "PA0002": "Personal Data",
        "PA0008": "Basic Pay / Compensation",
        "VBAK": "Sales Order Header",
        "VBAP": "Sales Order Items",
        "EKKO": "Purchase Order Header",
        "BSEG": "Accounting Line Items",
        "KNA1": "Customer Master",
        "MARA": "Material Master",
    }

    HIGH_RISK_TABLES: dict[str, str] = {
        "PA0041": "Date Specifications",
        "PA0167": "Health Plans",
        "PA0169": "Savings Plans",
        "VBRK": "Billing Header",
        "VBRP": "Billing Items",
        "LIKP": "Delivery Header",
        "LIPS": "Delivery Items",
        "EKPO": "PO Items",
        "KNB1": "Customer Credit",
        "RSEG": "Invoice Items",
        "MKPF": "Material Document Header",
        "MSEG": "Material Document Items",
        "MARD": "Storage Location Stock",
    }

    MODULE_KEYWORDS: dict[str, list[str]] = {
        "HR": ["HR", "EMPLOYEE", "PAYROLL", "SALARY", "PERSONNEL", "BENEFITS",
               "ABSENCE", "TIME", "ORG STRUCTURE", "COMPENSATION", "PA00",
               "GDPR", "DATA ERASURE", "PERSONAL DATA", "PRIVACY"],
        "SD": ["SD", "SALES", "ORDER", "BILLING", "DELIVERY", "PRICING",
               "CREDIT", "INVOICE", "CUSTOMER", "REVENUE", "S/4HANA",
               "VBA", "VBRK"],
        "MM": ["MM", "PURCHASE", "PROCUREMENT", "INVENTORY", "GOODS RECEIPT",
               "MATERIAL", "STOCK", "WAREHOUSE", "VENDOR", "SUPPLIER",
               "EKK", "MARA"],
    }

    # ── Scoring weights ───────────────────────────────────────────────────

    WEIGHT_PAGERANK     = 2.5   # Multiplier for PageRank contribution
    WEIGHT_COMPLEXITY   = 1.8   # Multiplier for cyclomatic complexity
    WEIGHT_BLAST        = 0.12  # Per-object blast radius contribution
    WEIGHT_TABLE_TIER1  = 3.0   # Score added per Tier-1 critical table
    WEIGHT_TABLE_TIER2  = 1.5   # Score added per Tier-2 high-risk table
    MAX_RAW_SCORE       = 10.0  # Cap before normalisation

    # ── Business-value constants ──────────────────────────────────────────

    # Average analyst time (weeks) saved per affected object
    ANALYST_WEEKS_PER_OBJECT = 0.5
    # Average consulting day rate (GBP)
    CONSULTANT_DAY_RATE_GBP = 1_200
    DAYS_PER_WEEK = 5

    def __init__(self, ai_client: AIClient, graph_engine: GraphEngine) -> None:
        self.ai_client = ai_client
        self.graph_engine = graph_engine

    # ── Public API ────────────────────────────────────────────────────────

    async def analyze_impact(
        self,
        change_request: str,
        object_catalog: dict[str, dict],
        raw_codebase: dict[str, dict] | None = None,
    ) -> ImpactReport:
        """Run the full impact analysis pipeline.

        Steps:
            1. Extract target objects / tables from the change request.
            2. Walk the dependency graph (BFS blast radius).
            3. Score each affected object with the multi-dimensional formula.
            4. Compute ROI / time-saved business metrics.
        """
        raw_codebase = raw_codebase or {}
        logger.info("Analyzing impact for: %s", change_request[:80])

        # Precompute graph-wide analytics once
        pagerank    = self.graph_engine.get_pagerank()
        betweenness = self._get_betweenness()

        # Step 1: Identify directly affected objects
        target_objects, target_tables, target_modules = await self._extract_targets(
            change_request, object_catalog
        )
        logger.info(
            "Targets: objects=%s, tables=%s, modules=%s",
            target_objects, target_tables, target_modules,
        )

        # Step 2: Expand via blast radius walk
        all_affected_names: set[str] = set(target_objects)

        for obj_name in list(target_objects):
            blast = self.graph_engine.get_blast_radius(obj_name, direction="both")
            all_affected_names.update(blast)

        for table in target_tables:
            for obj_name, attrs in object_catalog.items():
                if table in attrs.get("tables_used", []):
                    all_affected_names.add(obj_name)
                    blast = self.graph_engine.get_blast_radius(obj_name, direction="downstream")
                    all_affected_names.update(blast)

        if not all_affected_names and target_modules:
            for obj_name, attrs in object_catalog.items():
                if attrs.get("module") in target_modules:
                    all_affected_names.add(obj_name)

        # Step 3: Score each affected object
        affected_objects: list[AffectedObject] = []

        for obj_name in sorted(all_affected_names):
            if obj_name not in object_catalog:
                continue

            attrs = object_catalog[obj_name]
            blast_set   = self.graph_engine.get_blast_radius(obj_name, direction="both")
            blast_count = len(blast_set)

            # Shortest dependency path from any direct target
            path: list[str] = []
            for target in target_objects:
                p = self.graph_engine.get_shortest_path(target, obj_name)
                if p and (not path or len(p) < len(path)):
                    path = p
            if not path:
                path = [obj_name]

            hop_distance = len(path) - 1   # 0 = direct target

            risk = self._score_risk_advanced(
                obj_name=obj_name,
                attrs=attrs,
                blast_count=blast_count,
                pagerank_score=pagerank.get(obj_name, 0.0),
                betweenness_score=betweenness.get(obj_name, 0.0),
                hop_distance=hop_distance,
                is_direct_target=(obj_name in target_objects),
                catalog=object_catalog,
                raw_code=raw_codebase.get(obj_name, {}).get("code", ""),
            )

            abap_obj = ABAPObject(
                name=obj_name,
                type=attrs.get("type", "REPORT"),
                module=attrs.get("module", "UNKNOWN"),
                tables_used=attrs.get("tables_used", []),
                calls=attrs.get("calls", []),
                performs=attrs.get("performs", []),
                description=attrs.get("description", ""),
            )

            affected_objects.append(AffectedObject(
                object=abap_obj,
                risk=risk,
                blast_radius=blast_count,
                path=path,
            ))

        # Sort by risk severity, then descending blast radius
        risk_order = {RiskLevel.CRITICAL: 0, RiskLevel.HIGH: 1, RiskLevel.MEDIUM: 2, RiskLevel.LOW: 3}
        affected_objects.sort(
            key=lambda a: (risk_order.get(a.risk.level, 99), -a.blast_radius)
        )

        # Step 4: Business-impact metrics
        risk_summary: dict[str, int] = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for ao in affected_objects:
            risk_summary[ao.risk.level.value] += 1

        total = len(affected_objects)
        time_saved = self._compute_time_saved(affected_objects)
        cost_saved = time_saved * self.DAYS_PER_WEEK * self.CONSULTANT_DAY_RATE_GBP

        report = ImpactReport(
            change_request=change_request,
            affected_objects=affected_objects,
            risk_summary=risk_summary,
            total_affected=total,
            time_saved_weeks=round(time_saved, 1),
            cost_saved_estimate=round(cost_saved, 0),
        )

        logger.info(
            "Impact analysis complete: %d affected, risk=%s, time_saved=%.1f weeks, cost_saved=£%.0f",
            total, risk_summary, time_saved, cost_saved,
        )
        return report

    # ── Advanced Scoring ──────────────────────────────────────────────────

    def _score_risk_advanced(
        self,
        obj_name: str,
        attrs: dict,
        blast_count: int,
        pagerank_score: float,
        betweenness_score: float,
        hop_distance: int,
        is_direct_target: bool,
        catalog: dict[str, dict],
        raw_code: str,
    ) -> RiskScore:
        """Multi-dimensional risk scoring formula.

        Raw Score = ΣW_i × F_i  (capped at MAX_RAW_SCORE)

        Components:
            F_table   = Σ(tier1_weight) + Σ(tier2_weight/2)   [table exposure]
            F_pr      = PageRank × WEIGHT_PAGERANK              [network centrality]
            F_cc      = log₂(1 + cyclomatic_complexity) × WEIGHT_COMPLEXITY
            F_blast   = min(blast_count × WEIGHT_BLAST, 2.5)   [blast radius]
            F_hop     = direct_target ? 1.5 : 1/(hop_distance²) × 1.5  [proximity]
            F_cross   = 0.8 if cross-module dependency else 0   [arch boundary]

        Score is then normalised to [0, 10] and mapped to a risk level.
        """
        tables = attrs.get("tables_used", [])
        module = attrs.get("module", "")

        # F_table: table exposure score (Tier 1 & 2)
        critical_tables = [t for t in tables if t in self.CRITICAL_TABLES]
        high_tables     = [t for t in tables if t in self.HIGH_RISK_TABLES]
        f_table = (
            len(critical_tables) * self.WEIGHT_TABLE_TIER1
            + len(high_tables)   * (self.WEIGHT_TABLE_TIER2 / 2)
        )

        # F_pr: PageRank centrality contribution
        # PageRank is in [0, 1]; multiply to put in 0–2.5 range
        f_pr = min(pagerank_score * 200, 1.0) * self.WEIGHT_PAGERANK

        # F_cc: Cyclomatic Complexity proxy from raw ABAP source
        cc = self._cyclomatic_complexity(raw_code) if raw_code else 1
        f_cc = math.log2(1 + cc) * self.WEIGHT_COMPLEXITY

        # F_blast: blast radius contribution (capped)
        f_blast = min(blast_count * self.WEIGHT_BLAST, 2.5)

        # F_hop: inverse square law proximity to change epicenter
        if is_direct_target:
            f_hop = 1.5
        elif hop_distance == 0:
            f_hop = 1.5
        elif hop_distance == 1:
            f_hop = 1.5 / (1 ** 2)
        else:
            f_hop = 1.5 / (hop_distance ** 2)

        # F_cross: cross-module penalty
        is_cross_module = any(
            catalog.get(c, {}).get("module") != module
            for c in attrs.get("calls", [])
            if c in catalog
        )
        f_cross = 0.8 if is_cross_module else 0.0

        # F_betweenness: betweenness centrality (structural bridge)
        f_between = min(betweenness_score * 10, 0.5)

        raw_score = f_table + f_pr + f_cc + f_blast + f_hop + f_cross + f_between
        score = round(min(raw_score, self.MAX_RAW_SCORE), 2)

        # Build reasoning string with formula breakdown
        formula_parts = []
        if critical_tables:
            formula_parts.append(f"Tier-1 tables [{', '.join(critical_tables)}] +{f_table:.1f}")
        if high_tables:
            formula_parts.append(f"Tier-2 tables [{', '.join(high_tables[:2])}] +{len(high_tables)*self.WEIGHT_TABLE_TIER2/2:.1f}")
        formula_parts.append(f"PageRank={pagerank_score:.4f} → +{f_pr:.2f}")
        formula_parts.append(f"CC={cc} → +{f_cc:.2f}")
        formula_parts.append(f"BlastRadius={blast_count} → +{f_blast:.2f}")
        formula_parts.append(f"Hop={hop_distance} → +{f_hop:.2f}")
        if is_cross_module:
            formula_parts.append(f"CrossModule +{f_cross:.1f}")
        reasoning = f"Score={score}/10 | " + " | ".join(formula_parts) + f" | Blast radius covers {blast_count} objects."

        # Map score to risk level
        if score >= 7.5 or (is_direct_target and f_table > 0):
            return RiskScore(level=RiskLevel.CRITICAL, score=score, reasoning=reasoning)
        elif score >= 5.5 or is_direct_target:
            return RiskScore(level=RiskLevel.HIGH, score=score, reasoning=reasoning)
        elif score >= 3.0:
            return RiskScore(level=RiskLevel.MEDIUM, score=score, reasoning=reasoning)
        else:
            return RiskScore(level=RiskLevel.LOW, score=score, reasoning=reasoning)

    @staticmethod
    def _cyclomatic_complexity(abap_code: str) -> int:
        """Estimate Cyclomatic Complexity from ABAP source code.

        McCabe's formula: CC = E - N + 2P ≈ (decision points) + 1

        We count ABAP branching constructs as decision points:
            IF, ELSEIF, CASE, WHEN, LOOP, WHILE, DO, CHECK, CATCH
        """
        if not abap_code:
            return 1

        branch_pattern = re.compile(
            r"^\s*(IF|ELSEIF|CASE\s+\w|WHEN\s+(?!OTHERS|OTHER)|LOOP\s+AT|WHILE|DO\b|CHECK\b|CATCH\b)",
            re.IGNORECASE | re.MULTILINE,
        )
        decision_points = len(branch_pattern.findall(abap_code))
        return max(1, decision_points + 1)  # CC = decisions + 1

    def _get_betweenness(self) -> dict[str, float]:
        """Compute betweenness centrality (structural bridges in the graph).

        Betweenness centrality B(v) = fraction of shortest paths passing through v.
        High-betweenness nodes are critical integration points — removing or
        changing them can disconnect entire areas of the architecture.
        """
        import networkx as nx
        g = self.graph_engine.graph
        if len(g) == 0:
            return {}
        try:
            return nx.betweenness_centrality(g, weight="weight", normalized=True)
        except Exception:
            return {n: 0.0 for n in g.nodes}

    def _compute_time_saved(self, affected_objects: list[AffectedObject]) -> float:
        """Estimate analyst weeks saved using a risk-weighted model.

        High-risk objects require more analysis time; the formula reflects this:
            t = Σ (base_weeks × risk_multiplier_i)

        Risk multipliers: CRITICAL=3.0, HIGH=2.0, MEDIUM=1.0, LOW=0.5
        """
        multipliers = {
            RiskLevel.CRITICAL: 3.0,
            RiskLevel.HIGH:     2.0,
            RiskLevel.MEDIUM:   1.0,
            RiskLevel.LOW:      0.5,
        }
        total = sum(
            self.ANALYST_WEEKS_PER_OBJECT * multipliers.get(ao.risk.level, 1.0)
            for ao in affected_objects
        )
        return max(0.5, round(total, 1))

    # ── Target Extraction ─────────────────────────────────────────────────

    async def _extract_targets(
        self, change_request: str, catalog: dict[str, dict]
    ) -> tuple[list[str], list[str], list[str]]:
        """Extract target objects, tables, and modules from the change request.

        Uses Gemini AI when available, falls back to deterministic regex matching.
        """
        upper = change_request.upper()

        # Module detection via keyword scan
        modules: list[str] = []
        for mod, keywords in self.MODULE_KEYWORDS.items():
            if any(kw in upper for kw in keywords):
                modules.append(mod)

        # Try AI extraction
        try:
            ai_prompt = (
                f"Given this SAP change request, extract the specific SAP object names "
                f"(starting with Z) and table names that would be affected.\n\n"
                f"Available objects: {', '.join(list(catalog.keys())[:80])}\n\n"
                f"Change request: {change_request}\n\n"
                f"Respond with ONLY a comma-separated list of object names and table names. "
                f"Example: ZHR_EMPLOYEE_MASTER, PA0001, PA0002"
            )
            response = await self.ai_client.generate(ai_prompt)
            if response and self.ai_client.provider_used != "regex_fallback":
                tokens  = [t.strip().upper() for t in response.replace("\n", ",").split(",")]
                objects = [t for t in tokens if t in catalog]
                tables  = [t for t in tokens if t not in catalog and len(t) >= 2 and re.match(r"^[A-Z0-9_]+$", t)]
                if objects or tables:
                    return objects, tables, modules
        except Exception as exc:
            logger.warning("AI extraction failed, using regex: %s", exc)

        # Regex / keyword fallback
        objects: list[str] = [name for name in catalog if name in upper]

        if not objects and modules:
            objects = [
                name for name, attrs in catalog.items()
                if attrs.get("module") in modules
            ]

        all_tables: set[str] = set()
        for attrs in catalog.values():
            all_tables.update(attrs.get("tables_used", []))
        tables = [t for t in all_tables if t in upper]

        return objects, tables, modules
