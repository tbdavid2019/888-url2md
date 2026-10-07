// Run inside an isolated remote test container after npm run build.
// Private network access is limited to this test process's local HTTP fixture.
process.env.NODE_ENV = 'test';
process.env.ALLOW_PRIVATE_NETWORK = 'true';
process.env.MOLI_ENABLED = 'true';
require('reflect-metadata');
const exit = process.exit.bind(process);
const assert = require('node:assert/strict');
const http = require('node:http');
const supertest = require('supertest');
const finalizer = require('../build/services/finalizer').default;
const server = require('../build/stand-alone/crawl').default;
const browsers = require('../build/services/puppeteer').default;

async function main() {
    const expected = process.env.EXPECTED_BROWSER || 'moli';
    const fixture = http.createServer((_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (new URL(_request.url, 'http://127.0.0.1').pathname === '/deep-dom') {
            response.end(`<html><body><article><h1>DEEP_DOM_RENDERER_FIXTURE</h1>${'<div>'.repeat(400)}nested${'</div>'.repeat(400)}</article></body></html>`);
            return;
        }
        if (new URL(_request.url, 'http://127.0.0.1').pathname === '/deep-dom-visual') {
            response.end(`<html><body><article><h1>DEEP_DOM_VISUAL_FIXTURE</h1>${'<div>'.repeat(1300)}nested${'</div>'.repeat(1300)}</article></body></html>`);
            return;
        }
        response.end(`<html><head><title>Browser integration fixture</title></head><body><article>
            <h1>Browser engine fixture</h1><p>${'A deterministic article for browser integration. '.repeat(30)}</p>
            <p id="result"></p></article><script>
            setTimeout(() => { document.querySelector('#result').textContent = 'DYNAMIC_BROWSER_MARKER'; }, 250);
            </script></body></html>`);
    });
    await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${fixture.address().port}/article`;
    let peakChrome = 0;
    const sampling = setInterval(() => { peakChrome = Math.max(peakChrome, browsers.browserCapacity.chrome.active); }, 5);
    try {
        await server.serviceReady();
        const request = (extra = {}, targetUrl = url) => supertest(server.httpServer).post('/')
            .set('Accept', 'application/json').set('Host', 'reader-test.invalid').send({
                url: targetUrl, engine: 'browser', timeout: 30, waitForSelector: '#result:not(:empty)',
                cacheTolerance: 0, ...extra,
            });
        // Start the failure burst from a cold Chrome process to exercise shared launch.
        const responses = expected === 'moli' ? [await request()] : await Promise.all(Array.from({ length: 6 }, () => request()));
        const successful = responses.filter((response) => response.status === 200);
        assert.ok(successful.length > 0, JSON.stringify(responses.map((response) => response.body)));
        const first = successful[0];
        assert.equal(first.status, 200, JSON.stringify(first.body));
        assert.match(first.body.data.content, /DYNAMIC_BROWSER_MARKER/);
        if (expected === 'moli') {
            assert.equal(browsers.browser, undefined, 'Moli success should leave Chrome unstarted');
            const deep = await request({ waitForSelector: undefined }, `http://127.0.0.1:${fixture.address().port}/deep-dom`);
            assert.equal(deep.status, 200, JSON.stringify(deep.body));
            assert.match(deep.body.data.content, /DEEP_DOM_RENDERER_FIXTURE/);
            assert.equal(browsers.browser, undefined, 'deep DOM text extraction should stay on Moli without painting');
        }
        if (expected === 'chrome') {
            assert.ok(browsers.browser?.connected, 'Chrome fallback should be running');
            for (const response of responses) {
                if (response.status === 200) {
                    assert.match(response.body.data.content, /DYNAMIC_BROWSER_MARKER/);
                } else {
                    // Queue expiry is the expected backpressure during a cold-start burst.
                    assert.equal(response.status, 503, JSON.stringify(response.body));
                    assert.equal(response.body.status, 50303);
                    assert.match(response.body.message, /Browser queue (wait expired|is full)/);
                }
            }
            assert.ok(peakChrome <= Number(process.env.CHROME_CONCURRENCY || 2));
            assert.ok(peakChrome > 0);
        }
        const visual = await request({ respondWith: 'screenshot', waitForSelector: undefined }, `http://127.0.0.1:${fixture.address().port}/deep-dom-visual`);
        assert.equal(visual.status, 200, JSON.stringify(visual.body));
        assert.ok(browsers.browser?.connected, 'visual requests must use Chrome');
        // Give abandoned intermediate HTTP streams time to close their pages.
        for (let i = 0; i < 100 && (browsers.browserCapacity.chrome.active || browsers.browserCapacity.moli.active); i++) {
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.equal(browsers.browserCapacity.chrome.active, 0);
        assert.equal(browsers.browserCapacity.moli.active, 0);
        console.log(JSON.stringify({ expected, successful: successful.length, overloaded: responses.length - successful.length,
            visualChrome: true,
            peakChrome, capacity: browsers.browserCapacity, passed: true }));
    } finally {
        clearInterval(sampling);
        fixture.closeAllConnections();
        await new Promise((resolve) => fixture.close(resolve));
        await browsers.standDown();
        void finalizer.teardown();
    }
}
main().then(() => exit(0), (error) => { console.error(error); exit(1); });
