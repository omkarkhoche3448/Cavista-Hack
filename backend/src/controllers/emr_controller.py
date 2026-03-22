from __future__ import annotations

from fastapi import BackgroundTasks, Depends, Query
from supabase import Client

from ..config.database import get_supabase
from ..models.schemas import (
    ApproveSummaryRequest,
    ApproveTreatmentRequest,
    ApproveEMRRequest,
    EMRDraftResponse,
    ICDMappingResponse,
    PreSessionInsightResponse,
    TreatmentSuggestionResponse,
)
from ..services.auth_dependencies import get_current_user, require_role
from ..services import emr_service


def get_emr_drafts(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> list[EMRDraftResponse]:
    return emr_service.get_emr_drafts(session_id, current_user=current_user, supabase=supabase)


def get_emr_draft(
    draft_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return emr_service.get_emr_draft(draft_id, current_user=current_user, supabase=supabase)


async def approve_emr(
    body: ApproveEMRRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return await emr_service.approve_emr(
        draft_id=body.draft_id,
        review_notes=body.review_notes,
        edits=body.edits,
        background_tasks=background_tasks,
        current_user=current_user,
        supabase=supabase,
    )


def get_emr_pdf_url(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return emr_service.get_emr_pdf_url(session_id, current_user=current_user, supabase=supabase)


def get_patient_summary(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return emr_service.get_patient_summary(session_id, current_user=current_user, supabase=supabase)


def get_icd_mappings(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> list[ICDMappingResponse]:
    return emr_service.get_icd_mappings(session_id, current_user=current_user, supabase=supabase)


def update_icd_mapping(
    mapping_id: str,
    action: str = Query(..., min_length=1, max_length=20),
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return emr_service.update_icd_mapping(
        mapping_id,
        action=action,
        current_user=current_user,
        supabase=supabase,
    )


def get_treatments(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> list[TreatmentSuggestionResponse]:
    return emr_service.get_treatments(session_id, current_user=current_user, supabase=supabase)


def approve_treatment(
    body: ApproveTreatmentRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return emr_service.approve_treatment(
        suggestion_id=body.suggestion_id,
        action=body.action,
        doctor_notes=body.doctor_notes,
        current_user=current_user,
        supabase=supabase,
    )


def approve_patient_summary(
    body: ApproveSummaryRequest,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return emr_service.approve_patient_summary(
        summary_id=body.summary_id,
        edits=body.edits,
        current_user=current_user,
        supabase=supabase,
    )


def get_insights(
    session_id: str,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> list[PreSessionInsightResponse]:
    return emr_service.get_insights(session_id, current_user=current_user, supabase=supabase)


def get_notifications(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    return emr_service.get_notifications(current_user=current_user, supabase=supabase)


def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> dict:
    return emr_service.mark_notification_read(notification_id, current_user=current_user, supabase=supabase)
