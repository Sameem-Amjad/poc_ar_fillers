from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from ..database import get_db
from ..models.session import TreatmentSession
from ..schemas.session import SessionCreate, SessionResponse, SessionCreatedResponse

router = APIRouter()


@router.post("/", response_model=SessionCreatedResponse)
def create_session(payload: SessionCreate, db: DBSession = Depends(get_db)):
    session = TreatmentSession(
        treatment_id=payload.treatment_id,
        dose=payload.dose,
        intensity=payload.intensity,
        before_image_url=payload.before_image_url,
        after_image_url=payload.after_image_url,
        queued_for_training=True,
        metadata_=payload.metadata,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "status": "queued_for_training"}


@router.get("/", response_model=list[SessionResponse])
def list_sessions(limit: int = 50, db: DBSession = Depends(get_db)):
    rows = (
        db.query(TreatmentSession)
        .order_by(TreatmentSession.created_at.desc())
        .limit(limit)
        .all()
    )
    # Map metadata_ -> metadata for response
    results = []
    for r in rows:
        results.append(SessionResponse(
            id=r.id,
            created_at=r.created_at,
            treatment_id=r.treatment_id,
            dose=r.dose,
            intensity=r.intensity,
            before_image_url=r.before_image_url,
            after_image_url=r.after_image_url,
            queued_for_training=r.queued_for_training,
            metadata=r.metadata_,
        ))
    return results


@router.delete("/{session_id}")
def delete_session(session_id: str, db: DBSession = Depends(get_db)):
    row = db.query(TreatmentSession).filter(TreatmentSession.id == session_id).first()
    if row:
        db.delete(row)
        db.commit()
    return {"status": "deleted"}
