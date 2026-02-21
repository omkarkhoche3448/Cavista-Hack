"""
Notes Router — CRUD for doctor_notes table.

A note is a list of strings (scripts) tied to a patient,
with an optional link to a specific session.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from typing import Optional
from datetime import datetime, timezone

from ..db import get_supabase
from ..oauth2 import require_role
from ..models import NoteCreate, NoteUpdate, NoteResponse

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.post("", response_model=NoteResponse, status_code=201)
def create_note(
    body: NoteCreate,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Create a new note for a patient.
    notes is an array of strings.
    Optionally linked to a session via session_id.
    """
    result = (
        supabase.table("doctor_notes")
        .insert({
            "doctor_id": current_user["id"],
            "patient_id": body.patient_id,
            "session_id": body.session_id,
            "notes": body.notes,
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create note.")

    return result.data[0]


@router.get("", response_model=list[NoteResponse])
def list_notes(
    patient_id: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    List all notes written by the current doctor.
    Filter by patient_id or session_id.
    """
    query = (
        supabase.table("doctor_notes")
        .select("*")
        .eq("doctor_id", current_user["id"])
    )

    if patient_id:
        query = query.eq("patient_id", patient_id)
    if session_id:
        query = query.eq("session_id", session_id)

    result = query.order("created_at", desc=True).execute()
    return result.data or []


@router.get("/{note_id}", response_model=NoteResponse)
def get_note(
    note_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Fetch a single note by ID. Only the authoring doctor can access it."""
    result = (
        supabase.table("doctor_notes")
        .select("*")
        .eq("id", note_id)
        .eq("doctor_id", current_user["id"])
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Note not found.")

    return result.data


@router.put("/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: str,
    body: NoteUpdate,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """
    Replace the notes array for an existing note.
    Only the authoring doctor can update it.
    """
    doctor_id = current_user["id"]

    existing = (
        supabase.table("doctor_notes")
        .select("id")
        .eq("id", note_id)
        .eq("doctor_id", doctor_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Note not found.")

    result = (
        supabase.table("doctor_notes")
        .update({
            "notes": body.notes,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", note_id)
        .eq("doctor_id", doctor_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update note.")

    return result.data[0]


@router.delete("/{note_id}", status_code=204)
def delete_note(
    note_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Delete a note. Only the authoring doctor can delete it."""
    doctor_id = current_user["id"]

    existing = (
        supabase.table("doctor_notes")
        .select("id")
        .eq("id", note_id)
        .eq("doctor_id", doctor_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Note not found.")

    supabase.table("doctor_notes").delete().eq("id", note_id).execute()
