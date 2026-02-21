/**
 * Document API service — upload, list, share medical documents.
 */

import { DOCUMENTS_API } from "@/api";

async function authFetch(url, options = {}, token) {
  const res = await fetch(url, {
    ...options,
    headers: {
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

export async function uploadDocument(token, { file, title, documentType = "other", description = "" }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);
  formData.append("document_type", documentType);
  if (description) formData.append("description", description);

  const res = await fetch(DOCUMENTS_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function listDocuments(token) {
  return authFetch(DOCUMENTS_API, {}, token);
}

export async function shareDocuments(token, { sessionId, documentIds }) {
  return authFetch(`${DOCUMENTS_API}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      document_ids: documentIds,
    }),
  }, token);
}

export async function getSessionDocuments(token, sessionId) {
  return authFetch(`${DOCUMENTS_API}/session/${sessionId}`, {}, token);
}
