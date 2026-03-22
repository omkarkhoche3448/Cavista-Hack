from __future__ import annotations

import logging
import time
import uuid
from typing import Any

import requests
from pydantic import ValidationError

from ..ai.adapters import AIResponseContract, AIOperation, AISource, mapAIToBackend, mapBackendToAI
from ..config.settings import settings

logger = logging.getLogger(__name__)
BASE_URL = str(settings.ANALYSIS_API_URL).rstrip("/")


def _elapsed_ms(started_at: float) -> int:
    return max(0, int((time.perf_counter() - started_at) * 1000))


def _preview(payload: Any, *, limit: int = 1200) -> str:
    try:
        text = str(payload)
    except Exception:
        text = "<unserializable>"
    if len(text) > limit:
        return text[:limit] + "...(truncated)"
    return text


def _error_contract(
    *,
    request_id: str,
    code: str,
    details: Any,
    started_at: float,
) -> AIResponseContract:
    return AIResponseContract(
        success=False,
        request_id=request_id,
        result=None,
        error={"code": code, "details": details},
        processing_time_ms=_elapsed_ms(started_at),
    )


def _extract_prediction(
    contract: AIResponseContract,
    *,
    operation: AIOperation,
    fallback: Any,
) -> Any:
    if contract.success and contract.result is not None:
        return contract.result.prediction
    logger.warning(
        "AI operation failed request_id=%s operation=%s error=%s",
        contract.request_id,
        operation,
        contract.error.model_dump() if contract.error else None,
    )
    return fallback


def _call_json(
    *,
    operation: AIOperation,
    endpoint: str,
    backend_payload: dict[str, Any],
    source: AISource = "system",
    timeout: int = 90,
) -> AIResponseContract:
    started_at = time.perf_counter()
    request_id = str(backend_payload.get("request_id") or uuid.uuid4())
    outbound_raw = dict(backend_payload)
    outbound_raw["request_id"] = request_id

    try:
        contract_in = mapBackendToAI(outbound_raw, operation=operation, source=source)
    except ValidationError as error:
        return _error_contract(
            request_id=request_id,
            code="ai_input_validation_failed",
            details=error.errors(),
            started_at=started_at,
        )

    url = f"{BASE_URL}{endpoint}"
    logger.debug(
        "AI backend input request_id=%s operation=%s data=%s",
        contract_in.request_id,
        operation,
        _preview(backend_payload),
    )
    logger.debug(
        "AI transformed input request_id=%s operation=%s payload=%s",
        contract_in.request_id,
        operation,
        _preview(contract_in.payload),
    )

    try:
        response = requests.post(url, json=contract_in.payload, timeout=timeout)
    except requests.RequestException as error:
        return _error_contract(
            request_id=contract_in.request_id,
            code="ai_request_failed",
            details=str(error),
            started_at=started_at,
        )

    if response.status_code == 404:
        return _error_contract(
            request_id=contract_in.request_id,
            code="ai_endpoint_not_found",
            details={"endpoint": endpoint},
            started_at=started_at,
        )

    if response.status_code >= 400:
        details: Any
        try:
            details = response.json()
        except ValueError:
            details = response.text[:500]
        return _error_contract(
            request_id=contract_in.request_id,
            code="ai_http_error",
            details={
                "endpoint": endpoint,
                "status_code": response.status_code,
                "response": details,
            },
            started_at=started_at,
        )

    try:
        raw_output: Any = response.json()
    except ValueError:
        return _error_contract(
            request_id=contract_in.request_id,
            code="ai_invalid_json",
            details={"endpoint": endpoint, "status_code": response.status_code},
            started_at=started_at,
        )

    logger.debug(
        "AI raw output request_id=%s operation=%s output=%s",
        contract_in.request_id,
        operation,
        _preview(raw_output),
    )

    mapped = mapAIToBackend(
        raw_output,
        operation=operation,
        request_id=contract_in.request_id,
        started_at=started_at,
    )
    logger.debug(
        "AI mapped output request_id=%s operation=%s output=%s",
        mapped.request_id,
        operation,
        _preview(mapped.model_dump()),
    )
    return mapped


