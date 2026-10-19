"""Two-sided journey confirmation and trust tiers."""
from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest

import trust
from config import TRUST_TIERS


def _today():
    return trust.london_now().date()


# --------------------------------------------------------------------------- tiers (pure)
@pytest.mark.parametrize("count, label, next_at", [
    (0, "New", 1),
    (1, "First steps", 5),
    (4, "First steps", 5),
    (5, "Regular", 10),
    (9, "Regular", 10),
    (10, "Trusted", 25),
    (24, "Trusted", 25),
    (25, "Commute veteran", None),
    (300, "Commute veteran", None),
])
def test_tier_boundaries(count, label, next_at):
    summary = trust.trust_summary(count)
    assert summary.tier_label == label
    assert summary.next_tier_at == next_at
    assert summary.journeys_completed == count


def test_tier_thresholds_live_in_config():
    assert [t[0] for t in TRUST_TIERS] == [0, 1, 5, 10, 25]


# ------------------------------------------------------------------------ confirmation (DB)
def test_both_confirm_completes_and_increments_once(harness):
    async def scenario(h):
        a, b = await h.user(), await h.user()
        match_id = await h.match([a, b])

        first = await h.confirm(a, match_id)
        assert first.status_code == 200
        assert first.json() == {"status": "waiting_for_partner", "journeys_completed": 0, "tier_label": "New"}

        second = await h.confirm(b, match_id)
        assert second.json() == {"status": "completed", "journeys_completed": 1, "tier_label": "First steps"}
        assert await h.count(a) == 1 and await h.count(b) == 1

        # A checking again sees the completed journey, but nobody is credited twice.
        again = await h.confirm(a, match_id)
        assert again.json()["status"] == "completed"
        assert await h.count(a) == 1 and await h.count(b) == 1

        trust_a = await h.client.get(f"/api/commuter/users/{a}/trust")
        assert trust_a.json() == {"journeys_completed": 1, "tier": "first_steps", "tier_label": "First steps", "next_tier_at": 5}

    harness.run(scenario)


def test_single_confirm_waits_and_never_changes_the_public_count(harness):
    async def scenario(h):
        a, b = await h.user(), await h.user()
        match_id = await h.match([a, b])
        assert (await h.confirm(a, match_id)).json()["status"] == "waiting_for_partner"
        assert (await h.client.get(f"/api/commuter/users/{a}/trust")).json()["journeys_completed"] == 0
        assert await h.count(b) == 0

    harness.run(scenario)


def test_repeat_confirm_is_idempotent(harness):
    async def scenario(h):
        from sqlalchemy import func, select

        from models import JourneyConfirmation

        a, b = await h.user(), await h.user()
        match_id = await h.match([a, b])
        bodies = [(await h.confirm(a, match_id)).json() for _ in range(3)]
        assert all(body["status"] == "waiting_for_partner" for body in bodies)
        async with h.Session() as session:
            rows = await session.scalar(select(func.count()).select_from(JourneyConfirmation).where(JourneyConfirmation.match_id == match_id))
        assert rows == 1

    harness.run(scenario)


def test_non_participant_is_rejected_without_leaking_the_match(harness):
    async def scenario(h):
        import uuid

        a, b, outsider = await h.user(), await h.user(), await h.user()
        match_id = await h.match([a, b])
        not_mine = await h.confirm(outsider, match_id)
        missing = await h.confirm(a, uuid.uuid4())
        assert not_mine.status_code == missing.status_code == 404
        assert not_mine.json() == missing.json() == {"error": "match not found"}
        # The outsider's attempt never counts towards anything.
        await h.confirm(a, match_id)
        assert await h.count(a) == 0 and await h.count(outsider) == 0

    harness.run(scenario)


def test_confirm_before_mutual_accept_is_rejected(harness):
    async def scenario(h):
        a, b = await h.user(), await h.user()
        match_id = await h.match([a, b], status="pending")
        response = await h.confirm(a, match_id)
        assert response.status_code == 409
        assert "everyone in the match has accepted" in response.json()["error"]

    harness.run(scenario)


