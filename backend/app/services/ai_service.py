"""
AI Service — all calls to the external Analysis AI API go through here.
"""

import logging
import requests
from ..config import settings

logger = logging.getLogger(__name__)
BASE_URL = settings.ANALYSIS_API_URL


def _call(endpoint: str, payload: dict):
    """
    Internal generic POST wrapper for the external Analysis AI service.
    
    Why: Provides a single point of failure handling, logging, and timeout management for all AI calls.
    Where: Used by all public functions in `ai_service.py`.
    
    Args:
        endpoint (str): The API path (e.g., '/ai/generate-emr').
        payload (dict): JSON-serializable dictionary.
        
    Returns:
        dict | list | None: Parsed JSON response if 200 OK, else None.
    """
    try:
        url = f"{BASE_URL}{endpoint}"
        print(f"[AI_SERVICE] POST {url}")
        resp = requests.post(url, json=payload, timeout=90)
        print(f"[AI_SERVICE] Response {resp.status_code}")
        if resp.status_code == 200:
            result = resp.json()
            print(f"[AI_SERVICE] SUCCESS: Response from {endpoint}: {result}")
            return result
        elif resp.status_code == 404:
            print(f"[AI_SERVICE] 404: {url} — skipping.")
            return None
        else:
            print(f"[AI_SERVICE] Error ({resp.status_code}): {resp.text}")
            return None
    except Exception as e:
        print(f"[AI_SERVICE] Connection failed: {e}")
        return None


