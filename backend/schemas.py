from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class ChangeType(str, Enum):
    added = "added"
    removed = "removed"
    modified = "modified"


class ComplianceResult(str, Enum):
    compliant = "compliant"
    non_compliant = "non_compliant"
    uncertain = "uncertain"


class RiskTier(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


# ── Data models (spec section 4_data_models) ────────────────────────────


class PolicyVersion(BaseModel):
    id: UUID
    playbook_id: UUID
    version_number: int
    is_current: bool
    source_file_name: str
    created_at: datetime


class PolicyClause(BaseModel):
    id: UUID
    policy_version_id: UUID
    category: str
    clause_text: str
    extracted_rule: dict[str, Any] | None = None
    embedding: list[float] | None = None


class ClauseChange(BaseModel):
    id: UUID
    playbook_id: UUID
    old_version_id: UUID | None = None
    new_version_id: UUID
    change_type: ChangeType
    category: str
    old_text: str | None = None
    new_text: str | None = None
    old_rule: dict[str, Any] | None = None
    new_rule: dict[str, Any] | None = None


class ContractRecord(BaseModel):
    id: UUID
    contract_id: UUID
    playbook_id: UUID
    policy_version_id_at_upload: UUID
    category: str
    clause_text: str
    extracted_rule: dict[str, Any] | None = None
    embedding: list[float] | None = None


class ComplianceCheckResult(BaseModel):
    id: UUID
    contract_record_id: UUID
    checked_against_version_id: UUID
    result: ComplianceResult
    reason: str
    matched_policy_clause_ids: list[UUID] = []
    matched_precedent_ids: list[UUID] = []
    created_at: datetime


class RiskScore(BaseModel):
    id: UUID
    compliance_check_result_id: UUID
    tier: RiskTier
    numeric_score: float
    rationale: str


class DriftReport(BaseModel):
    id: UUID
    playbook_id: UUID
    old_version_id: UUID
    new_version_id: UUID
    generated_at: datetime
    summary_counts: dict[str, Any]
    finding_ids: list[UUID]


# ── API request/response shapes (spec section 5_api_endpoints) ──────────


class PolicyUploadResponse(BaseModel):
    policy_version_id: UUID
    drift_report_id: UUID


class ContractUploadResponse(BaseModel):
    contract_record_ids: list[UUID]


class DriftRecheckRequest(BaseModel):
    playbook_id: UUID
    old_version_id: UUID | None = None
    new_version_id: UUID | None = None


class DriftRecheckResponse(BaseModel):
    drift_report_id: UUID


class FindingDetailResponse(BaseModel):
    compliance_check_result: ComplianceCheckResult
    risk_score: RiskScore
    clause_change: ClauseChange | None = None
    contract_record: ContractRecord
    matched_policy_clauses: list[PolicyClause] = []
    matched_precedents: list[ContractRecord] = []
