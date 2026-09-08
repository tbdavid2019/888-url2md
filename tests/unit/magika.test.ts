import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ensureTfjsNodeUtilCompatibility,
    magikaLabelToContentType,
    selectContentTypeFromMagika,
} from '../../build/services/magika.js';

describe('Magika content-type routing', () => {
    it('restores the removed Node utility required by tfjs-node', () => {
        const nodeUtil: { isNullOrUndefined?: (value: unknown) => boolean } = {};

        ensureTfjsNodeUtilCompatibility(nodeUtil);

        assert.equal(nodeUtil.isNullOrUndefined?.(null), true);
        assert.equal(nodeUtil.isNullOrUndefined?.(undefined), true);
        assert.equal(nodeUtil.isNullOrUndefined?.(0), false);
    });

    it('maps supported document labels to existing extractors', () => {
        assert.equal(magikaLabelToContentType('pdf', false), 'application/pdf');
        assert.equal(
            magikaLabelToContentType('docx', false),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
        assert.equal(
            magikaLabelToContentType('xlsx', false),
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
    });

    it('routes detected text labels through the existing text reader', () => {
        assert.equal(magikaLabelToContentType('javascript', true), 'text/plain');
        assert.equal(magikaLabelToContentType('markdown', true), 'text/plain');
        assert.equal(magikaLabelToContentType('html', true), 'text/html');
        assert.equal(magikaLabelToContentType('xml', true), 'application/xml');
    });

    it('keeps the original type when Magika cannot route the label', () => {
        assert.equal(magikaLabelToContentType('unknown', false), undefined);
        assert.equal(
            selectContentTypeFromMagika('application/octet-stream', 'zip', false),
            'application/octet-stream',
        );
    });

    it('corrects a mislabeled file when Magika has a supported output', () => {
        assert.equal(
            selectContentTypeFromMagika('text/html', 'pdf', false),
            'application/pdf',
        );
        assert.equal(
            selectContentTypeFromMagika('application/octet-stream', 'docx', false),
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
    });
});
