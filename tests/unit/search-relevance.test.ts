import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRelevantSearchResults, isSearchResultRelevant, normalizeSearchQuery } from '../../build/services/serp/relevance.js';

describe('search result relevance', () => {
    it('normalizes pasted whitespace', () => {
        assert.equal(normalizeSearchQuery('  david888\n\t site:example.com  '), 'david888 site:example.com');
    });

    it('rejects a provider default page that does not mention the query', () => {
        assert.equal(isSearchResultRelevant('david888', {
            title: '東京の天気予報 - ウェザーニュース',
            snippet: '今日の天気と週間予報を掲載しています。',
            link: 'https://weathernews.jp/onebox/tenki/tokyo/',
        }), false);
    });

    it('keeps a result whose title matches the query', () => {
        assert.equal(isSearchResultRelevant('david888', {
            title: 'David888 official site',
            snippet: 'Profile and links',
            link: 'https://example.com/david888',
        }), true);
    });

    it('supports CJK queries', () => {
        assert.equal(isSearchResultRelevant('台積電', {
            title: '台積電公布最新消息',
            snippet: '台灣積體電路製造股份有限公司',
            link: 'https://example.com/news',
        }), true);
    });

    it('filters only unrelated results', () => {
        const results = filterRelevantSearchResults('david888', [
            { title: 'David888', snippet: '', link: 'https://example.com/david888' },
            { title: 'Weather forecast', snippet: '', link: 'https://weather.example.com/' },
        ]);
        assert.deepEqual(results.map((result) => result.title), ['David888']);
    });
});
