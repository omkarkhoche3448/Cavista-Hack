/**
 * Session API service — REST calls for session management.
 */

import { SESSIONS_API } from "@/api";

async function authFetch(url, options = {}, token) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export async function createSession(token, { patientEmail, chiefComplaint, isEmergency = false }) {
  return authFetch(SESSIONS_API, {
    method: "POST",
    body: JSON.stringify({
      patient_email: patientEmail,
      chief_complaint: chiefComplaint,
      is_emergency: isEmergency,
    }),
  }, token);
}

export async function listSessions(token, statusFilter = null) {
  const params = statusFilter ? `?status=${statusFilter}` : "";
  return authFetch(`${SESSIONS_API}${params}`, {}, token);
}

export async function getSession(token, sessionId) {
  return authFetch(`${SESSIONS_API}/${sessionId}`, {}, token);
}

export async function respondToSession(token, { sessionId, action, reason }) {
  return authFetch(`${SESSIONS_API}/respond`, {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      action,
      reason,
    }),
  }, token);
}

export async function startSession(token, sessionId) {
  return authFetch(`${SESSIONS_API}/${sessionId}/start`, {
    method: "POST",
  }, token);
}

export async function endSession(token, { sessionId, sessionNotes }) {
  return authFetch(`${SESSIONS_API}/end`, {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      session_notes: sessionNotes,
    }),
  }, token);
}

export async function getTranscript(token, sessionId) {
  return authFetch(`${SESSIONS_API}/${sessionId}/transcript`, {}, token);
}
