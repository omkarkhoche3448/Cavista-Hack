from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import BackgroundTasks, HTTPException, UploadFile
from postgrest.exceptions import APIError
from supabase import Client

from ..config.settings import settings
from ..models.schemas import CreateSessionRequest, EndSessionRequest, SessionAcceptReject
from ..repositories import session_repository
from . import ai_service, s3_service
from ..services.websocket_manager import manager
from ..utils.errors import raise_bad_request, raise_forbidden, raise_not_found
from ..utils.validation import csv_to_set, ensure_file_constraints

logger = logging.getLogger(__name__)

VALID_SESSION_STATUSES = {
    "pending",
    "accepted",
    "rejected",
    "active",
    "ended",
    "processing",
    "completed",
    "cancelled",
    "expired",
}


def _build_display_names(session: dict) -> dict:
    record = dict(session)
    doctor = record.pop("doctor", {}) or {}
    patient = record.pop("patient", {}) or {}
    record["doctor_name"] = f"Dr. {doctor.get('first_name', '')} {doctor.get('last_name', '')}".strip()
    record["patient_name"] = f"{patient.get('first_name', '')} {patient.get('last_name', '')}".strip()
    record["doctor_email"] = doctor.get("email")
    record["patient_email"] = patient.get("email")
    if "gender" in patient:
        record["patient_gender"] = patient.get("gender")
    if "date_of_birth" in patient:
        record["patient_dob"] = patient.get("date_of_birth")
    return record


def _session_participants(supabase: Client, session_id: str) -> dict:
    session = session_repository.get_session_participants(supabase, session_id)
    if not session:
        raise_not_found("Session not found.")
    return session


def _assert_user_is_session_participant(supabase: Client, session_id: str, user_id: str) -> dict:
    session = _session_participants(supabase, session_id)
    if user_id not in {session["doctor_id"], session["patient_id"]}:
        raise_forbidden("Access denied.")
    return session


def _assert_doctor_owns_session(supabase: Client, session_id: str, doctor_id: str) -> dict:
    session = session_repository.get_session_by_id(supabase, session_id)
    if not session:
        raise_not_found("Session not found.")
    if session.get("doctor_id") != doctor_id:
        raise_forbidden("Access denied.")
    return session


def _estimate_age(dob_value: str | None) -> int | None:
    if not dob_value:
        return None
    try:
        born = date.fromisoformat(dob_value)
        today = date.today()
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    except ValueError:
        return None


async def handle_ws_event(user_id: str, event: str, data: dict, supabase: Client) -> None:
    if event == "PING":
        await manager.send_to_user(user_id, "PONG", {"ts": datetime.now(timezone.utc).isoformat()})
        return

    if event == "TRANSCRIPT_CHUNK":
        session_id = data.get("session_id")
        if not session_id:
            return
        session = _assert_user_is_session_participant(supabase, session_id, user_id)

        speaker_role = data.get("speaker_role", "unknown")
        if speaker_role not in {"doctor", "patient", "unknown"}:
            speaker_role = "unknown"

        chunk_payload = {
            "session_id": session_id,
            "chunk_index": max(int(data.get("chunk_index", 0)), 0),
            "speaker_role": speaker_role,
            "raw_text": str(data.get("text", "")).strip(),
            "start_time_ms": max(int(data.get("start_time_ms", 0)), 0),
            "end_time_ms": max(int(data.get("end_time_ms", 0)), 0),
            "confidence_score": data.get("confidence"),
            "is_final": bool(data.get("is_final", False)),
            "language_code": str(data.get("language", "en-US"))[:16],
        }
        if not chunk_payload["raw_text"]:
            return

        try:
            session_repository.insert_transcript_chunk(supabase, chunk_payload)
        except Exception as error:
            logger.warning("Failed to persist transcript chunk session=%s error=%s", session_id, error)

        participants = [session["doctor_id"], session["patient_id"]]
        await manager.send_to_session(
            participants,
            "TRANSCRIPT_CHUNK",
            {
                "session_id": session_id,
                "text": chunk_payload["raw_text"],
                "speaker_role": chunk_payload["speaker_role"],
                "chunk_index": chunk_payload["chunk_index"],
                "is_final": chunk_payload["is_final"],
            },
        )
        return

    if event == "JOIN_SESSION":
        session_id = data.get("session_id")
        if not session_id:
            return
        session = _assert_user_is_session_participant(supabase, session_id, user_id)
        role = "doctor" if user_id == session["doctor_id"] else "patient"
        await manager.send_to_session(
            [session["doctor_id"], session["patient_id"]],
            "PARTICIPANT_JOINED",
            {"session_id": session_id, "user_id": user_id, "role": role},
        )
        return

    if event == "REQUEST_AI_INSIGHT":
        session_id = data.get("session_id")
        if not session_id:
            return
        _assert_user_is_session_participant(supabase, session_id, user_id)
        asyncio.create_task(run_live_insight(user_id, session_id, supabase))


