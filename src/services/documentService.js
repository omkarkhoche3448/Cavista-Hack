/**
 * Document API service — upload, list, share medical documents.
 */

import { DOCUMENTS_API } from "@/api";
import { apiRequest } from "@/services/apiClient";

export async function uploadDocument(token, { file, title, documentType = "other", description = "" }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);
  formData.append("document_type", documentType);
  if (description) formData.append("description", description);

  return apiRequest(DOCUMENTS_API, {
    method: "POST",
    token,
    body: formData,
  });
}

export async function listDocuments(token) {
  return apiRequest(DOCUMENTS_API, { token });
}

export async function shareDocuments(token, { sessionId, documentIds }) {
  return apiRequest(`${DOCUMENTS_API}/share`, {
    method: "POST",
    token,
    json: {
      session_id: sessionId,
      document_ids: documentIds,
    },
  });
}

export async function getSessionDocuments(token, sessionId) {
  return apiRequest(`${DOCUMENTS_API}/session/${sessionId}`, { token });
}

export async function deleteDocument(token, documentId) {
  await apiRequest(`${DOCUMENTS_API}/${documentId}`, {
    method: "DELETE",
    token,
  });
}
