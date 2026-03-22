from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import Settings

settings = Settings()


def _build_database_url() -> str:
    if settings.DATABASE_URL:
        return settings.DATABASE_URL
    db_parts = [settings.user, settings.password, settings.host, settings.port, settings.dbname]
    if all(db_parts):
        return f"postgresql://{settings.user}:{settings.password}@{settings.host}:{settings.port}/{settings.dbname}"
    # Safe local fallback so AI service can run without external DB settings.
    return "sqlite:///./ai_local.db"


SQLALCHEMY_DATABASE_URL = _build_database_url()
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
