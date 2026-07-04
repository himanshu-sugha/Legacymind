"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface LogEntry {
  timestamp: number;
  agent: string;
  message: string;
}

const AGENT_COLORS: Record<string, string> = {
  CodeArchaeologist: "#60a5fa",
  ImpactAnalyzer: "#fb923c",
  TestGenerator: "#4ade80",
  Orchestrator: "#c084fc",
};

interface Props {
  logs: LogEntry[];
  running: boolean;
}

export default function Terminal({ logs, running }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const [displayedLogs, setDisplayedLogs] = useState<
    Array<LogEntry & { displayTime: string }>
  >([]);

  useEffect(() => {
    if (logs.length === 1 && displayedLogs.length === 0) {
      startTimeRef.current = Date.now();
    }
    const newLogs = logs.map((l, i) => {
      const elapsed = i === 0 ? 0 : (l.timestamp - logs[0].timestamp) * 1000;
      const d = new Date(startTimeRef.current + elapsed);
      return {
        ...l,
        displayTime: d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
    });
    setDisplayedLogs(newLogs);
  }, [logs]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [displayedLogs]);

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-dot" style={{ background: "#ff5f57" }} />
        <div className="terminal-dot" style={{ background: "#febc2e" }} />
        <div className="terminal-dot" style={{ background: "#28c840" }} />
        <span
          style={{
            marginLeft: 12,
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.08em",
          }}
        >
          AGENT TERMINAL
        </span>
        {running && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              color: "#4ade80",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: "#4ade80",
                borderRadius: "50%",
                display: "inline-block",
                animation: "pulseGlowGreen 1s infinite",
              }}
            />
            LIVE
          </span>
        )}
      </div>
      <div
        ref={ref}
        style={{
          padding: "16px 20px",
          maxHeight: 320,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {displayedLogs.length === 0 && (
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
            $ awaiting pipeline execution...
          </span>
        )}
        {displayedLogs.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.02 }}
            style={{
              display: "flex",
              gap: 12,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <span
              style={{
                color: "rgba(255,255,255,0.2)",
                minWidth: 80,
                flexShrink: 0,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11,
              }}
            >
              {l.displayTime}
            </span>
            <span
              style={{
                color: AGENT_COLORS[l.agent] || "#94a3b8",
                fontWeight: 600,
                minWidth: 170,
                flexShrink: 0,
              }}
            >
              [{l.agent}]
            </span>
            <span style={{ color: "rgba(74,222,128,0.85)" }}>
              {l.message}
            </span>
          </motion.div>
        ))}
        {running && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 14,
              background: "#4ade80",
              marginLeft: 2,
            }}
            className="animate-blink"
          />
        )}
      </div>
    </div>
  );
}
