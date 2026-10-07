/** Capacity applies per process/container. Multiple replicas need summed budgets. */
export type BrowserEngine = 'moli' | 'chrome';

export function browserLimit(name: string, fallback: number, max: number, min = 1): number {
    const value = Number(process.env[name]);
    return process.env[name] !== undefined && Number.isInteger(value) && value >= min && value <= max
        ? value : fallback;
}

export class BrowserCapacityError extends Error { }
export class BrowserEngineError extends Error { }

/** A caller may stop waiting without cancelling another caller's shared startup. */
export function waitForBrowserStartup<T>(startup: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return startup;
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        startup.then((browser) => {
            signal.removeEventListener('abort', onAbort);
            resolve(browser);
        }, (error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
        if (signal.aborted) onAbort();
    });
}

export function usableBrowserSnapshot(snapshot: {
    text?: string; parsed?: { textContent?: string } | null; blobs?: unknown[];
    screenshot?: unknown; pageshot?: unknown; status?: number;
} | undefined, visual = false): boolean {
    if (!snapshot) return false;
    if (snapshot.status && snapshot.status >= 400) return true;
    if (visual) return Boolean(snapshot.screenshot && snapshot.pageshot);
    return Boolean(snapshot.text?.trim() || snapshot.parsed?.textContent?.trim() || snapshot.blobs?.length);
}

type Waiter = {
    resolve: (release: () => void) => void;
    cleanup: () => void;
};

/** A bounded FIFO with a limit on both live pages and new page admissions. */
export class BrowserAdmission {
    private active = 0;
    private queue: Waiter[] = [];
    private timer?: ReturnType<typeof setTimeout>;
    private nextStart = 0;

    constructor(
        readonly concurrency: number,
        readonly queueSize: number,
        readonly queueTimeoutMs: number,
        readonly startIntervalMs = 0,
        readonly jitterMs = 0,
    ) { }

    get stats() { return { active: this.active, queued: this.queue.length, concurrency: this.concurrency }; }

    acquire(signal?: AbortSignal): Promise<() => void> {
        if (signal?.aborted) return Promise.reject(signal.reason);
        if (this.queue.length >= this.queueSize) {
            return Promise.reject(new BrowserCapacityError('Browser queue is full'));
        }
        return new Promise((resolve, reject) => {
            const remove = (error: Error) => {
                const index = this.queue.indexOf(waiter);
                if (index < 0) return;
                this.queue.splice(index, 1);
                waiter.cleanup();
                reject(error);
                this.drain();
            };
            const onAbort = () => remove(signal!.reason);
            const timeout = setTimeout(() => remove(new BrowserCapacityError('Browser queue wait expired')), this.queueTimeoutMs);
            const waiter: Waiter = {
                resolve,
                cleanup: () => {
                    clearTimeout(timeout);
                    signal?.removeEventListener('abort', onAbort);
                },
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            this.queue.push(waiter);
            this.drain();
        });
    }

    private drain() {
        if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
        while (this.queue.length && this.active < this.concurrency) {
            const delay = this.nextStart - Date.now();
            if (delay > 0) {
                this.timer = setTimeout(() => { this.timer = undefined; this.drain(); }, delay);
                return;
            }
            const waiter = this.queue.shift()!;
            waiter.cleanup();
            this.active++;
            this.nextStart = Date.now() + this.startIntervalMs + Math.floor(Math.random() * (this.jitterMs + 1));
            let released = false;
            waiter.resolve(() => {
                if (released) return;
                released = true;
                this.active--;
                this.drain();
            });
        }
    }
}

/** Opens on engine failures; only one request probes after the cooldown. */
export class BrowserCircuit {
    private failures = 0;
    private openUntil = 0;
    private probing = false;

    constructor(readonly threshold: number, readonly cooldownMs: number) { }

    enter(now = Date.now()): { finish: (failed: boolean) => void } | undefined {
        if (this.openUntil && (now < this.openUntil || this.probing)) return undefined;
        const probe = this.openUntil > 0;
        if (probe) this.probing = true;
        let finished = false;
        return { finish: (failed) => {
            if (finished) return;
            finished = true;
            if (probe) this.probing = false;
            if (!failed) {
                // In-flight successes from before opening must not close the circuit.
                if (!this.openUntil || probe) { this.failures = 0; this.openUntil = 0; }
            } else if (++this.failures >= this.threshold) {
                this.openUntil = Date.now() + this.cooldownMs + Math.floor(Math.random() * this.cooldownMs * 0.2);
            }
        } };
    }
}

/** Fallback occurs once, after primary cleanup, and only before usable output. */
export async function* browserFallback<T>(
    primary: () => AsyncGenerator<T>,
    secondary: () => AsyncGenerator<T>,
    circuit: BrowserCircuit,
    usable: (snapshot: T) => boolean,
    retryable: (error: unknown) => boolean,
    onFallback: (reason: unknown) => void,
): AsyncGenerator<T> {
    const attempt = circuit.enter();
    if (attempt) {
        let emitted = false;
        let engineFailed = false;
        try {
            for await (const snapshot of primary()) {
                if (!usable(snapshot)) continue;
                emitted = true;
                attempt.finish(false);
                yield snapshot;
            }
            if (emitted) return;
            engineFailed = true;
            onFallback(new BrowserEngineError('Moli produced no usable snapshot'));
        } catch (error) {
            engineFailed = retryable(error);
            if (emitted || !engineFailed) throw error;
            onFallback(error);
        } finally {
            attempt.finish(engineFailed);
        }
    } else {
        onFallback(new BrowserEngineError('Moli circuit is open'));
    }
    yield* secondary();
}
