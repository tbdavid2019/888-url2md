import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepCrawl, DeepCrawlCheckpointState } from '../../build/services/deep-crawler.js';

describe('deep crawler', () => {
    it('crawls breadth-first within a domain and page limit', async () => {
        const depthByUrl: Record<string, string[]> = {
            'https://example.com/': ['https://example.com/a', 'https://example.com/b', 'https://other.example/a'],
            'https://example.com/a': ['https://example.com/a/child'],
            'https://example.com/b': [],
        };
        const seen: string[] = [];
        const pages = await deepCrawl('https://example.com/', { maxDepth: 1, maxPages: 3 }, async (url) => {
            seen.push(url);
            return { links: depthByUrl[url] || [] };
        });
        assert.deepEqual(seen, ['https://example.com/', 'https://example.com/a', 'https://example.com/b']);
        assert.equal(pages.length, 3);
        assert.equal(pages[1].depth, 1);
    });

    it('stops when cancelled and records isolated page errors', async () => {
        const controller = new AbortController();
        const pages = await deepCrawl('https://example.com/', { maxDepth: 2, maxPages: 10 }, async (url) => {
            controller.abort();
            if (url.endsWith('/')) throw new Error('temporary failure');
            return { links: [] };
        }, controller.signal);
        assert.equal(pages[0].error, 'temporary failure');
        assert.equal(pages.length, 1);
    });

    it('applies include and exclude URL patterns', async () => {
        const pages = await deepCrawl('https://example.com/', { maxDepth: 1, maxPages: 10, includePatterns: ['*docs*'], excludePatterns: ['*private*'] }, async () => ({
            links: ['https://example.com/docs/a', 'https://example.com/private/docs'],
        }));
        assert.deepEqual(pages.map((page) => page.url), ['https://example.com/', 'https://example.com/docs/a']);
    });

    it('respects global and per-domain concurrency limits', async () => {
        let active = 0;
        let maxActive = 0;
        const pages = await deepCrawl('https://example.com/', {
            maxDepth: 1,
            maxPages: 5,
            concurrency: 3,
            concurrencyPerDomain: 2,
        }, async (url) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            if (url.endsWith('/')) {
                return { links: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c', 'https://example.com/d'] };
            }
            return { links: [] };
        });

        assert.equal(pages.length, 5);
        assert.equal(maxActive, 2);
    });

    it('backs off per domain when AutoThrottle is enabled', async () => {
        let now = 0;
        const waits: number[] = [];
        await deepCrawl('https://example.com/', {
            maxDepth: 1,
            maxPages: 2,
            autoThrottle: true,
            startDelayMs: 10,
            targetConcurrency: 1,
        }, async (url) => {
            now += 20;
            return { links: url.endsWith('/') ? ['https://example.com/a'] : [] };
        }, undefined, undefined, {
            now: () => now,
            sleep: async (milliseconds) => {
                waits.push(milliseconds);
                now += milliseconds;
            },
        });

        assert.ok(waits.some((milliseconds) => milliseconds >= 10));
    });

    it('saves an interrupted crawl and resumes from its checkpoint', async () => {
        let checkpoint: DeepCrawlCheckpointState<unknown> | undefined;
        let cleared = false;
        const store = {
            load: async () => checkpoint,
            save: async (state: DeepCrawlCheckpointState<unknown>) => { checkpoint = state; },
            clear: async () => { cleared = true; },
        };
        const controller = new AbortController();
        const first = await deepCrawl('https://example.com/', { maxDepth: 1, maxPages: 3 }, async (url) => {
            controller.abort();
            return { links: url.endsWith('/') ? ['https://example.com/a', 'https://example.com/b'] : [] };
        }, controller.signal, undefined, { checkpoint: store });

        assert.deepEqual(first.map((page) => page.url), ['https://example.com/']);
        assert.ok(checkpoint);
        assert.equal(cleared, false);

        const resumed = await deepCrawl('https://example.com/', { maxDepth: 1, maxPages: 3 }, async () => ({ links: [] }), undefined, undefined, { checkpoint: store });

        assert.deepEqual(resumed.map((page) => page.url), ['https://example.com/', 'https://example.com/a', 'https://example.com/b']);
        assert.equal(cleared, true);
    });
});
