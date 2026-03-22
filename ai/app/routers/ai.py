from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types
import base64
import io
import requests
import json
from datetime import datetime
import ipaddress
import socket
from typing import Any
from PIL import Image as PILImage 
import fitz # PyMuPDF
import boto3
from urllib.parse import urlparse

from app.utils import search_icd_code
from ..schemas import (
    ICDMapItem,
    ICDMapRequest,
    EMRRequest,
    EMRResponse,
    LabReportJSONResponse,
    LabReportRequest,
    LabReportSummaryResponse,
    LiveInsightRequest,
    LiveInsightResponse,
    PatientSummaryRequest,
    PatientSummaryResponse,
    SuggestTreatmentsRequest,
    TreatmentSuggestionItem,
)

from ..config import Settings
from functools import lru_cache

router = APIRouter(
    prefix="/ai",
    tags=["ai"],
)

@lru_cache
def get_settings():
    return Settings()

def get_s3_client(settings: Settings):
    """Create and return an authenticated boto3 S3 client."""
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )

def parse_s3_url(url: str):
    """
    Parse an S3 URL and return (bucket, key).
    Supports:
      - s3://bucket/key
      - https://bucket.s3.amazonaws.com/key
      - https://bucket.s3.region.amazonaws.com/key
      - https://s3.amazonaws.com/bucket/key
      - https://s3.region.amazonaws.com/bucket/key
    Returns None if not an S3 URL.
    """
    parsed = urlparse(url)

    # s3:// scheme
    if parsed.scheme == "s3":
        return parsed.netloc, parsed.path.lstrip("/")

    # HTTPS virtual-hosted style: bucket.s3[.region].amazonaws.com/key
    if parsed.hostname and ".s3" in parsed.hostname and "amazonaws.com" in parsed.hostname:
        bucket = parsed.hostname.split(".s3")[0]
        key = parsed.path.lstrip("/")
        return bucket, key

    # HTTPS path style: s3[.region].amazonaws.com/bucket/key
    if parsed.hostname and parsed.hostname.startswith("s3") and "amazonaws.com" in parsed.hostname:
        parts = parsed.path.lstrip("/").split("/", 1)
        if len(parts) == 2:
            return parts[0], parts[1]

    return None


def _is_safe_public_http_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = parsed.hostname
    if not host or host.lower() == "localhost":
        return False

    def _is_public_ip(ip_text: str) -> bool:
        ip = ipaddress.ip_address(ip_text)
        return not (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        )

    try:
        return _is_public_ip(host)
    except ValueError:
        try:
            for info in socket.getaddrinfo(host, None):
                if not _is_public_ip(info[4][0]):
                    return False
            return True
        except socket.gaierror:
            return False


def download_pdf_content(url: str, settings: Settings) -> bytes:
    """
    Download PDF content from a URL.
    If the URL points to S3, use boto3 with credentials; otherwise use requests.
    """
    s3_info = parse_s3_url(url)
    if s3_info:
        bucket, key = s3_info
        if settings.AWS_BUCKET_NAME and bucket != settings.AWS_BUCKET_NAME:
            raise HTTPException(status_code=400, detail="S3 bucket is not allowed.")
        s3_client = get_s3_client(settings)
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            return response["Body"].read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not download PDF from S3: {str(e)}")
    else:
        if not _is_safe_public_http_url(url):
            raise HTTPException(status_code=400, detail="URL is not allowed.")
        response = requests.get(url, timeout=60)
        if response.status_code == 200:
            return response.content
        raise HTTPException(status_code=400, detail="Could not download PDF from URL")

def download_image(url: str):
    try:
        if not _is_safe_public_http_url(url):
            return None
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            return PILImage.open(io.BytesIO(response.content))
        return None
    except Exception:
        return None


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _extract_diagnosis_text(item: Any) -> str:
    if isinstance(item, dict):
        for key in ("diagnosis_text", "diagnosis", "title", "name", "assessment", "description"):
            text = _as_text(item.get(key))
            if text:
                return text
    return _as_text(item)


