from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from supabase import Client
import logging

from .config import settings
from .db import get_supabase

security = HTTPBearer()
logger = logging.getLogger(__name__)


from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, jwk
from jose.utils import base64url_decode
from supabase import Client
import logging
import requests

from .config import settings
from .db import get_supabase

security = HTTPBearer()
logger = logging.getLogger(__name__)

# Cache the JWKS public key for ES256 verification
_jwks_cache: dict | None = None


def _get_jwks() -> dict:
    """Fetch and cache the Supabase JWKS public keys."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    logger.info("Fetched Supabase JWKS keys")
    return _jwks_cache


def _get_signing_key(token: str):
    """Find the matching JWKS key for the token's kid."""
    jwks = _get_jwks()
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            return jwk.construct(key_data, algorithm=header["alg"])
    return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    supabase: Client = Depends(get_supabase),
) -> dict:
    """Verify Supabase JWT and return user data from public.users."""
    token = credentials.credentials

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Check token header to decide verification strategy
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            # Legacy: signed with JWT secret
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
            # ES256 / asymmetric: verify with JWKS public key
            signing_key = _get_signing_key(token)
            if signing_key is None:
                logger.error("No matching JWKS key found for kid=%s", header.get("kid"))
                raise credentials_exception
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                audience="authenticated",
            )

        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as e:
        logger.error(f"JWT decode failed: {e}")
        raise credentials_exception

    result = (
        supabase.table("users")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found",
        )

    return result.data


def require_role(required_role: str):
    """Dependency factory that checks if user has the required role."""
    async def role_checker(
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        if current_user["role"] != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires '{required_role}' role.",
            )
        return current_user
    return role_checker
