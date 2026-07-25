"""RiskScoringNode. Score each compliance gap by tier + numeric score."""

from backend.db.client import get_supabase

_TIER_BY_RESULT = {
    "non_compliant": ("high", 0.9),
    # "uncertain" covers both genuine LLM ambiguity and the much more common
    # "no matching policy/precedent clause found" fallback — neither asserts
    # a confirmed violation, so it's scored like "compliant", not as risk.
    "uncertain": ("low", 0.1),
    "compliant": ("low", 0.1),
}


def score(compliance_check_result: dict) -> dict:
    supabase = get_supabase()
    tier, numeric_score, rationale = _tier_and_rationale(compliance_check_result)

    row = (
        supabase.table("risk_scores")
        .insert(
            {
                "compliance_check_result_id": compliance_check_result["id"],
                "tier": tier,
                "numeric_score": numeric_score,
                "rationale": rationale,
            }
        )
        .execute()
        .data[0]
    )
    return row


def update_score(compliance_check_result: dict) -> dict:
    """Cascading re-evaluation updates a compliance_check_results row in
    place (same id) rather than inserting a new one — its risk_scores row
    needs the same treatment, or the tier goes stale (e.g. still "high"
    after the finding was cascaded down to "compliant")."""
    supabase = get_supabase()
    tier, numeric_score, rationale = _tier_and_rationale(compliance_check_result)

    row = (
        supabase.table("risk_scores")
        .update({"tier": tier, "numeric_score": numeric_score, "rationale": rationale})
        .eq("compliance_check_result_id", compliance_check_result["id"])
        .execute()
        .data[0]
    )
    return row


def _tier_and_rationale(compliance_check_result: dict) -> tuple[str, float, str]:
    tier, numeric_score = _TIER_BY_RESULT[compliance_check_result["result"]]
    rationale = f"[{compliance_check_result['check_type']}] Derived from compliance result '{compliance_check_result['result']}': {compliance_check_result['reason']}"
    return tier, numeric_score, rationale