def generate_emr_draft(
    *,
    chief_complaint: str = "",
    document_insights: list[str] | None = None,
    audio_url: str | None = None,
    transcript: str | None = None,
    patient_name: str | None = None,
    patient_gender: str | None = None,
    patient_age: int | None = None,
    doctor_id: str | None = None,
    doctor_name: str | None = None,
    patient_id: str | None = None,
) -> dict:
    conversation = transcript or audio_url or ""
    backend_payload = {
        "conversation": conversation,
        "chief_complaint": chief_complaint,
        "report_summaries": document_insights or [],
        "patient_id": patient_id or "",
        "patient_name": patient_name or "",
        "patient_gender": patient_gender or "",
        "patient_age": patient_age,
        "doctor_id": doctor_id or "",
        "doctor_name": doctor_name or "",
    }
    contract = _call_json(
        operation="generate_emr_draft",
        endpoint="/ai/generate-emr",
        backend_payload=backend_payload,
        source="doctor",
    )
    result = _extract_prediction(
        contract,
        operation="generate_emr_draft",
        fallback=None,
    )

    def pick(data: dict, *keys: str, default: Any = None) -> Any:
        for key in keys:
            value = data.get(key)
            if value is not None:
                return value
        return default

    if not result:
        return {
            "chief_complaint": chief_complaint or "Unknown",
            "history_present_illness": "Pending AI processing.",
            "assessment": "Pending AI processing.",
            "diagnoses": [],
            "treatment_plan": "Pending AI processing.",
            "physical_examination": "Pending AI processing.",
            "past_medical_history": [],
            "medications": [],
            "allergies": [],
        }

    diagnoses = pick(result, "diagnoses", default=[])
    icd_codes = pick(result, "icd10_codes", default=[])
    if not diagnoses and icd_codes:
        diagnoses = icd_codes

    plan_data = pick(result, "treatment_plan", "plan", default="Pending AI processing.")
    if isinstance(plan_data, list):
        plan_data = "\n".join(f"• {item}" for item in plan_data) if plan_data else "Pending AI processing."

    return {
        "chief_complaint": pick(result, "chief_complaint", default=chief_complaint or "Unknown"),
        "history_present_illness": pick(
            result,
            "history_present_illness",
            "history_of_present_illness",
            default="Pending AI processing.",
        ),
        "past_medical_history": pick(result, "past_medical_history", default=[]),
        "medications": pick(result, "medications", default=[]),
        "allergies": pick(result, "allergies", default=[]),
        "vital_signs": pick(result, "vital_signs", default={}),
        "review_of_systems": pick(result, "review_of_systems", default={}),
        "physical_examination": pick(result, "physical_examination", default="Pending AI processing."),
        "assessment": pick(result, "assessment", default="Pending AI processing."),
        "diagnoses": diagnoses,
        "treatment_plan": plan_data,
        "medications_prescribed": pick(result, "medications_prescribed", default=[]),
        "follow_up_plan": pick(result, "follow_up_plan", "follow_up", default="Pending AI processing."),
        "patient_instructions": pick(result, "patient_instructions", default="Pending AI processing."),
    }


def map_icd_codes(diagnoses: list, audio_url: str | None = None, transcript: str | None = None) -> list:
    if not diagnoses:
        return []

    contract = _call_json(
        operation="map_icd_codes",
        endpoint="/ai/map-icd",
        backend_payload={"diagnoses": diagnoses, "conversation": audio_url or transcript},
        source="doctor",
    )
    mapped = _extract_prediction(contract, operation="map_icd_codes", fallback=[])
    return mapped if isinstance(mapped, list) else []


def suggest_treatments(
    *,
    diagnoses: list,
    current_medications: list | None = None,
    audio_url: str | None = None,
    transcript: str | None = None,
) -> list:
    if not diagnoses:
        return []

    contract = _call_json(
        operation="suggest_treatments",
        endpoint="/ai/suggest-treatments",
        backend_payload={
            "diagnoses": diagnoses,
            "conversation": audio_url or transcript,
            "current_medications": current_medications,
        },
        source="doctor",
    )
    mapped = _extract_prediction(contract, operation="suggest_treatments", fallback=[])
    return mapped if isinstance(mapped, list) else []


def generate_patient_summary(emr_content: dict, diagnoses: list, treatments: list) -> dict:
    default_summary = {
        "summary_text": "Your session summary is being processed. Please check back later.",
        "key_takeaways": [],
        "medications_list": [],
        "follow_up_notes": "Consult your doctor for details.",
        "warnings": [],
    }
    contract = _call_json(
        operation="generate_patient_summary",
        endpoint="/ai/generate-summary",
        backend_payload={
            "emr_content": emr_content,
            "diagnoses": diagnoses,
            "treatments": treatments,
        },
        source="doctor",
    )
    mapped = _extract_prediction(contract, operation="generate_patient_summary", fallback=default_summary)
    if isinstance(mapped, dict) and mapped:
        return mapped
    return default_summary


