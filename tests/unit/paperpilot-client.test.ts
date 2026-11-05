import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PaperPilotClientService } from '../../build/services/paperpilot-client.js';

describe('PaperPilotClientService: Pure-Rust PDF & OCR Gateway Client', () => {
    const createService = () => {
        const loggerMock = {
            child: () => ({
                info: () => {},
                warn: () => {},
                debug: () => {},
                error: () => {},
            }),
        };
        return new PaperPilotClientService(loggerMock as any);
    };

    it('initializes with unconfigured state when no endpoint is specified', () => {
        const service = createService();
        service.loadConfiguration('');

        assert.equal(service.isConfigured(), false);
        assert.equal(service.isAvailable(), false);

        const status = service.getStatus();
        assert.equal(status.configured, false);
        assert.equal(status.available, false);
        assert.equal(status.endpoint, undefined);
    });

    it('normalizes endpoint URL and parses configuration correctly', () => {
        const service = createService();
        service.loadConfiguration(' http://localhost:7823/// ');

        assert.equal(service.isConfigured(), true);
        assert.equal(service.isAvailable(), false); // Not probed yet

        const status = service.getStatus();
        assert.equal(status.configured, true);
        assert.equal(status.endpoint, 'http://localhost:7823');
        assert.equal(status.healthy, false);
    });

    it('honors PAPERPILOT_ENABLED flag', () => {
        const origEnabled = process.env.PAPERPILOT_ENABLED;
        try {
            process.env.PAPERPILOT_ENABLED = 'false';
            const service = createService();
            service.loadConfiguration('http://localhost:7823');

            assert.equal(service.isConfigured(), false);
            assert.equal(service.isAvailable(), false);
        } finally {
            if (origEnabled !== undefined) {
                process.env.PAPERPILOT_ENABLED = origEnabled;
            } else {
                delete process.env.PAPERPILOT_ENABLED;
            }
        }
    });

    it('successfully extracts Markdown and metadata from Tika-compatible JSON response', async () => {
        const service = createService();
        service.loadConfiguration('http://mock-paperpilot:7823');

        // Mock global fetch
        const origFetch = globalThis.fetch;
        try {
            // @ts-ignore
            globalThis.fetch = async (url: any, opts: any) => {
                const urlStr = String(url);
                if (urlStr.endsWith('/health') || urlStr.endsWith('/')) {
                    return new Response(JSON.stringify({ status: 'ok', version: '0.1.0' }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                if (urlStr.endsWith('/tika/json/md')) {
                    assert.equal(opts.method, 'PUT');
                    assert.equal(opts.headers['Content-Type'], 'application/pdf');
                    return new Response(JSON.stringify({
                        'tk:content': '# Financial Report 2026\n\n| Quarter | Revenue | Profit |\n|---|---|---|\n| Q1 | $10M | $2.5M |',
                        'dc:title': 'Q1 2026 Financial Report',
                        'xmpTPg:NPages': '12',
                        'Author': 'David Financial Corp',
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                return new Response('Not Found', { status: 404 });
            };

            const probed = await service.probeNode();
            assert.equal(probed, true);
            assert.equal(service.isAvailable(), true);

            const dummyPdf = Buffer.from('%PDF-1.4 dummy pdf binary content');
            const result = await service.extractMarkdown(dummyPdf, { fileName: 'report.pdf' });

            assert.ok(result);
            assert.ok(result.markdown.includes('# Financial Report 2026'));
            assert.ok(result.markdown.includes('| Quarter | Revenue | Profit |'));
            assert.equal(result.title, 'Q1 2026 Financial Report');
            assert.equal(result.pageCount, 12);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('falls back to /tika/text when /tika/json/md returns 404', async () => {
        const service = createService();
        service.loadConfiguration('http://mock-paperpilot:7823');

        const origFetch = globalThis.fetch;
        try {
            // @ts-ignore
            globalThis.fetch = async (url: any, opts: any) => {
                const urlStr = String(url);
                if (urlStr.endsWith('/health')) {
                    return new Response('OK', { status: 200 });
                }
                if (urlStr.endsWith('/tika/json/md')) {
                    return new Response('Endpoint not implemented', { status: 404 });
                }
                if (urlStr.endsWith('/tika/text')) {
                    return new Response('Plain extracted text from Rust PDF engine', {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain' },
                    });
                }
                return new Response('Not Found', { status: 404 });
            };

            await service.probeNode();
            assert.equal(service.isAvailable(), true);

            const dummyPdf = Buffer.from('%PDF-1.4 dummy pdf binary content');
            const result = await service.extractMarkdown(dummyPdf, { fileName: 'plain.pdf' });

            assert.ok(result);
            assert.equal(result.markdown, 'Plain extracted text from Rust PDF engine');
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('gracefully enters cooldown on repeated connection errors without throwing', async () => {
        const service = createService();
        service.loadConfiguration('http://unreachable-host:7823');

        const origFetch = globalThis.fetch;
        try {
            // @ts-ignore
            globalThis.fetch = async () => {
                throw new Error('Connection refused');
            };

            const probeResult = await service.probeNode();
            assert.equal(probeResult, false);
            assert.equal(service.isAvailable(), false);

            const dummyPdf = Buffer.from('%PDF-1.4 dummy content');
            const result = await service.extractMarkdown(dummyPdf);
            assert.equal(result, null);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('does not trigger node cooldown on HTTP 400 or 422 client errors', async () => {
        const service = createService();
        service.loadConfiguration('http://mock-paperpilot:7823');

        const origFetch = globalThis.fetch;
        try {
            // @ts-ignore
            globalThis.fetch = async (url: any) => {
                const urlStr = String(url);
                if (urlStr.endsWith('/health')) return new Response('OK', { status: 200 });
                if (urlStr.endsWith('/tika/json/md')) {
                    return new Response('Unprocessable Entity: Corrupt PDF', { status: 422 });
                }
                return new Response('Not Found', { status: 404 });
            };

            await service.probeNode();
            assert.equal(service.isAvailable(), true);

            const dummyPdf = Buffer.from('corrupt content');
            const result = await service.extractMarkdown(dummyPdf, { fileName: 'corrupt.pdf' });
            assert.equal(result, null);

            // Node should still be healthy because 422 is client's bad PDF, not server failure
            assert.equal(service.isAvailable(), true);
            const status = service.getStatus();
            assert.equal(status.healthy, true);
            assert.equal(status.inCooldown, false);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('supports array payload response from Tika 4 endpoints and resets failure counts', async () => {
        const service = createService();
        service.loadConfiguration('http://mock-paperpilot:7823');

        const origFetch = globalThis.fetch;
        try {
            // @ts-ignore
            globalThis.fetch = async (url: any, opts: any) => {
                const urlStr = String(url);
                if (urlStr.endsWith('/health')) return new Response('OK', { status: 200 });
                if (urlStr.endsWith('/tika/json/md')) {
                    // Check header truncation: fileName should be bounded to 200 chars
                    const headerFileName = opts.headers['X-File-Name'];
                    assert.ok(headerFileName.length <= 200 * 3); // percent-encoded bound

                    return new Response(JSON.stringify([{
                        'tk:content': '## Array Wrapped Content',
                        'dc:title': 'Array Document',
                    }]), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }
                return new Response('Not Found', { status: 404 });
            };

            await service.probeNode();
            assert.equal(service.isAvailable(), true);

            const longFileName = 'a'.repeat(500) + '.pdf';
            const dummyPdf = Buffer.from('%PDF-1.4 valid dummy');
            const result = await service.extractMarkdown(dummyPdf, { fileName: longFileName });

            assert.ok(result);
            assert.equal(result.markdown, '## Array Wrapped Content');
            assert.equal(result.title, 'Array Document');
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});
