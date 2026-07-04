"""
LegacyMind - NetworkX Graph Engine
Builds, queries, and exports the dependency graph for SAP ABAP objects.
"""

from __future__ import annotations

import math
import random
from typing import Any, Optional

import networkx as nx

from .models import GraphData, GraphLink, GraphNode


class GraphEngine:
    """Directed graph for SAP ABAP object dependencies.

    Nodes represent ABAP objects (reports, function modules, etc.).
    Edges represent dependency relationships (CALL FUNCTION, PERFORM, TABLE_ACCESS).
    """

    MODULE_COLORS = {
        "HR": "#3b82f6",
        "SD": "#22c55e",
        "MM": "#f97316",
        "FI": "#a855f7",
        "DEFAULT": "#6b7280",
    }

    def __init__(self) -> None:
        self.graph = nx.DiGraph()

    # ── Building ──────────────────────────────────────────────────────────

    def add_object(self, name: str, **attrs: Any) -> None:
        """Add an ABAP object as a node."""
        self.graph.add_node(name, **attrs)

    def add_dependency(
        self, source: str, target: str, edge_type: str = "CALL_FUNCTION", weight: float = 1.0
    ) -> None:
        """Add a directed dependency edge."""
        if source in self.graph and target in self.graph:
            self.graph.add_edge(source, target, edge_type=edge_type, weight=weight)

    def build_from_catalog(self, catalog: dict[str, dict]) -> None:
        """Construct the full graph from a parsed object catalog.

        Args:
            catalog: Dict of object_name -> {type, module, tables_used, calls, performs, description}
        """
        # Add nodes
        for name, attrs in catalog.items():
            self.add_object(
                name,
                type=attrs.get("type", "REPORT"),
                module=attrs.get("module", "UNKNOWN"),
                tables_used=attrs.get("tables_used", []),
                description=attrs.get("description", ""),
            )

        # Add edges from calls and performs
        for name, attrs in catalog.items():
            for called in attrs.get("calls", []):
                if called in catalog:
                    source_mod = attrs.get("module", "")
                    target_mod = catalog[called].get("module", "")
                    edge_type = "CROSS_MODULE" if source_mod != target_mod else "CALL_FUNCTION"
                    weight = 2.0 if edge_type == "CROSS_MODULE" else 1.0
                    self.add_dependency(name, called, edge_type=edge_type, weight=weight)

            for performed in attrs.get("performs", []):
                if performed in catalog:
                    self.add_dependency(name, performed, edge_type="PERFORM", weight=0.8)

    # ── Queries ───────────────────────────────────────────────────────────

    def get_blast_radius(self, node: str, direction: str = "both") -> set[str]:
        """Get all objects transitively reachable from *node*.

        Args:
            node: Starting object name.
            direction: 'downstream' (successors), 'upstream' (predecessors), or 'both'.

        Returns:
            Set of affected object names (excludes *node* itself).
        """
        if node not in self.graph:
            return set()

        affected: set[str] = set()

        if direction in ("downstream", "both"):
            affected.update(nx.descendants(self.graph, node))

        if direction in ("upstream", "both"):
            affected.update(nx.ancestors(self.graph, node))

        affected.discard(node)
        return affected

    def get_pagerank(self) -> dict[str, float]:
        """Compute PageRank centrality scores for all nodes."""
        if len(self.graph) == 0:
            return {}
        try:
            return nx.pagerank(self.graph, weight="weight")
        except nx.PowerIterationFailedConvergence:
            return {n: 1.0 / len(self.graph) for n in self.graph.nodes}

    def get_clusters(self) -> dict[str, list[str]]:
        """Group nodes by their SAP module."""
        clusters: dict[str, list[str]] = {}
        for node, data in self.graph.nodes(data=True):
            module = data.get("module", "UNKNOWN")
            clusters.setdefault(module, []).append(node)
        return clusters

    def get_critical_paths(self, source: str, target: str) -> list[list[str]]:
        """Find all simple paths between two nodes (limited to 20)."""
        if source not in self.graph or target not in self.graph:
            return []
        try:
            paths = list(nx.all_simple_paths(self.graph, source, target, cutoff=6))
            return paths[:20]
        except nx.NetworkXError:
            return []

    def get_shortest_path(self, source: str, target: str) -> list[str]:
        """Find the shortest path between two nodes."""
        try:
            return nx.shortest_path(self.graph, source, target)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    def get_degree_centrality(self) -> dict[str, float]:
        """Compute degree centrality for each node."""
        return nx.degree_centrality(self.graph)

    def get_statistics(self) -> dict[str, Any]:
        """Return summary statistics about the graph."""
        n = self.graph.number_of_nodes()
        e = self.graph.number_of_edges()
        return {
            "node_count": n,
            "edge_count": e,
            "density": nx.density(self.graph) if n > 1 else 0,
            "avg_in_degree": sum(d for _, d in self.graph.in_degree()) / max(n, 1),
            "avg_out_degree": sum(d for _, d in self.graph.out_degree()) / max(n, 1),
            "is_dag": nx.is_directed_acyclic_graph(self.graph),
            "connected_components": nx.number_weakly_connected_components(self.graph),
        }

    # ── Export ────────────────────────────────────────────────────────────

    def to_d3_json(self, affected_nodes: Optional[set[str]] = None, risk_map: Optional[dict[str, str]] = None) -> GraphData:
        """Export graph as D3.js-compatible JSON.

        Args:
            affected_nodes: Optional set of nodes to mark as affected.
            risk_map: Optional dict of node_name -> risk_level string.
        """
        pagerank = self.get_pagerank()
        clusters = self.get_clusters()
        affected = affected_nodes or set()
        risk_map = risk_map or {}

        # Layout: arrange nodes in module clusters
        nodes: list[GraphNode] = []
        module_positions = {}
        angle_step = (2 * math.pi) / max(len(clusters), 1)

        for i, (module, members) in enumerate(clusters.items()):
            cx = 400 + 250 * math.cos(i * angle_step)
            cy = 300 + 250 * math.sin(i * angle_step)
            module_positions[module] = (cx, cy)

            for j, name in enumerate(members):
                offset_angle = (2 * math.pi * j) / max(len(members), 1)
                x = cx + 80 * math.cos(offset_angle) + random.uniform(-10, 10)
                y = cy + 80 * math.sin(offset_angle) + random.uniform(-10, 10)
                pr = pagerank.get(name, 0)
                node_data = self.graph.nodes[name]

                nodes.append(GraphNode(
                    id=name,
                    name=name,
                    group=node_data.get("module", "UNKNOWN"),
                    type=node_data.get("type", "REPORT"),
                    risk=risk_map.get(name) if name in affected else None,
                    x=round(x, 1),
                    y=round(y, 1),
                    size=max(8, min(30, pr * 500)),
                    description=node_data.get("description", ""),
                ))

        edges: list[GraphLink] = []
        for src, tgt, data in self.graph.edges(data=True):
            edges.append(GraphLink(
                source=src,
                target=tgt,
                type=data.get("edge_type", "CALL_FUNCTION"),
                weight=data.get("weight", 1.0),
            ))

        return GraphData(nodes=nodes, edges=edges, clusters={k: v for k, v in clusters.items()})