async def run_live_insight(user_id: str, session_id: str, supabase: Client) -> None:
    chunks = session_repository.get_transcript_chunks_for_pipeline(supabase, session_id)
    transcript = "\n".join(f"[{c['speaker_role']}]: {c['raw_text']}" for c in chunks)
    if not transcript.strip():
        return
    insight = await asyncio.to_thread(ai_service.generate_live_insight, transcript)
    await manager.send_to_user(
        user_id,
        "AI_INSIGHT_READY",
        {"session_id": session_id, "insight": insight},
    )


async def create_session(body: CreateSessionRequest, current_user: dict, supabase: Client) -> dict:
    patient = session_repository.get_patient_by_email(supabase, body.patient_email)
    if not patient:
        raise_not_found("No patient found with that email.")

    doctor_id = current_user["id"]
    patient_id = patient["id"]
    if doctor_id == patient_id:
        raise_bad_request("Cannot create session with yourself.")

    session = session_repository.create_session_record(
        supabase,
        {
            "doctor_id": doctor_id,
            "patient_id": patient_id,
            "status": "pending",
            "chief_complaint": body.chief_complaint,
            "is_emergency": body.is_emergency,
            "request_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
            "created_by": doctor_id,
        },
    )
    if not session:
        raise HTTPException(status_code=500, detail="Failed to create session.")

    try:
        session_repository.insert_notification(
            supabase,
            {
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
            },
        )
    except Exception as error:
        logger.warning("Failed to persist session notification session=%s error=%s", session["id"], error)

    session["doctor_name"] = f"Dr. {current_user['first_name']} {current_user['last_name']}".strip()
    session["patient_name"] = f"{patient['first_name']} {patient['last_name']}".strip()
    session["doctor_email"] = current_user["email"]
    session["patient_email"] = patient["email"]

    await manager.send_to_user(
        patient_id,
        "SESSION_REQUESTED",
        {
            "session_id": session["id"],
            "session": session,
            "doctor_id": doctor_id,
            "doctor_name": session["doctor_name"],
            "doctor_email": current_user["email"],
            "chief_complaint": body.chief_complaint,
        },
    )
    return session


async def respond_to_session(body: SessionAcceptReject, current_user: dict, supabase: Client) -> dict:
    session = session_repository.get_pending_session_for_patient(supabase, body.session_id, current_user["id"])
    if not session:
        raise_not_found("Session not found or already responded.")

    new_status = "accepted" if body.action == "accept" else "rejected"
    event = "SESSION_ACCEPTED" if body.action == "accept" else "SESSION_REJECTED"
    update_payload = {"status": new_status, "modified_by": current_user["id"]}
    if body.action == "reject":
        update_payload["rejection_reason"] = body.reason

    session_repository.update_session(supabase, body.session_id, update_payload)
    session_repository.insert_session_state_history(
        supabase,
        {
            "session_id": body.session_id,
            "from_status": "pending",
            "to_status": new_status,
            "changed_by": current_user["id"],
            "reason": body.reason,
        },
    )

    payload = {
        "session_id": body.session_id,
        "patient_id": current_user["id"],
        "patient_name": f"{current_user['first_name']} {current_user['last_name']}".strip(),
        "new_status": new_status,
        "reason": body.reason,
    }
    await manager.send_to_user(session["doctor_id"], event, payload)
    await manager.send_to_user(current_user["id"], event, payload)
    return {"status": new_status, "session_id": body.session_id}


