from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

logger = logging.getLogger(__name__)


def raise_not_found(detail: str = "Resource not found.") -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def raise_forbidden(detail: str = "Access denied.") -> None:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def raise_bad_request(detail: str = "Invalid request.") -> None:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def raise_conflict(detail: str = "Conflict.") -> None:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def raise_internal(detail: str = "Internal server error.") -> None:
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)


def handle_postgrest_exception(error: Exception, *, not_found_detail: str) -> None:
    if isinstance(error, APIError) and error.code == "PGRST116":
        raise_not_found(not_found_detail)
    logger.exception("Database error: %s", error)
    raise_internal("Database operation failed.")


def safe_single(data: Any, *, not_found_detail: str) -> dict:
    if not data:
        raise_not_found(not_found_detail)
    return data

