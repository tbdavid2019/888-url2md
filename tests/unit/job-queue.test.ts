import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JobQueueService } from '../../build/services/job-queue.js';

function makeQueue() {
    return new JobQueueService({ child: () => ({}) } as any);
}

async function waitFor(queue: JobQueueService, id: string) {
    for (let i = 0; i < 50; i += 1) {
        const job = queue.get(id);
        if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) return job;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('job did not finish in time');
}

describe('job queue', () => {
    it('runs a job and exposes progress without internal controls', async () => {
        const queue = makeQueue();
        const job = queue.submit(async (_signal, progress) => {
            progress({ completed: 1, url: 'https://example.com' });
            return { pages: 1 };
        });
        const result = await waitFor(queue, job.id);
        assert.equal(result.status, 'completed');
        assert.deepEqual(result.result, { pages: 1 });
        assert.deepEqual(result.progress, { completed: 1, url: 'https://example.com' });
        assert.equal((result as any).controller, undefined);
    });

    it('cancels a running job through AbortSignal', async () => {
        const queue = makeQueue();
        const job = queue.submit(async (signal) => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            if (signal.aborted) throw new Error('cancelled');
            return 'done';
        });
        assert.equal(queue.cancel(job.id), true);
        const result = await waitFor(queue, job.id);
        assert.equal(result.status, 'cancelled');
    });

    it('reports queue statistics without exposing runners or webhooks', () => {
        const queue = makeQueue();
        const job = queue.submit(async () => 'done');
        const listed = queue.list();
        assert.equal(listed[0].id, job.id);
        assert.equal(queue.stats().total, 1);
        assert.equal((listed[0] as any).runner, undefined);
    });
});
