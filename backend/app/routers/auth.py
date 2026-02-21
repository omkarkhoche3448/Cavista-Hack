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
    OnboardingRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, supabase: Client = Depends(get_supabase)):
    """
    Registers a new user via Supabase Auth and creates a profile in the 'users' table.
    
    Why: Fundamental entry point for new users to access the platform.
    Where: Called by the Signup page in the Frontend.
    
    Args:
        body (SignupRequest): User registration details (email, password, first_name, last_name, role).
        supabase (Client): Injected Supabase client.
        
    Returns:
        AuthResponse: Access token and basic user info.
        
    Raises:
        HTTPException: 400 if registration fails or user already exists.
    """
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
    """
    Authenticates a user with email and password via Supabase Auth.
    
    Why: Handles secure user entry and provides the JWT required for all subsequent API calls.
    Where: Called by the Login page in the Frontend.
    
    Args:
        body (LoginRequest): Credentials (email, password).
        supabase (Client): Injected Supabase client.
        
    Returns:
        AuthResponse: Access token and profile data.
        
    Raises:
        HTTPException: 401 if credentials invalid, 404 if profile missing.
    """
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
    """
    Returns the authenticated user's current profile from the 'users' table.
    
    Why: Allows the frontend to display user details and check current status.
    Where: Called on every page load (via AuthProvider) and on the Profile page.
    
    Args:
        current_user (dict): User profile injected via JWT dependency.
        
    Returns:
        dict: The user's record.
    """
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_profile(
    body: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Updates specific fields of the authenticated user's profile.
    
    Why: Essential for user self-service and data accuracy (phone, birthday, etc.).
    Where: Called by the Profile Settings page in the Frontend.
    
    Args:
        body (ProfileUpdateRequest): Fields to update.
        current_user (dict): User profile injected via JWT dependency.
        supabase (Client): Supabase client.
        
    Returns:
        dict: The updated user record.
        
    Raises:
        HTTPException: 400 if no fields provided, 500 if DB update fails.
    """
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
    """
    Creates a detailed doctor profile (specialization, hospital, etc.).
    
    Why: Doctors need a specialized profile beyond basic user data for clinical workflows.
    Where: Called during doctor onboarding or first-time setup.
    
    Args:
        body (DoctorProfileCreate): Specialization, hospital info.
        current_user (dict): Injected via role-based dependency.
        supabase (Client): Supabase client.
        
    Returns:
        dict: The created doctor profile object.
        
    Raises:
        HTTPException: 409 if profile already exists, 500 on failure.
    """
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
    """
    Retrieves the doctor-specific profile data for the logged-in doctor.
    
    Why: Required to populate the doctor dashboard and profile settings.
    Where: Called by the Doctor Dashboard and Profile page.
    
    Args:
        current_user (dict): Injected via role-based dependency.
        supabase (Client): Supabase client.
        
    Returns:
        dict: The doctor's profile.
        
    Raises:
        HTTPException: 404 if profile hasn't been created yet.
    """
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
    """
    Retrieves the patient-specific profile data for the logged-in patient.
    
    Why: Required for medical context (blood type, MRN, etc.) in the patient dashboard.
    Where: Called by the Patient Dashboard and Profile page.
    
    Args:
        current_user (dict): Injected via role-based dependency.
        supabase (Client): Supabase client.
        
    Returns:
        dict: The patient's profile.
        
    Raises:
        HTTPException: 404 if patient record is missing.
    """
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
@router.post("/onboard", response_model=UserResponse)
def onboard_patient(
    body: OnboardingRequest,
    current_user: dict = Depends(require_role("patient")),
    supabase: Client = Depends(get_supabase),
):
    """
    Completes patient onboarding by updating both 'users' and 'patient_profiles' tables.
    Sets user status to 'active'.
    
    Why: Mandatory first-time setup for patients to ensure all medical context is available.
    Where: Called by the Onboarding page in the Frontend.
    
    Args:
        body (OnboardingRequest): Combined patient and user data.
        current_user (dict): Authenticated patient.
        supabase (Client): Supabase client.
        
    Returns:
        dict: The updated user record.
    """
    # 1. Update public.users
    user_updates = {
        "date_of_birth": body.date_of_birth.isoformat(),
        "gender": body.gender,
        "phone": body.phone,
        "status": "active"
    }
    
    user_result = (
        supabase.table("users")
        .update(user_updates)
        .eq("id", current_user["id"])
        .execute()
    )
    
    if not user_result.data:
        raise HTTPException(status_code=500, detail="Failed to update user record.")

    # 2. Update/Create public.patient_profiles
    patient_data = {
        "user_id": current_user["id"],
        "blood_type": body.blood_type,
        "height_cm": body.height_cm,
        "weight_kg": body.weight_kg,
        "emergency_contact_name": body.emergency_contact_name,
        "emergency_contact_phone": body.emergency_contact_phone,
        "emergency_contact_relation": body.emergency_contact_relation,
        "insurance_provider": body.insurance_provider,
        "insurance_policy_number": body.insurance_policy_number,
    }
    
    # Check if profile exists
    existing = (
        supabase.table("patient_profiles")
        .select("id")
        .eq("user_id", current_user["id"])
        .execute()
    )
    
    if existing.data:
        patient_result = (
            supabase.table("patient_profiles")
            .update(patient_data)
            .eq("user_id", current_user["id"])
            .execute()
        )
    else:
        patient_result = (
            supabase.table("patient_profiles")
            .insert(patient_data)
            .execute()
        )
        
    if not patient_result.data:
        raise HTTPException(status_code=500, detail="Failed to create/update patient profile.")

    return user_result.data[0]
