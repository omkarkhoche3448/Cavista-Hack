"""
AI Service — Google Gemini integration for:
  1. Pre-session document insights
  2. Post-session EMR generation
  3. ICD-10 code mapping
  4. Treatment suggestions
  5. Patient-friendly summary generation
"""

import json
import logging
from typing import Optional
from google import genai
from ..config import settings

logger = logging.getLogger(__name__)

_client = None
MODEL = "gemini-2.0-flash"


def _get_client():
    global _client
    if _client is None:
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError("GOOGLE_API_KEY is not set")
        _client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    return _client


def _call_gemini(prompt: str, system_prompt: str = "") -> str:
    """Call Gemini and return the text response."""
    try:
        client = _get_client()
        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": system_prompt}]})
            contents.append({"role": "model", "parts": [{"text": "Understood. I will follow these instructions."}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
        )
        return response.text
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        raise


def _parse_json_response(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse JSON response: {text[:200]}")
        return {"raw_text": text}


def analyze_document(document_text: str, document_type: str = "medical record") -> dict:
    """Analyze a medical document and extract key insights."""
    system_prompt = """You are an expert medical AI assistant. Analyze medical documents and extract structured clinical insights. Always respond with valid JSON."""

    prompt = f"""Analyze this {document_type} and extract key medical insights.
Return a JSON object with this exact structure:
{{
  "summary": "Brief 2-3 sentence summary of the document",
  "risk_flags": [
    {{"flag": "description of risk", "severity": "low|medium|high|critical", "source": "where in doc"}}
  ],
  "key_findings": [
    {{"finding": "name", "value": "result value", "normal_range": "expected range"}}
  ],
  "medications_found": [
    {{"name": "drug name", "dose": "dosage", "frequency": "how often"}}
  ],
  "allergies_found": [
    {{"allergen": "substance", "reaction": "type of reaction", "severity": "mild|moderate|severe"}}
  ]
}}

Document content:
{document_text}"""

    result = _call_gemini(prompt, system_prompt)
    return _parse_json_response(result)


def generate_emr_draft(
    transcript: str,
    patient_info: dict = None,
    document_insights: list = None,
    chief_complaint: str = ""
) -> dict:
    """Generate a structured EMR draft from session transcript and context."""
    system_prompt = """You are an expert medical AI scribe. Generate comprehensive, accurate EMR documentation from clinical conversations. Always respond with valid JSON."""

    context_parts = []
    if chief_complaint:
        context_parts.append(f"Chief Complaint: {chief_complaint}")
    if patient_info:
        context_parts.append(f"Patient Info: {json.dumps(patient_info)}")
    if document_insights:
        context_parts.append(f"Pre-session Document Insights: {json.dumps(document_insights)}")

    context = "\n".join(context_parts)

    prompt = f"""Based on the following clinical session transcript and context, generate a comprehensive EMR draft.

Context:
{context}

Session Transcript:
{transcript}

Return a JSON object with this exact structure:
{{
  "chief_complaint": "main reason for visit",
  "history_present_illness": "detailed HPI narrative",
  "past_medical_history": [{{"condition": "name", "onset": "when", "status": "active|resolved"}}],
  "medications": [{{"name": "drug", "dose": "amount", "frequency": "how often", "route": "oral/IV/etc"}}],
  "allergies": [{{"allergen": "substance", "reaction": "type", "severity": "mild|moderate|severe"}}],
  "vital_signs": {{"bp": "", "hr": "", "rr": "", "temp": "", "spo2": ""}},
  "review_of_systems": {{"general": "", "cardiovascular": "", "respiratory": "", "neurological": ""}},
  "physical_examination": {{"general": "", "specific_findings": ""}},
  "assessment": "clinical assessment and reasoning",
  "diagnoses": [{{"description": "diagnosis name", "icd_code": "suggested ICD-10 code", "type": "primary|secondary"}}],
  "treatment_plan": [{{"action": "what to do", "rationale": "why", "priority": "urgent|recommended|optional"}}],
  "medications_prescribed": [{{"drug": "name", "dose": "amount", "route": "oral/IV", "frequency": "how often", "duration": "how long"}}],
  "follow_up_plan": "follow up instructions",
  "patient_instructions": "instructions for the patient"
}}"""

    result = _call_gemini(prompt, system_prompt)
    return _parse_json_response(result)


def map_icd_codes(diagnoses: list, transcript_excerpt: str = "") -> list:
    """Map diagnoses to ICD-10-CM codes."""
    system_prompt = """You are a medical coding expert specializing in ICD-10-CM coding. Map clinical diagnoses to the most accurate ICD-10-CM codes. Always respond with valid JSON."""

    prompt = f"""Map the following diagnoses to ICD-10-CM codes. Be specific and accurate.

Diagnoses:
{json.dumps(diagnoses)}

{f'Clinical context: {transcript_excerpt}' if transcript_excerpt else ''}

Return a JSON array:
[
  {{
    "diagnosis_text": "original diagnosis text",
    "icd_code": "ICD-10-CM code",
    "icd_description": "official ICD-10-CM description",
    "confidence_score": 0.95,
    "is_primary": true,
    "reasoning": "why this code was chosen"
  }}
]"""

    result = _call_gemini(prompt, system_prompt)
    parsed = _parse_json_response(result)
    if isinstance(parsed, dict) and "raw_text" in parsed:
        return []
    return parsed if isinstance(parsed, list) else parsed.get("mappings", [])


def suggest_treatments(
    diagnoses: list,
    patient_context: str = "",
    current_medications: list = None
) -> list:
    """Generate evidence-based treatment suggestions."""
    system_prompt = """You are a clinical decision support AI. Suggest evidence-based treatments. Always respond with valid JSON."""

    prompt = f"""Based on the following diagnoses and patient context, suggest treatments.

Diagnoses: {json.dumps(diagnoses)}
Patient Context: {patient_context}
Current Medications: {json.dumps(current_medications or [])}

Return a JSON array:
[
  {{
    "suggestion_type": "medication|procedure|lifestyle|referral",
    "title": "treatment name",
    "description": "detailed description",
    "rationale": "evidence basis",
    "evidence_basis": "guideline or study reference",
    "priority": "urgent|recommended|optional",
    "contraindications": "any contraindications to consider"
  }}
]"""

    result = _call_gemini(prompt, system_prompt)
    parsed = _parse_json_response(result)
    if isinstance(parsed, dict) and "raw_text" in parsed:
        return []
    return parsed if isinstance(parsed, list) else parsed.get("suggestions", [])


def generate_patient_summary(
    emr_content: dict,
    diagnoses: list = None,
    treatments: list = None
) -> dict:
    """Generate a patient-friendly summary at 6th grade reading level."""
    system_prompt = """You are a patient communication expert. Create clear, compassionate health summaries that any patient can understand. Use simple language at a 6th-grade reading level. Avoid medical jargon. Always respond with valid JSON."""

    prompt = f"""Create a patient-friendly summary from this medical visit.

EMR Content: {json.dumps(emr_content)}
Diagnoses: {json.dumps(diagnoses or [])}
Treatments: {json.dumps(treatments or [])}

Return a JSON object:
{{
  "summary_text": "A warm, clear summary in 2-4 paragraphs. Use simple words. Explain what was found and what to do next.",
  "key_takeaways": [{{"point": "simple key point for the patient"}}],
  "medications_list": [{{"name": "drug name", "what_it_does": "simple explanation", "how_to_take": "clear instructions"}}],
  "follow_up_notes": "when and why to come back",
  "warnings": [{{"warning": "when to seek immediate care"}}],
  "reading_level": "6th grade"
}}"""

    result = _call_gemini(prompt, system_prompt)
    return _parse_json_response(result)


def generate_live_insight(transcript_so_far: str, document_insights: list = None) -> dict:
    """Generate real-time clinical insights during an active session."""
    system_prompt = """You are a real-time clinical AI assistant helping a doctor during a patient consultation. Provide brief, actionable insights. Always respond with valid JSON."""

    prompt = f"""Based on the ongoing conversation, provide brief clinical insights.

Transcript so far:
{transcript_so_far}

{f'Document insights available: {json.dumps(document_insights)}' if document_insights else ''}

Return a JSON object:
{{
  "key_observations": ["brief observation 1", "observation 2"],
  "suggested_questions": ["question the doctor might want to ask"],
  "potential_concerns": ["any red flags or concerns noted"],
  "differential_diagnoses": ["possible diagnoses to consider"]
}}"""

    result = _call_gemini(prompt, system_prompt)
    return _parse_json_response(result)
