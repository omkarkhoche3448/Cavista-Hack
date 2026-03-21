"""
AI Service — all calls to the external Analysis AI API go through here.
"""

import logging
import requests
from ..config import settings

logger = logging.getLogger(__name__)
BASE_URL = settings.ANALYSIS_API_URL
_session = requests.Session()


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
    if not BASE_URL:
        logger.warning("ANALYSIS_API_URL is not set; skipping AI call to %s", endpoint)
        return None
    try:
        url = f"{BASE_URL}{endpoint}"
        logger.info("[AI_SERVICE] POST %s", url)
        resp = _session.post(url, json=payload, timeout=90)
        logger.info("[AI_SERVICE] Response %s", resp.status_code)
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 404:
            logger.warning("[AI_SERVICE] 404: %s — skipping", url)
            return None
        else:
            logger.warning("[AI_SERVICE] Error (%s): %s", resp.status_code, resp.text[:500])
            return None
    except Exception as e:
        logger.warning("[AI_SERVICE] Connection failed: %s", e)
        return None


def generate_emr_draft(*, transcript: str = "", chief_complaint: str = "", document_insights=None, audio_url: str | None = None) -> dict:
    """
    Requests the external AI to generate a structured EMR draft from session data.
    
    Why: Automates clinical documentation, saving significant time for doctors.
    Where: Called by the `run_ai_pipeline` background task in `sessions.py`.
    
    Args:
        chief_complaint (str): The patient's primary complaint.
        document_insights (list, optional): Summaries of shared medical documents.
        audio_url (str, optional): Link to the session recording.
        
    Returns:
        dict: A structured EMR object with HPI, Assessment, Plan, etc.
    """
    payload = {
        "conversation": transcript or (audio_url or ""),
        "chief_complaint": chief_complaint,
        "report_summaries": document_insights or [],
    }
    result = _call("/ai/generate-emr", payload)
    return result or {
        "chief_complaint": chief_complaint,
        "history_present_illness": "Pending AI processing.",
        "assessment": "Pending AI processing.",
        "diagnoses": [],
        "treatment_plan": "Pending AI processing.",
    }


def map_icd_codes(diagnoses: list, *, transcript: str = "", audio_url: str | None = None) -> list:
    """
    Suggests ICD-10 medical codes for a list of clinical diagnoses.
    
    Why: Essential for standardized medical billing and record classification.
    Where: Called by the `run_ai_pipeline` background task.
    
    Args:
        diagnoses (list): String list of clinical diagnoses.
        audio_url (str, optional): Context from the recording for higher accuracy.
        
    Returns:
        list: List of mapping objects (text, code, description, confidence).
    """
    if not diagnoses:
        return []
    result = _call("/ai/map-icd", {"diagnoses": diagnoses, "conversation": transcript or (audio_url or "")})
    return result or []


def suggest_treatments(diagnoses: list, *, current_medications=None, transcript: str = "", audio_url: str | None = None) -> list:
    """
    Generates evidence-based treatment suggestions based on diagnoses.
    
    Why: Provides clinical decision support to improve patient outcomes and safety.
    Where: Called by the `run_ai_pipeline` background task.
    
    Args:
        diagnoses (list): List of patient diagnoses.
        current_medications (list, optional): Patient's existing meds to check for interactions.
        audio_url (str, optional): Clinical context from recording.
        
    Returns:
        list: Suggested treatments with priority and rationale.
    """
    if not diagnoses:
        return []
    result = _call("/ai/suggest-treatments", {
        "diagnoses": diagnoses,
        "conversation": transcript or (audio_url or ""),
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
