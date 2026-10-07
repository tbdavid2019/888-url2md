# ADR-004: 2md request analytics in the existing Grafana and InfluxDB

## Status

Accepted

## Date

2026-10-07

## Context

The 2md service already stores request logs in SQLite on the host, and the host
already runs Telegraf, InfluxDB 2, and Grafana. The request record contains
request time, target domain, status, duration, response bytes, and batch counts.
Grafana needs time-series data for traffic and latency dashboards. Reading the
SQLite WAL file directly from Grafana would couple dashboard queries to the
application's live database and require a separate SQLite datasource plugin.

## Decision

Keep SQLite as the request-log source of truth. A Telegraf `inputs.exec` plugin
runs a read-only Python exporter once per minute. The exporter groups request
logs into minute/domain/status/batch aggregates and emits Influx line protocol
to the existing `telegraf` bucket. The existing Grafana datasource powers a
separate folder and dashboard named `2md.aiurl.tw`.

The exporter sends counts, batch target totals, status/error counts, duration
aggregates, and response-byte totals. It does not export IP addresses, full URLs,
user agents, or error messages. A one-time backfill imports aggregates for the
existing SQLite retention window. The service currently retains seven days of
request logs; InfluxDB keeps the aggregate time series according to the existing
bucket retention policy.

## Alternatives considered

### Install another Grafana instance

Rejected because the host already runs a reachable Grafana instance with an
InfluxDB datasource and authentication. A separate folder/dashboard provides
2md isolation without another service to patch and operate.

### Query SQLite directly from Grafana

Rejected because it requires a plugin and exposes the live SQLite database to
dashboard queries, including its WAL and sensitive raw log fields.

### Send every request directly from the application to InfluxDB

Rejected because it adds a second synchronous-adjacent storage path to the
request logger and couples application availability to InfluxDB. Minute-level
aggregation through the existing Telegraf agent keeps the app write path
unchanged and reduces metric cardinality.

## Consequences and limitations

- Grafana shows total HTTP requests, target counts, status distribution,
  duration, and target-domain rankings.
- Batch target totals use `batch_count`. Existing request rows associate the
  batch with its first URL, so per-domain batch attribution follows that first
  URL rather than expanding each URL into separate request records.
- Telegraf reads SQLite as a dedicated unprivileged user. Its ACL grants path
  traversal to the database directory without granting access to list the home
  directory.
- The Grafana dashboard is created through the live Grafana API and read back
  after deployment. Re-deployment preserves an existing dashboard rather than
  overwriting live edits.
