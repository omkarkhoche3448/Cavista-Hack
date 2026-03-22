from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

class ImageAdRequest(BaseModel):
    image_url: Optional[str] = None
    image_data: Optional[str] = None


class AIAnalysisResponse(BaseModel):
    insights: str

class LabReportRequest(BaseModel):
    pdf_url: Optional[str] = None
    pdf_base64: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    report_type: Optional[str] = None

class LabReportSummaryResponse(BaseModel):
    summary: str
    key_findings: List[str]
    abnormal_results: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    risk_flags: List[str] = Field(default_factory=list)
    medications_found: List[str] = Field(default_factory=list)
    allergies_found: List[str] = Field(default_factory=list)

class LabReportJSONResponse(BaseModel):
    report: List[str]

class EMRRequest(BaseModel):
    conversation: str
    report_summaries: List[str]
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None

class EMRResponse(BaseModel):
    patient_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    chief_complaint: str
    history_of_present_illness: str
    past_medical_history: List[str] = []
    medications: List[str] = []
    allergies: List[str] = []
    physical_examination: Optional[str] = None
    assessment: str
    plan: List[str] = []
    follow_up: Optional[str] = None
    icd10_codes: List[str] = []


class ICDMapRequest(BaseModel):
    diagnoses: List[Any] = Field(default_factory=list)
    conversation: Optional[str] = None


class ICDMapItem(BaseModel):
    diagnosis_text: str
    icd_code: Optional[str] = None
    icd_description: Optional[str] = None
    confidence_score: float = 0.0
    is_primary: bool = False


class SuggestTreatmentsRequest(BaseModel):
    diagnoses: List[Any] = Field(default_factory=list)
    conversation: Optional[str] = None
    current_medications: Optional[List[Any]] = None


class TreatmentSuggestionItem(BaseModel):
    suggestion_type: str
    title: str
    description: str
    rationale: Optional[str] = None
    priority: Optional[str] = None
    contraindications: Optional[str] = None
    evidence_basis: Optional[str] = None


class PatientSummaryRequest(BaseModel):
    emr_content: Dict[str, Any] = Field(default_factory=dict)
    diagnoses: List[Any] = Field(default_factory=list)
    treatments: List[Any] = Field(default_factory=list)


class PatientSummaryResponse(BaseModel):
    summary_text: str
    key_takeaways: List[str] = Field(default_factory=list)
    medications_list: List[str] = Field(default_factory=list)
    follow_up_notes: str
    warnings: List[str] = Field(default_factory=list)


class LiveInsightRequest(BaseModel):
    transcript: str = Field(min_length=1)


class LiveInsightResponse(BaseModel):
    insight: str
