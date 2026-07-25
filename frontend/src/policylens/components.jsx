import React, { useEffect } from "react";
import { ShieldAlert, FileText, ShieldCheck, ChevronDown, ChevronRight, X } from "lucide-react";
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
const ICON_MAP = { ShieldAlert, FileText, ShieldCheck };
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

/* ── Generic modal shell — every popup in the app (alerts, confirms, the PDF
   viewer) renders through this so they look and behave consistently:
   backdrop click, Esc, and a titled header/footer, instead of native
   browser alert()/confirm() dialogs. ── */
export function Modal({ title, onClose, children, footer, width }) {
  useEffect(() => {
    function onKeyDown(e) { if (e.key === "Escape") onClose?.(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="pl-modal-overlay" onClick={onClose}>
      <div
        className="pl-modal" style={width ? { width } : undefined}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}
      >
        <div className="pl-modal-h">
          <strong>{title}</strong>
          <button className="pl-btn pl-btn-sm pl-btn-icon" onClick={onClose} aria-label="Close">
            <X size={13} aria-hidden="true" />
          </button>
        </div>
        <div className="pl-modal-b">{children}</div>
        {footer && <div className="pl-modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Simple message modal — replaces alert() ── */
export function AlertModal({ title = "Notice", message, onClose }) {
  if (!message) return null;
  return (
    <Modal
      title={title} onClose={onClose}
      footer={<button className="pl-btn pl-btn-primary" onClick={onClose} autoFocus>OK</button>}
    >
      <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-line" }}>
        {message}
      </p>
    </Modal>
  );
}

/* ── Confirm/cancel modal — replaces window.confirm(). Since a React modal
   can't block like the native dialog does, callers pass onConfirm/onCancel
   instead of getting a boolean back synchronously. ── */
export function ConfirmModal({ title = "Confirm", message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, onConfirm, onCancel }) {
  if (!message) return null;
  return (
    <Modal
      title={title} onClose={onCancel}
      footer={
        <>
          <button className="pl-btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`pl-btn ${danger ? "pl-btn-danger" : "pl-btn-primary"}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-line" }}>
        {message}
      </p>
    </Modal>
  );
}

/* ── Modal PDF viewer — signed URL rendered via native browser PDF support ── */
export function PdfViewerModal({ url, onClose }) {
  if (!url) return null;
  return (
    <Modal title="Policy PDF" onClose={onClose} width="min(900px, 100%)">
      <iframe src={url} title="Policy PDF" style={{ width: "100%", height: "75vh", border: 0, display: "block" }} />
    </Modal>
  );
}

/* ── Highlight one known {start,end} span within a clause's full text — for
   violating_text. Distinct from HighlightText below, which does a global
   regex search for a keyword; this renders exactly one fixed-offset span,
   and falls back to plain text (no guessing) when span is null. ── */
export function HighlightSpan({ text, span, markClass = "pl-mark-violation" }) {
  if (!span) return <>{text}</>;
  const { start, end } = span;
  return (
    <>
      {text.slice(0, start)}
      <mark className={markClass}>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
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