def _best_icd_match(diagnosis_text: str) -> dict | None:
    query = diagnosis_text.strip()
    if not query:
        return None
    primary = search_icd_code(query, max_results=1)
    if primary:
        return primary[0]

    lowered = query.lower()
    for splitter in (",", ";", " with ", " and "):
        if splitter in lowered:
            first_part = query[: lowered.find(splitter)].strip()
            if not first_part:
                continue
            fallback = search_icd_code(first_part, max_results=1)
            if fallback:
                return fallback[0]
    return None


def _normalize_str_list(items: Any) -> list[str]:
    if not isinstance(items, list):
        return []
    values: list[str] = []
    for entry in items:
        text = _as_text(entry)
        if text:
            values.append(text)
    return values


def _coerce_string_list(items: Any) -> list[str]:
    if isinstance(items, list):
        return _normalize_str_list(items)
    if isinstance(items, str):
        text = items.strip()
        return [text] if text else []
    return []




@router.post("/analyze-lab-report", response_model=LabReportSummaryResponse)
def analyze_lab_report(
    req: LabReportRequest,
    settings: Settings = Depends(get_settings)
):
    if not fitz:
         raise HTTPException(status_code=500, detail="PyMuPDF (fitz) is not installed.")
    try:
        pdf_content = None
        
        if req.pdf_url:
            pdf_content = download_pdf_content(req.pdf_url, settings)
        else:
            raise HTTPException(status_code=400, detail="Must provide either pdf_url or pdf_base64")

        # Extract text from PDF
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()

        if not text.strip():
             raise HTTPException(status_code=400, detail="Could not extract text from PDF. It might be an image-only PDF.")

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        
        schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "key_findings": {"type": "array", "items": {"type": "string"}},
                "abnormal_results": {"type": "array", "items": {"type": "string"}},
                "recommendations": {"type": "array", "items": {"type": "string"}},
                "risk_flags": {"type": "array", "items": {"type": "string"}},
                "medications_found": {"type": "array", "items": {"type": "string"}},
                "allergies_found": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["summary", "key_findings", "abnormal_results", "recommendations"]
        }

        prompt = f"""
        You are a highly experienced medical consultant. Summarize the following lab report or medical document for a doctor.
        Provide a concise summary, list key findings, highlight abnormal results, and actionable recommendations.
        Return strict JSON with keys:
        - summary: string
        - key_findings: string[]
        - abnormal_results: string[]
        - recommendations: string[]
        - risk_flags: string[]
        - medications_found: string[]
        - allergies_found: string[]
        Lab Report Type: {req.report_type if req.report_type else "General"}

        Lab Report Content:
        {text}
        """

        config = types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=schema
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash-lite", # Upgraded to 2.0
            contents=[prompt],
            config=config
        )

        if not response or not response.text:
            raise ValueError("Empty response from GenAI")

        parsed = json.loads(response.text)
        key_findings = _coerce_string_list(parsed.get("key_findings"))
        abnormal_results = _coerce_string_list(parsed.get("abnormal_results"))
        recommendations = _coerce_string_list(parsed.get("recommendations"))
        risk_flags = _coerce_string_list(parsed.get("risk_flags"))
        medications_found = _coerce_string_list(parsed.get("medications_found"))
        allergies_found = _coerce_string_list(parsed.get("allergies_found"))

        if not risk_flags:
            risk_flags = abnormal_results[:]
        if not recommendations and isinstance(parsed.get("recommendations"), str):
            recommendations = [parsed["recommendations"]]

        return {
            "summary": _as_text(parsed.get("summary")) or "No summary generated.",
            "key_findings": key_findings,
            "abnormal_results": abnormal_results,
            "recommendations": recommendations,
            "risk_flags": risk_flags,
            "medications_found": medications_found,
            "allergies_found": allergies_found,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing lab report: {str(e)}")

@router.post("/lab-report-to-json", response_model=LabReportJSONResponse)
def lab_report_to_json(
    req: LabReportRequest,
    settings: Settings = Depends(get_settings)
):
    if not fitz:
         raise HTTPException(status_code=500, detail="PyMuPDF (fitz) is not installed.")
    try:
        pdf_content = None
        if req.pdf_base64:
            pdf_content = base64.b64decode(req.pdf_base64)
        elif req.pdf_url:
            pdf_content = download_pdf_content(req.pdf_url, settings)
        else:
            raise HTTPException(status_code=400, detail="Must provide either pdf_url or pdf_base64")

        # Extract text from PDF
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()

        if not text.strip():
             raise HTTPException(status_code=400, detail="Could not extract text from PDF. It might be an image-only PDF.")

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        
        schema = {
            "type": "object",
            "properties": {
                "report": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["report"]
        }

        prompt = f"""
        You are a data extraction tool. Extract all information from the following lab report or medical document into a structured list of strings. Each string should represent a single data point or section of the report. Do NOT provide any analysis, summary, or commentary. Simply extract the content.

        Lab Report Content:
        {text}
        """

        config = types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=schema
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=[prompt],
            config=config
        )

        if not response or not response.text:
            raise ValueError("Empty response from GenAI")

        return json.loads(response.text)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting lab report data: {str(e)}")

@router.post("/generate-emr", response_model=EMRResponse)
def generate_emr(
    req: EMRRequest,
    settings: Settings = Depends(get_settings)
):
    try:
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)

        schema = {
            "type": "object",
            "properties": {
                "patient_name": {"type": "string"},
                "age": {"type": "integer"},
                "gender": {"type": "string"},
                "chief_complaint": {"type": "string"},
                "history_of_present_illness": {"type": "string"},
                "past_medical_history": {"type": "array", "items": {"type": "string"}},
                "medications": {"type": "array", "items": {"type": "string"}},
                "allergies": {"type": "array", "items": {"type": "string"}},
                "physical_examination": {"type": "string"},
                "assessment": {"type": "string"},
                "plan": {"type": "array", "items": {"type": "string"}},
                "follow_up": {"type": "string"}
            },
            "required": [
                "chief_complaint",
                "history_of_present_illness",
                "assessment"
            ]
        }

        report_summaries_text = "\n".join([f"- {s}" for s in req.report_summaries])
        
        prompt = f"""
        You are an expert medical scribe and consultant. Based on the following transcribed conversation between a doctor and a patient, and the provided lab report summaries, generate a comprehensive and structured Electronic Medical Record (EMR).
        Ensure medical accuracy and a professional tone.

        Conversation:
        {req.conversation}

        Lab Report Summaries:
        {report_summaries_text}
        """

        config = types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=schema
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=[prompt],
            config=config
        )

        if not response or not response.text:
            raise ValueError("Empty response from GenAI")

        emr_data = json.loads(response.text)
        icd10_results = search_icd_code(emr_data.get("assessment", ""))
        emr_data["icd10_codes"] = [f"{r['code']} - {r['short_description']}" for r in icd10_results]
        return emr_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating EMR: {str(e)}")


