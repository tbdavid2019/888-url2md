import { randomUUID } from 'crypto';
import { singleton } from 'tsyringe';
import { AsyncService } from 'civkit/async-service';
import { assertSafeWebhookUrl, WebhookOptions } from '../dto/advanced-crawl-options';
import { GlobalLogger } from './logger';
import { lookup } from 'node:dns/promises';
import { isIPInNonPublicRange } from '../utils/ip';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobProgress {
    visited?: number;
    queued?: number;
    completed?: number;
    url?: string;
    depth?: number;
}

export interface CrawlJob<T = unknown> {
    id: string;
    status: JobStatus;
    createdAt: string;
    updatedAt: string;
    progress?: JobProgress;
    result?: T;
    error?: string;
}

type JobRunner<T> = (signal: AbortSignal, reportProgress: (progress: JobProgress) => void) => Promise<T>;

interface StoredJob<T> extends CrawlJob<T> {
    controller: AbortController;
    runner: JobRunner<T>;
    webhook?: WebhookOptions;
}

@singleton()
export class JobQueueService extends AsyncService {
    private readonly jobs = new Map<string, StoredJob<unknown>>();
    private readonly maxJobs = 100;
    private readonly retentionMs = 60 * 60 * 1000;

    logger = this.globalLogger.child({ service: this.constructor.name });

    constructor(protected globalLogger: GlobalLogger) {
        super(...arguments);
    }

    submit<T>(runner: JobRunner<T>, webhook?: WebhookOptions): CrawlJob<T> {
        this.prune();
        if (this.jobs.size >= this.maxJobs) {
            throw new Error('Job queue is full; retry later');
        }
        if (webhook) {
            webhook = { ...webhook, url: assertSafeWebhookUrl(webhook.url) };
        }
        const now = new Date().toISOString();
        const job: StoredJob<T> = {
            id: `crawl_${randomUUID()}`,
            status: 'queued',
            createdAt: now,
            updatedAt: now,
            controller: new AbortController(),
            runner,
            webhook,
        };
        this.jobs.set(job.id, job);
        void this.run(job);
        return this.publicJob(job);
    }

    get<T = unknown>(id: string): CrawlJob<T> | undefined {
        const job = this.jobs.get(id);
        return job ? this.publicJob(job) as CrawlJob<T> : undefined;
    }

    list() {
        this.prune();
        return [...this.jobs.values()].map((job) => this.publicJob(job));
    }

    stats() {
        const counts: Record<JobStatus, number> = {
            queued: 0,
            running: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
        };
        for (const job of this.list()) counts[job.status] += 1;
        return { total: Object.values(counts).reduce((sum, count) => sum + count, 0), counts };
    }

    cancel(id: string) {
        const job = this.jobs.get(id);
        if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) {
            return false;
        }
        job.controller.abort();
        if (job.status === 'queued') {
            job.status = 'cancelled';
            job.updatedAt = new Date().toISOString();
        }
        return true;
    }

    private publicJob<T>(job: StoredJob<T>): CrawlJob<T> {
        const { controller: _controller, runner: _runner, webhook: _webhook, ...publicJob } = job;
        return publicJob;
    }

    private async run<T>(job: StoredJob<T>) {
        job.status = 'running';
        job.updatedAt = new Date().toISOString();
        try {
            job.result = await job.runner(job.controller.signal, (progress) => {
                job.progress = progress;
                job.updatedAt = new Date().toISOString();
            });
            job.status = job.controller.signal.aborted ? 'cancelled' : 'completed';
        } catch (error: any) {
            job.status = job.controller.signal.aborted ? 'cancelled' : 'failed';
            job.error = error?.message || String(error);
        }
        job.updatedAt = new Date().toISOString();
        if (job.webhook) {
            await this.deliverWebhook(job);
        }
    }

    private async deliverWebhook(job: StoredJob<unknown>) {
        const webhookUrl = new URL(job.webhook!.url);
        const addresses = await lookup(webhookUrl.hostname, { all: true });
        if (addresses.some((address) => isIPInNonPublicRange(address.address))) {
            this.logger.warn('Webhook delivery blocked for non-public address', { jobId: job.id });
            return;
        }
        const payload = JSON.stringify(this.publicJob(job));
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                const response = await fetch(job.webhook!.url, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', ...(job.webhook!.headers || {}) },
                    body: payload,
                    signal: AbortSignal.timeout(10_000),
                });
                if (response.ok) return;
            } catch (error) {
                this.logger.warn('Webhook delivery failed', { jobId: job.id, attempt: attempt + 1, error: `${error}` });
            }
            await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 250));
        }
        this.logger.warn('Webhook delivery exhausted retries', { jobId: job.id });
    }

    private prune() {
        const expiry = Date.now() - this.retentionMs;
        for (const [id, job] of this.jobs) {
            if (Date.parse(job.updatedAt) < expiry) this.jobs.delete(id);
        }
    }
}
