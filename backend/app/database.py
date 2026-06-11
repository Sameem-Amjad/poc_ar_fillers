from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import DATABASE_URL

# Supabase pooler adds ?pgbouncer=true which psycopg2 doesn't understand — strip it
_db_url = DATABASE_URL.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "")

is_sqlite = _db_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(
    _db_url,
    connect_args=connect_args,
    pool_pre_ping=True,   # detect stale connections (important for Supabase pooler)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from .models import session as _  # noqa: ensure models are imported
    Base.metadata.create_all(bind=engine)
