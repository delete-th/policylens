import { api } from "./api.js";

// Framework-free fetch sequence for a drift report — used by store.jsx's
// cache so both ReviewPage and FinalPage can share one fetch/cache instead
// of each re-fetching independently.
export async function fetchDriftReport(reportId) {
  const { data: report } = await api.get(`/drift-reports/${reportId}`);
  const { data: batch } = await api.get(`/drift-reports/${reportId}/findings`);
  return { report, findings: batch.findings, decisionsByFinding: batch.decisions };
}
