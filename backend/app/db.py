from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import Settings

settings = Settings()

SQLALCHEMY_DATABASE_URL = f"postgresql://{settings.user}:{settings.password}@{settings.host}:{settings.port}/{settings.dbname}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
