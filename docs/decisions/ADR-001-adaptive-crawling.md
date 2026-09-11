# ADR-001: Adopt Adaptive Crawling Concepts Without a Second Runtime

## Status

Accepted

## Date

2026-09-11

## Context

Scrapling provides useful adaptive selector, concurrent Spider, AutoThrottle, session, and checkpoint designs. 888 URL2MD already has a Node.js fetch and document-conversion pipeline based on curl impersonation, Puppeteer, Readability, AnyDoc, and deterministic CSS/XPath extraction.

Embedding Scrapling as a library would add a Python runtime, a second browser stack, duplicate session/proxy behavior, and a larger deployment surface. The main product also needs conservative limits and strict handling of untrusted page content.

## Decision

Implement the high-value crawling concepts in the existing TypeScript pipeline:

- Keep adaptive extraction opt-in and limited to CSS structured extraction.
- Persist bounded element signatures through the existing `StorageLayer`, partitioned by origin and caller-supplied or schema-derived identifier.
- Relocate an element only above a confidence threshold and when the best candidate is not ambiguous.
- Add bounded global/per-domain concurrency and optional per-domain AutoThrottle to the existing BFS crawler.
- Use JSON checkpoint state through the existing storage abstraction for asynchronous job cancellation and resume.
- Keep checkpoint loading schema-validated and size-limited. Do not use executable serialization formats.

## Alternatives Considered

### Embed Scrapling directly

Rejected for the primary path. Node.js cannot import the Python package in-process, and running Python plus Playwright would duplicate the existing browser and crawler infrastructure.

### Run Scrapling as a sidecar

Retained as a future fallback for domains where measured anti-bot success rates are materially better. It requires an authenticated internal boundary, SSRF controls, resource budgets, and separate browser lifecycle monitoring.

### Use an LLM to repair selectors

Rejected for the default path. Deterministic structural matching is cheaper, faster, and easier to constrain. LLM-assisted repair can be considered as an explicit low-confidence fallback later.

## Consequences

- Existing clients keep the current extraction and deep-crawl defaults.
- Adaptive behavior can return no match instead of silently extracting the wrong element.
- Storage-backed deployments share selector profiles, while the no-op storage implementation keeps profiles process-local.
- Concurrent crawling increases load on target sites, so the feature remains bounded and AutoThrottle is opt-in.
- The async job queue now supports resume within the retained job lifetime; durable job metadata across process restarts remains a separate concern.
