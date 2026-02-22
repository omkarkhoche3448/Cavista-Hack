"""
Session Router — CRUD + WebSocket endpoint for clinical sessions.
"""

import json
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Query, UploadFile, File, Form, BackgroundTasks
from jose import jwt, JWTError
from supabase import Client
import requests
import uuid
import traceback
from postgrest.exceptions import APIError

from ..db import get_supabase
from ..oauth2 import get_current_user, require_role, _get_signing_key
from ..config import settings
from ..ws_manager import manager
from ..models import (
    CreateSessionRequest,
    SessionResponse,
    PaginatedSessionsResponse,
    SessionAcceptReject,
    EndSessionRequest,
    TranscriptChunkIn,
)
from ..services import ai_service, s3_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ─── WebSocket ───

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    """
    Main WebSocket entry point for real-time clinical collaboration.
    
    Why: Facilitates live transcript streaming, session state signaling, and instant notifications.
    Where: Initiated by the Session Room and Dashboard components in the Frontend.
    
    Args:
        websocket (WebSocket): The raw WebSocket connection.
        token (str): Supabase JWT token for authentication (passed as query param).
    """
    # Always accept first to avoid "Need to call accept first" errors
    await websocket.accept()
    user_id = "unknown"

    try:
        try:
            header = jwt.get_unverified_header(token)
            alg = header.get("alg", "HS256")
            if alg == "HS256":
                payload = jwt.decode(token, settings.SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
            else:
                signing_key = _get_signing_key(token)
                if not signing_key:
                    await websocket.close(code=4001, reason="Invalid token structure")
                    return
                payload = jwt.decode(token, signing_key, algorithms=[alg], audience="authenticated")
        except jwt.ExpiredSignatureError:
            logger.warning(f"WS connection attempt with expired token.")
            await websocket.close(code=4001, reason="Signature has expired")
            return
        except jwt.JWTError as e:
            logger.warning(f"WS connection attempt with invalid token: {e}")
            await websocket.close(code=4001, reason="Invalid token")
            return

        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid user")
            return
            
        connection_id = await manager.connect(websocket, user_id)
        await manager.send_to_user(user_id, "CONNECTED", {"connection_id": connection_id, "user_id": user_id})

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                await handle_ws_event(user_id, msg.get("event", ""), msg.get("data", {}))
            except json.JSONDecodeError:
                await manager.send_to_user(user_id, "ERROR", {"message": "Invalid JSON"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except JWTError as e:
        # Token expired or invalid — close with 4001 so the frontend knows to refresh
        logger.error(f"WS JWT error for user {user_id}: {e}")
        manager.disconnect(websocket)
        try:
            await websocket.close(code=4001, reason="Token expired or invalid")
        except Exception:
            pass
    except Exception as e:
        logger.error(f"WS error for user {user_id}: {e}")
        manager.disconnect(websocket)


async def handle_ws_event(user_id: str, event: str, data: dict):
    """
    Central dispatcher for incoming WebSocket messages from clients.
    
    Why: Routes real-time commands (like ping/pong, transcript chunks, and AI requests) to proper handlers.
    Where: Called internally by the `websocket_endpoint` loop.
    
    Args:
        user_id (str): UUID of the sender.
        event (str): Event name (e.g., 'TRANSCRIPT_CHUNK').
        data (dict): Event-specific payload.
    """
    supabase = get_supabase()

    if event == "PING":
        await manager.send_to_user(user_id, "PONG", {"ts": datetime.now(timezone.utc).isoformat()})

    elif event == "TRANSCRIPT_CHUNK":
        session_id = data.get("session_id")
        if not session_id:
            return

        chunk_data = {
            "session_id": session_id,
            "chunk_index": data.get("chunk_index", 0),
            "speaker_role": data.get("speaker_role", "unknown"),
            "raw_text": data.get("text", ""),
            "start_time_ms": data.get("start_time_ms", 0),
            "end_time_ms": data.get("end_time_ms", 0),
            "confidence_score": data.get("confidence", None),
            "is_final": data.get("is_final", False),
            "language_code": data.get("language", "en-US"),
        }
        try:
            supabase.table("transcript_chunks").insert(chunk_data).execute()
        except Exception as e:
            logger.error(f"Failed to store transcript chunk: {e}")

        session = supabase.table("sessions").select("doctor_id, patient_id").eq("id", session_id).single().execute()
        if session.data:
            participants = [session.data["doctor_id"], session.data["patient_id"]]
            await manager.send_to_session(participants, "TRANSCRIPT_CHUNK", {
                "session_id": session_id,
                "text": data.get("text", ""),
                "speaker_role": data.get("speaker_role", "unknown"),
                "chunk_index": data.get("chunk_index", 0),
                "is_final": data.get("is_final", False),
            })

    elif event == "JOIN_SESSION":
        session_id = data.get("session_id")
        if not session_id:
            return
        
        session = supabase.table("sessions").select("doctor_id, patient_id").eq("id", session_id).single().execute()
        if session.data:
            participants = [session.data["doctor_id"], session.data["patient_id"]]
            role = "doctor" if user_id == session.data["doctor_id"] else "patient"
            # Broadcast to others in the session
            await manager.send_to_session(participants, "PARTICIPANT_JOINED", {
                "session_id": session_id,
                "user_id": user_id,
                "role": role
            })

    elif event == "REQUEST_AI_INSIGHT":
        session_id = data.get("session_id")
        if not session_id:
            return
        
        # Use asyncio.create_task to background the LLM call without blocking the WS loop
        asyncio.create_task(run_live_insight(user_id, session_id))


async def run_live_insight(user_id: str, session_id: str):
    """
    Background worker for live AI insights during a session.
    """
    from ..db import get_supabase
    supabase = get_supabase()
    
    chunks = (
        supabase.table("transcript_chunks")
        .select("raw_text, speaker_role")
        .eq("session_id", session_id)
        .order("chunk_index")
        .execute()
    )
    transcript = "\n".join(f"[{c['speaker_role']}]: {c['raw_text']}" for c in (chunks.data or []))
    if transcript:
        try:
            insight = ai_service.generate_live_insight(transcript)
            await manager.send_to_user(user_id, "AI_INSIGHT_READY", {"session_id": session_id, "insight": insight})
        except Exception as e:
            logger.error(f"AI insight error: {e}")
            await manager.send_to_user(user_id, "ERROR", {"message": "AI insight generation failed"})


# ─── REST Endpoints ───

@router.post("", response_model=SessionResponse)
async def create_session(
    body: CreateSessionRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Initiates a new clinical session request from a doctor to a patient.
    
    Why: Establishes the formal link for a consultation. Triggers notifications to the patient.
    Where: Called by the "New Session" button in the Doctor Dashboard.
    
    Args:
        body (CreateSessionRequest): patient_email, chief_complaint, emergency flag.
        
    Returns:
        dict: The created session record in 'pending' status.
    """
    patient = (
        supabase.table("users")
        .select("id, email, first_name, last_name, role")
        .eq("email", body.patient_email)
        .eq("role", "patient")
        .single()
        .execute()
    )
    if not patient.data:
        raise HTTPException(status_code=404, detail="No patient found with that email.")

    patient_id = patient.data["id"]
    doctor_id = current_user["id"]

    if patient_id == doctor_id:
        raise HTTPException(status_code=400, detail="Cannot create session with yourself.")

    result = supabase.table("sessions").insert({
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "status": "pending",
        "chief_complaint": body.chief_complaint,
        "is_emergency": body.is_emergency,
        "request_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
        "created_by": doctor_id,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create session.")

    session = result.data[0]

    try:
        supabase.table("notifications").insert({
            "id": str(uuid.uuid4()),
            "recipient_id": patient_id,
            "sender_id": doctor_id,
            "session_id": session["id"],
            "notification_type": "session_request",
            "title": "New Session Request",
            "body": f"Dr. {current_user['first_name']} {current_user['last_name']} has requested to start a session.",
            "payload": {
                "session_id": session["id"],
                "doctor_name": f"Dr. {current_user['first_name']} {current_user['last_name']}",
                "doctor_email": current_user["email"],
                "chief_complaint": body.chief_complaint,
            },
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to persist notification: {e}")

    session["doctor_name"] = f"Dr. {current_user['first_name']} {current_user['last_name']}"
    session["patient_name"] = f"{patient.data['first_name']} {patient.data['last_name']}"
    session["doctor_email"] = current_user["email"]
    session["patient_email"] = patient.data["email"]

    await manager.send_to_user(patient_id, "SESSION_REQUESTED", {
        "session_id": session["id"],
        "session": session,
        "doctor_id": doctor_id,
        "doctor_name": session["doctor_name"],
        "doctor_email": current_user["email"],
        "chief_complaint": body.chief_complaint,
    })

    return session


@router.post("/respond")
async def respond_to_session(
    body: SessionAcceptReject,
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
):
    """
    Allows a patient to accept or reject a pending session request.
    
    Why: Essential for patient consent and session workflow progression.
    Where: Called by the "Accept" or "Reject" buttons in the Patient Dashboard.
    
    Args:
        body (SessionAcceptReject): session_id, action (accept/reject), reason.
        
    Returns:
        dict: Resulting session status.
    """
    session = (
        supabase.table("sessions")
        .select("*")
        .eq("id", body.session_id)
        .eq("patient_id", current_user["id"])
        .eq("status", "pending")
        .single()
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found or already responded.")

    new_status = "accepted" if body.action == "accept" else "rejected"
    ws_event = "SESSION_ACCEPTED" if body.action == "accept" else "SESSION_REJECTED"

    update_data = {"status": new_status, "modified_by": current_user["id"]}
    if body.action == "reject" and body.reason:
        update_data["rejection_reason"] = body.reason

    supabase.table("sessions").update(update_data).eq("id", body.session_id).execute()
    supabase.table("session_state_history").insert({
        "session_id": body.session_id,
        "from_status": "pending",
        "to_status": new_status,
        "changed_by": current_user["id"],
        "reason": body.reason,
    }).execute()

    ws_payload = {
        "session_id": body.session_id,
        "patient_id": current_user["id"],
        "patient_name": f"{current_user['first_name']} {current_user['last_name']}",
        "new_status": new_status,
        "reason": body.reason,
    }
    await manager.send_to_user(session.data["doctor_id"], ws_event, ws_payload)
    await manager.send_to_user(current_user["id"], ws_event, ws_payload)

    return {"status": new_status, "session_id": body.session_id}


@router.post("/{session_id}/start")
async def start_session(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Formally transitions an 'accepted' session into 'active' status.
    
    Why: Signals that the actual clinical encounter has begun. Synchronizes UI for both participants.
    Where: Called when the doctor clicks "Start Session" in the Session Room.
    
    Args:
        session_id (str): Session UUID.
        
    Returns:
        dict: Updated session status and start timestamp.
    """
    session = (
        supabase.table("sessions")
        .select("*")
        .eq("id", session_id)
        .eq("doctor_id", current_user["id"])
        .eq("status", "accepted")
        .single()
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found or not in accepted state.")

    supabase.table("sessions").update({
        "status": "active",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "modified_by": current_user["id"],
    }).eq("id", session_id).execute()

    supabase.table("session_state_history").insert({
        "session_id": session_id,
        "from_status": "accepted",
        "to_status": "active",
        "changed_by": current_user["id"],
    }).execute()

    ws_payload = {"session_id": session_id, "status": "active"}
    await manager.send_to_user(session.data["patient_id"], "SESSION_STARTED", ws_payload)
    await manager.send_to_user(current_user["id"], "SESSION_STARTED", ws_payload)

    return {"status": "active", "session_id": session_id}


@router.post("/end")
async def end_session(
    body: EndSessionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Ends an active session and triggers the backend AI processing pipeline.
    
    Why: Finalizes the live portion of the session and starts automated documentation (EMR, Summary).
    Where: Called when the doctor clicks "End Session" in the Session Room.
    
    Args:
        body (EndSessionRequest): session_id and final clinical notes.
        background_tasks (BackgroundTasks): FastAPI utility for non-blocking AI execution.
        
    Returns:
        dict: Confirmation that processing has started.
    """
    # Look for session owned by this doctor — accept ANY status since the background
    # transcription/AI pipeline may have already advanced it to 'processing' or 'completed'
    try:
        session = (
            supabase.table("sessions")
            .select("*")
            .eq("id", body.session_id)
            .eq("doctor_id", current_user["id"])
            .single()
            .execute()
        )
    except APIError as e:
        if e.code == "PGRST116":  # No rows found
            raise HTTPException(status_code=404, detail="Session not found.")
        raise e
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found.")

    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found.")

    current_status = session.data.get("status", "active")
    print(f"[END_SESSION] Session {body.session_id} current status: '{current_status}'")

    # If already completed or ended, just return success — nothing more to do
    if current_status in ("completed", "ended"):
        return {"status": current_status, "session_id": body.session_id}

    now = datetime.now(timezone.utc).isoformat()

    # Only update if still active (avoid overwriting if already processing)
    if current_status == "active":
        supabase.table("sessions").update({
            "status": "processing",
            "ended_at": now,
            "session_notes": body.session_notes,
            "modified_by": current_user["id"],
        }).eq("id", body.session_id).execute()

        try:
            supabase.table("session_state_history").insert({
                "session_id": body.session_id,
                "from_status": "active",
                "to_status": "processing",
                "changed_by": current_user["id"],
            }).execute()
        except Exception as e:
            logger.warning(f"Could not insert session state history: {e}")

        patient_id = session.data["patient_id"]
        ws_payload = {"session_id": body.session_id, "status": "processing"}
        await manager.send_to_user(patient_id, "SESSION_ENDED", ws_payload)
        await manager.send_to_user(current_user["id"], "SESSION_ENDED", ws_payload)
    else:
        print(f"[END_SESSION] Session {body.session_id} already in '{current_status}' state, skipping status update.")

    # Queue the heavy AI pipeline ONLY if we haven't already started audio transcription
    # (Because if we have audio, run_audio_transcription will call run_ai_pipeline once it has the text)
    if current_status == "active" and not session.data.get("recording_url"):
        background_tasks.add_task(
            run_ai_pipeline,
            body.session_id,
            current_user["id"],
            session.data.get("chief_complaint", ""),
            now
        )
    else:
        print(f"[END_SESSION] Skipping run_ai_pipeline for {body.session_id} (status='{current_status}', has_recording={bool(session.data.get('recording_url'))})")

    return {"status": "processing", "session_id": body.session_id}


async def run_ai_pipeline(session_id: str, doctor_id: str, chief_complaint: str, start_time: str):
    """
    Comprehensive background worker for AI clinical automation.
    
    Why: Handles heavy lifting (LLM calls for EMR drafting, ICD mapping, and summarization) without blocking the API.
    Where: Triggered by `end_session`.
    
    Args:
        session_id (str): Session UUID to process.
        doctor_id (str): UUID of the attending doctor.
        chief_complaint (str): Primary reason for visit.
        start_time (str): Timestamp when processing was initiated.
    """
    supabase = get_supabase()
    print(f"[AI_PIPELINE] Starting for session {session_id}, chief_complaint='{chief_complaint}'")
    
    # Ensure session is in processing state
    try:
        supabase.table("sessions").update({"status": "processing"}).eq("id", session_id).in_("status", ["active", "scheduled"]).execute()
    except Exception:
        pass

    # Fetch patient + doctor info for AI prompts and notifications
    patient_id = None
    patient_name = "Unknown"
    patient_gender = "Unknown"
    patient_age = None
    doctor_name = "Unknown"
    try:
        _sess = (
            supabase.table("sessions")
            .select("patient_id, patient:users!patient_id(first_name, last_name, gender, date_of_birth), doctor:users!doctor_id(first_name, last_name)")
            .eq("id", session_id)
            .single()
            .execute()
        )
        if _sess.data:
            patient_id = _sess.data.get("patient_id")
            pat = _sess.data.get("patient", {})
            patient_name = f"{pat.get('first_name', '')} {pat.get('last_name', '')}".strip() or "Unknown"
            patient_gender = pat.get("gender", "Unknown")
            dob = pat.get("date_of_birth")
            if dob:
                from datetime import date as _date
                try:
                    born = _date.fromisoformat(dob)
                    today = _date.today()
                    patient_age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
                except Exception:
                    pass
            doc = _sess.data.get("doctor", {})
            doctor_name = f"{doc.get('first_name', '')} {doc.get('last_name', '')}".strip() or "Unknown"
    except Exception as e:
        logger.warning(f"Error fetching session info for AI pipeline: {e}")
    try:
        # 1. Compile transcript
        chunks = (
            supabase.table("transcript_chunks")
            .select("raw_text, speaker_role, chunk_index")
            .eq("session_id", session_id)
            .order("chunk_index")
            .execute()
        )
        transcript = "\n".join(f"[{c['speaker_role']}]: {c['raw_text']}" for c in (chunks.data or []))

        if transcript:
            try:
                supabase.table("final_transcripts").insert({
                    "session_id": session_id,
                    "full_text": transcript,
                    "total_chunks": len(chunks.data or []),
                }).execute()
            except Exception as e:
                logger.warning(f"Could not store final transcript: {e}")

        # 2. Get recording URL
        session_info = supabase.table("sessions").select("recording_url").eq("id", session_id).single().execute()
        audio_url = session_info.data.get("recording_url") if session_info.data else None
        print(f"[AI_PIPELINE] Audio URL found: {audio_url is not None}")

        # 3. Get pre-session document insights
        try:
            insights_data = (
                supabase.table("pre_session_insights")
                .select("summary, key_findings, medications_found, allergies_found")
                .eq("session_id", session_id)
                .execute()
            )
            raw_insights = insights_data.data or []
        except Exception as e:
            logger.warning(f"Could not fetch pre-session insights: {e}")
            raw_insights = []

        # Flatten structured insights into summary strings for the external API
        report_summaries = []
        for insight in raw_insights:
            parts = []
            if insight.get("summary"):
                parts.append(insight["summary"])
            if insight.get("key_findings"):
                findings = insight["key_findings"]
                if isinstance(findings, list):
                    parts.append("Key findings: " + "; ".join(str(f) for f in findings))
                elif isinstance(findings, str):
                    parts.append(f"Key findings: {findings}")
            if insight.get("medications_found"):
                meds = insight["medications_found"]
                if isinstance(meds, list):
                    parts.append("Medications: " + ", ".join(str(m) for m in meds))
            if insight.get("allergies_found"):
                allergies = insight["allergies_found"]
                if isinstance(allergies, list):
                    parts.append("Allergies: " + ", ".join(str(a) for a in allergies))
            if parts:
                report_summaries.append(". ".join(parts))
        
        print(f"[AI_PIPELINE] Transcript length: {len(transcript)}, report_summaries: {len(report_summaries)}")
        # 4. Generate EMR draft (External AI Call)
        emr_content = ai_service.generate_emr_draft(
            audio_url=audio_url,
            transcript=transcript,
            chief_complaint=chief_complaint,
            document_insights=report_summaries,
            patient_name=patient_name,
            patient_gender=patient_gender,
            patient_age=patient_age,
            doctor_id=doctor_id,
            doctor_name=doctor_name,
            patient_id=patient_id,
        )

        # 5. Save EMR draft
        draft_id = None
        try:
            emr_draft = supabase.table("emr_drafts").insert({
                "session_id": session_id,
                "version": 1,
                "status": "pending_approval",
                "chief_complaint": emr_content.get("chief_complaint"),
                "history_present_illness": emr_content.get("history_present_illness"),
                "past_medical_history": emr_content.get("past_medical_history"),
                "medications": emr_content.get("medications"),
                "allergies": emr_content.get("allergies"),
                "vital_signs": emr_content.get("vital_signs"),
                "review_of_systems": emr_content.get("review_of_systems"),
                "physical_examination": emr_content.get("physical_examination"),
                "assessment": emr_content.get("assessment"),
                "diagnoses": emr_content.get("diagnoses"),
                "treatment_plan": emr_content.get("treatment_plan"),
                "medications_prescribed": emr_content.get("medications_prescribed"),
                "follow_up_plan": emr_content.get("follow_up_plan"),
                "patient_instructions": emr_content.get("patient_instructions"),
                "model_used": "external-ai-audio",
                "submitted_for_review_at": start_time,
                "created_by": doctor_id,
            }).execute()
            if emr_draft.data:
                draft_id = emr_draft.data[0]["id"]
        except Exception as db_err:
            logger.error(f"DB error inserting emr_drafts: {db_err}")

        # 6. Map ICD Codes
        diagnoses = emr_content.get("diagnoses", [])
        if diagnoses:
            icd_mappings = ai_service.map_icd_codes(diagnoses, audio_url=audio_url, transcript=transcript)
            for mapping in icd_mappings:
                try:
                    supabase.table("icd_mappings").insert({
                        "session_id": session_id,
                        "emr_draft_id": draft_id,
                        "diagnosis_text": mapping.get("diagnosis_text", ""),
                        "icd_code": mapping.get("icd_code"),
                        "icd_description": mapping.get("icd_description"),
                        "confidence_score": mapping.get("confidence_score"),
                        "is_primary": mapping.get("is_primary", False),
                        "match_method": "llm",
                        "approval_status": "pending",
                    }).execute()
                except Exception as db_err:
                    logger.warning(f"Could not insert ICD mapping: {db_err}")
 
        # 7. Treatment Suggestions
        treatments = ai_service.suggest_treatments(
            diagnoses=diagnoses,
            audio_url=audio_url,
            transcript=transcript,
            current_medications=emr_content.get("medications"),
        )
        if treatments:
            try:
                supabase.table("treatment_suggestions").insert([
                    {
                        "session_id": session_id,
                        "emr_draft_id": draft_id,
                        "suggestion_type": tx.get("suggestion_type"),
                        "title": tx.get("title", "Untitled"),
                        "description": tx.get("description"),
                        "rationale": tx.get("rationale"),
                        "evidence_basis": tx.get("evidence_basis"),
                        "priority": tx.get("priority"),
                        "contraindications": tx.get("contraindications"),
                        "model_used": "external-ai-audio",
                        "approval_status": "pending",
                    }
                    for tx in treatments
                ]).execute()
            except Exception as db_err:
                logger.warning(f"Could not insert treatment suggestions: {db_err}")

        # 8. Patient Summary
        summary = ai_service.generate_patient_summary(emr_content, diagnoses, treatments)
        try:
            supabase.table("patient_summaries").insert({
                "session_id": session_id,
                "summary_text": summary.get("summary_text", ""),
                "key_takeaways": summary.get("key_takeaways"),
                "medications_list": summary.get("medications_list"),
                "follow_up_notes": summary.get("follow_up_notes"),
                "warnings": summary.get("warnings"),
                "model_used": "external-ai-audio",
                "approval_status": "pending",
            }).execute()
        except Exception as db_err:
            logger.warning(f"Could not insert patient summary: {db_err}")

        # Final Update: Set session to completed
        supabase.table("sessions").update({"status": "completed"}).eq("id", session_id).execute()

        # Notify doctor that EMR draft is ready for review
        await manager.send_to_user(doctor_id, "EMR_DRAFT_READY", {
            "session_id": session_id,
            "draft_id": draft_id,
        })

        # Notify patient that AI processing is complete
        ai_done_payload = {"session_id": session_id, "status": "completed"}
        await manager.send_to_user(doctor_id, "AI_PROCESSING_COMPLETE", ai_done_payload)
        if patient_id:
            await manager.send_to_user(patient_id, "AI_PROCESSING_COMPLETE", ai_done_payload)

    except Exception as e:
        logger.error(f"AI pipeline error for session {session_id}: {e}")
        supabase.table("sessions").update({"status": "completed"}).eq("id", session_id).execute()
        error_payload = {"session_id": session_id, "status": "completed"}
        await manager.send_to_user(doctor_id, "AI_PROCESSING_COMPLETE", error_payload)
        if patient_id:
            await manager.send_to_user(patient_id, "AI_PROCESSING_COMPLETE", error_payload)
        await manager.send_to_user(doctor_id, "ERROR", {
            "message": f"AI processing encountered an error: {str(e)}",
            "session_id": session_id,
        })



@router.get("", response_model=PaginatedSessionsResponse)
def list_sessions(
    status_filter: str = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Retrieves a paginated list of sessions for the logged-in user.
    
    Why: Populates the "Session History" and "Pending Requests" tables for both doctors and patients.
    Where: Called by Dashboard and Session History views.
    
    Args:
        status_filter (str, optional): Filter by 'pending', 'active', 'ended', etc.
        page (int): Page number (starting from 1).
        page_size (int): Number of items per page.
        
    Returns:
        PaginatedSessionsResponse: List of sessions with metadata.
    """
    role = current_user["role"]
    user_id = current_user["id"]

    # Offset calculation for Supabase (0-indexed)
    start = (page - 1) * page_size
    end = start + page_size - 1

    query = supabase.table("sessions").select(
        "*, doctor:users!doctor_id(first_name, last_name, email), "
        "patient:users!patient_id(first_name, last_name, email)",
        count="exact"
    )
    query = query.eq("doctor_id", user_id) if role == "doctor" else query.eq("patient_id", user_id)
    if status_filter:
        query = query.eq("status", status_filter)
    
    result = query.order("created_at", desc=True).range(start, end).execute()

    total_count = result.count or 0
    total_pages = (total_count + page_size - 1) // page_size

    sessions = []
    for s in (result.data or []):
        doc = s.pop("doctor", {}) or {}
        pat = s.pop("patient", {}) or {}
        s["doctor_name"] = f"Dr. {doc.get('first_name', '')} {doc.get('last_name', '')}".strip()
        s["patient_name"] = f"{pat.get('first_name', '')} {pat.get('last_name', '')}".strip()
        s["doctor_email"] = doc.get("email")
        s["patient_email"] = pat.get("email")
        sessions.append(s)
    
    return {
        "sessions": sessions,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.get("/patients")
def list_patients(
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns a deduplicated list of patients who have had sessions with this doctor.

    Why: Populates the doctor's Patients page with real patient data.
    Where: Called by the Patients view in the Doctor Dashboard.
    """
    doctor_id = current_user["id"]

    result = (
        supabase.table("sessions")
        .select("patient_id, status, created_at, patient:users!patient_id(first_name, last_name, email, phone, date_of_birth)")
        .eq("doctor_id", doctor_id)
        .order("created_at", desc=True)
        .execute()
    )

    seen: dict = {}
    for s in (result.data or []):
        pid = s["patient_id"]
        pat = s.pop("patient") or {}
        if pid not in seen:
            seen[pid] = {
                "id": pid,
                "name": f"{pat.get('first_name', '')} {pat.get('last_name', '')}".strip(),
                "email": pat.get("email", ""),
                "phone": pat.get("phone", ""),
                "session_count": 0,
                "last_session_at": s["created_at"],
                "last_session_status": s["status"],
            }
        seen[pid]["session_count"] += 1

    return list(seen.values())


@router.get("/patients/{patient_id}")
def get_patient_detail(
    patient_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns full patient details (user info + patient_profile) for a specific patient.
    Only accessible to doctors who have had at least one session with this patient.
    """
    doctor_id = current_user["id"]

    # Verify the doctor has had sessions with this patient
    access_check = (
        supabase.table("sessions")
        .select("id")
        .eq("doctor_id", doctor_id)
        .eq("patient_id", patient_id)
        .limit(1)
        .execute()
    )
    if not access_check.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    # Fetch user base info
    user_result = (
        supabase.table("users")
        .select("id, first_name, last_name, email, phone, date_of_birth, gender")
        .eq("id", patient_id)
        .single()
        .execute()
    )
    if not user_result.data:
        raise HTTPException(status_code=404, detail="Patient not found.")

    u = user_result.data

    # Fetch patient profile (optional — may not exist)
    profile_result = (
        supabase.table("patient_profiles")
        .select("*")
        .eq("user_id", patient_id)
        .execute()
    )
    p = profile_result.data[0] if profile_result.data else {}

    return {
        "id": u["id"],
        "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
        "email": u.get("email", ""),
        "phone": u.get("phone"),
        "date_of_birth": u.get("date_of_birth"),
        "gender": u.get("gender"),
        "mrn": p.get("mrn"),
        "blood_type": p.get("blood_type"),
        "height_cm": p.get("height_cm"),
        "weight_kg": p.get("weight_kg"),
        "emergency_contact_name": p.get("emergency_contact_name"),
        "emergency_contact_phone": p.get("emergency_contact_phone"),
        "emergency_contact_relation": p.get("emergency_contact_relation"),
        "insurance_provider": p.get("insurance_provider"),
        "insurance_policy_number": p.get("insurance_policy_number"),
    }


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Fetches comprehensive details for a specific session ID.
    
    Why: Used to load full session context for review or for active consultation.
    Where: Called by the Session Room and any Detail view.
    
    Args:
        session_id (str): Session UUID.
        
    Returns:
        dict: Detailed session record with joined doctor/patient details.
    """
    try:
        # Retry once on "Server disconnected"
        for attempt in range(2):
            try:
                session = (
                    supabase.table("sessions")
                    .select("*, doctor:users!doctor_id(first_name, last_name, email), patient:users!patient_id(first_name, last_name, email, gender, date_of_birth)")
                    .eq("id", session_id)
                    .single()
                    .execute()
                )
                break
            except APIError as e:
                if e.code == "PGRST116":  # No rows found
                    raise HTTPException(status_code=404, detail="Session not found.")
                raise e # Re-raise other API errors
            except Exception as e:
                if "Server disconnected" in str(e) and attempt == 0:
                    logger.warning(f"Supabase disconnected for session {session_id}, retrying...")
                    await asyncio.sleep(0.5)
                    continue
                raise e

        # ... (rest of processing)
        s = session.data
        if current_user["id"] not in [s["doctor_id"], s["patient_id"]]:
            raise HTTPException(status_code=403, detail="Access denied.")

        doc = s.pop("doctor", {}) or {}
        pat = s.pop("patient", {}) or {}
        s["doctor_name"] = f"Dr. {doc.get('first_name', '')} {doc.get('last_name', '')}".strip()
        s["patient_name"] = f"{pat.get('first_name', '')} {pat.get('last_name', '')}".strip()
        s["doctor_email"] = doc.get("email")
        s["patient_email"] = pat.get("email")
        s["patient_gender"] = pat.get("gender")
        s["patient_dob"] = pat.get("date_of_birth")
        return s
    except HTTPException:
        raise
    except APIError as e:
        if e.code == "PGRST116":
            raise HTTPException(status_code=404, detail="Session not found.")
        logger.error(f"Postgrest error fetching session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Database integrity error.")
    except Exception as e:
        logger.error(f"Error fetching session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Database connection error.")


@router.get("/{session_id}/transcript")
def get_transcript(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Retrieves all transcript chunks for a session in order.
    
    Why: Allows users to read the full conversation history.
    Where: Called by the "Transcript" tab in the Session Room or EMR Review.
    
    Args:
        session_id (str): Session UUID.
        
    Returns:
        list: List of transcript chunk records.
    """
    session = (
        supabase.table("sessions")
        .select("doctor_id, patient_id")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not session.data or current_user["id"] not in [session.data["doctor_id"], session.data["patient_id"]]:
        raise HTTPException(status_code=403, detail="Access denied.")

    try:
        chunks = (
            supabase.table("transcript_chunks")
            .select("*")
            .eq("session_id", session_id)
            .order("chunk_index")
            .execute()
        )
        return chunks.data or []
    except Exception as e:
        logger.error(f"Error fetching transcript for {session_id}: {e}")
        return []


@router.get("/{session_id}/notifications")
def get_session_notifications(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Fetches notifications specifically scoped to a single session.
    
    Why: Filters noise to show only relevant updates (file shares, status changes) within a session context.
    Where: Called by the "Activity Log" in the Session Room.
    
    Args:
        session_id (str): Session UUID.
        
    Returns:
        list: List of notification records.
    """
    result = (
        supabase.table("notifications")
        .select("*")
        .eq("session_id", session_id)
        .eq("recipient_id", current_user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


async def run_audio_transcription(session_id: str, recording_url: str, uploaded_key: str, user_id: str):
    """
    Background worker for off-peak audio transcription via external API.
    """
    try:
        print(f"[TRANSCRIPTION-BG] Calling external API for session {session_id}, audio_url={recording_url}")
        response = requests.post(
            f"{settings.ANALYSIS_API_URL}/transcribe/",
            json={
                "audio_url": recording_url,
            },
            timeout=180,
        )
        if response.status_code == 200:
            data = response.json()
            print(f"[TRANSCRIPTION-BG] Raw response keys: {list(data.keys())}")
            print(f"[TRANSCRIPTION-BG] Raw response: {data}")
            
            # The external API returns "transcription" (not "transcript")
            transcript_text = data.get("transcription", "") or data.get("transcript", "")
            print(f"[TRANSCRIPTION-BG] Success for session {session_id}. Transcript length: {len(transcript_text)}")
            
            # Save the transcript back to DB so run_ai_pipeline can see it
            if transcript_text:
                supabase = get_supabase()
                try:
                    supabase.table("transcript_chunks").insert({
                        "session_id": session_id,
                        "chunk_index": 0,
                        "speaker_role": "doctor",
                        "raw_text": transcript_text,
                        "is_final": True
                    }).execute()
                    print(f"[TRANSCRIPTION-BG] Transcript chunk saved to DB for session {session_id}")
                except Exception as e:
                    logger.warning(f"Failed to save automated transcript chunk: {e}")
            else:
                print(f"[TRANSCRIPTION-BG] WARNING: Transcript is empty for session {session_id}!")

            # Notify user via WebSocket
            await manager.send_to_user(user_id, "TRANSCRIPTION_COMPLETE", {
                "session_id": session_id,
                "status": "success",
                "recording_url": recording_url
            })

            # CHAIN: Now run the AI pipeline since we have the transcript
            supabase = get_supabase()
            sess_data = supabase.table("sessions").select("chief_complaint, ended_at").eq("id", session_id).single().execute()
            chief_complaint = sess_data.data.get("chief_complaint", "") if sess_data.data else ""
            ended_at = sess_data.data.get("ended_at", "") if sess_data.data else ""

            await run_ai_pipeline(session_id, user_id, chief_complaint, ended_at)

        else:
            logger.error(f"External Transcribe API Error ({response.status_code}): {response.text}")
            # FALLBACK: Trigger AI pipeline anyway, so at least reports and manual chunks are processed
            print(f"[TRANSCRIPTION-BG] Transcription failed for {session_id}. Running AI pipeline as fallback.")
            supabase = get_supabase()
            sess_data = supabase.table("sessions").select("chief_complaint, ended_at").eq("id", session_id).single().execute()
            chief_complaint = sess_data.data.get("chief_complaint", "") if sess_data.data else ""
            ended_at = sess_data.data.get("ended_at", "") if sess_data.data else ""
            await run_ai_pipeline(session_id, user_id, chief_complaint, ended_at)

    except Exception as e:
        logger.error(f"Background transcription failed for {session_id}: {e}")
        # FINAL FALLBACK: Ensure the pipeline runs even if the transcription code crashed
        try:
            supabase = get_supabase()
            sess_data = supabase.table("sessions").select("chief_complaint, ended_at").eq("id", session_id).single().execute()
            chief_complaint = sess_data.data.get("chief_complaint", "") if sess_data.data else ""
            ended_at = sess_data.data.get("ended_at", "") if sess_data.data else ""
            await run_ai_pipeline(session_id, user_id, chief_complaint, ended_at)
        except Exception as final_e:
            logger.error(f"Critical failure: Could not even trigger fallback AI pipeline for {session_id}: {final_e}")



@router.post("/transcribe")
async def transcribe_audio(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Unified endpoint to upload audio and trigger external transcription/analysis.
    
    Why: Consolidation of file handling and AI triggering for clinical recording finalization.
    Where: Called after manual audio recording or file upload in the EMR workflow.
    
    Args:
        session_id (str): Session UUID.
        file (UploadFile): Recorded audio file (WebM/WAV).
        background_tasks (BackgroundTasks): Injected background task manager.
        
    Returns:
        dict: Success status and initial recording URL.
    """
    try:
        content = await file.read()
        file_ext = file.filename.split(".")[-1] if (file.filename and "." in file.filename) else "webm"
        s3_key = f"recordings/{session_id}.{file_ext}"

        uploaded_key = s3_service.upload_file(content, s3_key, file.content_type or "audio/webm")
        if not uploaded_key:
            raise HTTPException(status_code=500, detail="Failed to upload recording to S3")

        recording_url = f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{uploaded_key}"

        try:
             supabase.table("sessions").update({"recording_url": recording_url}).eq("id", session_id).execute()
        except Exception as db_err:
            logger.warning(f"Recording URL not saved to DB: {db_err}")

        # Offload external AI transcription to background task (takes up to 180s)
        background_tasks.add_task(
            run_audio_transcription,
            session_id,
            recording_url,
            uploaded_key,
            current_user["id"]
        )

        return {
            "status": "processing", 
            "recording_url": recording_url, 
            "session_id": session_id,
            "message": "Audio uploaded. Transcription is processing in the background."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process transcription request: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription process failed: {str(e)}")
