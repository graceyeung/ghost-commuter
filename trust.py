"""Trust badges: two-sided journey confirmation and tiers.

A journey counts only when at least two participants of the same match confirm the same
journey_date, so one person tapping a button can never raise anyone's count, including their own.

Concurrency: every confirmation locks its match row (SELECT ... FOR UPDATE) for the rest of the
transaction, so confirmations for one match run strictly one after another. Who gets credited is
(confirmers - participant_ids already credited), so a user can only gain +1 per match per day, even
with repeated or simultaneous requests. The unique constraints on journey_confirmations and
journeys_completed are a second line of defence.

Public output is a count and a tier only: never journey dates, partners or routes.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from config import JOURNEY_CONFIRM_WINDOW_HOURS, TRUST_TIERS, settings
from models import JourneyCompleted, JourneyConfirmation, Match, MatchParticipant, User
from schemas import JourneyConfirmResponse, TrustSummary

log = logging.getLogger("ghost.trust")


# ============================================================================== tiers
def trust_summary(count: int) -> TrustSummary:
    count = max(0, int(count))
    current = TRUST_TIERS[0]
    next_at: int | None = None
    for tier in TRUST_TIERS:
        if count >= tier[0]:
            current = tier
        elif next_at is None:
            next_at = tier[0]
    return TrustSummary(journeys_completed=count, tier=current[1], tier_label=current[2], next_tier_at=next_at)


def tier_label(count: int) -> str:
    return trust_summary(count).tier_label


async def get_trust_summary(session: AsyncSession, user_id: uuid.UUID) -> TrustSummary | None:
    count = await session.scalar(select(User.journeys_completed_count).where(User.id == user_id))
    return None if count is None else trust_summary(count)


# ======================================================================= confirmation
class JourneyError(Exception):
    """A rule violation with a status code and a message that is safe to show."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def london_now() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone))


def validate_journey_date(journey_date: date | None, now: datetime) -> date:
    """Defaults to today (Europe/London); rejects future dates and anything older than 24 hours."""
    today = now.date()
    if journey_date is None:
        return today
    if journey_date > today:
        raise JourneyError(422, "journey_date can't be in the future")
    if journey_date < (now - timedelta(hours=JOURNEY_CONFIRM_WINDOW_HOURS)).date():
        raise JourneyError(422, "journeys can only be confirmed within 24 hours")
    return journey_date


async def confirm_journey(
    session: AsyncSession,
    match_id: uuid.UUID,
    user_id: uuid.UUID,
    journey_date: date | None = None,
    now: datetime | None = None,
) -> JourneyConfirmResponse:
    """Record one participant's confirmation; complete the journey once 2+ participants confirmed.

    Runs as ONE transaction. Idempotent: repeating it returns the current state.
    """
    now = now or london_now()
    day = validate_journey_date(journey_date, now)

    # Lock the match row first: this serialises all confirmations for this match.
    row = (
        await session.execute(select(Match.status, Match.created_at).where(Match.id == match_id).with_for_update())
    ).first()
    participant_ids = set(
        (await session.execute(select(MatchParticipant.user_id).where(MatchParticipant.match_id == match_id)))
        .scalars()
        .all()
    )
    if row is None or user_id not in participant_ids:
        await session.rollback()
        # Same response for "no such match" and "not your match": don't leak existence.
        raise JourneyError(404, "match not found")
    if row.status != "confirmed":
        await session.rollback()
        raise JourneyError(409, "journeys can be confirmed once everyone in the match has accepted")
    if row.created_at and day < row.created_at.astimezone(now.tzinfo).date():
        await session.rollback()
        raise JourneyError(422, "that journey is from before this match was made")

    await session.execute(
        pg_insert(JourneyConfirmation)
        .values(match_id=match_id, user_id=user_id, journey_date=day)
        .on_conflict_do_nothing(index_elements=["match_id", "user_id", "journey_date"])
    )
    confirmers = set(
        (
            await session.execute(
                select(JourneyConfirmation.user_id).where(
                    JourneyConfirmation.match_id == match_id, JourneyConfirmation.journey_date == day
                )
            )
        )
        .scalars()
        .all()
    ) & participant_ids

    status = "waiting_for_partner"
    if len(confirmers) >= 2:
        completed = await session.scalar(
            select(JourneyCompleted)
            .where(JourneyCompleted.match_id == match_id, JourneyCompleted.journey_date == day)
            .with_for_update()
        )
        already = set(completed.participant_ids) if completed else set()
        newly_credited = confirmers - already
        if completed is None:
            session.add(JourneyCompleted(match_id=match_id, journey_date=day, participant_ids=sorted(confirmers)))
        elif newly_credited:
            completed.participant_ids = sorted(already | confirmers)
        if newly_credited:
            await session.execute(
                update(User)
                .where(User.id.in_(newly_credited))
                .values(journeys_completed_count=User.journeys_completed_count + 1)
            )
        status = "completed"
    await session.commit()

    # Column select (not the ORM entity) so a stale identity-map copy can't be returned.
    count = await session.scalar(select(User.journeys_completed_count).where(User.id == user_id)) or 0
    log.info("journey_confirmed", extra={"match_id": str(match_id), "user_id": str(user_id), "event": status})
    return JourneyConfirmResponse(status=status, journeys_completed=count, tier_label=tier_label(count))
