import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

PRESETS_DIR = Path(__file__).parent.parent.parent.parent / "presets"


@router.get("/")
def list_treatments():
    treatments = []
    if PRESETS_DIR.exists():
        for json_file in sorted(PRESETS_DIR.rglob("*.json")):
            try:
                treatments.append(json.loads(json_file.read_text()))
            except Exception:
                pass
    return treatments


@router.get("/{treatment_id}")
def get_treatment(treatment_id: str):
    if PRESETS_DIR.exists():
        for json_file in PRESETS_DIR.rglob("*.json"):
            try:
                data = json.loads(json_file.read_text())
                if data.get("id") == treatment_id:
                    return data
            except Exception:
                pass
    return {"error": "not found"}
