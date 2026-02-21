"""
EMR Router — EMR draft review, approval, ICD mappings, treatments, patient summaries.
"""

import json
import hashlib
import logging
import asyncio
import traceback
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from supabase import Client
import uuid

from ..db import get_supabase
from ..oauth2 import get_current_user, require_role
from postgrest.exceptions import APIError
from ..ws_manager import manager
from ..services import ai_service, s3_service
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
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Finalizes an EMR draft: applies final edits, updates status to 'approved', 
    generates an immutable final record with a cryptographic checksum,
    and triggers PDF generation via the external AI service.
    
    Why: Crucial for clinical record finalization, legal compliance (checksums), and session completion.
    Where: Called by the Frontend: EMR Review -> Approve & Sign button.
    
    Args:
        body (ApproveEMRRequest): draft_id, edits, and review notes.
        background_tasks (BackgroundTasks): FastAPI background task runner.
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

    # Create final EMR snapshot
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

    final_emr_result = supabase.table("final_emrs").insert({
        "session_id": session_id,
        "draft_id": body.draft_id,
        "doctor_id": current_user["id"],
        "patient_id": session.data["patient_id"],
        "emr_content": emr_content,
        "emr_checksum": checksum,
        "approved_by": current_user["id"],
    }).execute()

    final_emr_id = final_emr_result.data[0]["id"] if final_emr_result.data else None

    # Update session status to completed
    supabase.table("sessions").update({
        "status": "completed",
        "modified_by": current_user["id"],
    }).eq("id", session_id).execute()

    # ── Trigger PDF Generation in Background ──
    background_tasks.add_task(
        generate_and_upload_emr_pdf,
        session_id=session_id,
        draft_id=body.draft_id,
        final_emr_id=final_emr_id,
        patient_id=session.data["patient_id"],
        doctor_id=current_user["id"]
    )

    return {"status": "approved", "session_id": session_id}


async def generate_and_upload_emr_pdf(session_id: str, draft_id: str, final_emr_id: str, patient_id: str, doctor_id: str):
    """
    Background worker to call AI PDF service, upload to S3, and update DB.
    
    Why: Keeps approved_emr fast and avoids blocking on external HTTP calls.
    """
    from ..db import get_supabase
    supabase = get_supabase()
    
    logger.info(f"[PDF-BG] Starting PDF generation for session {session_id}")
    try:
        # 1. Gather transcript
        transcript = ""
        chunks = (
            supabase.table("transcript_chunks")
            .select("raw_text, speaker_role")
            .eq("session_id", session_id)
            .order("chunk_index")
            .execute()
        )
        transcript = "\n".join(f"[{c['speaker_role']}]: {c['raw_text']}" for c in (chunks.data or []))

        # 2. Gather report summaries
        report_summaries = []
        insights_data = (
            supabase.table("pre_session_insights")
            .select("summary, key_findings")
            .eq("session_id", session_id)
            .execute()
        )
        for insight in (insights_data.data or []):
            parts = [insight.get("summary")] if insight.get("summary") else []
            findings = insight.get("key_findings")
            if findings:
                parts.append(f"Key findings: {'; '.join(findings) if isinstance(findings, list) else findings}")
            if parts:
                report_summaries.append(". ".join(parts))

        # 3. Gather names
        patient_name = "Unknown"
        doctor_name = "Unknown"
        sess_info = (
            supabase.table("sessions")
            .select("doctor:users!doctor_id(first_name, last_name), patient:users!patient_id(first_name, last_name)")
            .eq("id", session_id)
            .single()
            .execute()
        )
        if sess_info.data:
            doc = sess_info.data.get("doctor", {}) or {}
            pat = sess_info.data.get("patient", {}) or {}
            doctor_name = f"Dr. {doc.get('first_name', '')} {doc.get('last_name', '')}".strip()
            patient_name = f"{pat.get('first_name', '')} {pat.get('last_name', '')}".strip()

        # 4. Fetch EMR content
        emr_content = {}
        if final_emr_id:
            final_res = supabase.table("final_emrs").select("emr_content").eq("id", final_emr_id).single().execute()
            if final_res.data:
                emr_content = final_res.data.get("emr_content", {})

        # 5. Call external AI (Offload blocking request to a thread)
        pdf_bytes = await asyncio.to_thread(
            ai_service.generate_emr_pdf,
            conversation=transcript,
            report_summaries=report_summaries,
            patient_id=patient_id,
            patient_name=patient_name,
            doctor_id=doctor_id,
            doctor_name=doctor_name,
            emr_content=emr_content,
        )

        if pdf_bytes:
            # 6. S3 Upload (Boto3 is also blocking, offload it)
            s3_key = f"emr-pdfs/{session_id}/{draft_id}.pdf"
            await asyncio.to_thread(
                s3_service.upload_file,
                pdf_bytes, 
                s3_key, 
                content_type="application/pdf"
            )
            
            # 7. Update DB
            if final_emr_id:
                # Supabase-py is also sync, offload it
                await asyncio.to_thread(
                    lambda: supabase.table("final_emrs").update({"pdf_s3_key": s3_key}).eq("id", final_emr_id).execute()
                )
            logger.info(f"[PDF-BG] Successfully uploaded PDF for session {session_id}")
            
            # Notify doctor via WebSocket
            await manager.send_to_user(doctor_id, "EMR_PDF_READY", {"session_id": session_id})
        else:
            logger.error(f"[PDF-BG] Failed to generate PDF bytes for session {session_id}")

    except Exception as e:
        logger.error(f"[PDF-BG] Error in background PDF worker: {e}")
        traceback.print_exc()



