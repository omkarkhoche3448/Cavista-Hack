from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .db import engine

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



models.Base.metadata.create_all(bind=engine)


@app.get("/")
def read_root():
    return {"Version": "1.0.0", "Description": "Cavists API"}
