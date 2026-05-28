"""
Sentinel Stream Processor — Incident Dedup (Phase 3 §3.3)

Collapses near-simultaneous incidents on related servers into one parent.

Fingerprint shape: `sha256(rule_id|server_group|bucket_iso)` where:
  - server_group   = server_id with the trailing "-NN" stripped
                     (so `prod-web-01`, `prod-web-02`, ... share a group)
  - bucket_iso     = wall-clock minute the incident landed in (60s aligned)

Two incidents with the same fingerprint within a 60s window collapse: the
first becomes the parent; later ones get `parent_incident_id = parent.id`.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Optional

_RE_SERVER_SUFFIX = re.compile(r"-\d+$")


def server_group_of(server_id: str) -> str:
    """`prod-web-01` -> `prod-web`. If no trailing -NN, returns the input."""
    stripped = _RE_SERVER_SUFFIX.sub("", server_id)
    return stripped or server_id


def compute_fingerprint(
    rule_id: str,
    server_id: str,
    when: datetime,
) -> tuple[str, str]:
    """
    Returns (fingerprint, server_group).
    Bucket aligned to 60s on the wall clock.
    """
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    bucket_start = when.replace(second=0, microsecond=0).isoformat()
    group = server_group_of(server_id)
    fp = hashlib.sha256(f"{rule_id}|{group}|{bucket_start}".encode()).hexdigest()
    return fp, group
