import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, ChevronLeft, Check, Pencil, RotateCcw,
  ShieldCheck, Circle, AlertTriangle, Loader2,
} from "lucide-react";
import { useStore } from "./store.jsx";
import { GROUP_ORDER, GROUP_META, CHECK_TYPE_LABELS, clauseGroup, findingTitle } from "./data.jsx";
import { SeverityChip, GroupIcon, HighlightSpan, AlertModal } from "./components.jsx";
import { findRobustSpan, findSuggestedSpan } from "./textHighlight.js";
import { api } from "../services/api.js";

const TIER_TO_SEVERITY = { high: "High", medium: "Medium", low: "Low" };
const EMPTY_FINDINGS = [];
const EMPTY_DECISIONS = {};

function EmptyState({ icon, title, body }) {
  return (
    <div className="pl-page">
      <div className="pl-card"><div className="pl-empty">
        <div className="pl-empty-ico">{icon}</div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <p style={{ color: "var(--ink-2)", marginTop: 6 }}>{body}</p>
      </div></div>
    </div>
  );
}

// Prefer whichever violation is the real issue for a clause's display title
// (matches that specific violated rule's real heading); falls back to the
// contract clause's own title/category when both sides are Looks Fine.
function clauseTitle(c) {
  const allFindings = [...c.policy, ...c.precedent];
  const preferred = allFindings.find((f) => f.compliance_check_result.result === "non_compliant");
  return preferred ? findingTitle(preferred) : (c.record.title || c.record.category);
}

// The clause's real "current" text as far as a still-pending violation
// should be concerned — mirrors the backend's own final-document logic
// (backend/api/routes/drift.py::get_final_document): across ALL findings
// for this clause (policy + precedent), the most recently accepted/edited
// decision's final_text is the current effective text, since cascading
// re-evaluation means every later decision already accounts for every
// earlier one. Falls back to the original record text if nothing's been
// decided yet.
function effectiveClauseText(clause, decisionsByFinding) {
  const allFindings = [...clause.policy, ...clause.precedent];
  let best = null;
  for (const f of allFindings) {
    const d = decisionsByFinding[f.compliance_check_result.id];
    if (d && (d.status === "accepted" || d.status === "edited") && d.final_text) {
      if (!best || d.decided_at > best.decided_at) best = d;
    }
  }
  return best ? best.final_text : clause.record.clause_text;
}

// Per-violation version of the above: an already-decided violation must
// keep showing whatever was current AT THE TIME it was decided, forever —
// it must never retroactively change just because a sibling gets decided
// LATER. Achieved by capping the "latest decision wins" search to only
// decisions strictly before this violation's own decided_at. A still-
// pending violation has no cutoff, so it keeps live-updating as siblings
// resolve (matches today's behavior for undecided violations).
function effectiveTextFor(finding, clause, decisionsByFinding) {
  const ownDecision = decisionsByFinding[finding.compliance_check_result.id];
  const cutoff = ownDecision?.decided_at;
  const allFindings = [...clause.policy, ...clause.precedent];
  let best = null;
  for (const f of allFindings) {
    const d = decisionsByFinding[f.compliance_check_result.id];
    if (!d || !(d.status === "accepted" || d.status === "edited") || !d.final_text) continue;
    if (cutoff && d.decided_at >= cutoff) continue;
    if (!best || d.decided_at > best.decided_at) best = d;
  }
  return best ? best.final_text : clause.record.clause_text;
}

