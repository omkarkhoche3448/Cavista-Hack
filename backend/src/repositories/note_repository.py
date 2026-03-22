from __future__ import annotations

from postgrest.exceptions import APIError
from supabase import Client


def create_note(supabase: Client, payload: dict) -> dict | None:
    result = supabase.table("doctor_notes").insert(payload).execute()
    return result.data[0] if result.data else None


def list_notes(supabase: Client, doctor_id: str, patient_id: str | None, session_id: str | None) -> list[dict]:
    query = supabase.table("doctor_notes").select("*").eq("doctor_id", doctor_id)
    if patient_id:
        query = query.eq("patient_id", patient_id)
    if session_id:
        query = query.eq("session_id", session_id)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


def get_note(supabase: Client, note_id: str, doctor_id: str) -> dict | None:
    try:
        result = (
            supabase.table("doctor_notes")
            .select("*")
            .eq("id", note_id)
            .eq("doctor_id", doctor_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def update_note(supabase: Client, note_id: str, doctor_id: str, payload: dict) -> dict | None:
    result = (
        supabase.table("doctor_notes")
        .update(payload)
        .eq("id", note_id)
        .eq("doctor_id", doctor_id)
        .execute()
    )
    return result.data[0] if result.data else None


def delete_note(supabase: Client, note_id: str, doctor_id: str) -> None:
    supabase.table("doctor_notes").delete().eq("id", note_id).eq("doctor_id", doctor_id).execute()
