from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AISource = Literal["doctor", "patient", "system"]
AIOperation = Literal[
    "generate_emr_draft",
    "map_icd_codes",
    "suggest_treatments",
    "generate_patient_summary",
    "generate_live_insight",
    "generate_emr_pdf",
    "analyze_lab_report",
    "transcribe_audio",
]


class AIRequestMetadata(BaseModel):
    source: AISource = "system"
    version: str = "v1"

    model_config = ConfigDict(extra="forbid")


class AIRequestContract(BaseModel):
    request_id: str = Field(..., min_length=8, max_length=128)
    timestamp: datetime
    payload: dict[str, Any]
    metadata: AIRequestMetadata

    model_config = ConfigDict(extra="forbid")

    @field_validator("timestamp")
    @classmethod
    def ensure_utc_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class AIErrorModel(BaseModel):
    code: str
    details: Any = None

    model_config = ConfigDict(extra="allow")


class AIResultModel(BaseModel):
    prediction: Any = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    details: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")


class AIResponseContract(BaseModel):
    success: bool
    request_id: str
    result: AIResultModel | None = None
    error: AIErrorModel | None = None
    processing_time_ms: int = Field(default=0, ge=0)

    model_config = ConfigDict(extra="allow")


class GenerateEMRDraftPayload(BaseModel):
    conversation: str = ""
    chief_complaint: str = ""
    report_summaries: list[str] = Field(default_factory=list)
    patient_id: str = ""
    patient_name: str = ""
    patient_gender: str = ""
    patient_age: int | None = None
    doctor_id: str = ""
    doctor_name: str = ""

    model_config = ConfigDict(extra="ignore")


class MapICDPayload(BaseModel):
    diagnoses: list[Any] = Field(default_factory=list)
    conversation: str | None = None

    model_config = ConfigDict(extra="ignore")


class SuggestTreatmentsPayload(BaseModel):
    diagnoses: list[Any] = Field(default_factory=list)
    conversation: str | None = None
    current_medications: list[Any] | None = None

    model_config = ConfigDict(extra="ignore")


class GenerateSummaryPayload(BaseModel):
    emr_content: dict[str, Any] = Field(default_factory=dict)
    diagnoses: list[Any] = Field(default_factory=list)
    treatments: list[Any] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class LiveInsightPayload(BaseModel):
    transcript: str = Field(..., min_length=1)

    model_config = ConfigDict(extra="ignore")


class GenerateEMRPDFPayload(BaseModel):
    conversation: str = ""
    report_summaries: list[str] = Field(default_factory=list)
    patient_id: str = ""
    patient_name: str = ""
    doctor_id: str = ""
    doctor_name: str = ""
    chief_complaint: str = ""
    history_of_present_illness: str = ""
    assessment: str = ""
    plan: list[str] = Field(default_factory=list)
    diagnoses: list[Any] = Field(default_factory=list)
    physical_exam: str = ""
    past_medical_history: list[Any] = Field(default_factory=list)
    medications: list[Any] = Field(default_factory=list)
    allergies: list[Any] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class AnalyzeLabReportPayload(BaseModel):
    pdf_url: str = Field(..., min_length=1)
    patient_id: str = ""
    patient_name: str = ""
    report_type: str = "other"

    model_config = ConfigDict(extra="ignore")


class TranscribeAudioPayload(BaseModel):
    audio_url: str = Field(..., min_length=1)

    model_config = ConfigDict(extra="ignore")


class EMRDraftOutput(BaseModel):
    chief_complaint: str | None = None
    history_of_present_illness: str | None = None
    past_medical_history: list[Any] | None = None
    medications: list[Any] | None = None
    allergies: list[Any] | None = None
    physical_examination: str | None = None
    assessment: str | None = None
    plan: list[str] | str | None = None
    follow_up: str | None = None
    icd10_codes: list[str] | None = None

    model_config = ConfigDict(extra="allow")


