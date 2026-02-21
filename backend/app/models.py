from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal, List, Any
from datetime import date, datetime


# ── Auth Request/Response ──

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    role: Literal["doctor", "patient"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    first_name: str
    last_name: str


# ── User (matches public.users) ──

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
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[Literal["male", "female", "other", "prefer_not_to_say"]] = None
    timezone: Optional[str] = None
    locale: Optional[str] = None


# ── Doctor Profile (matches public.doctor_profiles) ──

class DoctorProfileCreate(BaseModel):
    license_number: str
    specialty: Optional[str] = None
    sub_specialty: Optional[str] = None
    hospital_affiliation: Optional[str] = None
    department: Optional[str] = None
    years_of_experience: Optional[int] = None
    bio: Optional[str] = None


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


# ── Patient Profile (matches public.patient_profiles) ──

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
    blood_type: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_policy_number: Optional[str] = None


# ── Session ──

class CreateSessionRequest(BaseModel):
    patient_email: EmailStr
    chief_complaint: Optional[str] = None
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
    created_at: datetime
    doctor_name: Optional[str] = None
    patient_name: Optional[str] = None
    doctor_email: Optional[str] = None
    patient_email: Optional[str] = None


class SessionAcceptReject(BaseModel):
    session_id: str
    action: Literal["accept", "reject"]
    reason: Optional[str] = None


class EndSessionRequest(BaseModel):
    session_id: str
    session_notes: Optional[str] = None


# ── Documents ──

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
    document_ids: List[str]


# ── Transcript ──

class TranscriptChunkIn(BaseModel):
    session_id: str
    chunk_index: int
    speaker_role: Literal["doctor", "patient", "unknown"] = "unknown"
    raw_text: str
    start_time_ms: int
    end_time_ms: int
    confidence_score: Optional[float] = None
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


# ── EMR ──

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
    review_notes: Optional[str] = None
    edits: Optional[dict] = None


# ── ICD Mapping ──

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


# ── Treatment Suggestions ──

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
    doctor_notes: Optional[str] = None


# ── Patient Summary ──

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


# ── Pre-Session Insights ──

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


# ── Notification ──

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


# ── WebSocket Events ──

class WSMessage(BaseModel):
    event: str
    data: Optional[dict] = None
