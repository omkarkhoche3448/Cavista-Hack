from __future__ import annotations

from postgrest.exceptions import APIError
from supabase import Client


def create_document(supabase: Client, payload: dict) -> dict | None:
    result = supabase.table("medical_documents").insert(payload).execute()
    return result.data[0] if result.data else None


def list_documents_for_patient(supabase: Client, patient_id: str) -> list[dict]:
    result = (
        supabase.table("medical_documents")
        .select("*")
        .eq("patient_id", patient_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_document_by_id(supabase: Client, document_id: str) -> dict | None:
    try:
        result = (
            supabase.table("medical_documents")
            .select("*")
            .eq("id", document_id)
            .is_("deleted_at", "null")
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def soft_delete_document(supabase: Client, document_id: str, deleted_at: str) -> None:
    supabase.table("medical_documents").update({"deleted_at": deleted_at}).eq("id", document_id).execute()


def update_document_status(supabase: Client, document_id: str, updates: dict) -> None:
    supabase.table("medical_documents").update(updates).eq("id", document_id).execute()


def get_session_for_patient(supabase: Client, session_id: str, patient_id: str) -> dict | None:
    try:
        result = (
            supabase.table("sessions")
            .select("id, doctor_id, patient_id, status")
            .eq("id", session_id)
            .eq("patient_id", patient_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def list_patient_documents_for_share(supabase: Client, patient_id: str, document_ids: list[str]) -> list[dict]:
    if not document_ids:
        return []
    result = (
        supabase.table("medical_documents")
        .select("id, title, file_name, document_type, status, storage_key, ocr_extracted_text")
        .eq("patient_id", patient_id)
        .is_("deleted_at", "null")
        .in_("id", document_ids)
        .execute()
    )
    return result.data or []


def insert_session_document_share(supabase: Client, payload: dict) -> None:
    supabase.table("session_document_shares").insert(payload).execute()


def has_active_doctor_share_access(
    supabase: Client,
    *,
    doctor_id: str,
    document_id: str,
) -> bool:
    result = (
        supabase.table("session_document_shares")
        .select("id, session:sessions!session_id(doctor_id)")
        .eq("document_id", document_id)
        .is_("revoked_at", "null")
        .execute()
    )
    for row in result.data or []:
        session = row.get("session") or {}
        if session.get("doctor_id") == doctor_id:
            return True
    return False


def list_session_documents(supabase: Client, session_id: str) -> list[dict]:
    result = (
        supabase.table("session_document_shares")
        .select("document_id, created_at, medical_documents(*)")
        .eq("session_id", session_id)
        .is_("revoked_at", "null")
        .execute()
    )
    return result.data or []


def create_pre_session_insight(supabase: Client, payload: dict) -> None:
    supabase.table("pre_session_insights").insert(payload).execute()
