import 'reflect-metadata';
import { singleton } from 'tsyringe';
import { AsyncService } from 'civkit/async-service';
import { GlobalLogger } from './logger';

export interface PaperPilotNodeState {
    url: string;
    healthy: boolean;
    latencyMs?: number;
    lastChecked?: Date;
    consecutiveFailures: number;
    cooldownUntil: number;
}

export interface PaperPilotExtractionResult {
    markdown: string;
    text?: string;
    title?: string;
    pageCount?: number;
    metadata?: Record<string, any>;
    durationMs?: number;
}

export interface PaperPilotStatus {
    available: boolean;
    configured: boolean;
    endpoint?: string;
    healthy: boolean;
    latencyMs?: number;
    lastChecked?: string;
    inCooldown: boolean;
}

@singleton()
export class PaperPilotClientService extends AsyncService {
    logger = this.globalLogger.child({ service: this.constructor.name });

    protected endpoint?: string;
    protected enabled: boolean = true;
    protected nodeState?: PaperPilotNodeState;
    protected timeoutMs: number = 120000;
    protected healthTimeoutMs: number = 5000;
    protected pollIntervalMs: number = 30000;
    protected jitterMs: number = 3000;
    protected cooldownMs: number = 30000;

    protected timer?: NodeJS.Timeout;
    protected activeProbePromise?: Promise<boolean>;
    protected isDisposed: boolean = false;

