# CHANGELOG

All notable changes, enhancements, and bug fixes for **888 URL to Markdown (`888-url2md`)** will be documented in this file.

---

## [v0.6.0] - 888 URL to Markdown Release (2026-08-09)

### 🚀 Branding & Project Rename
- Renamed project branding from `jina-reader` / `web-reader-batch` to **888 URL to Markdown (`888-url2md`)**.
- Updated `README.md`, `SKILL.md`, `GET /` landing page, `/llms.txt`, and `/llms-full.txt` with official `888-url2md` tool definitions and JSON schema (`888_url2md`).

### ⚡ Multi-URL Batch Crawling (`POST /v1/batch`)
- Added concurrent multi-URL batch crawling endpoints (`POST /v1/batch`, `POST /batch`, `POST /` with `urls` array input).
- Implemented fault isolation so single-page fetch failures (404/DNS/timeouts) do not fail the entire batch request.
- Supported Markdown (`Accept: text/plain`), JSON (`Accept: application/json`), and SSE streaming (`Accept: text/event-stream`) output formats for batch requests.

### 🔍 Real-Time Web Search & Dual SERP Fallback
- Activated Path-based Search (`GET /s/<query>`) and Query Parameter-based Search (`GET /search?q=<query>`).
- Implemented DuckDuckGo HTML SERP parser to provide free, zero-API-key web search supporting Traditional Chinese (e.g., `蘋果公司`, `台積電`) and global queries.
- Integrated Wikipedia API search fallback to guarantee 100% search availability even under strict cloud IP rate limits.

### 🌐 Agent Skill & LLM Standards (llmstxt.org)
- Built interactive `SKILL.md` endpoint (`GET /skill.md` / `GET /SKILL.md`) for LLM / AI Agent auto-discovery and tool installation.
- Implemented standard `/llms.txt` and `/llms-full.txt` discovery endpoints following [llmstxt.org](https://llmstxt.org/).
- Added dynamic domain auto-detection (`PUBLIC_DOMAIN`, `BASE_URL`, `x-forwarded-host`, `Host`) to automatically parameterize base URLs.

### 🐛 Bug Fixes & Infrastructure Hardening
- **Puppeteer Docker Launching**: Fixed Chrome launch failures in Linux Docker containers by adding `--no-sandbox`, `--disable-setuid-sandbox`, `--no-zygote`, `--disable-gpu`, and `--disable-dev-shm-usage` flags with 30s launch timeouts.
- **Browser Instance Re-use**: Refactored `SERPSpecializedPuppeteerControl` to re-use `PuppeteerControl`'s Chrome browser instance, eliminating duplicate process launches and memory drain.
- **502 Bad Gateway Error Handling**: Wrapped search result generator loops in `try-catch` blocks to prevent uncaught timeout exceptions from closing Koa sockets.
- **UTF-8 Mojibake / Charset Fix**: Fixed UTF-8 character corruption caused by legacy `<meta charset="gb2312">` tags overriding valid UTF-8 responses (resolving `蘋果公司` ➔ `角砍蛛` decoding bug).

---

## [v0.5.0] - Baseline Upstream Release
- Upstream base release from Jina AI Reader (`jina-ai/reader`).
