# LegacyMind AI — Enterprise SAP Modernisation Intelligence

<div align="center">



**AI Agent Swarm that autonomously maps the blast radius of SAP changes,
quantifies risk using graph-theory mathematics, and auto-generates a test suite — in seconds.**

</div>

---

## What is LegacyMind AI?

LegacyMind is an **autonomous AI orchestrator** for enterprise SAP modernisation that:

1. **Parses real ABAP codebases** — ingests 85+ live objects from open-source SAP repositories via `abap2xlsx`
2. **Maps blast radius** — uses BFS graph traversal to find every transitively affected object
3. **Scores risk mathematically** — multi-dimensional formula: PageRank + Cyclomatic Complexity + Inverse Square Law + Betweenness Centrality
4. **Generates an ABAP test suite** — automatically produces unit and integration tests for every affected object
5. **Visualises the architecture** — live force-directed canvas graph with 85 nodes and 140+ dependency edges

---

## Table of Contents

1. [Features & Implementation](#features--implementation)
2. [How It Works](#how-it-works-pipeline-flow)
3. [Mathematical Risk Engine](#mathematical-risk-engine)
4. [Agent Architecture](#agent-architecture)
5. [Graph Analytics](#graph-analytics)
6. [Tech Stack](#tech-stack)
7. [Quick Start](#quick-start)
8. [API Reference](#api-reference)

---

## Features & Implementation

| Feature | How It Works | File |
|---------|-------------|------|
| **Real ABAP Parsing** | Clones `abap2xlsx` repo, walks `.abap` files, extracts all calls, performs, table accesses with regex | `agents/code_archaeologist.py` |
| **AI + Regex Target Extraction** | Gemini AI extracts object/table names from NL change request; regex fallback | `agents/impact_analyzer.py` |
| **PageRank Centrality** | NetworkX `pagerank(weight="weight")` on directed graph — high PR nodes are architecture hubs | `core/graph_engine.py` |
| **Cyclomatic Complexity** | Counts ABAP branching constructs (`IF`, `LOOP`, `WHEN`, `CATCH`) from raw source — McCabe's CC formula | `agents/impact_analyzer.py` |
| **Betweenness Centrality** | `nx.betweenness_centrality()` identifies structural bridge objects — changing them disconnects modules | `agents/impact_analyzer.py` |
| **Inverse Square Law Hop** | Risk decays as `1 / hops²` from the change epicenter — close neighbours get exponential penalty | `agents/impact_analyzer.py` |
| **Blast Radius Walk** | BFS on `nx.DiGraph` via `nx.descendants()` + `nx.ancestors()` for full transitive closure | `core/graph_engine.py` |
| **ABAP Test Generator** | Generates unit + integration test stubs for every affected object with priority scoring | `agents/test_generator.py` |
| **Live Dependency Graph** | Canvas 2D animation loop using `requestAnimationFrame`; risk-coloured nodes; hover tooltips | `frontend/components/DependencyGraph.tsx` |
| **ROI Calculator** | Risk-weighted time estimate: `Σ(base_weeks × risk_multiplier)` × standard consultant day rate | `agents/impact_analyzer.py` |
| **Real-time Agent Monitor** | WebSocket pipeline streaming agent status and log entries to the dashboard | `main.py`, `AgentMonitor.tsx` |
| **Codebase Explorer** | Left-panel file tree of 85 real objects; click to read raw ABAP source in the UI | `frontend/page.tsx` |

---

## How It Works (Pipeline Flow)

```
User: "Update purchase order approval workflow in MM module"
            │
            ▼
┌─────────────────────────────┐
│     CodeArchaeologist       │  ← Parses 85 real ABAP files
│  Parse → Catalog → Graph    │    Extracts: calls, performs, tables
└────────────┬────────────────┘
             │  object_catalog (85 objects)
             ▼
┌─────────────────────────────┐
│      ImpactAnalyzer         │  ← AI extracts target objects/tables
│  AI Extract → BFS Walk      │    BFS finds all transitively affected
│  → Multi-dim Risk Score     │    Risk = f(PageRank, CC, hops, blast)
└────────────┬────────────────┘
             │  ImpactReport (70 objects, risk scores)
             ▼
┌─────────────────────────────┐
│       TestGenerator         │  ← Auto-generates ABAP test stubs
│  Unit + Integration Tests   │    Full test coverage for affected objects
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│        Orchestrator         │  ← Assembles result, builds D3 graph
│   AnalysisResult JSON       │    Streams logs via WebSocket
└─────────────────────────────┘
             │
             ▼
      Next.js Dashboard
  (Graph · Impact · Tests · ROI)
```

---

## Mathematical Risk Engine

Each affected object receives a composite risk score via:

```
Raw Score = F_table + F_pagerank + F_complexity + F_blast + F_hop + F_cross + F_betweenness

Where:
  F_table       = Σ(3.0 per Tier-1 critical table) + Σ(0.75 per Tier-2 table)
  F_pagerank    = min(PageRank × 200, 1.0) × 2.5
  F_complexity  = log₂(1 + CyclomaticComplexity) × 1.8
  F_blast       = min(blast_radius × 0.12, 2.5)
  F_hop         = 1.5 / hops²          (Inverse Square Law; 1.5 if direct target)
  F_cross       = 0.8  if cross-module dependency, else 0
  F_betweenness = min(betweenness × 10, 0.5)

Score ∈ [0, 10]  →  CRITICAL ≥ 7.5  |  HIGH ≥ 5.5  |  MEDIUM ≥ 3.0  |  LOW < 3.0
```

### Cyclomatic Complexity (McCabe's Formula)
```python
CC = (decision_points) + 1
# ABAP decision points: IF, ELSEIF, CASE, WHEN, LOOP AT, WHILE, DO, CHECK, CATCH
```

### ROI / Time Saved
```
time_saved = Σ (0.5 weeks × risk_multiplier_i)
  where: CRITICAL=3.0 × | HIGH=2.0 × | MEDIUM=1.0 × | LOW=0.5 ×

cost_saved = time_saved × 5 days × (industry standard consultant day rate)
```

---

## Agent Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Orchestrator                        │
│  Manages pipeline, broadcasts WebSocket events,        │
│  assembles AnalysisResult                              │
└───┬──────────────────┬──────────────────┬─────────────┘
    │                  │                  │
    ▼                  ▼                  ▼
┌──────────┐    ┌──────────────┐   ┌──────────────┐
│  Code    │    │   Impact     │   │    Test      │
│  Archae- │    │   Analyzer   │   │   Generator  │
│  ologist │    │              │   │              │
│          │    │ PageRank +   │   │ Unit +       │
│ Regex    │    │ Betweenness +│   │ Integration  │
│ Parser   │    │ CC + ISL     │   │ ABAP stubs   │
└──────────┘    └──────────────┘   └──────────────┘
    │                  │
    ▼                  ▼
NetworkX DiGraph    Gemini AI
(85 nodes,          (with regex
 140+ edges)         fallback)
```

---

## Graph Analytics

| Metric | Value (abap2xlsx dataset) |
|--------|--------------------------|
| Objects Parsed | **85** real ABAP files |
| Dependency Edges | **140+** directed edges |
| Graph Density | ~0.019 (sparse, realistic enterprise) |
| Weakly Connected Components | Varies by parsing run |
| PageRank Hub (highest) | Top Z-class in xlsx engine |
| Average Blast Radius | Varies per change (computed via BFS) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend API** | FastAPI + Uvicorn |
| **Graph Engine** | NetworkX (DiGraph, PageRank, Betweenness) |
| **AI Provider** | Google Gemini Pro (regex fallback) |
| **ABAP Parser** | Regex-based static analysis |
| **Frontend** | Next.js 16 + TypeScript |
| **Graph Visualisation** | HTML5 Canvas 2D API + requestAnimationFrame |
| **Animation** | Framer Motion |
| **Real-time Updates** | WebSocket (FastAPI) |
| **Code Source** | abap2xlsx (open-source SAP ABAP repo, ~85 objects) |

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Git

### Backend

```bash
cd backend
pip install -r requirements.txt

# Optional: add Gemini API key for AI-enhanced extraction
echo "GEMINI_API_KEY=your_key_here" > .env

python main.py
# → API running at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → UI running at http://localhost:3000
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health + AI provider status |
| `GET` | `/api/codebase` | Full object tree grouped by SAP module |
| `GET` | `/api/codebase/{name}` | Raw ABAP source for a specific object |
| `POST` | `/api/analyze` | Run full impact analysis pipeline |
| `GET` | `/api/graph` | D3.js-compatible graph (nodes + edges) |
| `GET` | `/api/graph/blast-radius/{name}` | Blast radius for a specific object |
| `WS` | `/ws` | WebSocket for real-time agent log streaming |

### Example Request

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"change_request": "Update purchase order approval in MM module"}'
```

### Example Response (truncated)

```json
{
  "impact_report": {
    "total_affected": "<computed>",
    "risk_summary": {"CRITICAL": "<n>", "HIGH": "<n>", "MEDIUM": "<n>", "LOW": "<n>"},
    "time_saved_weeks": "<computed from risk-weighted formula>",
    "cost_saved_estimate": "<computed from time × day rate>"
  },
  "graph_data": {
    "nodes": [{"id": "ZCL_EXCEL", "group": "XLSX", "risk": "HIGH", "size": 28}],
    "edges": [{"source": "ZCL_EXCEL", "target": "ZCL_EXCEL_WRITER"}]
  },
  "objects_parsed": 85
}
```

---

## Why Not Real SAP System Access?

We analyse open-source SAP ABAP code (`abap2xlsx`) rather than a live SAP instance because:
- **No SAP license required** — accessible to anyone for evaluation
- **Ethical** — no customer data or proprietary code exposed
- **Reproducible** — deterministic, version-controlled codebase
- **Scale** — 85 real ABAP objects with genuine cross-class dependencies

When deployed inside an enterprise, LegacyMind's `CodeArchaeologist` agent reads directly from the organisation's ABAP transport directories — zero configuration change required.

---

<div align="center">
Built for enterprise SAP modernisation at hackathon speed
</div>