@router.get("/pdf/{session_id}")
def get_emr_pdf_url(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns a fresh presigned download URL for the approved EMR PDF.

    Why: Presigned URLs expire, so doctors need to request a new one for later downloads.
    Where: Called by the "Download PDF" button on the Review page.
    """
    # Verify doctor owns the session
    session = (
        supabase.table("sessions")
        .select("doctor_id")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not session.data or session.data["doctor_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    final = (
        supabase.table("final_emrs")
        .select("pdf_s3_key")
        .eq("session_id", session_id)
        .single()
        .execute()
    )
    if not final.data or not final.data.get("pdf_s3_key"):
        raise HTTPException(status_code=404, detail="PDF not available for this session.")

    url = s3_service.generate_presigned_url(final.data["pdf_s3_key"], expiry=3600)
    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate download URL.")
    return {"pdf_url": url}


# ─── Patient Summaries ───

@router.get("/patient-summary/{session_id}")
async def get_patient_summary(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Retrieves the AI-generated patient-friendly summary for a session.
    
    Why: Provides patients with a simplified version of the clinical encounter.
    Where: Called by the Frontend: Patient Dashboard -> View Summary.
    
    Args:
        session_id (str): Session UUID.
        
    Returns:
        dict: The summary record.
        
    Raises:
        HTTPException: 403 on unauthorized access, 404 if not found or not yet available.
    """
    # 1. Verify session access (with retry for transient disconnects)
    session = None
    try:
        for attempt in range(2):
            try:
                res = (
                    supabase.table("sessions")
                    .select("doctor_id, patient_id")
                    .eq("id", session_id)
                    .single()
                    .execute()
                )
                session = res.data
                break
            except APIError as e:
                if e.code == "PGRST116":
                    raise HTTPException(status_code=404, detail="Session not found.")
                raise e
            except Exception as e:
                if "Server disconnected" in str(e) and attempt == 0:
                    logger.warning(f"Supabase disconnected for session {session_id}, retrying...")
                    import time
                    time.sleep(0.5)
                    continue
                raise e
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching session for summary check: {e}")
        raise HTTPException(status_code=500, detail="Database error.")

    if not session or current_user["id"] not in [session["doctor_id"], session["patient_id"]]:
        raise HTTPException(status_code=403, detail="Access denied.")

    # 2. Fetch the actual summary
    try:
        result = (
            supabase.table("patient_summaries")
            .select("*")
            .eq("session_id", session_id)
            .single()
            .execute()
        )
        summary = result.data
    except APIError as e:
        if e.code == "PGRST116":
            raise HTTPException(status_code=404, detail="Summary not found.")
        raise HTTPException(status_code=500, detail=f"Database error: {e.message}")
    except Exception as e:
        logger.warning(f"Could not fetch patient summary: {e}")
        raise HTTPException(status_code=404, detail="Summary not found.")

    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found.")

    # 3. Role-based visibility check
    if current_user["role"] == "patient":
        if summary.get("approval_status") != "approved" or not summary.get("sent_to_patient_at"):
            raise HTTPException(status_code=404, detail="Summary not available yet.")

    return summary


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
