import dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

dotenv.load_dotenv()


class Settings(BaseSettings):
    GOOGLE_API_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_JWT_SECRET: str
    DEEPGRAM_API_KEY: str = ""
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_S3_BUCKET: str = ""
    ANALYSIS_API_URL: str = "https://cfwsxf61-8000.inc1.devtunnels.ms"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
