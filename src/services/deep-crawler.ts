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
}

export interface DeepCrawlProgress {
    visited: number;
    queued: number;
    completed: number;
    url: string;
    depth: number;
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
) {
    const options = validateDeepCrawlOptions(rawOptions);
    const rootUrl = normalizeUrl(startUrl);
    const root = new URL(rootUrl);
    const allowedDomains = options.allowedDomains.length ? options.allowedDomains.map((domain) => domain.toLowerCase()) : [root.hostname.toLowerCase()];
    const queue: { url: string; depth: number }[] = [{ url: rootUrl, depth: 0 }];
    const visited = new Set<string>();
    const pages: DeepCrawlPage<T>[] = [];
    const deadline = Date.now() + options.maxDurationMs;

    while (queue.length && pages.length < options.maxPages && Date.now() < deadline) {
        if (signal?.aborted) {
            break;
        }
        const entry = queue.shift()!;
        if (visited.has(entry.url) || entry.depth > options.maxDepth) {
            continue;
        }
        const parsed = new URL(entry.url);
        if (!allowedDomains.includes(parsed.hostname.toLowerCase()) || matchesAny(entry.url, options.excludePatterns)) {
            continue;
        }
        if (options.includePatterns.length && !matchesAny(entry.url, options.includePatterns)) {
            continue;
        }
        visited.add(entry.url);
        onProgress?.({ visited: visited.size, queued: queue.length, completed: pages.length, url: entry.url, depth: entry.depth });

        try {
            const fetched = await fetchPage(entry.url, { depth: entry.depth, prefetch: options.prefetch });
            const links = fetched.links.map((link) => {
                try { return normalizeUrl(link); } catch { return ''; }
            }).filter(Boolean);
            pages.push({ url: entry.url, depth: entry.depth, links, value: fetched.value });
            if (entry.depth < options.maxDepth) {
                for (const link of links) {
                    if (!visited.has(link) && !queue.some((queued) => queued.url === link)) {
                        queue.push({ url: link, depth: entry.depth + 1 });
                    }
                }
            }
        } catch (error: any) {
            pages.push({ url: entry.url, depth: entry.depth, links: [], error: error?.message || String(error) });
        }
        onProgress?.({ visited: visited.size, queued: queue.length, completed: pages.length, url: entry.url, depth: entry.depth });
    }
    return pages;
}
