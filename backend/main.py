"""
LegacyMind - FastAPI Backend Server
REST API + WebSocket for the analysis pipeline.
"""

from __future__ import annotations

import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from agents.orchestrator import Orchestrator
from core.models import AnalysisRequest


# ── Logging ───────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("legacymind.server")

# ── Global state ──────────────────────────────────────────────────────────
orchestrator = Orchestrator()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-parse the codebase on startup for faster first request."""
    logger.info("LegacyMind server starting — pre-parsing codebase...")
    orchestrator.get_codebase_info()
    logger.info("Codebase parsed and ready.")
    yield
    logger.info("LegacyMind server shutting down.")


# ── App ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="LegacyMind API",
    description="AI Agent Swarm for Enterprise SAP Legacy Modernization",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "LegacyMind",
        "version": "1.0.0",
        "ai_provider": orchestrator.ai_client.provider_used or "ready",
    }


# ── Codebase ──────────────────────────────────────────────────────────────
@app.get("/api/codebase")
async def get_codebase():
    """Return metadata about the parsed SAP codebase."""
    try:
        info = orchestrator.get_codebase_info()
        return JSONResponse(content=info)
    except Exception as exc:
        logger.error("Error getting codebase info: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/api/codebase/{object_name}")
async def get_object_code(object_name: str):
    """Return the ABAP source code for a specific object."""
    raw_codebase = orchestrator.archaeologist.raw_codebase
    if object_name in raw_codebase:
        data = raw_codebase[object_name]
        return {
            "name": object_name,
            "type": data.get("type"),
            "module": data.get("module"),
            "description": data.get("description"),
            "code": data.get("code", ""),
        }
    return JSONResponse(status_code=404, content={"error": f"Object {object_name} not found"})


# ── Graph ─────────────────────────────────────────────────────────────────
@app.get("/api/graph")
async def get_graph():
    """Return the dependency graph in D3.js-compatible format."""
    try:
        graph_data = orchestrator.archaeologist.get_graph_data()
        return JSONResponse(content=graph_data.model_dump())
    except Exception as exc:
        logger.error("Error getting graph: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/api/graph/blast-radius/{object_name}")
async def get_blast_radius(object_name: str):
    """Return the blast radius for a specific object."""
    try:
        result = orchestrator.archaeologist.get_blast_radius(object_name)
        return JSONResponse(content=result)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})


# ── Analysis ──────────────────────────────────────────────────────────────
@app.post("/api/analyze")
async def run_analysis(request: AnalysisRequest):
    """Run the full impact analysis pipeline.

    Accepts a change request and returns:
    - Impact report with risk scores
    - Generated test suite
    - Updated dependency graph
    - Agent performance metrics
    """
    logger.info("Analysis request: %s", request.change_request[:80])
    start = time.time()

    try:
        result = await orchestrator.run_pipeline(request)
        elapsed = time.time() - start
        logger.info("Analysis complete in %.1fms", elapsed * 1000)

        return JSONResponse(content=result.model_dump())
    except Exception as exc:
        logger.error("Analysis failed: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": str(exc), "type": type(exc).__name__},
        )


# ── Agent Status ──────────────────────────────────────────────────────────
@app.get("/api/agents/status")
async def get_agent_statuses():
    """Return current status of all agents."""
    statuses = {
        name: status.model_dump()
        for name, status in orchestrator.agent_statuses.items()
    }
    return JSONResponse(content=statuses)


@app.get("/api/agents/logs")
async def get_agent_logs():
    """Return the activity log from the last pipeline run."""
    return JSONResponse(content=orchestrator.get_logs())


# ── WebSocket ─────────────────────────────────────────────────────────────
class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.active.remove(ws)

    async def broadcast(self, data: dict[str, Any]) -> None:
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                pass


ws_manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket for real-time pipeline updates."""
    await ws_manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "analyze":
                    request = AnalysisRequest(change_request=msg.get("change_request", ""))

                    # Send start event
                    await ws.send_json({"type": "pipeline_start", "request": request.change_request})

                    result = await orchestrator.run_pipeline(request)

                    # Send logs
                    for log_entry in orchestrator.get_logs():
                        await ws.send_json({"type": "log", **log_entry})

                    # Send complete result
                    await ws.send_json({"type": "pipeline_complete", "result": result.model_dump()})

            except Exception as exc:
                await ws.send_json({"type": "error", "message": str(exc)})

    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


# ── Run ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
