/* ── Status vocabulary ── */
export const SEVERITY = {
  High:   { fg: "var(--danger)", bg: "var(--danger-bg)" },
  Medium: { fg: "var(--warn)",   bg: "var(--warn-bg)" },
  Low:    { fg: "var(--info)",   bg: "var(--info-bg)" },
};

// Raw check_type labels — used for inline text ("Suggested (Policy Compliance-aligned)"
// etc.), NOT the sidebar grouping below. Keep these separate: check_type is always
// literally "policy_compliance"/"precedent", but the sidebar groups by whether a
// finding is an actual flagged issue, which needs a 3rd bucket check_type doesn't have.
export const CHECK_TYPE_LABELS = {
  policy_compliance: "Policy Compliance",
  precedent: "Inconsistencies",
};

// A finding is only a real issue when the LLM said non_compliant — "uncertain"
// (including the common "no matching policy/precedent clause found" fallback)
// and "compliant" both mean "nothing confirmed wrong," so both land in Looks Fine.
export function findingGroup({ result, check_type }) {
  if (result === "non_compliant" && check_type === "policy_compliance") return "policy_violations";
  if (result === "non_compliant" && check_type === "precedent") return "inconsistencies";
  return "looks_fine";
}
export const isOutstanding = (ccr) => findingGroup(ccr) !== "looks_fine";

// One real-world contract clause can have up to two compliance_check_results
// rows (policy_compliance + precedent) — this looks at both together to
// bucket the CLAUSE, not a single row: any real issue (policy or precedent,
// or both) is "issues_found" and gets both aspects shown stacked in the
// detail panel; only a clause with no issues on either side is "looks_fine".
export function clauseGroup(ccrs) {
  const hasIssue = ccrs.some((c) => c.result === "non_compliant");
  return hasIssue ? "issues_found" : "looks_fine";
}

// A finding's display title: always name it after the closest matched
// policy/precedent clause's heading (e.g. "Assignment and Change of
// Control") when one was retrieved, whether or not the finding turned out
// to be a violation — "Looks Fine" findings should still show which real
// policy section they were checked against, not the coarse classifier
// category. Falls back to the contract clause's own title, then its coarse
// category for rows ingested before title extraction existed or when no
// clause was matched at all ("no matching policy rule found").
export function findingTitle(finding) {
  const ccr = finding.compliance_check_result;
  const matched = ccr.check_type === "policy_compliance" ? finding.matched_policy_clauses : finding.matched_precedents;
  if (matched?.[0]?.title) return matched[0].title;
  return finding.contract_record?.title || finding.contract_record?.category;
}

export const GROUP_META = {
  issues_found: { key: "issues_found", label: "Issues Found", iconName: "ShieldAlert", fg: "var(--danger)" },
  looks_fine:   { key: "looks_fine",   label: "Looks Fine",   iconName: "ShieldCheck", fg: "var(--ok)" },
};
export const GROUP_ORDER = ["issues_found", "looks_fine"];

/* ── Contract clauses used for context search simulation ── */
/* Each entry is a searchable chunk of the MSA that the reviewer can query. */
export const CONTRACT_CLAUSES = [
  { ref: "§ 1.1", category: "Definitions",         text: "Terms used in this Agreement have the meanings set out in this Section. 'Services' means the professional services described in Exhibit A. 'Deliverables' means any work product created by Provider in the performance of the Services." },
  { ref: "§ 2.1", category: "Term",                text: "The initial term of this Agreement shall be twenty-four (24) months commencing on the Effective Date, unless earlier terminated in accordance with the provisions of this Agreement." },
  { ref: "§ 3.1", category: "Payment",             text: "Client shall pay all invoiced fees within thirty (30) days of receipt of a valid invoice. Late payments shall accrue interest at a rate of 1.5% per month." },
  { ref: "§ 4.2", category: "Termination Notice",  text: "Either party may terminate this Agreement for convenience upon sixty (60) days' prior written notice to the other party. Either party may terminate immediately upon written notice if the other party materially breaches this Agreement." },
  { ref: "§ 6.1", category: "Confidentiality",     text: "Each party agrees to hold the other's Confidential Information in strict confidence and not to disclose it to any third party without prior written consent. Confidentiality obligations shall survive termination for five (5) years." },
  { ref: "§ 8.1", category: "Liability",           text: "In no event shall either party's total aggregate liability arising out of or related to this Agreement exceed five million dollars (USD $5,000,000). This limitation applies regardless of the form of action, whether in contract, tort, or otherwise." },
  { ref: "§ 9.3", category: "Indemnity",           text: "Provider shall indemnify, defend, and hold harmless Client against any and all claims, losses, and liabilities of any kind, whether brought by a third party or otherwise, arising from or related to the Services." },
  { ref: "§ 10.1", category: "IP Ownership",       text: "All intellectual property created by Provider in the course of performing the Services shall be assigned to and vest in Client upon creation. Provider hereby assigns all such IP to Client with full title guarantee." },
  { ref: "§ 11.1", category: "Renewal Term",       text: "This Agreement shall automatically renew for successive periods of twenty-four (24) months unless either party gives written notice of non-renewal at least sixty (60) days before the end of the then-current term." },
  { ref: "§ 12.2", category: "Data Retention",     text: "Provider shall retain Client personal data for a period of ten (10) years following termination of this Agreement, after which all personal data shall be securely destroyed and Provider shall provide written confirmation of such destruction." },
  { ref: "§ 13.1", category: "Governing Law",      text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles. Any disputes shall be subject to the exclusive jurisdiction of the courts of Delaware." },
  { ref: "§ 14.1", category: "Force Majeure",      text: "Neither party shall be liable for any delay or failure to perform its obligations under this Agreement to the extent that such delay or failure is caused by circumstances beyond that party's reasonable control." },
];

