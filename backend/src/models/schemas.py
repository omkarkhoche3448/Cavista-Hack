from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    role: Literal["doctor", "patient"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    first_name: str
    last_name: str


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    status: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    profile_picture_url: Optional[str] = None
    timezone: Optional[str] = None
    locale: Optional[str] = None
    created_at: datetime


class ProfileUpdateRequest(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, min_length=5, max_length=30)
    date_of_birth: Optional[date] = None
    gender: Optional[Literal["male", "female", "other", "prefer_not_to_say"]] = None
    timezone: Optional[str] = Field(default=None, max_length=60)
    locale: Optional[str] = Field(default=None, max_length=10)


class DoctorProfileCreate(BaseModel):
    license_number: str = Field(..., min_length=3, max_length=100)
    specialty: Optional[str] = Field(default=None, max_length=150)
    sub_specialty: Optional[str] = Field(default=None, max_length=150)
    hospital_affiliation: Optional[str] = Field(default=None, max_length=200)
    department: Optional[str] = Field(default=None, max_length=150)
    years_of_experience: Optional[int] = Field(default=None, ge=0, le=80)
    bio: Optional[str] = Field(default=None, max_length=2000)


class DoctorProfileResponse(BaseModel):
    id: str
    user_id: str
    license_number: str
    specialty: Optional[str] = None
    sub_specialty: Optional[str] = None
    hospital_affiliation: Optional[str] = None
    department: Optional[str] = None
    years_of_experience: Optional[int] = None
    bio: Optional[str] = None
    is_available: bool
    created_at: datetime


class PatientProfileResponse(BaseModel):
    id: str
    user_id: str
    mrn: Optional[str] = None
    blood_type: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    created_at: datetime


class PatientProfileUpdate(BaseModel):
    blood_type: Optional[str] = Field(default=None, max_length=5)
    height_cm: Optional[float] = Field(default=None, ge=30, le=300)
    weight_kg: Optional[float] = Field(default=None, ge=1, le=500)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=30)
    emergency_contact_relation: Optional[str] = Field(default=None, max_length=50)
    insurance_provider: Optional[str] = Field(default=None, max_length=200)
    insurance_policy_number: Optional[str] = Field(default=None, max_length=100)


class OnboardingRequest(BaseModel):
    date_of_birth: date
    gender: Literal["male", "female", "other", "prefer_not_to_say"]
    phone: str = Field(..., min_length=5, max_length=30)
    blood_type: Optional[str] = Field(default=None, max_length=5)
    height_cm: Optional[float] = Field(default=None, ge=30, le=300)
    weight_kg: Optional[float] = Field(default=None, ge=1, le=500)
    emergency_contact_name: str = Field(..., min_length=2, max_length=200)
    emergency_contact_phone: str = Field(..., min_length=5, max_length=30)
    emergency_contact_relation: Optional[str] = Field(default=None, max_length=50)
    insurance_provider: Optional[str] = Field(default=None, max_length=200)
    insurance_policy_number: Optional[str] = Field(default=None, max_length=100)


class CreateSessionRequest(BaseModel):
    patient_email: EmailStr
    chief_complaint: Optional[str] = Field(default=None, max_length=5000)
    is_emergency: bool = False