@router.post("/map-icd", response_model=list[ICDMapItem])
def map_icd_codes(req: ICDMapRequest):
    try:
        items: list[dict] = []
        for index, diagnosis in enumerate(req.diagnoses or []):
            diagnosis_text = _extract_diagnosis_text(diagnosis)
            if not diagnosis_text:
                continue
            matched = _best_icd_match(diagnosis_text)
            if matched:
                items.append(
                    {
                        "diagnosis_text": diagnosis_text,
                        "icd_code": matched.get("code"),
                        "icd_description": matched.get("short_description"),
                        "confidence_score": 0.88,
                        "is_primary": index == 0,
                    }
                )
            else:
                items.append(
                    {
                        "diagnosis_text": diagnosis_text,
                        "icd_code": None,
                        "icd_description": None,
                        "confidence_score": 0.35,
                        "is_primary": index == 0,
                    }
                )
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error mapping ICD codes: {str(e)}")


@router.post("/suggest-treatments", response_model=list[TreatmentSuggestionItem])
def suggest_treatments(req: SuggestTreatmentsRequest):
    try:
        diagnoses = [_extract_diagnosis_text(item) for item in req.diagnoses or []]
        diagnoses = [item for item in diagnoses if item]
        if not diagnoses:
            return []

        current_medications = _normalize_str_list(req.current_medications)
        medication_context = ", ".join(current_medications) if current_medications else "none reported"

        suggestions: list[dict] = []
        for diagnosis in diagnoses[:5]:
            suggestions.append(
                {
                    "suggestion_type": "medication_review",
                    "title": f"Medication plan review for {diagnosis}",
                    "description": (
                        f"Evaluate first-line therapy options and adjust dosing for {diagnosis}. "
                        "Confirm renal/hepatic dosing where applicable."
                    ),
                    "rationale": "Consistent medication review reduces preventable adverse events.",
                    "priority": "high",
                    "contraindications": f"Check interactions with current medications: {medication_context}.",
                    "evidence_basis": "Guideline-aligned disease-specific management.",
                }
            )
            suggestions.append(
                {
                    "suggestion_type": "monitoring",
                    "title": f"Monitoring and follow-up for {diagnosis}",
                    "description": "Order relevant baseline and follow-up tests and set a 1-2 week reassessment.",
                    "rationale": "Monitoring trends improves treatment safety and efficacy.",
                    "priority": "medium",
                    "contraindications": "Escalate care for red-flag symptoms or rapid deterioration.",
                    "evidence_basis": "Standard chronic and acute care monitoring protocols.",
                }
            )

        # Keep payload size bounded for faster downstream processing.
        return suggestions[:10]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error suggesting treatments: {str(e)}")


