from __future__ import annotations

from fastapi import UploadFile

from .errors import raise_bad_request


def csv_to_set(value: str) -> set[str]:
    return {item.strip() for item in value.split(",") if item.strip()}


def ensure_file_constraints(
    *,
    file: UploadFile,
    content: bytes,
    max_bytes: int,
    allowed_mime_types: set[str],
    empty_error: str,
) -> None:
    if not content:
        raise_bad_request(empty_error)
    if len(content) > max_bytes:
        raise_bad_request(f"File size exceeds limit of {max_bytes} bytes.")
    mime_type = (file.content_type or "").lower()
    if mime_type and mime_type not in allowed_mime_types:
        raise_bad_request(f"Unsupported file type: {mime_type}")

