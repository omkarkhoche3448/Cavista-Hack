from __future__ import annotations

import json
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

ENVELOPE_HEADER = "x-api-envelope"
ENVELOPE_ENABLED_VALUES = {"1", "true", "yes", "on"}


def wants_envelope(request: Request) -> bool:
    value = request.headers.get(ENVELOPE_HEADER, "")
    return value.strip().lower() in ENVELOPE_ENABLED_VALUES


def success_envelope(data: Any, message: str | None = None) -> dict[str, Any]:
    return {
        "success": True,
        "message": message,
        "data": data,
        "error": None,
    }


def error_envelope(
    *,
    message: str,
    error: Any = None,
    data: Any = None,
) -> dict[str, Any]:
    return {
        "success": False,
        "message": message,
        "data": data,
        "error": error,
    }


def is_envelope_payload(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    required = {"success", "message", "data", "error"}
    return required.issubset(payload.keys())


class ResponseEnvelopeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if not wants_envelope(request):
            return response
        if response.status_code in {204, 304}:
            return response

        content_type = response.headers.get("content-type", "").lower()
        if "application/json" not in content_type:
            return response

        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        if not body:
            wrapped = success_envelope(None)
        else:
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                return Response(
                    content=body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                    background=response.background,
                )

            if is_envelope_payload(payload):
                wrapped = payload
            elif 200 <= response.status_code < 400:
                wrapped = success_envelope(payload)
            else:
                message = "Request failed."
                details: Any = payload
                if isinstance(payload, dict):
                    message = str(payload.get("detail") or payload.get("message") or message)
                    details = payload.get("errors") if "errors" in payload else payload
                wrapped = error_envelope(message=message, error=details)

        wrapped_response = JSONResponse(
            status_code=response.status_code,
            content=wrapped,
            background=response.background,
        )
        for key, value in response.headers.items():
            if key.lower() != "content-length":
                wrapped_response.headers[key] = value
        return wrapped_response
