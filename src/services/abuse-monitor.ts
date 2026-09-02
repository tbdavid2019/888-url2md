import { singleton } from 'tsyringe';
import { AsyncService } from 'civkit/async-service';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import type { Context, Next } from 'koa';
import { GlobalLogger } from './logger';
import * as Minio from 'minio';

export interface RequestLogEntry {
    id: string;
    timestamp: number;
    createdAt: string;
    ip: string;
    method: string;
    endpoint: string;
    targetUrl?: string;
    targetDomain?: string;
    statusCode: number;
    durationMs: number;
    userAgent?: string;
    responseBytes: number;
    isBatch: boolean;
    batchCount: number;
    errorMessage?: string;
}

export interface SummaryStats {
    timeRangeMs: number;
    since: string;
    totalRequests: number;
    uniqueIps: number;
    errorCount: number;
    errorRatePercent: number;
    avgDurationMs: number;
    totalResponseBytes: number;
    topIps: Array<{ ip: string; count: number; errorCount: number; avgDurationMs: number; lastSeen: string }>;
    topTargetDomains: Array<{ domain: string; count: number }>;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    statusCodeDistribution: Record<string, number>;
}

@singleton()
export class AbuseMonitorService extends AsyncService {
    logger!: ReturnType<GlobalLogger['child']>;

    readonly enabled: boolean;
    readonly dbPath: string;
    readonly retentionDays: number;
    readonly flushIntervalMs: number;
    readonly maxBufferSize: number;

    readonly rateLimitEnabled: boolean;
    readonly rateLimitMaxPerMinute: number;
    readonly exemptIps: Set<string>;
    readonly blockedIps: Set<string>;
    readonly blockedDomains: Set<string>;
    readonly adminApiKey: string;

    readonly s3BackupEnabled: boolean;
    readonly s3Bucket: string;
    readonly s3Endpoint: string;
    readonly s3Region: string;
    readonly s3AccessKey: string;
    readonly s3SecretKey: string;
    readonly s3Prefix: string;

    private db?: DatabaseSync;
    private insertStmt?: StatementSync;
    private buffer: RequestLogEntry[] = [];
    private flushTimer?: NodeJS.Timeout;
    private pruneTimer?: NodeJS.Timeout;
    private backupTimer?: NodeJS.Timeout;
    private ipHits = new Map<string, number[]>();

    constructor(
        protected globalLogger: GlobalLogger,
    ) {
        super(...arguments);
        this.logger = this.globalLogger?.child ? this.globalLogger.child({ service: this.constructor.name }) : console as any;

        this.enabled = Boolean(
            process.env.REQUEST_LOG_ENABLED === 'true' ||
            process.env.ENABLE_REQUEST_LOGGER === 'true' ||
            process.env.ENABLE_ABUSE_MONITOR === 'true'
        );

        this.dbPath = process.env.LOG_DB_PATH || path.resolve(process.cwd(), 'data', 'logs.sqlite');
        this.retentionDays = Math.max(1, parseInt(process.env.LOG_RETENTION_DAYS || '7', 10));
        this.flushIntervalMs = Math.max(200, parseInt(process.env.LOG_BUFFER_FLUSH_INTERVAL_MS || '1000', 10));
        this.maxBufferSize = Math.max(10, parseInt(process.env.LOG_BUFFER_MAX_SIZE || '100', 10));

        this.rateLimitEnabled = Boolean(
            process.env.RATE_LIMIT_ENABLED === 'true' ||
            process.env.ENABLE_RATE_LIMIT === 'true'
        );
        this.rateLimitMaxPerMinute = Math.max(1, parseInt(process.env.RATE_LIMIT_MAX_PER_MINUTE || '60', 10));

        this.exemptIps = new Set(
            (process.env.RATE_LIMIT_EXEMPT_IPS || '127.0.0.1,::1,localhost')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
        );

        this.blockedIps = new Set(
            (process.env.BLOCKED_IPS || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
        );

        this.blockedDomains = new Set(
            (process.env.BLOCKED_DOMAINS || '')
                .split(',')
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean)
        );

        this.adminApiKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_SECRET_KEY || '').trim();

