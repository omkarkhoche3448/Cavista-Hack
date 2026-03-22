from __future__ import annotations

from fastapi import Depends
from supabase import Client

from ..config.database import get_supabase
from ..models.schemas import (
    AuthResponse,
    DoctorProfileCreate,
    DoctorProfileResponse,
    LoginRequest,
    OnboardingRequest,
    PatientProfileResponse,
    ProfileUpdateRequest,
    SignupRequest,
    UserResponse,
)
from ..services.auth_dependencies import get_current_user, require_role
from ..services import auth_service


def signup(body: SignupRequest, supabase: Client = Depends(get_supabase)) -> AuthResponse:
    return auth_service.signup(body, supabase)


def login(body: LoginRequest, supabase: Client = Depends(get_supabase)) -> AuthResponse:
    return auth_service.login(body, supabase)


def get_profile(current_user: dict = Depends(get_current_user)) -> UserResponse:
    return current_user


def update_profile(
    body: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
) -> UserResponse:
    return auth_service.update_profile(body, current_user, supabase)


def create_doctor_profile(
    body: DoctorProfileCreate,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> DoctorProfileResponse:
    return auth_service.create_doctor_profile(body, current_user, supabase)


def get_doctor_profile(
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
) -> DoctorProfileResponse:
    return auth_service.get_doctor_profile(current_user, supabase)


def get_patient_profile(
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
) -> PatientProfileResponse:
    return auth_service.get_patient_profile(current_user, supabase)


def onboard_patient(
    body: OnboardingRequest,
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
) -> UserResponse:
    return auth_service.onboard_patient(body, current_user, supabase)

