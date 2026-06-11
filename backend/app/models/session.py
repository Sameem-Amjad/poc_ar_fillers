import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Boolean, DateTime, JSON
from ..database import Base


class TreatmentSession(Base):
    __tablename__ = "treatment_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    treatment_id = Column(String, nullable=False)
    dose = Column(String, nullable=False)
    intensity = Column(Float, nullable=False)
    before_image_url = Column(String, nullable=True)
    after_image_url = Column(String, nullable=True)
    queued_for_training = Column(Boolean, default=True)
    trained_at = Column(DateTime, nullable=True)
    metadata_ = Column("metadata", JSON, nullable=True)
