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
INTERVAL_SECONDS: Final[float] = 3.0
SPIKE_PROBABILITY: Final[float] = 0.15  # 15% chance per tick per server to START a spike

# ---------------------------------------------------------------------------
# Simulated servers
# ---------------------------------------------------------------------------
SERVERS: Final[list[dict[str, str]]] = [
    {"id": "prod-web-01", "role": "web"},
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


async def run_simulator() -> None:
    """Main simulation loop."""
    simulators = [ServerSimulator(s["id"], s["role"]) for s in SERVERS]

    log.info("simulator.starting", servers=len(simulators), interval=INTERVAL_SECONDS)

    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
        while True:
            tasks: list[asyncio.Task[None]] = []
            for sim in simulators:
                metrics = sim.generate_metrics()
                tasks.append(asyncio.create_task(_send_metrics(client, metrics)))

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


if __name__ == "__main__":
    asyncio.run(run_simulator())
