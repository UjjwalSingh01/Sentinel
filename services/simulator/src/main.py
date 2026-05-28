"""
Sentinel Simulator Service

Generates realistic infrastructure metrics for 5 simulated servers
and pushes them to the Ingestion Service at regular intervals.
Occasionally injects metric spikes to trigger warning/critical alerts.
"""

import asyncio
import logging
import math
import os
import random
import time
from datetime import datetime, timezone
from typing import Final

import httpx
import structlog

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    ),
)

log: structlog.stdlib.BoundLogger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
INGESTION_URL: Final[str] = os.getenv("INGESTION_URL", "http://ingestion:8001")
INGEST_ENDPOINT: Final[str] = f"{INGESTION_URL}/api/ingest"
LOG_INGESTION_URL: Final[str] = os.getenv("LOG_INGESTION_URL", "http://log-ingestion:8003")
LOG_INGEST_ENDPOINT: Final[str] = f"{LOG_INGESTION_URL}/api/logs"
API_URL: Final[str] = os.getenv("API_URL", "http://api:8000")
SPAN_INGEST_ENDPOINT: Final[str] = f"{API_URL}/api/spans"
INTERVAL_SECONDS: Final[float] = 3.0
SPIKE_PROBABILITY: Final[float] = 0.15  # 15% chance per tick per server to START a spike

# ---------------------------------------------------------------------------
# Simulated servers
# ---------------------------------------------------------------------------
SERVERS: Final[list[dict[str, str]]] = [
    {"id": "prod-web-01", "role": "web"},
    {"id": "prod-web-02", "role": "web"},
    {"id": "prod-api-01", "role": "api"},
    {"id": "prod-api-02", "role": "api"},
    {"id": "prod-worker-03", "role": "worker"},
    {"id": "staging-db-01", "role": "database"},
    {"id": "staging-cache-01", "role": "cache"},
]


