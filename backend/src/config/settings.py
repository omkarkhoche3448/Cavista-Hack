import dotenv
from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

dotenv.load_dotenv()


class Settings(BaseSettings):
    SUPABASE_URL: AnyHttpUrl
    SUPABASE_KEY: str
    SUPABASE_JWT_SECRET: str

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_S3_BUCKET: str = ""

    ANALYSIS_API_URL: AnyHttpUrl = Field(
        default="https://example.com",
        description="External AI analysis service base URL.",
    )

    MAX_UPLOAD_BYTES: int = 20 * 1024 * 1024
    MAX_AUDIO_BYTES: int = 100 * 1024 * 1024
    ALLOWED_DOCUMENT_MIME_TYPES: str = (
        "application/pdf,image/png,image/jpeg,image/jpg,text/plain"
    )
    ALLOWED_AUDIO_MIME_TYPES: str = (
        "audio/webm,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a"
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

