"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, AlertTriangle, Clock, TrendingUp } from "lucide-react";

interface Props {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}

export function AnimCounter({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1600,
}: Props) {
  const [n, setN] = useState(0);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let s = 0;
    const step = (ts: number) => {
      if (!s) s = ts;
      const p = Math.min((ts - s) / duration, 1);
      setN((1 - Math.pow(1 - p, 4)) * value);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {decimals > 0
        ? n.toFixed(decimals)
        : Math.round(n).toLocaleString()}
      {suffix}
    </span>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color: string;
  icon: React.ReactNode;
  glow: string;
  index: number;
}

export function MetricCard({
  label,
  value,
  prefix,
  suffix,
  decimals,
  color,
  icon,
  glow,
  index,
}: MetricCardProps) {
  return (
    <motion.div
      className="metric-card"
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: glow,
          filter: "blur(20px)",
        }}
      />
      <div style={{ marginBottom: 8, color }}>{icon}</div>
      <p
        style={{
          fontSize: 11,
          color: "rgba(0,0,0,0.6)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 32,
          fontWeight: 900,
          color: color,
          letterSpacing: "-0.02em",
        }}
      >
        <AnimCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
        />
      </p>
    </motion.div>
  );
}

interface MetricCardsProps {
  totalAffected: number;
  timeSaved: number;
  costSaved: number;
  objectsParsed: number;
}

export default function MetricCards({
  totalAffected,
  timeSaved,
  costSaved,
  objectsParsed,
}: MetricCardsProps) {
  const metrics: Array<{
    label: string; value: number; color: string; icon: React.ReactNode;
    glow: string; prefix?: string; suffix?: string; decimals?: number;
  }> = [
    {
      label: "Objects Parsed",
      value: objectsParsed,
      color: "#3b82f6",
      icon: <Search size={20} strokeWidth={2} />,
      glow: "rgba(59,130,246,0.15)",
    },
    {
      label: "Objects Affected",
      value: totalAffected,
      color: "#ef4444",
      icon: <AlertTriangle size={20} strokeWidth={2} />,
      glow: "rgba(239,68,68,0.15)",
    },
    {
      label: "Weeks Saved",
      value: timeSaved,
      decimals: 1,
      color: "#22c55e",
      icon: <Clock size={20} strokeWidth={2} />,
      glow: "rgba(34,197,94,0.15)",
    },
    {
      label: "Cost Saved",
      value: costSaved,
      prefix: "£",
      color: "#a855f7",
      icon: <TrendingUp size={20} strokeWidth={2} />,
      glow: "rgba(168,85,247,0.15)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4,1fr)",
        gap: 16,
        marginBottom: 24,
      }}
    >
      {metrics.map((m, i) => (
        <MetricCard
          key={i}
          label={m.label}
          value={m.value}
          prefix={m.prefix}
          suffix={m.suffix}
          decimals={m.decimals}
          color={m.color}
          icon={m.icon}
          glow={m.glow}
          index={i}
        />
      ))}
    </div>
  );
}
