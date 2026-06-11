from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class SessionCreate(BaseModel):
    treatment_id: str
    dose: str
    intensity: float
    before_image_url: Optional[str] = None
    after_image_url: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class SessionResponse(BaseModel):
    id: str
    created_at: datetime
    treatment_id: str
    dose: str
    intensity: float
    before_image_url: Optional[str] = None
    after_image_url: Optional[str] = None
    queued_for_training: bool
    metadata: Optional[dict[str, Any]] = None

    model_config = {"from_attributes": True}


class SessionCreatedResponse(BaseModel):
    id: str
    status: str
