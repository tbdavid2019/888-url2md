import { DeepCrawlOptions, validateDeepCrawlOptions } from '../dto/advanced-crawl-options';

export interface DeepCrawlPage<T> {
    url: string;
    depth: number;
    links: string[];
    value?: T;
    error?: string;
}

export interface DeepCrawlFetchResult<T> {
    links: string[];
    value?: T;
    blocked?: boolean;
    retryAfterMs?: number;
}

export interface DeepCrawlProgress {
    visited: number;
    queued: number;
    completed: number;
    url: string;
    depth: number;
}

export interface DeepCrawlCheckpointState<T> {
    version: 1;
    queue: { url: string; depth: number }[];
    visited: string[];
    pages: DeepCrawlPage<T>[];
}

export interface DeepCrawlCheckpointStore<T> {
    load(): Promise<DeepCrawlCheckpointState<T> | undefined>;
    save(state: DeepCrawlCheckpointState<T>): Promise<void>;
    clear(): Promise<void>;
}

export interface DeepCrawlRuntimeOptions<T> {
    checkpoint?: DeepCrawlCheckpointStore<T>;
    checkpointIntervalMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => number;
}

function wildcardToRegExp(pattern: string) {
    return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
}

function normalizeUrl(rawUrl: string) {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new TypeError(`Unsupported crawl URL protocol: ${url.protocol}`);
    }
    url.hash = '';
    return url.href;
}

function matchesAny(value: string, patterns: string[]) {
    return patterns.length > 0 && patterns.some((pattern) => wildcardToRegExp(pattern).test(value));
}

export async function deepCrawl<T>(
    startUrl: string,
    rawOptions: DeepCrawlOptions,
    fetchPage: (url: string, context: { depth: number; prefetch: boolean }) => Promise<DeepCrawlFetchResult<T>>,
    signal?: AbortSignal,
    onProgress?: (progress: DeepCrawlProgress) => void,
    runtime: DeepCrawlRuntimeOptions<T> = {},
) {
    const options = validateDeepCrawlOptions(rawOptions);
    const rootUrl = normalizeUrl(startUrl);
    const root = new URL(rootUrl);
    const allowedDomains = options.allowedDomains.length ? options.allowedDomains.map((domain) => domain.toLowerCase()) : [root.hostname.toLowerCase()];
    const now = runtime.now || (() => Date.now());
    const sleep = runtime.sleep || ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const queue: { url: string; depth: number }[] = [{ url: rootUrl, depth: 0 }];
    const visited = new Set<string>();
    const pages: DeepCrawlPage<T>[] = [];
    const restored = await runtime.checkpoint?.load().catch(() => undefined);
    if (restored?.version === 1 && Array.isArray(restored.queue) && Array.isArray(restored.visited) && Array.isArray(restored.pages)) {
        queue.splice(0, queue.length, ...restored.queue);
        restored.visited.forEach((url) => typeof url === 'string' && visited.add(url));
        pages.push(...restored.pages);
    }
    const deadline = now() + options.maxDurationMs;
    const nextAllowedAt = new Map<string, number>();
    const delays = new Map<string, number>();
    let lastCheckpointAt = now();

    const throttleBefore = async (domain: string) => {
        if (!options.autoThrottle) return;
        const delay = delays.get(domain) ?? options.startDelayMs;
        const current = now();
        const scheduledAt = Math.max(current, nextAllowedAt.get(domain) ?? current);
        nextAllowedAt.set(domain, scheduledAt + delay);
        const waitMs = scheduledAt - current;
        if (waitMs > 0) await sleep(waitMs);
    };

    const throttleAfter = (domain: string, latencyMs: number, healthy: boolean, retryAfterMs?: number) => {
        if (!options.autoThrottle) return;
        const currentDelay = delays.get(domain) ?? options.startDelayMs;
        const targetDelay = latencyMs / options.targetConcurrency;
        let nextDelay = Math.max((currentDelay + targetDelay) / 2, targetDelay);
        if (!healthy) {
            nextDelay = Math.max(nextDelay, retryAfterMs ?? currentDelay * 2, currentDelay);
        }
        nextDelay = Math.min(Math.max(nextDelay, options.startDelayMs), options.maxDelayMs);
        delays.set(domain, nextDelay);
        nextAllowedAt.set(domain, Math.max(nextAllowedAt.get(domain) ?? now(), now()) + nextDelay);
    };

    const saveCheckpoint = async (force = false) => {
        if (!runtime.checkpoint) return;
        const current = now();
        const interval = runtime.checkpointIntervalMs ?? 5_000;
        if (!force && current - lastCheckpointAt < interval) return;
        lastCheckpointAt = current;
        await runtime.checkpoint.save({ version: 1, queue: [...queue], visited: [...visited], pages: [...pages] }).catch(() => undefined);
    };

    while (queue.length && pages.length < options.maxPages && now() < deadline) {
        if (signal?.aborted) break;

        const batch: { url: string; depth: number }[] = [];
        const deferred: { url: string; depth: number }[] = [];
        const domainsInBatch = new Map<string, number>();
        while (queue.length && batch.length < options.concurrency) {
            const entry = queue.shift()!;
            if (visited.has(entry.url) || entry.depth > options.maxDepth) continue;
            const parsed = new URL(entry.url);
            if (!allowedDomains.includes(parsed.hostname.toLowerCase()) || matchesAny(entry.url, options.excludePatterns)) continue;
            if (entry.depth > 0 && options.includePatterns.length && !matchesAny(entry.url, options.includePatterns)) continue;
            const domain = parsed.hostname.toLowerCase();
            if ((domainsInBatch.get(domain) || 0) >= options.concurrencyPerDomain) {
                deferred.push(entry);
                continue;
            }
            visited.add(entry.url);
            domainsInBatch.set(domain, (domainsInBatch.get(domain) || 0) + 1);
            batch.push(entry);
            onProgress?.({ visited: visited.size, queued: queue.length + deferred.length, completed: pages.length, url: entry.url, depth: entry.depth });
        }
        queue.unshift(...deferred.reverse());
        if (!batch.length) break;

        const completed = await Promise.all(batch.map(async (entry) => {
            const domain = new URL(entry.url).hostname.toLowerCase();
            await throttleBefore(domain);
            const startedAt = now();
            try {
                const fetched = await fetchPage(entry.url, { depth: entry.depth, prefetch: options.prefetch });
                const links = fetched.links.map((link) => {
                    try { return normalizeUrl(link); } catch { return ''; }
                }).filter(Boolean);
                throttleAfter(domain, Math.max(0, now() - startedAt), !fetched.blocked, fetched.retryAfterMs);
                return { page: { url: entry.url, depth: entry.depth, links, value: fetched.value }, entry };
            } catch (error: any) {
                throttleAfter(domain, Math.max(0, now() - startedAt), false);
                return { page: { url: entry.url, depth: entry.depth, links: [], error: error?.message || String(error) }, entry };
            }
        }));

        for (const { page, entry } of completed) {
            pages.push(page);
            if (entry.depth < options.maxDepth) {
                for (const link of page.links) {
                    if (!visited.has(link) && !queue.some((queued) => queued.url === link)) {
                        queue.push({ url: link, depth: entry.depth + 1 });
                    }
                }
            }
            onProgress?.({ visited: visited.size, queued: queue.length, completed: pages.length, url: entry.url, depth: entry.depth });
        }
        await saveCheckpoint();
    }

    if (signal?.aborted || (queue.length && now() >= deadline)) {
        await saveCheckpoint(true);
    } else if (runtime.checkpoint) {
        await runtime.checkpoint.clear().catch(() => undefined);
    }
    return pages;
}
