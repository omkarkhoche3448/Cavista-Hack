import requests
from PIL import Image
from io import BytesIO
from passlib.context import CryptContext
import whisper
import os
import tempfile

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
