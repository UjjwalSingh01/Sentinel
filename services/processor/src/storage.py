"""
Sentinel Stream Processor — TimescaleDB Storage

Manages the metrics hypertable and writes time-series data.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import asyncpg
import structlog

from .config import ASYNCPG_DSN

log: structlog.stdlib.BoundLogger = structlog.get_logger()

_pool: Optional[asyncpg.Pool] = None


async def init_storage() -> None:
    """Initialize the connection pool and ensure the schema exists."""
    global _pool
    _pool = await asyncpg.create_pool(dsn=ASYNCPG_DSN, min_size=2, max_size=10)
    log.info("storage.pool.created")

    async with _pool.acquire() as conn:
        # Ensure TimescaleDB extension
        await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")

        # Create metrics hypertable
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS metrics (
                time        TIMESTAMPTZ NOT NULL,
                server_id   TEXT        NOT NULL,
                cpu         DOUBLE PRECISION,
                memory      DOUBLE PRECISION,
                disk        DOUBLE PRECISION,
                latency_ms  DOUBLE PRECISION
            );
        """)

        # Convert to hypertable (idempotent with if_not_exists)
        await conn.execute("""
            SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);
        """)

        # Create index for server_id queries
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_metrics_server_id_time
            ON metrics (server_id, time DESC);
        """)

        # Ensure incidents table exists (processor creates incidents directly)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id          TEXT PRIMARY KEY,
                server_id   TEXT NOT NULL,
                metric_type TEXT NOT NULL,
                severity    TEXT NOT NULL,
                current_value DOUBLE PRECISION NOT NULL,
                threshold   DOUBLE PRECISION NOT NULL,
                message     TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'open',
                ai_analysis TEXT,
                assignee_id TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                acknowledged_at TIMESTAMPTZ,
                resolved_at TIMESTAMPTZ
            );
        """)

        # Create users table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              TEXT PRIMARY KEY,
                email           TEXT UNIQUE NOT NULL,
                name            TEXT NOT NULL,
                role            TEXT NOT NULL DEFAULT 'engineer',
                hashed_password TEXT NOT NULL,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # Add log_context + rule_id columns to incidents (idempotent)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS log_context JSONB;
        """)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS rule_id TEXT;
        """)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS rule_name TEXT;
        """)
        # Phase 3: dedup + tracing
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS parent_incident_id TEXT;
        """)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT;
        """)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS exemplar_trace_ids TEXT[];
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_incidents_dedup
            ON incidents (dedup_fingerprint, created_at DESC)
            WHERE parent_incident_id IS NULL;
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_incidents_parent
            ON incidents (parent_incident_id);
        """)

        # Spans hypertable (Phase 3 §2.1)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS spans (
                time            TIMESTAMPTZ NOT NULL,
                trace_id        TEXT NOT NULL,
                span_id         TEXT NOT NULL,
                parent_span_id  TEXT,
                server_id       TEXT NOT NULL,
                service         TEXT,
                name            TEXT NOT NULL,
                duration_ms     DOUBLE PRECISION NOT NULL,
                status          TEXT,
                attributes      JSONB
            );
        """)
        await conn.execute("""
            SELECT create_hypertable('spans', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_spans_server_time
            ON spans (server_id, time DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_spans_trace_id
            ON spans (trace_id);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_spans_slow
            ON spans (server_id, time DESC, duration_ms DESC)
            WHERE parent_span_id IS NULL;
        """)

        # Alert rules table (Phase 2: DB-driven rule engine)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS alert_rules (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                type        TEXT NOT NULL,
                severity    TEXT NOT NULL,
                expression  JSONB NOT NULL,
                enabled     BOOLEAN NOT NULL DEFAULT TRUE,
                runbook_url TEXT,
                created_by  TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # Phase 4: dashboards + saved filters
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS dashboards (
                id          TEXT PRIMARY KEY,
                owner_id    TEXT NOT NULL,
                name        TEXT NOT NULL,
                layout      JSONB NOT NULL DEFAULT '[]'::jsonb,
                is_default  BOOLEAN NOT NULL DEFAULT FALSE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_dashboards_owner
            ON dashboards (owner_id);
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS saved_filters (
                id          TEXT PRIMARY KEY,
                owner_id    TEXT NOT NULL,
                name        TEXT NOT NULL,
                scope       TEXT NOT NULL,
                filter      JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_saved_filters_owner_scope
            ON saved_filters (owner_id, scope);
        """)

        # Create logs hypertable for log pipeline
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS logs (
                time        TIMESTAMPTZ NOT NULL,
                server_id   TEXT NOT NULL,
                service     TEXT,
                level       TEXT NOT NULL,
                message     TEXT NOT NULL,
                fields      JSONB,
                trace_id    TEXT,
                search_vec  TSVECTOR
            );
        """)

        await conn.execute("""
            SELECT create_hypertable('logs', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');
        """)

        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_server_id_time
            ON logs (server_id, time DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_level_time
            ON logs (level, time DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_search
            ON logs USING GIN (search_vec);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_fields
            ON logs USING GIN (fields);
        """)

        log.info("storage.schema.initialized")


async def close_storage() -> None:
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        log.info("storage.pool.closed")


def is_storage_ready() -> bool:
    """True once init_storage() has finished creating the connection pool."""
    return _pool is not None


async def write_metric(
    timestamp: datetime,
    server_id: str,
    cpu: float,
    memory: float,
    disk: float,
    latency_ms: float,
) -> None:
    """Write a single metric point to TimescaleDB."""
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO metrics (time, server_id, cpu, memory, disk, latency_ms)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            timestamp, server_id, cpu, memory, disk, latency_ms,
        )


