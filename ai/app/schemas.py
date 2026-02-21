from pydantic import BaseModel, Field
from typing import List, Optional

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
