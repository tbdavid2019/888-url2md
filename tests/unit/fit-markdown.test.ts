import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFitMarkdown } from '../../build/services/fit-markdown.js';

describe('fit markdown', () => {
    const markdown = [
        '# Article title',
        'A useful article about web crawling and structured extraction.',
        '[Home](https://example.com) [Login](https://example.com/login)',
        'The crawler extracts product prices and descriptions from each page.',
        'Short.',
    ].join('\n\n');

    it('prunes link-heavy and very short blocks while keeping content', () => {
        const result = buildFitMarkdown(markdown, { mode: 'pruning' });
        assert.match(result, /Article title/);
        assert.match(result, /structured extraction/);
        assert.doesNotMatch(result, /Home/);
        assert.doesNotMatch(result, /Short\./);
    });

    it('keeps query-relevant blocks and their nearest heading', () => {
        const result = buildFitMarkdown(markdown, { mode: 'bm25', query: 'product prices' });
        assert.match(result, /Article title/);
        assert.match(result, /product prices/);
        assert.doesNotMatch(result, /structured extraction/);
    });

    it('falls back to pruning when BM25 has no matches', () => {
        const result = buildFitMarkdown(markdown, { mode: 'bm25', query: 'unrelated topic' });
        assert.match(result, /Article title/);
        assert.match(result, /structured extraction/);
    });
});
