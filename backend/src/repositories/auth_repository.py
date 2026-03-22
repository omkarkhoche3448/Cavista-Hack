from __future__ import annotations

from postgrest.exceptions import APIError
from supabase import Client


def get_user_by_id(supabase: Client, user_id: str) -> dict | None:
    try:
        result = (
            supabase.table("users")
            .select("*")
            .eq("id", user_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def provision_user_from_claims(supabase: Client, claims: dict) -> dict | None:
    user_id = claims.get("sub")
    email = claims.get("email")
    if not user_id or not email:
        return None

    user_metadata = claims.get("user_metadata") or {}
    raw_user_metadata = claims.get("raw_user_meta_data") or {}

    def _pick(*keys: str) -> str | None:
        for key in keys:
            value = user_metadata.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            value = raw_user_metadata.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    role = _pick("role")
    if role not in {"doctor", "patient", "admin"}:
        role = "patient"

    full_name = _pick("name")
    first_name = _pick("first_name", "given_name")
    last_name = _pick("last_name", "family_name")

    if not first_name and full_name:
        parts = full_name.split()
        first_name = parts[0]
        if len(parts) > 1 and not last_name:
            last_name = " ".join(parts[1:])

    payload = {
        "id": user_id,
        "email": email,
        "role": role,
        "first_name": first_name or "User",
        "last_name": last_name or "Account",
    }

    result = (
        supabase.table("users")
        .upsert(payload, on_conflict="id")
        .execute()
    )
    return result.data[0] if result.data else None


def get_user_profile_for_login(supabase: Client, user_id: str) -> dict | None:
    try:
        result = (
            supabase.table("users")
            .select("role, first_name, last_name")
            .eq("id", user_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def update_user_profile(supabase: Client, user_id: str, updates: dict) -> dict | None:
    result = supabase.table("users").update(updates).eq("id", user_id).execute()
    return result.data[0] if result.data else None


def get_doctor_profile(supabase: Client, user_id: str) -> dict | None:
    try:
        result = (
            supabase.table("doctor_profiles")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def get_patient_profile(supabase: Client, user_id: str) -> dict | None:
    try:
        result = (
            supabase.table("patient_profiles")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def create_doctor_profile(supabase: Client, data: dict) -> dict | None:
    result = supabase.table("doctor_profiles").insert(data).execute()
    return result.data[0] if result.data else None


def upsert_patient_profile(supabase: Client, user_id: str, patient_data: dict) -> dict | None:
    existing = (
        supabase.table("patient_profiles")
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        result = (
            supabase.table("patient_profiles")
            .update(patient_data)
            .eq("user_id", user_id)
            .execute()
        )
    else:
        result = supabase.table("patient_profiles").insert(patient_data).execute()
    return result.data[0] if result.data else None
