"""
Sentinel Stream Processor — Alert Rules Engine

Evaluates sliding window metrics against threshold rules
and determines when to fire alerts.
"""

import time
from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import structlog

log: structlog.stdlib.BoundLogger = structlog.get_logger()


class Severity(str, Enum):
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class AlertRule:
    """Defines a threshold-based alert rule."""

    metric: str
    threshold: float
    severity: Severity
    sustained_seconds: float
    message_template: str


# ---------------------------------------------------------------------------
# Rule definitions
# ---------------------------------------------------------------------------
RULES: list[AlertRule] = [
    AlertRule(
        metric="cpu",
        threshold=90.0,
        severity=Severity.CRITICAL,
        sustained_seconds=15.0,
        message_template="CPU usage at {value:.1f}% exceeds critical threshold of {threshold}%",
    ),
    AlertRule(
        metric="memory",
        threshold=95.0,
        severity=Severity.CRITICAL,
        sustained_seconds=15.0,
        message_template="Memory usage at {value:.1f}% exceeds critical threshold of {threshold}%",
    ),
    AlertRule(
        metric="cpu",
        threshold=80.0,
        severity=Severity.WARNING,
        sustained_seconds=20.0,
        message_template="CPU usage at {value:.1f}% exceeds warning threshold of {threshold}%",
    ),
    AlertRule(
        metric="latency_ms",
        threshold=800.0,
        severity=Severity.WARNING,
        sustained_seconds=10.0,
        message_template="Request latency at {value:.1f}ms exceeds warning threshold of {threshold}ms",
    ),
]


@dataclass
class FiredAlert:
    """Represents a triggered alert."""

    server_id: str
    metric_type: str
    severity: Severity
    current_value: float
    threshold: float
    message: str


class SlidingWindowEvaluator:
    """
    Maintains a sliding window of metric values per server per metric,
    and evaluates threshold rules for sustained breaches.
    """

    def __init__(self, window_seconds: float = 30.0) -> None:
        self._window_seconds = window_seconds
        # { (server_id, metric) -> deque of (timestamp, value) }
        self._windows: dict[tuple[str, str], deque[tuple[float, float]]] = defaultdict(
            lambda: deque(maxlen=1000)
        )

    def add_metric(
        self,
        server_id: str,
        cpu: float,
        memory: float,
        disk: float,
        latency_ms: float,
    ) -> None:
        """Add a metric snapshot to the sliding windows."""
        now = time.monotonic()
        self._windows[(server_id, "cpu")].append((now, cpu))
        self._windows[(server_id, "memory")].append((now, memory))
        self._windows[(server_id, "disk")].append((now, disk))
        self._windows[(server_id, "latency_ms")].append((now, latency_ms))

    def evaluate(self, server_id: str) -> list[FiredAlert]:
        """Evaluate all rules for a server and return any fired alerts."""
        now = time.monotonic()
        fired: list[FiredAlert] = []

        for rule in RULES:
            key = (server_id, rule.metric)
            window = self._windows.get(key)
            if window is None:
                continue

            # Prune old entries
            while window and (now - window[0][0]) > self._window_seconds:
                window.popleft()

            if not window:
                continue

            alert = self._check_sustained_breach(server_id, rule, window, now)
            if alert is not None:
                fired.append(alert)

        return fired

    @staticmethod
    def _check_sustained_breach(
        server_id: str,
        rule: AlertRule,
        window: deque[tuple[float, float]],
        now: float,
    ) -> Optional[FiredAlert]:
        """Check if a metric has been above threshold for the sustained period."""
        # Find the earliest point within the sustained window
        sustained_start = now - rule.sustained_seconds

        # Get all values within the sustained window
        sustained_values = [v for t, v in window if t >= sustained_start]

        if not sustained_values:
            return None

        # All values must exceed the threshold
        if all(v > rule.threshold for v in sustained_values) and len(sustained_values) >= 2:
            current_value = sustained_values[-1]
            return FiredAlert(
                server_id=server_id,
                metric_type=rule.metric,
                severity=rule.severity,
                current_value=current_value,
                threshold=rule.threshold,
                message=rule.message_template.format(
                    value=current_value,
                    threshold=rule.threshold,
                ),
            )

        return None
