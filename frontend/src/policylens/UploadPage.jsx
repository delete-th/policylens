import React, { useState, useRef, useEffect } from "react";
import {
  FileText, Search, X, Check, Trash2, Loader2, AlertTriangle,
} from "lucide-react";
import { useStore } from "./store.jsx";
import { CONTRACT_CLAUSES } from "./data.jsx";
import { HighlightText, AlertModal, ConfirmModal } from "./components.jsx";
import { api } from "../services/api.js";

// Each stage below is a real, distinct network request — not a simulated
// timer. There's no sub-progress within a stage (each is one blocking
// backend call), so the elapsed-time counter is what tells you it's still
// alive, not stuck.
const STAGES = [
  { key: "checking-policy",    label: "Checking current policy version…" },
  { key: "uploading-contract", label: "Extracting, classifying, and embedding contract clauses…" },
  { key: "rechecking",         label: "Re-checking against policy — scales with contracts already stored…" },
  { key: "loading-results",    label: "Loading results…" },
];

function ProcessingStages({ stageKey, elapsed }) {
  const activeIdx = STAGES.findIndex((s) => s.key === stageKey);
  return (
    <div>
      {STAGES.map((s, i) => {
        const isDone   = activeIdx >= 0 && i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--line-2)" }}>
            <span style={{ width: 18, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {isDone   ? <Check size={14} color="var(--ok)"  strokeWidth={2.6} aria-hidden="true" />
               : isActive ? <Loader2 size={14} className="pl-spin" color="var(--ink-2)" aria-hidden="true" />
               : <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--line)", display: "inline-block" }} />}
            </span>
            <span style={{ color: isDone || isActive ? "var(--ink)" : "var(--ink-3)", fontSize: 13 }}>{s.label}</span>
          </div>
        );
      })}
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-3)" }}>
        Elapsed: {elapsed}s — the re-check stage can take a while if a lot of contracts are already stored for this policy.
      </div>
    </div>
  );
}

function useContextSearch(query) {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return CONTRACT_CLAUSES.filter(
    (c) =>
      c.text.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.ref.toLowerCase().includes(q)
  );
}

