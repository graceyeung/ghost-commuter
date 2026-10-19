-- Ghost Commuter schema (idempotent: safe to run on every startup).
-- Privacy by design: there is NO real-name column and NO street-address column.
-- users.home_station is the finest-grained location ever stored.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE gender_preference AS ENUM ('any', 'women_only', 'men_only', 'non_binary_inclusive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE gender_identity AS ENUM ('woman', 'man', 'non_binary', 'undisclosed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE match_type AS ENUM ('walk_home_pair', 'study_group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE participant_response AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymous_display_name  TEXT NOT NULL UNIQUE,
    uni_affiliation         TEXT NOT NULL,
    university_hub          TEXT NOT NULL,              -- station nearest campus
    home_station            TEXT NOT NULL,              -- finest location stored
    home_zone               SMALLINT NOT NULL CHECK (home_zone BETWEEN 1 AND 9),
    gender_identity         gender_identity NOT NULL DEFAULT 'undisclosed',
    gender_preference       gender_preference NOT NULL DEFAULT 'any',
    safety_preferences      JSONB NOT NULL DEFAULT '[]'::jsonb,
    study_interests         TEXT[] NOT NULL DEFAULT '{}',
    bio_freetext            TEXT,                       -- stored only after PII redaction
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contact handles live in their own table. The matching pipeline never selects
-- from it; it is read only after every participant in a match has accepted.
CREATE TABLE IF NOT EXISTS user_contacts (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    contact_handle  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commute_schedules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week             TEXT NOT NULL CHECK (day_of_week IN ('mon','tue','wed','thu','fri','sat','sun')),
    departure_window_start  TIME NOT NULL,
    departure_window_end    TIME NOT NULL,
    primary_line            TEXT NOT NULL,
    origin_station          TEXT NOT NULL,
    destination_station     TEXT NOT NULL,
    raw_input_text          TEXT,                       -- stored only after PII redaction
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week     TEXT NOT NULL,
    llm_mode        TEXT NOT NULL,
    notes           JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_request_id        UUID NOT NULL REFERENCES match_requests(id) ON DELETE CASCADE,
    match_type              match_type NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined')),
    shared_line             TEXT NOT NULL,
    meet_station            TEXT NOT NULL,
    assembly_instructions   JSONB NOT NULL,
    icebreaker              TEXT NOT NULL,
    safety_notes            JSONB NOT NULL DEFAULT '[]'::jsonb,
    similarity_reasons      JSONB NOT NULL DEFAULT '[]'::jsonb,
    similarity_score        REAL NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_participants (
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response        participant_response NOT NULL DEFAULT 'pending',
    responded_at    TIMESTAMPTZ,
    PRIMARY KEY (match_id, user_id)
);

-- In-app chat between match members. Opens only once a match is confirmed (every member accepted).
-- Bodies are stored only after PII redaction, exactly like commute text.
CREATE TABLE IF NOT EXISTS match_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS ix_schedules_day_window ON commute_schedules (day_of_week, departure_window_start);
CREATE INDEX IF NOT EXISTS ix_schedules_primary_line ON commute_schedules (primary_line);
CREATE INDEX IF NOT EXISTS ix_schedules_user ON commute_schedules (user_id);
CREATE INDEX IF NOT EXISTS ix_users_home_station ON users (home_station);
CREATE INDEX IF NOT EXISTS ix_participants_user ON match_participants (user_id);
CREATE INDEX IF NOT EXISTS ix_messages_match_time ON match_messages (match_id, created_at);

-- ============================================================================================
-- Migration 002: trust badges (two-sided journey confirmation) + languages spoken.
-- Idempotent like everything above; db.init_db() applies it on every startup.
-- ============================================================================================
DO $$ BEGIN
    CREATE TYPE language_proficiency AS ENUM ('native', 'fluent', 'conversational');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE language_matching AS ENUM ('off', 'prefer_shared', 'require_shared');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cached count of completed journeys; only ever changed inside the confirmation transaction.
ALTER TABLE users ADD COLUMN IF NOT EXISTS journeys_completed_count INT NOT NULL DEFAULT 0
    CHECK (journeys_completed_count >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_matching language_matching NOT NULL DEFAULT 'prefer_shared';
-- Whether matches may see this user's languages (only ever after mutual acceptance, or when shared).
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_languages BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_languages (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language_code   TEXT NOT NULL CHECK (language_code ~ '^[a-z]{2,3}$'),  -- ISO 639-1 (639-3 where none)
    proficiency     language_proficiency NOT NULL,
    PRIMARY KEY (user_id, language_code)
);

-- One row per participant per match per day. The composite FK means only participants can confirm.
CREATE TABLE IF NOT EXISTS journey_confirmations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    journey_date    DATE NOT NULL,
    confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (match_id, user_id, journey_date),
    FOREIGN KEY (match_id, user_id) REFERENCES match_participants(match_id, user_id) ON DELETE CASCADE
);

-- Created only once 2+ distinct participants confirmed the same journey_date.
-- participant_ids is everyone credited so far; each of them got exactly +1 for this (match, day).
CREATE TABLE IF NOT EXISTS journeys_completed (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    journey_date    DATE NOT NULL,
    participant_ids UUID[] NOT NULL CHECK (cardinality(participant_ids) >= 2),
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (match_id, journey_date)
);

CREATE INDEX IF NOT EXISTS ix_user_languages_code ON user_languages (language_code);
CREATE INDEX IF NOT EXISTS ix_confirmations_match_date ON journey_confirmations (match_id, journey_date);
