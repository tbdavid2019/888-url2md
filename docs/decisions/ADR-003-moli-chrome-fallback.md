# ADR-003: Moli priority with bounded Chrome fallback

Date: 2026-10-07

## Decision

Docker bundles Moli v1.1.14 and enables `MOLI_ENABLED=true`. Standalone runs
enable it explicitly after supplying the binary. Existing HTTP/file extraction
stays ahead of the browser stage. Browser rendering uses Moli first and Chrome
once when Moli fails before usable output. `MOLI_ENABLED=false` selects Chrome.
Specialized SERP operations retain their Chrome contexts and share the Chrome
admission budget with fallback rendering.

Moli runs as an owned process on loopback, using Puppeteer's CDP attach API.
Snapshot RPC uses CDP bindings on Moli; Chrome retains its intercepted POST
channel. Newly created Moli targets already have a blank document, so the
adapter skips the extra `about:blank` navigation that its Fetch transport rejects.
Startup is shared across concurrent callers. Layout, image and font resources
are enabled because snapshot extraction uses geometry and captures screenshots.
The existing private-network policy also configures Moli's transport filter.
Moli observes CDP requests without Fetch interception, whose HTTPS pause/resume
path stalls on the pinned release. Its native transport caps concurrent requests
at 100 and per-origin transfers at 16; blocked domains and abuse close the page.
Per-request proxies use Chrome; custom headers use the native Network API.
Upstream documentation: <https://github.com/lexmount/moli/tree/v1.1.14>.
Pinned archives are SHA-256 verified and their license notices stay in the image.

## Failure containment

- Each engine has independent page capacity and a bounded FIFO queue.
- Chrome defaults to 2 live pages and 16 queued requests, with admissions spaced
  by 250 ms plus 0–250 ms jitter. Moli defaults to 4 live pages and 32 queued
  requests. Queue waits are capped at 5 seconds.
- Moli opens a circuit after 3 engine failures, waits 30 seconds plus jitter,
  and permits one recovery probe. Opening the circuit does not bypass Chrome's
  admission limits. Engine saturation itself is returned as overload.
- The browser stage shares a request deadline between engines. Moli receives
  up to 60% of the remaining budget, capped at 15 seconds. Chrome receives the
  remainder. With no explicit timeout the combined budget is 30 seconds.
- The primary page is closed before fallback begins. Cleanup failure kills
  the owned engine. Engine failures retry once; security/parameter failures
  and ordinary HTTP error results do not trigger another engine.
- Once usable snapshots have been emitted, a late failure is propagated and
  output is not replayed through Chrome. In-flight cookies and response-body
  collection are scoped to the caller and attempt.

## Capacity scope and operations

Limits apply per Node process/container. Three replicas at the default settings
permit at most 6 simultaneous Chrome pages and 12 Moli pages. Capacity should be
sized as the sum of replica budgets. These limits do not implement a shared
distributed lease or deduplicate requests with different cookies or sessions.
When capacity is exhausted the existing caller can use stale cache/side-loaded
content or receive the resource-drain error; a growing queue is not retained.

Verify with the browser-policy unit tests, normal API regression suite, and
`scripts/smoke-browser-fallback.cjs` inside an isolated remote container. Run the
smoke once with the bundled Moli binary, then with
`EXPECTED_BROWSER=chrome MOLI_EXECUTABLE_PATH=/missing/moli` to check a failure
burst and fallback cleanup. Production rollout is separate from remote testing.