export default function ReviewPage() {
  const {
    driftReportId, driftReportCache, loadDriftReport, applyDecision,
    activeFindingId, setActiveFindingId, decisions, setDecision,
  } = useStore();
  const [collapsed, setCollapsed] = useState({});
  const [editTexts, setEditTexts] = useState({}); // ccr.id -> draft text, keyed so every violation can edit independently
  const [saving, setSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  useEffect(() => { if (driftReportId) loadDriftReport(driftReportId); }, [driftReportId, loadDriftReport]);

  const entry = driftReportCache[driftReportId] ?? { status: "idle" };
  const { status, error } = entry;
  const findings = entry.findings ?? EMPTY_FINDINGS;
  const decisionsByFinding = entry.decisionsByFinding ?? EMPTY_DECISIONS;

  // One real-world contract clause can have MULTIPLE independently-decidable
  // findings per check_type now (one per violated rule, not just one
  // combined verdict) — group by clause into two arrays, not two slots.
  const clauses = useMemo(() => {
    const byRecord = new Map();
    for (const f of findings) {
      const recordId = f.contract_record?.id;
      if (!recordId) continue;
      if (!byRecord.has(recordId)) byRecord.set(recordId, { record: f.contract_record, policy: [], precedent: [] });
      const c = byRecord.get(recordId);
      (f.compliance_check_result.check_type === "policy_compliance" ? c.policy : c.precedent).push(f);
    }
    return [...byRecord.values()];
  }, [findings]);

  const grouped = useMemo(() => {
    const g = {};
    GROUP_ORDER.forEach((k) => (g[k] = []));
    clauses.forEach((c) => {
      const ccrs = [...c.policy, ...c.precedent].map((f) => f.compliance_check_result);
      g[clauseGroup(ccrs)].push(c);
    });
    return g;
  }, [clauses]);

  // "Resolved" means an outstanding (non_compliant) finding got an explicit
  // accept/reject/edit decision — Looks Fine findings never asserted a
  // problem, so they're excluded entirely rather than counting as
  // automatically "resolved."
  const outstandingFindings = useMemo(
    () => findings.filter((f) => f.compliance_check_result.result === "non_compliant"),
    [findings]
  );
  const resolvedCount = outstandingFindings.filter((f) => decisionsByFinding[f.compliance_check_result.id]).length;
  const totalOutstanding = outstandingFindings.length;
  const progressPct = totalOutstanding ? Math.round((resolvedCount / totalOutstanding) * 100) : 100;

  if (status === "idle") {
    return (
      <EmptyState
        icon={<AlertTriangle size={20} aria-hidden="true" />}
        title="Nothing to review yet"
        body="Upload a contract first to generate findings."
      />
    );
  }
  if (status === "loading") {
    return (
      <EmptyState
        icon={<Loader2 size={20} className="pl-spin" aria-hidden="true" />}
        title="Loading findings…"
        body="Fetching the drift report."
      />
    );
  }
  if (status === "error") {
    return (
      <EmptyState
        icon={<AlertTriangle size={20} color="var(--danger)" aria-hidden="true" />}
        title="Couldn't load findings"
        body={error?.message || "Unknown error"}
      />
    );
  }
  if (clauses.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck size={20} color="var(--ok)" aria-hidden="true" />}
        title="No findings"
        body="This drift report has no findings to review."
      />
    );
  }

  const totalClauses = clauses.length;
  const activeClause = clauses.find((c) => c.record.id === activeFindingId) || clauses[0];
  const clauseIdx = clauses.findIndex((c) => c.record.id === activeClause.record.id);
  // Not a hook — this runs after the early returns above (idle/loading/
  // error/empty), so it can't be a useMemo (hooks must run unconditionally
  // in the same order every render); it's cheap enough (a handful of
  // findings per clause) not to need memoizing anyway.
  const currentText = effectiveClauseText(activeClause, decisionsByFinding);

  function setEditText(ccrId, text) {
    setEditTexts((t) => ({ ...t, [ccrId]: text }));
  }

  async function saveDecision(ccr, status, finalText) {
    setSaving(true);
    try {
      const { data } = await api.patch(`/findings/${ccr.id}/decision`, {
        status, final_text: finalText, report_id: driftReportId,
      });
      applyDecision(driftReportId, ccr.id, data.decision, data.updated_findings);
      setDecision(ccr.id, undefined);
    } catch (err) {
      setAlertMsg(err?.response?.data?.detail || "Couldn't save decision.");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(ccr, seedText) {
    setEditText(ccr.id, seedText);
    setDecision(ccr.id, "editing");
  }

  const overview = GROUP_ORDER.map((key) => ({ ...GROUP_META[key], count: grouped[key].length }));

  return (
    <div className="pl-page">
      <div className="pl-grid pl-grid-review" style={{ alignItems: "start" }}>

        {/* ── Left: clause list — independently scrollable, stays in view
             while the centre detail panel scrolls with the page ── */}
        <div className="pl-card pl-findings-col">
          <div style={{ padding: "13px 14px", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1, borderRadius: "10px 10px 0 0" }}>
            <h2 className="pl-h2">
              All Clauses{" "}
              <span className="pl-num" style={{ color: "var(--ink-3)", fontWeight: 700 }}>{totalClauses}</span>
            </h2>
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
                {!isCollapsed && list.map((c) => {
                  const outstandingHere = [...c.policy, ...c.precedent].filter(
                    (f) => f.compliance_check_result.result === "non_compliant"
                  );
                  const decidedHere = outstandingHere.filter((f) => decisionsByFinding[f.compliance_check_result.id]);
                  const fSeverity = key === "looks_fine" ? null : (
                    TIER_TO_SEVERITY[outstandingHere[0]?.risk_score?.tier] || null
                  );
                  // The violations are already inside the card once opened —
                  // the sidebar entry itself just needs to identify the
                  // clause: the real parent section heading as the title
                  // (e.g. "ARTICLE 1 — SUPPLY OF PRODUCTS AND SERVICES"),
                  // falling back to the finding-derived title for clauses
                  // ingested before section_heading existed.
                  const entryTitle = c.record.section_heading || clauseTitle(c);
                  return (
                    <button key={c.record.id} className="pl-finditem"
                      aria-current={c.record.id === activeClause.record.id}
                      onClick={() => setActiveFindingId(c.record.id)}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                        <span className="pl-fi-title">{entryTitle}</span>
                        <SeverityChip severity={fSeverity} />
                        {outstandingHere.length > 0 && (
                          <span className="pl-chip" style={{ color: "var(--ink-2)", background: "var(--neutral-bg)" }}>
                            {decidedHere.length}/{outstandingHere.length} resolved
                          </span>
                        )}
                      </div>
                      <div className="pl-fi-reason">{c.record.clause_text}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Centre: detail — contract clause once, then Policy Compliance
             + Inconsistencies groups, each with one card per violation ── */}
        <div className="pl-card">
          <div className="pl-detailhead">
            <button className="pl-navbtn" disabled={clauseIdx === 0}
              onClick={() => setActiveFindingId(clauses[clauseIdx - 1].record.id)} aria-label="Previous">
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <button className="pl-navbtn" disabled={clauseIdx === totalClauses - 1}
              onClick={() => setActiveFindingId(clauses[clauseIdx + 1].record.id)} aria-label="Next">
              <ChevronRight size={15} aria-hidden="true" />
            </button>
            <span className="pl-detailtitle">{activeClause.record.section_heading || clauseTitle(activeClause)}</span>
            {saving && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 12 }}>
                <Loader2 size={13} className="pl-spin" aria-hidden="true" />
                Saving — re-checking related findings…
              </span>
            )}
          </div>

          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-2)" }}>
            <div className="pl-diffcol-h">Contract Clause</div>
            <div className="pl-diffbody" style={{ margin: 0 }}><p style={{ margin: 0 }}>{currentText}</p></div>
          </div>

          <CheckTypeGroup
            label="Policy Compliance" findings={activeClause.policy} clause={activeClause}
            decisionsByFinding={decisionsByFinding} decisions={decisions}
            editTexts={editTexts} setEditText={setEditText}
            saving={saving} saveDecision={saveDecision} startEditing={startEditing} setDecision={setDecision}
          />
          <CheckTypeGroup
            label={CHECK_TYPE_LABELS.precedent} findings={activeClause.precedent} clause={activeClause}
            decisionsByFinding={decisionsByFinding} decisions={decisions}
            editTexts={editTexts} setEditText={setEditText}
            saving={saving} saveDecision={saveDecision} startEditing={startEditing} setDecision={setDecision}
          />
        </div>

        {/* ── Right: document panel ── */}
        <div>
          <div className="pl-card" style={{ marginBottom: 14 }}>
            <div className="pl-card-b">
              <div className="pl-doctitle">Contract {activeClause.record.contract_id.slice(0, 8)}</div>
              <div style={{ margin: "8px 0" }}>
                <span className="pl-status-pill">
                  <Circle size={7} fill="currentColor" aria-hidden="true" />Under Review
                </span>
              </div>
            </div>
          </div>

          <div className="pl-card" style={{ marginBottom: 14 }}>
            <div className="pl-card-h">
              <h2 className="pl-h2">Clauses Overview</h2>
              <span className="pl-num" style={{ color: "var(--ink-3)", fontSize: 12 }}>{totalClauses} total</span>
            </div>
            <div className="pl-card-b">
              <div className="pl-overviewbar">
                {overview.map((g) => (
                  <div key={g.key} style={{ flex: g.count || 1, background: g.fg }} />
                ))}
              </div>
              <div className="pl-overviewlist">
                {overview.map((g) => (
                  <div className="pl-overviewitem" key={g.key}>
                    <GroupIcon name={g.iconName} size={13} color={g.fg} aria-hidden="true" />
                    <span style={{ flex: 1, color: "var(--ink-2)" }}>{g.label}</span>
                    <strong className="pl-num">{g.count}</strong>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                {totalOutstanding === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 600 }}>All clear — nothing to resolve.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)" }}>
                      <span>Progress</span><span>{resolvedCount} of {totalOutstanding} resolved</span>
                    </div>
                    <div className="pl-progresstrack">
                      <div className="pl-progressfill" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11.5, color: "var(--ink-3)" }}>{progressPct}%</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="pl-footnote">
            <ShieldCheck size={15} color="var(--ink-2)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span>Policy is checked before precedent — always.<br />
              PolicyLens Policy Engine</span>
          </div>
        </div>
      </div>

      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
    </div>
  );
}

