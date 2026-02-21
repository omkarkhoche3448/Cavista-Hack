"""
Document Router — Upload, list, share medical documents.
Uses Supabase Storage for file uploads.
"""

import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from supabase import Client

from ..db import get_supabase
from ..oauth2 import get_current_user, require_role
from ..ws_manager import manager
from ..models import DocumentResponse, ShareDocumentsRequest
from ..services import ai_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])

BUCKET_NAME = "medical-documents"


@router.post("", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form("other"),
    description: str = Form(None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Upload a medical document. Only patients can upload their own files."""
    if current_user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can upload documents.")

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Generate storage key
    file_ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    storage_key = f"{current_user['id']}/{uuid.uuid4()}.{file_ext}"

    # Upload to Supabase Storage
    try:
        supabase.storage.from_(BUCKET_NAME).upload(
            path=storage_key,
            file=content,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")
        # Try creating bucket first
        try:
            supabase.storage.create_bucket(BUCKET_NAME, options={"public": False})
            supabase.storage.from_(BUCKET_NAME).upload(
                path=storage_key,
                file=content,
                file_options={"content-type": file.content_type or "application/octet-stream"},
            )
        except Exception as e2:
            logger.error(f"Storage upload retry failed: {e2}")
            raise HTTPException(status_code=500, detail="Failed to upload file.")

    # Get signed URL
    try:
        url_res = supabase.storage.from_(BUCKET_NAME).create_signed_url(storage_key, 3600)
        signed_url = url_res.get("signedURL", "") if isinstance(url_res, dict) else ""
    except Exception:
        signed_url = ""

    # Insert document record
    doc_data = {
        "patient_id": current_user["id"],
        "uploaded_by": current_user["id"],
        "document_type": document_type,
        "status": "uploaded",
        "title": title,
        "description": description,
        "file_name": file.filename,
        "file_mime_type": file.content_type or "application/octet-stream",
        "file_size_bytes": file_size,
        "storage_bucket": BUCKET_NAME,
        "storage_key": storage_key,
        "storage_url": signed_url,
        "created_by": current_user["id"],
    }

    result = supabase.table("medical_documents").insert(doc_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create document record.")

    return result.data[0]


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """List documents for the current patient."""
    if current_user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can list their documents.")

    result = (
        supabase.table("medical_documents")
        .select("*")
        .eq("patient_id", current_user["id"])
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )

    # Refresh signed URLs
    docs = []
    for doc in (result.data or []):
        try:
            url_res = supabase.storage.from_(BUCKET_NAME).create_signed_url(
                doc["storage_key"], 3600
            )
            doc["storage_url"] = url_res.get("signedURL", "") if isinstance(url_res, dict) else ""
        except Exception:
            pass
        docs.append(doc)

    return docs


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get a single document."""
    result = (
        supabase.table("medical_documents")
        .select("*")
        .eq("id", document_id)
        .is_("deleted_at", "null")
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc = result.data
    # Check access: must be owner or doctor with shared access
    if doc["patient_id"] != current_user["id"]:
        if current_user["role"] == "doctor":
            shares = (
                supabase.table("session_document_shares")
                .select("id")
                .eq("document_id", document_id)
                .is_("revoked_at", "null")
                .execute()
            )
            if not shares.data:
                raise HTTPException(status_code=403, detail="Access denied.")
        else:
            raise HTTPException(status_code=403, detail="Access denied.")

    return doc


@router.post("/share")
async def share_documents(
    body: ShareDocumentsRequest,
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
):
    """Patient shares selected documents with a session's doctor."""
    # Verify the session exists and patient owns it
    session = (
        supabase.table("sessions")
        .select("id, doctor_id, patient_id, status")
        .eq("id", body.session_id)
        .eq("patient_id", current_user["id"])
        .single()
        .execute()
    )

    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found.")

    if session.data["status"] not in ["accepted", "active", "pending"]:
        raise HTTPException(status_code=400, detail="Session is not in a shareable state.")

    shared = []
    for doc_id in body.document_ids:
        # Verify doc belongs to patient
        doc = (
            supabase.table("medical_documents")
            .select("id, title, file_name, document_type, storage_key")
            .eq("id", doc_id)
            .eq("patient_id", current_user["id"])
            .single()
            .execute()
        )
        if not doc.data:
            continue

        # Create share record (upsert)
        try:
            supabase.table("session_document_shares").insert({
                "session_id": body.session_id,
                "document_id": doc_id,
                "shared_by": current_user["id"],
            }).execute()
            shared.append(doc.data)
        except Exception:
            # Already shared — skip
            shared.append(doc.data)

    # Notify both parties via WebSocket
    doctor_id = session.data["doctor_id"]
    ws_payload = {
        "session_id": body.session_id,
        "patient_id": current_user["id"],
        "documents": [
            {"id": d["id"], "title": d["title"], "file_name": d["file_name"], "type": d["document_type"]}
            for d in shared
        ],
    }
    await manager.send_to_user(doctor_id, "FILE_SHARED", ws_payload)
    await manager.send_to_user(current_user["id"], "FILE_SHARED", ws_payload)

    # Trigger AI document analysis for each shared doc
    for doc in shared:
        try:
            # Get document content (for text-based files)
            storage_key = doc.get("storage_key", "")
            doc_text = f"Document: {doc['title']} (Type: {doc['document_type']})\nFile: {doc['file_name']}"
            # For a real implementation, you'd OCR or parse the document here
            # For now, we'll just send the metadata to the AI

            insight = ai_service.analyze_document(doc_text, doc.get("document_type", "medical record"))

            # Store insight
            supabase.from_("pre_session_insights").insert({
                "session_id": body.session_id,
                "document_id": doc["id"],
                "summary": insight.get("summary"),
                "risk_flags": insight.get("risk_flags"),
                "key_findings": insight.get("key_findings"),
                "medications_found": insight.get("medications_found"),
                "allergies_found": insight.get("allergies_found"),
                "model_used": "gemini-2.0-flash",
            }).execute()

            # Send insight to doctor
            await manager.send_to_user(doctor_id, "AI_INSIGHT_READY", {
                "session_id": body.session_id,
                "document_id": doc["id"],
                "insight": insight,
            })
        except Exception as e:
            logger.error(f"Document analysis failed for {doc['id']}: {e}")

    return {"shared": len(shared), "documents": shared}


@router.get("/session/{session_id}")
def get_session_documents(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Get all documents shared in a session."""
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

    shares = (
        supabase.table("session_document_shares")
        .select("document_id, created_at, medical_documents(*)")
        .eq("session_id", session_id)
        .is_("revoked_at", "null")
        .execute()
    )

    docs = []
    for share in (shares.data or []):
        doc = share.get("medical_documents", {})
        if doc:
            # Refresh signed URL
            try:
                url_res = supabase.storage.from_(BUCKET_NAME).create_signed_url(
                    doc["storage_key"], 3600
                )
                doc["storage_url"] = url_res.get("signedURL", "") if isinstance(url_res, dict) else ""
            except Exception:
                pass
            docs.append(doc)

    return docs
