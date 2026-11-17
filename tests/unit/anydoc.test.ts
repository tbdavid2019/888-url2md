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

    it('rejects empty/image-only PDF bytes with needsOcr or conversion error rather than dropping pages', async () => {
        const anyDoc = new AnyDocService({ child: () => ({}) } as any);
        // Minimal PDF with 1 empty page (no extractable text)
        const emptyPagePdf = Buffer.from(
            '%PDF-1.4\n' +
            '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
            '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
            '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
            'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n' +
            'trailer<</Size 4/Root 1 0 R>>\nstartxref\n168\n%%EOF\n'
        );
        await assert.rejects(
            () => anyDoc.convertBytes(emptyPagePdf, 'scan.pdf'),
            (err: any) => err instanceof Error && ((err as any).code === 'needsOcr' || /need OCR|malformed|empty/i.test(err.message))
        );
    });
});
