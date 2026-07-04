"""
LegacyMind - CodeArchaeologist Agent
Parses ABAP code using regex, extracts dependencies, builds the graph.
"""

from __future__ import annotations

import re
import logging
from typing import Any

from core.graph_engine import GraphEngine
from core.models import ABAPObject, GraphData

logger = logging.getLogger("legacymind.archaeologist")


class CodeArchaeologist:
    """Parses SAP ABAP code and constructs a dependency graph.

    Uses regex-based static analysis to extract:
    - CALL FUNCTION references
    - PERFORM subroutine calls
    - SELECT FROM table accesses
    - UPDATE / INSERT / DELETE table writes
    """

    # Regex patterns for ABAP constructs
    RE_CALL_FUNCTION = re.compile(
        r"CALL\s+FUNCTION\s+['\"]([^'\"]+)['\"]", re.IGNORECASE
    )
    RE_PERFORM = re.compile(
        r"PERFORM\s+(\w+)", re.IGNORECASE
    )
    RE_SELECT_FROM = re.compile(
        r"SELECT\s+.*?\s+FROM\s+(\w+)", re.IGNORECASE | re.DOTALL
    )
    RE_TABLES_DECL = re.compile(
        r"TABLES\s*:\s*([\w\s,]+)\.", re.IGNORECASE
    )
    RE_UPDATE = re.compile(
        r"UPDATE\s+(\w+)\s+SET", re.IGNORECASE
    )
    RE_INSERT = re.compile(
        r"INSERT\s+INTO\s+(\w+)", re.IGNORECASE
    )
    RE_DELETE = re.compile(
        r"DELETE\s+FROM\s+(\w+)", re.IGNORECASE
    )

    def __init__(self) -> None:
        self.graph_engine = GraphEngine()
        self.object_catalog: dict[str, dict[str, Any]] = {}
        self.raw_codebase: dict[str, dict[str, Any]] = {}
        self._parsed = False

    def parse_codebase(self, codebase: dict[str, dict] = None) -> dict[str, Any]:
        """Parse all ABAP files, extract dependencies, build the graph."""
        from pathlib import Path
        
        target_dir = Path(__file__).parent.parent / "abap_codebase"
        real_codebase = {}
        
        if target_dir.exists():
            logger.info("Real ABAP repository detected! Parsing raw .abap files...")
            for abap_file in target_dir.rglob("*.abap"):
                try:
                    with open(abap_file, "r", encoding="utf-8", errors="ignore") as f:
                        code = f.read()
                    
                    # Split by dot to remove .clas.abap, .intf.abap etc.
                    name = abap_file.name.split('.')[0].upper()
                    
                    # Distribute real files into SAP modules for demo purposes
                    import hashlib
                    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
                    mod_idx = h % 5
                    modules_list = ["HR", "SD", "MM", "FI", "XLSX"]
                    module = modules_list[mod_idx]
                        
                    real_codebase[name] = {
                        "type": "REPORT",
                        "module": module,
                        "description": f"Real ABAP file: {abap_file.name}",
                        "code": code
                    }
                except Exception as e:
                    logger.debug(f"Failed to read {abap_file}: {e}")
                    
        # Use real_codebase if we found files, otherwise fallback to mock
        active_codebase = real_codebase if real_codebase else (codebase or {})
        self.raw_codebase = active_codebase
        logger.info("Parsing %d ABAP objects...", len(active_codebase))

        # Phase 1: Parse each file
        for name, data in active_codebase.items():
            parsed = self._parse_abap_code(name, data)
            self.object_catalog[name] = {
                "name": parsed.name,
                "type": parsed.type,
                "module": parsed.module,
                "tables_used": parsed.tables_used,
                "calls": parsed.calls,
                "performs": parsed.performs,
                "description": parsed.description,
            }

        # Phase 2: Build the graph
        self.graph_engine.build_from_catalog(self.object_catalog)
        self._parsed = True

        stats = self.graph_engine.get_statistics()
        logger.info(
            "Graph built: %d nodes, %d edges, density=%.3f",
            stats["node_count"], stats["edge_count"], stats["density"],
        )

        return {
            "objects_parsed": len(self.object_catalog),
            "graph_stats": stats,
            "modules": list(self.graph_engine.get_clusters().keys()),
            "catalog": self.object_catalog,
        }

    def _parse_abap_code(self, name: str, data: dict) -> ABAPObject:
        """Extract calls, performs, and tables from ABAP source code."""
        code = data.get("code", "")
        obj_type = data.get("type", "REPORT")
        module = data.get("module", "UNKNOWN")
        description = data.get("description", "")

        RE_OO_CALL = re.compile(r"([Zz]\w+)=>\w+", re.IGNORECASE)
        RE_OO_TYPE = re.compile(r"TYPE\s+REF\s+TO\s+([Zz]\w+)", re.IGNORECASE)
        RE_OO_NEW = re.compile(r"NEW\s+([Zz]\w+)", re.IGNORECASE)

        # Extract CALL FUNCTION targets
        calls = self.RE_CALL_FUNCTION.findall(code)
        
        # Extract OO ABAP calls and references
        oo_calls = RE_OO_CALL.findall(code) + RE_OO_TYPE.findall(code) + RE_OO_NEW.findall(code)
        calls.extend([c.upper() for c in oo_calls])
        
        # Filter out self-references and standard SAP functions
        calls = [c for c in calls if c != name and c.startswith("Z")]

        # Extract PERFORM targets (only if they match known objects)
        performs_raw = self.RE_PERFORM.findall(code)
        # Keep only performs that reference other Z-objects
        performs = [p for p in performs_raw if p.startswith("Z")]

        # Extract tables from TABLES declaration
        tables: list[str] = []
        tables_matches = self.RE_TABLES_DECL.findall(code)
        for match in tables_matches:
            parts = [t.strip().rstrip(",") for t in match.split(",")]
            parts = [t.split()[0] for t in parts if t]  # Handle inline comments
            tables.extend(p for p in parts if p and not p.startswith("*"))

        # Extract tables from SELECT statements
        select_tables = self.RE_SELECT_FROM.findall(code)
        tables.extend(t.upper() for t in select_tables if t.upper() not in ("INTO", "TABLE", "CORRESPONDING"))

        # Extract tables from UPDATE/INSERT/DELETE
        for pattern in (self.RE_UPDATE, self.RE_INSERT, self.RE_DELETE):
            write_tables = pattern.findall(code)
            tables.extend(t.upper() for t in write_tables if not t.upper().startswith("LS_"))

        # Deduplicate and clean
        tables = list(dict.fromkeys(
            t for t in tables
            if len(t) >= 2
            and t not in ("TYPE", "TABLE", "OF", "INTO", "FROM", "VALUES", "SET")
            and not t.startswith("LT_")
            and not t.startswith("LS_")
            and not t.startswith("LV_")
        ))
        calls = list(dict.fromkeys(calls))
        performs = list(dict.fromkeys(performs))

        logger.debug(
            "Parsed %s: calls=%s, performs=%s, tables=%s",
            name, calls, performs, tables,
        )

        return ABAPObject(
            name=name,
            type=obj_type,
            module=module,
            tables_used=tables,
            calls=calls,
            performs=performs,
            description=description,
        )

    def get_blast_radius(self, object_name: str) -> dict[str, Any]:
        """Get the blast radius for an object.

        Returns:
            Dict with upstream, downstream, and total affected objects.
        """
        if not self._parsed:
            raise RuntimeError("Codebase not parsed yet. Call parse_codebase() first.")

        downstream = self.graph_engine.get_blast_radius(object_name, direction="downstream")
        upstream = self.graph_engine.get_blast_radius(object_name, direction="upstream")
        total = downstream | upstream

        return {
            "object": object_name,
            "downstream": sorted(downstream),
            "upstream": sorted(upstream),
            "total_affected": sorted(total),
            "blast_radius_count": len(total),
        }

    def get_graph_data(self, affected_nodes: set[str] | None = None, risk_map: dict[str, str] | None = None) -> GraphData:
        """Export the dependency graph for frontend visualization."""
        if not self._parsed:
            raise RuntimeError("Codebase not parsed yet. Call parse_codebase() first.")
        return self.graph_engine.to_d3_json(affected_nodes=affected_nodes, risk_map=risk_map)

    def get_object_details(self, name: str) -> dict[str, Any] | None:
        """Get parsed details for a specific object."""
        return self.object_catalog.get(name)

    def get_all_tables(self) -> dict[str, list[str]]:
        """Return a map of table -> list of objects that use it."""
        table_map: dict[str, list[str]] = {}
        for obj_name, attrs in self.object_catalog.items():
            for table in attrs.get("tables_used", []):
                table_map.setdefault(table, []).append(obj_name)
        return table_map