// One check_type's worth of findings for a clause: either a single
// read-only "Looks Fine" summary (nothing to decide — no clause repeat,
// just the reason), or one independently-decidable card per violation.
function CheckTypeGroup({ label, findings, clause, decisionsByFinding, decisions, editTexts, setEditText, saving, saveDecision, startEditing, setDecision }) {
  if (!findings || findings.length === 0) {
    return (
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-2)" }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <p style={{ color: "var(--ink-3)", fontSize: 12.5, margin: "6px 0 0" }}>Not evaluated for this clause.</p>
      </div>
    );
  }

  const violations = findings.filter((f) => f.compliance_check_result.result === "non_compliant");

  if (violations.length === 0) {
    const ccr = findings[0].compliance_check_result;
    return (
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-2)" }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <p style={{ color: "var(--ink-2)", fontSize: 12.5, margin: "6px 0 0" }}>{ccr.reason}</p>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: "1px solid var(--line-2)" }}>
      <div style={{ padding: "12px 16px 4px" }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
      </div>
      {violations.map((finding, i) => (
        <ViolationCard
          key={finding.compliance_check_result.id}
          index={i + 1} total={violations.length}
          finding={finding} clause={clause}
          decisionsByFinding={decisionsByFinding} decisions={decisions}
          editTexts={editTexts} setEditText={setEditText}
          saving={saving} saveDecision={saveDecision} startEditing={startEditing} setDecision={setDecision}
        />
      ))}
    </div>
  );
}