@router.post("/generate-summary", response_model=PatientSummaryResponse)
def generate_patient_summary(req: PatientSummaryRequest):
    try:
        emr_content = req.emr_content or {}
        chief_complaint = _as_text(emr_content.get("chief_complaint")) or "your current symptoms"
        assessment = _as_text(emr_content.get("assessment")) or "the clinical evaluation"

        diagnoses = [_extract_diagnosis_text(item) for item in (req.diagnoses or emr_content.get("diagnoses") or [])]
        diagnoses = [item for item in diagnoses if item]
        key_takeaways = diagnoses[:3] if diagnoses else ["Continue close follow-up with your doctor."]

        medications = _normalize_str_list(emr_content.get("medications")) + _normalize_str_list(
            emr_content.get("medications_prescribed")
        )
        seen = set()
        medications_list: list[str] = []
        for med in medications:
            if med not in seen:
                medications_list.append(med)
                seen.add(med)

        treatment_titles: list[str] = []
        if isinstance(req.treatments, list):
            for item in req.treatments:
                if isinstance(item, dict):
                    title = _as_text(item.get("title"))
                else:
                    title = _as_text(item)
                if title:
                    treatment_titles.append(title)

        follow_up = _as_text(emr_content.get("follow_up_plan")) or _as_text(emr_content.get("follow_up"))
        if not follow_up:
            follow_up = "Please follow your prescribed plan and revisit if symptoms worsen."

        warnings: list[str] = []
        allergies = _normalize_str_list(emr_content.get("allergies"))
        if allergies:
            warnings.append("Inform all care providers about your recorded allergies.")

        risk_text = f"{chief_complaint} {assessment}".lower()
        if any(flag in risk_text for flag in ("chest pain", "shortness of breath", "bleeding", "fainting")):
            warnings.append("Seek urgent care immediately if red-flag symptoms recur or intensify.")

        summary_parts = [
            f"Today we reviewed {chief_complaint}.",
            f"Clinical assessment focused on {assessment}.",
        ]
        if treatment_titles:
            summary_parts.append(f"Recommended care includes: {', '.join(treatment_titles[:3])}.")

        return {
            "summary_text": " ".join(summary_parts),
            "key_takeaways": key_takeaways,
            "medications_list": medications_list,
            "follow_up_notes": follow_up,
            "warnings": warnings,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating patient summary: {str(e)}")


@router.post("/live-insight", response_model=LiveInsightResponse)
def generate_live_insight(req: LiveInsightRequest):
    try:
        transcript = req.transcript.strip()
        lowered = transcript.lower()

        if any(flag in lowered for flag in ("chest pain", "shortness of breath", "faint", "seizure")):
            return {"insight": "Potential red-flag symptoms detected; consider urgent triage and focused vitals now."}

        if "allergy" in lowered or "rash" in lowered:
            return {"insight": "Possible allergy-related discussion detected; verify triggers and medication history."}

        if "medication" in lowered or "dose" in lowered:
            return {"insight": "Medication management topic detected; confirm adherence, dosing, and side effects."}

        return {"insight": "Conversation is clinically coherent; continue history and targeted symptom clarification."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating live insight: {str(e)}")


def generate_emr_pdf(emr_data: dict) -> bytes:
    """Generate a well-structured PDF from EMR JSON data using PyMuPDF."""
    doc = fitz.open()
    
    # Page dimensions
    page_width, page_height = fitz.paper_size("A4")
    margin_left = 50
    margin_right = page_width - 50
    content_width = margin_right - margin_left
    
    # Colors
    primary_color = (0.13, 0.35, 0.55)       # Dark blue
    accent_color = (0.20, 0.50, 0.72)         # Medium blue
    text_color = (0.15, 0.15, 0.15)           # Near black
    light_gray = (0.92, 0.92, 0.92)           # Light gray for backgrounds
    divider_color = (0.75, 0.75, 0.75)        # Gray for dividers
    
    # Font sizes
    title_size = 20
    section_header_size = 12
    body_size = 10
    small_size = 8
    
    page = doc.new_page(width=page_width, height=page_height)
    y = 40

    def new_page_if_needed(current_y, needed_space=60):
        nonlocal page
        if current_y + needed_space > page_height - 50:
            page = doc.new_page(width=page_width, height=page_height)
            return 40
        return current_y

    def draw_text(x, current_y, text, fontsize=body_size, color=text_color, fontname="helv", max_width=None):
        if max_width is None:
            max_width = margin_right - x
        # Word-wrap text manually
        words = str(text).split()
        lines = []
        current_line = ""
        for word in words:
            test = f"{current_line} {word}".strip()
            tw = fitz.get_text_length(test, fontname=fontname, fontsize=fontsize)
            if tw > max_width and current_line:
                lines.append(current_line)
                current_line = word
            else:
                current_line = test
        if current_line:
            lines.append(current_line)
        
        nonlocal page
        for line in lines:
            current_y = new_page_if_needed(current_y, fontsize + 6)
            page.insert_text((x, current_y), line, fontsize=fontsize, color=color, fontname=fontname)
            current_y += fontsize + 4
        return current_y

    def draw_divider(current_y):
        current_y = new_page_if_needed(current_y, 10)
        page.draw_line((margin_left, current_y), (margin_right, current_y), color=divider_color, width=0.5)
        return current_y + 8

    def draw_section(current_y, title, content):
        current_y = new_page_if_needed(current_y, 50)
        # Section header with accent bar
        page.draw_rect(fitz.Rect(margin_left, current_y - 2, margin_left + 4, current_y + section_header_size + 2), color=accent_color, fill=accent_color)
        current_y = draw_text(margin_left + 12, current_y + section_header_size, title, fontsize=section_header_size, color=primary_color, fontname="hebo")
        current_y += 2
        
        if isinstance(content, list):
            for item in content:
                current_y = new_page_if_needed(current_y, 20)
                current_y = draw_text(margin_left + 20, current_y, f"•  {item}", fontsize=body_size, color=text_color)
                current_y += 2
        elif content:
            current_y = draw_text(margin_left + 12, current_y, str(content), fontsize=body_size, color=text_color)
        
        current_y += 6
        current_y = draw_divider(current_y)
        return current_y

    # ── Header Banner ──
    page.draw_rect(fitz.Rect(0, 0, page_width, 70), color=primary_color, fill=primary_color)
    page.insert_text((margin_left, 35), "Electronic Medical Record", fontsize=title_size, color=(1, 1, 1), fontname="hebo")
    page.insert_text((margin_left, 55), f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", fontsize=small_size, color=(0.8, 0.88, 0.95), fontname="helv")
    y = 90

    # ── Patient Info Bar ──
    patient_name = emr_data.get("patient_name", "N/A")
    age = emr_data.get("age", "N/A")
    gender = emr_data.get("gender", "N/A")

    page.draw_rect(fitz.Rect(margin_left, y, margin_right, y + 35), color=light_gray, fill=light_gray)
    page.insert_text((margin_left + 10, y + 15), "Patient:", fontsize=body_size, color=accent_color, fontname="hebo")
    page.insert_text((margin_left + 60, y + 15), str(patient_name), fontsize=body_size, color=text_color, fontname="helv")
    page.insert_text((margin_left + 250, y + 15), "Age:", fontsize=body_size, color=accent_color, fontname="hebo")
    page.insert_text((margin_left + 280, y + 15), str(age), fontsize=body_size, color=text_color, fontname="helv")
    page.insert_text((margin_left + 350, y + 15), "Gender:", fontsize=body_size, color=accent_color, fontname="hebo")
    page.insert_text((margin_left + 395, y + 15), str(gender), fontsize=body_size, color=text_color, fontname="helv")
    y += 50

    # ── Sections ──
    sections = [
        ("Chief Complaint", emr_data.get("chief_complaint")),
        ("History of Present Illness", emr_data.get("history_of_present_illness")),
        ("Past Medical History", emr_data.get("past_medical_history", [])),
        ("Medications", emr_data.get("medications", [])),
        ("Allergies", emr_data.get("allergies", [])),
        ("Physical Examination", emr_data.get("physical_examination")),
        ("Assessment", emr_data.get("assessment")),
        ("Plan", emr_data.get("plan", [])),
        ("Follow Up", emr_data.get("follow_up")),
        ("ICD-10 Codes", emr_data.get("icd10_codes", []))
    ]

    for title, content in sections:
        if content:  # Only render non-empty sections
            y = draw_section(y, title, content)

    # ── Footer on every page ──
    for page_num in range(len(doc)):
        p = doc[page_num]
        footer_text = f"Page {page_num + 1} of {len(doc)}  |  Confidential Medical Document"
        tw = fitz.get_text_length(footer_text, fontname="helv", fontsize=small_size)
        p.insert_text(((page_width - tw) / 2, page_height - 20), footer_text, fontsize=small_size, color=divider_color, fontname="helv")
        p.draw_line((margin_left, page_height - 35), (margin_right, page_height - 35), color=divider_color, width=0.5)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@router.post("/generate-emr-pdf")
def generate_emr_pdf_endpoint(
    req: EMRRequest,
    settings: Settings = Depends(get_settings)
):
    """Generate an EMR and return it as a downloadable PDF."""
    try:
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)

        schema = {
            "type": "object",
            "properties": {
                "patient_name": {"type": "string"},
                "age": {"type": "integer"},
                "gender": {"type": "string"},
                "chief_complaint": {"type": "string"},
                "history_of_present_illness": {"type": "string"},
                "past_medical_history": {"type": "array", "items": {"type": "string"}},
                "medications": {"type": "array", "items": {"type": "string"}},
                "allergies": {"type": "array", "items": {"type": "string"}},
                "physical_examination": {"type": "string"},
                "assessment": {"type": "string"},
                "plan": {"type": "array", "items": {"type": "string"}},
                "follow_up": {"type": "string"}
            },
            "required": [
                "chief_complaint",
                "history_of_present_illness",
                "assessment"
            ]
        }

        report_summaries_text = "\n".join([f"- {s}" for s in req.report_summaries])
        
        prompt = f"""
        You are an expert medical scribe and consultant. Based on the following transcribed conversation between a doctor and a patient, and the provided lab report summaries, generate a comprehensive and structured Electronic Medical Record (EMR).
        Ensure medical accuracy and a professional tone.
        Assessment should be in proper and accurate medical terms and should not contain any extra words like possible, potential, suspected etc.

        Conversation:
        {req.conversation}

        Lab Report Summaries:
        {report_summaries_text}
        """

        config = types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=schema
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=[prompt],
            config=config
        )

        if not response or not response.text:
            raise ValueError("Empty response from GenAI")

        emr_data = json.loads(response.text)
        icd10_results = search_icd_code(emr_data.get("assessment", ""))
        emr_data["icd10_codes"] = [f"{r['code']} - {r['short_description']}" for r in icd10_results]
        print(emr_data["icd10_codes"])
        
        pdf_bytes = generate_emr_pdf(emr_data)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=EMR_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating EMR PDF: {str(e)}")
