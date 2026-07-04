"use client";

import { motion } from "framer-motion";
import { Search, Zap, FlaskConical, Bot, FileText, BarChart3, ClipboardList, ChevronRight } from "lucide-react";

interface AgentStatus {
  name: string;
  status: string;
  progress: number;
  message: string;
  duration_ms: number | null;
}

interface AgentInfo {
  name: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
  description: string;
  tech: string[];
}

const AGENTS: AgentInfo[] = [
  {
    name: "CodeArchaeologist",
    icon: <Search size={28} strokeWidth={1.5} />,
    color: "#3b82f6",
    glow: "rgba(59,130,246,0.12)",
    description:
      "Parses ABAP source files using regex-based static analysis. Extracts CALL FUNCTION, PERFORM, and SELECT dependencies. Builds a NetworkX directed graph and computes PageRank centrality scores.",
    tech: ["Python", "NetworkX", "Regex", "PageRank"],
  },
  {
    name: "ImpactAnalyzer",
    icon: <Zap size={28} strokeWidth={1.5} />,
    color: "#f97316",
    glow: "rgba(249,115,22,0.12)",
    description:
      "Interprets change requests via LLM with regex fallback. Performs BFS/DFS traversal of the dependency graph. Scores each reachable object by risk level using table criticality and blast radius.",
    tech: ["LLM/AI", "BFS/DFS", "Risk Scoring", "NLP"],
  },
  {
    name: "TestGenerator",
    icon: <FlaskConical size={28} strokeWidth={1.5} />,
    color: "#22c55e",
    glow: "rgba(34,197,94,0.12)",
    description:
      "Generates ABAP CL_ABAP_UNIT test class skeletons for all affected objects. Creates integration test scenarios for critical dependency chains. Prioritizes by risk score.",
    tech: ["ABAP Unit", "AI Templates", "Integration Tests"],
  },
];

const PIPELINE_STEPS: Array<{ icon: React.ReactNode; label: string; col: string } | null> = [
  { icon: <FileText size={18} />, label: "Change Request", col: "rgba(0,0,0,0.08)" },
  null,
  { icon: <Search size={18} />, label: "Parse ABAP", col: "rgba(59,130,246,0.08)" },
  null,
  { icon: <BarChart3 size={18} />, label: "Build Graph", col: "rgba(59,130,246,0.08)" },
  null,
  { icon: <Zap size={18} />, label: "Score Risks", col: "rgba(249,115,22,0.08)" },
  null,
  { icon: <FlaskConical size={18} />, label: "Generate Tests", col: "rgba(34,197,94,0.08)" },
  null,
  { icon: <ClipboardList size={18} />, label: "Report", col: "rgba(168,85,247,0.08)" },
];

interface Props {
  agentStatuses: AgentStatus[] | null;
}

export default function AgentMonitor({ agentStatuses }: Props) {
  return (
    <div>
      <div className="section-header">
        <div className="section-title" style={{ fontSize: "1.25rem" }}>
          <span
            className="icon-wrapper"
            style={{
              background: "rgba(168,85,247,0.1)",
              width: 40,
              height: 40,
              color: "#a78bfa",
            }}
          >
            <Bot size={18} />
          </span>
          Agent Swarm Monitor
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 20,
          marginBottom: 28,
        }}
      >
        {AGENTS.map((a, i) => {
          const st = agentStatuses?.find((s) => s.name === a.name);
          return (
            <motion.div
              key={a.name}
              className="glass-card"
              style={{ padding: 28, position: "relative", overflow: "hidden" }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -30,
                  right: -30,
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: a.glow,
                  filter: "blur(30px)",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <div style={{ color: a.color }}>{a.icon}</div>
                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    background:
                      st?.status === "complete"
                        ? "rgba(74,222,128,0.12)"
                        : st?.status === "running"
                          ? "rgba(59,130,246,0.12)"
                          : "rgba(0,0,0,0.05)",
                    color:
                      st?.status === "complete"
                        ? "#4ade80"
                        : st?.status === "running"
                          ? "#60a5fa"
                          : "rgba(0,0,0,0.5)",
                  }}
                >
                  {st?.status || "IDLE"}
                </div>
              </div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: a.color,
                  marginBottom: 10,
                }}
              >
                {a.name}
              </h3>
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(0,0,0,0.7)",
                  lineHeight: 1.7,
                  marginBottom: 16,
                }}
              >
                {a.description}
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 16,
                }}
              >
                {a.tech.map((t) => (
                  <span
                    key={t}
                    className="badge badge-blue"
                    style={{ fontSize: 9 }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              {st && (
                <>
                  <div className="progress-bar" style={{ height: 4, marginBottom: 8 }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${st.progress}%`,
                        background: a.color,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "rgba(0,0,0,0.6)",
                    }}
                  >
                    <span>{st.message}</span>
                    {st.duration_ms && (
                      <span
                        style={{
                          fontFamily: "monospace",
                          color: "rgba(0,0,0,0.5)",
                        }}
                      >
                        {st.duration_ms}ms
                      </span>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Pipeline Architecture */}
      <motion.div
        className="glass-card"
        style={{ padding: 28, marginBottom: 28 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div className="section-title" style={{ marginBottom: 20 }}>
          Pipeline Architecture
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {PIPELINE_STEPS.map((s, i) =>
            s === null ? (
              <motion.span
                key={i}
                style={{
                  color: "rgba(0,0,0,0.12)",
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.05 }}
              >
                <ChevronRight size={16} />
              </motion.span>
            ) : (
              <motion.div
                key={i}
                style={{
                  textAlign: "center",
                  padding: "14px 18px",
                  borderRadius: 14,
                  background: s.col,
                  border: "1px solid rgba(0,0,0,0.06)",
                  minWidth: 90,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.05 }}
                whileHover={{
                  scale: 1.05,
                  borderColor: "rgba(0,0,0,0.15)",
                }}
              >
                <div style={{ color: "rgba(0,0,0,0.7)" }}>{s.icon}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(0,0,0,0.7)",
                    fontWeight: 600,
                  }}
                >
                  {s.label}
                </div>
              </motion.div>
            )
          )}
        </div>
      </motion.div>
    </div>
  );
}
