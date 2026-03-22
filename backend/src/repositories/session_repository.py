from __future__ import annotations

from postgrest.exceptions import APIError
from supabase import Client


def get_patient_by_email(supabase: Client, email: str) -> dict | None:
    try:
        result = (
            supabase.table("users")
            .select("id, email, first_name, last_name, role")
            .eq("email", email)
            .eq("role", "patient")
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def create_session_record(supabase: Client, payload: dict) -> dict | None:
    result = supabase.table("sessions").insert(payload).execute()
    return result.data[0] if result.data else None


def get_pending_session_for_patient(supabase: Client, session_id: str, patient_id: str) -> dict | None:
    try:
        result = (
            supabase.table("sessions")
            .select("*")
            .eq("id", session_id)
            .eq("patient_id", patient_id)
            .eq("status", "pending")
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def get_doctor_session_by_status(
    supabase: Client,
    session_id: str,
    doctor_id: str,
    status: str | None = None,
) -> dict | None:
    query = (
        supabase.table("sessions")
        .select("*")
        .eq("id", session_id)
        .eq("doctor_id", doctor_id)
    )
    if status:
        query = query.eq("status", status)
    try:
        result = query.single().execute()
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def get_session_by_id(supabase: Client, session_id: str) -> dict | None:
    try:
        result = supabase.table("sessions").select("*").eq("id", session_id).single().execute()
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def update_session(supabase: Client, session_id: str, updates: dict) -> dict | None:
    result = supabase.table("sessions").update(updates).eq("id", session_id).execute()
    return result.data[0] if result.data else None


def insert_session_state_history(supabase: Client, payload: dict) -> None:
    supabase.table("session_state_history").insert(payload).execute()


def insert_notification(supabase: Client, payload: dict) -> None:
    supabase.table("notifications").insert(payload).execute()


def list_sessions_for_user(
    supabase: Client,
    *,
    user_id: str,
    role: str,
    status_filter: str | None,
    start: int,
    end: int,
) -> tuple[list[dict], int]:
    query = supabase.table("sessions").select(
        "*, doctor:users!doctor_id(first_name, last_name, email), "
        "patient:users!patient_id(first_name, last_name, email)",
        count="exact",
    )
    query = query.eq("doctor_id", user_id) if role == "doctor" else query.eq("patient_id", user_id)
    if status_filter:
        query = query.eq("status", status_filter)
    result = query.order("created_at", desc=True).range(start, end).execute()
    return result.data or [], result.count or 0


def list_patients_for_doctor(supabase: Client, doctor_id: str) -> list[dict]:
    result = (
        supabase.table("sessions")
        .select(
            "patient_id, status, created_at, "
            "patient:users!patient_id(first_name, last_name, email, phone, date_of_birth)"
        )
        .eq("doctor_id", doctor_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def doctor_has_session_with_patient(supabase: Client, doctor_id: str, patient_id: str) -> bool:
    result = (
        supabase.table("sessions")
        .select("id")
        .eq("doctor_id", doctor_id)
        .eq("patient_id", patient_id)
        .limit(1)
        .execute()
    )
    return bool(result.data)


def get_patient_base_info(supabase: Client, patient_id: str) -> dict | None:
    try:
        result = (
            supabase.table("users")
            .select("id, first_name, last_name, email, phone, date_of_birth, gender")
            .eq("id", patient_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def get_patient_profile(supabase: Client, patient_id: str) -> dict:
    result = supabase.table("patient_profiles").select("*").eq("user_id", patient_id).execute()
    return result.data[0] if result.data else {}


def get_session_with_participants(supabase: Client, session_id: str) -> dict | None:
    try:
        result = (
            supabase.table("sessions")
            .select(
                "*, doctor:users!doctor_id(first_name, last_name, email), "
                "patient:users!patient_id(first_name, last_name, email, gender, date_of_birth)"
            )
            .eq("id", session_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def get_session_participants(supabase: Client, session_id: str) -> dict | None:
    try:
        result = (
            supabase.table("sessions")
            .select("doctor_id, patient_id")
            .eq("id", session_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def get_transcript_chunks(supabase: Client, session_id: str) -> list[dict]:
    result = (
        supabase.table("transcript_chunks")
        .select("*")
        .eq("session_id", session_id)
        .order("chunk_index")
        .execute()
    )
    return result.data or []


def get_transcript_chunks_for_pipeline(supabase: Client, session_id: str) -> list[dict]:
    result = (
        supabase.table("transcript_chunks")
        .select("raw_text, speaker_role, chunk_index")
        .eq("session_id", session_id)
        .order("chunk_index")
        .execute()
    )
    return result.data or []


def insert_transcript_chunk(supabase: Client, payload: dict) -> None:
    supabase.table("transcript_chunks").insert(payload).execute()


def create_final_transcript(supabase: Client, payload: dict) -> None:
    supabase.table("final_transcripts").insert(payload).execute()


def get_session_notifications_for_user(supabase: Client, session_id: str, user_id: str) -> list[dict]:
    result = (
        supabase.table("notifications")
        .select("*")
        .eq("session_id", session_id)
        .eq("recipient_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_session_processing_context(supabase: Client, session_id: str) -> dict | None:
    try:
        result = (
            supabase.table("sessions")
            .select(
                "chief_complaint, ended_at, recording_url, patient_id, "
                "patient:users!patient_id(first_name, last_name, gender, date_of_birth), "
                "doctor:users!doctor_id(first_name, last_name)"
            )
            .eq("id", session_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def get_pre_session_insights(supabase: Client, session_id: str) -> list[dict]:
    result = (
        supabase.table("pre_session_insights")
        .select("summary, key_findings, medications_found, allergies_found")
        .eq("session_id", session_id)
        .execute()
    )
    return result.data or []
