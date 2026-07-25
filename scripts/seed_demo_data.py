"""Seeds a demo playbook, walks the two sample procurement policy PDFs
through /policy/upload (v4.2 then v4.3), uploads a demo contract, then
triggers /drift/recheck so the RAG evaluation path (embed -> vector search
top 5 -> LLM compliance check -> risk score) actually runs at least once.
Run the backend (`uvicorn backend.main:app`) first.
"""

import pathlib
import sys

import httpx

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from backend.db.client import get_supabase  # noqa: E402

API_BASE = "http://localhost:8000"
DEMO_DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "scripts" / "demo-data"
DEMO_POLICIES_DIR = DEMO_DATA_DIR / "policies"
DEMO_CONTRACTS_DIR = DEMO_DATA_DIR / "contracts"


def main() -> None:
    supabase = get_supabase()
    playbook = (
        supabase.table("policy_playbooks")
        .insert({"name": "Procurement Policy Demo"})
        .execute()
        .data[0]
    )
    playbook_id = playbook["id"]
    print(f"Created playbook {playbook_id}")

    with httpx.Client(base_url=API_BASE, timeout=120) as client:
        policy_version_id = None
        for filename in ["procurement-policy-v4.2.pdf", "procurement-policy-v4.3.pdf"]:
            path = DEMO_POLICIES_DIR / filename
            with path.open("rb") as f:
                response = client.post(
                    "/api/v1/policy/upload",
                    data={"playbook_id": playbook_id},
                    files={"file": (filename, f, "application/pdf")},
                )
            response.raise_for_status()
            body = response.json()
            policy_version_id = body["policy_version_id"]
            print(f"Uploaded {filename} -> {body}")

        contract_filename = "demo-supplier-agreement.docx"
        contract_path = DEMO_CONTRACTS_DIR / contract_filename
        with contract_path.open("rb") as f:
            response = client.post(
                "/api/v1/contracts/upload",
                data={"playbook_id": playbook_id, "policy_version_id_at_upload": policy_version_id},
                files={
                    "file": (
                        contract_filename,
                        f,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
            )
        response.raise_for_status()
        print(f"Uploaded {contract_filename} -> {response.json()}")

        response = client.post(
            "/api/v1/drift/recheck",
            json={"playbook_id": playbook_id, "new_version_id": policy_version_id},
        )
        response.raise_for_status()
        drift_report_id = response.json()["drift_report_id"]
        print(f"Recheck complete -> drift_report_id {drift_report_id}")

        report = client.get(f"/api/v1/drift-reports/{drift_report_id}")
        report.raise_for_status()
        report_data = report.json()
        print(f"Drift report summary: {report_data['summary_counts']}")

        for finding_id in report_data["finding_ids"]:
            detail = client.get(f"/api/v1/drift-reports/{drift_report_id}/findings/{finding_id}")
            detail.raise_for_status()
            d = detail.json()
            result = d["compliance_check_result"]["result"]
            category = d["contract_record"]["category"]
            reason = d["compliance_check_result"]["reason"]
            print(f"  [{result}] {category}: {reason}")


if __name__ == "__main__":
    main()
