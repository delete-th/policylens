"""Raw text extraction shared by PolicyIngestionNode and ContractIngestionNode.

pdfplumber primary, PyPDF2 fallback, python-docx for .docx (spec 0_tech_stack.backend.file_parsing).
"""

import io


def extract_text(file_bytes: bytes, filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".docx"):
        return _extract_docx(file_bytes)
    if lower.endswith(".pdf"):
        return _extract_pdf(file_bytes)
    raise ValueError(f"Unsupported file type: {filename}")


def _extract_pdf(file_bytes: bytes) -> str:
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        if any(p.strip() for p in pages):
            return _dedupe_running_headers(pages)
    except Exception:
        pass

    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    return _dedupe_running_headers(pages)


def _dedupe_running_headers(pages: list[str]) -> str:
    """pdfplumber/PyPDF2 extract running headers/footers (e.g. the document's
    own title reprinted on every page) as ordinary body text with no
    structural marker — left alone, the same heading line ends up duplicated
    once per page in the raw text the classifier sees. Strip lines that
    repeat identically across most pages (keeping the first occurrence)."""
    if len(pages) < 3:
        return "\n".join(pages)
    line_counts: dict[str, int] = {}
    for page in pages:
        for line in {ln.strip() for ln in page.split("\n") if ln.strip()}:
            line_counts[line] = line_counts.get(line, 0) + 1
    threshold = max(3, len(pages) // 2)
    repeated = {line for line, count in line_counts.items() if count >= threshold}
    out_pages = [pages[0]]
    for page in pages[1:]:
        out_pages.append("\n".join(ln for ln in page.split("\n") if ln.strip() not in repeated))
    return "\n".join(out_pages)


def _extract_docx(file_bytes: bytes) -> str:
    import docx

    document = docx.Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in document.paragraphs)
