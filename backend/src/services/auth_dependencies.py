from __future__ import annotations

import logging
import time
from typing import Any

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwk, jwt
from supabase import Client

from ..config.database import get_supabase
from ..config.settings import settings
from ..repositories import auth_repository

logger = logging.getLogger(__name__)
security = HTTPBearer()

_jwks_cache: dict[str, Any] | None = None
_jwks_cache_at: float = 0
_JWKS_CACHE_TTL_SECONDS = 300


def _get_jwks() -> dict[str, Any]:
    global _jwks_cache, _jwks_cache_at
    if _jwks_cache and time.time() - _jwks_cache_at < _JWKS_CACHE_TTL_SECONDS:
        return _jwks_cache
    url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    _jwks_cache = response.json()
    _jwks_cache_at = time.time()
    return _jwks_cache


def _decode_token(token: str) -> dict:
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", "HS256")

    if alg == "HS256":
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )

    key_id = header.get("kid")
    jwks = _get_jwks()
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == key_id:
            signing_key = jwk.construct(key_data, algorithm=header.get("alg", "RS256"))
            return jwt.decode(token, signing_key, algorithms=[alg], audience="authenticated")
    raise JWTError("Signing key not found")


def decode_ws_token(token: str) -> dict:
    try:
        payload = _decode_token(token)
    except (JWTError, requests.RequestException) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from error

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user token payload.",
        )
    return payload


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    supabase: Client = Depends(get_supabase),
) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = _decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except (JWTError, requests.RequestException) as error:
        logger.warning("Token decode failed: %s", error)
        raise credentials_exception

    user = auth_repository.get_user_by_id(supabase, user_id)
    if not user:
        logger.info("User profile missing for %s. Attempting auto-provision from token claims.", user_id)
        user = auth_repository.provision_user_from_claims(supabase, payload)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found.",
        )
    return user


def require_role(required_role: str):
    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires '{required_role}' role.",
            )
        return current_user

    return role_checker
