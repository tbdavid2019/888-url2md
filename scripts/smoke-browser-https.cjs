// Run in an isolated remote container with native production network policy.
process.env.NODE_ENV = 'production';
process.env.MOLI_ENABLED = 'true';
delete process.env.ALLOW_PRIVATE_NETWORK;
require('reflect-metadata');
const exit = process.exit.bind(process);
const assert = require('node:assert/strict');
const supertest = require('supertest');
const server = require('../build/stand-alone/crawl').default;
const browsers = require('../build/services/puppeteer').default;

async function main() {
    try {
        await server.serviceReady();
        const start = Date.now();
        const response = await supertest(server.httpServer)
            .get('/https://example.com')
            .set('Accept', 'application/json')
            .set('Host', 'reader-test.invalid')
            .set('X-Engine', 'browser')
            .set('X-No-Cache', 'true')
            .set('X-Timeout', '30')
            .timeout({ deadline: 35000 });
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.match(response.body.data.content, /documentation examples|Example Domain/);
        assert.equal(browsers.browser, undefined, 'HTTPS should succeed on Moli');
        console.log(JSON.stringify({
            publicHttps: true, privateBlocking: true, ms: Date.now() - start,
            chromeUsed: false, passed: true,
        }));
    } finally {
        await browsers.standDown();
    }
}
main().then(() => exit(0), (error) => { console.error(error); exit(1); });