async def create_incident(
    incident_id: str,
    server_id: str,
    metric_type: str,
    severity: str,
    current_value: float,
    threshold: float,
    message: str,
    log_context: Optional[dict[str, Any]] = None,
    rule_id: Optional[str] = None,
    rule_name: Optional[str] = None,
    parent_incident_id: Optional[str] = None,
    dedup_fingerprint: Optional[str] = None,
    exemplar_trace_ids: Optional[list[str]] = None,
) -> None:
    """Create an incident record in PostgreSQL with optional pre-captured log context."""
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO incidents
                (id, server_id, metric_type, severity, current_value, threshold,
                 message, status, log_context, rule_id, rule_name,
                 parent_incident_id, dedup_fingerprint, exemplar_trace_ids)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8::jsonb, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO NOTHING
            """,
            incident_id, server_id, metric_type, severity, current_value, threshold, message,
            json.dumps(log_context) if log_context is not None else None,
            rule_id, rule_name,
            parent_incident_id, dedup_fingerprint, exemplar_trace_ids,
        )
    log.info(
        "storage.incident.created",
        incident_id=incident_id,
        server_id=server_id,
        severity=severity,
        rule_id=rule_id,
        parent_incident_id=parent_incident_id,
        exemplars=len(exemplar_trace_ids) if exemplar_trace_ids else 0,
        has_log_context=log_context is not None,
    )


async def find_parent_incident(
    rule_id: str,
    dedup_fingerprint: str,
    within_seconds: int = 60,
) -> Optional[str]:
    """
    Look up an existing parent incident matching this fingerprint that opened
    within the last `within_seconds`. Returns the parent incident id or None.
    """
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            SELECT id FROM incidents
            WHERE dedup_fingerprint = $1
              AND rule_id = $2
              AND parent_incident_id IS NULL
              AND created_at > NOW() - INTERVAL '{int(within_seconds)} seconds'
            ORDER BY created_at ASC
            LIMIT 1
            """,
            dedup_fingerprint, rule_id,
        )
    return row["id"] if row else None


async def pick_exemplar_traces(
    server_id: str,
    anchor: datetime,
    before_s: int = 60,
    after_s: int = 30,
    limit: int = 2,
) -> list[str]:
    """
    Return the trace_ids of the top-`limit` slowest root spans on `server_id`
    in the [anchor-before_s, anchor+after_s] window.
    """
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    start = anchor - timedelta(seconds=before_s)
    end = anchor + timedelta(seconds=after_s)
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT trace_id
            FROM spans
            WHERE server_id = $1
              AND time BETWEEN $2 AND $3
              AND parent_span_id IS NULL
            ORDER BY duration_ms DESC
            LIMIT $4
            """,
            server_id, start, end, int(limit),
        )
    return [r["trace_id"] for r in rows]


# ---------------------------------------------------------------------------
# Alert rule storage (Phase 2)
# ---------------------------------------------------------------------------
DEFAULT_RULES: list[dict[str, Any]] = [
    {
        "id": "rule-cpu-critical",
        "name": "CPU critical (>90%)",
        "type": "metric",
        "severity": "critical",
        "expression": {"type": "metric", "metric": "cpu", "op": ">", "value": 90.0, "window_s": 15},
    },
    {
        "id": "rule-memory-critical",
        "name": "Memory critical (>95%)",
        "type": "metric",
        "severity": "critical",
        "expression": {"type": "metric", "metric": "memory", "op": ">", "value": 95.0, "window_s": 15},
    },
    {
        "id": "rule-cpu-warning",
        "name": "CPU warning (>80%)",
        "type": "metric",
        "severity": "warning",
        "expression": {"type": "metric", "metric": "cpu", "op": ">", "value": 80.0, "window_s": 20},
    },
    {
        "id": "rule-latency-warning",
        "name": "Request latency warning (>800ms)",
        "type": "metric",
        "severity": "warning",
        "expression": {"type": "metric", "metric": "latency_ms", "op": ">", "value": 800.0, "window_s": 10},
    },
    # §1.6: sustained WARN/ERROR/FATAL log rate, excluding user-caused noise
    {
        "id": "rule-log-error-rate",
        "name": "Sustained error log rate",
        "type": "log",
        "severity": "warning",
        "expression": {
            "type": "log",
            "levels": ["WARN", "WARNING", "ERROR", "FATAL"],
            "window_s": 60,
            "rate_per_min": 5,
            "exclude_patterns": [
                r"invalid credentials",
                r"wrong password",
                r"HTTP 4[0-9][0-9]",
                r"unauthorized request",
                r"forbidden",
            ],
        },
    },
    # §3.2: composite — CPU pressure AND high error rate
    {
        "id": "rule-composite-cpu-and-errors",
        "name": "CPU pressure with errors",
        "type": "composite",
        "severity": "critical",
        "expression": {
            "type": "and",
            "children": [
                {"type": "metric", "metric": "cpu", "op": ">", "value": 80.0, "window_s": 15},
                {
                    "type": "log",
                    "levels": ["ERROR", "FATAL"],
                    "window_s": 60,
                    "rate_per_min": 5,
                    "exclude_patterns": [r"HTTP 4[0-9][0-9]"],
                },
            ],
        },
    },
]


async def load_alert_rules() -> list[dict[str, Any]]:
    """Load all enabled rules from the alert_rules table as plain dicts."""
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, type, severity, expression, enabled, runbook_url
            FROM alert_rules
            ORDER BY created_at ASC
            """
        )

    out: list[dict[str, Any]] = []
    for r in rows:
        expr = r["expression"]
        if isinstance(expr, str):
            expr = json.loads(expr)
        out.append({
            "id": r["id"],
            "name": r["name"],
            "type": r["type"],
            "severity": r["severity"],
            "expression": expr,
            "enabled": r["enabled"],
            "runbook_url": r["runbook_url"],
        })
    return out


