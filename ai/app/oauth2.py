"""
Auth helpers for the AI service.

The AI service is designed to be deployable without a database dependency. The previous
OAuth/JWT implementation relied on SQLAlchemy models and DB sessions and would crash
on import when those were removed.

If you want to protect the AI service, set `AI_API_KEY` in `ai/.env` and use the
`require_api_key` dependency in routes.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

from .config import Settings


_settings = Settings()
_api_key_header = APIKeyHeader(name=_settings.AI_API_KEY_HEADER, auto_error=False)


def require_api_key(api_key: str | None = Depends(_api_key_header)) -> None:
    """
    Optional API-key protection.

    - If `AI_API_KEY` is empty, authentication is disabled and the dependency allows all requests.
    - If set, requests must include the matching header (default: `X-API-Key`).
    """
    configured_key = (_settings.AI_API_KEY or "").strip()
    if not configured_key:
        return
    if not api_key or api_key.strip() != configured_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
