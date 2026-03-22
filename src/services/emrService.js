/**
 * EMR API service — drafts, ICD mappings, treatments, patient summaries.
 */

import { EMR_API } from "@/api";
import { apiRequest } from "@/services/apiClient";

export async function getEMRDrafts(token, sessionId) {
  return apiRequest(`${EMR_API}/drafts/${sessionId}`, { token });
}

export async function getEMRDraft(token, draftId) {
  return apiRequest(`${EMR_API}/draft/${draftId}`, { token });
}

export async function approveEMR(token, { draftId, reviewNotes, edits }) {
  return apiRequest(`${EMR_API}/approve`, {
    method: "POST",
    token,
    json: {
      draft_id: draftId,
      review_notes: reviewNotes,
      edits,
    },
  });
}

export async function getICDMappings(token, sessionId) {
  return apiRequest(`${EMR_API}/icd-mappings/${sessionId}`, { token });
}

export async function updateICDMapping(token, mappingId, action) {
  return apiRequest(`${EMR_API}/icd-mappings/${mappingId}?action=${action}`, {
    method: "PATCH",
    token,
  });
}

export async function getTreatments(token, sessionId) {
  return apiRequest(`${EMR_API}/treatments/${sessionId}`, { token });
}

export async function approveTreatment(token, { suggestionId, action, doctorNotes }) {
  return apiRequest(`${EMR_API}/treatments/approve`, {
    method: "POST",
    token,
    json: {
      suggestion_id: suggestionId,
      action,
      doctor_notes: doctorNotes,
    },
  });
}

export async function getPatientSummary(token, sessionId) {
  return apiRequest(`${EMR_API}/patient-summary/${sessionId}`, { token });
}

export async function approvePatientSummary(token, { summaryId, edits }) {
  return apiRequest(`${EMR_API}/patient-summary/approve`, {
    method: "POST",
    token,
    json: {
      summary_id: summaryId,
      edits,
    },
  });
}

export async function getInsights(token, sessionId) {
  return apiRequest(`${EMR_API}/insights/${sessionId}`, { token });
}

export async function getEMRPdfUrl(token, sessionId) {
  return apiRequest(`${EMR_API}/pdf/${sessionId}`, { token });
}

export async function getNotifications(token) {
  return apiRequest(`${EMR_API}/notifications`, { token });
}

export async function markNotificationRead(token, notificationId) {
  return apiRequest(`${EMR_API}/notifications/${notificationId}/read`, {
    method: "PATCH",
    token,
  });
}
