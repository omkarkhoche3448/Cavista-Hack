from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import BackgroundTasks, HTTPException, UploadFile
from supabase import Client

from ..config.settings import settings
from ..models.schemas import ShareDocumentsRequest
from ..repositories import document_repository, session_repository
from . import ai_service, s3_service
from ..services.websocket_manager import manager
from ..utils.errors import raise_bad_request, raise_forbidden, raise_not_found
from ..utils.validation import csv_to_set, ensure_file_constraints

logger = logging.getLogger(__name__)
ALLOWED_DOCUMENT_TYPES = {
    "lab_report",
    "imaging",
    "prescription",
    "discharge_summary",
    "referral_letter",
    "consent_form",
    "insurance",
    "other",
}


def _enrich_document(document: dict) -> dict:
    enriched = dict(document)
    if enriched.get("storage_key"):
        enriched["storage_url"] = s3_service.generate_presigned_url(enriched["storage_key"])
    raw = enriched.get("ocr_extracted_text")
    if raw:
        try:
            enriched["analysis_result"] = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            enriched["analysis_result"] = None
    else:
        enriched["analysis_result"] = None
    return enriched


def _can_access_document(*, current_user: dict, document: dict, supabase: Client) -> bool:
    if document["patient_id"] == current_user["id"]:
        return True
    if current_user["role"] == "doctor":
        return document_repository.has_active_doctor_share_access(
            supabase,
            doctor_id=current_user["id"],
            document_id=document["id"],
        )
    return False


async def _run_document_analysis(
    *,
    document_id: str,
    signed_url: str,
    user_id: str,
    patient_name: str,
    document_type: str,
    supabase: Client,
) -> None:
    try:
        analysis_data = await asyncio.to_thread(
            ai_service.analyze_lab_report,
            signed_url,
            user_id,
            patient_name,
            document_type,
        )
        if analysis_data:
            document_repository.update_document_status(
                supabase,
                document_id,
                {"ocr_extracted_text": json.dumps(analysis_data), "status": "ready"},
            )
            await manager.send_to_user(
                user_id,
                "DOCUMENT_ANALYSIS_COMPLETE",
                {"document_id": document_id, "status": "ready", "analysis": analysis_data},
            )
            return
    except Exception as error:
        logger.exception("Document analysis failed document_id=%s error=%s", document_id, error)

    document_repository.update_document_status(supabase, document_id, {"status": "failed"})


async def upload_document(
    *,
    background_tasks: BackgroundTasks,
    file: UploadFile,
    title: str,
    document_type: str,
    description: str | None,
    current_user: dict,
    supabase: Client,
) -> dict:
    if current_user["role"] != "patient":
        raise_forbidden("Only patients can upload documents.")
    if document_type not in ALLOWED_DOCUMENT_TYPES:
        raise_bad_request("Invalid document type.")

    content = await file.read()
    ensure_file_constraints(
        file=file,
        content=content,
        max_bytes=settings.MAX_UPLOAD_BYTES,
        allowed_mime_types=csv_to_set(settings.ALLOWED_DOCUMENT_MIME_TYPES),
        empty_error="Document is empty.",
    )

    extension = file.filename.split(".")[-1] if file.filename and "." in file.filename else "bin"
    storage_key = f"{current_user['id']}/{uuid.uuid4()}.{extension}"
    await asyncio.to_thread(
        s3_service.upload_file,
        content,
        storage_key,
        file.content_type or "application/octet-stream",
    )
    signed_url = s3_service.generate_presigned_url(storage_key)

    document = document_repository.create_document(
        supabase,
        {
            "patient_id": current_user["id"],
            "uploaded_by": current_user["id"],
            "document_type": document_type,
            "status": "uploaded",
            "title": title.strip(),
            "description": description,
            "file_name": file.filename or "document.bin",
            "file_mime_type": file.content_type or "application/octet-stream",
            "file_size_bytes": len(content),
            "storage_bucket": settings.AWS_S3_BUCKET,
            "storage_key": storage_key,
            "storage_url": signed_url,
            "created_by": current_user["id"],
        },
    )
    if not document:
        raise HTTPException(status_code=500, detail="Failed to create document record.")

    patient_name = f"{current_user.get('first_name', '')} {current_user.get('last_name', '')}".strip()
    background_tasks.add_task(
        _run_document_analysis,
        document_id=document["id"],
        signed_url=signed_url,
        user_id=current_user["id"],
        patient_name=patient_name,
        document_type=document_type,
        supabase=supabase,
    )
    return _enrich_document(document)


def list_documents(*, current_user: dict, supabase: Client) -> list[dict]:
    if current_user["role"] != "patient":
        raise_forbidden("Only patients can list their documents.")
    documents = document_repository.list_documents_for_patient(supabase, current_user["id"])
    return [_enrich_document(item) for item in documents]


