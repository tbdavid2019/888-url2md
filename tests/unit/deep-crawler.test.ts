import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepCrawl } from '../../build/services/deep-crawler.js';

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
        assert.equal(pages.length, 0);
    });
});
