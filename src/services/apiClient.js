const ENVELOPE_HEADER = "X-Api-Envelope";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEnvelope(value) {
  return isObject(value) && "success" in value && "data" in value && "error" in value;
}

function buildError(message, status, payload) {
  const error = new Error(message || "Request failed");
  error.status = status;
  error.payload = payload;
  return error;
}

async function parseResponse(res) {
  if (res.status === 204) return null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  return text || null;
}

function extractLegacyMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  if (isObject(payload)) {
    return payload.detail || payload.message || fallback;
  }
  return fallback;
}

export async function apiRequest(url, { method = "GET", token, headers = {}, json, body } = {}) {
  const requestHeaders = {
    [ENVELOPE_HEADER]: "1",
    ...headers,
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let requestBody = body;
  if (json !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestBody = JSON.stringify(json);
  }

  const res = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  const payload = await parseResponse(res);
  const fallbackMessage = res.statusText || "Request failed";

  if (!res.ok) {
    if (isEnvelope(payload)) {
      throw buildError(payload.message || fallbackMessage, res.status, payload);
    }
    throw buildError(extractLegacyMessage(payload, fallbackMessage), res.status, payload);
  }

  if (isEnvelope(payload)) {
    if (!payload.success) {
      throw buildError(payload.message || fallbackMessage, res.status, payload);
    }
    return payload.data;
  }

  return payload;
}
