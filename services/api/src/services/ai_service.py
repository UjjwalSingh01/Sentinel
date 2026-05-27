"""
Sentinel API Service — AI Analysis Service (Google Gemini)

Generates root-cause analysis for incidents using the Gemini API.
Results are cached in Redis for performance.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import structlog

from ..config import GEMINI_API_KEY
from ..db.database import get_raw_pool
from .redis_service import get_ai_cache, set_ai_cache

log: structlog.stdlib.BoundLogger = structlog.get_logger()

_gemini_available = False


def init_gemini() -> None:
    """Initialize the Gemini client if an API key is configured."""
    global _gemini_available

    if not GEMINI_API_KEY:
        log.warning("ai.gemini.not_configured", detail="GEMINI_API_KEY not set, AI features disabled")
        return

    try:
        import google.generativeai as genai  # type: ignore[import-untyped]
        genai.configure(api_key=GEMINI_API_KEY)
        _gemini_available = True
        log.info("ai.gemini.initialized")
    except Exception as exc:
        log.error("ai.gemini.init_failed", error=str(exc))


async def analyze_incident(
    incident_id: str,
    server_id: str,
    metric_type: str,
    severity: str,
    current_value: float,
    threshold: float,
    message: str,
    log_context: Optional[dict[str, Any]] = None,
) -> str:
    """
    Generate an AI-powered root-cause analysis for an incident.
    Returns the analysis text, or an error message if AI is unavailable.

    `log_context` is the eager log snapshot captured at incident creation
    (see services/processor/src/main.py:_build_log_context).
    """
    # Check cache first
    cached = await get_ai_cache(incident_id)
    if cached is not None:
        log.info("ai.analysis.cache_hit", incident_id=incident_id)
        return cached

    if not _gemini_available:
        return "AI analysis is not available. The Gemini API key has not been configured."

    try:
        metrics_context = await _get_recent_metrics(server_id)
        logs_context = _format_log_context(log_context)

        prompt = _build_prompt(
            server_id=server_id,
            metric_type=metric_type,
            severity=severity,
            current_value=current_value,
            threshold=threshold,
            message=message,
            metrics_context=metrics_context,
            logs_context=logs_context,
        )

        import google.generativeai as genai  # type: ignore[import-untyped]
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        analysis = response.text

        await set_ai_cache(incident_id, analysis, ttl=900)

        log.info(
            "ai.analysis.generated",
            incident_id=incident_id,
            has_log_context=log_context is not None,
        )
        return analysis

    except Exception as exc:
        log.error("ai.analysis.failed", incident_id=incident_id, error=str(exc))
        return f"AI analysis failed: {str(exc)}. Please try again later."


def _format_log_context(log_context: Optional[dict[str, Any]]) -> str:
    """
    Render the pre-captured log_context into a token-budgeted prompt section.
    Keeps the top-N templates + a few sample lines each; hard caps at ~3.5k chars.
    """
    if not log_context:
        return "No log evidence was captured for this incident."

    templates = log_context.get("templates") or []
    total_lines = log_context.get("total_lines", 0)
    window_start = log_context.get("window_start", "")
    window_end = log_context.get("window_end", "")

    if not templates:
        return f"Log window {window_start} → {window_end}: 0 WARN/ERROR/FATAL lines."

    out: list[str] = [
        f"Captured {total_lines} WARN/ERROR/FATAL lines between {window_start} and {window_end}.",
        "Top patterns (count × normalized template):",
    ]
    budget = 3500
    used = sum(len(line) for line in out)
    samples_per_template = 2

    for t in templates[:10]:
        header = f"  [x{t.get('count', 0)} {t.get('level', '?')}] {t.get('template', '')}"
        if used + len(header) > budget:
            break
        out.append(header)
        used += len(header)
        for sample in (t.get("samples") or [])[:samples_per_template]:
            line = f"      e.g. {sample}"
            if used + len(line) > budget:
                break
            out.append(line)
            used += len(line)

    return "\n".join(out)


async def _get_recent_metrics(server_id: str) -> str:
    """Fetch the last 5 minutes of metrics for a server."""
    try:
        pool = await get_raw_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT time, cpu, memory, disk, latency_ms
                FROM metrics
                WHERE server_id = $1
                  AND time > $2
                ORDER BY time DESC
                LIMIT 100
                """,
                server_id,
                datetime.now(timezone.utc) - timedelta(minutes=5),
            )

            if not rows:
                return "No recent metrics available."

            lines: list[str] = []
            for row in rows[:20]:  # Limit to 20 most recent for prompt size
                lines.append(
                    f"  {row['time'].isoformat()}: CPU={row['cpu']:.1f}%, "
                    f"Mem={row['memory']:.1f}%, Disk={row['disk']:.1f}%, "
                    f"Latency={row['latency_ms']:.1f}ms"
                )
            return "\n".join(lines)

    except Exception as exc:
        log.error("ai.metrics_fetch.failed", error=str(exc))
        return "Unable to fetch recent metrics."


def _build_prompt(
    server_id: str,
    metric_type: str,
    severity: str,
    current_value: float,
    threshold: float,
    message: str,
    metrics_context: str,
    logs_context: str,
) -> str:
    """Build a structured prompt for Gemini root-cause analysis."""
    return f"""You are an expert Site Reliability Engineer analyzing an infrastructure incident.

INCIDENT DETAILS:
- Server: {server_id}
- Metric: {metric_type}
- Severity: {severity.upper()}
- Current Value: {current_value}
- Threshold: {threshold}
- Alert Message: {message}

RECENT METRICS (last 5 minutes, newest first):
{metrics_context}

LOG EVIDENCE (correlated WARN/ERROR/FATAL lines around the incident window,
deduped to templates with occurrence counts):
{logs_context}

Please provide:

1. PROBABLE ROOT CAUSE
   Analyze the metric pattern AND the log evidence together. Cite specific log
   templates by name when they support a hypothesis. If the logs and metrics
   point at different things, say so.

2. IMPACT ASSESSMENT
   What is the likely impact on the system and end users?

3. INVESTIGATION STEPS
   Provide 4-6 specific, actionable steps the on-call engineer should take
   to investigate and diagnose this issue. Include specific commands or
   queries where applicable.

4. RECOMMENDED REMEDIATION
   Suggest immediate actions to resolve or mitigate the issue, as well as
   longer-term preventive measures.

Format your response in clean markdown with clear section headers. Be concise
but thorough. Do not use emojis."""
