import React, { useState } from "react";
import { Download, ChevronDown } from "lucide-react";

export default function FinalPage() {
  const [confirmed, setConfirmed] = useState(false);
  const [track,     setTrack]     = useState(true);
  const [include,   setInclude]   = useState({ accepted: true, comments: true, refs: true });
  const total = 9, resolved = 9, outstanding = 0;
  const pct = resolved / total;
  const r = 54, c = 2 * Math.PI * r;

  return (
    <div className="pl-page">
      <div className="pl-head">
        <div>
          <h1 className="pl-h1">Generate Final Document</h1>
          <p className="pl-sub">Create a clean, policy-aligned version of your contract.</p>
        </div>
        <button className="pl-btn">
          <Download size={14} aria-hidden="true" /> Download preview <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="pl-grid pl-grid-final" style={{ alignItems: "start" }}>
        {/* Summary */}
        <div className="pl-card">
          <div className="pl-card-h"><h2 className="pl-h2">Summary</h2></div>
          <div className="pl-card-b">
            <div className="pl-summarystat"><span style={{ color: "var(--ink-2)" }}>Total Findings</span><strong className="pl-num">{total}</strong></div>
            <div className="pl-summarystat"><span style={{ color: "var(--ink-2)" }}>Resolved</span><strong className="pl-num" style={{ color: "var(--ok)" }}>{resolved}</strong></div>
            <div className="pl-summarystat"><span style={{ color: "var(--ink-2)" }}>Outstanding</span><strong className="pl-num">{outstanding}</strong></div>
            <div className="pl-donut">
              <svg width="132" height="132" viewBox="0 0 132 132">
                <circle cx="66" cy="66" r={r} fill="none" stroke="var(--line-2)" strokeWidth="12" />
                <circle cx="66" cy="66" r={r} fill="none" stroke="var(--ok)" strokeWidth="12"
                  strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
              </svg>
              <div className="pl-donutlabel">
                <strong>{resolved}/{total}</strong><span>Resolved</span>
              </div>
            </div>
          </div>
        </div>

        {/* Output settings */}
        <div className="pl-card">
          <div className="pl-card-h"><h2 className="pl-h2">Output Settings</h2></div>
          <div className="pl-card-b">
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 5 }}>Document Name</span>
              <input className="pl-input" defaultValue="Master Services Agreement – Final" />
            </label>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 5 }}>Version</span>
              <select className="pl-select" defaultValue="1.0">
                <option value="1.0">1.0 (Final)</option>
                <option value="0.9">0.9 (Draft)</option>
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 14 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 5 }}>Policy Set</span>
              <select className="pl-select" defaultValue="Procurement Policy v4.3">
                <option>Procurement Policy v4.3</option>
                <option>Standard Terms Policy v2.1</option>
              </select>
            </label>

            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 5 }}>Include</span>
            {[["accepted", "Accepted changes"], ["comments", "Comments & rationale"], ["refs", "Policy references"]].map(([k, label]) => (
              <label className="pl-checkbox-row" key={k}>
                <input type="checkbox" checked={include[k]}
                  onChange={(e) => setInclude((s) => ({ ...s, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Track changes</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Show edits as markup</div>
              </div>
              <button className="pl-toggle" aria-checked={track} onClick={() => setTrack((t) => !t)}>
                <span className="pl-toggle-dot" />
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="pl-card">
          <div className="pl-card-h"><h2 className="pl-h2">Preview</h2></div>
          <div className="pl-card-b">
            <div className="pl-preview">
              <h3>MASTER SERVICES AGREEMENT</h3>
              <p style={{ color: "var(--ink-2)" }}>
                This Master Services Agreement ("Agreement") is entered into between Acme Corporation
                ("Client") and [Provider Name] ("Provider").
              </p>
              <h4>1. SERVICES</h4>
              <p style={{ color: "var(--ink-2)" }}>
                Provider shall perform the services set forth in Exhibit A ("Services") in accordance
                with this Agreement.
              </p>
              <h4>2. TERM</h4>
              <p style={{ color: "var(--ink-2)" }}>
                The initial term of this Agreement shall be 24 months commencing on the Effective Date.
                {track && <span className="pl-tag-changed">Changed from 12 months · Per Policy §4.1</span>}
              </p>
              <h4>3. LIMITATION OF LIABILITY</h4>
              <p style={{ color: "var(--ink-2)" }}>
                The total liability of Provider shall not exceed $1,000,000 in the aggregate.
                {track && <span className="pl-tag-changed">Changed from $5,000,000 · Per Policy §8.1</span>}
              </p>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)" }}>
                <input type="checkbox" checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)} />
                I confirm all applicable findings are resolved
              </label>
              <button className="pl-btn pl-btn-primary" disabled={!confirmed}>
                Approve & Finalize
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
