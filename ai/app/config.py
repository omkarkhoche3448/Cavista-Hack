import dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

dotenv.load_dotenv()


class Settings(BaseSettings):
    GOOGLE_API_KEY: str = ""
    GEMINI_MODEL: str = Field(
        default="gemini-2.0-flash",
        validation_alias=AliasChoices("GEMINI_MODEL", "GENAI_MODEL", "GOOGLE_MODEL"),
    )
    GEMINI_FALLBACK_MODELS: str = "gemini-2.5-flash,gemini-1.5-flash"
    HF_TOKEN: str = ""
    DATABASE_URL: str | None = None
    user: str | None = None
    password: str | None = None
    host: str | None = None
    port: str | None = None
    dbname: str | None = None
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_BUCKET_NAME: str = Field(
        default="",
        validation_alias=AliasChoices("AWS_BUCKET_NAME", "AWS_S3_BUCKET"),
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
