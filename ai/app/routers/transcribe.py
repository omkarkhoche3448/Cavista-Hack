from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from functools import lru_cache
import os
import tempfile
import subprocess
import traceback

import requests

from ..config import Settings
from ..db import settings as service_settings
from ..s3_utils import get_s3_client, parse_s3_url

router = APIRouter(
    prefix="/transcribe",
    tags=["transcribe"],
)

MODEL_ID = "facebook/wav2vec2-base-960h"


@lru_cache
def get_settings():
    return Settings()

class TranscribeRequest(BaseModel):
    audio_url: str
    # backend may send extra fields (s3_bucket/s3_key/etc); ignore them
    model_config = {"extra": "ignore"}


def _download_audio_bytes(audio_url: str, app_settings: Settings) -> bytes:
    s3_info = parse_s3_url(audio_url)
    if s3_info:
        bucket, key = s3_info
        s3_client = get_s3_client(app_settings)
        try:
            s3_response = s3_client.get_object(Bucket=bucket, Key=key)
            return s3_response["Body"].read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not download audio from S3: {str(e)}")

    try:
        response = requests.get(audio_url, timeout=30)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not download audio from URL: {type(e).__name__}: {str(e)}")
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Could not download audio from URL (status={response.status_code})")
    return response.content


def _convert_to_wav(input_path: str, input_suffix: str) -> str:
    if input_suffix.lower() == ".wav":
        return input_path

    wav_path = input_path.rsplit(".", 1)[0] + ".wav"
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", wav_path],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail="ffmpeg is required for audio conversion but was not found.") from e

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"ffmpeg conversion failed: {result.stderr}")
    return wav_path


@lru_cache(maxsize=1)
def _get_asr_components():
    """
    Lazy-load ASR model components to avoid import-time downloads/crashes.
    """
    try:
        import torch  # type: ignore
        from transformers import AutoModelForCTC, AutoProcessor  # type: ignore
    except Exception as e:
        raise RuntimeError("Missing ASR dependencies. Install torch and transformers.") from e

    hf_token = service_settings.HF_TOKEN or ""
    if hf_token and not os.environ.get("HUGGINGFACE_HUB_TOKEN"):
        os.environ["HUGGINGFACE_HUB_TOKEN"] = hf_token

    processor = None
    model = None

    # transformers versions vary; support both `token=` and legacy `use_auth_token=`
    try:
        processor = AutoProcessor.from_pretrained(MODEL_ID, token=hf_token or None)
        model = AutoModelForCTC.from_pretrained(MODEL_ID, token=hf_token or None)
    except TypeError:
        processor = AutoProcessor.from_pretrained(MODEL_ID, use_auth_token=hf_token or None)
        model = AutoModelForCTC.from_pretrained(MODEL_ID, use_auth_token=hf_token or None)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)
    model.eval()
    return processor, model, device, torch

@router.post("/")
async def transcribe_audio(
    req: TranscribeRequest,
    app_settings: Settings = Depends(get_settings),
):
    try:
        audio_bytes = _download_audio_bytes(req.audio_url, app_settings)

        suffix = os.path.splitext(req.audio_url.split("?")[0])[-1] or ".webm"
        tmp_path = None
        wav_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            try:
                wav_path = _convert_to_wav(tmp_path, suffix)
            except HTTPException as e:
                # If ffmpeg is missing locally, return a placeholder transcription so the
                # backend pipeline can still persist something and proceed.
                if e.status_code == 503 and "ffmpeg" in (str(e.detail or "")).lower():
                    return {
                        "transcription": "Transcription unavailable (ffmpeg not installed on AI service).",
                        "is_placeholder": True,
                        "error": str(e.detail),
                    }
                raise
            if wav_path != tmp_path and tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

            try:
                import librosa  # type: ignore
            except Exception as e:
                raise HTTPException(status_code=503, detail="librosa is required for audio loading but is not installed.") from e

            speech, sample_rate = librosa.load(wav_path, sr=16000)

            processor, model, device, torch = _get_asr_components()
            inputs = processor(speech, sampling_rate=sample_rate, return_tensors="pt", padding=True)
            inputs = inputs.to(device)

            with torch.no_grad():
                logits = model(inputs.input_values).logits

            predicted_ids = torch.argmax(logits, dim=-1)
            transcription = processor.batch_decode(predicted_ids)[0]
            return {"transcription": transcription}
        finally:
            for path in [tmp_path, wav_path]:
                try:
                    if path and os.path.exists(path):
                        os.unlink(path)
                except Exception:
                    pass

    except HTTPException:
        raise
    except RuntimeError as e:
        # Lazy-loaded dependency/model errors
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing audio: {type(e).__name__}: {str(e)}")
