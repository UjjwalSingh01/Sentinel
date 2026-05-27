"""
Sentinel Stream Processor — Log Template Clustering

A lightweight log normalizer + clusterer for incident snapshot compaction.

Strategy: instead of the full Drain3 prefix-tree algorithm, we normalize
high-cardinality tokens (numbers, IPs, UUIDs, durations) to placeholders and
group by the resulting template string. This handles ~80% of practical log
patterns with a tenth of the complexity and zero external deps.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from typing import Any, Iterable

_RE_IP = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_RE_PORT = re.compile(r"(?<=:)\d{2,5}\b")
_RE_UUID = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)
_RE_HEX = re.compile(r"\b0x[0-9a-f]+\b", re.IGNORECASE)
_RE_DURATION = re.compile(r"\b\d+(?:\.\d+)?(?:ms|s|us|ns|m|h)\b")
_RE_PATH = re.compile(r"(?<=\s)/[/\w.\-]+")
_RE_NUMBER = re.compile(r"\b\d+(?:\.\d+)?\b")
_RE_QUOTED = re.compile(r'"[^"\n]{0,128}"')


def normalize(message: str) -> str:
    """Replace high-cardinality tokens with placeholders to produce a template."""
    s = message
    s = _RE_UUID.sub("<UUID>", s)
    s = _RE_IP.sub("<IP>", s)
    s = _RE_PORT.sub("<PORT>", s)
    s = _RE_HEX.sub("<HEX>", s)
    s = _RE_DURATION.sub("<DUR>", s)
    s = _RE_QUOTED.sub('"<STR>"', s)
    s = _RE_PATH.sub("<PATH>", s)
    s = _RE_NUMBER.sub("<N>", s)
    return s.strip()


def cluster_logs(
    records: Iterable[dict[str, Any]],
    max_samples_per_template: int = 3,
    max_templates: int = 20,
) -> list[dict[str, Any]]:
    """
    Group log records by normalized template.

    Returns a list of cluster dicts, sorted by count descending:
        {
            "template":    "ERROR connection refused: <IP>:<PORT>",
            "count":       142,
            "level":       "ERROR",       # most frequent level
            "first_seen":  "2026-05-28T14:23:07Z",
            "last_seen":   "2026-05-28T14:24:02Z",
            "samples":     [<raw message 1>, ...],
        }
    """
    buckets: OrderedDict[tuple[str, str], dict[str, Any]] = OrderedDict()

    for r in records:
        msg = str(r.get("message", ""))
        level = str(r.get("level", "INFO")).upper()
        template = normalize(msg)
        key = (level, template)

        if key not in buckets:
            buckets[key] = {
                "template": template,
                "level": level,
                "count": 0,
                "first_seen": r.get("time") or r.get("timestamp"),
                "last_seen": r.get("time") or r.get("timestamp"),
                "samples": [],
            }

        bucket = buckets[key]
        bucket["count"] += 1
        bucket["last_seen"] = r.get("time") or r.get("timestamp")
        if len(bucket["samples"]) < max_samples_per_template:
            bucket["samples"].append(msg)

    clusters = sorted(buckets.values(), key=lambda b: b["count"], reverse=True)
    return clusters[:max_templates]
