from __future__ import annotations

from postgrest.exceptions import APIError
from supabase import Client


def list_emr_drafts_for_session(supabase: Client, session_id: str) -> list[dict]:
    result = (
        supabase.table("emr_drafts")
        .select("*")
        .eq("session_id", session_id)
        .order("version", desc=True)
        .execute()
    )
    return result.data or []


def get_emr_draft_by_id(supabase: Client, draft_id: str) -> dict | None:
    try:
        result = supabase.table("emr_drafts").select("*").eq("id", draft_id).single().execute()
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def update_emr_draft(supabase: Client, draft_id: str, updates: dict) -> dict | None:
    result = supabase.table("emr_drafts").update(updates).eq("id", draft_id).execute()
    return result.data[0] if result.data else None


def create_final_emr(supabase: Client, payload: dict) -> dict | None:
    result = supabase.table("final_emrs").insert(payload).execute()
    return result.data[0] if result.data else None


def get_final_emr_for_session(supabase: Client, session_id: str) -> dict | None:
    try:
        result = (
            supabase.table("final_emrs")
            .select("id, pdf_s3_key")
            .eq("session_id", session_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def list_pre_session_insights(supabase: Client, session_id: str) -> list[dict]:
    result = (
        supabase.table("pre_session_insights")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return result.data or []


def list_notifications_for_user(supabase: Client, user_id: str, limit: int = 50) -> list[dict]:
    result = (
        supabase.table("notifications")
        .select("*")
        .eq("recipient_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def mark_notification_read(supabase: Client, notification_id: str, user_id: str, now_iso: str) -> None:
    (
        supabase.table("notifications")
        .update({"is_read": True, "read_at": now_iso})
        .eq("id", notification_id)
        .eq("recipient_id", user_id)
        .execute()
    )


def get_patient_summary(supabase: Client, session_id: str) -> dict | None:
    try:
        result = (
            supabase.table("patient_summaries")
            .select("*")
            .eq("session_id", session_id)
            .single()
            .execute()
        )
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def list_icd_mappings_for_session(supabase: Client, session_id: str) -> list[dict]:
    result = (
        supabase.table("icd_mappings")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_icd_mapping_by_id(supabase: Client, mapping_id: str) -> dict | None:
    try:
        result = supabase.table("icd_mappings").select("*").eq("id", mapping_id).single().execute()
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def update_icd_mapping(supabase: Client, mapping_id: str, updates: dict) -> dict | None:
    result = supabase.table("icd_mappings").update(updates).eq("id", mapping_id).execute()
    return result.data[0] if result.data else None


def list_treatment_suggestions_for_session(supabase: Client, session_id: str) -> list[dict]:
    result = (
        supabase.table("treatment_suggestions")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_treatment_suggestion_by_id(supabase: Client, suggestion_id: str) -> dict | None:
    try:
        result = supabase.table("treatment_suggestions").select("*").eq("id", suggestion_id).single().execute()
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def update_treatment_suggestion(supabase: Client, suggestion_id: str, updates: dict) -> dict | None:
    result = supabase.table("treatment_suggestions").update(updates).eq("id", suggestion_id).execute()
    return result.data[0] if result.data else None


def get_patient_summary_by_id(supabase: Client, summary_id: str) -> dict | None:
    try:
        result = supabase.table("patient_summaries").select("*").eq("id", summary_id).single().execute()
        return result.data
    except APIError as error:
        if error.code == "PGRST116":
            return None
        raise


def update_patient_summary(supabase: Client, summary_id: str, updates: dict) -> dict | None:
    result = supabase.table("patient_summaries").update(updates).eq("id", summary_id).execute()
    return result.data[0] if result.data else None


def approve_patient_summary_for_session(
    supabase: Client,
    *,
    session_id: str,
    approved_by: str,
    now_iso: str,
) -> None:
    (
        supabase.table("patient_summaries")
        .update(
            {
                "approval_status": "approved",
                "approved_by": approved_by,
                "approved_at": now_iso,
                "sent_to_patient_at": now_iso,
            }
        )
        .eq("session_id", session_id)
        .in_("approval_status", ["pending", "draft"])
        .execute()
    )
