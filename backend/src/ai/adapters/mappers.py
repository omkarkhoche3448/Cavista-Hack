from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any, Mapping

from pydantic import ValidationError

from .contracts import (
    AIRequestContract,
    AIRequestMetadata,
    AIResponseContract,
    AIResultModel,
    AIOperation,
    AISource,
    validate_operation_output,
    validate_payload,
)


def mapBackendToAI(
    input_data: Mapping[str, Any] | None,
    *,
    operation: AIOperation,
    source: AISource = "system",
    version: str = "v1",
) -> AIRequestContract:
    raw = input_data or {}
    request_id = str(raw.get("request_id") or uuid.uuid4())
    timestamp = raw.get("timestamp") or datetime.now(timezone.utc)

    payload_raw = raw.get("payload")
    if isinstance(payload_raw, Mapping):
        payload_candidate = dict(payload_raw)
    else:
        payload_candidate = {
            key: value
            for key, value in raw.items()
            if key not in {"request_id", "timestamp", "metadata", "operation"}
        }

    normalized_payload = validate_payload(operation, payload_candidate)
    return AIRequestContract(
        request_id=request_id,
        timestamp=timestamp,
        payload=normalized_payload,
        metadata=AIRequestMetadata(source=source, version=version),
    )


def mapAIToBackend(
    output: Any,
    *,
    operation: AIOperation,
    request_id: str,
    started_at: float | None = None,
) -> AIResponseContract:
    elapsed_ms = 0
    if started_at is not None:
        elapsed_ms = max(0, int((time.perf_counter() - started_at) * 1000))

    if isinstance(output, dict) and {"success", "request_id", "result", "error", "processing_time_ms"}.issubset(
        output.keys()
    ):
        try:
            standardized = AIResponseContract.model_validate(output)
            if not standardized.processing_time_ms and elapsed_ms:
                standardized.processing_time_ms = elapsed_ms
            return standardized
        except ValidationError as error:
            return AIResponseContract(
                success=False,
                request_id=request_id,
                result=None,
                error={"code": "ai_invalid_standard_response", "details": error.errors()},
                processing_time_ms=elapsed_ms,
            )

    if output is None:
        return AIResponseContract(
            success=False,
            request_id=request_id,
            result=None,
            error={"code": "ai_empty_response", "details": None},
            processing_time_ms=elapsed_ms,
        )

    try:
        normalized = validate_operation_output(operation, output)
    except (ValidationError, ValueError, TypeError) as error:
        return AIResponseContract(
            success=False,
            request_id=request_id,
            result=None,
            error={
                "code": "ai_invalid_output_schema",
                "details": {"operation": operation, "error": str(error)},
            },
            processing_time_ms=elapsed_ms,
        )

    confidence = None
    if isinstance(normalized, dict):
        raw_conf = normalized.get("confidence") or normalized.get("confidence_score")
        if isinstance(raw_conf, (int, float)) and 0 <= float(raw_conf) <= 1:
            confidence = float(raw_conf)

    return AIResponseContract(
        success=True,
        request_id=request_id,
        result=AIResultModel(
            prediction=normalized,
            confidence=confidence,
            details={"operation": operation},
        ),
        error=None,
        processing_time_ms=elapsed_ms,
    )
