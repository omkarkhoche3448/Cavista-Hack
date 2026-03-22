from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone

from fastapi import BackgroundTasks, HTTPException
from supabase import Client

from ..repositories import emr_repository, session_repository
from . import ai_service, s3_service
from ..services.websocket_manager import manager
from ..utils.errors import raise_bad_request, raise_forbidden, raise_not_found

logger = logging.getLogger(__name__)
ICD_ACTION_MAP = {
    "approve": "approved",
    "approved": "approved",
    "reject": "rejected",
    "rejected": "rejected",
}


def _assert_doctor_owns_session(supabase: Client, session_id: str, doctor_id: str) -> dict:
    session = session_repository.get_session_by_id(supabase, session_id)
    if not session:
        raise_not_found("Session not found.")
    if session.get("doctor_id") != doctor_id:
        raise_forbidden("Access denied.")
    return session


def _assert_user_participates_session(supabase: Client, session_id: str, user_id: str) -> dict:
    session = session_repository.get_session_participants(supabase, session_id)
    if not session:
        raise_not_found("Session not found.")
    if user_id not in {session["doctor_id"], session["patient_id"]}:
        raise_forbidden("Access denied.")
    return session


def get_emr_drafts(session_id: str, *, current_user: dict, supabase: Client) -> list[dict]:
    _assert_doctor_owns_session(supabase, session_id, current_user["id"])
    return emr_repository.list_emr_drafts_for_session(supabase, session_id)


def get_emr_draft(draft_id: str, *, current_user: dict, supabase: Client) -> dict:
    draft = emr_repository.get_emr_draft_by_id(supabase, draft_id)
    if not draft:
        raise_not_found("EMR draft not found.")
    _assert_doctor_owns_session(supabase, draft["session_id"], current_user["id"])
    return draft


async def approve_emr(
    *,
    draft_id: str,
    review_notes: str | None,
    edits: dict | None,
    background_tasks: BackgroundTasks,
    current_user: dict,
    supabase: Client,
) -> dict:
    draft = emr_repository.get_emr_draft_by_id(supabase, draft_id)
    if not draft:
        raise_not_found("Draft not found.")
    if draft.get("status") not in {"pending_approval", "draft"}:
        raise HTTPException(status_code=400, detail="Draft is not in reviewable state.")

    session = _assert_doctor_owns_session(supabase, draft["session_id"], current_user["id"])
    if emr_repository.get_final_emr_for_session(supabase, draft["session_id"]):
        raise HTTPException(status_code=409, detail="Session EMR is already finalized.")
    now = datetime.now(timezone.utc).isoformat()

    if edits:
        emr_repository.update_emr_draft(supabase, draft_id, edits)
        draft = emr_repository.get_emr_draft_by_id(supabase, draft_id) or draft

    emr_repository.update_emr_draft(
        supabase,
        draft_id,
        {
            "status": "approved",
            "reviewed_by": current_user["id"],
            "reviewed_at": now,
            "approved_at": now,
            "approved_by": current_user["id"],
            "review_notes": review_notes,
        },
    )

    emr_content = {
        key: value
        for key, value in draft.items()
        if key
        not in {
            "id",
            "session_id",
            "ai_job_id",
            "version",
            "status",
            "model_used",
            "model_version",
            "prompt_version",
            "generation_confidence",
            "raw_llm_output",
            "submitted_for_review_at",
            "reviewed_by",
            "reviewed_at",
            "review_notes",
            "approved_at",
            "approved_by",
            "created_at",
            "updated_at",
            "created_by",
            "modified_by",
        }
    }
    checksum = hashlib.sha256(json.dumps(emr_content, sort_keys=True, default=str).encode()).hexdigest()

    final = emr_repository.create_final_emr(
        supabase,
        {
            "session_id": draft["session_id"],
            "draft_id": draft_id,
            "doctor_id": current_user["id"],
            "patient_id": session["patient_id"],
            "emr_content": emr_content,
            "emr_checksum": checksum,
            "approved_by": current_user["id"],
        },
    )
    final_emr_id = final["id"] if final else None
    emr_repository.approve_patient_summary_for_session(
        supabase,
        session_id=draft["session_id"],
        approved_by=current_user["id"],
        now_iso=now,
    )
    session_repository.update_session(
        supabase,
        draft["session_id"],
        {"status": "completed", "modified_by": current_user["id"]},
    )

    background_tasks.add_task(
        generate_and_upload_emr_pdf,
        session_id=draft["session_id"],
        draft_id=draft_id,
        final_emr_id=final_emr_id,
        patient_id=session["patient_id"],
        doctor_id=current_user["id"],
        supabase=supabase,
    )

    await manager.send_to_user(
        session["patient_id"],
        "PATIENT_SUMMARY_READY",
        {"session_id": draft["session_id"]},
    )
    return {"status": "approved", "session_id": draft["session_id"]}


