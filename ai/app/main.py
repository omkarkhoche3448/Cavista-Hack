from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import ai, transcribe

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"Version": "1.0.0", "Description": "Cavists API"}


app.include_router(ai.router)
app.include_router(transcribe.router)
