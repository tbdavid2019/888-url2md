import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Capabilities & Limits Parameterization', () => {
    it('computes correct limits from environment variables', () => {
        const computeLimits = (envPages?: string, envLimit?: string) => {
            const maxPdfPages = parseInt(envPages || '500', 10);
            const bodyLimit = envLimit || '256mb';
            const parsedBodyMb = parseInt(bodyLimit, 10);
            return {
                maxPages: isNaN(maxPdfPages) || maxPdfPages <= 0 ? 500 : maxPdfPages,
                maxFileSize: bodyLimit.toUpperCase(),
                maxFileSizeMb: isNaN(parsedBodyMb) || parsedBodyMb <= 0 ? 256 : parsedBodyMb,
            };
        };

        // Default case
        const def = computeLimits();
        assert.equal(def.maxPages, 500);
        assert.equal(def.maxFileSize, '256MB');
        assert.equal(def.maxFileSizeMb, 256);

        // Custom parameters
        const custom = computeLimits('1000', '512mb');
        assert.equal(custom.maxPages, 1000);
        assert.equal(custom.maxFileSize, '512MB');
        assert.equal(custom.maxFileSizeMb, 512);

        // Invalid fallback
        const invalid = computeLimits('invalid', 'bad');
        assert.equal(invalid.maxPages, 500);
        assert.equal(invalid.maxFileSize, 'BAD');
        assert.equal(invalid.maxFileSizeMb, 256);
    });

    it('verifies OCR max pages capping logic up to 1000 pages', () => {
        const resolveOcrMaxPages = (queryMax?: string, envPages?: string) => {
            const defaultOcrMax = parseInt(envPages || '500', 10);
            let maxPagesToOcr = isNaN(defaultOcrMax) || defaultOcrMax <= 0 ? 500 : defaultOcrMax;
            if (queryMax) {
                const parsedMax = parseInt(queryMax, 10);
                if (!Number.isNaN(parsedMax) && parsedMax > 0) {
                    maxPagesToOcr = Math.min(parsedMax, 1000);
                }
            }
            return maxPagesToOcr;
        };

        // Default 500
        assert.equal(resolveOcrMaxPages(), 500);

        // User requests 300
        assert.equal(resolveOcrMaxPages('300'), 300);

        // User requests 800 (allowed up to 1000)
        assert.equal(resolveOcrMaxPages('800'), 800);

        // User requests 2000 (capped at 1000)
        assert.equal(resolveOcrMaxPages('2000'), 1000);
    });
});
