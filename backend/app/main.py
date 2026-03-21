from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth
from .routers import sessions
from .routers import documents
from .routers import emr
from .routers import notes
from .config import settings

app = FastAPI(title="SEVAमित्र API", version="1.0.0")

default_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
]
env_origins = [o.strip() for o in (settings.CORS_ORIGINS or "").split(",") if o.strip()]
allow_origins = env_origins or default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(documents.router)
app.include_router(emr.router)
app.include_router(notes.router)


@app.get("/")
def read_root():
    """
    Root endpoint for service discovery and health check.
    
    Why: Used to verify if the API is running and accessible.
    Where: Called by infrastructure health checks or manual verification.
    
    Returns:
        dict: API version and description.
    """
    return {"Version": "1.0.0", "Description": "SEVAमित्र API"}