async def generate_and_upload_emr_pdf(
    *,
    session_id: str,
    draft_id: str,
    final_emr_id: str | None,
    patient_id: str,
    doctor_id: str,
    supabase: Client,
) -> None:
    try:
        chunks = session_repository.get_transcript_chunks_for_pipeline(supabase, session_id)
        transcript = "\n".join(f"[{chunk['speaker_role']}]: {chunk['raw_text']}" for chunk in chunks)

        insights = emr_repository.list_pre_session_insights(supabase, session_id)
        report_summaries: list[str] = []
        for insight in insights:
            parts = [insight.get("summary")] if insight.get("summary") else []
            findings = insight.get("key_findings")
            if findings:
                joined = "; ".join(findings) if isinstance(findings, list) else str(findings)
                parts.append(f"Key findings: {joined}")
            if parts:
                report_summaries.append(". ".join(parts))

        session_info = session_repository.get_session_with_participants(supabase, session_id) or {}
        doctor = session_info.get("doctor") or {}
        patient = session_info.get("patient") or {}
        doctor_name = f"Dr. {doctor.get('first_name', '')} {doctor.get('last_name', '')}".strip()
        patient_name = f"{patient.get('first_name', '')} {patient.get('last_name', '')}".strip()

        emr_content = {}
        if final_emr_id:
            final = (
                supabase.table("final_emrs")
                .select("emr_content")
                .eq("id", final_emr_id)
                .single()
                .execute()
            )
            if final.data:
                emr_content = final.data.get("emr_content", {})

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
        if not pdf_bytes:
            return

        key = f"emr-pdfs/{session_id}/{draft_id}.pdf"
        await asyncio.to_thread(
            s3_service.upload_file,
            pdf_bytes,
            key,
            "application/pdf",
        )
        if final_emr_id:
            (
                supabase.table("final_emrs")
                .update({"pdf_s3_key": key})
                .eq("id", final_emr_id)
                .execute()
            )
        await manager.send_to_user(doctor_id, "EMR_PDF_READY", {"session_id": session_id})
    except Exception as error:
        logger.exception("PDF background generation failed session=%s error=%s", session_id, error)


def get_emr_pdf_url(session_id: str, *, current_user: dict, supabase: Client) -> dict:
    _assert_doctor_owns_session(supabase, session_id, current_user["id"])
    final = emr_repository.get_final_emr_for_session(supabase, session_id)
    if not final or not final.get("pdf_s3_key"):
        raise_not_found("PDF not available for this session.")
    url = s3_service.generate_presigned_url(final["pdf_s3_key"], expiry=3600)
    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate download URL.")
    return {"pdf_url": url}


def get_patient_summary(session_id: str, *, current_user: dict, supabase: Client) -> dict:
    session = _assert_user_participates_session(supabase, session_id, current_user["id"])
    summary = emr_repository.get_patient_summary(supabase, session_id)
    if not summary:
        raise_not_found("Summary not found.")
    if current_user["role"] == "patient":
        if summary.get("approval_status") != "approved" or not summary.get("sent_to_patient_at"):
            raise_not_found("Summary not available yet.")
    return summary


