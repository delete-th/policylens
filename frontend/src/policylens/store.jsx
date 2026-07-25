import { createContext, useCallback, useContext, useState } from "react";
import { fetchDriftReport } from "../services/driftReportApi.js";

const Store = createContext(null);
export const useStore = () => useContext(Store);

export function StoreProvider({ children }) {
  const [page, setPage]                       = useState("upload");
  const [activeFindingId, setActiveFindingId] = useState(null);
  // decisions here is LOCAL UI-only state for the "currently editing" toggle
  // (undefined | "editing") — the actual persisted accept/reject/edit status
  // lives on the backend (review_decisions table) and is fetched separately.
  const [decisions, setDecisions]             = useState({});
  // uploadedFile is set when the reviewer picks a contract on the Upload page.
  // The context search runs against CONTRACT_CLAUSES using this as a trigger.
  const [uploadedFile, setUploadedFile]       = useState(null);
  // Upload flow result state — lifted here (rather than local useState in
  // UploadPage) for the same reason as driftReportCache: Shell.jsx unmounts
  // UploadPage on navigation, which was wiping "done"/result and making the
  // "Upload another" / "View Report" buttons disappear when you came back.
  const [uploadState, setUploadState]         = useState({ status: "idle", stage: null, result: null, errorMessage: null });
  // drift_report_id returned by POST /policy/upload or /drift/recheck — FinalPage
  // fetches the real report from the backend using this id.
  const [driftReportId, setDriftReportId]     = useState(null);

  // Cache of fetched drift report data, keyed by reportId: { [reportId]:
  // {status, report, findings, decisionsByFinding, error} }. Lives here in
  // StoreProvider (never unmounted by Shell.jsx's conditional page
  // rendering) rather than in ReviewPage/FinalPage's local state — that's
  // what actually fixes navigating away and back re-fetching everything.
  // NOT fully immutable once generated: accepting/editing a decision can
  // trigger cascading re-evaluation on the backend (other pending findings
  // on the same clause get fresh verdicts, precedent can get entirely new
  // rows) — applyDecision below merges those in too, not just the decision
  // itself, so no TTL/refetch is needed to see them, but the cache does
  // change out from under a "finished" report.
  const [driftReportCache, setDriftReportCache] = useState({});

  const setDecision = (id, decision) =>
    setDecisions((d) => ({ ...d, [id]: decision }));

  // Stable references (empty deps, only using the functional setState form)
  // so ReviewPage/FinalPage can safely list these in a useEffect dependency
  // array without the effect re-running on every unrelated cache update.
  const loadDriftReport = useCallback((reportId, { force = false } = {}) => {
    if (!reportId) return;
    setDriftReportCache((c) => {
      const entry = c[reportId];
      if (!force && entry && (entry.status === "ready" || entry.status === "loading")) {
        return c;
      }
      fetchDriftReport(reportId)
        .then((data) => setDriftReportCache((c2) => ({ ...c2, [reportId]: { status: "ready", ...data } })))
        .catch((error) => setDriftReportCache((c2) => ({ ...c2, [reportId]: { status: "error", error } })));
      return { ...c, [reportId]: { status: "loading" } };
    });
  }, []);

  // updatedFindings (optional) are full finding objects — same shape as one
  // entry from GET /drift-reports/{id}/findings — returned by the decision
  // endpoint when cascading re-evaluation refreshed sibling findings on the
  // same clause (an existing one updated in place, e.g. a policy violation
  // resolved by the just-accepted change, or a brand-new one, e.g. a fresh
  // precedent inconsistency). Existing findings are matched and replaced by
  // compliance_check_result.id; anything not already present is appended.
  const applyDecision = useCallback((reportId, findingId, decisionRow, updatedFindings = []) => {
    setDriftReportCache((c) => {
      const entry = c[reportId];
      if (!entry) return c;
      let findings = entry.findings;
      if (updatedFindings.length) {
        const byId = new Map(findings.map((f) => [f.compliance_check_result.id, f]));
        for (const f of updatedFindings) byId.set(f.compliance_check_result.id, f);
        findings = [...byId.values()];
      }
      return {
        ...c,
        [reportId]: {
          ...entry,
          findings,
          decisionsByFinding: { ...entry.decisionsByFinding, [findingId]: decisionRow },
        },
      };
    });
  }, []);

  return (
    <Store.Provider value={{
      page, setPage,
      activeFindingId, setActiveFindingId,
      decisions, setDecision,
      uploadedFile, setUploadedFile,
      uploadState, setUploadState,
      driftReportId, setDriftReportId,
      driftReportCache, loadDriftReport, applyDecision,
    }}>
      {children}
    </Store.Provider>
  );
}
