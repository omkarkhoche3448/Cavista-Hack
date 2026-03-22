from __future__ import annotations

from fastapi import HTTPException, status
from supabase import Client

from ..models.schemas import (
    AuthResponse,
    DoctorProfileCreate,
    LoginRequest,
    OnboardingRequest,
    ProfileUpdateRequest,
    SignupRequest,
)
from ..repositories import auth_repository
from ..utils.errors import raise_bad_request, raise_conflict, raise_not_found


def signup(body: SignupRequest, supabase: Client) -> AuthResponse:
    try:
        result = supabase.auth.sign_up(
            {
                "email": body.email,
                "password": body.password,
                "options": {
                    "data": {
                        "role": body.role,
                        "first_name": body.first_name.strip(),
                        "last_name": body.last_name.strip(),
                    }
                },
            }
        )
    except Exception as error:
        message = str(error).lower()
        if "already" in message or "exists" in message:
            raise_conflict("Email is already registered.")
        raise_bad_request("Signup failed.")

    if not result.user:
        raise_bad_request("Signup failed.")
    if not result.session:
        raise_bad_request("Signup succeeded but no session was created.")

    return AuthResponse(
        access_token=result.session.access_token,
        user_id=result.user.id,
        role=body.role,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
    )


def login(body: LoginRequest, supabase: Client) -> AuthResponse:
    try:
        result = supabase.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from error

    if not result.session or not result.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    profile = auth_repository.get_user_profile_for_login(supabase, result.user.id)
    if not profile:
        raise_not_found("User profile not found.")

    return AuthResponse(
        access_token=result.session.access_token,
        user_id=result.user.id,
        role=profile["role"],
        first_name=profile["first_name"],
        last_name=profile["last_name"],
    )


def update_profile(body: ProfileUpdateRequest, current_user: dict, supabase: Client) -> dict:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise_bad_request("No fields to update.")
    if "date_of_birth" in updates:
        updates["date_of_birth"] = updates["date_of_birth"].isoformat()
    if "first_name" in updates:
        updates["first_name"] = updates["first_name"].strip()
    if "last_name" in updates:
        updates["last_name"] = updates["last_name"].strip()

    updated = auth_repository.update_user_profile(supabase, current_user["id"], updates)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update profile.")
    return updated


def create_doctor_profile(body: DoctorProfileCreate, current_user: dict, supabase: Client) -> dict:
    existing = auth_repository.get_doctor_profile(supabase, current_user["id"])
    if existing:
        raise_conflict("Doctor profile already exists.")

    payload = body.model_dump(exclude_none=True)
    payload["user_id"] = current_user["id"]
    payload["license_number"] = payload["license_number"].strip()
    created = auth_repository.create_doctor_profile(supabase, payload)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create doctor profile.")
    return created


def get_doctor_profile(current_user: dict, supabase: Client) -> dict:
    profile = auth_repository.get_doctor_profile(supabase, current_user["id"])
    if not profile:
        raise_not_found("Doctor profile not found.")
    return profile


def get_patient_profile(current_user: dict, supabase: Client) -> dict:
    profile = auth_repository.get_patient_profile(supabase, current_user["id"])
    if not profile:
        raise_not_found("Patient profile not found.")
    return profile


def onboard_patient(body: OnboardingRequest, current_user: dict, supabase: Client) -> dict:
    user_updates = {
        "date_of_birth": body.date_of_birth.isoformat(),
        "gender": body.gender,
        "phone": body.phone.strip(),
        "status": "active",
    }
    user = auth_repository.update_user_profile(supabase, current_user["id"], user_updates)
    if not user:
        raise HTTPException(status_code=500, detail="Failed to update user record.")

    patient_payload = {
        "user_id": current_user["id"],
        "blood_type": body.blood_type,
        "height_cm": body.height_cm,
        "weight_kg": body.weight_kg,
        "emergency_contact_name": body.emergency_contact_name.strip(),
        "emergency_contact_phone": body.emergency_contact_phone.strip(),
        "emergency_contact_relation": body.emergency_contact_relation,
        "insurance_provider": body.insurance_provider,
        "insurance_policy_number": body.insurance_policy_number,
    }
    profile = auth_repository.upsert_patient_profile(supabase, current_user["id"], patient_payload)
    if not profile:
        raise HTTPException(status_code=500, detail="Failed to update patient profile.")

    return user

