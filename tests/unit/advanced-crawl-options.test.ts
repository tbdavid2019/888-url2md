import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    assertSafeWebhookUrl,
    validateDeepCrawlOptions,
    validateStructuredExtractionSchema,
    validateVirtualScrollOptions,
} from '../../build/dto/advanced-crawl-options.js';

describe('advanced crawl option validation', () => {
    it('accepts a CSS extraction schema and applies safe defaults', () => {
        const result = validateStructuredExtractionSchema({
            baseSelector: '.product',
            fields: [{ name: 'title', selector: 'h2' }],
        });
        assert.equal(result.type, 'css');
    });

    it('rejects duplicate extraction field names', () => {
        assert.throws(() => validateStructuredExtractionSchema({
            baseSelector: '.product',
            fields: [
                { name: 'title', selector: 'h2' },
                { name: 'title', selector: '.name' },
            ],
        }), /unique/);
    });

    it('bounds deep crawl resource usage', () => {
        const result = validateDeepCrawlOptions({ maxDepth: 2, maxPages: 10 });
        assert.equal(result.maxDurationMs, 60_000);
        assert.throws(() => validateDeepCrawlOptions({ maxPages: 501 }), /between/);
    });

    it('bounds virtual scrolling', () => {
        assert.equal(validateVirtualScrollOptions({}).maxScrolls, 20);
        assert.throws(() => validateVirtualScrollOptions({ maxScrolls: 101 }), /between/);
    });

    it('only accepts HTTPS webhook URLs without localhost targets', () => {
        assert.equal(assertSafeWebhookUrl('https://hooks.example.com/crawl'), 'https://hooks.example.com/crawl');
        assert.throws(() => assertSafeWebhookUrl('http://hooks.example.com/crawl'), /HTTPS/);
        assert.throws(() => assertSafeWebhookUrl('https://localhost/crawl'), /localhost/);
        assert.throws(() => assertSafeWebhookUrl('https://127.0.0.1/crawl'), /localhost/);
    });
});
