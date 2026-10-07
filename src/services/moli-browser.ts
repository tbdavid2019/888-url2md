import { spawn, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import puppeteer, { Browser } from 'puppeteer';
import { BrowserEngineError, browserLimit } from './browser-policy';

/** Owns a loopback-only Moli process and a single CDP connection. */
export class MoliBrowser {
    browser?: Browser;
    private child?: ChildProcess;
    private starting?: Promise<Browser>;
    private stopping = false;

    constructor(private blockPrivateNetworks: () => boolean, private log: (message: string) => void) { }

    connect(): Promise<Browser> {
        if (this.stopping) return Promise.reject(new BrowserEngineError('Moli is stopping'));
        if (this.browser?.connected) return Promise.resolve(this.browser);
        if (!this.starting) {
            this.starting = this.start().finally(() => { this.starting = undefined; });
        }
        return this.starting;
    }

    private async start(): Promise<Browser> {
        const port = browserLimit('MOLI_PORT', 9222, 65535, 1024);
        // Refuse an occupied port rather than attach to an unowned browser.
        await new Promise<void>((resolve, reject) => {
            const probe = createServer();
            probe.once('error', reject);
            probe.listen(port, '127.0.0.1', () => probe.close((error) => error ? reject(error) : resolve()));
        }).catch((error) => { throw new BrowserEngineError(`Moli port unavailable: ${error.code || 'bind error'}`); });
        const args = ['serve', '--host', '127.0.0.1', '--port', String(port),
            '--layout', '--image', '--font', '--timeout', '180', '--log-level', 'warn',
            '--http-max-concurrent', '100', '--http-max-host-open', '16'];
        if (this.blockPrivateNetworks()) args.push('--block-private-networks');
        const child = this.child = spawn(process.env.MOLI_EXECUTABLE_PATH || 'moli', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let exited = false;
        let spawnError: Error | undefined;
        child.once('error', (error) => { spawnError = error; exited = true; });
        child.once('exit', () => { exited = true; });
        // Consume diagnostics without putting page URLs or response data in logs.
        child.stderr?.on('data', () => undefined);
        const deadline = Date.now() + browserLimit('MOLI_STARTUP_TIMEOUT_MS', 5000, 30000);
        try {
            while (Date.now() < deadline && !exited && !this.stopping) {
                try {
                    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
                    if (response.ok) {
                        const info = await response.json() as { webSocketDebuggerUrl?: string };
                        const ws = new URL(info.webSocketDebuggerUrl || '');
                        if (ws.hostname !== '127.0.0.1' || ws.port !== String(port) || ws.protocol !== 'ws:') {
                            throw new BrowserEngineError('Unexpected Moli discovery endpoint');
                        }
                        const browser = await puppeteer.connect({
                            browserWSEndpoint: ws.href,
                            protocolTimeout: browserLimit('MOLI_PROTOCOL_TIMEOUT_MS', 10000, 30000),
                        });
                        if (this.stopping || exited) { browser.disconnect(); break; }
                        this.browser = browser;
                        browser.once('disconnected', () => {
                            if (this.browser === browser) {
                                this.browser = undefined;
                                child.kill('SIGKILL');
                            }
                        });
                        this.log('Moli CDP browser ready');
                        return browser;
                    }
                } catch (error) {
                    if (error instanceof BrowserEngineError) throw error;
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new BrowserEngineError(spawnError ? `Moli start failed: ${(spawnError as NodeJS.ErrnoException).code}` : 'Moli startup timed out or process exited');
        } catch (error) {
            child.kill('SIGKILL');
            throw error instanceof BrowserEngineError ? error : new BrowserEngineError('Moli CDP startup failed');
        }
    }

    kill() {
        const browser = this.browser;
        this.browser = undefined;
        browser?.disconnect();
        this.child?.kill('SIGKILL');
    }

    async stop() {
        this.stopping = true;
        this.kill();
        await this.starting?.catch(() => undefined);
        this.kill();
    }
}
