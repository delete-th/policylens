import React, { useState } from "react";
import { ChevronRight, FolderInput, Plus, Info } from "lucide-react";
import { POLICY_SETS, RECENT_CHANGES } from "./data.jsx";
import { StatusChip } from "./components.jsx";

export default function PolicyPage() {
  const [tab,        setTab]        = useState("Policy Sets");
  const [selectedId, setSelectedId] = useState("ps1");
  const selected = POLICY_SETS.find((p) => p.id === selectedId);

  return (
    <div className="pl-page">
      <div className="pl-head">
        <div>
          <h1 className="pl-h1">Policy Center</h1>
          <p className="pl-sub">Manage policy sets and rules that power reviews.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pl-btn"><FolderInput size={14} aria-hidden="true" /> Import Policy Set</button>
          <button className="pl-btn pl-btn-primary"><Plus size={14} aria-hidden="true" /> New Policy Set</button>
        </div>
      </div>

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
      ) : (
        <>
          <div className="pl-grid pl-grid-policy" style={{ alignItems: "start", marginBottom: 18 }}>
            <div className="pl-card">
              <div className="pl-card-b pl-scroll" style={{ paddingTop: 8 }}>
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Policy Set</th><th>Version</th><th>Last Updated</th>
                      <th>Updated By</th><th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {POLICY_SETS.map((p) => (
                      <tr key={p.id} className="pl-row-click" onClick={() => setSelectedId(p.id)}>
                        <td>
                          <span style={{ fontWeight: 700 }}>{p.name}</span>
                          {p.isDefault && (
                            <span className="pl-chip" style={{ marginLeft: 8, color: "var(--info)", background: "var(--info-bg)" }}>Default</span>
                          )}
                        </td>
                        <td className="pl-num">{p.version}</td>
                        <td style={{ color: "var(--ink-2)" }}>{p.updated}</td>
                        <td style={{ color: "var(--ink-2)" }}>{p.by}</td>
                        <td><StatusChip status={p.status} /></td>
                        <td><ChevronRight size={14} color="var(--ink-3)" aria-hidden="true" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pl-card">
              <div className="pl-card-b">
                <h2 className="pl-h2">{selected.name} {selected.version}</h2>
                <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
                  {selected.isDefault && (
                    <span className="pl-chip" style={{ color: "var(--info)", background: "var(--info-bg)" }}>Default</span>
                  )}
                  <StatusChip status={selected.status} />
                </div>
                <div style={{ color: "var(--ink-3)", fontSize: 11.5, marginBottom: 10 }}>
                  Last updated {selected.updated} by {selected.by}
                </div>
                <p style={{ color: "var(--ink-2)", fontSize: 13 }}>{selected.desc}</p>

                <div className="pl-eyebrow" style={{ marginTop: 16 }}>Stats</div>
                <div className="pl-statgrid">
                  <div className="pl-statbox"><strong>{selected.rules}</strong><span>Rules</span></div>
                  <div className="pl-statbox"><strong>{selected.obligations}</strong><span>Obligations</span></div>
                  <div className="pl-statbox"><strong>{selected.playbooks}</strong><span>Playbooks</span></div>
                </div>

                <div className="pl-eyebrow" style={{ marginTop: 16 }}>Linked Reviews</div>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  Used in <strong className="pl-num" style={{ color: "var(--ink)" }}>{selected.linkedReviews}</strong> reviews
                </div>
              </div>
            </div>
          </div>

          <div className="pl-card">
            <div className="pl-card-h">
              <h2 className="pl-h2">Recent Changes ({POLICY_SETS[0].name} {POLICY_SETS[0].version})</h2>
              <button className="pl-btn pl-btn-sm">
                View all changes <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>
            <div className="pl-card-b">
              {RECENT_CHANGES.map((c) => (
                <div className="pl-changelog-item" key={c.title}>
                  <div className="pl-changelog-ico"><Info size={13} aria-hidden="true" /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                      <strong style={{ fontSize: 13 }}>{c.title}</strong>
                      <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>{c.date} · {c.by}</span>
                    </div>
                    <div style={{ color: "var(--ink-2)", fontSize: 12.5, marginTop: 2 }}>{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