def generate_emr_draft(chief_complaint: str = "", document_insights=None, audio_url: str = None, transcript: str = None, patient_name: str = None, patient_gender: str = None) -> dict:
    """
    Requests the external AI to generate a structured EMR draft from session data.
    
    Why: Automates clinical documentation, saving significant time for doctors.
    Where: Called by the `run_ai_pipeline` background task in `sessions.py`.
    
    Args:
        chief_complaint (str): The patient's primary complaint.
        document_insights (list, optional): Summaries of shared medical documents.
        audio_url (str, optional): Link to the session recording.
        transcript (str, optional): Raw text transcript as fallback context.
        patient_name (str, optional): Full name of the patient.
        patient_gender (str, optional): Gender of the patient.
        
    Returns:
        dict: A structured EMR object with HPI, Assessment, Plan, etc.
    """
    # Prefer actual transcript text over audio URL — the AI needs readable text
    conversation = transcript or audio_url or ""
    print(f"[AI_SERVICE] generate_emr_draft: conversation length={len(conversation)}, using={'transcript' if transcript else 'audio_url' if audio_url else 'empty'}")
    
    payload = {
        "conversation": conversation,
        "chief_complaint": chief_complaint,
        "report_summaries": document_insights or [],
        "patient_name": patient_name,
        "patient_gender": patient_gender,
    }
    result = _call("/ai/generate-emr", payload)
    
    # Helper: try multiple keys (API may use different names than our DB schema)
    def pick(data, *keys, default=None):
        for k in keys:
            val = data.get(k)
            if val is not None:
                return val
        return default

    if result:
        print(f"[AI_SERVICE] Raw EMR keys returned: {list(result.keys())}")

        # Extract diagnoses from either 'diagnoses' list or 'icd10_codes' list
        diagnoses = pick(result, "diagnoses", default=[])
        icd_codes = pick(result, "icd10_codes", default=[])
        if not diagnoses and icd_codes:
            diagnoses = icd_codes

        # The external API returns 'plan' (list) but our DB expects 'treatment_plan' (text)
        plan_data = pick(result, "treatment_plan", "plan", default="Pending AI processing.")
        if isinstance(plan_data, list):
            plan_data = "\n".join(f"• {item}" for item in plan_data) if plan_data else "Pending AI processing."

        return {
            "chief_complaint": pick(result, "chief_complaint", default=chief_complaint or "Unknown"),
            "history_present_illness": pick(result, "history_present_illness", "history_of_present_illness", default="Pending AI processing."),
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


def map_icd_codes(diagnoses: list, audio_url: str = None, transcript: str = None) -> list:
    """
    Suggests ICD-10 medical codes for a list of clinical diagnoses.
    
    Why: Essential for standardized medical billing and record classification.
    Where: Called by the `run_ai_pipeline` background task.
    
    Args:
        diagnoses (list): String list of clinical diagnoses.
        audio_url (str, optional): Context from the recording for higher accuracy.
        transcript (str, optional): Raw text transcript fallback.
        
    Returns:
        list: List of mapping objects (text, code, description, confidence).
    """
    if not diagnoses:
        return []
    result = _call("/ai/map-icd", {"diagnoses": diagnoses, "conversation": audio_url or transcript})
    return result or []


def suggest_treatments(diagnoses: list, current_medications=None, audio_url: str = None, transcript: str = None) -> list:
    """
    Generates evidence-based treatment suggestions based on diagnoses.
    
    Why: Provides clinical decision support to improve patient outcomes and safety.
    Where: Called by the `run_ai_pipeline` background task.
    
    Args:
        diagnoses (list): List of patient diagnoses.
        current_medications (list, optional): Patient's existing meds to check for interactions.
        audio_url (str, optional): Clinical context from recording.
        transcript (str, optional): Raw text transcript fallback.
        
    Returns:
        list: Suggested treatments with priority and rationale.
    """
    if not diagnoses:
        return []
    result = _call("/ai/suggest-treatments", {
        "diagnoses": diagnoses,
        "conversation": audio_url or transcript,
        "current_medications": current_medications,
    })
    return result or []


def generate_patient_summary(emr_content: dict, diagnoses: list, treatments: list) -> dict:
    """
    Translates complex clinical notes into a patient-friendly summary.
    
    Why: Improves patient health literacy and adherence to the care plan.
    Where: Called by the `run_ai_pipeline` background task.
    
    Args:
        emr_content (dict): The full EMR draft.
        diagnoses (list): Final diagnoses.
        treatments (list): Suggested treatments.
        
    Returns:
        dict: Summary with key takeaways, warnings, and follow-up notes.
    """
    result = _call("/ai/generate-summary", {
        "emr_content": emr_content,
        "diagnoses": diagnoses,
        "treatments": treatments,
    })
    return result or {
        "summary_text": "Your session summary is being processed. Please check back later.",
        "key_takeaways": [],
        "medications_list": [],
        "follow_up_notes": "Consult your doctor for details.",
        "warnings": [],
    }


def generate_live_insight(transcript: str) -> str:
    """
    Analyzes live transcript text to provide real-time clinical hints.
    
    Why: Assists doctors DURING the session with potential red flags or missed questions.
    Where: Called by the WebSocket handler in `sessions.py` when requested.
    
    Args:
        transcript (str): Current window of the session conversation.
        
    Returns:
        str: A short, actionable clinical insight.
    """
    result = _call("/ai/live-insight", {"transcript": transcript})
    if result:
        return result.get("insight", "No insight generated.")
    return "Live insights are not available right now."


def analyze_lab_report(pdf_url: str, patient_id: str, patient_name: str, report_type: str) -> dict | None:
    """
    Performs OCR and clinical extraction on a uploaded lab report or document.
    
    Why: Converts raw images/PDFs into structured medical data for the doctor's review.
    Where: Called by the `upload_document` endpoint in `documents.py`.
    
    Args:
        pdf_url (str): Presigned S3 URL of the file.
        patient_id (str): UUID of the patient.
        patient_name (str): Full name for context.
        report_type (str): Hint for extraction logic.
        
    Returns:
        dict: Extracted key findings, risk flags, and summaries.
    """
    return _call("/ai/analyze-lab-report", {
        "pdf_url": pdf_url,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "report_type": report_type,
    })
