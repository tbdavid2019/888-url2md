import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractStructuredData } from '../../build/services/structured-extractor.js';

describe('structured extraction', () => {
    it('extracts repeated records with CSS selectors', async () => {
        const result = await extractStructuredData(`
            <main>
              <article class="product"><h2>One</h2><a href="/one">Buy</a><span class="price">12</span></article>
              <article class="product"><h2>Two</h2><a href="/two">Buy</a><span class="price">18</span></article>
            </main>
        `, {
            type: 'css',
            baseSelector: '.product',
            fields: [
                { name: 'name', selector: 'h2' },
                { name: 'url', selector: 'a', type: 'attribute', attribute: 'href' },
                { name: 'price', selector: '.price', type: 'number' },
            ],
        });

        assert.deepEqual(result, [
            { name: 'One', url: '/one', price: 12 },
            { name: 'Two', url: '/two', price: 18 },
        ]);
    });

    it('supports XPath records and boolean conversion', async () => {
        const result = await extractStructuredData(
            '<root><item active="true"><title>One</title></item><item active="false"><title>Two</title></item></root>',
            {
                type: 'xpath',
                baseSelector: '//item',
                fields: [
                    { name: 'title', selector: './title' },
                    { name: 'active', selector: '.', type: 'boolean', attribute: 'active' },
                ],
            },
        );

        assert.deepEqual(result, [
            { title: 'One', active: true },
            { title: 'Two', active: false },
        ]);
    });

    it('rejects unsafe or invalid extraction schemas before parsing', async () => {
        await assert.rejects(() => extractStructuredData('<main />', {
            baseSelector: '*',
            fields: [{ name: 'x', selector: 'p' }],
        }), /match-all|selector/i);
    });
});
