import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { container } from 'tsyringe';
import { CurlControl } from '../../build/services/curl.js';
import { AsyncLocalContext } from '../../build/services/async-context.js';

describe('CurlControl: libcurl-impersonate 5.2+ native options', () => {
    it('fetches HTTP response with Chrome impersonation options and headers', async () => {
        const server = http.createServer((req, res) => {
            if (req.url === '/redirect') {
                res.writeHead(302, {
                    Location: '/final',
                    'Set-Cookie': 'session=abc123; Path=/; HttpOnly',
                });
                res.end();
                return;
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<html><body>ua=${req.headers['user-agent'] || ''};cookie=${req.headers.cookie || ''}</body></html>`);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

        try {
            const addr = server.address() as { port: number };
            const actx = container.resolve(AsyncLocalContext);
            const curl = container.resolve(CurlControl);
            await curl.serviceReady();
            curl.impersonateChrome('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');

            await actx.run(async () => {
                const result = await curl.urlToBlob(new URL(`http://127.0.0.1:${addr.port}/redirect`));
                assert.equal(result.statusCode, 200);
                assert.ok(result.data);
                const text = await result.data!.text();
                assert.match(text, /Chrome\/136\.0\.0\.0/);
                assert.match(text, /session=abc123/);
            });
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
