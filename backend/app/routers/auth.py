from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from ..db import get_supabase
from ..oauth2 import get_current_user, require_role
from ..models import (
    SignupRequest,
    LoginRequest,
    AuthResponse,
    UserResponse,
    ProfileUpdateRequest,
    DoctorProfileCreate,
    DoctorProfileResponse,
    PatientProfileResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, supabase: Client = Depends(get_supabase)):
    """Register a new user via Supabase Auth."""
    try:
        res = supabase.auth.sign_up(
            {
                "email": body.email,
                "password": body.password,
                "options": {
                    "data": {
                        "role": body.role,
                        "first_name": body.first_name,
                        "last_name": body.last_name,
                    }
                },
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not res.user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signup failed. Email may already be registered.",
        )

    if not res.session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signup succeeded but no session returned. Check email confirmation settings.",
        )

    return AuthResponse(
        access_token=res.session.access_token,
        user_id=res.user.id,
        role=body.role,
        first_name=body.first_name,
        last_name=body.last_name,
    )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, supabase: Client = Depends(get_supabase)):
    """Sign in with email and password."""
    try:
        res = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not res.session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Fetch user profile from public.users for role info
    profile = (
        supabase.table("users")
        .select("role, first_name, last_name")
        .eq("id", res.user.id)
        .single()
        .execute()
    )

    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found.",
        )

    return AuthResponse(
        access_token=res.session.access_token,
        user_id=res.user.id,
        role=profile.data["role"],
        first_name=profile.data["first_name"],
        last_name=profile.data["last_name"],
    )


@router.get("/me", response_model=UserResponse)
def get_profile(current_user: dict = Depends(get_current_user)):
    """Get the authenticated user's profile."""
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_profile(
    body: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Update the authenticated user's profile fields."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update.",
        )

    # Convert date to string for JSON serialization
    if "date_of_birth" in updates and updates["date_of_birth"] is not None:
        updates["date_of_birth"] = updates["date_of_birth"].isoformat()

    result = (
        supabase.table("users")
        .update(updates)
        .eq("id", current_user["id"])
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile.",
        )

    return result.data[0]


@router.post("/me/doctor-profile", response_model=DoctorProfileResponse)
def create_doctor_profile(
    body: DoctorProfileCreate,
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Create a doctor profile for the authenticated doctor."""
    # Check if profile already exists
    existing = (
        supabase.table("doctor_profiles")
        .select("id")
        .eq("user_id", current_user["id"])
        .execute()
    )

    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Doctor profile already exists.",
        )

    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user["id"]

    result = supabase.table("doctor_profiles").insert(data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create doctor profile.",
        )

    return result.data[0]


@router.get("/me/doctor-profile", response_model=DoctorProfileResponse)
def get_doctor_profile(
    current_user: dict = Depends(require_role("doctor")),
    supabase: Client = Depends(get_supabase),
):
    """Get the authenticated doctor's profile."""
    result = (
        supabase.table("doctor_profiles")
        .select("*")
        .eq("user_id", current_user["id"])
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found. Create one first.",
        )

    return result.data


@router.get("/me/patient-profile", response_model=PatientProfileResponse)
def get_patient_profile(
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
):
    """Get the authenticated patient's profile."""
    result = (
        supabase.table("patient_profiles")
        .select("*")
        .eq("user_id", current_user["id"])
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found.",
        )

    return result.data