        this.s3BackupEnabled = Boolean(process.env.S3_LOG_BACKUP_ENABLED === 'true');
        this.s3Bucket = process.env.S3_LOG_BUCKET || '';
        this.s3Endpoint = process.env.S3_LOG_ENDPOINT || '';
        this.s3Region = process.env.S3_LOG_REGION || 'us-east-1';
        this.s3AccessKey = process.env.S3_LOG_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
        this.s3SecretKey = process.env.S3_LOG_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
        this.s3Prefix = (process.env.S3_LOG_PREFIX || 'url2md-logs/').replace(/^\/+/, '');
    }

    override async init() {
        await this.dependencyReady();

        if (this.enabled) {
            this.initDatabase();
            this.startTimers();
        }

        this.emit('ready');
    }

    override async standDown() {
        this.stopTimers();
        this.flush();
        if (this.db) {
            try {
                this.db.close();
            } catch {
                // Ignore error on close
            }
        }
    }

    private ensureDatabase() {
        if (!this.db && this.enabled) {
            this.initDatabase();
        }
    }

    private initDatabase() {
        if (this.db) {
            return;
        }
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.db = new DatabaseSync(this.dbPath);
            this.db.exec('PRAGMA journal_mode = WAL;');
            this.db.exec('PRAGMA synchronous = NORMAL;');
            this.db.exec('PRAGMA busy_timeout = 5000;');

            this.db.exec(`
                CREATE TABLE IF NOT EXISTS request_logs (
                    id TEXT PRIMARY KEY,
                    timestamp INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    ip TEXT NOT NULL,
                    method TEXT NOT NULL,
                    endpoint TEXT NOT NULL,
                    target_url TEXT,
                    target_domain TEXT,
                    status_code INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    user_agent TEXT,
                    response_bytes INTEGER DEFAULT 0,
                    is_batch INTEGER DEFAULT 0,
                    batch_count INTEGER DEFAULT 0,
                    error_message TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp);
                CREATE INDEX IF NOT EXISTS idx_logs_ip ON request_logs(ip);
                CREATE INDEX IF NOT EXISTS idx_logs_domain ON request_logs(target_domain);
                CREATE INDEX IF NOT EXISTS idx_logs_status ON request_logs(status_code);
            `);

            this.insertStmt = this.db.prepare(`
                INSERT INTO request_logs (
                    id, timestamp, created_at, ip, method, endpoint,
                    target_url, target_domain, status_code, duration_ms,
                    user_agent, response_bytes, is_batch, batch_count, error_message
                ) VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?
                )
            `);

            this.pruneExpiredLogs();
            this.logger.info(`AbuseMonitor SQLite database initialized at ${this.dbPath} in WAL mode.`);
        } catch (err: any) {
            this.logger.error(`Failed to initialize SQLite log database at ${this.dbPath}: ${err?.message || err}`);
        }
    }

    private startTimers(): void {
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.flushIntervalMs);
        this.flushTimer.unref();

        // Daily cleanup and in-memory IP map pruning
        this.pruneTimer = setInterval(() => {
            this.pruneExpiredLogs();
            this.pruneIpRateMap();
        }, 60 * 60 * 1000);
        this.pruneTimer.unref();

        // Optional Daily S3 Backup (every 24 hours)
        if (this.s3BackupEnabled && this.s3Bucket) {
            this.backupTimer = setInterval(() => {
                this.backupPreviousDayToS3().catch((err) => {
                    this.logger.error('Failed to perform daily S3 log backup:', err);
                });
            }, 24 * 60 * 60 * 1000);
            this.backupTimer.unref();
        }
    }

    private stopTimers(): void {
        if (this.flushTimer) clearInterval(this.flushTimer);
        if (this.pruneTimer) clearInterval(this.pruneTimer);
        if (this.backupTimer) clearInterval(this.backupTimer);
    }

    public recordLog(entry: RequestLogEntry): void {
        if (!this.enabled || !this.db) {
            return;
        }

        this.buffer.push(entry);

        if (this.buffer.length >= this.maxBufferSize) {
            this.flush();
        }
    }

    public flush(): void {
        if (!this.db || !this.insertStmt || this.buffer.length === 0) {
            return;
        }

        const items = this.buffer.splice(0, this.buffer.length);

        try {
            this.db.exec('BEGIN IMMEDIATE;');
            for (const item of items) {
                this.insertStmt.run(
                    item.id,
                    item.timestamp,
                    item.createdAt,
                    item.ip,
                    item.method,
                    item.endpoint,
                    item.targetUrl || null,
                    item.targetDomain || null,
                    item.statusCode,
                    item.durationMs,
                    item.userAgent || null,
                    item.responseBytes || 0,
                    item.isBatch ? 1 : 0,
                    item.batchCount || 0,
                    item.errorMessage || null,
                );
            }
            this.db.exec('COMMIT;');
        } catch (err) {
            this.logger.error('Failed to flush log buffer to SQLite:', err);
            try {
                this.db.exec('ROLLBACK;');
            } catch {
                // Ignore rollback failure
            }
        }
    }

    public pruneExpiredLogs(): void {
        if (!this.db) return;
        try {
            const cutoffMs = Date.now() - this.retentionDays * 86400000;
            const stmt = this.db.prepare('DELETE FROM request_logs WHERE timestamp < ?;');
            stmt.run(cutoffMs);
        } catch (err) {
            this.logger.error('Failed to prune expired logs from SQLite:', err);
        }
    }

    private pruneIpRateMap(): void {
        const oneMinuteAgo = Date.now() - 60000;
        for (const [ip, hits] of this.ipHits.entries()) {
            const valid = hits.filter((t) => t > oneMinuteAgo);
            if (valid.length === 0) {
                this.ipHits.delete(ip);
            } else {
                this.ipHits.set(ip, valid);
            }
        }
    }

    public isIpBlocked(ip: string): boolean {
        return this.blockedIps.has(ip);
    }

    public isDomainBlocked(domain?: string): boolean {
        if (!domain) return false;
        return this.blockedDomains.has(domain.toLowerCase());
    }

    public isRateLimited(ip: string): boolean {
        if (!this.rateLimitEnabled) return false;
        if (this.exemptIps.has(ip)) return false;

        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        let hits = this.ipHits.get(ip);
        if (!hits) {
            hits = [];
            this.ipHits.set(ip, hits);
        }

        hits = hits.filter((t) => t > oneMinuteAgo);
        hits.push(now);
        this.ipHits.set(ip, hits);

        return hits.length > this.rateLimitMaxPerMinute;
    }

    public parseTargetInfo(ctx: Context): { targetUrl?: string; targetDomain?: string; isBatch: boolean; batchCount: number } {
        const pathStr = ctx.path;
        let targetUrl: string | undefined;
        let isBatch = false;
        let batchCount = 0;

        if (pathStr.startsWith('/http://') || pathStr.startsWith('/https://')) {
            targetUrl = pathStr.slice(1);
            if (ctx.querystring) {
                targetUrl += `?${ctx.querystring}`;
            }
        } else if (pathStr === '/v1/batch' || pathStr === '/batch') {
            isBatch = true;
            const body = (ctx.request as any).body;
            if (body && Array.isArray(body.urls)) {
                batchCount = body.urls.length;
                targetUrl = body.urls[0];
            }
        } else if (ctx.method === 'POST' && pathStr === '/') {
            const body = (ctx.request as any).body;
            if (body && Array.isArray(body.urls)) {
                isBatch = true;
                batchCount = body.urls.length;
                targetUrl = body.urls[0];
            } else if (body && typeof body.url === 'string') {
                targetUrl = body.url;
            }
        } else if (pathStr.startsWith('/s/') || pathStr === '/search') {
            return {
                targetUrl: ctx.query.q ? String(ctx.query.q) : pathStr.slice(3),
                targetDomain: 'serp:search',
                isBatch: false,
                batchCount: 0,
            };
        }

        let targetDomain: string | undefined;
        if (targetUrl) {
            try {
                const parsed = new URL(targetUrl);
                targetDomain = parsed.hostname.toLowerCase();
            } catch {
                targetDomain = undefined;
            }
        }

        return { targetUrl, targetDomain, isBatch, batchCount };
    }

    public getSummaryStats(timeRangeMs = 86400000, topLimit = 10): SummaryStats {
        this.ensureDatabase();
        this.flush();
        if (!this.db) {
            return {
                timeRangeMs,
                since: new Date(Date.now() - timeRangeMs).toISOString(),
                totalRequests: 0,
                uniqueIps: 0,
                errorCount: 0,
                errorRatePercent: 0,
                avgDurationMs: 0,
                totalResponseBytes: 0,
                topIps: [],
                topTargetDomains: [],
                topEndpoints: [],
                statusCodeDistribution: {},
            };
        }

        const sinceMs = Date.now() - timeRangeMs;

        const aggStmt = this.db.prepare(`
            SELECT
                COUNT(*) as total_requests,
                COUNT(DISTINCT ip) as unique_ips,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
                AVG(duration_ms) as avg_duration,
                SUM(response_bytes) as total_bytes
            FROM request_logs
            WHERE timestamp >= ?
        `);
        const agg: any = aggStmt.get(sinceMs) || {};

        const totalRequests = Number(agg.total_requests || 0);
        const uniqueIps = Number(agg.unique_ips || 0);
        const errorCount = Number(agg.error_count || 0);
        const avgDurationMs = Math.round(Number(agg.avg_duration || 0));
        const totalResponseBytes = Number(agg.total_bytes || 0);
        const errorRatePercent = totalRequests > 0 ? parseFloat(((errorCount / totalRequests) * 100).toFixed(2)) : 0;

        const topIpsStmt = this.db.prepare(`
            SELECT
                ip,
                COUNT(*) as count,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
                AVG(duration_ms) as avg_duration,
                MAX(created_at) as last_seen
            FROM request_logs
            WHERE timestamp >= ?
            GROUP BY ip
            ORDER BY count DESC
            LIMIT ?
        `);
        const topIpsRaw = topIpsStmt.all(sinceMs, topLimit) as any[];
        const topIps = topIpsRaw.map((r) => ({
            ip: String(r.ip),
            count: Number(r.count),
            errorCount: Number(r.error_count || 0),
            avgDurationMs: Math.round(Number(r.avg_duration || 0)),
            lastSeen: String(r.last_seen || ''),
        }));

        const topDomainsStmt = this.db.prepare(`
            SELECT target_domain, COUNT(*) as count
            FROM request_logs
            WHERE timestamp >= ? AND target_domain IS NOT NULL AND target_domain != ''
            GROUP BY target_domain
            ORDER BY count DESC
            LIMIT ?
        `);
        const topDomainsRaw = topDomainsStmt.all(sinceMs, topLimit) as any[];
        const topTargetDomains = topDomainsRaw.map((r) => ({
            domain: String(r.target_domain),
            count: Number(r.count),
        }));

        const topEndpointsStmt = this.db.prepare(`
            SELECT endpoint, COUNT(*) as count
            FROM request_logs
            WHERE timestamp >= ?
            GROUP BY endpoint
            ORDER BY count DESC
            LIMIT ?
        `);
        const topEndpointsRaw = topEndpointsStmt.all(sinceMs, topLimit) as any[];
        const topEndpoints = topEndpointsRaw.map((r) => ({
            endpoint: String(r.endpoint),
            count: Number(r.count),
        }));

        const statusStmt = this.db.prepare(`
            SELECT status_code, COUNT(*) as count
            FROM request_logs
            WHERE timestamp >= ?
            GROUP BY status_code
            ORDER BY count DESC
        `);
        const statusRaw = statusStmt.all(sinceMs) as any[];
        const statusCodeDistribution: Record<string, number> = {};
        for (const s of statusRaw) {
            statusCodeDistribution[String(s.status_code)] = Number(s.count);
        }

        return {
            timeRangeMs,
            since: new Date(sinceMs).toISOString(),
            totalRequests,
            uniqueIps,
            errorCount,
            errorRatePercent,
            avgDurationMs,
            totalResponseBytes,
            topIps,
            topTargetDomains,
            topEndpoints,
            statusCodeDistribution,
        };
    }

    public getRecentLogs(options: {
        limit?: number;
        offset?: number;
        ip?: string;
        targetDomain?: string;
        statusCode?: number;
        errorsOnly?: boolean;
    } = {}): { total: number; logs: RequestLogEntry[] } {
        this.ensureDatabase();
        this.flush();
        if (!this.db) return { total: 0, logs: [] };

        const limit = Math.min(500, Math.max(1, options.limit || 50));
        const offset = Math.max(0, options.offset || 0);

        const whereClauses: string[] = [];
        const params: any[] = [];

        if (options.ip) {
            whereClauses.push('ip = ?');
            params.push(options.ip);
        }
        if (options.targetDomain) {
            whereClauses.push('target_domain = ?');
            params.push(options.targetDomain.toLowerCase());
        }
        if (options.statusCode) {
            whereClauses.push('status_code = ?');
            params.push(options.statusCode);
        }
        if (options.errorsOnly) {
            whereClauses.push('status_code >= 400');
        }

        const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM request_logs ${whereStr}`);
        const countRes: any = countStmt.get(...params);
        const total = Number(countRes?.total || 0);

        const listStmt = this.db.prepare(`
            SELECT * FROM request_logs
            ${whereStr}
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        `);
        const rows = listStmt.all(...params, limit, offset) as any[];

        const logs: RequestLogEntry[] = rows.map((r) => ({
            id: String(r.id),
            timestamp: Number(r.timestamp),
            createdAt: String(r.created_at),
            ip: String(r.ip),
            method: String(r.method),
            endpoint: String(r.endpoint),
            targetUrl: r.target_url ? String(r.target_url) : undefined,
            targetDomain: r.target_domain ? String(r.target_domain) : undefined,
            statusCode: Number(r.status_code),
            durationMs: Number(r.duration_ms),
            userAgent: r.user_agent ? String(r.user_agent) : undefined,
            responseBytes: Number(r.response_bytes || 0),
            isBatch: Boolean(r.is_batch),
            batchCount: Number(r.batch_count || 0),
            errorMessage: r.error_message ? String(r.error_message) : undefined,
        }));

        return { total, logs };
    }

    public exportLogs(options: {
        sinceMs?: number;
        untilMs?: number;
        limit?: number;
    } = {}): RequestLogEntry[] {
        this.ensureDatabase();
        this.flush();
        if (!this.db) return [];

        const limit = Math.min(10000, Math.max(1, options.limit || 1000));
        const sinceMs = options.sinceMs || (Date.now() - 86400000);
        const untilMs = options.untilMs || Date.now();

        const stmt = this.db.prepare(`
            SELECT * FROM request_logs
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp ASC
            LIMIT ?
        `);
        const rows = stmt.all(sinceMs, untilMs, limit) as any[];

        return rows.map((r) => ({
            id: String(r.id),
            timestamp: Number(r.timestamp),
            createdAt: String(r.created_at),
            ip: String(r.ip),
            method: String(r.method),
            endpoint: String(r.endpoint),
            targetUrl: r.target_url ? String(r.target_url) : undefined,
            targetDomain: r.target_domain ? String(r.target_domain) : undefined,
            statusCode: Number(r.status_code),
            durationMs: Number(r.duration_ms),
            userAgent: r.user_agent ? String(r.user_agent) : undefined,
            responseBytes: Number(r.response_bytes || 0),
            isBatch: Boolean(r.is_batch),
            batchCount: Number(r.batch_count || 0),
            errorMessage: r.error_message ? String(r.error_message) : undefined,
        }));
    }

    public async backupPreviousDayToS3(dateParam?: string): Promise<string | null> {
        if (!this.s3BackupEnabled || !this.s3Bucket || !this.db) {
            return null;
        }

        this.flush();

        let dateStr: string;
        let yStart: number;
        let yEnd: number;

        if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            dateStr = dateParam;
            const [y, m, d] = dateParam.split('-').map(Number);
            yStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).getTime();
            yEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)).getTime();
        } else if (dateParam === 'today' || dateParam === 'now') {
            const now = new Date();
            dateStr = now.toISOString().slice(0, 10);
            yStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).getTime();
            yEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).getTime();
        } else {
            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            dateStr = yesterday.toISOString().slice(0, 10);
            yStart = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 0, 0, 0, 0)).getTime();
            yEnd = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 23, 59, 59, 999)).getTime();
        }

        const rowsStmt = this.db.prepare('SELECT * FROM request_logs WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC');
        const rows = rowsStmt.all(yStart, yEnd);

        if (rows.length === 0) {
            this.logger.info(`No logs found for S3 backup on date ${dateStr}`);
            return null;
        }

        const ndjsonLines = rows.map((r) => JSON.stringify(r)).join('\n');
        const buffer = Buffer.from(ndjsonLines, 'utf-8');

        const [year, month, day] = dateStr.split('-');
        const objectName = `${this.s3Prefix}year=${year}/month=${month}/day=${day}/logs-${dateStr}.ndjson`;

        let endpointUrl = this.s3Endpoint || 's3.amazonaws.com';
        let useSSL = true;
        let port: number | undefined = undefined;

        if (endpointUrl.startsWith('http://') || endpointUrl.startsWith('https://')) {
            const parsed = new URL(endpointUrl);
            useSSL = parsed.protocol === 'https:';
            endpointUrl = parsed.hostname;
            if (parsed.port) {
                port = parseInt(parsed.port, 10);
            }
        }

        const minioClient = new Minio.Client({
            endPoint: endpointUrl,
            port,
            useSSL,
            accessKey: this.s3AccessKey,
            secretKey: this.s3SecretKey,
            region: this.s3Region,
        });

        await minioClient.putObject(this.s3Bucket, objectName, buffer, buffer.length, {
            'Content-Type': 'application/x-ndjson',
            'x-amz-meta-record-count': rows.length.toString(),
            'x-amz-meta-date': dateStr,
        });

        this.logger.info(`Successfully backed up ${rows.length} request logs to s3://${this.s3Bucket}/${objectName}`);
        return `s3://${this.s3Bucket}/${objectName}`;
    }

    public makeKoaMiddleware() {
        return async (ctx: Context, next: Next) => {
            if (!this.enabled && !this.rateLimitEnabled && this.blockedIps.size === 0) {
                return next();
            }

            const clientIp = (ctx.get('x-forwarded-for')?.split(',')?.[0]?.trim()) || ctx.ip || '127.0.0.1';

            if (this.isIpBlocked(clientIp)) {
                ctx.status = 403;
                ctx.body = { error: 'Forbidden: IP address is blocked' };
                return;
            }

            if (this.isRateLimited(clientIp)) {
                ctx.status = 429;
                ctx.set('Retry-After', '60');
                ctx.body = { error: 'Too Many Requests: Rate limit exceeded (60 requests/minute)' };
                return;
            }

            const { targetUrl, targetDomain, isBatch, batchCount } = this.parseTargetInfo(ctx);

            if (this.isDomainBlocked(targetDomain)) {
                ctx.status = 403;
                ctx.body = { error: `Forbidden: Target domain '${targetDomain}' is restricted` };
                return;
            }

            if (!this.enabled) {
                return next();
            }

            const startTime = Date.now();
            const logId = randomUUID();
            let errorMessage: string | undefined;

            try {
                await next();
            } catch (err: any) {
                errorMessage = err?.readableMessage || err?.message || String(err);
                throw err;
            } finally {
                const durationMs = Date.now() - startTime;
                const statusCode = ctx.status || 200;
                let responseBytes = 0;

                const lenHeader = ctx.get('content-length');
                if (lenHeader) {
                    responseBytes = parseInt(lenHeader, 10) || 0;
                } else if (typeof ctx.body === 'string') {
                    responseBytes = Buffer.byteLength(ctx.body);
                } else if (Buffer.isBuffer(ctx.body)) {
                    responseBytes = ctx.body.length;
                }

                this.recordLog({
                    id: logId,
                    timestamp: startTime,
                    createdAt: new Date(startTime).toISOString(),
                    ip: clientIp,
                    method: ctx.method,
                    endpoint: ctx.path,
                    targetUrl,
                    targetDomain,
                    statusCode,
                    durationMs,
                    userAgent: ctx.get('user-agent') || undefined,
                    responseBytes,
                    isBatch,
                    batchCount,
                    errorMessage,
                });
            }
        };
    }

    public makeAdminRouteController() {
        return async (ctx: Context, next: Next) => {
            const requestPath = ctx.path.toLowerCase();

            if (!requestPath.startsWith('/api/stats') && !requestPath.startsWith('/api/abuse')) {
                return next();
            }

            if (this.adminApiKey) {
                const headerKey = ctx.get('x-admin-key') || ctx.get('x-api-key');
                const authHeader = ctx.get('authorization');
                const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

                if (headerKey !== this.adminApiKey && bearerToken !== this.adminApiKey) {
                    ctx.status = 401;
                    ctx.body = { error: 'Unauthorized: Invalid or missing admin API key' };
                    return;
                }
            }

            if (requestPath === '/api/stats' || requestPath === '/api/abuse/stats') {
                const rangeStr = (ctx.query.range as string) || '24h';
                let rangeMs = 24 * 60 * 60 * 1000;
                if (rangeStr === '1h') rangeMs = 60 * 60 * 1000;
                else if (rangeStr === '7d') rangeMs = 7 * 24 * 60 * 60 * 1000;
                else if (rangeStr === '30d') rangeMs = 30 * 24 * 60 * 60 * 1000;
                else if (parseInt(rangeStr, 10)) rangeMs = parseInt(rangeStr, 10) * 1000;

                const topLimit = Math.min(100, Math.max(1, parseInt((ctx.query.top as string) || '10', 10)));
                ctx.body = this.getSummaryStats(rangeMs, topLimit);
                return;
            }

            if (requestPath === '/api/stats/logs' || requestPath === '/api/abuse/logs') {
                const limit = parseInt((ctx.query.limit as string) || '50', 10);
                const offset = parseInt((ctx.query.offset as string) || '0', 10);
                const ip = ctx.query.ip ? String(ctx.query.ip) : undefined;
                const domain = ctx.query.domain ? String(ctx.query.domain) : undefined;
                const statusCode = ctx.query.status ? parseInt(String(ctx.query.status), 10) : undefined;
                const errorsOnly = ctx.query.errorsOnly === 'true' || ctx.query.errors === 'true';

                ctx.body = this.getRecentLogs({ limit, offset, ip, targetDomain: domain, statusCode, errorsOnly });
                return;
            }

            if (requestPath === '/api/stats/export') {
                const limit = Math.min(10000, parseInt((ctx.query.limit as string) || '1000', 10));
                const res = this.getRecentLogs({ limit });
                const format = ctx.query.format || 'json';

                if (format === 'ndjson') {
                    ctx.type = 'application/x-ndjson';
                    ctx.body = res.logs.map((l) => JSON.stringify(l)).join('\n') + '\n';
                } else {
                    ctx.body = res;
                }
                return;
            }

            if (requestPath === '/api/stats/backup' && ctx.method === 'POST') {
                if (!this.s3BackupEnabled || !this.s3Bucket) {
                    ctx.status = 400;
                    ctx.body = { error: 'S3 backup is not enabled or S3_LOG_BUCKET is not configured' };
                    return;
                }
                const todayVal = String(ctx.query.today || ctx.query.now || '').toLowerCase();
                const isToday = todayVal === 'true' || todayVal === '1' || todayVal === 'yes';
                const dateParam = (ctx.query.date as string) || (isToday ? 'today' : undefined);
                const s3Uri = await this.backupPreviousDayToS3(dateParam);
                ctx.body = { success: true, s3Uri };
                return;
            }

            return next();
        };
    }
}