async def start_session(session_id: str, current_user: dict, supabase: Client) -> dict:
    session = session_repository.get_doctor_session_by_status(
        supabase,
        session_id=session_id,
        doctor_id=current_user["id"],
        status="accepted",
    )
    if not session:
        raise_not_found("Session not found or not in accepted state.")

    session_repository.update_session(
        supabase,
        session_id,
        {
            "status": "active",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "modified_by": current_user["id"],
        },
    )
    session_repository.insert_session_state_history(
        supabase,
        {
            "session_id": session_id,
            "from_status": "accepted",
            "to_status": "active",
            "changed_by": current_user["id"],
        },
    )
    ws_payload = {"session_id": session_id, "status": "active"}
    await manager.send_to_user(session["patient_id"], "SESSION_STARTED", ws_payload)
    await manager.send_to_user(current_user["id"], "SESSION_STARTED", ws_payload)
    return {"status": "active", "session_id": session_id}


async def end_session(
    body: EndSessionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict,
    supabase: Client,
) -> dict:
    try:
        session = session_repository.get_doctor_session_by_status(
            supabase,
            session_id=body.session_id,
            doctor_id=current_user["id"],
            status=None,
        )
    except APIError as error:
        if error.code == "PGRST116":
            raise_not_found("Session not found.")
        raise

    if not session:
        raise_not_found("Session not found.")

    current_status = session.get("status", "active")
    if current_status in {"completed", "ended"}:
        return {"status": current_status, "session_id": body.session_id}

    now = datetime.now(timezone.utc).isoformat()
    if current_status == "active":
        session_repository.update_session(
            supabase,
            body.session_id,
            {
                "status": "processing",
                "ended_at": now,
                "session_notes": body.session_notes,
                "modified_by": current_user["id"],
            },
        )
        try:
            session_repository.insert_session_state_history(
                supabase,
                {
                    "session_id": body.session_id,
                    "from_status": "active",
                    "to_status": "processing",
                    "changed_by": current_user["id"],
                },
            )
        except Exception as error:
            logger.warning("Could not insert session state history: %s", error)

        payload = {"session_id": body.session_id, "status": "processing"}
        await manager.send_to_user(session["patient_id"], "SESSION_ENDED", payload)
        await manager.send_to_user(current_user["id"], "SESSION_ENDED", payload)

    if current_status == "active" and not session.get("recording_url"):
        background_tasks.add_task(
            run_ai_pipeline,
            body.session_id,
            current_user["id"],
            session.get("chief_complaint", ""),
            now,
            supabase,
        )
    return {"status": "processing", "session_id": body.session_id}


