export const USE_MOCK = true;

/* ── Nav ── */
import { Upload, Search, FileCheck2, ShieldCheck } from "lucide-react";
export const NAV = [
  { key: "upload", label: "Upload", Icon: Upload },
  { key: "review", label: "Review", Icon: Search },
  { key: "final",  label: "Final",  Icon: FileCheck2 },
  { key: "policy", label: "Policy", Icon: ShieldCheck },
];

/* ── Status vocabulary ── */
export const SEVERITY = {
  High:   { fg: "var(--danger)", bg: "var(--danger-bg)" },
  Medium: { fg: "var(--warn)",   bg: "var(--warn-bg)" },
  Low:    { fg: "var(--info)",   bg: "var(--info-bg)" },
};

export const GROUP_META = {
  violations:      { key: "violations",      label: "Policy Violations", iconName: "ShieldAlert",      fg: "var(--danger)" },
  inconsistencies: { key: "inconsistencies", label: "Inconsistencies",   iconName: "ArrowLeftRight",   fg: "var(--warn)" },
  reference:       { key: "reference",       label: "Reference Only",    iconName: "FileText",          fg: "var(--info)" },
  fine:            { key: "fine",            label: "Looks Fine",        iconName: "ShieldCheck",       fg: "var(--ok)" },
};
export const GROUP_ORDER = ["violations", "inconsistencies", "reference", "fine"];

/* ── Recent uploads ── */
export const RECENT_UPLOADS = [
  { name: "Master Services Agreement.pdf",    uploaded: "2 days ago",  pages: 24, status: "Under Review", by: "Tanishqa Akude" },
  { name: "SOW – Phase 2.docx",               uploaded: "5 days ago",  pages: 18, status: "Completed",    by: "Tanishqa Akude" },
  { name: "NDA – Acme Corp.pdf",              uploaded: "7 days ago",  pages: 12, status: "Completed",    by: "Aarav Mehta" },
  { name: "Data Processing Agreement.pdf",    uploaded: "12 days ago", pages: 16, status: "Under Review", by: "Tanishqa Akude" },
];

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

/* ── Findings ── */
export const FINDINGS = [
  {
    id: "f1", group: "violations", ref: "§ 8.1", title: "Liability Cap",
    severity: "High", page: 12, reason: "Liability cap exceeds policy limit.",
    current: [
      "8.1  Limitation of Liability.",
      "Except for liability arising from (a) a party's breach of its confidentiality obligations, (b) a party's gross negligence or wilful misconduct, or (c) indemnification obligations under Section 9, neither party shall be liable to the other for any indirect, incidental, special, consequential, or punitive damages.",
      "__DEL__In no event shall either party's total aggregate liability arising out of or related to this Agreement exceed five million dollars (USD $5,000,000).__/DEL__",
      "This limitation of liability shall survive the termination or expiration of this Agreement.",
    ],
    suggested: [
      "8.1  Limitation of Liability.",
      "Except for liability arising from (a) a party's breach of its confidentiality obligations, (b) a party's gross negligence or wilful misconduct, or (c) indemnification obligations under Section 9, neither party shall be liable to the other for any indirect, incidental, special, consequential, or punitive damages.",
      "__ADD__In no event shall either party's total aggregate liability arising out of or related to this Agreement exceed one million dollars (USD $1,000,000) or the total fees paid under this Agreement in the twelve (12) months preceding the claim, whichever is less.__/ADD__",
      "This limitation of liability shall survive the termination or expiration of this Agreement.",
    ],
    changeSummary: "Liability cap reduced from $5,000,000 to $1,000,000 or fees paid in the last 12 months, whichever is less.",
  },
  {
    id: "f2", group: "violations", ref: "§ 9.3", title: "Indemnity",
    severity: "High", page: 14, reason: "Indemnity is broader than allowed under policy.",
    current: [
      "9.3  Indemnification.",
      "__DEL__Provider shall indemnify, defend, and hold harmless Client against any and all claims, losses, and liabilities of any kind, whether brought by a third party or otherwise, arising from or related to the Services.__/DEL__",
    ],
    suggested: [
      "9.3  Indemnification.",
      "__ADD__Provider shall indemnify Client against third-party claims arising from Provider's negligence or wilful misconduct in performing the Services.__/ADD__",
    ],
    changeSummary: "Indemnity scope narrowed from broad-form to third-party claims arising from negligence or wilful misconduct.",
  },
  {
    id: "f3", group: "inconsistencies", ref: "§ 4.2", title: "Termination Notice",
    severity: "Medium", page: 6, reason: "Termination notice period differs from Section 8.2.",
    current: [
      "4.2  Termination for Convenience.",
      "Either party may terminate this Agreement for convenience upon __DEL__thirty (30) days'__/DEL__ prior written notice to the other party.",
    ],
    suggested: [
      "4.2  Termination for Convenience.",
      "Either party may terminate this Agreement for convenience upon __ADD__sixty (60) days'__/ADD__ prior written notice to the other party.",
    ],
    changeSummary: "Termination notice period increased from 30 to 60 days to match Section 8.2.",
  },
  {
    id: "f4", group: "inconsistencies", ref: "§ 11.1", title: "Renewal Term",
    severity: "Medium", page: 18, reason: "Renewal term conflicts with Exhibit A.",
    current: [
      "11.1  Renewal.",
      "This Agreement shall automatically renew for successive periods of __DEL__twelve (12) months__/DEL__ unless either party gives notice of non-renewal.",
    ],
    suggested: [
      "11.1  Renewal.",
      "This Agreement shall automatically renew for successive periods of __ADD__twenty-four (24) months__/ADD__ unless either party gives notice of non-renewal.",
    ],
    changeSummary: "Renewal term extended from 12 to 24 months to align with Exhibit A.",
  },
  {
    id: "f5", group: "reference", ref: "§ 2.3", title: "Governing Law",
    severity: "Low", page: 3, reason: "Governing law matches template.",
    current: [
      "2.3  Governing Law.",
      "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.",
    ],
    suggested: [
      "2.3  Governing Law.",
      "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.",
    ],
    changeSummary: "No change. Included for reference only — matches the standard template clause.",
  },
  { id: "f6", group: "fine", ref: "§ 1.1", title: "Definitions",       severity: null, page: 1,  reason: "No issues detected.", current: ["1.1  Definitions.", "Terms used in this Agreement have the meanings set out in this Section."], suggested: null, changeSummary: null },
  { id: "f7", group: "fine", ref: "§ 3.1", title: "Payment Terms",     severity: null, page: 4,  reason: "No issues detected.", current: ["3.1  Fees and Payment.", "Client shall pay all invoiced fees within thirty (30) days of receipt."], suggested: null, changeSummary: null },
  { id: "f8", group: "fine", ref: "§ 6.1", title: "Confidentiality",   severity: null, page: 9,  reason: "No issues detected.", current: ["6.1  Confidentiality.", "Each party shall protect the other's confidential information using at least a reasonable standard of care."], suggested: null, changeSummary: null },
  { id: "f9", group: "fine", ref: "§ 10.1", title: "Notices",          severity: null, page: 17, reason: "No issues detected.", current: ["10.1  Notices.", "All notices shall be in writing and delivered to the addresses set out in Exhibit B."], suggested: null, changeSummary: null },
];

