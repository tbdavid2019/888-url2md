import { isIP } from 'node:net';
import { isIPInNonPublicRange } from '../utils/ip';

export const ADVANCED_CRAWL_LIMITS = {
    maxDepth: 5,
    maxPages: 500,
    maxDurationMs: 10 * 60 * 1000,
    maxFields: 50,
    maxSelectorLength: 500,
    maxScrolls: 100,
    maxConcurrency: 20,
    maxConcurrencyPerDomain: 10,
    maxThrottleDelayMs: 60_000,
} as const;

export type ExtractionFieldType = 'text' | 'html' | 'attribute' | 'number' | 'boolean';

export interface StructuredExtractionField {
    name: string;
    selector: string;
    type?: ExtractionFieldType;
    attribute?: string;
}

export interface StructuredExtractionSchema {
    type?: 'css' | 'xpath';
    baseSelector: string;
    fields: StructuredExtractionField[];
}

export interface AdaptiveExtractionOptions {
    enabled?: boolean;
    identifier?: string;
    threshold?: number;
}

export type ContentFilterMode = 'pruning' | 'bm25';

export interface DeepCrawlOptions {
    prefetch?: boolean;
    maxDepth?: number;
    maxPages?: number;
    maxDurationMs?: number;
    allowedDomains?: string[];
    includePatterns?: string[];
    excludePatterns?: string[];
    query?: string;
    concurrency?: number;
    concurrencyPerDomain?: number;
    autoThrottle?: boolean;
    startDelayMs?: number;
    maxDelayMs?: number;
    targetConcurrency?: number;
}

export interface VirtualScrollOptions {
    containerSelector?: string;
    maxScrolls?: number;
    scrollDelayMs?: number;
    stepPx?: number;
}

export interface WebhookOptions {
    url: string;
    headers?: Record<string, string>;
}

export interface AsyncJobOptions {
    webhook?: WebhookOptions;
}

function assertString(value: unknown, path: string, maxLength: number) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
        throw new TypeError(`${path} must be a non-empty string of at most ${maxLength} characters`);
    }
}

function assertBoundedInteger(value: unknown, path: string, min: number, max: number) {
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
        throw new TypeError(`${path} must be an integer between ${min} and ${max}`);
    }
}

function assertStringArray(value: unknown, path: string, maxItems: number) {
    if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== 'string' || !item.trim())) {
        throw new TypeError(`${path} must be an array of at most ${maxItems} non-empty strings`);
    }
}

export function validateStructuredExtractionSchema(schema: StructuredExtractionSchema) {
    if (!schema || typeof schema !== 'object') {
        throw new TypeError('extraction must be an object');
    }
    const type = schema.type || 'css';
    if (type !== 'css' && type !== 'xpath') {
        throw new TypeError('extraction.type must be css or xpath');
    }
    assertString(schema.baseSelector, 'extraction.baseSelector', ADVANCED_CRAWL_LIMITS.maxSelectorLength);
    if (!Array.isArray(schema.fields) || schema.fields.length === 0 || schema.fields.length > ADVANCED_CRAWL_LIMITS.maxFields) {
        throw new TypeError(`extraction.fields must contain between 1 and ${ADVANCED_CRAWL_LIMITS.maxFields} fields`);
    }
    const names = new Set<string>();
    for (const [index, field] of schema.fields.entries()) {
        const path = `extraction.fields[${index}]`;
        assertString(field?.name, `${path}.name`, 100);
        assertString(field?.selector, `${path}.selector`, ADVANCED_CRAWL_LIMITS.maxSelectorLength);
        if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(field.name) || names.has(field.name)) {
            throw new TypeError(`${path}.name must be unique and use letters, numbers, _, ., or -`);
        }
        names.add(field.name);
        const fieldType = field.type || 'text';
        if (!['text', 'html', 'attribute', 'number', 'boolean'].includes(fieldType)) {
            throw new TypeError(`${path}.type is unsupported`);
        }
        if (fieldType === 'attribute') {
            assertString(field.attribute, `${path}.attribute`, 100);
        }
    }
    return { ...schema, type };
}

export function validateAdaptiveExtractionOptions(options: AdaptiveExtractionOptions = {}) {
    const normalized = {
        enabled: options.enabled === true,
        identifier: options.identifier || '',
        threshold: options.threshold ?? 0.62,
    };
    if (typeof normalized.identifier !== 'string' || normalized.identifier.length > 128 ||
        (normalized.identifier && !/^[A-Za-z0-9._:-]+$/.test(normalized.identifier))) {
        throw new TypeError('adaptiveId must contain only safe identifier characters and be at most 128 characters');
    }
    if (typeof normalized.threshold !== 'number' || !Number.isFinite(normalized.threshold) ||
        normalized.threshold < 0.5 || normalized.threshold > 0.95) {
        throw new TypeError('adaptiveThreshold must be a number between 0.5 and 0.95');
    }
    return normalized;
}

