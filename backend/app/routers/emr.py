"""
EMR Router — EMR draft review, approval, ICD mappings, treatments, patient summaries.
"""

import json
import hashlib
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
import uuid

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
    """
    Retrieves all EMR drafts associated with a specific session, ordered by version.
    
    Why: Doctors need to see history of drafts or the latest pending draft for review.
    Where: Called by the Doctor Dashboard -> EMR Review view.
    
    Args:
        session_id (str): Session UUID.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        list: List of EMR draft records.
    """
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
    """
    Retrieves the full details of a specific EMR draft.
    
    Why: Used to load a specific draft version for editing or final approval.
    Where: Called by the Frontend: Doctor Dashboard -> Draft Detail view.
    
    Args:
        draft_id (str): Draft UUID.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        dict: The EMR draft record.
    """
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
    """
    Finalizes an EMR draft: applies final edits, updates status to 'approved', 
    and generates an immutable final record with a cryptographic checksum.
    
    Why: Crucial for clinical record finalization, legal compliance (checksums), and session completion.
    Where: Called by the Frontend: EMR Review -> Approve & Sign button.
    
    Args:
        body (ApproveEMRRequest): draft_id, edits, and review notes.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        dict: Finalization status.
        
    Raises:
        HTTPException: 404/403/400 on invalid requests.
    """
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
    """
    Retrieves the AI-suggested ICD-10 medical code mappings for a session.
    
    Why: Assists doctors in medical coding for billing and record-keeping standardization.
    Where: Called by the Frontend: EMR Review -> Diagnosis/Codes section.
    
    Args:
        session_id (str): Session UUID.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        list: List of diagnosis-to-code mapping records.
    """
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
    """
    Records the doctor's manual approval or rejection of an AI-suggested ICD mapping.
    
    Why: Ensures clinical oversight of AI-generated billing codes.
    Where: Called by the Frontend: EMR Review -> Toggle code approval.
    
    Args:
        mapping_id (str): Mapping record UUID.
        action (str): 'approved' or 'rejected'.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        dict: The resulting status.
    """
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
    """
    Retrieves AI-suggested treatment plans for a session.
    
    Why: Provides clinical decision support to the doctor based on current guidelines.
    Where: Called by the Frontend: EMR Review -> Treatments section.
    
    Args:
        session_id (str): Session UUID.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        list: List of treatment suggestion records.
    """
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
    """
    Approves or rejects an AI-generated treatment suggestion.
    
    Why: Allows doctors to curate the final treatment plan before it's finalized.
    Where: Called by the Frontend: EMR Review -> Approve treatment.
    
    Args:
        body (ApproveTreatmentRequest): suggestion_id, action, notes.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        dict: The resulting status.
    """
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
    """
    Retrieves the patient-friendly summary for a session.
    Doctors can always see it; patients only after approval and dispatch.
    
    Why: High-level summary of visit for patients to understand their care.
    Where: Called by the Frontend: Doctor Dashboard -> Summary review, Patient Dashboard -> Visit Details.
    
    Args:
        session_id (str): Session UUID.
        current_user (dict): Injected authenticated user.
        supabase (Client): Injected Supabase client.
        
    Returns:
        dict: The summary record.
        
    Raises:
        HTTPException: 403 on unauthorized access, 404 if not found or not yet available.
    """
    # Verify session access
    try:
        session = (
            supabase.table("sessions")
            .select("doctor_id, patient_id")
            .eq("id", session_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching session for summary check: {e}")
        raise HTTPException(status_code=500, detail="Database error.")

    if not session.data or current_user["id"] not in [session.data["doctor_id"], session.data["patient_id"]]:
        raise HTTPException(status_code=403, detail="Access denied.")

    try:
        result = (
            supabase.table("patient_summaries")
            .select("*")
            .eq("session_id", session_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.warning(f"Could not fetch patient summary (table may be missing or RLS denied): {e}")
        raise HTTPException(status_code=404, detail="Summary not found.")

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
    """
    Approves the patient summary, applies doctor edits, and dispatches a notification to the patient.
    
    Why: Final step in closing the feedback loop with the patient.
    Where: Called by the Frontend: EMR Review -> Share with Patient button.
    
    Args:
        body (ApproveSummaryRequest): summary_id and optional edits.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        dict: Finalization status.
    """
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
                "id": str(uuid.uuid4()),
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
    """
    Retrieves AI-generated insights from documents shared BEFORE the session started.
    
    Why: Gives the doctor immediate clinical context before entering the room.
    Where: Called by the Frontend: Session Room -> Pre-session insights sidebar.
    
    Args:
        session_id (str): Session UUID.
        current_user (dict): Injected authenticated doctor.
        supabase (Client): Injected Supabase client.
        
    Returns:
        list: List of insight records.
    """
    try:
        result = (
            supabase.table("pre_session_insights")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at")
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.warning(f"Could not fetch insights (Table might be in 'ai' schema): {e}")
        return []


# ─── Notifications ───

@router.get("/notifications")
def get_notifications(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Fetches the 50 most recent notifications for the authenticated user.
    
    Why: Keeps users updated on session requests, shared files, and approved summaries.
    Where: Called by the Frontend: Shared -> Notification bell/dropdown.
    
    Args:
        current_user (dict): Injected authenticated user.
        supabase (Client): Injected Supabase client.
        
    Returns:
        list: List of notification records.
    """
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
    """
    Marks a specific notification as read.
    
    Why: UX hygiene — clears indicators once the user has seen the update.
    Where: Called by the Frontend when clicking a notification.
    
    Args:
        notification_id (str): Notification UUID.
        current_user (dict): Injected authenticated user.
        supabase (Client): Injected Supabase client.
        
    Returns:
        dict: Success status.
    """
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("notifications").update({
        "is_read": True,
        "read_at": now,
    }).eq("id", notification_id).eq("recipient_id", current_user["id"]).execute()

    return {"status": "read"}
