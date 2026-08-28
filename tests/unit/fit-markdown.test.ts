import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFitMarkdown } from '../../build/services/fit-markdown.js';
import { FormattedPageDto } from '../../build/services/snapshot-formatter.js';

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

    it('serializes raw and fit markdown alongside the selected content', () => {
        const result = FormattedPageDto.from({
            url: 'https://example.com',
            content: 'fit content',
            rawMarkdown: 'raw content',
            fitMarkdown: 'fit content',
        }) as FormattedPageDto;
        assert.equal(result.rawMarkdown, 'raw content');
        assert.equal(result.fitMarkdown, 'fit content');
    });
});
