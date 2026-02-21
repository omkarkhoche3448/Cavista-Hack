import requests
from PIL import Image
from io import BytesIO
from passlib.context import CryptContext
import whisper
import os
import tempfile
import csv
from pathlib import Path

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def download_image(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        return Image.open(BytesIO(response.content))
    except Exception:
        return None


def get_password_hash(password):
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def search_icd_code(diagnosis: str, max_results: int = 5) -> list[dict]:
    """
    Search diagnosis.csv for ICD codes matching the given diagnosis string.
    Returns a list of dicts with 'code', 'short_description', and 'long_description'.
    """
    csv_path = Path(__file__).resolve().parent.parent / "diagnosis.csv"
    if not csv_path.exists():
        return []

    diagnosis_lower = diagnosis.lower().strip()
    results = []

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            short = row.get("ShortDescription", "").lower()
            long = row.get("LongDescription", "").lower()
            # Check if the search term appears in either description
            if diagnosis_lower in short or diagnosis_lower in long:
                results.append({
                    "code": row.get("CodeWithSeparator", ""),
                    "short_description": row.get("ShortDescription", ""),
                    "long_description": row.get("LongDescription", ""),
                })
                if len(results) >= max_results:
                    break

    return results



