import { API_URL } from "@/config";

// Auth
export const AUTH_API = `${API_URL}/api/auth`;
export const SIGNUP_URL = `${AUTH_API}/signup`;
export const LOGIN_URL = `${AUTH_API}/login`;
export const PROFILE_URL = `${AUTH_API}/me`;
export const DOCTOR_PROFILE_URL = `${AUTH_API}/me/doctor-profile`;
export const PATIENT_PROFILE_URL = `${AUTH_API}/me/patient-profile`;
export const ONBOARD_URL = `${AUTH_API}/onboard`;

// Sessions
export const SESSIONS_API = `${API_URL}/api/sessions`;
export const SESSIONS_WS_URL = `${API_URL.replace("http", "ws")}/api/sessions/ws`;

// Documents
export const DOCUMENTS_API = `${API_URL}/api/documents`;

// EMR
export const EMR_API = `${API_URL}/api/emr`;
