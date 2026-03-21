import dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

dotenv.load_dotenv()


class Settings(BaseSettings):
    SUPABASE_URL: str
    # Legacy: keep for backward compatibility. Prefer the explicit keys below.
    SUPABASE_KEY: str = ""
    # Backend should use service-role key to bypass RLS (app enforces access itself).
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    # Optional: anon key (only needed if you call auth endpoints with anon key explicitly).
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_JWT_SECRET: str
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_S3_BUCKET: str = "seva-mitra"
    ANALYSIS_API_URL: str = "https://cfwsxf61-8000.inc1.devtunnels.ms"
    CORS_ORIGINS: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
