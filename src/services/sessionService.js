/**
 * Session API service — REST calls for session management.
 */

import { SESSIONS_API } from "@/api";
import { apiRequest } from "@/services/apiClient";

export async function createSession(token, { patientEmail, chiefComplaint, isEmergency = false }) {
  return apiRequest(SESSIONS_API, {
    method: "POST",
    token,
    json: {
      patient_email: patientEmail,
      chief_complaint: chiefComplaint,
      is_emergency: isEmergency,
    },
  });
}

export async function listSessions(token, { statusFilter = null, page = 1, pageSize = 10 } = {}) {
  const params = new URLSearchParams();
  if (statusFilter) params.append("status", statusFilter);
  if (page) params.append("page", page);
  if (pageSize) params.append("page_size", pageSize);

  const queryString = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`${SESSIONS_API}${queryString}`, { token });
}

export async function listPatients(token) {
  return apiRequest(`${SESSIONS_API}/patients`, { token });
}

export async function getPatient(token, patientId) {
  return apiRequest(`${SESSIONS_API}/patients/${patientId}`, { token });
}

export async function getSession(token, sessionId) {
  return apiRequest(`${SESSIONS_API}/${sessionId}`, { token });
}

export async function getAllSessions(token) {
  return apiRequest(`${SESSIONS_API}`, { token });
}

export async function respondToSession(token, { sessionId, action, reason }) {
  return apiRequest(`${SESSIONS_API}/respond`, {
    method: "POST",
    token,
    json: {
      session_id: sessionId,
      action,
      reason,
    },
  });
}

export async function startSession(token, sessionId) {
  return apiRequest(`${SESSIONS_API}/${sessionId}/start`, {
    method: "POST",
    token,
  });
}

export async function endSession(token, { sessionId, sessionNotes }) {
  return apiRequest(`${SESSIONS_API}/end`, {
    method: "POST",
    token,
    json: {
      session_id: sessionId,
      session_notes: sessionNotes,
    },
  });
}

export async function getTranscript(token, sessionId) {
  return apiRequest(`${SESSIONS_API}/${sessionId}/transcript`, { token });
}

export async function getRecordingUrl(token, sessionId) {
  return apiRequest(`${SESSIONS_API}/${sessionId}/recording`, { token });
}

export async function uploadRecording(token, sessionId, blob) {
  const formData = new FormData();
  formData.append("file", blob, `session-${sessionId}.webm`);
  return apiRequest(`${SESSIONS_API}/${sessionId}/recording`, {
    method: "POST",
    token,
    body: formData,
  });
}

/**
 * Transcribes session audio using the dual S3 + Analysis API flow.
 */
export async function transcribeAudio(token, sessionId, blob) {
  const formData = new FormData();
  formData.append("file", blob, `session-${sessionId}.webm`);
  formData.append("session_id", sessionId);
  return apiRequest(`${SESSIONS_API}/transcribe`, {
    method: "POST",
    token,
    body: formData,
  });
}
