"""
Document Router — Upload, list, share medical documents.
Uses AWS S3 for file storage and ai_service for lab report analysis.
"""

import json
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from supabase import Client

from ..config import settings
from ..db import get_supabase
from ..oauth2 import get_current_user, require_role
from ..ws_manager import manager
from ..models import DocumentResponse, ShareDocumentsRequest
from ..services import ai_service, s3_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])


def _enrich_doc(doc: dict) -> dict:
    """
    Post-processes document data from the database for API response.
    
    Why: Generates fresh S3 presigned URLs (which expire) and parses AI analysis strings into JSON objects.
    Where: Internal helper used by all GET endpoints in the documents router.
    
    Args:
        doc (dict): Raw document record from Supabase.
        
    Returns:
        dict: Processed document with `storage_url` and `analysis_result`.
    """
    if doc.get("storage_key"):
        doc["storage_url"] = s3_service.generate_presigned_url(doc["storage_key"])
    raw = doc.get("ocr_extracted_text")
    if raw:
        try:
            doc["analysis_result"] = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            doc["analysis_result"] = None
    else:
        doc["analysis_result"] = None
    return doc


async def run_document_analysis(doc_id: str, signed_url: str, user_id: str, patient_name: str, document_type: str):
    """
    Background worker to perform AI analysis on a document.
    """
    from ..db import get_supabase
    supabase = get_supabase()
    
    try:
        print(f"[ANALYSIS-BG] Starting analysis for doc {doc_id}")
        analysis_data = ai_service.analyze_lab_report(signed_url, user_id, patient_name, document_type)
        if analysis_data:
            supabase.table("medical_documents").update({
                "ocr_extracted_text": json.dumps(analysis_data),
                "status": "ready",
            }).eq("id", doc_id).execute()
            
            # Notify user via WebSocket
            await manager.send_to_user(user_id, "DOCUMENT_ANALYSIS_COMPLETE", {
                "document_id": doc_id,
                "status": "ready",
                "analysis": analysis_data
            })
            print(f"[ANALYSIS-BG] Complete for doc {doc_id}")
        else:
            print(f"[ANALYSIS-BG] No data returned for doc {doc_id}")
            supabase.table("medical_documents").update({"status": "failed"}).eq("id", doc_id).execute()
    except Exception as e:
        print(f"[ANALYSIS-BG] Exception for doc {doc_id}: {e}")
        supabase.table("medical_documents").update({"status": "failed"}).eq("id", doc_id).execute()


