"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";

const MODULE_COLORS: Record<string, string> = {
  HR: "#3b82f6",
  SD: "#22c55e",
  MM: "#f97316",
  FI: "#a855f7",
  XLSX: "#ec4899",
  UNKNOWN: "#6b7280",
};

interface GraphNode {
  id: string;
  group: string;
  x: number;
  y: number;
  size: number;
  risk?: string | null;
  description?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface Props {
  affectedNames: Set<string>;
  graphData?: GraphData | null;
}

interface TooltipState {
  x: number;
  y: number;
  node: string;
  module: string;
  risk?: string | null;
}

export default function DependencyGraph({ affectedNames, graphData }: Props) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const nodeMapRef = useRef<Map<string, GraphNode & { px: number; py: number; r: number }>>(new Map());
  const animRef = useRef<number>(0);
  const hoveredRef = useRef<string | null>(null);
  const affectedRef = useRef<Set<string>>(affectedNames);
  const graphDataRef = useRef<GraphData | null | undefined>(graphData);

  // Keep refs in sync with props/state so the animation loop sees fresh values
  useEffect(() => { affectedRef.current = affectedNames; }, [affectedNames]);
  useEffect(() => { graphDataRef.current = graphData; }, [graphData]);
  useEffect(() => { hoveredRef.current = hovered; }, [hovered]);

  const drawFrame = useCallback((timestamp: number) => {
    const canvas = cvs.current;
    const container = wrap.current;
    const gd = graphDataRef.current;
    if (!canvas || !container) { animRef.current = requestAnimationFrame(drawFrame); return; }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = 600;
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, W, H);

    if (!gd || !gd.nodes.length) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.font = "bold 14px Inter,system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Run an analysis to visualise the dependency graph", W / 2, H / 2 - 12);
      ctx.font = "12px Inter,system-ui";
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillText(`${graphDataRef.current == null ? "Waiting for backend..." : "No graph data"}`, W / 2, H / 2 + 12);
      animRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    const t = timestamp * 0.001;

    // Layout: center the backend coordinates (which are around 400,300 space) inside canvas
    const offsetX = Math.max(0, (W - 800) / 2);
    const nmap = new Map<string, GraphNode & { px: number; py: number; r: number }>();
    gd.nodes.forEach((n) => {
      nmap.set(n.id, {
        ...n,
        px: (n.x || 0) + offsetX,
        py: n.y || 0,
        r: Math.max(4, (n.size || 10) * 0.55),
      });
    });
    nodeMapRef.current = nmap;

    const affected = affectedRef.current;
    const hov = hoveredRef.current;

