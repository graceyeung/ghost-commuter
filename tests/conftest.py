"""Shared fixtures for database-backed API tests.

DB tests use their own database (TEST_DATABASE_URL, default: the configured server with database
`ghost_commuter_test`), apply schema.sql (which also proves the migration is idempotent) and
truncate users before each test. They are skipped when Postgres is unreachable, so the pure tests
still run anywhere. Run them inside the API container:

    docker compose exec api pytest -q tests/

Every test runs in deterministic rule-based mode (no model calls).
"""
from __future__ import annotations

import asyncio
import dataclasses
import os
import sys
import uuid
from datetime import time
from pathlib import Path
from typing import Any, Awaitable, Callable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pytest  # noqa: E402


def _test_database_url() -> str:
    from config import settings

    return os.getenv("TEST_DATABASE_URL") or settings.database_url.rsplit("/", 1)[0] + "/ghost_commuter_test"


async def _prepare_database(url: str) -> None:
    import asyncpg

    dsn = url.replace("postgresql+asyncpg://", "postgresql://")
    server, name = dsn.rsplit("/", 1)
    admin = await asyncpg.connect(f"{server}/postgres", timeout=3)
    try:
        if not await admin.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", name):
            await admin.execute(f'CREATE DATABASE "{name}"')
    finally:
        await admin.close()
    conn = await asyncpg.connect(dsn, timeout=3)
    try:
        sql = (ROOT / "schema.sql").read_text(encoding="utf-8")
        await conn.execute(sql)
        await conn.execute(sql)  # applying twice must be a no-op (idempotent migration)
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def database_url() -> str:
    url = _test_database_url()
    try:
        asyncio.run(_prepare_database(url))
    except Exception as exc:  # no Postgres here: skip DB tests, keep pure tests running
        pytest.skip(f"Postgres not reachable for DB tests ({type(exc).__name__})")
    return url


class Harness:
    """Runs one async scenario against the real FastAPI app and a fresh test database."""

    def __init__(self, url: str):
        self.url = url
        self.client: Any = None
        self.Session: Any = None

    def run(self, scenario: Callable[["Harness"], Awaitable[Any]]) -> Any:
        return asyncio.run(self._run(scenario))

    async def _run(self, scenario: Callable[["Harness"], Awaitable[Any]]) -> Any:
        import httpx
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
        from sqlalchemy.pool import NullPool

        import db
        import server

        engine = create_async_engine(self.url, poolclass=NullPool)
        self.Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        async with engine.begin() as conn:
            await conn.execute(text("TRUNCATE users CASCADE"))

        async def get_session():
            async with self.Session() as session:
                yield session

        server.app.dependency_overrides[db.get_session] = get_session
        server._hits.clear()
        transport = httpx.ASGITransport(app=server.app)
        try:
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                self.client = client
                return await scenario(self)
        finally:
            server.app.dependency_overrides.clear()
            await engine.dispose()

    # ------------------------------------------------------------------ data builders
    async def user(
        self,
        name: str | None = None,
        *,
        languages: list[tuple[str, str]] = (),
        matching: str = "prefer_shared",
        share: bool = True,
        journeys: int = 0,
        home: str = "Finsbury Park",
        origin: str = "Euston",
        line: str = "Victoria",
        day: str = "thu",
        start: time = time(22, 30),
        interests: list[str] = (),
    ) -> uuid.UUID:
        import rag_engine
        from models import CommuteSchedule, User, UserLanguage
        from schemas import LanguageMatching, LanguageProficiency

        async with self.Session() as session:
            user = User(
                anonymous_display_name=name or f"Test Vole {uuid.uuid4().hex[:6]}",
                uni_affiliation="UCL",
                university_hub=origin,
                home_station=home,
                home_zone=rag_engine.station_zone(home),
                study_interests=list(interests),
                is_active=True,
                journeys_completed_count=journeys,
                language_matching=LanguageMatching(matching),
                share_languages=share,
            )
            session.add(user)
            await session.flush()
            for code, prof in languages:
                session.add(UserLanguage(user_id=user.id, language_code=code, proficiency=LanguageProficiency(prof)))
            end = time((start.hour * 60 + start.minute + 30) // 60 % 24, (start.minute + 30) % 60)
            session.add(CommuteSchedule(
                user_id=user.id, day_of_week=day, departure_window_start=start, departure_window_end=end,
                primary_line=line, origin_station=origin, destination_station=home,
            ))
            await session.commit()
            return user.id

    async def match(self, user_ids: list[uuid.UUID], status: str = "confirmed", match_type: str = "walk_home_pair") -> uuid.UUID:
        from models import Match, MatchParticipant, MatchRequest
        from schemas import MatchType, ParticipantResponse

        async with self.Session() as session:
            request = MatchRequest(requester_id=user_ids[0], day_of_week="thu", llm_mode="rule_based", notes=[])
            session.add(request)
            await session.flush()
            match = Match(
                match_request_id=request.id,
                match_type=MatchType(match_type),
                status=status,
                shared_line="Victoria",
                meet_station="Finsbury Park",
                assembly_instructions={"carriage_position": "middle", "landmark": "help point",
                                       "meet_time": "22:45", "last_mile_handoff": "Walk the lit main road."},
                icebreaker="Hi!",
            )
            session.add(match)
            await session.flush()
            response = ParticipantResponse.accepted if status == "confirmed" else ParticipantResponse.pending
            for uid in user_ids:
                session.add(MatchParticipant(match_id=match.id, user_id=uid, response=response))
            await session.commit()
            return match.id

    async def count(self, user_id: uuid.UUID) -> int:
        from sqlalchemy import select

        from models import User

        async with self.Session() as session:
            return await session.scalar(select(User.journeys_completed_count).where(User.id == user_id))

    async def confirm(self, user_id: uuid.UUID, match_id: uuid.UUID, journey_date: str | None = None):
        body: dict[str, Any] = {"user_id": str(user_id), "match_id": str(match_id)}
        if journey_date is not None:
            body["journey_date"] = journey_date
        return await self.client.post("/api/commuter/journeys/confirm", json=body)


@pytest.fixture
def harness(database_url, monkeypatch) -> Harness:
    import commute_agent_engine
    import config
    import server

    rule_based = dataclasses.replace(config.settings, anthropic_api_key="")
    monkeypatch.setattr(commute_agent_engine, "settings", rule_based)
    monkeypatch.setattr(server, "settings", rule_based)
    return Harness(database_url)
