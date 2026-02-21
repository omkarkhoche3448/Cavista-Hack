import { API_URL } from "@/config";

export const AUTH_API = `${API_URL}/api/auth`;
export const SIGNUP_URL = `${AUTH_API}/signup`;
export const LOGIN_URL = `${AUTH_API}/login`;
export const PROFILE_URL = `${AUTH_API}/me`;
export const DOCTOR_PROFILE_URL = `${AUTH_API}/me/doctor-profile`;
export const PATIENT_PROFILE_URL = `${AUTH_API}/me/patient-profile`;
