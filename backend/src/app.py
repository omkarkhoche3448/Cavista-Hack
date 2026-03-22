from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .middlewares.error_handler import register_exception_handlers
from .middlewares.response_envelope import ResponseEnvelopeMiddleware
from .routes import auth, documents, emr, notes, sessions

app = FastAPI(title="SEVAमित्र API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.add_middleware(ResponseEnvelopeMiddleware)

app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(documents.router)
app.include_router(emr.router)
app.include_router(notes.router)


@app.get("/")
def root() -> dict:
    return {"version": "2.0.0", "description": "SEVAमित्र API"}
