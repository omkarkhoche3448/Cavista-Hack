# Backend-AI Data Contract

## Unified Contract

### Backend -> AI (internal normalized envelope)

```json
{
  "request_id": "string",
  "timestamp": "ISO-8601 UTC",
  "payload": {},
  "metadata": {
    "source": "doctor|patient|system",
    "version": "v1"
  }
}
```

### AI -> Backend (internal normalized envelope)

```json
{
  "success": true,
  "request_id": "string",
  "result": {
    "prediction": {},
    "confidence": 0.91,
    "details": {
      "operation": "generate_emr_draft"
    }
  },
  "error": null,
  "processing_time_ms": 1320
}
```

## Before vs After Mapping

| Flow | Before | After |
|---|---|---|
| Input transform | Raw payload passed directly from service | `mapBackendToAI()` validates and normalizes request envelope |
| Output transform | Raw AI JSON returned directly | `mapAIToBackend()` validates/normalizes response envelope |
| Error shape | Mixed (`None`, raw response text, ad-hoc fallbacks) | Standardized `{success, request_id, result, error, processing_time_ms}` internally |
| Traceability | No request id across AI boundary | Request id generated/preserved for every AI call |
| Transcription integration | Direct `requests.post()` in `session_service` | Routed through `ai_service.transcribe_audio_from_url()` with contract mapping |

## Adapter Functions

- `backend/src/ai/adapters/mappers.py`
  - `mapBackendToAI(input_data, operation, source, version)`
  - `mapAIToBackend(output, operation, request_id, started_at)`

- `backend/src/ai/adapters/contracts.py`
  - Operation payload validation models
  - Operation output validation models
  - `validate_payload(...)`
  - `validate_operation_output(...)`

## Integration Points

- `backend/src/services/ai_service.py`
  - All JSON AI operations now use `_call_json(...)` -> adapter in/out
  - Binary PDF operation validates inbound payload via adapter and logs mapped output metadata
  - Added `transcribe_audio_from_url(audio_url)` for centralized AI boundary

- `backend/src/services/session_service.py`
  - `run_audio_transcription(...)` now calls `ai_service.transcribe_audio_from_url(...)`

## Error Mapping Strategy

Internal AI errors are mapped into structured codes:

- `ai_input_validation_failed`
- `ai_request_failed`
- `ai_endpoint_not_found`
- `ai_http_error`
- `ai_invalid_json`
- `ai_invalid_output_schema`
- `ai_empty_response`

Backend endpoint responses remain backward-compatible and still use existing fallback business behavior.

## End-to-End Example

1. Backend session pipeline calls `generate_emr_draft(...)`.
2. Service builds raw payload from transcript + summaries.
3. `mapBackendToAI(...)` normalizes into envelope and validates payload.
4. `payload` is sent to `POST /ai/generate-emr`.
5. Raw AI JSON is validated by `mapAIToBackend(...)`.
6. Service extracts `result.prediction` and maps to existing EMR draft schema expected by downstream tables.
7. On failure, service keeps existing fallback EMR defaults (no API contract break for frontend).

## AI Route Parity

Implemented `ai/` routes now include:

- `/ai/generate-emr`
- `/ai/generate-emr-pdf`
- `/ai/analyze-lab-report`
- `/ai/lab-report-to-json`
- `/ai/map-icd`
- `/ai/suggest-treatments`
- `/ai/generate-summary`
- `/ai/live-insight`
- `/transcribe/`
