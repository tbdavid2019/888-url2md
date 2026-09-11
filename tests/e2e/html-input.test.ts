/**
 * E2E tests for the direct HTML input path.
 *
 * These tests use small inline HTML strings rather than the shared fixture to
 * verify edge cases in the html→markdown pipeline independently of readability.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getAgent } from '../helpers/client';

async function crawlHtml(html: string, opts: Record<string, unknown> = {}) {
    return getAgent()
        .post('/')
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .send({ html, url: 'https://example.com/test', ...opts });
}

describe('minimal HTML input', () => {
    it('processes a bare paragraph', async () => {
        const res = await crawlHtml('<html><body><p>Hello world</p></body></html>');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.data.content.includes('Hello world'));
    });

    it('processes HTML with only a heading', async () => {
        const res = await crawlHtml('<html><body><h1>Only Heading</h1></body></html>');
        assert.strictEqual(res.status, 200);
        assert.match(res.body.data.content, /Only Heading/);
    });
});

describe('HTML entity handling', () => {
    it('decodes &amp; to & in output', async () => {
        const res = await crawlHtml('<html><body><p>Tom &amp; Jerry</p></body></html>');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.data.content.includes('Tom & Jerry'));
    });

    it('decodes &lt; to < in output', async () => {
        const res = await crawlHtml('<html><body><p>1 &lt; 2</p></body></html>');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.data.content.includes('1 < 2'));
    });

    it('decodes &gt; to > in output', async () => {
        const res = await crawlHtml('<html><body><p>2 &gt; 1</p></body></html>');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.data.content.includes('2 > 1'));
    });
});

describe('unicode content', () => {
    it('preserves Japanese characters', async () => {
        const res = await crawlHtml('<html><body><p>日本語テスト</p></body></html>');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.data.content.includes('日本語テスト'));
    });

    it('preserves emoji characters', async () => {
        const res = await crawlHtml('<html><body><p>Hello 🌍 World</p></body></html>');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.data.content.includes('🌍'));
    });
});

describe('nested document structure', () => {
    it('extracts headings from nested article/section elements', async () => {
        const html = `<html><body>
          <article><h1>Top Level</h1><section><h2>Sub Section</h2><p>Body text</p></section></article>
        </body></html>`;
        const res = await crawlHtml(html);
        assert.strictEqual(res.status, 200);
        assert.match(res.body.data.content, /Top Level/);
        assert.match(res.body.data.content, /Sub Section/);
        assert.match(res.body.data.content, /Body text/);
    });
});

describe('output determinism', () => {
    it('identical HTML sent twice produces identical content', async () => {
        const html = '<html><body><h1>Deterministic</h1><p>Same every time.</p></body></html>';
        const [r1, r2] = await Promise.all([crawlHtml(html), crawlHtml(html)]);
        assert.strictEqual(r1.status, 200);
        assert.strictEqual(r2.status, 200);
        assert.strictEqual(r1.body.data.content, r2.body.data.content);
    });
});

describe('adaptive structured extraction through the HTTP API', () => {
    it('relocates extraction records after an inline HTML redesign', async () => {
        const extraction = {
            type: 'css',
            baseSelector: '.product',
            fields: [{ name: 'title', selector: 'h2' }],
        };
        const first = await crawlHtml('<article class="product" id="one"><h2>One</h2></article>', {
            adaptive: true,
            adaptiveId: 'html-product',
            extraction,
        });
        const second = await crawlHtml('<div class="card" data-id="one"><h2>One</h2></div>', {
            adaptive: true,
            adaptiveId: 'html-product',
            extraction,
        });

        assert.strictEqual(first.status, 200);
        assert.strictEqual(second.status, 200);
        assert.deepStrictEqual(second.body.data.extracted, [{ title: 'One' }]);
    });
});
