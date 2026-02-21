from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth
from .routers import sessions
from .routers import documents
from .routers import emr

app = FastAPI(title="SEVAमित्र API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(documents.router)
app.include_router(emr.router)


@app.get("/")
def read_root():
    return {"Version": "1.0.0", "Description": "SEVAमित्र API"}
