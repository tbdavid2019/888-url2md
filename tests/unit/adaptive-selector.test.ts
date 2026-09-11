import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findAdaptiveElement, createAdaptiveSignature } from '../../build/services/adaptive-selector.js';

describe('adaptive selector', () => {
    it('relocates an element after classes, id, and ancestor structure change', async () => {
        const { parseHTML } = await import('linkedom');
        const oldDocument = parseHTML(`
            <div class="catalog"><article class="product" id="p1">
                <h3>Product 1</h3><p class="description">Description 1</p>
            </article></div>
        `).window.document;
        const newDocument = parseHTML(`
            <main class="new-catalog"><section class="product-wrapper"><article class="card new-class" data-id="p1">
                <div class="product-info"><h3>Product 1</h3><p class="new-description">Description 1</p></div>
            </article></section></main>
        `).window.document;

        const original = oldDocument.querySelector('#p1');
        assert.ok(original);
        const relocated = findAdaptiveElement(newDocument, createAdaptiveSignature(original), 0.6);

        assert.ok(relocated);
        assert.equal(relocated.element.getAttribute('data-id'), 'p1');
        assert.equal(relocated.element.querySelector('h3')?.textContent, 'Product 1');
        assert.ok(relocated.confidence >= 0.6);
    });

    it('rejects unrelated candidates below the confidence threshold', async () => {
        const { parseHTML } = await import('linkedom');
        const oldDocument = parseHTML('<article class="product"><h3>Product 1</h3></article>').window.document;
        const newDocument = parseHTML('<section><span>Unrelated content</span></section>').window.document;
        const original = oldDocument.querySelector('article');
        assert.ok(original);

        const relocated = findAdaptiveElement(newDocument, createAdaptiveSignature(original), 0.8);

        assert.equal(relocated, undefined);
    });
});
