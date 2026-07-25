"""Supabase Storage wrapper for original policy PDFs (see spec workflow step 2:
user should be able to view the PDF they uploaded, not just its extracted text).
"""

from backend.db.client import get_supabase

POLICY_PDF_BUCKET = "policy-pdfs"


def upload_pdf(bucket: str, path: str, file_bytes: bytes) -> str:
    supabase = get_supabase()
    supabase.storage.from_(bucket).upload(
        path, file_bytes, {"content-type": "application/pdf", "upsert": "true"}
    )
    return path


def get_signed_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    supabase = get_supabase()
    result = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    return result["signedURL"]
