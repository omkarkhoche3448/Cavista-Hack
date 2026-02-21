from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, jwk
from supabase import Client
import logging
import requests

from .config import settings
from .db import get_supabase

security = HTTPBearer()
logger = logging.getLogger(__name__)

_jwks_cache: dict | None = None


def _get_jwks() -> dict:
    """
    Fetches and caches the JSON Web Key Set (JWKS) from Supabase.
    
    Why: Required to verify JWT tokens signed by Supabase Auth using RSA.
    Where: Internal utility used by `get_current_user` for token verification.
    
    Returns:
        dict: The JWKS dictionary containing public keys.
    """
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
    """
    Extracts the correct signing key from JWKS for a specific JWT.
    
    Why: A token's 'kid' (Key ID) header tells us which public key was used to sign it.
    Where: Used by `get_current_user` during token verification.
    
    Args:
        token (str): The raw JWT string.
        
    Returns:
        jwk.JWK: The constructed signing key if found, else None.
    """
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
    """
    FastAPI dependency to authenticate users via Supabase JWT.
    
    Why: Protects routes by ensuring the requester is logged in and has a valid session.
    Where: Used as a dependency in almost all protected API endpoints.
    
    Args:
        credentials (HTTPAuthorizationCredentials): Bearer token from the Auth header.
        supabase (Client): Supabase client for secondary profile lookup.
        
    Returns:
        dict: The user's profile record from the 'users' table.
        
    Raises:
        HTTPException: 401 if token invalid/expired, 404 if profile missing.
    """
    token = credentials.credentials

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
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
    """
    Higher-order dependency for Role-Based Access Control (RBAC).
    
    Why: Restricts access to specific endpoints based on user role (e.g., 'doctor' only).
    Where: Used in routers where specific actions are role-protected (e.g., creating clinical sessions).
    
    Args:
        required_role (str): The role string required (e.g., "doctor", "patient").
        
    Returns:
        function: A dependency function for use with FastAPI `Depends()`.
    """
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
