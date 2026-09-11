import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractStructuredData, extractStructuredDataDetailed } from '../../build/services/structured-extractor.js';
import { AdaptiveSelectorService } from '../../build/services/adaptive-selector-service.js';

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

    it('relocates CSS extraction records after a page redesign', async () => {
        const schema = {
            type: 'css' as const,
            baseSelector: '.product',
            fields: [
                { name: 'name', selector: 'h2' },
                { name: 'price', selector: '.price', type: 'number' as const },
            ],
        };
        const first = await extractStructuredDataDetailed(`
            <section><article class="product" id="one"><h2>One</h2><span class="price">12</span></article></section>
        `, schema);

        const changed = await extractStructuredDataDetailed(`
            <main><div class="catalog-card" data-product="one"><div class="info"><h2>One</h2><strong class="cost">12</strong></div></div></main>
        `, schema, first.profile);

        assert.deepEqual(changed.records, [{ name: 'One', price: 12 }]);
        assert.equal(changed.adaptiveUsed, true);
    });

    it('persists adaptive profiles through the configured storage layer', async () => {
        let stored: Buffer | undefined;
        const storage = {
            readFile: async () => {
                if (!stored) throw new Error('not found');
                return stored;
            },
            storeFile: async (_path: string, buffer: Buffer) => {
                stored = buffer;
            },
        };
        const service = new AdaptiveSelectorService(storage as any);
        const schema = {
            type: 'css' as const,
            baseSelector: '.product',
            fields: [
                { name: 'name', selector: 'h2' },
                { name: 'price', selector: '.price', type: 'number' as const },
            ],
        };

        await service.extract('<article class="product" id="one"><h2>One</h2><span class="price">12</span></article>', 'https://example.com/products/1', schema, {
            enabled: true,
            identifier: 'product-card',
        });

        assert.ok(stored);
        const secondService = new AdaptiveSelectorService(storage as any);
        const result = await secondService.extract('<div class="card" data-id="one"><h2>One</h2><strong class="cost">12</strong></div>', 'https://example.com/products/2', schema, {
            enabled: true,
            identifier: 'product-card',
        });
        assert.deepEqual(result, [{ name: 'One', price: 12 }]);

        const thirdService = new AdaptiveSelectorService(storage as any);
        const third = await thirdService.extract('<section class="tile" data-key="one"><h2>One</h2><b class="amount">12</b></section>', 'https://example.com/products/3', schema, {
            enabled: true,
            identifier: 'product-card',
        });
        assert.deepEqual(third, [{ name: 'One', price: 12 }]);
    });
});
