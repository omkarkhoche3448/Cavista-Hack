from __future__ import annotations

import base64
import json
from functools import lru_cache

from fastapi import HTTPException
from supabase import create_client, Client

from .config import settings


def _jwt_role(jwt_token: str) -> str | None:
    """
    Best-effort decode of the JWT payload to determine `role` without verifying.
    """
    try:
        parts = jwt_token.split(".")
        if len(parts) < 2:
            return None
        payload_b64 = parts[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8"))
        return payload.get("role")
    except Exception:
        return None


def _get_service_role_key() -> str:
    key = (settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY or "").strip()
    if not key:
        raise HTTPException(
            status_code=500,
            detail="Supabase is not configured: set SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_KEY.",
        )
    role = _jwt_role(key)
    if role and role != "service_role":
        # Your schema uses RLS policies requiring custom settings; anon/auth keys will fail on inserts/selects.
        raise HTTPException(
            status_code=500,
            detail=(
                f"Supabase key role is '{role}', but backend requires a service-role key to bypass RLS. "
                "Set SUPABASE_SERVICE_ROLE_KEY to your project's service_role key (do NOT use anon here)."
            ),
        )
    return key


@lru_cache(maxsize=1)
def _get_supabase_admin_client() -> Client:
    return create_client(settings.SUPABASE_URL, _get_service_role_key())


def get_supabase() -> Client:
    """
    FastAPI dependency returning a Supabase client configured for backend DB operations.

    Note: The DB schema in `backend/db/schema.sql` enables RLS. Server-side operations should
    use the service-role key and enforce authorization in the API layer.
    """
    return _get_supabase_admin_client()
