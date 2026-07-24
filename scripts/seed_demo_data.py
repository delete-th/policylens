"""Seeds a demo playbook and walks the two sample procurement policy PDFs
through /policy/upload (v4.2 then v4.3) so there's a real drift report to
demo. Run the backend (`uvicorn backend.main:app`) first.

No demo contract files ship with this repo yet, so the resulting drift
report will show clause changes but zero findings — drop a contract PDF
into frontend/scripts/demo-data/contracts/ and extend this script to also
hit /contracts/upload once one exists.
"""

import pathlib
import sys

import httpx

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from backend.db.client import get_supabase  # noqa: E402

API_BASE = "http://localhost:8000"
DEMO_POLICIES_DIR = (
    pathlib.Path(__file__).resolve().parents[1] / "frontend" / "scripts" / "demo-data" / "policies"
)


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
        for filename in ["procurement-policy-v4.2.pdf", "procurement-policy-v4.3.pdf"]:
            path = DEMO_POLICIES_DIR / filename
            with path.open("rb") as f:
                response = client.post(
                    "/api/v1/policy/upload",
                    data={"playbook_id": playbook_id},
                    files={"file": (filename, f, "application/pdf")},
                )
            response.raise_for_status()
            print(f"Uploaded {filename} -> {response.json()}")


if __name__ == "__main__":
    main()
