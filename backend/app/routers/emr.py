"""
EMR Router — EMR draft review, approval, ICD mappings, treatments, patient summaries.
"""

import json
import hashlib
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from ..db import get_supabase
from ..oauth2 import get_current_user, require_role
from ..ws_manager import manager
from ..models import (
    EMRDraftResponse,
    ApproveEMRRequest,
    ICDMappingResponse,
    TreatmentSuggestionResponse,
    ApproveTreatmentRequest,
    PatientSummaryResponse,
    ApproveSummaryRequest,
    PreSessionInsightResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/emr", tags=["emr"])


# ─── EMR Drafts ───

@router.get("/drafts/{session_id}", response_model=list[EMRDraftResponse])
def get_emr_drafts(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Get EMR drafts for a session."""
    try:
        result = (
            supabase.table("emr_drafts")
            .select("*")
            .eq("session_id", session_id)
            .order("version", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Failed to fetch EMR drafts: {e}")
        return []


@router.get("/draft/{draft_id}")
def get_emr_draft(
    draft_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Get a specific EMR draft with full details."""
    result = (
        supabase.table("emr_drafts")
        .select("*")
        .eq("id", draft_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="EMR draft not found.")
    return result.data


@router.post("/approve")
async def approve_emr(
    body: ApproveEMRRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Doctor approves an EMR draft → creates final immutable EMR."""
    draft = (
        supabase.table("emr_drafts")
        .select("*")
        .eq("id", body.draft_id)
        .single()
        .execute()
    )

    if not draft.data:
        raise HTTPException(status_code=404, detail="Draft not found.")

    if draft.data["status"] not in ["pending_approval", "draft"]:
        raise HTTPException(status_code=400, detail="Draft is not in reviewable state.")

    session_id = draft.data["session_id"]

    # Verify doctor owns the session
    session = (
        supabase.table("sessions")
        .select("doctor_id, patient_id")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not session.data or session.data["doctor_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    now = datetime.now(timezone.utc).isoformat()

    # Apply any edits
    if body.edits:
        supabase.table("emr_drafts").update(body.edits).eq("id", body.draft_id).execute()
        # Refresh draft
        draft = supabase.table("emr_drafts").select("*").eq("id", body.draft_id).single().execute()

    # Update draft status
    supabase.table("emr_drafts").update({
        "status": "approved",
        "reviewed_by": current_user["id"],
        "reviewed_at": now,
        "approved_at": now,
        "approved_by": current_user["id"],
        "review_notes": body.review_notes,
    }).eq("id", body.draft_id).execute()

    # Create final EMR
    emr_content = {k: v for k, v in draft.data.items() if k not in [
        "id", "session_id", "ai_job_id", "version", "status",
        "model_used", "model_version", "prompt_version",
        "generation_confidence", "raw_llm_output",
        "submitted_for_review_at", "reviewed_by", "reviewed_at",
        "review_notes", "approved_at", "approved_by",
        "created_at", "updated_at", "created_by", "modified_by",
    ]}

    content_json = json.dumps(emr_content, sort_keys=True, default=str)
    checksum = hashlib.sha256(content_json.encode()).hexdigest()

    supabase.table("final_emrs").insert({
        "session_id": session_id,
        "draft_id": body.draft_id,
        "doctor_id": current_user["id"],
        "patient_id": session.data["patient_id"],
        "emr_content": emr_content,
        "emr_checksum": checksum,
        "approved_by": current_user["id"],
    }).execute()

    # Update session status
    supabase.table("sessions").update({
        "status": "completed",
        "modified_by": current_user["id"],
    }).eq("id", session_id).execute()

    return {"status": "approved", "session_id": session_id}


# ─── ICD Mappings ───

@router.get("/icd-mappings/{session_id}", response_model=list[ICDMappingResponse])
def get_icd_mappings(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Get ICD code mappings for a session."""
    try:
        result = (
            supabase.table("icd_mappings")
            .select("*")
            .eq("session_id", session_id)
            .order("is_primary", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Failed to fetch ICD mappings: {e}")
        return []


@router.patch("/icd-mappings/{mapping_id}")
def update_icd_mapping(
    mapping_id: str,
    action: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Approve or reject an ICD mapping."""
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("icd_mappings").update({
        "approval_status": action,
        "approved_by": current_user["id"],
        "approved_at": now,
    }).eq("id", mapping_id).execute()

    return {"status": action}


# ─── Treatment Suggestions ───

@router.get("/treatments/{session_id}", response_model=list[TreatmentSuggestionResponse])
def get_treatments(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Get treatment suggestions for a session."""
    try:
        result = (
            supabase.table("treatment_suggestions")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at")
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Failed to fetch treatments: {e}")
        return []


@router.post("/treatments/approve")
def approve_treatment(
    body: ApproveTreatmentRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Approve or reject a treatment suggestion."""
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("treatment_suggestions").update({
        "approval_status": body.action,
        "approved_by": current_user["id"],
        "approved_at": now,
        "doctor_notes": body.doctor_notes,
    }).eq("id", body.suggestion_id).execute()

    return {"status": body.action}


# ─── Patient Summaries ───

@router.get("/patient-summary/{session_id}", response_model=PatientSummaryResponse)
def get_patient_summary(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get patent summary for a session. Accessible by doctor (always) and patient (only when approved + sent)."""
    # Verify session access
    session = (
        supabase.table("sessions")
        .select("doctor_id, patient_id")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not session.data or current_user["id"] not in [session.data["doctor_id"], session.data["patient_id"]]:
        raise HTTPException(status_code=403, detail="Access denied.")

    result = (
        supabase.table("patient_summaries")
        .select("*")
        .eq("session_id", session_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Summary not found.")

    # Patient can only see approved summaries that have been sent
    if current_user["role"] == "patient":
        if result.data["approval_status"] != "approved" or not result.data.get("sent_to_patient_at"):
            raise HTTPException(status_code=404, detail="Summary not available yet.")

    return result.data


@router.post("/patient-summary/approve")
async def approve_patient_summary(
    body: ApproveSummaryRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Approve and send patient summary."""
    summary = (
        supabase.table("patient_summaries")
        .select("*, sessions!patient_summaries_session_id_fkey(patient_id)")
        .eq("id", body.summary_id)
        .single()
        .execute()
    )

    if not summary.data:
        raise HTTPException(status_code=404, detail="Summary not found.")

    now = datetime.now(timezone.utc).isoformat()

    update = {
        "approval_status": "approved",
        "approved_by": current_user["id"],
        "approved_at": now,
        "sent_to_patient_at": now,
    }
    if body.edits:
        if "summary_text" in body.edits:
            update["summary_text"] = body.edits["summary_text"]

    supabase.table("patient_summaries").update(update).eq("id", body.summary_id).execute()

    # Get patient ID and notify
    session_data = summary.data.get("sessions", {})
    patient_id = session_data.get("patient_id") if session_data else None

    if patient_id:
        # Create notification
        try:
            supabase.table("notifications").insert({
                "recipient_id": patient_id,
                "sender_id": current_user["id"],
                "session_id": summary.data["session_id"],
                "notification_type": "patient_summary_available",
                "title": "Visit Summary Available",
                "body": "Your doctor has shared a summary of your recent visit.",
                "payload": {"session_id": summary.data["session_id"]},
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to persist notification: {e}")

        # WS notification
        await manager.send_to_user(patient_id, "NOTIFICATION", {
            "type": "patient_summary_available",
            "session_id": summary.data["session_id"],
            "title": "Visit Summary Available",
            "body": "Your doctor has shared a summary of your recent visit.",
        })

    return {"status": "approved", "sent": True}


# ─── Pre-Session Insights ───

@router.get("/insights/{session_id}", response_model=list[PreSessionInsightResponse])
def get_insights(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Get AI-generated document insights for a session."""
    try:
        result = (
            supabase.from_("pre_session_insights")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at")
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.error(f"Database error in get_insights: {e}")
        return []


# ─── Notifications ───

@router.get("/notifications")
def get_notifications(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get all notifications for the current user."""
    result = (
        supabase.table("notifications")
        .select("*")
        .eq("recipient_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return result.data or []


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Mark a notification as read."""
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("notifications").update({
        "is_read": True,
        "read_at": now,
    }).eq("id", notification_id).eq("recipient_id", current_user["id"]).execute()

    return {"status": "read"}
