"""Environment-driven configuration and structured (JSON, PII-free) logging."""
from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass, field


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", "").strip())
    # Agent 3 (Safety Guard & Matcher)
    model_matcher: str = field(default_factory=lambda: _env("ANTHROPIC_MODEL_MATCHER", "claude-opus-5-5"))
    # Agents 1 (Data Structurer) and 2 (Geographic Router)
    model_fast: str = field(default_factory=lambda: _env("ANTHROPIC_MODEL_FAST", "claude-sonnet-5-5"))
    llm_timeout_seconds: int = field(default_factory=lambda: _env_int("LLM_TIMEOUT_SECONDS", 60))
    llm_max_tokens: int = field(default_factory=lambda: _env_int("LLM_MAX_TOKENS", 4096))

    database_url: str = field(
        default_factory=lambda: _env(
            "DATABASE_URL", "postgresql+asyncpg://ghost:ghost@localhost:5432/ghost_commuter"
        )
    )
    chroma_path: str = field(default_factory=lambda: _env("CHROMA_PATH", "./.chroma"))
    # auto = try the local MiniLM model, fall back to the offline hashing embedder.
    embedding_backend: str = field(default_factory=lambda: _env("EMBEDDING_BACKEND", "auto"))

    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip() for o in _env("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
        )
    )
    rate_limit_per_minute: int = field(default_factory=lambda: _env_int("RATE_LIMIT_PER_MINUTE", 30))
    log_level: str = field(default_factory=lambda: _env("LOG_LEVEL", "INFO"))
    timezone: str = field(default_factory=lambda: _env("APP_TIMEZONE", "Europe/London"))

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def llm_mode(self) -> str:
        return "anthropic" if self.llm_enabled else "rule_based"


settings = Settings()

# Trust badge tiers, ascending: (minimum journeys completed, tier key, public label).
# A journey counts only once at least two participants of the match confirmed the same day.
TRUST_TIERS: tuple[tuple[int, str, str], ...] = (
    (0, "new", "New"),
    (1, "first_steps", "First steps"),
    (5, "regular", "Regular"),
    (10, "trusted", "Trusted"),
    (25, "commute_veteran", "Commute veteran"),
)

# How far back a journey can be confirmed (the date must also not be in the future).
JOURNEY_CONFIRM_WINDOW_HOURS = 24


# Keys we allow into log records. Anything else passed via `extra=` is dropped,
# so free text, display names, stations or contact handles cannot leak into logs.
_SAFE_LOG_KEYS = {
    "event",
    "request_id",
    "user_id",
    "match_id",
    "mode",
    "model",
    "agent",
    "attempt",
    "count",
    "candidates",
    "matches",
    "dropped",
    "status_code",
    "path",
    "method",
    "duration_ms",
    "confidence",
    "day_of_week",
    "reason_code",
    "finding_kinds",
    "backend",
    "documents",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in _SAFE_LOG_KEYS:
            if key in record.__dict__:
                payload[key] = record.__dict__[key]
        if record.exc_info:
            # Exception type only: tracebacks can embed request data.
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        return json.dumps(payload, default=str)


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(settings.log_level.upper())
    # Third-party loggers can echo request bodies or URLs; keep them quiet.
    for noisy in ("httpx", "httpcore", "anthropic", "chromadb", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
