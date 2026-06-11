from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .config import CORS_ORIGINS
from .database import init_db
from .routers import sessions, treatments, uploads

app = FastAPI(title="AR Filler POC API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images
uploads_dir = Path(__file__).parent.parent / "uploads"
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(treatments.router, prefix="/api/treatments", tags=["treatments"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "service": "ar-filler-poc"}
