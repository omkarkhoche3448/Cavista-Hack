from __future__ import annotations

from typing import Optional

from fastapi import Depends, Query, Response
from supabase import Client

from ..config.database import get_supabase
from ..models.schemas import NoteCreate, NoteResponse, NoteUpdate
from ..services.auth_dependencies import require_role
from ..services import note_service


def create_note(
    body: NoteCreate,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> NoteResponse:
    return note_service.create_note(body, current_user=current_user, supabase=supabase)


def list_notes(
    patient_id: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> list[NoteResponse]:
    return note_service.list_notes(
        patient_id=patient_id,
        session_id=session_id,
        current_user=current_user,
        supabase=supabase,
    )


def get_note(
    note_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> NoteResponse:
    return note_service.get_note(note_id, current_user=current_user, supabase=supabase)


def update_note(
    note_id: str,
    body: NoteUpdate,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> NoteResponse:
    return note_service.update_note(note_id, body, current_user=current_user, supabase=supabase)


def delete_note(
    note_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> Response:
    note_service.delete_note(note_id, current_user=current_user, supabase=supabase)
    return Response(status_code=204)

