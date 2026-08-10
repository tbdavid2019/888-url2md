import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnyDocService } from '../../build/services/anydoc.js';

describe('AnyDocService: format detection and conversion support', () => {
    it('correctly detects supported document extensions and MIME types', () => {
        const anyDoc = new AnyDocService({ child: () => ({}) } as any);

        assert.equal(anyDoc.supports(undefined, 'report.docx'), true);
        assert.equal(anyDoc.supports(undefined, 'presentation.pptx'), true);
        assert.equal(anyDoc.supports(undefined, 'data.xlsx'), true);
        assert.equal(anyDoc.supports(undefined, 'document.pdf'), true);
        assert.equal(anyDoc.supports(undefined, 'book.epub'), true);
        assert.equal(anyDoc.supports(undefined, 'doc.rtf'), true);
        assert.equal(anyDoc.supports(undefined, 'table.csv'), true);
        assert.equal(anyDoc.supports('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), true);
        assert.equal(anyDoc.supports('application/pdf'), true);
        assert.equal(anyDoc.supports(undefined, 'image.png'), false);
        assert.equal(anyDoc.supports(undefined, 'page.html'), false);
    });

    it('converts byte content of supported document format to Markdown', async () => {
        const anyDoc = new AnyDocService({ child: () => ({}) } as any);
        const csvContent = Buffer.from('Name,Age,Role\nAlice,30,Developer\nBob,25,Designer');
        const markdown = await anyDoc.convertBytes(csvContent, 'data.csv');
        assert.ok(typeof markdown === 'string');
        assert.match(markdown, /Alice/);
    });
});