def generate_live_insight(transcript: str) -> str:
    contract = _call_json(
        operation="generate_live_insight",
        endpoint="/ai/live-insight",
        backend_payload={"transcript": transcript},
        source="doctor",
    )
    mapped = _extract_prediction(contract, operation="generate_live_insight", fallback=None)
    if isinstance(mapped, str):
        return mapped
    if isinstance(mapped, dict):
        return str(mapped.get("insight") or "No insight generated.")
    return "Live insights are not available right now."


def generate_emr_pdf(
    *,
    conversation: str,
    report_summaries: list,
    patient_id: str,
    patient_name: str,
    doctor_id: str,
    doctor_name: str,
    emr_content: dict,
) -> bytes | None:
    started_at = time.perf_counter()
    request_id = str(uuid.uuid4())

    plan_raw = emr_content.get("treatment_plan") or ""
    plan_list = (
        [line.strip().replace("• ", "") for line in plan_raw.split("\n") if line.strip()]
        if isinstance(plan_raw, str)
        else (plan_raw if isinstance(plan_raw, list) else [])
    )

    backend_payload = {
        "request_id": request_id,
        "conversation": conversation,
        "report_summaries": report_summaries,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "doctor_id": doctor_id,
        "doctor_name": doctor_name,
        "chief_complaint": emr_content.get("chief_complaint") or "Unknown",
        "history_of_present_illness": emr_content.get("history_present_illness") or "Not recorded.",
        "assessment": emr_content.get("assessment") or "Not recorded.",
        "plan": plan_list,
        "diagnoses": emr_content.get("diagnoses") or [],
        "physical_exam": emr_content.get("physical_examination") or "Not recorded.",
        "past_medical_history": emr_content.get("past_medical_history") or [],
        "medications": emr_content.get("medications") or [],
        "allergies": emr_content.get("allergies") or [],
    }

    try:
        contract_in = mapBackendToAI(
            backend_payload,
            operation="generate_emr_pdf",
            source="doctor",
        )
    except ValidationError as error:
        logger.error(
            "AI PDF input validation failed request_id=%s details=%s",
            request_id,
            _preview(error.errors()),
        )
        return None

    logger.debug(
        "AI backend input request_id=%s operation=generate_emr_pdf data=%s",
        contract_in.request_id,
        _preview(backend_payload),
    )
    logger.debug(
        "AI transformed input request_id=%s operation=generate_emr_pdf payload=%s",
        contract_in.request_id,
        _preview(contract_in.payload),
    )

    url = f"{BASE_URL}/ai/generate-emr-pdf"
    try:
        response = requests.post(url, json=contract_in.payload, timeout=120)
    except requests.RequestException as error:
        logger.error(
            "AI PDF request failed request_id=%s error=%s",
            contract_in.request_id,
            error,
        )
        return None

    if response.status_code == 200:
        logger.debug(
            "AI mapped output request_id=%s operation=generate_emr_pdf output=%s",
            contract_in.request_id,
            _preview(
                {
                    "success": True,
                    "request_id": contract_in.request_id,
                    "result": "<binary_pdf>",
                    "error": None,
                    "processing_time_ms": _elapsed_ms(started_at),
                }
            ),
        )
        return response.content

    error_contract = _error_contract(
        request_id=contract_in.request_id,
        code="ai_http_error",
        details={
            "endpoint": "/ai/generate-emr-pdf",
            "status_code": response.status_code,
            "response": response.text[:500],
        },
        started_at=started_at,
    )
    logger.error(
        "AI mapped output request_id=%s operation=generate_emr_pdf output=%s",
        error_contract.request_id,
        _preview(error_contract.model_dump()),
    )
    return None


def analyze_lab_report(pdf_url: str, patient_id: str, patient_name: str, report_type: str) -> dict | None:
    contract = _call_json(
        operation="analyze_lab_report",
        endpoint="/ai/analyze-lab-report",
        backend_payload={
            "pdf_url": pdf_url,
            "patient_id": patient_id,
            "patient_name": patient_name,
            "report_type": report_type,
        },
        source="patient",
    )
    mapped = _extract_prediction(contract, operation="analyze_lab_report", fallback=None)
    return mapped if isinstance(mapped, dict) else None


def transcribe_audio_from_url(audio_url: str) -> str | None:
    contract = _call_json(
        operation="transcribe_audio",
        endpoint="/transcribe/",
        backend_payload={"audio_url": audio_url},
        source="system",
        timeout=180,
    )
    mapped = _extract_prediction(contract, operation="transcribe_audio", fallback=None)
    if not isinstance(mapped, dict):
        return None
    transcription = mapped.get("transcription") or mapped.get("transcript")
    if isinstance(transcription, str):
        return transcription.strip() or None
    return None
