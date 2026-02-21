import dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

dotenv.load_dotenv()


class Settings(BaseSettings):
    GOOGLE_API_KEY: str
    HF_TOKEN: str = ""
    user: str
    password: str
    host: str
    port: str
    dbname: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str
    AWS_BUCKET_NAME: str


    model_config = SettingsConfigDict(env_file=".env")
