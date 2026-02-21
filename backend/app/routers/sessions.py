"""
Session Router — CRUD operations for clinical sessions + WebSocket endpoint.
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Query
from jose import jwt, JWTError
from supabase import Client

from ..db import get_supabase
from ..oauth2 import get_current_user, require_role, _get_signing_key
from ..config import settings
from ..ws_manager import manager
from ..models import (
    CreateSessionRequest,
    SessionResponse,
    SessionAcceptReject,
    EndSessionRequest,
    TranscriptChunkIn,
)
from ..services import ai_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ─── WebSocket Endpoint ───

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    """
    WebSocket entry point. Client connects with ?token=<jwt>.
    After auth, messages are JSON: {"event": "...", "data": {...}}
    """
    # Authenticate via JWT
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
            if not signing_key:
                await websocket.close(code=4001, reason="Invalid token")
                return
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                audience="authenticated",
            )

        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    connection_id = await manager.connect(websocket, user_id)

    try:
        # Send initial connection confirmation
        await manager.send_to_user(user_id, "CONNECTED", {
            "connection_id": connection_id,
            "user_id": user_id,
        })

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                event = msg.get("event", "")
                data = msg.get("data", {})
                await handle_ws_event(user_id, event, data, websocket)
            except json.JSONDecodeError:
                await manager.send_to_user(user_id, "ERROR", {"message": "Invalid JSON"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WS error for user {user_id}: {e}")
        manager.disconnect(websocket)


async def handle_ws_event(user_id: str, event: str, data: dict, websocket: WebSocket):
    """Route incoming WebSocket events."""
    supabase = get_supabase()

    if event == "PING":
        await manager.send_to_user(user_id, "PONG", {"ts": datetime.now(timezone.utc).isoformat()})

    elif event == "TRANSCRIPT_CHUNK":
        # Doctor sends a transcript chunk during active session
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

        # Forward to all session participants
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

    elif event == "REQUEST_AI_INSIGHT":
        # Doctor requests live AI insight during session
        session_id = data.get("session_id")
        if not session_id:
            return

        # Get transcript so far
        chunks = (
            supabase.table("transcript_chunks")
            .select("raw_text, speaker_role")
            .eq("session_id", session_id)
            .order("chunk_index")
            .execute()
        )
        transcript = "\n".join(
            f"[{c['speaker_role']}]: {c['raw_text']}" for c in (chunks.data or [])
        )

        if transcript:
            try:
                insight = ai_service.generate_live_insight(transcript)
                await manager.send_to_user(user_id, "AI_INSIGHT_READY", {
                    "session_id": session_id,
                    "insight": insight,
                })
            except Exception as e:
                logger.error(f"AI insight error: {e}")
                await manager.send_to_user(user_id, "ERROR", {"message": "AI insight generation failed"})


# ─── REST Endpoints ───

@router.post("", response_model=SessionResponse)
def create_session(
    body: CreateSessionRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Doctor creates a new session by providing patient email."""
    # Find patient by email
    patient = (
        supabase.table("users")
        .select("id, email, first_name, last_name, role")
        .eq("email", body.patient_email)
        .eq("role", "patient")
        .single()
        .execute()
    )

    if not patient.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No patient found with that email.",
        )

    patient_id = patient.data["id"]
    doctor_id = current_user["id"]

    if patient_id == doctor_id:
        raise HTTPException(status_code=400, detail="Cannot create session with yourself.")

    # Create session
    session_data = {
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "status": "pending",
        "chief_complaint": body.chief_complaint,
        "is_emergency": body.is_emergency,
        "request_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
        "created_by": doctor_id,
    }

    result = supabase.table("sessions").insert(session_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create session.")

    session = result.data[0]

    # Create notification for patient
    notification = {
        "recipient_id": patient_id,
        "sender_id": doctor_id,
        "session_id": session["id"],
        "notification_type": "session_request",
        "title": "New Session Request",
        "body": f"Dr. {current_user['first_name']} {current_user['last_name']} ({current_user['email']}) has requested to start a session.",
        "payload": {
            "session_id": session["id"],
            "doctor_name": f"Dr. {current_user['first_name']} {current_user['last_name']}",
            "doctor_email": current_user["email"],
            "chief_complaint": body.chief_complaint,
        },
    }
    supabase.table("notifications").insert(notification).execute()

    # Send real-time WS notification to patient
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(manager.send_to_user(patient_id, "SESSION_REQUESTED", {
                "session_id": session["id"],
                "doctor_id": doctor_id,
                "doctor_name": f"Dr. {current_user['first_name']} {current_user['last_name']}",
                "doctor_email": current_user["email"],
                "chief_complaint": body.chief_complaint,
            }))
    except Exception as e:
        logger.warning(f"Could not send WS notification: {e}")

    # Build response
    session["doctor_name"] = f"Dr. {current_user['first_name']} {current_user['last_name']}"
    session["patient_name"] = f"{patient.data['first_name']} {patient.data['last_name']}"
    session["doctor_email"] = current_user["email"]
    session["patient_email"] = patient.data["email"]

    return session


@router.post("/respond")
async def respond_to_session(
    body: SessionAcceptReject,
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
):
    """Patient accepts or rejects a session request."""
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

    if body.action == "accept":
        new_status = "accepted"
        ws_event = "SESSION_ACCEPTED"
    else:
        new_status = "rejected"
        ws_event = "SESSION_REJECTED"

    update_data = {
        "status": new_status,
        "modified_by": current_user["id"],
    }
    if body.action == "reject" and body.reason:
        update_data["rejection_reason"] = body.reason

    supabase.table("sessions").update(update_data).eq("id", body.session_id).execute()

    # Record state transition
    supabase.table("session_state_history").insert({
        "session_id": body.session_id,
        "from_status": "pending",
        "to_status": new_status,
        "changed_by": current_user["id"],
        "reason": body.reason,
    }).execute()

    # Notify doctor via WebSocket
    doctor_id = session.data["doctor_id"]
    await manager.send_to_user(doctor_id, ws_event, {
        "session_id": body.session_id,
        "patient_id": current_user["id"],
        "patient_name": f"{current_user['first_name']} {current_user['last_name']}",
        "reason": body.reason,
    })

    return {"status": new_status, "session_id": body.session_id}


@router.post("/{session_id}/start")
async def start_session(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Doctor starts an accepted session (moves to active)."""
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

    # Notify patient
    patient_id = session.data["patient_id"]
    await manager.send_to_user(patient_id, "SESSION_STARTED", {
        "session_id": session_id,
    })

    return {"status": "active", "session_id": session_id}


@router.post("/end")
async def end_session(
    body: EndSessionRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Doctor ends session. Triggers AI pipeline: EMR, ICD, treatments, patient summary."""
    session = (
        supabase.table("sessions")
        .select("*")
        .eq("id", body.session_id)
        .eq("doctor_id", current_user["id"])
        .eq("status", "active")
        .single()
        .execute()
    )

    if not session.data:
        raise HTTPException(status_code=404, detail="Active session not found.")

    now = datetime.now(timezone.utc).isoformat()

    # Update session to processing
    supabase.table("sessions").update({
        "status": "processing",
        "ended_at": now,
        "session_notes": body.session_notes,
        "modified_by": current_user["id"],
    }).eq("id", body.session_id).execute()

    supabase.table("session_state_history").insert({
        "session_id": body.session_id,
        "from_status": "active",
        "to_status": "processing",
        "changed_by": current_user["id"],
    }).execute()

    patient_id = session.data["patient_id"]
    await manager.send_to_user(patient_id, "SESSION_ENDED", {
        "session_id": body.session_id,
    })

    # ── AI Pipeline ──
    try:
        # 1. Compile transcript
        chunks = (
            supabase.table("transcript_chunks")
            .select("raw_text, speaker_role, chunk_index")
            .eq("session_id", body.session_id)
            .order("chunk_index")
            .execute()
        )
        transcript = "\n".join(
            f"[{c['speaker_role']}]: {c['raw_text']}" for c in (chunks.data or [])
        )

        # Store final transcript
        if transcript:
            supabase.table("final_transcripts").insert({
                "session_id": body.session_id,
                "full_text": transcript,
                "total_chunks": len(chunks.data or []),
            }).execute()

        # 2. Get document insights for context
        insights_data = (
            supabase.from_("pre_session_insights")
            .select("summary, key_findings, medications_found, allergies_found")
            .eq("session_id", body.session_id)
            .execute()
        )

        # 3. Generate EMR draft
        emr_content = ai_service.generate_emr_draft(
            transcript=transcript or "No transcript available.",
            chief_complaint=session.data.get("chief_complaint", ""),
            document_insights=insights_data.data if insights_data.data else None,
        )

        emr_draft = supabase.table("emr_drafts").insert({
            "session_id": body.session_id,
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
            "model_used": "gemini-2.0-flash",
            "submitted_for_review_at": now,
            "created_by": current_user["id"],
        }).execute()

        draft_id = emr_draft.data[0]["id"] if emr_draft.data else None

        # 4. ICD-10 mapping
        diagnoses = emr_content.get("diagnoses", [])
        if diagnoses:
            icd_mappings = ai_service.map_icd_codes(diagnoses, transcript[:2000] if transcript else "")
            for mapping in icd_mappings:
                supabase.table("icd_mappings").insert({
                    "session_id": body.session_id,
                    "emr_draft_id": draft_id,
                    "diagnosis_text": mapping.get("diagnosis_text", ""),
                    "icd_code": mapping.get("icd_code"),
                    "icd_description": mapping.get("icd_description"),
                    "confidence_score": mapping.get("confidence_score"),
                    "is_primary": mapping.get("is_primary", False),
                    "match_method": "llm",
                    "approval_status": "pending",
                }).execute()

        # 5. Treatment suggestions
        treatments = ai_service.suggest_treatments(
            diagnoses=diagnoses,
            patient_context=transcript[:2000] if transcript else "",
            current_medications=emr_content.get("medications"),
        )
        for tx in treatments:
            supabase.table("treatment_suggestions").insert({
                "session_id": body.session_id,
                "emr_draft_id": draft_id,
                "suggestion_type": tx.get("suggestion_type"),
                "title": tx.get("title", "Untitled"),
                "description": tx.get("description"),
                "rationale": tx.get("rationale"),
                "evidence_basis": tx.get("evidence_basis"),
                "priority": tx.get("priority"),
                "contraindications": tx.get("contraindications"),
                "model_used": "gemini-2.0-flash",
                "approval_status": "pending",
            }).execute()

        # 6. Patient-friendly summary
        summary = ai_service.generate_patient_summary(
            emr_content=emr_content,
            diagnoses=diagnoses,
            treatments=treatments,
        )
        supabase.table("patient_summaries").insert({
            "session_id": body.session_id,
            "summary_text": summary.get("summary_text", ""),
            "key_takeaways": summary.get("key_takeaways"),
            "medications_list": summary.get("medications_list"),
            "follow_up_notes": summary.get("follow_up_notes"),
            "warnings": summary.get("warnings"),
            "model_used": "gemini-2.0-flash",
            "approval_status": "pending",
        }).execute()

        # Notify doctor that AI pipeline is complete
        await manager.send_to_user(current_user["id"], "EMR_DRAFT_READY", {
            "session_id": body.session_id,
            "draft_id": draft_id,
        })

    except Exception as e:
        logger.error(f"AI pipeline error for session {body.session_id}: {e}")
        # Still mark as ended even if AI fails
        supabase.table("sessions").update({
            "status": "ended",
        }).eq("id", body.session_id).execute()

        await manager.send_to_user(current_user["id"], "ERROR", {
            "message": f"AI processing encountered an error: {str(e)}",
            "session_id": body.session_id,
        })

    return {"status": "processing", "session_id": body.session_id}


@router.get("", response_model=list[SessionResponse])
def list_sessions(
    status_filter: str = Query(None, alias="status"),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """List sessions for the current user (doctor or patient)."""
    role = current_user["role"]
    user_id = current_user["id"]

    query = supabase.table("sessions").select(
        "*, doctor:users!sessions_doctor_id_fkey(first_name, last_name, email), "
        "patient:users!sessions_patient_id_fkey(first_name, last_name, email)"
    )

    if role == "doctor":
        query = query.eq("doctor_id", user_id)
    else:
        query = query.eq("patient_id", user_id)

    if status_filter:
        query = query.eq("status", status_filter)

    query = query.order("created_at", desc=True).limit(50)
    result = query.execute()

    sessions = []
    for s in (result.data or []):
        doc = s.pop("doctor", {}) or {}
        pat = s.pop("patient", {}) or {}
        s["doctor_name"] = f"Dr. {doc.get('first_name', '')} {doc.get('last_name', '')}".strip()
        s["patient_name"] = f"{pat.get('first_name', '')} {pat.get('last_name', '')}".strip()
        s["doctor_email"] = doc.get("email")
        s["patient_email"] = pat.get("email")
        sessions.append(s)

    return sessions


@router.get("/{session_id}")
def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get a single session with full details."""
    session = (
        supabase.table("sessions")
        .select(
            "*, doctor:users!sessions_doctor_id_fkey(first_name, last_name, email), "
            "patient:users!sessions_patient_id_fkey(first_name, last_name, email)"
        )
        .eq("id", session_id)
        .single()
        .execute()
    )

    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found.")

    s = session.data
    # Verify user has access
    if current_user["id"] not in [s["doctor_id"], s["patient_id"]]:
        raise HTTPException(status_code=403, detail="Access denied.")

    doc = s.pop("doctor", {}) or {}
    pat = s.pop("patient", {}) or {}
    s["doctor_name"] = f"Dr. {doc.get('first_name', '')} {doc.get('last_name', '')}".strip()
    s["patient_name"] = f"{pat.get('first_name', '')} {pat.get('last_name', '')}".strip()
    s["doctor_email"] = doc.get("email")
    s["patient_email"] = pat.get("email")

    return s


@router.get("/{session_id}/transcript")
def get_transcript(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get transcript chunks for a session."""
    # Verify access
    session = (
        supabase.table("sessions")
        .select("doctor_id, patient_id")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not session.data or current_user["id"] not in [session.data["doctor_id"], session.data["patient_id"]]:
        raise HTTPException(status_code=403, detail="Access denied.")

    chunks = (
        supabase.table("transcript_chunks")
        .select("*")
        .eq("session_id", session_id)
        .order("chunk_index")
        .execute()
    )

    return chunks.data or []


@router.get("/{session_id}/notifications")
def get_session_notifications(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get notifications for a session."""
    result = (
        supabase.table("notifications")
        .select("*")
        .eq("session_id", session_id)
        .eq("recipient_id", current_user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []
