"""
Sentinel Stream Processor — Rule Engine (Phase 2)

Replaces the hardcoded SlidingWindowEvaluator with a DB-driven engine that
supports three expression types:

    metric leaf:    {"type":"metric", "metric":"cpu", "op":">", "value":90, "window_s":15}
    log leaf:       {"type":"log", "levels":["WARN","ERROR","FATAL"], "rate_per_min":5,
                     "window_s":60, "exclude_patterns":["wrong password", "HTTP 4[0-9][0-9]"]}
    composite:      {"type":"and"|"or", "children":[<expr>, <expr>, ...]}

A rule is one row in the `alert_rules` table; its `expression` is JSON of any
of the above. Composite rules nest arbitrarily.
"""

from __future__ import annotations

import re
import time as time_mod
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class Severity(str, Enum):
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class AlertRule:
    """A rule row loaded from the alert_rules table."""

    id: str
    name: str
    type: str  # 'metric' | 'log' | 'composite' (top-level type)
    severity: Severity
    expression: dict[str, Any]
    enabled: bool = True
    runbook_url: Optional[str] = None


@dataclass
class FiredAlert:
    """A rule evaluation that resolved to true on this tick."""

    rule_id: str
    rule_name: str
    server_id: str
    # Legacy compatibility: existing metric rules report their metric name here.
    # Log/composite rules use "log_rate" / "composite".
    metric_type: str
    severity: Severity
    current_value: float
    threshold: float
    message: str


# ---------------------------------------------------------------------------
# Expression walking
# ---------------------------------------------------------------------------
def walk_leaves(expr: dict[str, Any], prefix: str = "") -> list[tuple[str, dict[str, Any]]]:
    """Yield (path, leaf_config) for every leaf reachable from `expr`."""
    t = expr.get("type", "metric")
    if t in ("and", "or"):
        out: list[tuple[str, dict[str, Any]]] = []
        for i, child in enumerate(expr.get("children", []) or []):
            child_prefix = f"{prefix}.{i}" if prefix else str(i)
            out.extend(walk_leaves(child, child_prefix))
        return out
    return [(prefix or ".", expr)]


# ---------------------------------------------------------------------------
# Stores: keep per-key sliding windows of metric values / log timestamps.
# ---------------------------------------------------------------------------
class MetricStore:
    """Sliding windows for metric values per (server_id, metric_name)."""

    def __init__(self, max_window: float = 120.0) -> None:
        self._max_window = max_window
        self._windows: dict[tuple[str, str], deque[tuple[float, float]]] = defaultdict(
            lambda: deque(maxlen=2000)
        )

    def add(self, server_id: str, metric: str, value: float) -> None:
        now = time_mod.monotonic()
        self._windows[(server_id, metric)].append((now, value))

    def evaluate(self, server_id: str, leaf: dict[str, Any]) -> tuple[bool, float]:
        """Returns (active, current_value)."""
        metric = leaf["metric"]
        op = leaf.get("op", ">")
        threshold = float(leaf["value"])
        window_s = float(leaf.get("window_s", 15.0))

        window = self._windows.get((server_id, metric))
        if not window:
            return False, 0.0

        now = time_mod.monotonic()
        while window and (now - window[0][0]) > self._max_window:
            window.popleft()

        sustained_start = now - window_s
        values = [v for t, v in window if t >= sustained_start]
        current = values[-1] if values else 0.0
        if len(values) < 2:
            return False, current

        if op == ">":
            return all(v > threshold for v in values), current
        if op == ">=":
            return all(v >= threshold for v in values), current
        if op == "<":
            return all(v < threshold for v in values), current
        if op == "<=":
            return all(v <= threshold for v in values), current
        return False, current


class LogStore:
    """Sliding windows of matching log timestamps per (rule_id, sub_path, server_id)."""

    def __init__(self, max_window: float = 600.0) -> None:
        self._max_window = max_window
        self._counters: dict[tuple[str, str, str], deque[float]] = defaultdict(
            lambda: deque(maxlen=10000)
        )
        # Cache compiled regexes per (rule_id, sub_path) so each log line
        # only pays the compile cost once.
        self._exclude_cache: dict[tuple[str, str], list[re.Pattern[str]]] = {}

    def reset(self) -> None:
        self._counters.clear()
        self._exclude_cache.clear()

    def _get_excludes(
        self, rule_id: str, sub_path: str, leaf: dict[str, Any]
    ) -> list[re.Pattern[str]]:
        key = (rule_id, sub_path)
        cached = self._exclude_cache.get(key)
        if cached is not None:
            return cached
        patterns = leaf.get("exclude_patterns", []) or []
        compiled = []
        for p in patterns:
            try:
                compiled.append(re.compile(p, re.IGNORECASE))
            except re.error:
                # Skip malformed patterns rather than crash the whole engine.
                continue
        self._exclude_cache[key] = compiled
        return compiled

    def ingest(
        self,
        server_id: str,
        level: str,
        message: str,
        rule_id: str,
        sub_path: str,
        leaf: dict[str, Any],
    ) -> None:
        """If this event matches the leaf's filter, append its timestamp."""
        wanted = {lv.upper() for lv in (leaf.get("levels") or [])}
        if wanted and level.upper() not in wanted:
            return

        for rx in self._get_excludes(rule_id, sub_path, leaf):
            if rx.search(message):
                return

        now = time_mod.monotonic()
        self._counters[(rule_id, sub_path, server_id)].append(now)

    def evaluate(
        self, server_id: str, rule_id: str, sub_path: str, leaf: dict[str, Any]
    ) -> tuple[bool, float]:
        """Returns (active, rate_per_min)."""
        window_s = float(leaf.get("window_s", 60.0))
        threshold = float(leaf.get("rate_per_min", 10.0))

        counter = self._counters.get((rule_id, sub_path, server_id))
        if not counter:
            return False, 0.0

        now = time_mod.monotonic()
        while counter and (now - counter[0]) > self._max_window:
            counter.popleft()

        start = now - window_s
        # deque doesn't support reverse-iter slicing cleanly; one O(n) pass is fine here
        match_count = sum(1 for t in counter if t >= start)
        rate_per_min = (match_count / max(window_s, 1.0)) * 60.0
        return rate_per_min >= threshold, rate_per_min


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
@dataclass
class _EvalResult:
    active: bool
    value: float
    threshold: float
    summary: str
    metric_type: str


class RuleEngine:
    """
    Owns all rule state for the processor. Metric ticks call `add_metric` +
    `evaluate_server`; log lines call `ingest_log`. Composite rules are
    re-evaluated on every metric tick (latency is bounded by the simulator's
    ~3s metric interval).
    """

    def __init__(self) -> None:
        self.metric_store = MetricStore()
        self.log_store = LogStore()
        self._rules: list[AlertRule] = []
        # Pre-computed per-rule list of (path, leaf_config) for log leaves
        # so log ingestion doesn't have to walk every rule on every line.
        self._log_leaves_by_rule: dict[str, list[tuple[str, dict[str, Any]]]] = {}

    # ----- Rule lifecycle -----
    def set_rules(self, rules: list[AlertRule]) -> None:
        self._rules = [r for r in rules if r.enabled]
        self._log_leaves_by_rule = {
            r.id: [(p, leaf) for p, leaf in walk_leaves(r.expression) if leaf.get("type") == "log"]
            for r in self._rules
        }
        # Drop log counters for stale rules so removed rules don't bloat memory.
        # (Cheap full reset; rule edits are rare.)
        self.log_store.reset()

    @property
    def rules(self) -> list[AlertRule]:
        return list(self._rules)

    # ----- Event ingestion -----
    def add_metric(
        self,
        server_id: str,
        cpu: float,
        memory: float,
        disk: float,
        latency_ms: float,
    ) -> None:
        self.metric_store.add(server_id, "cpu", cpu)
        self.metric_store.add(server_id, "memory", memory)
        self.metric_store.add(server_id, "disk", disk)
        self.metric_store.add(server_id, "latency_ms", latency_ms)

    def ingest_log(self, server_id: str, level: str, message: str) -> None:
        for rule in self._rules:
            for path, leaf in self._log_leaves_by_rule.get(rule.id, []):
                self.log_store.ingest(server_id, level, message, rule.id, path, leaf)

    # ----- Evaluation -----
    def evaluate_server(self, server_id: str) -> list[FiredAlert]:
        fired: list[FiredAlert] = []
        for rule in self._rules:
            alert = self._evaluate_rule(rule, server_id)
            if alert is not None:
                fired.append(alert)
        return fired

    def _evaluate_rule(self, rule: AlertRule, server_id: str) -> Optional[FiredAlert]:
        result = self._eval_expr(rule.expression, server_id, rule.id, "")
        if not result.active:
            return None
        message = f"{rule.name}: {result.summary}" if result.summary else rule.name
        return FiredAlert(
            rule_id=rule.id,
            rule_name=rule.name,
            server_id=server_id,
            metric_type=result.metric_type,
            severity=rule.severity,
            current_value=result.value,
            threshold=result.threshold,
            message=message,
        )

    def _eval_expr(
        self,
        expr: dict[str, Any],
        server_id: str,
        rule_id: str,
        path: str,
    ) -> _EvalResult:
        t = expr.get("type", "metric")

        if t == "metric":
            active, value = self.metric_store.evaluate(server_id, expr)
            metric = str(expr.get("metric", "?"))
            op = str(expr.get("op", ">"))
            threshold = float(expr.get("value", 0))
            return _EvalResult(
                active=active,
                value=value,
                threshold=threshold,
                summary=f"{metric}={value:.1f} {op} {threshold:g}",
                metric_type=metric,
            )

        if t == "log":
            active, rate = self.log_store.evaluate(
                server_id, rule_id, path or ".", expr
            )
            threshold = float(expr.get("rate_per_min", 0))
            return _EvalResult(
                active=active,
                value=rate,
                threshold=threshold,
                summary=f"log rate={rate:.1f}/min (>= {threshold:g}/min)",
                metric_type="log_rate",
            )

        if t in ("and", "or"):
            children = expr.get("children", []) or []
            results: list[_EvalResult] = []
            for i, child in enumerate(children):
                child_path = f"{path}.{i}" if path else str(i)
                results.append(self._eval_expr(child, server_id, rule_id, child_path))

            if not results:
                return _EvalResult(False, 0.0, 0.0, "", "composite")

            if t == "and":
                active = all(r.active for r in results)
            else:
                active = any(r.active for r in results)

            if not active:
                return _EvalResult(False, 0.0, 0.0, "", "composite")

            active_results = [r for r in results if r.active]
            primary = active_results[0]
            parts = [r.summary for r in active_results]
            joiner = " AND " if t == "and" else " OR "
            return _EvalResult(
                active=True,
                value=primary.value,
                threshold=primary.threshold,
                summary=joiner.join(parts),
                metric_type="composite",
            )

        # Unknown expression type — fail closed, don't fire
        return _EvalResult(False, 0.0, 0.0, "", "")
