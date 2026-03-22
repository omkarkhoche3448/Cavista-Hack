from __future__ import annotations

from fastapi import BackgroundTasks, Depends, File, Form, Response, UploadFile
from supabase import Client

from ..config.database import get_supabase
from ..models.schemas import DocumentResponse, ShareDocumentsRequest
from ..services.auth_dependencies import get_current_user, require_role
from ..services import document_service


async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form("other"),
    description: str | None = Form(None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> DocumentResponse:
    return await document_service.upload_document(
        background_tasks=background_tasks,
        file=file,
        title=title,
        document_type=document_type,
        description=description,
        current_user=current_user,
        supabase=supabase,
    )


def list_documents(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[DocumentResponse]:
    return document_service.list_documents(current_user=current_user, supabase=supabase)


def get_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> DocumentResponse:
    return document_service.get_document(document_id, current_user=current_user, supabase=supabase)


def delete_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> Response:
    document_service.delete_document(document_id, current_user=current_user, supabase=supabase)
    return Response(status_code=204)


def get_document_analysis(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return document_service.get_document_analysis(document_id, current_user=current_user, supabase=supabase)


async def share_documents(
    body: ShareDocumentsRequest,
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return await document_service.share_documents(body, current_user=current_user, supabase=supabase)


def get_session_documents(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    return document_service.get_session_documents(session_id, current_user=current_user, supabase=supabase)

