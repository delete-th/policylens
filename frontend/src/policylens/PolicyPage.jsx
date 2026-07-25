import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, FolderInput, Plus, Info, Pencil, Trash2, Eye } from "lucide-react";
import { PdfViewerModal, AlertModal, ConfirmModal } from "./components.jsx";
import { api } from "../services/api.js";

const CHANGE_TYPE_LABEL = { added: "Added", modified: "Amended", removed: "Removed" };

export default function PolicyPage() {
  const [tab, setTab] = useState("Policy Sets");

  const [playbooks, setPlaybooks] = useState([]);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const [clauses, setClauses] = useState([]);
  const [changes, setChanges] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | uploading | error
  const [uploadError, setUploadError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [alertMsg, setAlertMsg] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // playbook object | null
  const fileInputRef = useRef(null);

  async function loadPlaybooks({ keepSelection = true } = {}) {
    setLoadingPlaybooks(true);
    try {
      const { data } = await api.get("/policy/playbooks");
      setPlaybooks(data);
      setSelectedId((current) => {
        if (keepSelection && current && data.some((p) => p.id === current)) return current;
        return data[0]?.id ?? null;
      });
    } catch {
      // non-fatal — sets list just stays empty
    } finally {
      setLoadingPlaybooks(false);
    }
  }

  useEffect(() => { loadPlaybooks(); }, []);

  useEffect(() => {
    if (!selectedId) { setClauses([]); setChanges([]); return; }
    let cancelled = false;
    setLoadingDetail(true);
    (async () => {
      try {
        const [{ data: clausesData }, { data: changesData }] = await Promise.all([
          api.get(`/policy/playbooks/${selectedId}/clauses`),
          api.get(`/policy/playbooks/${selectedId}/changes`),
        ]);
        if (!cancelled) { setClauses(clausesData); setChanges(changesData); }
      } catch {
        if (!cancelled) { setClauses([]); setChanges([]); }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  async function handleUploadFile(file) {
    if (!file) return;
    setUploadStatus("uploading");
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // No playbook_id — the server decides whether this document's clauses
      // match an existing policy set or need a brand-new one.
      await api.post("/policy/upload", formData);
      await loadPlaybooks();
      setUploadStatus("idle");
    } catch (err) {
      setUploadStatus("error");
      setUploadError(err?.response?.data?.detail || err.message || "Upload failed.");
    }
  }

  async function handleViewPdf(versionId) {
    try {
      const { data } = await api.get(`/policy/${versionId}/pdf-url`);
      setPdfUrl(data.url);
    } catch (err) {
      setAlertMsg(err?.response?.data?.detail || "No PDF available for this version.");
    }
  }

  function handleDelete(playbook) {
    setPendingDelete(playbook);
  }

  async function confirmDelete() {
    const playbook = pendingDelete;
    setPendingDelete(null);
    try {
      await api.delete(`/policy/playbooks/${playbook.id}`);
      if (selectedId === playbook.id) setSelectedId(null);
      await loadPlaybooks({ keepSelection: false });
    } catch (err) {
      setAlertMsg(err?.response?.data?.detail || "Couldn't delete this policy set.");
    }
  }

  const selected = playbooks.find((p) => p.id === selectedId) || null;

  return (
    <div className="pl-page">
      <div className="pl-head">
        <div>
          <h1 className="pl-h1">Policy Center</h1>
          <p className="pl-sub">Manage policy sets and rules that power reviews.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pl-btn" onClick={() => fileInputRef.current?.click()} disabled={uploadStatus === "uploading"}>
            <FolderInput size={14} aria-hidden="true" /> {uploadStatus === "uploading" ? "Uploading…" : "Import Policy Set"}
          </button>
          <button className="pl-btn pl-btn-primary" disabled title="Not available in this demo — use Import Policy Set to upload a PDF">
            <Plus size={14} aria-hidden="true" /> New Policy Set
          </button>
          <input
            ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={(e) => { handleUploadFile(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
      </div>

      {uploadStatus === "error" && (
        <div className="pl-upload-status" style={{ color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 16 }}>
          {uploadError}
        </div>
      )}

      <div className="pl-policytabs">
        {["Policy Sets", "Rules Library", "Obligations", "Playbooks"].map((t) => (
          <button key={t} className="pl-policytab" aria-selected={tab === t}
            onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab !== "Policy Sets" ? (
        <div className="pl-card"><div className="pl-empty">
          <div className="pl-empty-ico"><Info size={20} aria-hidden="true" /></div>
          <div style={{ fontWeight: 700 }}>{tab}</div>
          <p style={{ color: "var(--ink-2)", marginTop: 6 }}>Nothing to show here yet in this scope.</p>
        </div></div>
      ) : loadingPlaybooks ? (
        <div className="pl-card"><div className="pl-empty">
          <p style={{ color: "var(--ink-2)" }}>Loading policy sets…</p>
        </div></div>
      ) : playbooks.length === 0 ? (
        <div className="pl-card"><div className="pl-empty">
          <div className="pl-empty-ico"><FolderInput size={20} aria-hidden="true" /></div>
          <div style={{ fontWeight: 700 }}>No policy sets yet</div>
          <p style={{ color: "var(--ink-2)", marginTop: 6 }}>Import a policy PDF above to create the first one.</p>
        </div></div>
      ) : (
        <>
          <div className="pl-grid pl-grid-policy" style={{ alignItems: "start", marginBottom: 18 }}>
            <div className="pl-card">
              <div className="pl-card-b pl-scroll" style={{ paddingTop: 8 }}>
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Policy Set</th><th>Version</th><th>Last Updated</th>
                      <th>Rules</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {playbooks.map((p) => (
                      <tr key={p.id} className="pl-row-click" onClick={() => setSelectedId(p.id)}>
                        <td>
                          <span style={{ fontWeight: 700 }}>{p.name}</span>
                          {p.id === selectedId && (
                            <span className="pl-chip" style={{ marginLeft: 8, color: "var(--info)", background: "var(--info-bg)" }}>Viewing</span>
                          )}
                        </td>
                        <td className="pl-num">{p.version_number ? `v${p.version_number}` : "—"}</td>
                        <td style={{ color: "var(--ink-2)" }}>{p.last_updated ? new Date(p.last_updated).toLocaleDateString() : "—"}</td>
                        <td className="pl-num">{p.clause_count}</td>
                        <td style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                          <button className="pl-btn pl-btn-sm pl-btn-icon" aria-label="Edit" disabled
                            title="Not available in this demo" onClick={(e) => e.stopPropagation()}>
                            <Pencil size={13} aria-hidden="true" />
                          </button>
                          <button className="pl-btn pl-btn-sm pl-btn-icon" aria-label="Delete"
                            onClick={(e) => { e.stopPropagation(); handleDelete(p); }}>
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                          <ChevronRight size={14} color="var(--ink-3)" aria-hidden="true" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pl-card">
              <div className="pl-card-b">
                {selected ? (
                  <>
                    <h2 className="pl-h2">{selected.name}</h2>
                    <div style={{ color: "var(--ink-3)", fontSize: 11.5, margin: "8px 0 10px" }}>
                      {selected.source_file_name}
                    </div>

                    <div className="pl-eyebrow" style={{ marginTop: 4 }}>Stats</div>
                    <div className="pl-statgrid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                      <div className="pl-statbox"><strong>v{selected.version_number ?? "—"}</strong><span>Current Version</span></div>
                      <div className="pl-statbox"><strong>{selected.clause_count}</strong><span>Clauses</span></div>
                    </div>

                    <div className="pl-metarow" style={{ marginTop: 14 }}>
                      <span style={{ color: "var(--ink-2)" }}>Last Updated</span>
                      <span style={{ fontWeight: 600 }}>
                        {selected.last_updated ? new Date(selected.last_updated).toLocaleString() : "—"}
                      </span>
                    </div>

                    {selected.current_version_id && (
                      <button className="pl-btn" style={{ width: "100%", marginTop: 12 }}
                        onClick={() => handleViewPdf(selected.current_version_id)}>
                        <Eye size={13} aria-hidden="true" /> View PDF
                      </button>
                    )}
                  </>
                ) : (
                  <p style={{ color: "var(--ink-2)", fontSize: 13 }}>Select a policy set to view its details.</p>
                )}
              </div>
            </div>
          </div>

          {/* Real clauses inside the selected policy set */}
          <div className="pl-card" style={{ marginBottom: 18 }}>
            <div className="pl-card-h">
              <h2 className="pl-h2">{selected ? `Policy Clauses — ${selected.name}` : "Policy Clauses"}</h2>
              <span className="pl-num" style={{ color: "var(--ink-3)", fontSize: 12 }}>{clauses.length} total</span>
            </div>
            <div className="pl-card-b pl-scroll" style={{ paddingTop: 0 }}>
              {loadingDetail ? (
                <p style={{ color: "var(--ink-2)", fontSize: 13 }}>Loading…</p>
              ) : clauses.length === 0 ? (
                <p style={{ color: "var(--ink-2)", fontSize: 13 }}>No clauses found for this set.</p>
              ) : (
                <table className="pl-table">
                  <thead>
                    <tr><th>Title</th><th>Category</th><th>Clause</th><th>Last Updated</th></tr>
                  </thead>
                  <tbody>
                    {clauses.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{c.title || c.category}</td>
                        <td style={{ color: "var(--ink-2)" }}>{c.category}</td>
                        <td style={{ color: "var(--ink-2)", maxWidth: 420 }}>
                          {c.clause_text?.length > 140 ? `${c.clause_text.slice(0, 140)}…` : c.clause_text}
                        </td>
                        <td style={{ color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                          {c.amended_at ? new Date(c.amended_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="pl-card">
            <div className="pl-card-h">
              <h2 className="pl-h2">Recent Changes{selected ? ` (${selected.name})` : ""}</h2>
            </div>
            <div className="pl-card-b">
              {changes.length === 0 ? (
                <p style={{ color: "var(--ink-2)", fontSize: 13 }}>No amendments recorded for this set yet.</p>
              ) : (
                changes.map((c) => (
                  <div className="pl-changelog-item" key={c.id}>
                    <div className="pl-changelog-ico"><Info size={13} aria-hidden="true" /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                        <strong style={{ fontSize: 13 }}>{CHANGE_TYPE_LABEL[c.change_type]} — {c.category}</strong>
                        <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                          {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                        </span>
                      </div>
                      {c.change_type === "modified" && (
                        <div style={{ color: "var(--ink-2)", fontSize: 12.5, marginTop: 2 }}>
                          "{c.old_text?.slice(0, 80)}…" → "{c.new_text?.slice(0, 80)}…"
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <PdfViewerModal url={pdfUrl} onClose={() => setPdfUrl(null)} />
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <ConfirmModal
        title="Delete policy set"
        message={pendingDelete && `Delete "${pendingDelete.name}"?\n\nThis permanently deletes all its policy versions and clauses, plus every contract, review decision, and drift report ever checked against it. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
