from __future__ import annotations

import json
import os
from typing import Any

import httpx
import structlog

log = structlog.get_logger()


class ClickHouseWriter:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or os.environ.get("CLICKHOUSE_URL", "http://clickhouse:8123")
        self._client = httpx.AsyncClient(timeout=10.0)
        self._audit_ready = False
        self._telemetry_ready = False
        self._policy_ready = False
        self._incident_ready = False
        self._queue_metrics_ready = False

    async def close(self) -> None:
        await self._client.aclose()

    async def ensure_audit_table(self) -> None:
        if self._audit_ready:
            return
        query = """
        CREATE TABLE IF NOT EXISTS audit_events_raw (
            event_id String,
            timestamp DateTime64(3, 'UTC'),
            org_id String,
            workspace_id String,
            user_id String,
            trace_id String,
            action_taken String,
            risk_score Int32,
            payload String
        ) ENGINE = MergeTree
        ORDER BY (timestamp, org_id, event_id)
        """
        await self._execute(query)
        self._audit_ready = True

    async def ensure_telemetry_table(self) -> None:
        if self._telemetry_ready:
            return
        query = """
        CREATE TABLE IF NOT EXISTS telemetry_events_raw (
            event_id String,
            timestamp DateTime64(3, 'UTC'),
            org_id String,
            workspace_id String,
            trace_id String,
            event_type String,
            payload String
        ) ENGINE = MergeTree
        ORDER BY (timestamp, org_id, event_id)
        """
        await self._execute(query)
        await self._execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry_events_by_hour (
                bucket DateTime,
                org_id String,
                workspace_id String,
                event_type String,
                events UInt64
            ) ENGINE = SummingMergeTree
            ORDER BY (bucket, org_id, workspace_id, event_type)
            """
        )
        await self._execute(
            """
            CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_events_by_hour_mv
            TO telemetry_events_by_hour AS
            SELECT
                toStartOfHour(timestamp) AS bucket,
                org_id,
                workspace_id,
                event_type,
                count() AS events
            FROM telemetry_events_raw
            GROUP BY bucket, org_id, workspace_id, event_type
            """
        )
        self._telemetry_ready = True

    async def ensure_policy_table(self) -> None:
        if self._policy_ready:
            return
        await self._execute(
            """
            CREATE TABLE IF NOT EXISTS policy_events_raw (
                event_id String,
                timestamp DateTime64(3, 'UTC'),
                org_id String,
                workspace_id String,
                trace_id String,
                event_type String,
                payload String
            ) ENGINE = MergeTree
            ORDER BY (timestamp, org_id, event_id)
            """
        )
        await self._execute(
            """
            CREATE TABLE IF NOT EXISTS policy_events_by_hour (
                bucket DateTime,
                org_id String,
                workspace_id String,
                event_type String,
                events UInt64
            ) ENGINE = SummingMergeTree
            ORDER BY (bucket, org_id, workspace_id, event_type)
            """
        )
        await self._execute(
            """
            CREATE MATERIALIZED VIEW IF NOT EXISTS policy_events_by_hour_mv
            TO policy_events_by_hour AS
            SELECT
                toStartOfHour(timestamp) AS bucket,
                org_id,
                workspace_id,
                event_type,
                count() AS events
            FROM policy_events_raw
            GROUP BY bucket, org_id, workspace_id, event_type
            """
        )
        self._policy_ready = True

    async def ensure_incident_table(self) -> None:
        if self._incident_ready:
            return
        await self._execute(
            """
            CREATE TABLE IF NOT EXISTS incident_events_raw (
                event_id String,
                timestamp DateTime64(3, 'UTC'),
                org_id String,
                workspace_id String,
                trace_id String,
                event_type String,
                severity String,
                payload String
            ) ENGINE = MergeTree
            ORDER BY (timestamp, org_id, event_id)
            """
        )
        await self._execute(
            """
            CREATE TABLE IF NOT EXISTS incident_events_by_hour (
                bucket DateTime,
                org_id String,
                workspace_id String,
                severity String,
                event_type String,
                events UInt64
            ) ENGINE = SummingMergeTree
            ORDER BY (bucket, org_id, workspace_id, severity, event_type)
            """
        )
        await self._execute(
            """
            CREATE MATERIALIZED VIEW IF NOT EXISTS incident_events_by_hour_mv
            TO incident_events_by_hour AS
            SELECT
                toStartOfHour(timestamp) AS bucket,
                org_id,
                workspace_id,
                severity,
                event_type,
                count() AS events
            FROM incident_events_raw
            GROUP BY bucket, org_id, workspace_id, severity, event_type
            """
        )
        self._incident_ready = True

    async def ensure_queue_metrics_table(self) -> None:
        if self._queue_metrics_ready:
            return
        await self._execute(
            """
            CREATE TABLE IF NOT EXISTS queue_metrics_raw (
                stream String,
                queue_type String,
                measured_at DateTime64(3, 'UTC'),
                depth UInt64,
                lag UInt64
            ) ENGINE = MergeTree
            ORDER BY (measured_at, stream, queue_type)
            """
        )
        self._queue_metrics_ready = True

    async def write_audit_events(self, events: list[dict[str, Any]]) -> None:
        if not events:
            return
        await self.ensure_audit_table()
        rows = "\n".join(
            json.dumps(
                {
                    "event_id": str(event.get("event_id", "")),
                    "timestamp": event.get("timestamp"),
                    "org_id": str(event.get("org_id", "")),
                    "workspace_id": str(event.get("workspace_id", "")),
                    "user_id": str(event.get("user_id", "")),
                    "trace_id": str(event.get("trace_id", "")),
                    "action_taken": str(event.get("action_taken", "ALLOW")),
                    "risk_score": int(event.get("risk_score", 0)),
                    "payload": json.dumps(event),
                }
            )
            for event in events
        )
        await self._insert("audit_events_raw", rows)

    async def write_telemetry_events(self, events: list[dict[str, Any]]) -> None:
        if not events:
            return
        await self.ensure_telemetry_table()
        rows = "\n".join(
            json.dumps(
                {
                    "event_id": str(event.get("event_id", "")),
                    "timestamp": event.get("timestamp"),
                    "org_id": str(event.get("org_id", "")),
                    "workspace_id": str(event.get("workspace_id", "")),
                    "trace_id": str(event.get("trace_id", "")),
                    "event_type": str(event.get("event_type", "")),
                    "payload": json.dumps(event),
                }
            )
            for event in events
        )
        await self._insert("telemetry_events_raw", rows)

    async def write_policy_events(self, events: list[dict[str, Any]]) -> None:
        if not events:
            return
        await self.ensure_policy_table()
        rows = "\n".join(
            json.dumps(
                {
                    "event_id": str(event.get("event_id", "")),
                    "timestamp": event.get("timestamp"),
                    "org_id": str(event.get("org_id", "")),
                    "workspace_id": str(event.get("workspace_id", "")),
                    "trace_id": str(event.get("trace_id", "")),
                    "event_type": str(event.get("event_type", "")),
                    "payload": json.dumps(event),
                }
            )
            for event in events
        )
        await self._insert("policy_events_raw", rows)

    async def write_incident_events(self, events: list[dict[str, Any]]) -> None:
        if not events:
            return
        await self.ensure_incident_table()
        rows = "\n".join(
            json.dumps(
                {
                    "event_id": str(event.get("event_id", "")),
                    "timestamp": event.get("timestamp"),
                    "org_id": str(event.get("org_id", "")),
                    "workspace_id": str(event.get("workspace_id", "")),
                    "trace_id": str(event.get("trace_id", "")),
                    "event_type": str(event.get("event_type", "")),
                    "severity": str(
                        event.get("severity")
                        or event.get("payload", {}).get("severity", "UNKNOWN")
                    ),
                    "payload": json.dumps(event),
                }
            )
            for event in events
        )
        await self._insert("incident_events_raw", rows)

    async def write_queue_metrics(self, metrics: list[dict[str, Any]]) -> None:
        if not metrics:
            return
        await self.ensure_queue_metrics_table()
        rows = "\n".join(
            json.dumps(
                {
                    "stream": str(metric.get("stream", "")),
                    "queue_type": str(metric.get("queue_type", "primary")),
                    "measured_at": metric.get("measured_at"),
                    "depth": int(metric.get("depth", 0)),
                    "lag": int(metric.get("lag", 0)),
                }
            )
            for metric in metrics
        )
        await self._insert("queue_metrics_raw", rows)

    async def _insert(self, table: str, payload: str) -> None:
        query = f"INSERT INTO {table} FORMAT JSONEachRow"
        await self._client.post(self.base_url, params={"query": query}, content=payload.encode())

    async def _execute(self, query: str) -> None:
        response = await self._client.post(self.base_url, params={"query": query})
        response.raise_for_status()