@router.post("", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form("other"),
    description: str = Form(None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Handles medical document upload to S3 and triggers AI analysis in the background.
    """
    if current_user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can upload documents.")

    content = await file.read()
    file_ext = file.filename.split(".")[-1] if (file.filename and "." in file.filename) else "bin"
    storage_key = f"{current_user['id']}/{uuid.uuid4()}.{file_ext}"

    try:
        s3_service.upload_file(content, storage_key, file.content_type or "application/octet-stream")
    except Exception as e:
        logger.error(f"S3 upload failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload file.")

    signed_url = s3_service.generate_presigned_url(storage_key)

    doc_data = {
        "patient_id": current_user["id"],
        "uploaded_by": current_user["id"],
        "document_type": document_type,
        "status": "uploaded",
        "title": title,
        "description": description,
        "file_name": file.filename,
        "file_mime_type": file.content_type or "application/octet-stream",
        "file_size_bytes": len(content),
        "storage_bucket": settings.AWS_S3_BUCKET,
        "storage_key": storage_key,
        "storage_url": signed_url,
        "created_by": current_user["id"],
    }

    result = supabase.table("medical_documents").insert(doc_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create document record.")

    doc = result.data[0]

    # Offload analysis to background task so the user doesn't hang
    patient_name = f"{current_user.get('first_name', '')} {current_user.get('last_name', '')}".strip()
    background_tasks.add_task(
        run_document_analysis,
        doc["id"],
        signed_url,
        current_user["id"],
        patient_name,
        document_type
    )

    return _enrich_doc(doc)


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Retrieves all documents owned by the logged-in patient.
    
    Why: Populates the patient's personal medical records vault.
    Where: Called by the Documents list view in the Patient Dashboard.
    
    Returns:
        list: List of enriched documents.
    """
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
    return [_enrich_doc(doc) for doc in (result.data or [])]


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Fetches a single document by ID, verifying access permissions.
    
    Why: Used for detailed document viewing. Ensures HIPAA-compliant access control.
    Where: Called by the Document Detail view and Document Viewer component.
    
    Args:
        document_id (str): Document UUID.
        
    Returns:
        dict: Enriched document record.
        
    Raises:
        HTTPException: 403 if unauthorized, 404 if not found.
    """
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

    return _enrich_doc(doc)


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Soft-delete a document (patients can only delete their own)."""
    result = (
        supabase.table("medical_documents")
        .select("id, patient_id")
        .eq("id", document_id)
        .is_("deleted_at", "null")
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found.")

    if result.data["patient_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    from datetime import datetime, timezone
    supabase.table("medical_documents").update({
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", document_id).execute()


@router.get("/{document_id}/analysis")
def get_document_analysis(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Specifically retrieves the AI-extracted clinical analysis for a document.
    
    Why: Separates raw file access from structured clinical data for optimized UI loading.
    Where: Called by the "AI Insights" panel in the Document Viewer.
    
    Args:
        document_id (str): Document UUID.
        
    Returns:
        dict: Analysis result object.
    """
    result = (
        supabase.table("medical_documents")
        .select("id, patient_id, document_type, storage_key, ocr_extracted_text, status")
        .eq("id", document_id)
        .is_("deleted_at", "null")
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc = result.data
    # Check access
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

    raw = doc.get("ocr_extracted_text")
    if raw:
        try:
            return {"document_id": document_id, "analysis": json.loads(raw)}
        except (json.JSONDecodeError, TypeError):
            pass
    return {"document_id": document_id, "analysis": None}


@router.post("/share")
async def share_documents(
    body: ShareDocumentsRequest,
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
):
    """
    Shares specific documents with a clinical session and notifies the doctor.
    
    Why: Central mechanism for patient-doctor data exchange during consultations.
    Where: Called by the "Share Files" button in the Session Room.
    
    Args:
        body (ShareDocumentsRequest): session_id and list of document_ids.
        
    Returns:
        dict: List of successfully shared documents.
    """
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
        doc = (
            supabase.table("medical_documents")
            .select("id, title, file_name, document_type, storage_key, ocr_extracted_text")
            .eq("id", doc_id)
            .eq("patient_id", current_user["id"])
            .single()
            .execute()
        )
        if not doc.data:
            continue
        try:
            supabase.table("session_document_shares").insert({
                "session_id": body.session_id,
                "document_id": doc_id,
                "shared_by": current_user["id"],
            }).execute()
        except Exception:
            pass  # Already shared — skip
        shared.append(doc.data)

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

    # Store pre-session insights from already-computed analysis
    for doc in shared:
        try:
            raw = doc.get("ocr_extracted_text")
            if raw:
                analysis = json.loads(raw)
                supabase.table("pre_session_insights").insert({
                    "session_id": body.session_id,
                    "document_id": doc["id"],
                    "summary": analysis.get("summary"),
                    "risk_flags": analysis.get("risk_flags"),
                    "key_findings": analysis.get("key_findings"),
                    "medications_found": analysis.get("medications_found"),
                    "allergies_found": analysis.get("allergies_found"),
                    "model_used": "external-lab-analyzer",
                }).execute()
                await manager.send_to_user(doctor_id, "AI_INSIGHT_READY", {
                    "session_id": body.session_id,
                    "document_id": doc["id"],
                    "insight": analysis,
                })
        except Exception as e:
            logger.error(f"Insight storage failed for {doc['id']}: {e}")

    return {"shared": len(shared), "documents": shared}


@router.get("/session/{session_id}")
def get_session_documents(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Lists all documents shared within a specific clinical session.
    
    Why: Allows doctors and patients to see the common set of files under discussion.
    Where: Called by the "Shared Documents" sidebar in the Session Room.
    
    Args:
        session_id (str): Session UUID.
        
    Returns:
        list: List of enriched document records.
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
        shares = (
            supabase.table("session_document_shares")
            .select("document_id, created_at, medical_documents(*)")
            .eq("session_id", session_id)
            .is_("revoked_at", "null")
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching session documents for {session_id}: {e}")
        return []

    docs = []
    for share in (shares.data or []):
        doc = share.get("medical_documents", {})
        if doc:
            docs.append(_enrich_doc(doc))
    return docs
