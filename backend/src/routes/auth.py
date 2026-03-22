from fastapi import APIRouter

from ..controllers import auth_controller
from ..models.schemas import (
    AuthResponse,
    DoctorProfileResponse,
    PatientProfileResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

router.post("/signup", response_model=AuthResponse, status_code=201)(auth_controller.signup)
router.post("/login", response_model=AuthResponse)(auth_controller.login)
router.get("/me", response_model=UserResponse)(auth_controller.get_profile)
router.patch("/me", response_model=UserResponse)(auth_controller.update_profile)
router.post("/me/doctor-profile", response_model=DoctorProfileResponse, status_code=201)(
    auth_controller.create_doctor_profile
)
router.get("/me/doctor-profile", response_model=DoctorProfileResponse)(auth_controller.get_doctor_profile)
router.get("/me/patient-profile", response_model=PatientProfileResponse)(auth_controller.get_patient_profile)
router.post("/onboard", response_model=UserResponse)(auth_controller.onboard_patient)

