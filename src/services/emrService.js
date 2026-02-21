/**
 * EMR API service — drafts, ICD mappings, treatments, patient summaries.
 */

import { EMR_API } from "@/api";

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

export async function getEMRDrafts(token, sessionId) {
  return authFetch(`${EMR_API}/drafts/${sessionId}`, {}, token);
}

export async function getEMRDraft(token, draftId) {
  return authFetch(`${EMR_API}/draft/${draftId}`, {}, token);
}

export async function approveEMR(token, { draftId, reviewNotes, edits }) {
  return authFetch(`${EMR_API}/approve`, {
    method: "POST",
    body: JSON.stringify({
      draft_id: draftId,
      review_notes: reviewNotes,
      edits,
    }),
  }, token);
}

export async function getICDMappings(token, sessionId) {
  return authFetch(`${EMR_API}/icd-mappings/${sessionId}`, {}, token);
}

export async function updateICDMapping(token, mappingId, action) {
  return authFetch(`${EMR_API}/icd-mappings/${mappingId}?action=${action}`, {
    method: "PATCH",
  }, token);
}

export async function getTreatments(token, sessionId) {
  return authFetch(`${EMR_API}/treatments/${sessionId}`, {}, token);
}

export async function approveTreatment(token, { suggestionId, action, doctorNotes }) {
  return authFetch(`${EMR_API}/treatments/approve`, {
    method: "POST",
    body: JSON.stringify({
      suggestion_id: suggestionId,
      action,
      doctor_notes: doctorNotes,
    }),
  }, token);
}

export async function getPatientSummary(token, sessionId) {
  return authFetch(`${EMR_API}/patient-summary/${sessionId}`, {}, token);
}

export async function approvePatientSummary(token, { summaryId, edits }) {
  return authFetch(`${EMR_API}/patient-summary/approve`, {
    method: "POST",
    body: JSON.stringify({
      summary_id: summaryId,
      edits,
    }),
  }, token);
}

export async function getInsights(token, sessionId) {
  return authFetch(`${EMR_API}/insights/${sessionId}`, {}, token);
}

export async function getNotifications(token) {
  return authFetch(`${EMR_API}/notifications`, {}, token);
}

export async function markNotificationRead(token, notificationId) {
  return authFetch(`${EMR_API}/notifications/${notificationId}/read`, {
    method: "PATCH",
  }, token);
}
