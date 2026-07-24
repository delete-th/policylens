import React, { useState, useMemo } from "react";
import {
  ChevronDown, ChevronRight, ChevronLeft, Filter, ArrowUpDown,
  Search, X, Check, Pencil, RotateCcw, ShieldCheck, Circle,
  Sparkles, Info,
} from "lucide-react";
import { useStore } from "./store.jsx";
import { FINDINGS, FINDINGS_OVERVIEW, GROUP_ORDER, GROUP_META } from "./data.jsx";
import { SeverityChip, GroupIcon, DiffText } from "./components.jsx";

export default function ReviewPage() {
  const { activeFindingId, setActiveFindingId, decisions, setDecision } = useStore();
  const [diffTab,    setDiffTab]    = useState("Clause Difference");
  const [diffMode,   setDiffMode]   = useState("side");
  const [changeOpen, setChangeOpen] = useState(true);
  const [collapsed,  setCollapsed]  = useState({});

  const finding = FINDINGS.find((f) => f.id === activeFindingId) || FINDINGS[0];
  const idx     = FINDINGS.findIndex((f) => f.id === finding.id);
  const total   = FINDINGS.length;
  const resolvedCount = Object.keys(decisions).length + 4;
  const progressPct   = Math.round((resolvedCount / total) * 100);

  const grouped = useMemo(() => {
    const g = {};
    GROUP_ORDER.forEach((k) => (g[k] = []));
    FINDINGS.forEach((f) => g[f.group].push(f));
    return g;
  }, []);

  return (
    <div className="pl-page">
      <div className="pl-grid pl-grid-review" style={{ alignItems: "start" }}>

        {/* ── Left: findings list ── */}
        <div className="pl-card">
          <div style={{ padding: "13px 14px 0" }}>
            <h2 className="pl-h2">
              All Findings{" "}
              <span className="pl-num" style={{ color: "var(--ink-3)", fontWeight: 700 }}>{total}</span>
            </h2>
          </div>
          <div className="pl-findbar">
            <button className="pl-btn pl-btn-sm"><Filter size={13} aria-hidden="true" /> All Findings</button>
            <button className="pl-btn pl-btn-sm"><ArrowUpDown size={13} aria-hidden="true" /> Position</button>
          </div>
          <div className="pl-searchbox" style={{ margin: "0 14px 10px" }}>
            <Search size={13} aria-hidden="true" />
            <input placeholder="Search findings…" />
          </div>

          {GROUP_ORDER.map((key) => {
            const meta = GROUP_META[key];
            const list = grouped[key];
            const isCollapsed = collapsed[key];
            return (
              <div className="pl-group" key={key}>
                <button className="pl-group-h"
                  onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}>
                  {isCollapsed
                    ? <ChevronRight size={14} aria-hidden="true" />
                    : <ChevronDown  size={14} aria-hidden="true" />}
                  <GroupIcon name={meta.iconName} size={14} color={meta.fg} aria-hidden="true" />
                  {meta.label}
                  <span className="pl-group-count">{list.length}</span>
                </button>
                {!isCollapsed && list.map((f) => (
                  <button key={f.id} className="pl-finditem"
                    aria-current={f.id === finding.id}
                    onClick={() => setActiveFindingId(f.id)}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                      <span className="pl-fi-title">{f.ref} {f.title}</span>
                      <SeverityChip severity={f.severity} />
                    </div>
                    <div className="pl-fi-page">Page {f.page}</div>
                    <div className="pl-fi-reason">{f.reason}</div>
                  </button>
                ))}
              </div>
            );
          })}

          <div style={{ padding: "12px 14px" }}>
            <select className="pl-select" defaultValue="">
              <option value="" disabled>Bulk actions</option>
              <option>Accept all Looks Fine</option>
              <option>Export selected</option>
            </select>
          </div>
        </div>

        {/* ── Centre: detail ── */}
        <div className="pl-card">
          <div className="pl-detailhead">
            <button className="pl-navbtn" disabled={idx === 0}
              onClick={() => setActiveFindingId(FINDINGS[idx - 1].id)} aria-label="Previous">
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <button className="pl-navbtn" disabled={idx === total - 1}
              onClick={() => setActiveFindingId(FINDINGS[idx + 1].id)} aria-label="Next">
              <ChevronRight size={15} aria-hidden="true" />
            </button>
            <span className="pl-detailtitle">{finding.ref} {finding.title}</span>
            <SeverityChip severity={finding.severity} />
            <span style={{ marginLeft: "auto", color: "var(--ink-3)", fontSize: 12.5 }}>
              Page {finding.page} of 45
            </span>
            <button className="pl-navbtn" aria-label="Close"><X size={15} aria-hidden="true" /></button>
          </div>

          <div className="pl-reasonline">{finding.reason}</div>

          <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--line-2)", flexWrap: "wrap" }}>
            <button className="pl-btn pl-btn-primary" onClick={() => setDecision(finding.id, "accepted")}>
              <Check size={14} aria-hidden="true" /> Accept
            </button>
            <button className="pl-btn" onClick={() => setDecision(finding.id, "editing")}>
              <Pencil size={14} aria-hidden="true" /> Edit
            </button>
            <button className="pl-btn" onClick={() => setDecision(finding.id, "rejected")}>
              <RotateCcw size={14} aria-hidden="true" /> Reject
            </button>
            {decisions[finding.id] && (
              <span className="pl-chip" style={{ color: "var(--ink-2)", background: "var(--neutral-bg)", alignSelf: "center" }}>
                {decisions[finding.id] === "accepted" ? "Accepted"
                  : decisions[finding.id] === "rejected" ? "Rejected" : "Editing"}
              </span>
            )}
          </div>

          <div className="pl-tabs">
            {["Clause Difference", "Policy Rule", "Comments", "History"].map((t) => (
              <button key={t} className="pl-tabbtn" aria-selected={diffTab === t}
                onClick={() => setDiffTab(t)}>{t}</button>
            ))}
          </div>

          {diffTab === "Clause Difference" ? (
            finding.suggested ? (
              <>
                <div className="pl-diffbar">
                  <div className="pl-segbtn">
                    <button aria-pressed={diffMode === "side"}   onClick={() => setDiffMode("side")}>Side by side</button>
                    <button aria-pressed={diffMode === "inline"} onClick={() => setDiffMode("inline")}>Inline</button>
                  </div>
                  <div className="pl-legend">
                    <span><span className="pl-swatch" style={{ background: "#F3C7C3" }} />Deleted</span>
                    <span><span className="pl-swatch" style={{ background: "#B9E5C6" }} />Added</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      Highlight changes
                      <span className="pl-toggle" aria-checked="true">
                        <span className="pl-toggle-dot" />
                      </span>
                    </span>
                  </div>
                </div>
                <div className="pl-diffcols">
                  <div>
                    <div className="pl-diffcol-h">Current (in contract)</div>
                    <div className="pl-diffbody">
                      {finding.current.map((l, i) => <DiffText key={i} line={l} />)}
                    </div>
                  </div>
                  <div>
                    <div className="pl-diffcol-h">Suggested (policy-aligned)</div>
                    <div className="pl-diffbody">
                      {finding.suggested.map((l, i) => <DiffText key={i} line={l} />)}
                    </div>
                  </div>
                </div>
                <div className="pl-changesummary">
                  <button className="pl-changesummary-h" onClick={() => setChangeOpen((o) => !o)}>
                    <Sparkles size={14} color="var(--info)" aria-hidden="true" /> Change summary
                    {changeOpen
                      ? <ChevronDown size={14} style={{ marginLeft: "auto" }} aria-hidden="true" />
                      : <ChevronRight size={14} style={{ marginLeft: "auto" }} aria-hidden="true" />}
                  </button>
                  {changeOpen && (
                    <p style={{ margin: "0 16px 16px", color: "var(--ink-2)", fontSize: 13 }}>
                      {finding.changeSummary}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="pl-empty">
                <div className="pl-empty-ico"><ShieldCheck size={20} color="var(--ok)" aria-hidden="true" /></div>
                <div style={{ fontWeight: 700 }}>No issues detected</div>
                <p style={{ color: "var(--ink-2)", marginTop: 6 }}>{finding.current[1]}</p>
              </div>
            )
          ) : (
            <div className="pl-empty">
              <div className="pl-empty-ico"><Info size={20} aria-hidden="true" /></div>
              <div style={{ fontWeight: 700 }}>{diffTab}</div>
              <p style={{ color: "var(--ink-2)", marginTop: 6 }}>Nothing recorded yet for this finding.</p>
            </div>
          )}
        </div>

        {/* ── Right: document panel ── */}
        <div>
          <div className="pl-card" style={{ marginBottom: 14 }}>
            <div className="pl-card-b">
              <div className="pl-doctitle">Master Services Agreement</div>
              <div style={{ margin: "8px 0" }}>
                <span className="pl-status-pill">
                  <Circle size={7} fill="currentColor" aria-hidden="true" />Under Review
                </span>
              </div>
              <div style={{ color: "var(--ink-3)", fontSize: 12 }}>v1.2 · Uploaded 2 days ago</div>
            </div>
          </div>

          <div className="pl-card" style={{ marginBottom: 14 }}>
            <div className="pl-card-h">
              <h2 className="pl-h2">Findings Overview</h2>
              <span className="pl-num" style={{ color: "var(--ink-3)", fontSize: 12 }}>{total} total</span>
            </div>
            <div className="pl-card-b">
              <div className="pl-overviewbar">
                {FINDINGS_OVERVIEW.map((g) => (
                  <div key={g.key} style={{ flex: g.count, background: g.fg }} />
                ))}
              </div>
              <div className="pl-overviewlist">
                {FINDINGS_OVERVIEW.map((g) => (
                  <div className="pl-overviewitem" key={g.key}>
                    <GroupIcon name={g.iconName} size={13} color={g.fg} aria-hidden="true" />
                    <span style={{ flex: 1, color: "var(--ink-2)" }}>{g.label}</span>
                    <strong className="pl-num">{g.count}</strong>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)" }}>
                  <span>Progress</span><span>{resolvedCount} of {total} resolved</span>
                </div>
                <div className="pl-progresstrack">
                  <div className="pl-progressfill" style={{ width: `${progressPct}%` }} />
                </div>
                <div style={{ textAlign: "right", fontSize: 11.5, color: "var(--ink-3)" }}>{progressPct}%</div>
              </div>
            </div>
          </div>

          <div className="pl-card" style={{ marginBottom: 14 }}>
            <div className="pl-card-b">
              {[
                ["Counterparty", "Acme Corporation"],
                ["Policy Set",   "Procurement Policy v4.3"],
                ["Jurisdiction", "Delaware, USA"],
                ["Assigned To",  "Tanishqa Akude"],
                ["Last Updated", "Today, 10:24 AM"],
              ].map(([k, v]) => (
                <div className="pl-metarow" key={k}>
                  <span style={{ color: "var(--ink-2)" }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pl-footnote">
            <ShieldCheck size={15} color="var(--ink-2)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>Policy is checked before precedent — always.<br />
              PolicyLens Policy Engine v4.3</span>
          </div>
        </div>
      </div>
    </div>
  );
}
