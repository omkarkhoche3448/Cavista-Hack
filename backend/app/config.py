import dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

dotenv.load_dotenv()


class Settings(BaseSettings):
    GOOGLE_API_KEY: str
    user: str
    password: str
    host: str
    port: str
    dbname: str
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    model_config = SettingsConfigDict(env_file=".env")
