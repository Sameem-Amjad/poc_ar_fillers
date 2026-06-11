import uuid
import base64
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


class ImageUpload(BaseModel):
    data_url: str  # base64 data URL
    filename: str = "image.jpg"


@router.post("/image")
def upload_image(payload: ImageUpload):
    try:
        header, encoded = payload.data_url.split(",", 1)
        ext = "jpg" if "jpeg" in header else "png"
        file_id = str(uuid.uuid4())
        path = UPLOAD_DIR / f"{file_id}.{ext}"
        path.write_bytes(base64.b64decode(encoded))
        return {"url": f"/uploads/{file_id}.{ext}", "id": file_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
