import React, { useState, useRef } from "react";
import {
  FileText, Search, X, Check, MoreVertical, Loader2, AlertTriangle,
} from "lucide-react";
import { useStore } from "./store.jsx";
import { RECENT_UPLOADS, CONTRACT_CLAUSES } from "./data.jsx";
import { HighlightText } from "./components.jsx";

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
  const inputRef = useRef(null);

  const handle = (f) => {
    if (!f) return;
    const ok = ["application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"].includes(f.type) || /\.(pdf|docx|doc)$/i.test(f.name);
    if (!ok) { alert("Only PDF, DOCX or DOC files are accepted."); return; }
    if (f.size > 50 * 1024 * 1024) { alert("File exceeds the 50 MB limit."); return; }
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
    </div>
  );
}

/* ── Processing simulation ── */
const STAGES = [
  "Extracting text and structure…",
  "Segmenting clauses…",
  "Checking against Procurement Policy v4.3…",
  "Scoring risk on each finding…",
  "Generating findings report…",
];

function ProcessingBar({ stage }) {
  return (
    <div style={{ marginTop: 12 }}>
      {STAGES.map((s, i) => {
        const done   = i < stage;
        const active = i === stage;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--line-2)" }}>
            <span style={{ width: 18, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {done   ? <Check size={14} color="var(--ok)"  strokeWidth={2.6} aria-hidden="true" />
               : active ? <Loader2 size={14} className="pl-spin" color="var(--ink-2)" aria-hidden="true" />
               : <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--line)", display: "inline-block" }} />}
            </span>
            <span style={{ color: done || active ? "var(--ink)" : "var(--ink-3)", fontSize: 13 }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ── */
export default function UploadPage() {
  const { setPage, uploadedFile, setUploadedFile } = useStore();
  const [stage,   setStage]   = useState(-1);  // -1 = idle, 0-4 = processing, 5 = done
  const timerRef = React.useRef(null);

  function startProcessing(f) {
    setUploadedFile(f);
    setStage(0);
    let s = 0;
    timerRef.current = setInterval(() => {
      s += 1;
      if (s >= STAGES.length) {
        clearInterval(timerRef.current);
        setStage(STAGES.length); // done
      } else {
        setStage(s);
      }
    }, 700);
  }

  function reset() {
    clearInterval(timerRef.current);
    setUploadedFile(null);
    setStage(-1);
  }

  const processing = stage >= 0 && stage < STAGES.length;
  const done       = stage === STAGES.length;

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
          {/* Dropzone or file preview */}
          {!uploadedFile && !processing && !done && (
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
                {processing && <ProcessingBar stage={stage} />}
                {done && (
                  <>
                    <div className="pl-upload-status" style={{ color: "var(--ok)", background: "var(--ok-bg)", borderRadius: 8, marginBottom: 12 }}>
                      <Check size={15} strokeWidth={2.6} aria-hidden="true" />
                      Review ready — 9 findings across 4 categories
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="pl-btn" onClick={reset}>Upload another</button>
                      <button className="pl-btn pl-btn-primary" onClick={() => setPage("review")}>
                        Open Review →
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Context search — shows once a file is loaded or always in mock mode */}
          <ContextSearch />

          {/* Recent uploads table */}
          <div className="pl-card" style={{ marginTop: 16 }}>
            <div className="pl-card-h"><h2 className="pl-h2">Recent Uploads</h2></div>
            <div className="pl-card-b pl-scroll" style={{ paddingTop: 0 }}>
              <table className="pl-table">
                <thead>
                  <tr>
                    <th>Document Name</th><th>Uploaded</th>
                    <th>Pages</th><th>Status</th><th>Uploaded By</th><th />
                  </tr>
                </thead>
                <tbody>
                  {RECENT_UPLOADS.map((u) => (
                    <tr key={u.name} className="pl-row-click" onClick={() => setPage("review")}>
                      <td style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                        <FileText size={15} color="var(--ink-3)" aria-hidden="true" />{u.name}
                      </td>
                      <td style={{ color: "var(--ink-2)" }}>{u.uploaded}</td>
                      <td className="pl-num">{u.pages}</td>
                      <td>
                        <span className="pl-dot-status" style={{ background: u.status === "Completed" ? "var(--ok)" : "var(--warn)" }} />{" "}
                        <span style={{ color: "var(--ink-2)" }}>{u.status}</span>
                      </td>
                      <td style={{ color: "var(--ink-2)" }}>{u.by}</td>
                      <td>
                        <button className="pl-btn pl-btn-sm pl-btn-icon" aria-label="More"
                          onClick={(e) => e.stopPropagation()}>
                          <MoreVertical size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    </div>
  );
}
