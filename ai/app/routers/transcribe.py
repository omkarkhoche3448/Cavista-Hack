from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from transformers import AutoModelForCTC, AutoProcessor
from ..db import settings
from .ai import get_s3_client, parse_s3_url, get_settings
from ..config import Settings
import huggingface_hub
import librosa
import requests
import torch
import io
import os
import tempfile
import subprocess
import traceback

router = APIRouter(
    prefix="/transcribe",
    tags=["transcribe"],
)

# Switching to a standard, fully supported model for CTC transcription
model_id = "facebook/wav2vec2-base-960h"

if settings.HF_TOKEN:
    huggingface_hub.login(token=settings.HF_TOKEN)

device = "cuda" if torch.cuda.is_available() else "cpu"
processor = AutoProcessor.from_pretrained(model_id)
model = AutoModelForCTC.from_pretrained(model_id).to(device)

class TranscribeRequest(BaseModel):
    audio_url: str

@router.post("/")
async def transcribe_audio(
    req: TranscribeRequest,
    app_settings: Settings = Depends(get_settings),
):
    try:
        # Download audio from URL (supports S3 and regular URLs)
        s3_info = parse_s3_url(req.audio_url)
        if s3_info:
            bucket, key = s3_info
            s3_client = get_s3_client(app_settings)
            try:
                s3_response = s3_client.get_object(Bucket=bucket, Key=key)
                audio_bytes = s3_response["Body"].read()
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Could not download audio from S3: {str(e)}")
        else:
            response = requests.get(req.audio_url)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Could not download audio from URL")
            audio_bytes = response.content

        # Write to a temporary file
        suffix = os.path.splitext(req.audio_url.split("?")[0])[-1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        # Convert to WAV using ffmpeg if not already .wav
        wav_path = tmp_path
        if suffix.lower() != ".wav":
            wav_path = tmp_path.rsplit(".", 1)[0] + ".wav"
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", wav_path],
                capture_output=True, text=True
            )
            os.unlink(tmp_path)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg conversion failed: {result.stderr}")

        # Load audio using librosa
        speech, sample_rate = librosa.load(wav_path, sr=16000)

        # Clean up temporary file
        os.unlink(wav_path)

        # Process and generate transcription
        inputs = processor(speech, sampling_rate=sample_rate, return_tensors="pt", padding=True)
        inputs = inputs.to(device)

        with torch.no_grad():
            logits = model(inputs.input_values).logits

        predicted_ids = torch.argmax(logits, dim=-1)
        transcription = processor.batch_decode(predicted_ids)[0]

        return {"transcription": transcription}

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing audio: {type(e).__name__}: {str(e)}")