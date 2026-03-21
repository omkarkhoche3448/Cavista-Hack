from pydantic import BaseModel
from typing import Any, List, Optional

class ImageAdRequest(BaseModel):
    image_url: Optional[str] = None
    image_data: Optional[str] = None


class AIAnalysisResponse(BaseModel):
    insights: str

class LabReportRequest(BaseModel):
    pdf_url: str = None
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    report_type: Optional[str] = None

class LabReportSummaryResponse(BaseModel):
    summary: str
    key_findings: List[str]
    recommendations: str

class LabReportJSONResponse(BaseModel):
    report: List[str]

class EMRRequest(BaseModel):
    conversation: str = ""
    chief_complaint: Optional[str] = None
    report_summaries: List[Any] = []
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None

class EMRResponse(BaseModel):
    chief_complaint: Optional[str] = None
    history_present_illness: Optional[str] = None
    past_medical_history: Any = None
    medications: Any = None
    allergies: Any = None
    vital_signs: Any = None
    review_of_systems: Any = None
    physical_examination: Any = None
    assessment: Optional[str] = None
    diagnoses: Any = None
    treatment_plan: Any = None
    medications_prescribed: Any = None
    follow_up_plan: Optional[str] = None
    patient_instructions: Optional[str] = None
    model_used: Optional[str] = None


class MapICDRequest(BaseModel):
    diagnoses: List[Any] = []
    conversation: str = ""


class SuggestTreatmentsRequest(BaseModel):
    diagnoses: List[Any] = []
    conversation: str = ""
    current_medications: Any = None


class GenerateSummaryRequest(BaseModel):
    emr_content: Any = None
    diagnoses: List[Any] = []
    treatments: List[Any] = []


class LiveInsightRequest(BaseModel):
    transcript: str
