import logging
import requests
import json
from ..config import settings

logger = logging.getLogger(__name__)

# The External API URL from your settings
BASE_URL = settings.ANALYSIS_API_URL

def _call_external_api(endpoint: str, payload: dict):
    """Generic wrapper for calling the external analysis service."""
    try:
        url = f"{BASE_URL}{endpoint}"
        logger.info(f"Calling external AI: {url}")
        
        resp = requests.post(url, json=payload, timeout=90)
        if resp.status_code == 200:
            return resp.json()
        else:
            logger.error(f"External AI Error ({resp.status_code}): {resp.text}")
            return None
    except Exception as e:
        logger.error(f"Failed to connect to external AI: {e}")
        return None

def generate_emr_draft(transcript: str, chief_complaint: str, document_insights=None):
    """Calls external API to generate a full EMR draft."""
    payload = {
        "transcript": transcript,
        "chief_complaint": chief_complaint,
        "document_insights": document_insights
    }
    result = _call_external_api("/ai/generate-emr", payload)
    return result or {}

def map_icd_codes(diagnoses: list, transcript: str = ""):
    """Calls external API for ICD-10 mapping."""
    payload = {
        "diagnoses": diagnoses,
        "transcript": transcript
    }
    result = _call_external_api("/ai/map-icd", payload)
    return result or []

def suggest_treatments(diagnoses: list, patient_context: str = "", current_medications=None):
    """Calls external API for treatment suggestions."""
    payload = {
        "diagnoses": diagnoses,
        "patient_context": patient_context,
        "current_medications": current_medications
    }
    result = _call_external_api("/ai/suggest-treatments", payload)
    return result or []

def generate_patient_summary(emr_content: dict, diagnoses: list, treatments: list):
    """Calls external API for patient-friendly summary."""
    payload = {
        "emr_content": emr_content,
        "diagnoses": diagnoses,
        "treatments": treatments
    }
    result = _call_external_api("/ai/generate-summary", payload)
    return result or {}
