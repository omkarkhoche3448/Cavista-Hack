import { API_URL } from "@/config";

// Auth
export const AUTH_API = `${API_URL}/api/auth`;
export const SIGNUP_URL = `${AUTH_API}/signup`;
export const LOGIN_URL = `${AUTH_API}/login`;
export const PROFILE_URL = `${AUTH_API}/me`;
export const DOCTOR_PROFILE_URL = `${AUTH_API}/me/doctor-profile`;
export const PATIENT_PROFILE_URL = `${AUTH_API}/me/patient-profile`;

// Sessions
export const SESSIONS_API = `${API_URL}/api/sessions`;
export const SESSIONS_WS_URL = `${API_URL.replace("http", "ws")}/api/sessions/ws`;

// Documents
export const DOCUMENTS_API = `${API_URL}/api/documents`;

// EMR
export const EMR_API = `${API_URL}/api/emr`;

// Patient
export const PATIENT_API = `${API_URL}/api/patient`;
export const PATIENT_SUMMARIES_URL = `${PATIENT_API}/summaries`;
export const PATIENT_DOCUMENTS_URL = `${PATIENT_API}/documents`;
export const PATIENT_DOCUMENTS_UPLOAD_URL = `${PATIENT_API}/documents/upload`;
export const PATIENT_NOTIFICATIONS_URL = `${PATIENT_API}/notifications`;
export const PATIENT_SESSIONS_PENDING_URL = `${PATIENT_API}/sessions/pending`;
