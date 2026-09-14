import 'reflect-metadata';
import { singleton } from 'tsyringe';
import { AsyncService } from 'civkit/async-service';
import { GlobalLogger } from './logger';
import { AssertionFailureError } from 'civkit/civ-rpc';
import { ServiceBadApproachError } from './errors';

export interface OcrNodeState {
    url: string;
    healthy: boolean;
    latencyMs?: number;
    lastChecked?: Date;
    consecutiveFailures: number;
    cooldownUntil: number;
}

export interface OcrLineItem {
    text: string;
    confidence?: number;
    box?: number[][];
}

export interface OcrPredictionResult {
    text: string;
    markdown: string;
    lines: OcrLineItem[];
    nodeUrl?: string;
    durationMs?: number;
}

export interface OcrPredictOptions {
    lang?: string;
    useAngleCls?: boolean;
    extractTables?: boolean;
}

export interface OcrClusterStatus {
    available: boolean;
    configured: boolean;
    activeNode?: string;
    nodes: Array<{
        url: string;
        healthy: boolean;
        latencyMs?: number;
        lastChecked?: string;
        inCooldown: boolean;
    }>;
}

@singleton()
export class OcrClientService extends AsyncService {
    logger = this.globalLogger.child({ service: this.constructor.name });

    protected nodes: OcrNodeState[] = [];
    protected secretKey?: string;
    protected timeoutMs: number = 10000;
    protected healthTimeoutMs: number = 2000;
    protected pollIntervalMs: number = 30000;
    protected jitterMs: number = 3000;
    protected cooldownMs: number = 30000;

    protected timer?: NodeJS.Timeout;
    protected activeProbePromise?: Promise<void>;
    protected isDisposed: boolean = false;

