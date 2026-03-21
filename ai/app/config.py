import dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

dotenv.load_dotenv()


class Settings(BaseSettings):
    # LLM / AI
    GOOGLE_API_KEY: str = ""
    HF_TOKEN: str = ""

    # Optional AWS creds for downloading from private S3 URLs
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"

    model_config = SettingsConfigDict(env_file=".env")