def get_icd_mappings(session_id: str, *, current_user: dict, supabase: Client) -> list[dict]:
    _assert_doctor_owns_session(supabase, session_id, current_user["id"])
    return emr_repository.list_icd_mappings_for_session(supabase, session_id)


def update_icd_mapping(
    mapping_id: str,
    *,
    action: str,
    current_user: dict,
    supabase: Client,
) -> dict:
    normalized_action = ICD_ACTION_MAP.get(action.strip().lower())
    if not normalized_action:
        raise_bad_request("Invalid action. Use approve or reject.")

    mapping = emr_repository.get_icd_mapping_by_id(supabase, mapping_id)
    if not mapping:
        raise_not_found("ICD mapping not found.")
    _assert_doctor_owns_session(supabase, mapping["session_id"], current_user["id"])

    now_iso = datetime.now(timezone.utc).isoformat()
    emr_repository.update_icd_mapping(
        supabase,
        mapping_id,
        {
            "approval_status": normalized_action,
            "approved_by": current_user["id"],
            "approved_at": now_iso,
        },
    )
    return {"status": normalized_action, "mapping_id": mapping_id, "session_id": mapping["session_id"]}


def get_treatments(session_id: str, *, current_user: dict, supabase: Client) -> list[dict]:
    _assert_doctor_owns_session(supabase, session_id, current_user["id"])
    return emr_repository.list_treatment_suggestions_for_session(supabase, session_id)


def approve_treatment(
    *,
    suggestion_id: str,
    action: str,
    doctor_notes: str | None,
    current_user: dict,
    supabase: Client,
) -> dict:
    normalized_action = ICD_ACTION_MAP.get(action.strip().lower())
    if not normalized_action:
        raise_bad_request("Invalid action. Use approve or reject.")

    treatment = emr_repository.get_treatment_suggestion_by_id(supabase, suggestion_id)
    if not treatment:
        raise_not_found("Treatment suggestion not found.")
    _assert_doctor_owns_session(supabase, treatment["session_id"], current_user["id"])

    emr_repository.update_treatment_suggestion(
        supabase,
        suggestion_id,
        {
            "approval_status": normalized_action,
            "doctor_notes": doctor_notes,
            "approved_by": current_user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {"status": normalized_action, "suggestion_id": suggestion_id, "session_id": treatment["session_id"]}


def approve_patient_summary(
    *,
    summary_id: str,
    edits: dict | None,
    current_user: dict,
    supabase: Client,
) -> dict:
    summary = emr_repository.get_patient_summary_by_id(supabase, summary_id)
    if not summary:
        raise_not_found("Patient summary not found.")
    _assert_doctor_owns_session(supabase, summary["session_id"], current_user["id"])

    now_iso = datetime.now(timezone.utc).isoformat()
    updates: dict = {
        "approval_status": "approved",
        "approved_by": current_user["id"],
        "approved_at": now_iso,
        "sent_to_patient_at": now_iso,
    }
    if edits:
        allowed_fields = {
            "summary_text",
            "key_takeaways",
            "medications_list",
            "follow_up_date",
            "follow_up_notes",
            "warnings",
        }
        for key, value in edits.items():
            if key in allowed_fields:
                updates[key] = value

    emr_repository.update_patient_summary(supabase, summary_id, updates)
    return {"status": "approved", "summary_id": summary_id, "session_id": summary["session_id"]}


def get_insights(session_id: str, *, current_user: dict, supabase: Client) -> list[dict]:
    _assert_doctor_owns_session(supabase, session_id, current_user["id"])
    return emr_repository.list_pre_session_insights(supabase, session_id)


def get_notifications(*, current_user: dict, supabase: Client) -> list[dict]:
    return emr_repository.list_notifications_for_user(supabase, current_user["id"], limit=50)


def mark_notification_read(notification_id: str, *, current_user: dict, supabase: Client) -> dict:
    emr_repository.mark_notification_read(
        supabase,
        notification_id,
        current_user["id"],
        datetime.now(timezone.utc).isoformat(),
    )
    return {"status": "read"}
