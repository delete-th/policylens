import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useStore } from "./store.jsx";
import { isOutstanding } from "./data.jsx";
import { api } from "../services/api.js";

// Track Changes is purely an annotation overlay — it never affects which
// text is shown (that's already correct: original unless accepted/edited),
// only whether a badge explaining *why* a clause changed is visible.
const CHANGE_ANNOTATION = {
  policy_compliance: "Approved — aligned to policy compliance",
  precedent: "Approved — aligned to precedent",
};

// policyVersion isn't part of the shared driftReportCache (store.jsx) since
// it's only used here, not by ReviewPage — kept as a small local fetch
// instead of growing the shared cache shape for a single extra query.
function usePolicyVersion(report) {
  const [policyVersion, setPolicyVersion] = useState(null);

  useEffect(() => {
    if (!report) { setPolicyVersion(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: versions } = await api.get(`/policy/${report.playbook_id}/versions`);
        if (!cancelled) setPolicyVersion(versions.find((v) => v.id === report.new_version_id) || null);
      } catch {
        if (!cancelled) setPolicyVersion(null);
      }
    })();
    return () => { cancelled = true; };
  }, [report]);

  return policyVersion;
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="pl-card">
      <div className="pl-empty">
        <div className="pl-empty-ico">{icon}</div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <p style={{ color: "var(--ink-2)", marginTop: 6 }}>{body}</p>
      </div>
    </div>
  );
}

