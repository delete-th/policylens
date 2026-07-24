"""RiskScoringNode. Score each compliance gap by tier + numeric score."""

from backend.db.client import get_supabase

_TIER_BY_RESULT = {
    "non_compliant": ("high", 0.9),
    "uncertain": ("medium", 0.5),
    "compliant": ("low", 0.1),
}


def score(compliance_check_result: dict) -> dict:
    supabase = get_supabase()
    tier, numeric_score = _TIER_BY_RESULT[compliance_check_result["result"]]
    rationale = f"Derived from compliance result '{compliance_check_result['result']}': {compliance_check_result['reason']}"

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
