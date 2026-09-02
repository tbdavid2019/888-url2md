import 'reflect-metadata';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AbuseMonitorService } from '../../build/services/abuse-monitor.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('AbuseMonitorService', () => {
    let tmpDir: string;
    let service: AbuseMonitorService;

    beforeEach(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuse-monitor-test-'));
        process.env.REQUEST_LOG_ENABLED = 'true';
        process.env.LOG_DB_PATH = path.join(tmpDir, 'test-logs.sqlite');
        process.env.RATE_LIMIT_ENABLED = 'true';
        process.env.RATE_LIMIT_MAX_PER_MINUTE = '3';
        process.env.RATE_LIMIT_EXEMPT_IPS = '127.0.0.1,::1';
        process.env.BLOCKED_IPS = '198.51.100.99,203.0.113.5';
        process.env.BLOCKED_DOMAINS = 'malicious-domain.com,spam-site.net';
        process.env.ADMIN_API_KEY = 'secret-test-key-123';

        service = new AbuseMonitorService({ child: () => ({ info: () => {}, error: () => {}, warn: () => {} }) } as any);
        await service.init();
    });

    afterEach(async () => {
        await service.standDown();
        delete process.env.REQUEST_LOG_ENABLED;
        delete process.env.LOG_DB_PATH;
        delete process.env.RATE_LIMIT_ENABLED;
        delete process.env.RATE_LIMIT_MAX_PER_MINUTE;
        delete process.env.RATE_LIMIT_EXEMPT_IPS;
        delete process.env.BLOCKED_IPS;
        delete process.env.BLOCKED_DOMAINS;
        delete process.env.ADMIN_API_KEY;

        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore temp dir cleanup errors
        }
    });

    it('records logs and computes summary statistics accurately', () => {
        const now = Date.now();
        service.recordLog({
            id: 'log-1',
            timestamp: now,
            createdAt: new Date(now).toISOString(),
            ip: '192.0.2.1',
            method: 'GET',
            endpoint: '/https://example.com/article',
            targetUrl: 'https://example.com/article',
            targetDomain: 'example.com',
            statusCode: 200,
            durationMs: 120,
            userAgent: 'Mozilla/5.0 Test',
            responseBytes: 4096,
            isBatch: false,
            batchCount: 0,
        });

        service.recordLog({
            id: 'log-2',
            timestamp: now + 10,
            createdAt: new Date(now + 10).toISOString(),
            ip: '192.0.2.2',
            method: 'POST',
            endpoint: '/v1/batch',
            targetUrl: 'https://blog.example.org',
            targetDomain: 'blog.example.org',
            statusCode: 500,
            durationMs: 350,
            userAgent: 'Python-Requests/2.28',
            responseBytes: 512,
            isBatch: true,
            batchCount: 2,
            errorMessage: 'Upstream timeout',
        });

        service.flush();

        const stats = service.getSummaryStats(3600000);
        assert.equal(stats.totalRequests, 2);
        assert.equal(stats.uniqueIps, 2);
        assert.equal(stats.errorCount, 1);
        assert.equal(stats.errorRatePercent, 50);
        assert.equal(stats.topTargetDomains.length, 2);

        const logsRes = service.getRecentLogs({ limit: 10 });
        assert.equal(logsRes.total, 2);
        assert.equal(logsRes.logs[0].id, 'log-2');
        assert.equal(logsRes.logs[0].isBatch, true);
    });

    it('enforces rate limiting per IP while respecting exempt IPs', () => {
        const testIp = '198.51.100.1';
        // Threshold is 3
        assert.equal(service.isRateLimited(testIp), false); // 1
        assert.equal(service.isRateLimited(testIp), false); // 2
        assert.equal(service.isRateLimited(testIp), false); // 3
        assert.equal(service.isRateLimited(testIp), true);  // 4 -> limited!

        // Exempt IP should never be limited
        assert.equal(service.isRateLimited('127.0.0.1'), false);
        assert.equal(service.isRateLimited('127.0.0.1'), false);
        assert.equal(service.isRateLimited('127.0.0.1'), false);
        assert.equal(service.isRateLimited('127.0.0.1'), false);
    });

    it('identifies blocked IPs and prohibited target domains', () => {
        assert.equal(service.isIpBlocked('198.51.100.99'), true);
        assert.equal(service.isIpBlocked('203.0.113.5'), true);
        assert.equal(service.isIpBlocked('1.1.1.1'), false);

        assert.equal(service.isDomainBlocked('malicious-domain.com'), true);
        assert.equal(service.isDomainBlocked('spam-site.net'), true);
        assert.equal(service.isDomainBlocked('example.com'), false);
    });

    it('parses target URL and domain from various request patterns', () => {
        const mockCtx1: any = {
            method: 'GET',
            path: '/https://news.ycombinator.com/item?id=123',
            querystring: '',
            get: () => '',
        };
        const info1 = service.parseTargetInfo(mockCtx1);
        assert.equal(info1.targetUrl, 'https://news.ycombinator.com/item?id=123');
        assert.equal(info1.targetDomain, 'news.ycombinator.com');
        assert.equal(info1.isBatch, false);

        const mockCtx2: any = {
            method: 'POST',
            path: '/v1/batch',
            querystring: '',
            request: { body: { urls: ['https://alpha.com', 'https://beta.com'] } },
            get: () => '',
        };
        const info2 = service.parseTargetInfo(mockCtx2);
        assert.equal(info2.isBatch, true);
        assert.equal(info2.batchCount, 2);
        assert.equal(info2.targetDomain, 'alpha.com');

        const mockCtx3: any = {
            method: 'GET',
            path: '/search',
            query: { q: 'artificial intelligence' },
            get: () => '',
        };
        const info3 = service.parseTargetInfo(mockCtx3);
        assert.equal(info3.targetDomain, 'serp:search');
    });

    it('handles admin controller endpoints and enforces API key authentication', async () => {
        const adminMiddleware = service.makeAdminRouteController();

        // 1. Unauthorized request to /api/stats
        const unauthCtx: any = {
            path: '/api/stats',
            query: {},
            get: () => '',
        };
        await adminMiddleware(unauthCtx, async () => {});
        assert.equal(unauthCtx.status, 401);

        // 2. Authorized request with X-Admin-Key
        const authCtx: any = {
            path: '/api/stats',
            query: { range: '1h' },
            get: (h: string) => (h === 'x-admin-key' ? 'secret-test-key-123' : ''),
        };
        await adminMiddleware(authCtx, async () => {});
        assert.equal(authCtx.body.totalRequests !== undefined, true);
    });
});
