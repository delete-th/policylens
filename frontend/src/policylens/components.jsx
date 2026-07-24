import React from "react";
import { ShieldAlert, ArrowLeftRight, FileText, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";
import { SEVERITY, GROUP_META } from "./data.jsx";

/* ── Status chips ── */
export function SeverityChip({ severity }) {
  if (!severity) return null;
  const s = SEVERITY[severity];
  return <span className="pl-chip" style={{ color: s.fg, background: s.bg }}>{severity}</span>;
}

export function StatusChip({ status }) {
  const map = {
    "Under Review": ["var(--warn)",    "var(--warn-bg)"],
    "Completed":    ["var(--ok)",      "var(--ok-bg)"],
    "Active":       ["var(--ok)",      "var(--ok-bg)"],
    "Draft":        ["var(--info)",    "var(--info-bg)"],
    "Archived":     ["var(--neutral)", "var(--neutral-bg)"],
  };
  const [fg, bg] = map[status] || map["Draft"];
  return <span className="pl-chip" style={{ color: fg, background: bg }}>{status}</span>;
}

/* ── Resolve group icon by name so data.js stays icon-free ── */
const ICON_MAP = { ShieldAlert, ArrowLeftRight, FileText, ShieldCheck };
export function GroupIcon({ name, ...props }) {
  const Icon = ICON_MAP[name] || FileText;
  return <Icon {...props} />;
}

/* ── Diff text — __DEL__ / __ADD__ markers → highlighted spans ── */
export function DiffText({ line }) {
  const parts = line.split(/(__DEL__.*?__\/DEL__|__ADD__.*?__\/ADD__)/g).filter(Boolean);
  return (
    <p>
      {parts.map((part, i) => {
        if (part.startsWith("__DEL__"))
          return <span key={i} className="pl-del">{part.replace(/__DEL__|__\/DEL__/g, "")}</span>;
        if (part.startsWith("__ADD__"))
          return <span key={i} className="pl-add">{part.replace(/__ADD__|__\/ADD__/g, "")}</span>;
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

/* ── Highlight keyword occurrences within a clause text snippet ── */
export function HighlightText({ text, query }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
      )}
    </>
  );
}
