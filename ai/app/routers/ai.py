from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types
import base64
import io
import requests
import json
from datetime import datetime
from PIL import Image as PILImage 
import fitz # PyMuPDF
import boto3
from urllib.parse import urlparse


from app.utils import search_icd_code
from ..schemas import (
    LabReportRequest,
    LabReportSummaryResponse,
    LabReportJSONResponse,
    EMRRequest,
    EMRResponse,
    MapICDRequest,
    SuggestTreatmentsRequest,
    GenerateSummaryRequest,
    LiveInsightRequest,
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

def download_pdf_content(url: str, settings: Settings) -> bytes:
    """
    Download PDF content from a URL.
    If the URL points to S3, use boto3 with credentials; otherwise use requests.
    """
    s3_info = parse_s3_url(url)
    if s3_info:
        bucket, key = s3_info
        s3_client = get_s3_client(settings)
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            return response["Body"].read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not download PDF from S3: {str(e)}")
    else:
        response = requests.get(url)
        if response.status_code == 200:
            return response.content
        raise HTTPException(status_code=400, detail="Could not download PDF from URL")

def download_image(url: str):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return PILImage.open(io.BytesIO(response.content))
        return None
    except Exception:
        return None




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
                "recommendations": {"type": "string"}
            },
            "required": ["summary", "key_findings", "abnormal_results", "recommendations"]
        }

        prompt = f"""
        You are a highly experienced medical consultant. Summarize the following lab report or medical document for a doctor.
        Provide a concise summary, list key findings, highlight any abnormal results, and suggest potential next steps or recommendations.
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

        return json.loads(response.text)

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
                "chief_complaint": {"type": "string"},
                "history_present_illness": {"type": "string"},
                "past_medical_history": {"type": "array", "items": {"type": "string"}},
                "medications": {"type": "array", "items": {"type": "string"}},
                "allergies": {"type": "array", "items": {"type": "string"}},
                "vital_signs": {"type": "object"},
                "review_of_systems": {"type": "array", "items": {"type": "string"}},
                "physical_examination": {"type": "string"},
                "assessment": {"type": "string"},
                "diagnoses": {"type": "array", "items": {"type": "string"}},
                "treatment_plan": {"type": "array", "items": {"type": "string"}},
                "medications_prescribed": {"type": "array", "items": {"type": "string"}},
                "follow_up_plan": {"type": "string"},
                "patient_instructions": {"type": "string"}
            },
            "required": [
                "chief_complaint",
                "history_present_illness",
                "assessment"
            ]
        }

        report_summaries_text = "\n".join([f"- {s}" for s in (req.report_summaries or [])])
        
        prompt = f"""
        You are an expert medical scribe. Generate a structured EMR JSON for a doctor to review.
        Keep it concise but clinically complete and medically accurate.

        Chief Complaint (if provided): {req.chief_complaint or ""}

        Conversation Transcript:
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
        emr_data["model_used"] = "gemini-2.0-flash-lite"
        return emr_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating EMR: {str(e)}")


@router.post("/map-icd")
def map_icd(req: MapICDRequest):
    """
    Lightweight ICD mapping using bundled diagnosis.csv lookup.
    Returns a list of mapping objects compatible with backend expectations.
    """
    mappings = []
    diagnoses = req.diagnoses or []
    for idx, d in enumerate(diagnoses):
        if isinstance(d, dict):
            text = d.get("diagnosis_text") or d.get("description") or d.get("diagnosis") or ""
        else:
            text = str(d or "")
        text = text.strip()
        if not text:
            continue
        match = search_icd_code(text, max_results=1)
        if match:
            m = match[0]
            mappings.append({
                "diagnosis_text": text,
                "icd_code": m.get("code"),
                "icd_description": m.get("short_description") or m.get("long_description"),
                "confidence_score": 0.65,
                "is_primary": idx == 0,
            })
        else:
            mappings.append({
                "diagnosis_text": text,
                "icd_code": None,
                "icd_description": None,
                "confidence_score": 0.0,
                "is_primary": idx == 0,
            })
    return mappings


@router.post("/suggest-treatments")
def suggest_treatments(
    req: SuggestTreatmentsRequest,
    settings: Settings = Depends(get_settings),
):
    """
    Treatment suggestions via Gemini. Returns a JSON array of suggestions.
    """
    if not settings.GOOGLE_API_KEY:
        return []

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    schema = {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "suggestion_type": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "rationale": {"type": "string"},
                "evidence_basis": {"type": "string"},
                "priority": {"type": "string"},
                "contraindications": {"type": "string"},
            },
            "required": ["title"],
        },
    }

    prompt = f"""
    You are a careful clinical decision support assistant. Suggest evidence-based treatments for the diagnoses.
    Return 3-8 items. Avoid unsafe advice, include contraindications when relevant, and be concise.

    Diagnoses: {json.dumps(req.diagnoses or [])}
    Current medications: {json.dumps(req.current_medications or [])}
    Transcript (optional context): {req.conversation or ""}
    """

    config = types.GenerateContentConfig(
        temperature=0.2,
        response_mime_type="application/json",
        response_schema=schema,
    )
    response = client.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents=[prompt],
        config=config,
    )
    if not response or not response.text:
        return []
    return json.loads(response.text)


@router.post("/generate-summary")
def generate_summary(
    req: GenerateSummaryRequest,
    settings: Settings = Depends(get_settings),
):
    """Generate a patient-friendly visit summary."""
    if not settings.GOOGLE_API_KEY:
        return {
            "summary_text": "Your session summary is being processed. Please check back later.",
            "key_takeaways": [],
            "medications_list": [],
            "follow_up_notes": "",
            "warnings": [],
        }

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    schema = {
        "type": "object",
        "properties": {
            "summary_text": {"type": "string"},
            "key_takeaways": {"type": "array", "items": {"type": "string"}},
            "medications_list": {"type": "array", "items": {"type": "string"}},
            "follow_up_notes": {"type": "string"},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary_text"],
    }

    prompt = f"""
    You are a patient education assistant. Write a clear, plain-language visit summary.
    Use short sentences and bullet-like items where helpful. Do not include PHI beyond what's provided.

    EMR content: {json.dumps(req.emr_content or {})}
    Diagnoses: {json.dumps(req.diagnoses or [])}
    Treatments: {json.dumps(req.treatments or [])}
    """

    config = types.GenerateContentConfig(
        temperature=0.2,
        response_mime_type="application/json",
        response_schema=schema,
    )
    response = client.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents=[prompt],
        config=config,
    )
    if not response or not response.text:
        return {"summary_text": "Summary unavailable.", "key_takeaways": [], "medications_list": [], "follow_up_notes": "", "warnings": []}
    return json.loads(response.text)


@router.post("/live-insight")
def live_insight(
    req: LiveInsightRequest,
    settings: Settings = Depends(get_settings),
):
    """Return a short real-time clinical insight string."""
    if not settings.GOOGLE_API_KEY:
        return {"insight": "Live insights are not available right now."}

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    schema = {
        "type": "object",
        "properties": {"insight": {"type": "string"}},
        "required": ["insight"],
    }
    prompt = f"""
    You are a clinical assistant. Given the transcript, output ONE short insight:
    - possible red flags
    - missing key questions
    - medication/allergy safety checks
    Keep it under 3 sentences.

    Transcript:
    {req.transcript}
    """
    config = types.GenerateContentConfig(
        temperature=0.2,
        response_mime_type="application/json",
        response_schema=schema,
    )
    response = client.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents=[prompt],
        config=config,
    )
    if not response or not response.text:
        return {"insight": "No insight generated."}
    return json.loads(response.text)


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