class ICDMappingOutput(BaseModel):
    diagnosis_text: str | None = None
    icd_code: str | None = None
    icd_description: str | None = None
    confidence_score: float | None = None
    is_primary: bool | None = None

    model_config = ConfigDict(extra="allow")


class TreatmentOutput(BaseModel):
    suggestion_type: str | None = None
    title: str | None = None
    description: str | None = None
    rationale: str | None = None
    priority: str | None = None
    contraindications: str | None = None
    evidence_basis: str | None = None

    model_config = ConfigDict(extra="allow")


class PatientSummaryOutput(BaseModel):
    summary_text: str | None = None
    key_takeaways: list[Any] | None = None
    medications_list: list[Any] | None = None
    follow_up_notes: str | None = None
    warnings: list[Any] | None = None

    model_config = ConfigDict(extra="allow")


class LiveInsightOutput(BaseModel):
    insight: str | None = None

    model_config = ConfigDict(extra="allow")


class LabReportAnalysisOutput(BaseModel):
    summary: str | None = None
    key_findings: list[Any] | None = None
    recommendations: Any = None
    abnormal_results: list[Any] | None = None
    risk_flags: list[Any] | None = None
    medications_found: list[Any] | None = None
    allergies_found: list[Any] | None = None

    model_config = ConfigDict(extra="allow")


class TranscribeAudioOutput(BaseModel):
    transcription: str | None = None
    transcript: str | None = None

    model_config = ConfigDict(extra="allow")


PAYLOAD_MODEL_BY_OPERATION: dict[AIOperation, type[BaseModel]] = {
    "generate_emr_draft": GenerateEMRDraftPayload,
    "map_icd_codes": MapICDPayload,
    "suggest_treatments": SuggestTreatmentsPayload,
    "generate_patient_summary": GenerateSummaryPayload,
    "generate_live_insight": LiveInsightPayload,
    "generate_emr_pdf": GenerateEMRPDFPayload,
    "analyze_lab_report": AnalyzeLabReportPayload,
    "transcribe_audio": TranscribeAudioPayload,
}


def validate_payload(operation: AIOperation, payload: dict[str, Any]) -> dict[str, Any]:
    model_cls = PAYLOAD_MODEL_BY_OPERATION[operation]
    validated = model_cls.model_validate(payload)
    return validated.model_dump(exclude_none=True)


def _ensure_type(operation: AIOperation, output: Any, expected: type, label: str) -> None:
    if not isinstance(output, expected):
        raise ValueError(f"{operation} expects {label} output, received {type(output).__name__}")


def validate_operation_output(operation: AIOperation, output: Any) -> Any:
    if operation == "generate_emr_draft":
        _ensure_type(operation, output, dict, "object")
        return EMRDraftOutput.model_validate(output).model_dump(exclude_none=True)

    if operation == "map_icd_codes":
        _ensure_type(operation, output, list, "array")
        return [ICDMappingOutput.model_validate(item).model_dump(exclude_none=True) for item in output]

    if operation == "suggest_treatments":
        _ensure_type(operation, output, list, "array")
        return [TreatmentOutput.model_validate(item).model_dump(exclude_none=True) for item in output]

    if operation == "generate_patient_summary":
        _ensure_type(operation, output, dict, "object")
        return PatientSummaryOutput.model_validate(output).model_dump(exclude_none=True)

    if operation == "generate_live_insight":
        if isinstance(output, str):
            output = {"insight": output}
        _ensure_type(operation, output, dict, "object")
        return LiveInsightOutput.model_validate(output).model_dump(exclude_none=True)

    if operation == "analyze_lab_report":
        _ensure_type(operation, output, dict, "object")
        return LabReportAnalysisOutput.model_validate(output).model_dump(exclude_none=True)

    if operation == "transcribe_audio":
        _ensure_type(operation, output, dict, "object")
        return TranscribeAudioOutput.model_validate(output).model_dump(exclude_none=True)

    if operation == "generate_emr_pdf":
        _ensure_type(operation, output, dict, "object")
        return output

    return output
