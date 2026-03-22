from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from supabase import Client

from ..models.schemas import NoteCreate, NoteUpdate
from ..repositories import note_repository
from ..utils.errors import raise_not_found


def create_note(body: NoteCreate, *, current_user: dict, supabase: Client) -> dict:
    note = note_repository.create_note(
        supabase,
        {
            "doctor_id": current_user["id"],
            "patient_id": body.patient_id,
            "session_id": body.session_id,
            "notes": body.notes,
        },
    )
    if not note:
        raise HTTPException(status_code=500, detail="Failed to create note.")
    return note


def list_notes(
    *,
    patient_id: str | None,
    session_id: str | None,
    current_user: dict,
    supabase: Client,
) -> list[dict]:
    return note_repository.list_notes(
        supabase,
        current_user["id"],
        patient_id,
        session_id,
    )


def get_note(note_id: str, *, current_user: dict, supabase: Client) -> dict:
    note = note_repository.get_note(supabase, note_id, current_user["id"])
    if not note:
        raise_not_found("Note not found.")
    return note


def update_note(note_id: str, body: NoteUpdate, *, current_user: dict, supabase: Client) -> dict:
    note = note_repository.update_note(
        supabase,
        note_id,
        current_user["id"],
        {"notes": body.notes, "updated_at": datetime.now(timezone.utc).isoformat()},
    )
    if not note:
        raise_not_found("Note not found.")
    return note


def delete_note(note_id: str, *, current_user: dict, supabase: Client) -> None:
    note = note_repository.get_note(supabase, note_id, current_user["id"])
    if not note:
        raise_not_found("Note not found.")
    note_repository.delete_note(supabase, note_id, current_user["id"])
