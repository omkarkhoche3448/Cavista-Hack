from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
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