class ServerSimulator:
    """Generates realistic metric data for a single server."""

    def __init__(self, server_id: str, role: str) -> None:
        self.server_id = server_id
        self.role = role
        self._tick = 0
        # Baseline values vary by role
        self._baselines = self._get_baselines(role)
        # Sticky spike state: when a spike starts, it persists for several ticks
        self._active_spike: str | None = None
        self._spike_remaining: int = 0

    @staticmethod
    def _get_baselines(role: str) -> dict[str, float]:
        baselines: dict[str, dict[str, float]] = {
            "web": {"cpu": 45.0, "memory": 55.0, "disk": 40.0, "latency": 120.0},
            "api": {"cpu": 50.0, "memory": 60.0, "disk": 35.0, "latency": 200.0},
            "worker": {"cpu": 65.0, "memory": 70.0, "disk": 50.0, "latency": 50.0},
            "database": {"cpu": 40.0, "memory": 75.0, "disk": 65.0, "latency": 15.0},
            "cache": {"cpu": 30.0, "memory": 80.0, "disk": 20.0, "latency": 5.0},
        }
        return baselines.get(role, baselines["web"])

    def generate_metrics(self) -> dict[str, object]:
        """Generate a single metric snapshot, occasionally injecting spikes."""
        self._tick += 1

        # Manage spike lifecycle: start new spike or continue existing one
        if self._spike_remaining > 0:
            self._spike_remaining -= 1
            if self._spike_remaining == 0:
                self._active_spike = None
        elif random.random() < SPIKE_PROBABILITY:
            # Start a new spike that lasts 3-8 ticks (9-24 seconds at 3s interval)
            self._active_spike = random.choice(["cpu", "memory", "latency"])
            self._spike_remaining = random.randint(3, 8)

        # Sinusoidal drift to simulate organic load variation
        drift = math.sin(self._tick * 0.1) * 5

        cpu = self._baselines["cpu"] + drift + random.gauss(0, 3)
        memory = self._baselines["memory"] + drift * 0.5 + random.gauss(0, 2)
        disk = self._baselines["disk"] + (self._tick * 0.001) + random.gauss(0, 0.5)
        latency = self._baselines["latency"] + abs(drift * 4) + random.gauss(0, 10)

        # Apply sustained spike
        if self._active_spike == "cpu":
            cpu = random.uniform(88, 98)
        elif self._active_spike == "memory":
            memory = random.uniform(93, 99)
        elif self._active_spike == "latency":
            latency = random.uniform(800, 2000)

        # Clamp values
        cpu = max(0.0, min(100.0, cpu))
        memory = max(0.0, min(100.0, memory))
        disk = max(0.0, min(100.0, disk))
        latency = max(0.0, latency)

        return {
            "server_id": self.server_id,
            "cpu": round(cpu, 2),
            "memory": round(memory, 2),
            "disk": round(disk, 2),
            "latency_ms": round(latency, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def generate_traces(self) -> list[dict[str, object]]:
        """
        Emit 1-2 traces per tick: a root request span + 2-3 child spans
        (auth, db query, downstream call). Span durations correlate with
        the metric spike state so exemplar selection at incident time
        surfaces meaningfully slow traces.
        """
        traces: list[dict[str, object]] = []
        service_name = f"{self.role}-svc"
        now = datetime.now(timezone.utc)

        for _ in range(random.randint(1, 2)):
            trace_id = _hex_id(16)
            root_span_id = _hex_id(8)

            # Latency scaling: 1× normally, 6-15× during a latency spike, 2-4× during cpu/memory spike
            if self._active_spike == "latency":
                latency_mult = random.uniform(6.0, 15.0)
            elif self._active_spike in ("cpu", "memory"):
                latency_mult = random.uniform(2.0, 4.0)
            else:
                latency_mult = 1.0

            child_specs: list[tuple[str, float]] = [
                ("auth.verify_token", random.uniform(5, 25)),
                ("db.query", random.uniform(15, 60) * latency_mult),
                ("downstream.payment_api", random.uniform(40, 120) * latency_mult),
            ]
            # Keep only some children per request to vary trace shape
            random.shuffle(child_specs)
            child_specs = child_specs[: random.randint(2, 3)]

            children_total_ms = sum(d for _, d in child_specs)
            root_duration_ms = children_total_ms + random.uniform(5, 20)
            root_status = "OK" if latency_mult < 2.5 else "ERROR" if random.random() < 0.4 else "OK"

            traces.append({
                "trace_id": trace_id,
                "span_id": root_span_id,
                "parent_span_id": None,
                "server_id": self.server_id,
                "service": service_name,
                "name": random.choice([
                    "GET /api/orders",
                    "POST /api/login",
                    "PUT /api/users/{id}",
                    "GET /api/health",
                ]),
                "start": now.isoformat(),
                "duration_ms": round(root_duration_ms, 2),
                "status": root_status,
                "attributes": {"http.status": 200 if root_status == "OK" else 504},
            })

            for name, dur in child_specs:
                traces.append({
                    "trace_id": trace_id,
                    "span_id": _hex_id(8),
                    "parent_span_id": root_span_id,
                    "server_id": self.server_id,
                    "service": service_name,
                    "name": name,
                    "start": now.isoformat(),
                    "duration_ms": round(dur, 2),
                    "status": "OK" if dur < 200 else "ERROR",
                    "attributes": {"db.statement": "SELECT ..."} if "db" in name else None,
                })

        return traces

    def generate_logs(self) -> list[dict[str, object]]:
        """
        Emit a small batch of correlated log lines per tick. During a spike,
        emit louder ERROR/WARN traffic so the log pipeline can surface
        incident context.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        records: list[dict[str, object]] = []
        service_name = f"{self.role}-svc"

        # Baseline: 1-2 INFO lines per tick
        for _ in range(random.randint(1, 2)):
            records.append({
                "server_id": self.server_id,
                "service": service_name,
                "level": "INFO",
                "message": _baseline_info_line(self.role),
                "timestamp": now_iso,
                "fields": {"request_id": _fake_request_id()},
            })

        # Occasional benign warnings (slow query, retry)
        if random.random() < 0.1:
            records.append({
                "server_id": self.server_id,
                "service": service_name,
                "level": "WARN",
                "message": random.choice([
                    f"slow query: SELECT ... took {random.randint(800, 1500)}ms",
                    "rate limit threshold approaching for client api_v2",
                    f"connection pool at {random.randint(70, 85)}% capacity",
                ]),
                "timestamp": now_iso,
                "fields": {"request_id": _fake_request_id()},
            })

        # Occasional user-caused noise (should NOT trigger §1.6 alerts)
        if random.random() < 0.15:
            records.append({
                "server_id": self.server_id,
                "service": service_name,
                "level": "WARN",
                "message": random.choice([
                    "invalid credentials for user noreply@example.com",
                    "HTTP 404 GET /favicon.ico",
                    "HTTP 401 unauthorized request",
                ]),
                "timestamp": now_iso,
                "fields": {"request_id": _fake_request_id()},
            })

        # Spike: emit a burst of ERROR lines correlated with the active spike
        if self._active_spike is not None:
            for _ in range(random.randint(3, 6)):
                records.append({
                    "server_id": self.server_id,
                    "service": service_name,
                    "level": "ERROR",
                    "message": _spike_error_line(self._active_spike),
                    "timestamp": now_iso,
                    "fields": {
                        "request_id": _fake_request_id(),
                        "spike_kind": self._active_spike,
                    },
                })

        return records


async def run_simulator() -> None:
    """Main simulation loop."""
    simulators = [ServerSimulator(s["id"], s["role"]) for s in SERVERS]

    log.info("simulator.starting", servers=len(simulators), interval=INTERVAL_SECONDS)

    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        while True:
            tasks: list[asyncio.Task[None]] = []
            batched_logs: list[dict[str, object]] = []
            batched_spans: list[dict[str, object]] = []

            for sim in simulators:
                metrics = sim.generate_metrics()
                tasks.append(asyncio.create_task(_send_metrics(client, metrics)))
                batched_logs.extend(sim.generate_logs())
                batched_spans.extend(sim.generate_traces())

            if batched_logs:
                tasks.append(asyncio.create_task(_send_logs(client, batched_logs)))
            if batched_spans:
                tasks.append(asyncio.create_task(_send_spans(client, batched_spans)))

            await asyncio.gather(*tasks, return_exceptions=True)
            await asyncio.sleep(INTERVAL_SECONDS)


async def _send_metrics(client: httpx.AsyncClient, metrics: dict[str, object]) -> None:
    """Send a single metric payload to the ingestion service."""
    try:
        response = await client.post(INGEST_ENDPOINT, json=metrics)
        if response.status_code == 200:
            log.debug(
                "metric.sent",
                server_id=metrics["server_id"],
                cpu=metrics["cpu"],
                memory=metrics["memory"],
            )
        else:
            log.warning(
                "metric.rejected",
                server_id=metrics["server_id"],
                status=response.status_code,
                body=response.text[:200],
            )
    except httpx.RequestError as exc:
        log.error("metric.send_failed", server_id=metrics["server_id"], error=str(exc))


async def _send_logs(client: httpx.AsyncClient, records: list[dict[str, object]]) -> None:
    """Send a batch of log records to the log-ingestion service."""
    try:
        response = await client.post(LOG_INGEST_ENDPOINT, json={"records": records})
        if response.status_code != 200:
            log.warning(
                "log.rejected",
                status=response.status_code,
                count=len(records),
                body=response.text[:200],
            )
    except httpx.RequestError as exc:
        log.error("log.send_failed", error=str(exc), count=len(records))


async def _send_spans(client: httpx.AsyncClient, spans: list[dict[str, object]]) -> None:
    """Send a batch of trace spans to the api span ingest endpoint."""
    try:
        response = await client.post(SPAN_INGEST_ENDPOINT, json={"spans": spans})
        if response.status_code != 200:
            log.warning(
                "span.rejected",
                status=response.status_code,
                count=len(spans),
                body=response.text[:200],
            )
    except httpx.RequestError as exc:
        log.error("span.send_failed", error=str(exc), count=len(spans))


def _hex_id(n_bytes: int) -> str:
    """Hex id of `n_bytes` bytes (so 8 bytes -> 16 hex chars)."""
    return "".join(random.choice("0123456789abcdef") for _ in range(n_bytes * 2))


# ---------------------------------------------------------------------------
# Log content helpers
# ---------------------------------------------------------------------------
def _fake_request_id() -> str:
    return "".join(random.choice("0123456789abcdef") for _ in range(8))


_INFO_LINES_BY_ROLE: Final[dict[str, list[str]]] = {
    "web": [
        "GET /api/users handled in {dur}ms",
        "POST /api/login handled in {dur}ms",
        "static asset cache hit /assets/app.js",
    ],
    "api": [
        "POST /v2/orders handled in {dur}ms",
        "GET /v2/orders/{n} handled in {dur}ms",
        "auth token validated for client api_v2",
    ],
    "worker": [
        "job {n} completed in {dur}ms",
        "queue depth {n}",
        "consumed message offset {n}",
    ],
    "database": [
        "vacuum analyze completed on table sessions",
        "executed prepared statement pq_{n} in {dur}ms",
        "checkpoint complete; flushed {n} buffers",
    ],
    "cache": [
        "GET key user:{n} hit",
        "SET key session:{n} expires {n}s",
        "evicted {n} keys",
    ],
}


def _baseline_info_line(role: str) -> str:
    template = random.choice(_INFO_LINES_BY_ROLE.get(role, _INFO_LINES_BY_ROLE["web"]))
    return template.format(
        n=random.randint(10, 9999),
        dur=random.randint(5, 120),
    )


def _spike_error_line(spike_kind: str) -> str:
    """Generate ERROR lines that align with the metric spike kind."""
    if spike_kind == "cpu":
        return random.choice([
            f"worker pool exhausted: {random.randint(40, 60)} pending tasks",
            f"event loop lag detected: {random.randint(400, 900)}ms",
            "thread pool queue full, dropping background tasks",
        ])
    if spike_kind == "memory":
        return random.choice([
            "OutOfMemoryError: heap exhausted while allocating buffer",
            f"GC pause exceeded {random.randint(1000, 3000)}ms threshold",
            "process killed by OOM-killer (signal 9)",
        ])
    if spike_kind == "latency":
        ip = f"10.0.1.{random.randint(2, 50)}"
        return random.choice([
            f"upstream timed out (110: Connection timed out) talking to {ip}:5432",
            f"connection refused: {ip}:5432",
            f"slow downstream call: GET https://payments.internal/charge took {random.randint(2000, 5000)}ms",
        ])
    return "unexpected error condition"


if __name__ == "__main__":
    asyncio.run(run_simulator())
