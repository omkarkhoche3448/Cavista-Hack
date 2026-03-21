import dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

_AI_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
_ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

# Load env files without polluting with unrelated parent .env files.
dotenv.load_dotenv(_AI_ENV_FILE, override=False)
dotenv.load_dotenv(_ROOT_ENV_FILE, override=False)


class Settings(BaseSettings):
    # LLM / AI
    GOOGLE_API_KEY: str = ""
    HF_TOKEN: str = ""

    # Optional simple auth for the AI service (checked by dependencies if used)
    AI_API_KEY: str = ""
    AI_API_KEY_HEADER: str = "X-API-Key"

    # Optional AWS creds for downloading from private S3 URLs
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"

    # Ignore unknown env vars so the service can run in environments where
    # other .env files or platform-provided variables are present.
    model_config = SettingsConfigDict(
        env_file=[str(_AI_ENV_FILE), str(_ROOT_ENV_FILE)],
        extra="ignore",
    )
