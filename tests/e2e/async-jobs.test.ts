import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAgent } from '../helpers/client';

describe('async crawl job controls', () => {
    it('accepts POST cancel and resume routes with the job token', async () => {
        const created = await getAgent()
            .post('/')
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json')
            .send({
                url: 'https://example.com/async-job-test',
                html: '<main><a href="https://example.com/async-job-test/next">Next</a></main>',
                asyncJob: true,
                deepCrawl: { maxDepth: 1, maxPages: 10 },
            });
        assert.equal(created.status, 200);
        const job = created.body.data;
        assert.equal(typeof job.id, 'string');
        assert.equal(typeof job.accessToken, 'string');

        const cancelled = await getAgent()
            .post(`/jobs/${job.id}/cancel`)
            .set('Accept', 'application/json')
            .set('X-Job-Token', job.accessToken);
        assert.equal(cancelled.status, 200);
        assert.equal(typeof cancelled.body.data.cancelled, 'boolean');

        if (cancelled.body.data.cancelled) {
            let state = 'running';
            for (let attempt = 0; attempt < 20 && state === 'running'; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, 10));
                const current = await getAgent()
                    .get(`/jobs/${job.id}`)
                    .set('Accept', 'application/json')
                    .set('X-Job-Token', job.accessToken);
                state = current.body.data.status;
            }
            assert.equal(state, 'cancelled');
            const resumed = await getAgent()
                .post(`/jobs/${job.id}/resume`)
                .set('Accept', 'application/json')
                .set('X-Job-Token', job.accessToken);
            assert.equal(resumed.status, 200);
            assert.equal(resumed.body.data.resumed, true);
        }
    });
});