async def run_ai_pipeline(
    session_id: str,
    doctor_id: str,
    chief_complaint: str,
    start_time: str,
    supabase: Client,
) -> None:
    session_repository.update_session(supabase, session_id, {"status": "processing"})
    context = session_repository.get_session_processing_context(supabase, session_id) or {}
    patient_id = context.get("patient_id")
    patient = context.get("patient") or {}
    doctor = context.get("doctor") or {}

    patient_name = f"{patient.get('first_name', '')} {patient.get('last_name', '')}".strip() or "Unknown"
    doctor_name = f"{doctor.get('first_name', '')} {doctor.get('last_name', '')}".strip() or "Unknown"
    patient_gender = patient.get("gender", "Unknown")
    patient_age = _estimate_age(patient.get("date_of_birth"))

    try:
        chunks = session_repository.get_transcript_chunks_for_pipeline(supabase, session_id)
        transcript = "\n".join(f"[{chunk['speaker_role']}]: {chunk['raw_text']}" for chunk in chunks)
        if transcript:
            try:
                session_repository.create_final_transcript(
                    supabase,
                    {
                        "session_id": session_id,
                        "full_text": transcript,
                        "total_chunks": len(chunks),
                    },
                )
            except Exception as error:
                logger.warning("Could not store final transcript for session=%s error=%s", session_id, error)

        insights = session_repository.get_pre_session_insights(supabase, session_id)
        report_summaries: list[str] = []
        for insight in insights:
            parts: list[str] = []
            if insight.get("summary"):
                parts.append(insight["summary"])
            findings = insight.get("key_findings")
            if isinstance(findings, list) and findings:
                parts.append("Key findings: " + "; ".join(str(item) for item in findings))
            elif isinstance(findings, str) and findings:
                parts.append(f"Key findings: {findings}")
            meds = insight.get("medications_found")
            if isinstance(meds, list) and meds:
                parts.append("Medications: " + ", ".join(str(item) for item in meds))
            allergies = insight.get("allergies_found")
            if isinstance(allergies, list) and allergies:
                parts.append("Allergies: " + ", ".join(str(item) for item in allergies))
            if parts:
                report_summaries.append(". ".join(parts))

        emr_content = await asyncio.to_thread(
            ai_service.generate_emr_draft,
            chief_complaint=chief_complaint,
            document_insights=report_summaries,
            audio_url=context.get("recording_url"),
            transcript=transcript,
            patient_name=patient_name,
            patient_gender=patient_gender,
            patient_age=patient_age,
            doctor_id=doctor_id,
            doctor_name=doctor_name,
            patient_id=patient_id,
        )

        draft_result = (
            supabase.table("emr_drafts")
            .insert(
                {
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
                }
            )
            .execute()
        )
        draft_id = draft_result.data[0]["id"] if draft_result.data else None

        diagnoses = emr_content.get("diagnoses", [])
        if diagnoses:
            icd_mappings = await asyncio.to_thread(
                ai_service.map_icd_codes,
                diagnoses,
                context.get("recording_url"),
                transcript,
            )
            for mapping in icd_mappings:
                try:
                    (
                        supabase.table("icd_mappings")
                        .insert(
                            {
                                "session_id": session_id,
                                "emr_draft_id": draft_id,
                                "diagnosis_text": mapping.get("diagnosis_text", ""),
                                "icd_code": mapping.get("icd_code"),
                                "icd_description": mapping.get("icd_description"),
                                "confidence_score": mapping.get("confidence_score"),
                                "is_primary": mapping.get("is_primary", False),
                                "match_method": "llm",
                                "approval_status": "pending",
                            }
                        )
                        .execute()
                    )
                except Exception as error:
                    logger.warning("Failed to insert ICD mapping for session=%s error=%s", session_id, error)

        treatments = await asyncio.to_thread(
            ai_service.suggest_treatments,
            diagnoses=diagnoses,
            current_medications=emr_content.get("medications"),
            audio_url=context.get("recording_url"),
            transcript=transcript,
        )
        if treatments:
            try:
                (
                    supabase.table("treatment_suggestions")
                    .insert(
                        [
                            {
                                "session_id": session_id,
                                "emr_draft_id": draft_id,
                                "suggestion_type": item.get("suggestion_type"),
                                "title": item.get("title", "Untitled"),
                                "description": item.get("description"),
                                "rationale": item.get("rationale"),
                                "evidence_basis": item.get("evidence_basis"),
                                "priority": item.get("priority"),
                                "contraindications": item.get("contraindications"),
                                "model_used": "external-ai-audio",
                                "approval_status": "pending",
                            }
                            for item in treatments
                        ]
                    )
                    .execute()
                )
            except Exception as error:
                logger.warning("Failed to insert treatment suggestions for session=%s error=%s", session_id, error)

        summary = await asyncio.to_thread(
            ai_service.generate_patient_summary,
            emr_content,
            diagnoses,
            treatments,
        )
        try:
            (
                supabase.table("patient_summaries")
                .insert(
                    {
                        "session_id": session_id,
                        "summary_text": summary.get("summary_text", ""),
                        "key_takeaways": summary.get("key_takeaways"),
                        "medications_list": summary.get("medications_list"),
                        "follow_up_notes": summary.get("follow_up_notes"),
                        "warnings": summary.get("warnings"),
                        "model_used": "external-ai-audio",
                        "approval_status": "pending",
                    }
                )
                .execute()
            )
        except Exception as error:
            logger.warning("Failed to insert patient summary for session=%s error=%s", session_id, error)

        session_repository.update_session(supabase, session_id, {"status": "completed"})
        await manager.send_to_user(doctor_id, "EMR_DRAFT_READY", {"session_id": session_id, "draft_id": draft_id})

        done_payload = {"session_id": session_id, "status": "completed"}
        await manager.send_to_user(doctor_id, "AI_PROCESSING_COMPLETE", done_payload)
        if patient_id:
            await manager.send_to_user(patient_id, "AI_PROCESSING_COMPLETE", done_payload)
    except Exception as error:
        logger.exception("AI pipeline failed session=%s error=%s", session_id, error)
        session_repository.update_session(supabase, session_id, {"status": "completed"})
        done_payload = {"session_id": session_id, "status": "completed"}
        await manager.send_to_user(doctor_id, "AI_PROCESSING_COMPLETE", done_payload)
        if patient_id:
            await manager.send_to_user(patient_id, "AI_PROCESSING_COMPLETE", done_payload)
        await manager.send_to_user(
            doctor_id,
            "ERROR",
            {
                "message": "AI processing encountered an error.",
                "session_id": session_id,
            },
        )