export function validateDeepCrawlOptions(options: DeepCrawlOptions) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('deepCrawl must be an object');
    }
    const normalized = {
        prefetch: Boolean(options.prefetch),
        maxDepth: options.maxDepth ?? 1,
        maxPages: options.maxPages ?? 20,
        maxDurationMs: options.maxDurationMs ?? 60_000,
        allowedDomains: options.allowedDomains || [],
        includePatterns: options.includePatterns || [],
        excludePatterns: options.excludePatterns || [],
        query: options.query,
        concurrency: options.concurrency ?? 1,
        concurrencyPerDomain: options.concurrencyPerDomain ?? options.concurrency ?? 1,
        autoThrottle: options.autoThrottle ?? false,
        startDelayMs: options.startDelayMs ?? 250,
        maxDelayMs: options.maxDelayMs ?? 60_000,
        targetConcurrency: options.targetConcurrency ?? 1,
    };
    assertBoundedInteger(normalized.maxDepth, 'deepCrawl.maxDepth', 0, ADVANCED_CRAWL_LIMITS.maxDepth);
    assertBoundedInteger(normalized.maxPages, 'deepCrawl.maxPages', 1, ADVANCED_CRAWL_LIMITS.maxPages);
    assertBoundedInteger(normalized.maxDurationMs, 'deepCrawl.maxDurationMs', 1_000, ADVANCED_CRAWL_LIMITS.maxDurationMs);
    assertStringArray(normalized.allowedDomains, 'deepCrawl.allowedDomains', 50);
    assertStringArray(normalized.includePatterns, 'deepCrawl.includePatterns', 50);
    assertStringArray(normalized.excludePatterns, 'deepCrawl.excludePatterns', 50);
    if (normalized.query !== undefined) {
        assertString(normalized.query, 'deepCrawl.query', 500);
    }
    assertBoundedInteger(normalized.concurrency, 'deepCrawl.concurrency', 1, ADVANCED_CRAWL_LIMITS.maxConcurrency);
    assertBoundedInteger(normalized.concurrencyPerDomain, 'deepCrawl.concurrencyPerDomain', 1, ADVANCED_CRAWL_LIMITS.maxConcurrencyPerDomain);
    if (normalized.concurrencyPerDomain > normalized.concurrency) {
        normalized.concurrencyPerDomain = normalized.concurrency;
    }
    if (typeof normalized.autoThrottle !== 'boolean') {
        throw new TypeError('deepCrawl.autoThrottle must be a boolean');
    }
    assertBoundedInteger(normalized.startDelayMs, 'deepCrawl.startDelayMs', 0, ADVANCED_CRAWL_LIMITS.maxThrottleDelayMs);
    assertBoundedInteger(normalized.maxDelayMs, 'deepCrawl.maxDelayMs', normalized.startDelayMs, ADVANCED_CRAWL_LIMITS.maxThrottleDelayMs);
    if (typeof normalized.targetConcurrency !== 'number' || !Number.isFinite(normalized.targetConcurrency) || normalized.targetConcurrency <= 0 || normalized.targetConcurrency > normalized.concurrencyPerDomain) {
        throw new TypeError('deepCrawl.targetConcurrency must be greater than 0 and no greater than concurrencyPerDomain');
    }
    return normalized;
}

export function validateVirtualScrollOptions(options: VirtualScrollOptions) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('virtualScroll must be an object');
    }
    const normalized = {
        containerSelector: options.containerSelector,
        maxScrolls: options.maxScrolls ?? 20,
        scrollDelayMs: options.scrollDelayMs ?? 200,
        stepPx: options.stepPx ?? 0,
    };
    if (normalized.containerSelector !== undefined) {
        assertString(normalized.containerSelector, 'virtualScroll.containerSelector', ADVANCED_CRAWL_LIMITS.maxSelectorLength);
    }
    assertBoundedInteger(normalized.maxScrolls, 'virtualScroll.maxScrolls', 1, ADVANCED_CRAWL_LIMITS.maxScrolls);
    assertBoundedInteger(normalized.scrollDelayMs, 'virtualScroll.scrollDelayMs', 0, 5_000);
    assertBoundedInteger(normalized.stepPx, 'virtualScroll.stepPx', 0, 10_000);
    return normalized;
}

export function assertSafeWebhookUrl(rawUrl: string) {
    assertString(rawUrl, 'job.webhook.url', 2_048);
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new TypeError('job.webhook.url must be a valid URL');
    }
    if (url.protocol !== 'https:') {
        throw new TypeError('job.webhook.url must use HTTPS');
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (url.username || url.password || hostname === 'localhost' || (isIP(hostname) && isIPInNonPublicRange(hostname))) {
        throw new TypeError('job.webhook.url must not contain credentials or target localhost');
    }
    return url.href;
}