async def seed_default_rules() -> int:
    """Insert DEFAULT_RULES into alert_rules if the table is empty. Returns rows inserted."""
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        existing = await conn.fetchval("SELECT COUNT(*) FROM alert_rules")
        if existing and existing > 0:
            log.info("storage.rules.seed_skipped", existing=existing)
            return 0

        for rule in DEFAULT_RULES:
            await conn.execute(
                """
                INSERT INTO alert_rules (id, name, type, severity, expression, enabled, created_by)
                VALUES ($1, $2, $3, $4, $5::jsonb, TRUE, 'system')
                ON CONFLICT (id) DO NOTHING
                """,
                rule["id"], rule["name"], rule["type"], rule["severity"],
                json.dumps(rule["expression"]),
            )
        log.info("storage.rules.seeded", count=len(DEFAULT_RULES))
        return len(DEFAULT_RULES)


async def write_log_batch(records: list[dict[str, Any]]) -> int:
    """
    Write a batch of log records to the logs hypertable.
    Returns the number of rows written. Skips malformed records silently.
    """
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")
    if not records:
        return 0

    rows: list[tuple[Any, ...]] = []
    for rec in records:
        try:
            ts = rec["timestamp"]
            if isinstance(ts, str):
                ts_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            else:
                ts_dt = ts
            if ts_dt.tzinfo is None:
                ts_dt = ts_dt.replace(tzinfo=timezone.utc)

            rows.append((
                ts_dt,
                str(rec["server_id"]),
                rec.get("service"),
                str(rec.get("level", "INFO")).upper(),
                str(rec.get("message", ""))[:8192],
                json.dumps(rec["fields"]) if rec.get("fields") else None,
                rec.get("trace_id"),
            ))
        except (KeyError, TypeError, ValueError) as exc:
            log.warning("storage.log.skip", error=str(exc), record=rec)

    if not rows:
        return 0

    async with _pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO logs (time, server_id, service, level, message, fields, trace_id, search_vec)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7,
                    to_tsvector('english', COALESCE($3, '') || ' ' || $5))
            """,
            rows,
        )

    return len(rows)


async def fetch_log_snapshot(
    server_id: str,
    start: datetime,
    end: datetime,
    levels: tuple[str, ...] = ("WARN", "WARNING", "ERROR", "FATAL"),
    limit: int = 500,
) -> list[dict[str, Any]]:
    """
    Fetch raw log lines for an incident time window.
    Returns at most `limit` lines, ordered oldest-first.
    """
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT time, server_id, service, level, message, fields, trace_id
            FROM logs
            WHERE server_id = $1
              AND time BETWEEN $2 AND $3
              AND level = ANY($4::text[])
            ORDER BY time ASC
            LIMIT $5
            """,
            server_id, start, end, list(levels), limit,
        )
    return [
        {
            "time": r["time"].isoformat(),
            "server_id": r["server_id"],
            "service": r["service"],
            "level": r["level"],
            "message": r["message"],
            "fields": r["fields"],
            "trace_id": r["trace_id"],
        }
        for r in rows
    ]