export const FINDINGS_OVERVIEW = [
  { ...GROUP_META.violations,      count: 2 },
  { ...GROUP_META.inconsistencies, count: 2 },
  { ...GROUP_META.reference,       count: 1 },
  { ...GROUP_META.fine,            count: 4 },
];

/* ── Policy Center ── */
export const POLICY_SETS = [
  { id: "ps1", name: "Procurement Policy",        isDefault: true,  version: "v4.3", updated: "May 10, 2025",  by: "Aarav Mehta",  status: "Active",   rules: 128, obligations: 34, playbooks: 6, linkedReviews: 23, desc: "Defines mandatory terms and negotiation guidelines for supplier and vendor agreements (Nexora Technologies)." },
  { id: "ps2", name: "Standard Terms Policy",     isDefault: false, version: "v2.1", updated: "Apr 28, 2025", by: "Aarav Mehta",  status: "Active",   rules: 76,  obligations: 19, playbooks: 4, linkedReviews: 41, desc: "General commercial terms applied across all non-procurement agreements." },
  { id: "ps3", name: "Data Privacy Policy",       isDefault: false, version: "v3.0", updated: "Apr 15, 2025", by: "Priya Nair",   status: "Active",   rules: 54,  obligations: 22, playbooks: 3, linkedReviews: 17, desc: "Data handling, retention, and cross-border transfer rules for personal data." },
  { id: "ps4", name: "Information Security Policy",isDefault: false,version: "v2.4", updated: "Mar 30, 2025", by: "Priya Nair",   status: "Draft",    rules: 41,  obligations: 12, playbooks: 2, linkedReviews: 5,  desc: "Security controls required of vendors handling Nexora systems or data." },
  { id: "ps5", name: "Legacy Contracting Policy", isDefault: false, version: "v1.5", updated: "Jan 12, 2025", by: "Rohan Shah",   status: "Archived", rules: 33,  obligations: 9,  playbooks: 2, linkedReviews: 2,  desc: "Superseded contracting policy, retained for historical reviews only." },
];

export const RECENT_CHANGES = [
  { title: "Updated rule – Liability Cap",     date: "May 10, 2025", by: "Aarav Mehta", desc: "Cap reduced to 1x annual fees across all agreements." },
  { title: "Added rule – Data Retention",      date: "May 2, 2025",  by: "Priya Nair",  desc: "Standardized retention period to 7 years." },
  { title: "Updated obligation – Indemnity",   date: "Apr 28, 2025", by: "Aarav Mehta", desc: "Aligned with latest legal guidance." },
];