// One independently-decidable violation — own reason, own current-vs-
// suggested comparison, own accept/edit/reject. Numbered only when there's
// more than one for this check_type.
function ViolationCard({ index, total, finding, clause, decisionsByFinding, decisions, editTexts, setEditText, saving, saveDecision, startEditing, setDecision }) {
  const ccr = finding.compliance_check_result;
  const severity = TIER_TO_SEVERITY[finding.risk_score?.tier] || null;
  const savedDecision = decisionsByFinding[ccr.id];
  const localState = decisions[ccr.id]; // "editing" | undefined
  const matched = ccr.check_type === "policy_compliance" ? finding.matched_policy_clauses : finding.matched_precedents;
  const typeLabel = CHECK_TYPE_LABELS[ccr.check_type];
  // Frozen at savedDecision's own decided_at once this violation is
  // decided — never retroactively changes when a later sibling resolves.
  const currentText = effectiveTextFor(finding, clause, decisionsByFinding);
  const buttonsDisabled = saving || !!savedDecision;

  return (
    <div style={{ paddingTop: index > 1 ? 12 : 0, borderTop: index > 1 ? "1px dashed var(--line-2)" : undefined, marginTop: index > 1 ? 12 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)" }}>
          {total > 1 ? `${typeLabel.replace(/ies$/, "y").replace(/s$/, "")} #${index}` : typeLabel}
        </span>
        <SeverityChip severity={severity} />
        {savedDecision && (
          <span className="pl-chip" style={{ color: "var(--ink-2)", background: "var(--neutral-bg)" }}>
            {savedDecision.status}
          </span>
        )}
      </div>
      <div className="pl-reasonline" style={{ whiteSpace: "pre-line" }}>{ccr.reason}</div>

      <div style={{ display: "flex", gap: 8, padding: "0 16px 12px", flexWrap: "wrap" }}>
        <button className="pl-btn pl-btn-primary" disabled={buttonsDisabled} onClick={() => saveDecision(ccr, "accepted")}>
          <Check size={14} aria-hidden="true" /> Accept
        </button>
        <button className="pl-btn" disabled={buttonsDisabled} onClick={() => startEditing(ccr, ccr.suggested_text || currentText)}>
          <Pencil size={14} aria-hidden="true" /> Edit
        </button>
        <button className="pl-btn" disabled={buttonsDisabled} onClick={() => saveDecision(ccr, "rejected")}>
          <RotateCcw size={14} aria-hidden="true" /> Reject
        </button>
      </div>

      {localState === "editing" && (
        <div style={{ padding: "0 16px 12px" }}>
          <textarea
            className="pl-input" rows={4} style={{ width: "100%", resize: "vertical" }}
            value={editTexts[ccr.id] ?? ""} onChange={(e) => setEditText(ccr.id, e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="pl-btn pl-btn-primary" disabled={saving}
              onClick={() => saveDecision(ccr, "edited", editTexts[ccr.id])}>
              Save
            </button>
            <button className="pl-btn" onClick={() => setDecision(ccr.id, undefined)}>Cancel</button>
          </div>
        </div>
      )}

      {ccr.suggested_text && (
        <div className="pl-diffcols">
          <div>
            <div className="pl-diffcol-h">Current (in contract)</div>
            <div className="pl-diffbody">
              <p>
                <HighlightSpan
                  text={currentText}
                  span={findRobustSpan(currentText, ccr.violating_text)}
                />
              </p>
            </div>
          </div>
          <div>
            <div className="pl-diffcol-h">Suggested ({typeLabel}-aligned)</div>
            <div className="pl-diffbody">
              <p>
                <HighlightSpan
                  text={ccr.suggested_text}
                  span={findSuggestedSpan(currentText, ccr.violating_text, ccr.suggested_text)}
                  markClass="pl-mark-recommend"
                />
              </p>
            </div>
          </div>
        </div>
      )}

      {matched?.length > 0 && (
        <div style={{ padding: "0 16px 16px" }}>
          <div className="pl-diffcol-h">{ccr.check_type === "policy_compliance" ? "Matched Policy Rule" : "Matched Precedent"}</div>
          {matched.map((m) => (
            <div key={m.id} className="pl-search-hit" style={{ marginBottom: 8 }}>
              <div className="pl-search-hit-ref">{m.title || m.category}</div>
              <div className="pl-search-hit-text">{m.clause_text || m.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