def get_document(document_id: str, *, current_user: dict, supabase: Client) -> dict:
    document = document_repository.get_document_by_id(supabase, document_id)
    if not document:
        raise_not_found("Document not found.")
    if not _can_access_document(current_user=current_user, document=document, supabase=supabase):
        raise_forbidden("Access denied.")
    return _enrich_document(document)


def delete_document(document_id: str, *, current_user: dict, supabase: Client) -> None:
    document = document_repository.get_document_by_id(supabase, document_id)
    if not document:
        raise_not_found("Document not found.")
    if document["patient_id"] != current_user["id"]:
        raise_forbidden("Access denied.")
    document_repository.soft_delete_document(
        supabase,
        document_id,
        datetime.now(timezone.utc).isoformat(),
    )


def get_document_analysis(document_id: str, *, current_user: dict, supabase: Client) -> dict:
    document = document_repository.get_document_by_id(supabase, document_id)
    if not document:
        raise_not_found("Document not found.")
    if not _can_access_document(current_user=current_user, document=document, supabase=supabase):
        raise_forbidden("Access denied.")

    raw = document.get("ocr_extracted_text")
    if raw:
        try:
            return {"document_id": document_id, "analysis": json.loads(raw)}
        except (TypeError, json.JSONDecodeError):
            pass
    return {"document_id": document_id, "analysis": None}


async def share_documents(body: ShareDocumentsRequest, *, current_user: dict, supabase: Client) -> dict:
    session = document_repository.get_session_for_patient(supabase, body.session_id, current_user["id"])
    if not session:
        raise_not_found("Session not found.")
    if session["status"] not in {"accepted", "active", "pending"}:
        raise_bad_request("Session is not in a shareable state.")

    found_docs = document_repository.list_patient_documents_for_share(
        supabase,
        current_user["id"],
        body.document_ids,
    )
    by_id = {item["id"]: item for item in found_docs}

    shared_docs: list[dict] = []
    for document_id in body.document_ids:
        document = by_id.get(document_id)
        if not document:
            continue
        try:
            document_repository.insert_session_document_share(
                supabase,
                {"session_id": body.session_id, "document_id": document_id, "shared_by": current_user["id"]},
            )
        except Exception:
            # Unique constraint protects duplicate shares.
            pass
        shared_docs.append(document)

    doctor_id = session["doctor_id"]
    enriched_docs: list[dict] = []
    for item in shared_docs:
        entry = {
            "id": item["id"],
            "title": item["title"],
            "file_name": item["file_name"],
            "type": item["document_type"],
            "document_type": item["document_type"],
            "status": item.get("status") or "uploaded",
        }
        if item.get("storage_key"):
            entry["storage_url"] = s3_service.generate_presigned_url(item["storage_key"])
        raw = item.get("ocr_extracted_text")
        if raw:
            try:
                entry["analysis_result"] = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                entry["analysis_result"] = None
        enriched_docs.append(entry)

    payload = {"session_id": body.session_id, "patient_id": current_user["id"], "documents": enriched_docs}
    await manager.send_to_user(doctor_id, "FILE_SHARED", payload)
    await manager.send_to_user(current_user["id"], "FILE_SHARED", payload)

    for document in shared_docs:
        raw = document.get("ocr_extracted_text")
        if not raw:
            continue
        try:
            analysis = json.loads(raw)
            document_repository.create_pre_session_insight(
                supabase,
                {
                    "session_id": body.session_id,
                    "document_id": document["id"],
                    "summary": analysis.get("summary"),
                    "risk_flags": analysis.get("risk_flags"),
                    "key_findings": analysis.get("key_findings"),
                    "medications_found": analysis.get("medications_found"),
                    "allergies_found": analysis.get("allergies_found"),
                    "model_used": "external-lab-analyzer",
                },
            )
            await manager.send_to_user(
                doctor_id,
                "AI_INSIGHT_READY",
                {"session_id": body.session_id, "document_id": document["id"], "insight": analysis},
            )
        except Exception as error:
            logger.warning("Failed to persist pre-session insight document=%s error=%s", document["id"], error)

    return {"shared": len(shared_docs), "documents": enriched_docs}


def get_session_documents(session_id: str, *, current_user: dict, supabase: Client) -> list[dict]:
    session = session_repository.get_session_participants(supabase, session_id)
    if not session or current_user["id"] not in {session["doctor_id"], session["patient_id"]}:
        raise_forbidden("Access denied.")

    shares = document_repository.list_session_documents(supabase, session_id)
    documents: list[dict] = []
    for share in shares:
        document = share.get("medical_documents", {})
        if document and not document.get("deleted_at"):
            documents.append(_enrich_document(document))
    return documents