class SessionResponse(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    status: str
    title: Optional[str] = None
    chief_complaint: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    is_emergency: bool = False
    recording_url: Optional[str] = None
    created_at: datetime
    doctor_name: Optional[str] = None
    patient_name: Optional[str] = None
    doctor_email: Optional[str] = None
    patient_email: Optional[str] = None


class PaginatedSessionsResponse(BaseModel):
    sessions: list[SessionResponse]
    total_count: int
    page: int
    page_size: int
    total_pages: int


class SessionAcceptReject(BaseModel):
    session_id: str
    action: Literal["accept", "reject"]
    reason: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("reason")
    @classmethod
    def reject_reason_required(cls, value: Optional[str], info):
        if info.data.get("action") == "reject" and not value:
            raise ValueError("Rejection reason is required when action is reject.")
        return value


class EndSessionRequest(BaseModel):
    session_id: str
    session_notes: Optional[str] = Field(default=None, max_length=10000)


class DocumentResponse(BaseModel):
    id: str
    patient_id: str
    uploaded_by: str
    document_type: str
    status: str
    title: str
    description: Optional[str] = None
    file_name: str
    file_mime_type: str
    file_size_bytes: Optional[int] = None
    storage_url: Optional[str] = None
    analysis_result: Optional[Any] = None
    created_at: datetime


class ShareDocumentsRequest(BaseModel):
    session_id: str
    document_ids: list[str] = Field(..., min_length=1, max_length=25)


class TranscriptChunkIn(BaseModel):
    session_id: str
    chunk_index: int = Field(..., ge=0)
    speaker_role: Literal["doctor", "patient", "unknown"] = "unknown"
    raw_text: str = Field(..., min_length=1, max_length=5000)
    start_time_ms: int = Field(..., ge=0)
    end_time_ms: int = Field(..., ge=0)
    confidence_score: Optional[float] = Field(default=None, ge=0, le=1)
    is_final: bool = False


class TranscriptChunkResponse(BaseModel):
    id: str
    session_id: str
    chunk_index: int
    speaker_role: str
    raw_text: str
    start_time_ms: int
    end_time_ms: int
    confidence_score: Optional[float] = None
    is_final: bool = False
    created_at: datetime


class EMRDraftResponse(BaseModel):
    id: str
    session_id: str
    version: int
    status: str
    chief_complaint: Optional[str] = None
    history_present_illness: Optional[str] = None
    assessment: Optional[str] = None
    treatment_plan: Optional[Any] = None
    medications_prescribed: Optional[Any] = None
    follow_up_plan: Optional[str] = None
    patient_instructions: Optional[str] = None
    diagnoses: Optional[Any] = None
    vital_signs: Optional[Any] = None
    review_of_systems: Optional[Any] = None
    past_medical_history: Optional[Any] = None
    medications: Optional[Any] = None
    allergies: Optional[Any] = None
    physical_examination: Optional[Any] = None
    model_used: Optional[str] = None
    created_at: datetime


class ApproveEMRRequest(BaseModel):
    draft_id: str
    review_notes: Optional[str] = Field(default=None, max_length=4000)
    edits: Optional[dict] = None


class ICDMappingResponse(BaseModel):
    id: str
    session_id: str
    diagnosis_text: str
    icd_code: Optional[str] = None
    icd_description: Optional[str] = None
    confidence_score: Optional[float] = None
    is_primary: bool = False
    approval_status: str
    created_at: datetime


class TreatmentSuggestionResponse(BaseModel):
    id: str
    session_id: str
    suggestion_type: Optional[str] = None
    title: str
    description: Optional[str] = None
    rationale: Optional[str] = None
    priority: Optional[str] = None
    approval_status: str
    created_at: datetime


class ApproveTreatmentRequest(BaseModel):
    suggestion_id: str
    action: Literal["approved", "rejected"]
    doctor_notes: Optional[str] = Field(default=None, max_length=2000)


class PatientSummaryResponse(BaseModel):
    id: str
    session_id: str
    summary_text: str
    key_takeaways: Optional[Any] = None
    medications_list: Optional[Any] = None
    follow_up_date: Optional[date] = None
    follow_up_notes: Optional[str] = None
    warnings: Optional[Any] = None
    approval_status: str
    sent_to_patient_at: Optional[datetime] = None
    created_at: datetime


class ApproveSummaryRequest(BaseModel):
    summary_id: str
    edits: Optional[dict] = None


class PreSessionInsightResponse(BaseModel):
    id: str
    session_id: str
    document_id: str
    summary: Optional[str] = None
    risk_flags: Optional[Any] = None
    key_findings: Optional[Any] = None
    medications_found: Optional[Any] = None
    allergies_found: Optional[Any] = None
    model_used: Optional[str] = None
    created_at: datetime


class NotificationResponse(BaseModel):
    id: str
    recipient_id: str
    sender_id: Optional[str] = None
    session_id: Optional[str] = None
    notification_type: str
    title: str
    body: Optional[str] = None
    payload: Optional[Any] = None
    is_read: bool = False
    created_at: datetime


class NoteCreate(BaseModel):
    patient_id: str
    session_id: Optional[str] = None
    notes: list[str] = Field(..., min_length=1, max_length=100)


class NoteUpdate(BaseModel):
    notes: list[str] = Field(..., min_length=1, max_length=100)


class NoteResponse(BaseModel):
    id: str
    doctor_id: str
    patient_id: str
    session_id: Optional[str] = None
    notes: list[str]
    created_at: datetime
    updated_at: datetime


class WSMessage(BaseModel):
    event: str = Field(..., min_length=1, max_length=100)
    data: Optional[dict] = None