    // ── Draw edges ──────────────────────────────────────────────────────────
    gd.edges.forEach((edge) => {
      const a = nmap.get(edge.source);
      const b = nmap.get(edge.target);
      if (!a || !b) return;

      const isCross = a.group !== b.group;
      const bothAff = affected.has(edge.source) && affected.has(edge.target);
      const mx = (a.px + b.px) / 2 + (isCross ? 18 : 0);
      const my = (a.py + b.py) / 2 - 12;

      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.quadraticCurveTo(mx, my, b.px, b.py);

      if (bothAff) {
        ctx.strokeStyle = `rgba(239,68,68,${0.45 + 0.2 * Math.sin(t * 3)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -t * 22;
      } else if (isCross) {
        ctx.strokeStyle = "rgba(139,92,246,0.22)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ── Draw nodes ──────────────────────────────────────────────────────────
    for (const [, n] of nmap) {
      const aff = affected.has(n.id);
      const isHov = hov === n.id;
      const col = MODULE_COLORS[n.group] || "#6b7280";
      const r = n.r * (aff ? 1.35 : 1) * (isHov ? 1.5 : 1);

      // Pulsing glow
      if (aff) {
        const pr = r * (2.8 + 0.5 * Math.sin(t * 3));
        const g = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, pr);
        g.addColorStop(0, col + "50");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.px, n.py, pr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(n.px, n.py, r, 0, Math.PI * 2);
      if (aff) {
        const riskCol = n.risk === "CRITICAL" ? "#ef4444" : n.risk === "HIGH" ? "#f97316" : col;
        ctx.fillStyle = riskCol;
        ctx.strokeStyle = riskCol;
      } else {
        ctx.fillStyle = isHov ? col : col + "BB";
        ctx.strokeStyle = col;
      }
      ctx.fill();
      ctx.lineWidth = isHov ? 2.5 : 1;
      ctx.stroke();

      // Label
      if (n.r > 20 || aff || isHov) {
        ctx.fillStyle = aff || isHov ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.35)";
        ctx.font = `${aff || isHov ? "bold " : ""}${isHov ? 10 : 9}px Inter,system-ui`;
        ctx.textAlign = "center";
        const label = n.id.length > 18 ? n.id.substring(0, 16) + "…" : n.id;
        ctx.fillText(label, n.px, n.py + r + 11);
      }
    }

    // ── Legend ──────────────────────────────────────────────────────────────
    ctx.font = "bold 10px Inter,system-ui";
    ctx.textAlign = "left";
    let lx = 16;
    const ly = H - 22;
    for (const [k, c] of Object.entries(MODULE_COLORS)) {
      if (k === "UNKNOWN") continue;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(lx + 4, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(k, lx + 13, ly + 4);
      lx += 62;
    }

    // Affected badge
    if (affected.size > 0) {
      const badge = `${affected.size} AFFECTED`;
      ctx.font = "bold 10px Inter,system-ui";
      ctx.textAlign = "right";
      const tw = ctx.measureText(badge).width;
      ctx.fillStyle = "rgba(239,68,68,0.12)";
      ctx.strokeStyle = "rgba(239,68,68,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(W - tw - 30, ly - 12, tw + 18, 22, 11);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#dc2626";
      ctx.fillText(badge, W - 18, ly + 4);
    }

    animRef.current = requestAnimationFrame(drawFrame);
  }, []); // stable — reads via refs

  useEffect(() => {
    animRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawFrame]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = cvs.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found: string | null = null;
    for (const [id, n] of nodeMapRef.current) {
      const dx = mx - n.px;
      const dy = my - n.py;
      if (dx * dx + dy * dy < (n.r + 8) * (n.r + 8)) {
        found = id;
        setTooltip({
          x: mx,
          y: my - 48,
          node: id,
          module: n.group,
          risk: n.risk,
        });
        break;
      }
    }
    if (!found) setTooltip(null);
    setHovered(found);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setTooltip(null);
  }, []);

  const modCol = (m: string) => MODULE_COLORS[m] || "#6b7280";
  const riskCol = (r?: string | null) =>
    r === "CRITICAL" ? "#ef4444" : r === "HIGH" ? "#f97316" : r === "MEDIUM" ? "#eab308" : "#22c55e";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div ref={wrap} style={{ width: "100%", position: "relative", borderRadius: 12, overflow: "hidden" }}>
        <canvas
          ref={cvs}
          style={{ width: "100%", display: "block", cursor: hovered ? "pointer" : "default" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.96)",
              border: `1px solid ${modCol(tooltip.module)}40`,
              borderRadius: 10,
              padding: "8px 14px",
              pointerEvents: "none",
              zIndex: 10,
              backdropFilter: "blur(12px)",
              boxShadow: `0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px ${modCol(tooltip.module)}20`,
              minWidth: 160,
            }}
          >
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: modCol(tooltip.module), marginBottom: 4 }}>
              {tooltip.node}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(0,0,0,0.6)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: modCol(tooltip.module), display: "inline-block", flexShrink: 0 }} />
              {tooltip.module} Module
              {affectedNames.has(tooltip.node) && tooltip.risk && (
                <span style={{ marginLeft: 4, padding: "1px 6px", borderRadius: 999, background: riskCol(tooltip.risk) + "20", color: riskCol(tooltip.risk), fontWeight: 700, fontSize: 9 }}>
                  {tooltip.risk}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
