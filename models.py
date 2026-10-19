"""SQLAlchemy 2.0 ORM models mirroring schema.sql.

schema.sql is the source of truth for DDL; these models never call create_all().
There is deliberately no real-name or street-address attribute anywhere.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from schemas import (
    GenderIdentity,
    GenderPreference,
    LanguageMatching,
    LanguageProficiency,
    MatchType,
    ParticipantResponse,
)


def _pg_enum(enum_cls, name: str) -> Enum:
    # create_type=False: the type is created by schema.sql, not by SQLAlchemy.
    return Enum(
        enum_cls,
        name=name,
        create_type=False,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    anonymous_display_name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    uni_affiliation: Mapped[str] = mapped_column(Text, nullable=False)
    university_hub: Mapped[str] = mapped_column(Text, nullable=False)
    home_station: Mapped[str] = mapped_column(Text, nullable=False)
    home_zone: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    gender_identity: Mapped[GenderIdentity] = mapped_column(
        _pg_enum(GenderIdentity, "gender_identity"), nullable=False, default=GenderIdentity.undisclosed
    )
    gender_preference: Mapped[GenderPreference] = mapped_column(
        _pg_enum(GenderPreference, "gender_preference"), nullable=False, default=GenderPreference.any
    )
    safety_preferences: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    study_interests: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    bio_freetext: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Cache of completed journeys. Changed ONLY inside trust.confirm_journey's transaction.
    journeys_completed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    language_matching: Mapped[LanguageMatching] = mapped_column(
        _pg_enum(LanguageMatching, "language_matching"), nullable=False, default=LanguageMatching.prefer_shared
    )
    share_languages: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    schedules: Mapped[list["CommuteSchedule"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class UserContact(Base):
    """Read ONLY by the match-respond endpoint after mutual acceptance."""

    __tablename__ = "user_contacts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    contact_handle: Mapped[str] = mapped_column(Text, nullable=False)


class CommuteSchedule(Base):
    __tablename__ = "commute_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[str] = mapped_column(String(3), nullable=False)
    departure_window_start: Mapped[time] = mapped_column(Time, nullable=False)
    departure_window_end: Mapped[time] = mapped_column(Time, nullable=False)
    primary_line: Mapped[str] = mapped_column(Text, nullable=False)
    origin_station: Mapped[str] = mapped_column(Text, nullable=False)
    destination_station: Mapped[str] = mapped_column(Text, nullable=False)
    raw_input_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="schedules")


class MatchRequest(Base):
    __tablename__ = "match_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[str] = mapped_column(String(3), nullable=False)
    llm_mode: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("match_requests.id", ondelete="CASCADE"), nullable=False
    )
    match_type: Mapped[MatchType] = mapped_column(_pg_enum(MatchType, "match_type"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    shared_line: Mapped[str] = mapped_column(Text, nullable=False)
    meet_station: Mapped[str] = mapped_column(Text, nullable=False)
    assembly_instructions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    icebreaker: Mapped[str] = mapped_column(Text, nullable=False)
    safety_notes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    similarity_reasons: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    similarity_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    participants: Mapped[list["MatchParticipant"]] = relationship(
        back_populates="match", cascade="all, delete-orphan", lazy="selectin"
    )


class MatchParticipant(Base):
    __tablename__ = "match_participants"

    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    response: Mapped[ParticipantResponse] = mapped_column(
        _pg_enum(ParticipantResponse, "participant_response"),
        nullable=False,
        default=ParticipantResponse.pending,
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    match: Mapped[Match] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(lazy="selectin")


class MatchMessage(Base):
    """A chat message between members of a confirmed match. `body` is stored redacted."""

    __tablename__ = "match_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.clock_timestamp())


class UserLanguage(Base):
    """A language a student says they speak. Never logged; disclosed only per languages.py rules."""

    __tablename__ = "user_languages"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    language_code: Mapped[str] = mapped_column(Text, primary_key=True)
    proficiency: Mapped[LanguageProficiency] = mapped_column(
        _pg_enum(LanguageProficiency, "language_proficiency"), nullable=False
    )


class JourneyConfirmation(Base):
    """One participant saying "we travelled together" for one match on one day."""

    __tablename__ = "journey_confirmations"
    __table_args__ = (
        UniqueConstraint("match_id", "user_id", "journey_date"),
        ForeignKeyConstraint(
            ["match_id", "user_id"], ["match_participants.match_id", "match_participants.user_id"], ondelete="CASCADE"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    journey_date: Mapped[date] = mapped_column(Date, nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class JourneyCompleted(Base):
    """A journey at least two participants confirmed. participant_ids = everyone credited (+1 each)."""

    __tablename__ = "journeys_completed"
    __table_args__ = (UniqueConstraint("match_id", "journey_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    journey_date: Mapped[date] = mapped_column(Date, nullable=False)
    participant_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
