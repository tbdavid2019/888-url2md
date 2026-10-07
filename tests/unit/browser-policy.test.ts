import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAdmission, BrowserCapacityError, BrowserCircuit, BrowserEngineError, browserFallback, usableBrowserSnapshot } from '../../build/services/browser-policy.js';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function collect<T>(iterator: AsyncGenerator<T>) {
    const result: T[] = [];
    for await (const item of iterator) result.push(item);
    return result;
}

describe('browser admission', () => {
    it('bounds concurrent fallback pages and the queue during a failure burst', async () => {
        const gate = new BrowserAdmission(2, 8, 1000);
        let active = 0, peak = 0, rejected = 0;
        await Promise.all(Array.from({ length: 100 }, async () => {
            let release: () => void;
            try { release = await gate.acquire(); }
            catch (error) { assert.ok(error instanceof BrowserCapacityError); rejected++; return; }
            active++;
            peak = Math.max(peak, active);
            await pause(2);
            active--;
            release(); release();
        }));
        assert.equal(peak, 2);
        assert.equal(rejected, 90);
        assert.deepEqual(gate.stats, { active: 0, queued: 0, concurrency: 2 });
    });

    it('expires queued work and keeps subsequent requests runnable', async () => {
        const gate = new BrowserAdmission(1, 2, 10);
        const first = await gate.acquire();
        await assert.rejects(gate.acquire(), BrowserCapacityError);
        assert.equal(gate.stats.queued, 0);
        first();
        (await gate.acquire())();
        assert.equal(gate.stats.active, 0);
    });

    it('removes cancelled requests from the queue', async () => {
        const gate = new BrowserAdmission(1, 2, 1000);
        const first = await gate.acquire();
        const controller = new AbortController();
        const waiting = gate.acquire(controller.signal);
        controller.abort(new Error('client cancelled'));
        await assert.rejects(waiting, /client cancelled/);
        first();
        assert.equal(gate.stats.queued, 0);
    });

    it('spaces admissions even when capacity is available', async () => {
        const gate = new BrowserAdmission(4, 4, 1000, 20);
        const starts: number[] = [];
        await Promise.all(Array.from({ length: 3 }, async () => {
            const release = await gate.acquire();
            starts.push(Date.now());
            release();
        }));
        assert.ok(starts[2] - starts[0] >= 35);
    });
});

describe('browser circuit and fallback', () => {
    it('requires screenshot bytes instead of text for a visual request', () => {
        assert.equal(usableBrowserSnapshot({ text: 'article' }, true), false);
        assert.equal(usableBrowserSnapshot({ text: 'article', screenshot: Buffer.from('png') }, true), false);
        assert.equal(usableBrowserSnapshot({ screenshot: Buffer.from('png'), pageshot: Buffer.from('png') }, true), true);
        assert.equal(usableBrowserSnapshot({ text: 'article' }), true);
    });

    it('keeps ordinary HTTP error results without switching engines', () => {
        assert.equal(usableBrowserSnapshot({ status: 404 }), true);
        assert.equal(usableBrowserSnapshot({ status: 403 }, true), true);
        assert.equal(usableBrowserSnapshot({ text: '  ', status: 200 }), false);
    });
    it('admits one recovery probe and ignores successes from before opening', () => {
        const circuit = new BrowserCircuit(1, 100);
        const stale = circuit.enter()!;
        circuit.enter()!.finish(true);
        stale.finish(false);
        assert.equal(circuit.enter(), undefined);
        const probe = circuit.enter(Date.now() + 200)!;
        assert.ok(probe);
        assert.equal(circuit.enter(Date.now() + 200), undefined);
        probe.finish(false);
        assert.ok(circuit.enter());
    });

    it('closes failed primary work before starting Chrome and retries once', async () => {
        const events: string[] = [];
        async function* moli() {
            try { throw new BrowserEngineError('CDP disconnected'); yield ''; }
            finally { await pause(5); events.push('moli closed'); }
        }
        async function* chrome() { events.push('chrome opened'); yield 'result'; }
        const result = await collect(browserFallback(moli, chrome, new BrowserCircuit(3, 100), Boolean,
            (error) => error instanceof BrowserEngineError, () => undefined));
        assert.deepEqual(result, ['result']);
        assert.deepEqual(events, ['moli closed', 'chrome opened']);
    });

    it('filters empty primary snapshots and falls back without duplicate output', async () => {
        async function* moli() { yield ''; }
        async function* chrome() { yield 'chrome'; }
        assert.deepEqual(await collect(browserFallback(moli, chrome, new BrowserCircuit(3, 100), Boolean,
            () => true, () => undefined)), ['chrome']);
    });

    it('propagates security failures without using Chrome', async () => {
        let chromeCalls = 0;
        async function* moli() { throw new Error('security blocked'); yield ''; }
        async function* chrome() { chromeCalls++; yield 'chrome'; }
        await assert.rejects(collect(browserFallback(moli, chrome, new BrowserCircuit(3, 100), Boolean,
            () => false, () => undefined)), /security blocked/);
        assert.equal(chromeCalls, 0);
    });

    it('does not replay work after usable primary output', async () => {
        let chromeCalls = 0;
        async function* moli() { yield 'first'; throw new BrowserEngineError('later failure'); }
        async function* chrome() { chromeCalls++; yield 'chrome'; }
        const iterator = browserFallback(moli, chrome, new BrowserCircuit(3, 100), Boolean,
            () => true, () => undefined);
        assert.equal((await iterator.next()).value, 'first');
        await assert.rejects(iterator.next(), /later failure/);
        assert.equal(chromeCalls, 0);
    });

    it('skips a failed engine during cooldown while keeping Chrome bounded', async () => {
        const circuit = new BrowserCircuit(1, 1000);
        let moliCalls = 0;
        async function* moli() { moliCalls++; throw new BrowserEngineError('crashed'); yield ''; }
        async function* chrome() { yield 'chrome'; }
        for (let i = 0; i < 3; i++) {
            assert.deepEqual(await collect(browserFallback(moli, chrome, circuit, Boolean,
                () => true, () => undefined)), ['chrome']);
        }
        assert.equal(moliCalls, 1);
    });
});