function ContextSearch() {
  const [query, setQuery]   = useState("");
  const [active, setActive] = useState(false);
  const results = useContextSearch(query);

  return (
    <div className="pl-card" style={{ marginTop: 16 }}>
      <div className="pl-card-h">
        <h2 className="pl-h2">Search document</h2>
        {query && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {results.length} {results.length === 1 ? "clause" : "clauses"} matched
          </span>
        )}
      </div>
      <div className="pl-card-b">
        <p style={{ margin: "0 0 10px", color: "var(--ink-2)", fontSize: 13 }}>
          Type a keyword or topic to locate the relevant clause in the contract —
          e.g. <em>"liability"</em>, <em>"data retention"</em>, <em>"renewal"</em>.
        </p>
        <div className="pl-search-wrap">
          <Search size={14} className="pl-search-icon" aria-hidden="true" />
          <input
            className="pl-input"
            placeholder="Search clauses — e.g. liability cap, termination notice…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(true); }}
            onFocus={() => setActive(true)}
          />
        </div>

        {active && query.trim().length > 0 && (
          <div className="pl-search-results" style={{ marginTop: 12 }}>
            {results.length === 0 ? (
              <div style={{ color: "var(--ink-3)", fontSize: 13, padding: "10px 0" }}>
                No clauses matched <strong>"{query}"</strong> — try a different keyword.
              </div>
            ) : (
              results.map((c) => (
                <div className="pl-search-hit" key={c.ref}>
                  <div className="pl-search-hit-ref">{c.ref} · {c.category}</div>
                  <div className="pl-search-hit-text">
                    <HighlightText text={c.text} query={query} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {active && !query.trim() && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["liability cap", "data retention", "termination", "renewal", "indemnity", "governing law"].map((s) => (
              <button
                key={s}
                className="pl-btn pl-btn-sm"
                onClick={() => setQuery(s)}
                style={{ fontWeight: 500 }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Upload dropzone ─────────────────────────────────────────────────────── */

function Dropzone({ onFile }) {
  const [over, setOver] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const inputRef = useRef(null);

  const handle = (f) => {
    if (!f) return;
    const ok = ["application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"].includes(f.type) || /\.(pdf|docx|doc)$/i.test(f.name);
    if (!ok) { setAlertMsg("Only PDF, DOCX or DOC files are accepted."); return; }
    if (f.size > 50 * 1024 * 1024) { setAlertMsg("File exceeds the 50 MB limit."); return; }
    onFile(f);
  };

  return (
    <div
      className="pl-drop" data-over={over}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files?.[0]); }}
    >
      <div className="pl-drop-ico"><FileText size={22} aria-hidden="true" /></div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Drag &amp; drop your file here</div>
      <div style={{ color: "var(--ink-3)", fontSize: 12.5, marginBottom: 16 }}>or</div>
      <button className="pl-btn pl-btn-primary" onClick={() => inputRef.current?.click()}>
        Browse files
      </button>
      <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-3)" }}>
        Supports PDF, DOCX, DOC · Max 50MB
      </div>
      <input
        ref={inputRef} type="file" accept=".pdf,.docx,.doc"
        style={{ display: "none" }}
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
    </div>
  );
}

/* ── Page ── */
export default function UploadPage() {
  const { setPage, uploadedFile, setUploadedFile, setDriftReportId, uploadState, setUploadState } = useStore();
  const { status, stage, result, errorMessage } = uploadState; // idle | uploading | done | error
  const setStatus       = (status) => setUploadState((s) => ({ ...s, status }));
  const setStage        = (stage) => setUploadState((s) => ({ ...s, stage }));
  const setResult       = (result) => setUploadState((s) => ({ ...s, result }));   // { driftReportId, summaryCounts }
  const setErrorMessage = (errorMessage) => setUploadState((s) => ({ ...s, errorMessage }));
  const [elapsed, setElapsed]   = useState(0);
  // Set when the server detects the uploaded contract likely already
  // exists under this playbook (409) — holds what's needed to retry with
  // force=true if the reviewer confirms they want to upload it anyway.
  const [pendingDuplicate, setPendingDuplicate] = useState(null);

  // Real policy sets to check the contract against — multiple can now
  // exist, so this is a picker rather than one hardcoded playbook id.
  const [playbooks, setPlaybooks] = useState([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState(null);
  useEffect(() => {
    api.get("/policy/playbooks").then(({ data }) => {
      setPlaybooks(data);
      setSelectedPlaybookId((current) => current || data[0]?.id || null);
    }).catch(() => {});
  }, []);

  // Contract management — real contracts uploaded against the selected set.
  const [contracts, setContracts] = useState([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [pendingContractDelete, setPendingContractDelete] = useState(null);
  const [contractAlertMsg, setContractAlertMsg] = useState(null);

  async function loadContracts(playbookId) {
    if (!playbookId) { setContracts([]); return; }
    setLoadingContracts(true);
    try {
      const { data } = await api.get("/contracts", { params: { playbook_id: playbookId } });
      setContracts(data);
    } catch {
      setContracts([]);
    } finally {
      setLoadingContracts(false);
    }
  }
  useEffect(() => { loadContracts(selectedPlaybookId); }, [selectedPlaybookId]);

  function confirmDeleteContract() {
    const target = pendingContractDelete;
    setPendingContractDelete(null);
    api.delete(`/contracts/${target.id}`)
      .then(() => loadContracts(selectedPlaybookId))
      .catch((err) => setContractAlertMsg(err?.response?.data?.detail || "Couldn't delete this contract."));
  }

  useEffect(() => {
    if (status !== "uploading") { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status]);

  async function uploadContractAndRecheck(f, playbookId, versionId, force) {
    setStage("uploading-contract");
    const formData = new FormData();
    formData.append("file", f);
    formData.append("playbook_id", playbookId);
    formData.append("policy_version_id_at_upload", versionId);
    if (force) formData.append("force", "true");
    await api.post("/contracts/upload", formData);

    setStage("rechecking");
    const { data: recheck } = await api.post("/drift/recheck", {
      playbook_id: playbookId,
      new_version_id: versionId,
    });
    setDriftReportId(recheck.drift_report_id);

    setStage("loading-results");
    const { data: report } = await api.get(`/drift-reports/${recheck.drift_report_id}`);
    setResult({ driftReportId: recheck.drift_report_id, summaryCounts: report.summary_counts });
    setStatus("done");
    loadContracts(playbookId);
  }

  async function startProcessing(f) {
    setUploadedFile(f);
    setStatus("uploading");
    setErrorMessage(null);

    let current;
    try {
      if (!selectedPlaybookId) {
        throw new Error("Select a policy set to check this contract against — import one in Policy Center first.");
      }

      setStage("checking-policy");
      const { data: versions } = await api.get(`/policy/${selectedPlaybookId}/versions`);
      current = versions.find((v) => v.is_current);
      if (!current) {
        throw new Error("No current policy version for this playbook — upload a policy first.");
      }

      await uploadContractAndRecheck(f, selectedPlaybookId, current.id, false);
    } catch (err) {
      if (err?.response?.status === 409 && current) {
        setPendingDuplicate({ file: f, playbookId: selectedPlaybookId, versionId: current.id, message: err.response.data.detail });
        return;
      }
      setErrorMessage(err?.response?.data?.detail || err.message || "Upload failed.");
      setStatus("error");
    } finally {
      setStage(null);
    }
  }

  async function confirmDuplicateUpload() {
    const pending = pendingDuplicate;
    setPendingDuplicate(null);
    setStatus("uploading");
    try {
      await uploadContractAndRecheck(pending.file, pending.playbookId, pending.versionId, true);
    } catch (err) {
      setErrorMessage(err?.response?.data?.detail || err.message || "Upload failed.");
      setStatus("error");
    } finally {
      setStage(null);
    }
  }

  function reset() {
    setUploadedFile(null);
    setResult(null);
    setErrorMessage(null);
    setStatus("idle");
  }

  const processing = status === "uploading";
  const done       = status === "done";
  const failed     = status === "error";

  return (
    <div className="pl-page">
      <div className="pl-head">
        <div>
          <h1 className="pl-h1">Upload Contract</h1>
          <p className="pl-sub">Import a contract to run policy-aware review.</p>
        </div>
      </div>

      <div className="pl-grid pl-grid-upload">
        {/* Left column */}
        <div>
          {/* Policy set picker — which real set to check this contract against */}
          {!uploadedFile && (
            <div className="pl-card" style={{ marginBottom: 16 }}>
              <div className="pl-card-b">
                <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Policy Set</label>
                {playbooks.length === 0 ? (
                  <p style={{ color: "var(--ink-2)", fontSize: 12.5, margin: 0 }}>
                    No policy sets yet — import one in Policy Center first.
                  </p>
                ) : (
                  <select
                    className="pl-select"
                    value={selectedPlaybookId || ""}
                    onChange={(e) => setSelectedPlaybookId(e.target.value)}
                  >
                    {playbooks.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.version_number ? ` (v${p.version_number})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Dropzone or file preview */}
          {!uploadedFile && !processing && !done && !failed && (
            <Dropzone onFile={startProcessing} />
          )}

          {(uploadedFile) && (
            <div className="pl-card" style={{ marginBottom: 0 }}>
              <div className="pl-card-h">
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <FileText size={16} color="var(--ink-2)" aria-hidden="true" />
                  <span style={{ fontWeight: 600 }}>{uploadedFile.name}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {(uploadedFile.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                {!processing && (
                  <button className="pl-btn pl-btn-sm" onClick={reset} aria-label="Remove file">
                    <X size={13} aria-hidden="true" /> Remove
                  </button>
                )}
              </div>
              <div className="pl-card-b">
                {processing && <ProcessingStages stageKey={stage} elapsed={elapsed} />}
                {done && (
                  <>
                    <div className="pl-upload-status" style={{ color: "var(--ok)", background: "var(--ok-bg)", borderRadius: 8, marginBottom: 12 }}>
                      <Check size={15} strokeWidth={2.6} aria-hidden="true" />
                      Review ready — {result.summaryCounts.total_findings} findings
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="pl-btn" onClick={reset}>Upload another</button>
                      <button className="pl-btn pl-btn-primary" onClick={() => setPage("review")}>
                        View Report →
                      </button>
                    </div>
                  </>
                )}
                {failed && (
                  <>
                    <div className="pl-upload-status" style={{ color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 12 }}>
                      <AlertTriangle size={15} strokeWidth={2.6} aria-hidden="true" />
                      {errorMessage}
                    </div>
                    <button className="pl-btn" onClick={reset}>Try again</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Context search — shows once a file is loaded or always in mock mode */}
          <ContextSearch />

          {/* Contract management — real contracts uploaded against the selected set */}
          <div className="pl-card" style={{ marginTop: 16 }}>
            <div className="pl-card-h">
              <h2 className="pl-h2">Contracts in this Policy Set</h2>
              <span className="pl-num" style={{ color: "var(--ink-3)", fontSize: 12 }}>{contracts.length} total</span>
            </div>
            <div className="pl-card-b pl-scroll" style={{ paddingTop: 0 }}>
              {!selectedPlaybookId ? (
                <p style={{ color: "var(--ink-2)", fontSize: 13 }}>Select a policy set to see its contracts.</p>
              ) : loadingContracts ? (
                <p style={{ color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
              ) : contracts.length === 0 ? (
                <p style={{ color: "var(--ink-2)", fontSize: 13 }}>No contracts uploaded against this set yet.</p>
              ) : (
                <table className="pl-table">
                  <thead>
                    <tr><th>Document Name</th><th>Uploaded</th><th>Clauses</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => (
                      <tr key={c.id}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                          <FileText size={15} color="var(--ink-3)" aria-hidden="true" />{c.source_file_name || c.title}
                        </td>
                        <td style={{ color: "var(--ink-2)" }}>{new Date(c.uploaded_at).toLocaleString()}</td>
                        <td className="pl-num">{c.clause_count}</td>
                        <td>
                          {c.status === "violates" && (
                            <span className="pl-chip" style={{ color: "var(--danger)", background: "var(--danger-bg)" }}>
                              Violates new policy set version
                            </span>
                          )}
                          {c.status === "valid" && (
                            <span className="pl-chip" style={{ color: "var(--ok)", background: "var(--ok-bg)" }}>
                              Valid
                            </span>
                          )}
                        </td>
                        <td>
                          <button className="pl-btn pl-btn-sm pl-btn-icon" aria-label="Delete"
                            onClick={() => setPendingContractDelete(c)}>
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div>
          <div className="pl-card" style={{ marginBottom: 16 }}>
            <div className="pl-card-h"><h2 className="pl-h2">What happens next?</h2></div>
            <div className="pl-card-b">
              <ol style={{ margin: 0, paddingLeft: 18, color: "var(--ink-2)", lineHeight: 2 }}>
                <li>We extract text and structure.</li>
                <li>We check against your policy set.</li>
                <li>You review findings and decide.</li>
                <li>Generate a clean, policy-aligned draft.</li>
              </ol>
            </div>
          </div>

          <div className="pl-card">
            <div className="pl-card-h"><h2 className="pl-h2">Tips</h2></div>
            <div className="pl-card-b" style={{ display: "grid", gap: 10 }}>
              {[
                "Upload the full agreement for best results.",
                "Scanned PDFs may take longer.",
                "Policy version used will be shown in Review.",
                "Use the document search to jump to any clause before the review.",
              ].map((t) => (
                <div key={t} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--ink-2)" }}>
                  <Check size={15} color="var(--ok)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />{t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        title="Possible duplicate contract"
        message={pendingDuplicate?.message}
        confirmLabel="Upload anyway"
        onConfirm={confirmDuplicateUpload}
        onCancel={() => { setPendingDuplicate(null); reset(); }}
      />
      <ConfirmModal
        title="Delete contract"
        message={pendingContractDelete && `Delete "${pendingContractDelete.source_file_name || pendingContractDelete.title}"?\n\nThis permanently deletes all its clauses, findings, and review decisions. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDeleteContract}
        onCancel={() => setPendingContractDelete(null)}
      />
      <AlertModal message={contractAlertMsg} onClose={() => setContractAlertMsg(null)} />
    </div>
  );
}