    constructor(protected globalLogger: GlobalLogger) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();
        this.loadConfiguration();
        if (this.isConfigured()) {
            this.probeNode().catch((err) => {
                this.logger.debug('Initial PaperPilot probe completed with error', { err });
            });
            this.scheduleNextProbe();
        }
        this.emit('ready');
    }

    /**
     * Load PaperPilot configuration from environment variables or custom endpoint.
     */
    loadConfiguration(customEndpoint?: string) {
        const rawEndpoint = customEndpoint || process.env.PAPERPILOT_ENDPOINT || process.env.PAPERPILOT_URL;
        const normalized = (rawEndpoint || '').trim().replace(/\/+$/, '');

        if (normalized && /^https?:\/\//i.test(normalized)) {
            this.endpoint = normalized;
            this.nodeState = {
                url: normalized,
                healthy: false,
                consecutiveFailures: 0,
                cooldownUntil: 0,
            };
        } else {
            this.endpoint = undefined;
            this.nodeState = undefined;
        }

        if (process.env.PAPERPILOT_ENABLED !== undefined) {
            const val = process.env.PAPERPILOT_ENABLED.toLowerCase().trim();
            this.enabled = val === 'true' || val === '1';
        } else {
            this.enabled = Boolean(this.endpoint);
        }

        if (process.env.PAPERPILOT_TIMEOUT_MS) {
            const parsed = parseInt(process.env.PAPERPILOT_TIMEOUT_MS, 10);
            if (!Number.isNaN(parsed) && parsed > 0) this.timeoutMs = parsed;
        }

        if (process.env.PAPERPILOT_HEALTH_TIMEOUT_MS) {
            const parsed = parseInt(process.env.PAPERPILOT_HEALTH_TIMEOUT_MS, 10);
            if (!Number.isNaN(parsed) && parsed > 0) this.healthTimeoutMs = parsed;
        }

        if (process.env.PAPERPILOT_POLL_INTERVAL_MS) {
            const parsed = parseInt(process.env.PAPERPILOT_POLL_INTERVAL_MS, 10);
            if (!Number.isNaN(parsed) && parsed > 0) this.pollIntervalMs = parsed;
        }

        this.logger.info(`PaperPilot service initialized`, {
            configured: this.isConfigured(),
            enabled: this.enabled,
            endpoint: this.endpoint,
            timeoutMs: this.timeoutMs,
        });
    }

    /**
     * Check if PaperPilot is configured and enabled.
     */
    isConfigured(): boolean {
        return Boolean(this.enabled && this.endpoint && this.nodeState);
    }

    /**
     * Check if PaperPilot is currently available and healthy.
     */
    isAvailable(): boolean {
        if (!this.isConfigured() || !this.nodeState) return false;
        const now = Date.now();
        return this.nodeState.healthy && now >= this.nodeState.cooldownUntil;
    }

    /**
     * Get PaperPilot status summary.
     */
    getStatus(fullDetails: boolean = false): PaperPilotStatus {
        const now = Date.now();
        let endpointDisplay = this.endpoint;
        if (endpointDisplay && !fullDetails) {
            try {
                const u = new URL(endpointDisplay);
                endpointDisplay = `${u.protocol}//${u.host}`;
            } catch {
                endpointDisplay = 'configured';
            }
        }
        return {
            configured: this.isConfigured(),
            available: this.isAvailable(),
            endpoint: endpointDisplay,
            healthy: this.nodeState?.healthy || false,
            latencyMs: this.nodeState?.latencyMs,
            lastChecked: this.nodeState?.lastChecked?.toISOString(),
            inCooldown: this.nodeState ? now < this.nodeState.cooldownUntil : false,
        };
    }

    /**
     * Health probe against the PaperPilot endpoint (/health then /).
     */
    async probeNode(): Promise<boolean> {
        if (!this.nodeState || !this.endpoint) return false;
        if (this.activeProbePromise) return this.activeProbePromise;

        this.activeProbePromise = (async () => {
            const t0 = Date.now();
            const urlsToTry = [`${this.endpoint}/health`, `${this.endpoint}/`];

            for (const url of urlsToTry) {
                try {
                    const resp = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json, text/plain, */*',
                            'User-Agent': '888-url2md-paperpilot-client/1.0',
                        },
                        signal: AbortSignal.timeout(this.healthTimeoutMs),
                    });

                    if (resp.ok) {
                        this.nodeState!.lastChecked = new Date();
                        this.nodeState!.healthy = true;
                        this.nodeState!.latencyMs = Date.now() - t0;
                        this.nodeState!.consecutiveFailures = 0;
                        this.nodeState!.cooldownUntil = 0;
                        return true;
                    }
                } catch {
                    // Try next fallback endpoint
                }
            }

            this.nodeState!.lastChecked = new Date();
            this.nodeState!.consecutiveFailures++;
            if (this.nodeState!.consecutiveFailures >= 2) {
                this.nodeState!.healthy = false;
            }
            this.nodeState!.latencyMs = undefined;
            return false;
        })().finally(() => {
            this.activeProbePromise = undefined;
        });

        return this.activeProbePromise;
    }

    /**
     * Schedule periodic background health checks.
     */
    protected scheduleNextProbe() {
        if (this.isDisposed || !this.isConfigured()) return;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        const jitter = Math.floor(Math.random() * this.jitterMs * 2) - this.jitterMs;
        const delay = Math.max(5000, this.pollIntervalMs + jitter);
        this.timer = setTimeout(async () => {
            if (this.isDisposed) return;
            try {
                await this.probeNode();
            } catch (err) {
                this.logger.debug('Scheduled PaperPilot probe error', { err });
            } finally {
                this.scheduleNextProbe();
            }
        }, delay);
        if (this.timer.unref) {
            this.timer.unref();
        }
    }

    /**
     * Extract Markdown from PDF buffer using PaperPilot Gateway (/tika/json/md).
     */
    async extractMarkdown(
        pdfBuffer: Buffer,
        options?: { fileName?: string; timeoutMs?: number; withOcr?: boolean; extractTables?: boolean }
    ): Promise<PaperPilotExtractionResult | null> {
        if (!this.isAvailable() || !this.endpoint) return null;

        const startTime = Date.now();
        const targetUrl = `${this.endpoint}/tika/json/md`;
        const safeFileName = options?.fileName ? encodeURIComponent(options.fileName.slice(0, 200)) : undefined;
        const effectiveTimeout = options?.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : this.timeoutMs;

        try {
            const resp = await fetch(targetUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/pdf',
                    'Accept': 'application/json',
                    'User-Agent': '888-url2md-paperpilot-client/1.0',
                    ...(safeFileName ? { 'X-File-Name': safeFileName } : {}),
                    ...(options?.withOcr ? { 'X-With-Ocr': 'true' } : {}),
                    ...(options?.extractTables ? { 'X-Extract-Tables': 'true' } : {}),
                },
                body: new Uint8Array(pdfBuffer),
                signal: AbortSignal.timeout(effectiveTimeout),
            });

            if (!resp.ok) {
                // If /tika/json/md returns 404, try fallback to /tika/text
                if (resp.status === 404) {
                    return await this.extractPlainTextFallback(pdfBuffer, options, startTime);
                }
                if (resp.status >= 500) {
                    this.markFailure(`HTTP ${resp.status}`);
                } else {
                    this.logger.debug(`PaperPilot returned client HTTP error ${resp.status}`, { fileName: options?.fileName });
                }
                return null;
            }

            const contentType = resp.headers.get('content-type') || '';
            let markdown = '';
            let text = '';
            let metadata: Record<string, any> = {};

            if (contentType.includes('application/json')) {
                const data = await resp.json() as any;
                const payload = Array.isArray(data) ? (data[0] || {}) : (data || {});
                // PaperPilot Tika 4 format: tk:content or X-TIKA:content or content
                markdown = (payload['tk:content'] || payload['X-TIKA:content'] || payload['content'] || payload['markdown'] || '').trim();
                text = (payload['text'] || payload['plainText'] || markdown).trim();
                metadata = payload;
            } else {
                markdown = (await resp.text()).trim();
                text = markdown;
            }

            if (!markdown) {
                return null;
            }

            // Successful extraction resets consecutive failure counter
            if (this.nodeState) {
                this.nodeState.consecutiveFailures = 0;
                this.nodeState.cooldownUntil = 0;
            }

            const durationMs = Date.now() - startTime;
            const title = metadata['dc:title'] || metadata['title'] || metadata['pdf:docinfo:title'] || options?.fileName;
            const rawPages = metadata['xmpTPg:NPages'] || metadata['pdf:numberOfPages'];
            const pageCount = rawPages ? parseInt(String(rawPages), 10) : undefined;

            return {
                markdown,
                text,
                title,
                pageCount: Number.isNaN(pageCount) ? undefined : pageCount,
                metadata,
                durationMs,
            };
        } catch (err: any) {
            this.markFailure(err?.message || String(err));
            return null;
        }
    }

    /**
     * Fallback to /tika/text if JSON/MD is not present.
     */
    protected async extractPlainTextFallback(
        pdfBuffer: Buffer,
        options?: { fileName?: string },
        startTime: number = Date.now()
    ): Promise<PaperPilotExtractionResult | null> {
        if (!this.endpoint) return null;
        const safeFileName = options?.fileName ? encodeURIComponent(options.fileName.slice(0, 200)) : undefined;

        try {
            const textUrl = `${this.endpoint}/tika/text`;
            const resp = await fetch(textUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/pdf',
                    'Accept': 'text/plain, application/json',
                    'User-Agent': '888-url2md-paperpilot-client/1.0',
                    ...(safeFileName ? { 'X-File-Name': safeFileName } : {}),
                },
                body: new Uint8Array(pdfBuffer),
                signal: AbortSignal.timeout(this.timeoutMs),
            });

            if (!resp.ok) {
                if (resp.status >= 500 || resp.status === 404) {
                    this.markFailure(`Fallback HTTP ${resp.status}`);
                }
                return null;
            }

            const text = (await resp.text()).trim();
            if (!text) return null;

            if (this.nodeState) {
                this.nodeState.consecutiveFailures = 0;
                this.nodeState.cooldownUntil = 0;
            }

            return {
                markdown: text,
                text,
                title: options?.fileName,
                durationMs: Date.now() - startTime,
            };
        } catch (err: any) {
            this.markFailure(`Fallback error: ${err?.message || err}`);
            return null;
        }
    }

    /**
     * Record failure and trigger cooldown if necessary.
     */
    protected markFailure(reason: string) {
        if (!this.nodeState) return;
        this.nodeState.consecutiveFailures++;
        if (this.nodeState.consecutiveFailures >= 2) {
            this.nodeState.healthy = false;
            this.nodeState.cooldownUntil = Date.now() + this.cooldownMs;
            this.logger.warn(`PaperPilot entered cooldown for ${this.cooldownMs / 1000}s: ${reason}`);
        }
    }

    /**
     * Cleanup resources.
     */
    override async standDown() {
        this.isDisposed = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        await super.standDown();
    }
}
