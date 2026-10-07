#!/usr/bin/env python3
"""Emit privacy-preserving minute aggregates from 2md's SQLite request log."""

from __future__ import annotations

import argparse
import math
import os
import sqlite3
import time
from collections import defaultdict
from pathlib import Path


DEFAULT_DB_PATH = "/home/david/888-url2md/data/logs.sqlite"
MEASUREMENT = "url2md_request_minute"
INSTANCE = "2md.aiurl.tw"


def escape_tag(value: str) -> str:
    return (value.replace("\\", "\\\\")
                 .replace(",", "\\,")
                 .replace(" ", "\\ ")
                 .replace("=", "\\="))


def endpoint_class(endpoint: str, is_batch: bool, domain: str) -> str:
    if is_batch or endpoint in ("/batch", "/v1/batch"):
        return "batch"
    if endpoint == "/search" or endpoint.startswith("/s/") or domain == "serp:search":
        return "search"
    if endpoint.startswith("/api/"):
        return "api"
    if endpoint.startswith("/http://") or endpoint.startswith("/https://") or (endpoint == "/" and domain != "unknown"):
        return "url"
    return "other"


def percentile95(values: list[int]) -> float:
    ordered = sorted(values)
    return float(ordered[max(0, math.ceil(len(ordered) * 0.95) - 1)])


def influx_line(tags: dict[str, str], fields: dict[str, int | float], timestamp_ns: int) -> str:
    tagset = ",".join(f"{escape_tag(key)}={escape_tag(value)}" for key, value in sorted(tags.items()))
    fieldset = ",".join(
        f"{key}={value}i" if isinstance(value, int) else f"{key}={value:.3f}"
        for key, value in sorted(fields.items())
    )
    return f"{MEASUREMENT},{tagset} {fieldset} {timestamp_ns}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", default=os.environ.get("LOG_DB_PATH", DEFAULT_DB_PATH))
    parser.add_argument(
        "--lookback-minutes",
        type=int,
        default=int(os.environ.get("URL2MD_LOG_LOOKBACK_MINUTES", "5")),
    )
    args = parser.parse_args()
    if not 1 <= args.lookback_minutes <= 10080:
        parser.error("--lookback-minutes must be between 1 and 10080")

    db_uri = Path(args.db_path).resolve().as_uri() + "?mode=ro"
    connection = sqlite3.connect(db_uri, uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        now_ms = time.time_ns() // 1_000_000
        since_ms = now_ms - args.lookback_minutes * 60_000
        rows = connection.execute(
            """
            SELECT timestamp, target_domain, status_code, duration_ms, response_bytes,
                   is_batch, batch_count, endpoint
            FROM request_logs
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp
            """,
            (since_ms, now_ms),
        )

        groups: dict[tuple[int, str, int, bool, str], dict] = defaultdict(
            lambda: {"durations": [], "requests": 0, "targets": 0, "batch_requests": 0,
                     "errors": 0, "server_errors": 0, "response_bytes": 0}
        )
        for row in rows:
            is_batch = bool(row["is_batch"])
            status = int(row["status_code"])
            domain = (row["target_domain"] or "unknown").strip().lower() or "unknown"
            endpoint = str(row["endpoint"] or "")
            minute_ms = (int(row["timestamp"]) // 60_000) * 60_000
            key = (minute_ms, domain, status, is_batch, endpoint_class(endpoint, is_batch, domain))
            aggregate = groups[key]
            duration = max(0, int(row["duration_ms"] or 0))
            aggregate["durations"].append(duration)
            aggregate["requests"] += 1
            aggregate["targets"] += max(0, int(row["batch_count"] or 0)) if is_batch else int(domain not in ("unknown", "serp:search"))
            aggregate["batch_requests"] += int(is_batch)
            aggregate["errors"] += int(status >= 400)
            aggregate["server_errors"] += int(status >= 500)
            aggregate["response_bytes"] += max(0, int(row["response_bytes"] or 0))

        for (minute_ms, domain, status, is_batch, endpoint), aggregate in sorted(groups.items()):
            durations = aggregate["durations"]
            tags = {
                "instance": INSTANCE,
                "domain": domain,
                "status_code": str(status),
                "is_batch": str(is_batch).lower(),
                "endpoint_class": endpoint,
            }
            fields = {
                "request_count": aggregate["requests"],
                "target_count": aggregate["targets"],
                "batch_request_count": aggregate["batch_requests"],
                "error_count": aggregate["errors"],
                "server_error_count": aggregate["server_errors"],
                "duration_ms_sum": sum(durations),
                "duration_ms_avg": sum(durations) / len(durations),
                "duration_ms_p95": percentile95(durations),
                "duration_ms_max": max(durations),
                "response_bytes": aggregate["response_bytes"],
            }
            print(influx_line(tags, fields, minute_ms * 1_000_000))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
