"""
CitySync — PostgreSQL async database engine + session factory.
Uses SQLAlchemy 2.0 async API with asyncpg driver.
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from shared.config import settings


class Base(DeclarativeBase):
    pass


def _connect_args(database_url: str) -> dict:
    """
    Connection args for managed Postgres.

    - Enforce TLS for non-local DBs.
    - Disable asyncpg statement cache for Supabase poolers (PgBouncer) to avoid
      prepared-statement issues.
    """
    try:
        u = make_url(database_url)
        host = (u.host or "").lower()
        port = int(u.port or 0)
    except Exception:
        host = ""
        port = 0

    if host in {"localhost", "127.0.0.1"} or host.endswith(".local"):
        return {}
    args: dict = {"ssl": "require"}
    if host.endswith("pooler.supabase.com") or port in {6543}:
        args["statement_cache_size"] = 0
    return args


# Create async engine — pool_pre_ping keeps connections alive
engine = create_async_engine(
    settings.database_url,
    connect_args=_connect_args(settings.database_url),
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.app_env == "development",
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Async context manager for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_dep() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for database sessions."""
    async with get_db() as session:
        yield session
