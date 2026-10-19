# Ghost Commuter: Community Hub backend

Pairs London students who commute home late from campus to Zones 3-5. Claude reads free-text
timetables and preferences and proposes:

- **Walk-home pairs**: two students alighting at the same station, with a platform meeting point and a last-mile plan.
- **Train-carriage study groups**: 3-5 students on the same line segment who share a study topic.

All transit facts in this repo are **MOCK data** for a demo, not verified TfL information.

## Architecture

```
register-profile ─► privacy.redact ─► [1 Data Structurer] ─► users + commute_schedules
find-matches ─► [2 Geographic Router: SQL pre-filter ─► RAG per segment ─► batched route-safety call]
             ─► [3 Safety Guard & Matcher: one call ─► deterministic validation ─► privacy.sanitize_match]
             ─► matches + match_participants ─► response
respond ─► per-user accept/decline ─► contact handles unlock only when every member accepts
```

LangGraph `StateGraph(PipelineState)`; `mode` selects the path (`parse` stops after Node 1).
State: `raw_text, hints, parsed, clarification` (parse) / `user_id, day_of_week, requester,
overlaps, rag_context, matches` (match) / `notes, engines` (list reducers).

Privacy is enforced in code at four points: inbound text is redacted before storage and before any
model call; the model sees only display names, station-level places, the **overlapping** part of
other students' schedules and opaque refs (`C1`, `C2`); gender data stays server-side (the matcher
only gets an `incompatible_pairs` list); every proposal passes `privacy.sanitize_match`, which drops
any match containing a postcode, address, email, phone or handle. Contact handles live in a separate
table that the pipeline never queries.

```
ghost-commuter/
├── schema.sql               # Postgres DDL (idempotent)
├── models.py                # SQLAlchemy 2.0 ORM
├── db.py                    # async engine + schema bootstrap
├── config.py                # env settings + PII-free JSON logging
├── rag_engine.py            # MOCK topology + ChromaDB MOCK safety docs
├── schemas.py               # Pydantic models + tool JSON Schema helper
├── prompts.py               # system prompts + data-only user builders
├── privacy.py               # deterministic PII detection/redaction
├── commute_agent_engine.py  # LangGraph pipeline, rule-based fallback, persistence
├── server.py                # FastAPI app
├── seed_demo.py             # 12 fictional students
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── tests/test_privacy.py
```

## Run it

```bash
cp .env.example .env            # optional: add ANTHROPIC_API_KEY
docker compose up -d            # Postgres + API on :8000 (first start installs deps, ~1-2 min)
docker compose exec api python seed_demo.py
```

Or seed from the host (needs Python 3.11 and `pip install -r requirements.txt`):
`python seed_demo.py` (uses `DATABASE_URL`, default `localhost:5432`).

The seed script prints user IDs and ready-made `curl` commands. Compose ≥ 2.24 is needed for the
optional `.env` file; on older versions, create `.env` or remove the `env_file` block.

Without `ANTHROPIC_API_KEY` the service runs in **deterministic rule-based mode** (logged at
startup, reported as `"mode": "rule_based"` in responses). With a key, Agent 1 and 2 use
`ANTHROPIC_MODEL_FAST` (default `claude-sonnet-5-5`) and Agent 3 uses `ANTHROPIC_MODEL_MATCHER`
(default `claude-opus-5-5`). Any model failure falls back to the rule engine for that step.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | DB status, LLM mode, vector backend |
| POST | `/api/commuter/register-profile` | Creates user + schedules; returns parsed schedule or a clarification question |
| POST | `/api/commuter/users/{user_id}/schedule` | Answer a clarification / add another commute |
| POST | `/api/commuter/find-matches` | `{user_id, day_of_week?}` → `{matches, notes, day_of_week, mode}` |
| POST | `/api/commuter/matches/{match_id}/respond` | `{user_id, response: accept|decline}`; contacts unlock on mutual acceptance |
| GET | `/api/commuter/users/{user_id}/matches` | Every match the user belongs to (invitations, waiting, confirmed); `display_names[0]` is the viewer |
| GET | `/api/commuter/matches/{match_id}/messages?user_id=&after=` | In-app chat for members of a **confirmed** match (409 before); `after` returns only newer messages |
| POST | `/api/commuter/matches/{match_id}/messages` | `{user_id, body}`; body is PII-redacted before storage (members' anonymous names are kept) |
| POST | `/api/commuter/journeys/confirm` | `{user_id, match_id, journey_date?}` → `{status: waiting_for_partner|completed, journeys_completed, tier_label}`. Counts only when 2+ participants of a confirmed match confirm the same day (today or yesterday, Europe/London); idempotent |
| GET | `/api/commuter/users/{user_id}/trust` | `{journeys_completed, tier, tier_label, next_tier_at}`: count and tier only, never dates or partners (auth not implemented) |
| PATCH | `/api/commuter/users/{user_id}/languages` | `{languages?, language_matching?, share_languages?}`; omitted fields are unchanged |
| GET | `/api/commuter/languages` | Supported languages `{code, name}` (ISO 639-1, 639-3 where none exists) |

**Trust badges.** Tiers (thresholds in `config.py`): New 0, First steps 1-4, Regular 5-9, Trusted 10-24,
Commute veteran 25+. A confirmation locks its match row, so counts rise exactly once per match per day
even under concurrent requests. Trust is a soft signal for Agent 3 and never affects ranking.

**Languages.** Opt-in. `language_matching`: `off` (never used or shown), `prefer_shared` (soft signal, no
filtering), `require_shared` (SQL pre-filter on either side). Before mutual accept, matches carry only
`shared_languages` that every member speaks and agreed to show; full lists (`participant_languages`) unlock
after mutual accept for members with `share_languages` on. Languages typed in the commute text are
returned as `detected_languages` and saved only once the student confirms them.

```bash
curl -s -X POST localhost:8000/api/commuter/register-profile -H 'Content-Type: application/json' -d '{
  "uni_affiliation": "UCL", "university_hub": "Euston", "home_station": "Finsbury Park",
  "gender_identity": "woman", "gender_preference": "any",
  "study_interests": ["urban planning"],
  "commute_description": "Thursdays I get the Victoria line from Euston to Finsbury Park around half 10. Prefer well-lit, staffed stations.",
  "contact_handle": "in-app:my-handle"
}'
```

Demo scenarios after seeding:

- **Lunar Hare, `thu`**: walk-home pair with Mossy Otter at Finsbury Park; urban-planning study group on the Victoria line.
- **Velvet Owl, `fri`**: walk-home pair to Acton Town; statistics study group on the Piccadilly line.
- **Granite Puffin, `fri`**: Night Tube pair to Stratford; an Elizabeth-line student is excluded (no night service), and a note says so.

CORS allows `http://localhost:3000`. Errors return `{"error": ...}` without stack traces or echoed
input. Rate limit: `RATE_LIMIT_PER_MINUTE` per client IP (default 30).

## Vector store

`rag_engine.init_vector_store()` is idempotent (fixed IDs + version marker). `EMBEDDING_BACKEND=auto`
tries Chroma's local MiniLM model and falls back to an offline hashing embedder if it cannot load;
each backend uses its own collection. If Chroma is unavailable entirely, retrieval falls back to a
metadata keyword filter over the same documents. Context is de-duplicated and capped at ~1500 chars.

## Tests

```bash
docker compose exec api pytest -q tests/   # DB tests use a separate ghost_commuter_test database
```

Database-backed tests (journeys, languages, privacy) skip automatically when Postgres isn't reachable.