    constructor(protected globalLogger: GlobalLogger) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();
        this.loadConfiguration();
        if (this.nodes.length > 0) {
            // Initial probe without blocking service startup
            this.probeAllNodes().catch((err) => {
                this.logger.debug('Initial OCR nodes probe completed with errors', { err });
            });
            this.scheduleNextProbe();
        }
        this.emit('ready');
    }

    /**
     * Parse environment variables and initialize the node pool.
     */
    loadConfiguration(customUrls?: string[]) {
        const rawUrls = customUrls ||
            (process.env.OCR_SERVICE_URLS ? process.env.OCR_SERVICE_URLS.split(',') : []) ||
            (process.env.OCR_SERVICE_URL ? [process.env.OCR_SERVICE_URL] : []);

        const normalizedUrls = rawUrls
            .map((u) => (u || '').trim().replace(/\/+$/, ''))
            .filter((u) => u.length > 0 && (/^https?:\/\//i.test(u)));

        this.nodes = normalizedUrls.map((url) => ({
            url,
            healthy: false,
            consecutiveFailures: 0,
            cooldownUntil: 0,
        }));

        this.secretKey = (process.env.OCR_SECRET_KEY || '').trim() || undefined;

        if (process.env.OCR_TIMEOUT_MS) {
            const parsed = parseInt(process.env.OCR_TIMEOUT_MS, 10);
            if (!Number.isNaN(parsed) && parsed > 0) this.timeoutMs = parsed;
        }

        if (process.env.OCR_HEALTH_TIMEOUT_MS) {
            const parsed = parseInt(process.env.OCR_HEALTH_TIMEOUT_MS, 10);
            if (!Number.isNaN(parsed) && parsed > 0) this.healthTimeoutMs = parsed;
        }

        if (process.env.OCR_POLL_INTERVAL_MS) {
            const parsed = parseInt(process.env.OCR_POLL_INTERVAL_MS, 10);
            if (!Number.isNaN(parsed) && parsed > 0) this.pollIntervalMs = parsed;
        }

        this.logger.info(`Loaded ${this.nodes.length} OCR node(s)`, {
            nodes: this.nodes.map((n) => n.url),
            timeoutMs: this.timeoutMs,
            healthTimeoutMs: this.healthTimeoutMs,
            pollIntervalMs: this.pollIntervalMs,
        });
    }

    /**
     * Check if at least one OCR endpoint is configured.
     */
    isConfigured(): boolean {
        return this.nodes.length > 0;
    }

    /**
     * Check if OCR service is currently available (at least one healthy node not in cooldown).
     */
    isAvailable(): boolean {
        if (!this.isConfigured()) return false;
        const now = Date.now();
        return this.nodes.some((node) => node.healthy && now >= node.cooldownUntil);
    }

    /**
     * Get the first available healthy node URL.
     */
    getActiveNodeUrl(): string | undefined {
        const now = Date.now();
        return this.nodes.find((n) => n.healthy && now >= n.cooldownUntil)?.url;
    }

    /**
     * Get detailed status of the OCR cluster.
     */
    getStatus(): OcrClusterStatus {
        const now = Date.now();
        return {
            available: this.isAvailable(),
            configured: this.isConfigured(),
            activeNode: this.getActiveNodeUrl(),
            nodes: this.nodes.map((n) => ({
                url: n.url,
                healthy: n.healthy,
                latencyMs: n.latencyMs,
                lastChecked: n.lastChecked?.toISOString(),
                inCooldown: now < n.cooldownUntil,
            })),
        };
    }

    /**
     * Background scheduled probe loop with Jitter to prevent Thundering Herd.
     */
    protected scheduleNextProbe() {
        if (this.isDisposed || this.nodes.length === 0) return;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }

        // Add random jitter: +/- (0 to jitterMs)
        const jitter = (Math.random() * 2 - 1) * this.jitterMs;
        const delay = Math.max(5000, this.pollIntervalMs + Math.round(jitter));

        this.timer = setTimeout(async () => {
            if (this.isDisposed) return;
            try {
                await this.probeAllNodes();
            } catch (err) {
                this.logger.debug('Scheduled OCR probe encountered error', { err });
            } finally {
                this.scheduleNextProbe();
            }
        }, delay);
        this.timer.unref?.();
    }

    /**
     * Single-flight health check across all configured nodes.
     */
    async probeAllNodes(): Promise<void> {
        if (this.nodes.length === 0) return;

        // Promise coalescing: share single active probe promise
        if (this.activeProbePromise) {
            return this.activeProbePromise;
        }

        this.activeProbePromise = (async () => {
            await Promise.all(this.nodes.map((node) => this.probeSingleNode(node)));
        })().finally(() => {
            this.activeProbePromise = undefined;
        });

        return this.activeProbePromise;
    }

    /**
     * Probe a single node's `/health` endpoint.
     */
    protected async probeSingleNode(node: OcrNodeState): Promise<boolean> {
        const healthUrl = `${node.url}/health`;
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'User-Agent': '888-url2md-ocr-client/1.0',
        };
        if (this.secretKey) {
            headers['X-API-Key'] = this.secretKey;
        }

        const t0 = Date.now();
        try {
            const resp = await fetch(healthUrl, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(this.healthTimeoutMs),
            });

            node.lastChecked = new Date();
            const latency = Date.now() - t0;

            if (resp.ok) {
                node.healthy = true;
                node.latencyMs = latency;
                node.consecutiveFailures = 0;
                node.cooldownUntil = 0;
                return true;
            } else {
                node.consecutiveFailures++;
                if (node.consecutiveFailures >= 2) {
                    node.healthy = false;
                }
                node.latencyMs = undefined;
                this.logger.debug(`OCR node ${healthUrl} returned HTTP ${resp.status}`);
                return false;
            }
        } catch (err: any) {
            node.lastChecked = new Date();
            node.consecutiveFailures++;
            if (node.consecutiveFailures >= 2) {
                node.healthy = false;
            }
            node.latencyMs = undefined;
            this.logger.debug(`OCR node ${healthUrl} probe failed: ${err?.message || err}`);
            return false;
        }
    }

    /**
     * Perform OCR prediction on an image buffer with in-flight failover across candidate nodes.
     */
    async predict(
        image: Buffer | Uint8Array,
        fileName: string = 'image.png',
        options?: OcrPredictOptions
    ): Promise<OcrPredictionResult> {
        if (!this.isConfigured()) {
            throw new ServiceBadApproachError('OCR service is not configured');
        }

        const now = Date.now();
        // Priority order: candidate nodes that are healthy and not in cooldown
        let candidates = this.nodes.filter((n) => n.healthy && now >= n.cooldownUntil);

        // If no healthy nodes found, attempt an immediate single-flight probe
        if (candidates.length === 0) {
            await this.probeAllNodes();
            candidates = this.nodes.filter((n) => n.healthy && Date.now() >= n.cooldownUntil);
        }

        if (candidates.length === 0) {
            throw new ServiceBadApproachError('All OCR nodes are currently offline or in cooldown');
        }

        let lastError: any;
        const totalT0 = Date.now();

        for (const node of candidates) {
            try {
                const result = await this.executePredictOnNode(node, image, fileName, options);
                result.durationMs = Date.now() - totalT0;
                return result;
            } catch (err: any) {
                lastError = err;
                // Trigger circuit breaker cooldown on the failed node
                node.cooldownUntil = Date.now() + this.cooldownMs;
                node.consecutiveFailures++;
                this.logger.warn(`OCR request failed on node ${node.url}, falling back to next node...`, {
                    node: node.url,
                    err: err?.message || err,
                });
            }
        }

        throw new AssertionFailureError({
            message: `All OCR nodes failed to process the image. Last error: ${lastError?.message || lastError}`,
            cause: lastError,
        });
    }

    /**
     * Execute prediction on a specific node endpoint.
     */
    protected async executePredictOnNode(
        node: OcrNodeState,
        image: Buffer | Uint8Array,
        fileName: string,
        options?: OcrPredictOptions
    ): Promise<OcrPredictionResult> {
        const ocrUrl = `${node.url}/ocr`;
        const formData = new FormData();

        const blob = new Blob([image as any], { type: 'image/png' });
        formData.append('file', blob, fileName);

        if (options?.lang) {
            formData.append('lang', options.lang);
        }
        if (options?.useAngleCls !== undefined) {
            formData.append('use_angle_cls', String(options.useAngleCls));
        }
        if (options?.extractTables !== undefined) {
            formData.append('extract_tables', String(options.extractTables));
        }

        const headers: Record<string, string> = {
            'Accept': 'application/json, text/plain',
            'User-Agent': '888-url2md-ocr-client/1.0',
        };
        if (this.secretKey) {
            headers['X-API-Key'] = this.secretKey;
        }

        const resp = await fetch(ocrUrl, {
            method: 'POST',
            headers,
            body: formData,
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            throw new Error(`Node ${node.url} returned HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
        }

        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await resp.json() as any;
            return this.formatOcrResponse(data, node.url);
        }

        const plainText = await resp.text();
        return {
            text: plainText.trim(),
            markdown: plainText.trim(),
            lines: plainText.split('\n').map((t) => ({ text: t })),
            nodeUrl: node.url,
        };
    }

    /**
     * Normalize PaddleOCR or generic OCR response into unified OcrPredictionResult.
     */
    formatOcrResponse(data: any, nodeUrl?: string): OcrPredictionResult {
        // If the service already provides markdown or text directly
        if (typeof data.markdown === 'string' && data.markdown.trim()) {
            const lines: OcrLineItem[] = Array.isArray(data.lines) ? data.lines : [];
            return {
                text: data.text || data.markdown,
                markdown: data.markdown,
                lines,
                nodeUrl,
            };
        }

        if (typeof data.text === 'string' && data.text.trim()) {
            return {
                text: data.text,
                markdown: data.text,
                lines: Array.isArray(data.lines) ? data.lines : [{ text: data.text }],
                nodeUrl,
            };
        }

        // Standard PaddleOCR output format:
        // [[[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], ("text", 0.98)], ...]
        // or { result: [ ... ] }
        let rawList = Array.isArray(data) ? data : (Array.isArray(data.result) ? data.result : (Array.isArray(data.data) ? data.data : []));

        // PaddleOCR returns [ [ [box, [text, conf]], ... ] ] for single image prediction
        if (rawList.length > 0 && Array.isArray(rawList[0]) && rawList[0].length > 0 && Array.isArray(rawList[0][0])) {
            // Check if rawList[0][0] is a box coordinates array [[x,y],...]
            if (Array.isArray(rawList[0][0][0])) {
                rawList = rawList[0];
            }
        }

        const extractedLines: OcrLineItem[] = [];

        for (const item of rawList) {
            if (!item) continue;
            // Case 1: [box, [text, score]] or [box, (text, score)]
            if (Array.isArray(item) && item.length >= 2) {
                const box = Array.isArray(item[0]) ? item[0] : undefined;
                const textTuple = item[1];
                if (Array.isArray(textTuple) && typeof textTuple[0] === 'string') {
                    extractedLines.push({
                        text: textTuple[0].trim(),
                        confidence: typeof textTuple[1] === 'number' ? textTuple[1] : undefined,
                        box,
                    });
                    continue;
                }
                if (typeof textTuple === 'string') {
                    extractedLines.push({ text: textTuple.trim(), box });
                    continue;
                }
            }

            // Case 2: { text: "...", confidence?: 0.9, box?: [...] }
            if (typeof item.text === 'string') {
                extractedLines.push({
                    text: item.text.trim(),
                    confidence: item.confidence,
                    box: item.box,
                });
            }
        }

        const validLines = extractedLines.filter((l) => l.text.length > 0);
        const text = validLines.map((l) => l.text).join('\n');

        // Simple Markdown layout formatting:
        // Consecutive short lines without punctuation get paragraph breaks or grouped lines
        const markdown = validLines.length > 0
            ? validLines.map((l) => l.text).join('\n\n')
            : '';

        return {
            text,
            markdown,
            lines: validLines,
            nodeUrl,
        };
    }

    override async standDown() {
        this.isDisposed = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        await super.standDown();
    }
}