def list_sessions(
    *,
    status_filter: str | None,
    page: int,
    page_size: int,
    current_user: dict,
    supabase: Client,
) -> dict:
    if status_filter and status_filter not in VALID_SESSION_STATUSES:
        raise_bad_request("Invalid session status filter.")

    start = (page - 1) * page_size
    end = start + page_size - 1
    sessions, total_count = session_repository.list_sessions_for_user(
        supabase,
        user_id=current_user["id"],
        role=current_user["role"],
        status_filter=status_filter,
        start=start,
        end=end,
    )

    parsed_sessions = [_build_display_names(item) for item in sessions]
    total_pages = (total_count + page_size - 1) // page_size
    return {
        "sessions": parsed_sessions,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def list_patients(*, current_user: dict, supabase: Client) -> list[dict]:
    rows = session_repository.list_patients_for_doctor(supabase, current_user["id"])
    seen: dict[str, dict] = {}
    for row in rows:
        patient_id = row["patient_id"]
        patient = row.get("patient") or {}
        if patient_id not in seen:
            seen[patient_id] = {
                "id": patient_id,
                "name": f"{patient.get('first_name', '')} {patient.get('last_name', '')}".strip(),
                "email": patient.get("email", ""),
                "phone": patient.get("phone", ""),
                "session_count": 0,
                "last_session_at": row["created_at"],
                "last_session_status": row["status"],
            }
        seen[patient_id]["session_count"] += 1
    return list(seen.values())


def get_patient_detail(patient_id: str, *, current_user: dict, supabase: Client) -> dict:
    if not session_repository.doctor_has_session_with_patient(supabase, current_user["id"], patient_id):
        raise_forbidden("Access denied.")

    user = session_repository.get_patient_base_info(supabase, patient_id)
    if not user:
        raise_not_found("Patient not found.")
    profile = session_repository.get_patient_profile(supabase, patient_id)
    return {
        "id": user["id"],
        "name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
        "email": user.get("email", ""),
        "phone": user.get("phone"),
        "date_of_birth": user.get("date_of_birth"),
        "gender": user.get("gender"),
        "mrn": profile.get("mrn"),
        "blood_type": profile.get("blood_type"),
        "height_cm": profile.get("height_cm"),
        "weight_kg": profile.get("weight_kg"),
        "emergency_contact_name": profile.get("emergency_contact_name"),
        "emergency_contact_phone": profile.get("emergency_contact_phone"),
        "emergency_contact_relation": profile.get("emergency_contact_relation"),
        "insurance_provider": profile.get("insurance_provider"),
        "insurance_policy_number": profile.get("insurance_policy_number"),
    }


async def get_session_detail(session_id: str, *, current_user: dict, supabase: Client) -> dict:
    try:
        session = session_repository.get_session_with_participants(supabase, session_id)
    except APIError as error:
        if error.code == "PGRST116":
            raise_not_found("Session not found.")
        raise
    if not session:
        raise_not_found("Session not found.")
    if current_user["id"] not in {session["doctor_id"], session["patient_id"]}:
        raise_forbidden("Access denied.")
    return _build_display_names(session)


def get_recording_url(session_id: str, *, current_user: dict, supabase: Client) -> dict:
    session = session_repository.get_session_by_id(supabase, session_id)
    if not session:
        raise_not_found("Session not found.")
    if current_user["id"] not in {session["doctor_id"], session["patient_id"]}:
        raise_forbidden("Access denied.")
    recording_url = session.get("recording_url")
    if not recording_url:
        raise_not_found("Recording not available for this session.")
    return {"session_id": session_id, "recording_url": recording_url}


def get_transcript(session_id: str, *, current_user: dict, supabase: Client) -> list[dict]:
    _assert_user_is_session_participant(supabase, session_id, current_user["id"])
    return session_repository.get_transcript_chunks(supabase, session_id)


def get_session_notifications(session_id: str, *, current_user: dict, supabase: Client) -> list[dict]:
    _assert_user_is_session_participant(supabase, session_id, current_user["id"])
    return session_repository.get_session_notifications_for_user(supabase, session_id, current_user["id"])


async def run_audio_transcription(
    session_id: str,
    recording_url: str,
    user_id: str,
    supabase: Client,
) -> None:
    try:
        transcript_text = await asyncio.to_thread(ai_service.transcribe_audio_from_url, recording_url)
        if transcript_text:
            try:
                session_repository.insert_transcript_chunk(
                    supabase,
                    {
                        "session_id": session_id,
                        "chunk_index": 0,
                        "speaker_role": "doctor",
                        "raw_text": transcript_text,
                        "is_final": True,
                    },
                )
            except Exception as error:
                logger.warning("Failed to persist generated transcript session=%s error=%s", session_id, error)
            await manager.send_to_user(
                user_id,
                "TRANSCRIPTION_COMPLETE",
                {"session_id": session_id, "status": "success", "recording_url": recording_url},
            )
        else:
            logger.warning("Transcription returned empty output session=%s", session_id)

        session_context = session_repository.get_session_processing_context(supabase, session_id) or {}
        await run_ai_pipeline(
            session_id,
            user_id,
            session_context.get("chief_complaint", ""),
            session_context.get("ended_at") or datetime.now(timezone.utc).isoformat(),
            supabase,
        )
    except Exception as error:
        logger.exception("Background transcription failed session=%s error=%s", session_id, error)
        session_context = session_repository.get_session_processing_context(supabase, session_id) or {}
        await run_ai_pipeline(
            session_id,
            user_id,
            session_context.get("chief_complaint", ""),
            session_context.get("ended_at") or datetime.now(timezone.utc).isoformat(),
            supabase,
        )


async def transcribe_audio(
    *,
    background_tasks: BackgroundTasks,
    session_id: str,
    file: UploadFile,
    current_user: dict,
    supabase: Client,
) -> dict:
    _assert_doctor_owns_session(supabase, session_id, current_user["id"])
    content = await file.read()
    ensure_file_constraints(
        file=file,
        content=content,
        max_bytes=settings.MAX_AUDIO_BYTES,
        allowed_mime_types=csv_to_set(settings.ALLOWED_AUDIO_MIME_TYPES),
        empty_error="Audio file is empty.",
    )

    file_extension = file.filename.split(".")[-1] if file.filename and "." in file.filename else "webm"
    s3_key = f"recordings/{session_id}.{file_extension}"
    uploaded_key = await asyncio.to_thread(
        s3_service.upload_file,
        content,
        s3_key,
        file.content_type or "audio/webm",
    )
    recording_url = f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{uploaded_key}"
    session_repository.update_session(supabase, session_id, {"recording_url": recording_url})

    background_tasks.add_task(run_audio_transcription, session_id, recording_url, current_user["id"], supabase)
    return {
        "status": "processing",
        "recording_url": recording_url,
        "session_id": session_id,
        "message": "Audio uploaded. Transcription is processing in the background.",
    }


async def upload_recording(
    *,
    background_tasks: BackgroundTasks,
    session_id: str,
    file: UploadFile,
    current_user: dict,
    supabase: Client,
) -> dict:
    return await transcribe_audio(
        background_tasks=background_tasks,
        session_id=session_id,
        file=file,
        current_user=current_user,
        supabase=supabase,
    )
