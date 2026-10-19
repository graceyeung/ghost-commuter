"""Async database engine, session factory and idempotent schema bootstrap."""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings

log = logging.getLogger("ghost.db")

engine = create_async_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


async def init_db() -> None:
    """Apply schema.sql. Every statement in it is idempotent.

    asyncpg's prepared-statement path cannot run multi-statement scripts, so the
    script is sent through the raw driver connection's simple-query protocol.
    """
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    async with engine.connect() as conn:
        raw = await conn.get_raw_connection()
        await raw.driver_connection.execute(sql)
    log.info("schema_applied")


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request."""
    async with SessionLocal() as session:
        yield session


async def dispose() -> None:
    await engine.dispose()