export default function FinalPage() {
  const { driftReportId, driftReportCache, loadDriftReport } = useStore();
  const [trackChanges, setTrackChanges] = useState(true);
  const [finalDocument, setFinalDocument] = useState(null);
  const [finalDocError, setFinalDocError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { if (driftReportId) loadDriftReport(driftReportId); }, [driftReportId, loadDriftReport]);

  const entry = driftReportCache[driftReportId] ?? { status: "idle" };
  const { status, error, report } = entry;
  const findings = entry.findings ?? [];
  const decisionsByFinding = entry.decisionsByFinding ?? {};
  const policyVersion = usePolicyVersion(status === "ready" ? report : null);

  async function handleConfirm() {
    const contractId = findings[0]?.contract_record?.contract_id;
    if (!contractId) return;
    setConfirming(true);
    setFinalDocError(null);
    try {
      const { data } = await api.get(`/drift-reports/${driftReportId}/final-document`, {
        params: { contract_id: contractId },
      });
      setFinalDocument(data);
    } catch (err) {
      setFinalDocError(err?.response?.data?.detail || err.message || "Couldn't assemble final document.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="pl-page">
      <div className="pl-head">
        <div>
          <h1 className="pl-h1">Drift Report Preview</h1>
          <p className="pl-sub">Read-only preview of contract clauses against the current policy.</p>
        </div>
      </div>

      {status === "idle" && (
        <EmptyState
          icon={<AlertTriangle size={20} aria-hidden="true" />}
          title="Nothing to preview yet"
          body="Run a policy upload or recheck to generate a drift report first."
        />
      )}

      {status === "loading" && (
        <EmptyState
          icon={<Loader2 size={20} className="pl-spin" aria-hidden="true" />}
          title="Loading drift report…"
          body="Fetching findings and policy details."
        />
      )}

      {status === "error" && (
        <EmptyState
          icon={<AlertTriangle size={20} color="var(--danger)" aria-hidden="true" />}
          title="Couldn't load this drift report"
          body={error?.message || "Unknown error"}
        />
      )}

      {status === "ready" && (
        <ReadyPreview
          report={report}
          findings={findings}
          decisionsByFinding={decisionsByFinding}
          policyVersion={policyVersion}
          trackChanges={trackChanges}
          setTrackChanges={setTrackChanges}
          finalDocument={finalDocument}
          finalDocError={finalDocError}
          confirming={confirming}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

function ReadyPreview({ report, findings, decisionsByFinding, policyVersion, trackChanges, setTrackChanges, finalDocument, finalDocError, confirming, onConfirm }) {
  // "Resolved" tracks real reviewer action, not just "not a violation" —
  // Looks Fine findings never asserted a problem, so they're excluded
  // entirely (not counted as resolved, not counted as outstanding) rather
  // than inflating the resolved count before anything's actually been
  // reviewed.
  const outstandingFindings = findings.filter((f) => isOutstanding(f.compliance_check_result));
  const totalOutstanding = outstandingFindings.length;
  const resolved = outstandingFindings.filter((f) => decisionsByFinding[f.compliance_check_result.id]).length;
  const outstanding = totalOutstanding - resolved;
  const pct = totalOutstanding ? resolved / totalOutstanding : 1;
  const r = 54, c = 2 * Math.PI * r;

  // Each contract clause gets two findings (policy_compliance + precedent
  // checks) — group back down to one entry per clause, in the document's
  // own order, instead of rendering every finding as its own block (which
  // duplicated every clause and ignored source order).
  const previewClauses = useMemo(() => {
    const byRecord = new Map();
    for (const f of findings) {
      const rec = f.contract_record;
      if (!rec) continue;
      if (!byRecord.has(rec.id)) byRecord.set(rec.id, { record: rec, findings: [] });
      byRecord.get(rec.id).findings.push(f);
    }
    return [...byRecord.values()].sort(
      (a, b) => (a.record.sequence_order ?? 0) - (b.record.sequence_order ?? 0)
    );
  }, [findings]);

  return (
    <div className="pl-grid pl-grid-final" style={{ alignItems: "start" }}>
      {/* Summary */}
      <div className="pl-card">
        <div className="pl-card-h"><h2 className="pl-h2">Summary</h2></div>
        <div className="pl-card-b">
          {totalOutstanding === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "var(--ok)", fontWeight: 600, fontSize: 13 }}>
              All clear — nothing to resolve.
            </div>
          ) : (
            <>
              <div className="pl-summarystat"><span style={{ color: "var(--ink-2)" }}>Needs Review</span><strong className="pl-num">{totalOutstanding}</strong></div>
              <div className="pl-summarystat"><span style={{ color: "var(--ink-2)" }}>Resolved</span><strong className="pl-num" style={{ color: "var(--ok)" }}>{resolved}</strong></div>
              <div className="pl-summarystat"><span style={{ color: "var(--ink-2)" }}>Outstanding</span><strong className="pl-num">{outstanding}</strong></div>
              <div className="pl-donut">
                <svg width="132" height="132" viewBox="0 0 132 132">
                  <circle cx="66" cy="66" r={r} fill="none" stroke="var(--line-2)" strokeWidth="12" />
                  <circle cx="66" cy="66" r={r} fill="none" stroke="var(--ok)" strokeWidth="12"
                    strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
                </svg>
                <div className="pl-donutlabel">
                  <strong>{resolved}/{totalOutstanding}</strong><span>Resolved</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI Summary + Report metadata — stacked in one grid column so the
          AI Summary card is exactly as wide as Report Details, not full page width */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {report.ai_summary && (
          <div className="pl-card">
            <div className="pl-card-h"><h2 className="pl-h2">AI Summary</h2></div>
            <div className="pl-card-b">
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13, lineHeight: 1.6 }}>{report.ai_summary}</p>
            </div>
          </div>
        )}
        <div className="pl-card">
          <div className="pl-card-h"><h2 className="pl-h2">Report Details</h2></div>
          <div className="pl-card-b">
            <div className="pl-metarow">
              <span style={{ color: "var(--ink-2)" }}>Report ID</span>
              <span style={{ fontWeight: 600 }}>{report.id.slice(0, 8)}</span>
            </div>
            <div className="pl-metarow">
              <span style={{ color: "var(--ink-2)" }}>Generated</span>
              <span style={{ fontWeight: 600 }}>{new Date(report.generated_at).toLocaleString()}</span>
            </div>
            <div className="pl-metarow">
              <span style={{ color: "var(--ink-2)", flexShrink: 0 }}>Policy Set</span>
              <span style={{ fontWeight: 600, textAlign: "right", wordBreak: "break-word" }}>
                {policyVersion ? `${policyVersion.source_file_name} · v${policyVersion.version_number}` : "—"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Track changes</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Show policy-aligned annotations</div>
              </div>
              <button className="pl-toggle" aria-checked={trackChanges} onClick={() => setTrackChanges((t) => !t)}>
                <span className="pl-toggle-dot" />
              </button>
            </div>

            <button className="pl-btn pl-btn-primary" style={{ width: "100%", marginTop: 14 }}
              disabled={confirming || !findings[0]?.contract_record?.contract_id} onClick={onConfirm}>
              {confirming ? "Assembling…" : finalDocument ? "Refresh Final Document" : "Confirm & View Final Document"}
            </button>
            {finalDocError && (
              <div className="pl-upload-status" style={{ color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 8, marginTop: 10 }}>
                {finalDocError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="pl-card">
        <div className="pl-card-h">
          <h2 className="pl-h2">{finalDocument ? "Final Document (accepted changes applied)" : "Contract Preview"}</h2>
        </div>
          <div className="pl-card-b">
            <div className="pl-preview">
              {finalDocument ? (
                finalDocument.length === 0 ? (
                  <p style={{ color: "var(--ink-2)" }}>No clauses in this contract.</p>
                ) : (
                  finalDocument.map((clause, i) => (
                    <div key={i} style={{ marginBottom: 18 }}>
                      <h4>{clause.section_heading || clause.title}</h4>
                      <p style={{ color: "var(--ink-2)" }}>{clause.final_text}</p>
                      {trackChanges && clause.was_changed && (
                        <span className="pl-tag-changed">{CHANGE_ANNOTATION[clause.changed_by] || "Approved change"}</span>
                      )}
                    </div>
                  ))
                )
              ) : (
                <>
                  {previewClauses.length === 0 && <p style={{ color: "var(--ink-2)" }}>No clauses to preview.</p>}
                  {previewClauses.map(({ record, findings: clauseFindings }) => {
                    const flaggedFindings = clauseFindings.filter((f) => isOutstanding(f.compliance_check_result));
                    return (
                      <div key={record.id} style={{ marginBottom: 18 }}>
                        <h4>{record.section_heading || record.title || record.category}</h4>
                        <p style={{ color: "var(--ink-2)" }}>{record.clause_text}</p>
                        {trackChanges && flaggedFindings.map((f) => {
                          const policyText = f.matched_policy_clauses?.[0]?.clause_text;
                          return (
                            <span key={f.compliance_check_result.id} className="pl-tag-changed">
                              {policyText ? `Policy requires: ${policyText}` : f.compliance_check_result.reason}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