def test_future_and_too_old_dates_are_rejected(harness):
    async def scenario(h):
        a, b = await h.user(), await h.user()
        match_id = await h.match([a, b])
        future = await h.confirm(a, match_id, (_today() + timedelta(days=1)).isoformat())
        old = await h.confirm(a, match_id, (_today() - timedelta(days=2)).isoformat())
        assert future.status_code == 422 and "future" in future.json()["error"]
        assert old.status_code == 422 and "24 hours" in old.json()["error"]
        # A journey from before the match existed can't be logged either.
        before = await h.confirm(a, match_id, (_today() - timedelta(days=1)).isoformat())
        assert before.status_code == 422 and "before this match" in before.json()["error"]

    harness.run(scenario)


def test_counts_rise_exactly_once_per_match_per_day(harness):
    async def scenario(h):
        from sqlalchemy import update

        from models import Match

        a, b = await h.user(), await h.user()
        match_id = await h.match([a, b])
        async with h.Session() as session:  # the match was made two days ago
            await session.execute(update(Match).where(Match.id == match_id).values(created_at=trust.london_now() - timedelta(days=2)))
            await session.commit()
        yesterday = (_today() - timedelta(days=1)).isoformat()
        for user in (a, b, a, b):
            await h.confirm(user, match_id, yesterday)
        assert await h.count(a) == 1
        for user in (b, a, b):
            await h.confirm(user, match_id)  # today
        assert await h.count(a) == 2 and await h.count(b) == 2

    harness.run(scenario)


def test_group_match_credits_each_confirmer_who_has_company(harness):
    async def scenario(h):
        from sqlalchemy import select

        from models import JourneyCompleted

        a, b, c = await h.user(), await h.user(), await h.user()
        match_id = await h.match([a, b, c], match_type="study_group")
        assert (await h.confirm(a, match_id)).json()["status"] == "waiting_for_partner"
        assert await h.count(a) == 0  # a lone confirmer gets nothing yet

        assert (await h.confirm(b, match_id)).json()["status"] == "completed"
        assert (await h.count(a), await h.count(b), await h.count(c)) == (1, 1, 0)

        late = (await h.confirm(c, match_id)).json()
        assert late == {"status": "completed", "journeys_completed": 1, "tier_label": "First steps"}
        assert (await h.count(a), await h.count(b), await h.count(c)) == (1, 1, 1)

        async with h.Session() as session:
            rows = (await session.execute(select(JourneyCompleted).where(JourneyCompleted.match_id == match_id))).scalars().all()
        assert len(rows) == 1 and set(rows[0].participant_ids) == {a, b, c}

    harness.run(scenario)


def test_concurrent_confirmations_do_not_double_count(harness):
    async def scenario(h):
        from sqlalchemy import func, select

        from models import JourneyCompleted

        a, b = await h.user(), await h.user()
        match_id = await h.match([a, b])
        # 10 simultaneous requests, each on its own DB connection: both people, repeatedly.
        responses = await asyncio.gather(*[h.confirm(user, match_id) for user in [a, b] * 5])
        assert all(r.status_code == 200 for r in responses)
        assert await h.count(a) == 1 and await h.count(b) == 1
        async with h.Session() as session:
            completed = await session.scalar(select(func.count()).select_from(JourneyCompleted).where(JourneyCompleted.match_id == match_id))
        assert completed == 1

    harness.run(scenario)


def test_concurrent_confirmations_in_a_group_credit_everyone_once(harness):
    async def scenario(h):
        users = [await h.user() for _ in range(4)]
        match_id = await h.match(users, match_type="study_group")

        async def direct(user_id):
            # Bypass HTTP: four sessions racing straight into the transaction.
            async with h.Session() as session:
                return await trust.confirm_journey(session, match_id, user_id)

        results = await asyncio.gather(*[direct(u) for u in users * 3])
        assert {r.status for r in results} <= {"waiting_for_partner", "completed"}
        assert [await h.count(u) for u in users] == [1, 1, 1, 1]

    harness.run(scenario)
