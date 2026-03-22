from __future__ import annotations

import os
import subprocess
import tempfile
import traceback
from threading import Lock

import huggingface_hub
import librosa
import requests
import torch
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForCTC, AutoProcessor

from ..config import Settings
from .ai import get_s3_client, get_settings, parse_s3_url

router = APIRouter(
    prefix="/transcribe",
    tags=["transcribe"],
)

MODEL_ID = "facebook/wav2vec2-base-960h"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_model_lock = Lock()
_processor = None
_model = None
_model_load_error: str | None = None
_hf_login_attempted = False


class TranscribeRequest(BaseModel):
    audio_url: str = Field(..., min_length=1)


def _get_model_components(hf_token: str):
    global _processor, _model, _model_load_error, _hf_login_attempted

    if _processor is not None and _model is not None:
        return _processor, _model
    if _model_load_error is not None:
        raise RuntimeError(_model_load_error)

    with _model_lock:
        if _processor is not None and _model is not None:
            return _processor, _model
        if _model_load_error is not None:
            raise RuntimeError(_model_load_error)

        try:
            if hf_token and not _hf_login_attempted:
                huggingface_hub.login(token=hf_token, add_to_git_credential=False)
                _hf_login_attempted = True

            _processor = AutoProcessor.from_pretrained(MODEL_ID)
            _model = AutoModelForCTC.from_pretrained(MODEL_ID).to(DEVICE)
        except Exception as error:
            _model_load_error = f"failed to load ASR model '{MODEL_ID}': {error}"
            raise RuntimeError(_model_load_error) from error

    return _processor, _model


def _download_audio_bytes(audio_url: str, app_settings: Settings) -> bytes:
    s3_info = parse_s3_url(audio_url)
    if s3_info:
        bucket, key = s3_info
        s3_client = get_s3_client(app_settings)
        try:
            s3_response = s3_client.get_object(Bucket=bucket, Key=key)
            return s3_response["Body"].read()
        except Exception as error:
            raise HTTPException(status_code=400, detail=f"Could not download audio from S3: {error}") from error

    response = requests.get(audio_url, timeout=60)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Could not download audio from URL")
    return response.content


@router.post("/")
async def transcribe_audio(
    req: TranscribeRequest,
    app_settings: Settings = Depends(get_settings),
):
    try:
        processor, model = _get_model_components(app_settings.HF_TOKEN)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=f"Transcription model unavailable: {error}") from error

    temp_paths: list[str] = []
    try:
        audio_bytes = _download_audio_bytes(req.audio_url, app_settings)

        suffix = os.path.splitext(req.audio_url.split("?")[0])[-1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
            temp_paths.append(tmp_path)

        wav_path = tmp_path
        if suffix.lower() != ".wav":
            wav_path = tmp_path.rsplit(".", 1)[0] + ".wav"
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", wav_path],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg conversion failed: {result.stderr}")
            temp_paths.append(wav_path)

        speech, sample_rate = librosa.load(wav_path, sr=16000)

        inputs = processor(speech, sampling_rate=sample_rate, return_tensors="pt", padding=True)
        inputs = inputs.to(DEVICE)

        with torch.no_grad():
            logits = model(inputs.input_values).logits

        predicted_ids = torch.argmax(logits, dim=-1)
        transcription = processor.batch_decode(predicted_ids)[0]

        return {"transcription": transcription}

    except HTTPException:
        raise
    except Exception as error:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing audio: {type(error).__name__}: {error}") from error
    finally:
        for path in temp_paths:
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except Exception:
                pass
