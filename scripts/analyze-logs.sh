#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:-data/logs.sqlite}"

if [ ! -f "$DB_PATH" ]; then
  echo "Log database not found at: $DB_PATH"
  echo "Usage: ./scripts/analyze-logs.sh [path/to/logs.sqlite]"
  exit 1
fi

echo "=================================================="
echo "📊 888-url2md SRE Abuse & Traffic Report"
echo "Database: $DB_PATH"
echo "=================================================="

duckdb -c "
INSTALL sqlite; LOAD sqlite;

SELECT '=== 1. 最近 24 小時流量總覽 ===' as Section;
SELECT 
    COUNT(*) as total_requests,
    COUNT(DISTINCT ip) as unique_ips,
    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
    ROUND(AVG(duration_ms), 1) as avg_duration_ms,
    ROUND(SUM(response_bytes) / 1024.0 / 1024.0, 2) as total_mb
FROM sqlite_scan('$DB_PATH', 'request_logs')
WHERE timestamp >= (epoch(now()) - 86400) * 1000;

SELECT '=== 2. Top 10 活躍請求 IP ===' as Section;
SELECT 
    ip,
    COUNT(*) as requests,
    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
    ROUND(AVG(duration_ms), 1) as avg_ms,
    MAX(created_at) as last_seen
FROM sqlite_scan('$DB_PATH', 'request_logs')
WHERE timestamp >= (epoch(now()) - 86400) * 1000
GROUP BY ip
ORDER BY requests DESC
LIMIT 10;

SELECT '=== 3. Top 10 被爬取目標網域 ===' as Section;
SELECT 
    target_domain as domain,
    COUNT(*) as count
FROM sqlite_scan('$DB_PATH', 'request_logs')
WHERE timestamp >= (epoch(now()) - 86400) * 1000 AND target_domain IS NOT NULL AND target_domain != ''
GROUP BY target_domain
ORDER BY count DESC
LIMIT 10;

SELECT '=== 4. HTTP 狀態碼分佈 ===' as Section;
SELECT 
    status_code,
    COUNT(*) as count
FROM sqlite_scan('$DB_PATH', 'request_logs')
WHERE timestamp >= (epoch(now()) - 86400) * 1000
GROUP BY status_code
ORDER BY count DESC;
"
