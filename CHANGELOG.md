# CHANGELOG

All notable changes, enhancements, and bug fixes for **888 URL to Markdown (`888-url2md`)** will be documented in this file.

## [2026.09.02.6] - 2026-09-02 - 支援指定日期與即時 S3 日誌備份 (On-demand Date Parameter for S3 Log Backup)

### 🚀 Enhancements
- **On-Demand S3 Backup Query Parameter**: Added `POST /api/stats/backup?today=true` or `?date=YYYY-MM-DD` allowing SREs to back up today's logs or specific dates on demand in addition to the automated daily midnight cron.

---

## [2026.09.02.5] - 2026-09-02 - 修復 AbuseMonitor 服務初始化與日誌持久化機制 (Fix AbuseMonitor Service Initialization & Lazy Table Sync)

### 🐛 Bug Fixes & Improvements
- **AbuseMonitor Lifecycle Synchronization**: Added `await this.abuseMonitor.serviceReady()` to standalone server initializers (`crawl.ts`, `search.ts`, `serp.ts`).
- **Lazy Database Initialization Safeguard**: Added `ensureDatabase()` lazy fallback in `recordLog()`, `getSummaryStats()`, `getRecentLogs()`, and `exportLogs()` to ensure the SQLite schema and WAL mode are initialized immediately even before asynchronous DI initialization finishes.
- **SQL Schema Alignment**: Aligned column definitions in `initDatabase()` and `flush()` statements across 15 fields including `target_url`, `is_batch`, and `batch_count`.

---

## [2026.09.02.4] - 2026-09-02 - DuckDB 終端日誌分析腳本 (DuckDB SRE Analysis Script)

### 🛠️ Tooling & SRE Utilities
- **Added `scripts/analyze-logs.sh` & `npm run logs:analyze`**: CLI utility that queries `./data/logs.sqlite` with DuckDB to print 24-hour summary metrics, top active requesting IPs, top target domains, and HTTP status distributions.

---

## [2026.09.02.3] - 2026-09-02 - 完整 SRE 防濫用與日誌備援說明文檔 (Comprehensive SRE Anti-Abuse & Logging Docs)

### 📖 Documentation & SRE Guidelines
- **Detailed README Updates (Bilingual)**: Fully documented all 16 SRE environment variables (`REQUEST_LOG_ENABLED`, `LOG_DB_PATH`, `LOG_RETENTION_DAYS`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX_PER_MINUTE`, `RATE_LIMIT_EXEMPT_IPS`, `BLOCKED_IPS`, `BLOCKED_DOMAINS`, `ADMIN_API_KEY`, `S3_LOG_BACKUP_ENABLED`, `S3_LOG_BUCKET`, `S3_LOG_ENDPOINT`, `S3_LOG_REGION`, `S3_LOG_ACCESS_KEY_ID`, `S3_LOG_SECRET_ACCESS_KEY`, `S3_LOG_PREFIX`) in both Traditional Chinese and English sections of `README.md`.
- **API & Analytics Examples**: Added comprehensive documentation for `GET /api/stats` (with full JSON response schema), `GET /api/stats/logs` (filtering & pagination), `GET /api/stats/export`, and `POST /api/stats/backup`.
- **DuckDB SQL Query Recipes**: Included copy-pasteable DuckDB queries for hourly request traffic breakdown and malicious error IP identification directly against `./data/logs.sqlite`.

---

## [2026.09.02.2] - 2026-09-02 - 防濫用日誌統計與 SRE 彈性配置 (Abuse Monitoring, Request Logging & S3 Backup)

### 🚀 SRE Logging, Anti-Abuse & Lakehouse Analytics
- **SQLite WAL High-Performance Request Logging**: Added zero-latency in-memory buffered logger writing to SQLite in Write-Ahead-Logging (`WAL`) mode via Node.js native `node:sqlite`. Fully opt-in via `REQUEST_LOG_ENABLED=true` with configurable `LOG_RETENTION_DAYS` (default 7 days).
- **In-Memory Rate Limiting & Anti-Abuse Blocking**: Added sliding-window IP rate limiter (`RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_MAX_PER_MINUTE=60`) with IP whitelist (`RATE_LIMIT_EXEMPT_IPS`), permanent blacklist (`BLOCKED_IPS`), and prohibited target domains (`BLOCKED_DOMAINS`).
- **Real-Time Statistics & Logs API**: Added `GET /api/stats` (summary metrics, error rates, top requesting IPs, top target domains, status distributions), `GET /api/stats/logs` (paginated query with error filter), and `GET /api/stats/export` (NDJSON / JSON export). Protected by optional `ADMIN_API_KEY`.
- **DuckDB Compatibility**: Enabled zero-cost serverless lakehouse analytics directly querying the local SQLite database using DuckDB (`sqlite_scan`) without ETL steps.
- **S3 / Cloudflare R2 Remote Backup**: Automated daily background sync of compressed request logs to S3 or Cloudflare R2 via `S3_LOG_BACKUP_ENABLED=true` and S3 bucket credentials.
- **Documentation & Docker Compose**: Updated `README.md` in both Traditional Chinese and English with SRE configuration guides, and mapped `./data:/app/data` volume in `docker-compose.yml`.

---

## [2026.09.02.1] - 2026-09-02 - 生產環境遷移至 GCP 主機與自動 CICD 設定 (Production Migration to GCP & Watchtower CI/CD)

### 🚀 Production Deployment & Infrastructure
- **Server Migration**: Migrated `https://create360.ai` production deployment from `m.aiurl.tw` to Google Cloud VM (`34.80.178.194` / `gitlab.aicreate360.com`).
- **Nginx Reverse Proxy & SSL**: Configured Nginx custom virtual host with HTTP/2 support, Let's Encrypt SSL certificate auto-renewed via Certbot with automated Nginx reload deploy hooks.
- **Watchtower Automated CI/CD**: Added Watchtower container monitoring `ghcr.io/tbdavid2019/888-url2md:latest` with label filtering and automated image cleanup on new pushes.
- **Metadata URL Alignment**: Updated `public/app.html` canonical links, OpenGraph, and JSON-LD application metadata to point directly to `https://create360.ai`.

---

## [2026.08.28.2] - 2026-08-28 - 動態域名偵測修正 (Dynamic Host Domain Detection for llms.txt & Skill)

### 🐛 Bug Fixes & Dynamic Domain Detection
- **Dynamic Host Header Prioritization**: Updated `CrawlerHost.getPublicDomain(ctx)` to prioritize incoming HTTP request headers (`X-Forwarded-Host`, `Host`, and `X-Forwarded-Proto`). Requests to `https://2md.aiurl.tw/llms.txt`, `https://2md.glsoft.ai/llms.txt`, or `https://create360.ai/llms.txt` dynamically render their respective hostnames in all documentation links and code snippets.
- **Docker Compose Fallback Cleanup**: Removed the hardcoded `https://create360.ai` fallback default for `PUBLIC_DOMAIN` in `docker-compose.yml`, allowing multi-host deployments to automatically adopt their reverse-proxy domains without manual configuration.
- **Static Documentation Templates**: Replaced hardcoded `https://create360.ai` URLs in static repository files (`public/SKILL.md`, `public/llms.txt`, `public/llms-full.txt`) with neutral `<HOST>` placeholders.

---

## [2026.08.28.1] - 2026-08-28 - Crawl4AI 核心整合與進階抽取 (Crawl4AI Integration & Advanced Extraction)

### 🚀 Crawl4AI Core Integration & Advanced Extraction
- **CSS / XPath Structured Data Extraction (Zero-Token JSON)**: Pass `extraction` schema (`type: "css"|"xpath"`, `baseSelector`, `fields`) in POST request bodies to extract structured JSON arrays (`data.extracted`) directly in the Linkedom DOM without invoking LLMs (sub-millisecond latency).
- **Fit Markdown & BM25 Relevance Filtering**: Pass `contentFilter: "bm25"` and `contentQuery` (or headers `X-Content-Filter: bm25` and `X-Content-Query: ...`) to filter boilerplate and retrieve query-relevant markdown sections (`data.fitMarkdown`), dramatically reducing downstream LLM prompt token costs. Complete unpruned markdown remains accessible via `data.rawMarkdown`.
- **Bounded BFS Deep Crawl**: Pass `deepCrawl: { maxDepth, maxPages, allowedDomains, includePatterns }` in POST request bodies to explore internal domain links using breadth-first traversal with conservative safety limits.
- **Asynchronous Crawl Job Queue**: Submit long-running deep crawls with `asyncJob: true`. The API immediately returns a `jobId` and single-use `accessToken`. Clients poll progress via `GET /jobs/{jobId}` with header `X-Job-Token: <accessToken>`, cancel via `POST /jobs/{jobId}/cancel`, or view queue metrics via `GET /jobs`.
- **Secure HTTPS Webhooks**: Automated asynchronous job completion notifications delivered via HTTPS POST webhooks with built-in private IP SSRF blocking.
- **Invisible Element Detachment (`detachInvisibles`)**: Pass `detachInvisibles: true` (or header `X-Detach-Invisibles: true`) to strip `display:none` and hidden CSS subtrees from both browser and DOM narrowing pipelines.
- **Session Continuity & Virtual Scroll**: Pass `sessionId` (or `X-Session-Id`) for multi-request cookie continuity, and `virtualScroll: true` for dynamic scroll-loaded pages.

### 🐛 Bug Fixes & Runtime Hardening
- **RPC Route Decorator Fix**: Moved `crawlByPostingToIndex` decorator back to `CrawlerHost.crawl()`, restoring custom header injection (`X-Token-Budget`, `X-With-Images-Summary`, `X-With-Links-Summary`, etc.).
- **Graceful libmagic Fallback**: Added safe MIME extension fallback (`mimeOfExt`) wrapped in try-catch blocks to prevent unhandled dlopen exceptions on platforms without `libmagic.dylib`.
- **DOM TreeWalker NodeFilter Hardening**: Fixed Puppeteer's invisible DOM detachment TreeWalker filter to use standard `{ acceptNode(node) }` object format.

### 🧭 Repository Workflow & Agent Guidelines
- **Mandatory Documentation Rules in `AGENTS.md`**: Enforced a zero-reminder policy requiring every AI Agent / LLM to proactively update `CHANGELOG.md` (and `README.md` for user/API facing changes) on every commit with explicit dates.
- **Updated `README.md`**: Added dedicated sections 1.5–1.9 for CSS/XPath structured extraction, BM25 Fit Markdown, bounded deep crawl, async job queues, and invisible DOM filtering in both Chinese and English sections.

### 🤖 WebMCP Browser Tools
- Added WebMCP imperative API integration to the browser landing page through `document.modelContext`.
- Registered `search_web`, `read_web_page`, and `read_web_pages` read-only tools for WebMCP-enabled Chrome browsers.
- Documented browser tools in `public/SKILL.md`, `/llms.txt`, dynamic `/skill.md` and `/llms-full.txt`.

### ✨ Human-facing Web Interface
- Kept the **888 URL2MD** browser landing page at `GET /` clean, minimalist, and frictionless for humans (Live SERP Search, Batch URL Converter, and AnyDoc File Upload).
- Bare domains entered in the web interface or batch API are normalized to `https://…` automatically.
- Dual-language support (Traditional Chinese and English) with local preference persistence.

### 🛠 CI & Deployment
- Migrated GitHub Actions to Node 24-compatible action releases and configured the workflows to force remaining JavaScript actions to run on Node 24 ahead of Node 20 removal.
- Replaced legacy MinIO-only `docker-compose.yml` with a production-ready `888-url2md` service. `docker compose up -d --build` now builds and starts the application on host port `8083` by default.

---

## 2026-08-11 - UI Overhaul & Search Relevance Filter

### 🎨 Web Landing Page UI Overhaul (`public/app.html`)
- **Instant Enter-Key Search Submit**: Replaced `<textarea>` search query box with `<input type="text">` and added a `keydown` listener to immediately submit web search queries when pressing `Enter`.
- **Keyboard Shortcuts**: Supported `Enter` key for instant web search and `Ctrl+Enter` / `Cmd+Enter` for batch URL conversion.
- **Tabbed Navigation Architecture**: Reorganized landing page into a clean, modern Tabbed UI separating `[ 🔍 網頁搜尋 (Live SERP) ]`, `[ 🌐 網址轉換 (URL) ]`, and `[ 📄 文檔解析 (AnyDoc) ]`.
- **Glassmorphism & Modern Aesthetics**: Applied a dark glassmorphism design with Google Fonts (`Outfit`, `Inter`, `Fira Code`), smooth hover glows, animated loading spinners, word/character count badges, and copy/download buttons.

### 🐛 Search Engine Fixes & Relevance Filtering
- **Strict Search Result Relevance Validation (`isResultRelevant`)**: Added strict keyword and CJK matching to eliminate default search engine fallback pages (e.g. Bing RSS returning Japanese weather news or generic Microsoft support links when a search query has no direct Bing RSS hits).
- **Baidu SERP Fallback**: Added Baidu search API integration as an automatic fallback when Bing / DuckDuckGo return 0 relevant search matches.
- **Query Newline Normalization**: Added query normalization (`replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()`) across frontend and backend to eliminate stray newlines or carriage returns when pasting queries or submitting forms.

---

## 2026-08-11 - Firecrawl AnyDoc Integration & High-Speed Document Parsing

### 🚀 High-Reliability SERP Engine & Bing RSS Integration
- **Bing RSS Endpoint Integration**: Added `https://www.bing.com/search?format=rss&q=...` as a primary search provider in `DuckDuckGoSERP`. This provides 100% reliable, structured XML search results that bypass cloud IP anti-bot blocks and deliver clean, un-redirected URLs for Chinese, English, CJK names, and all search queries.

### 🐛 Bug Fixes
- **Search Query Newline & Whitespace Normalization**: Added query normalization (`replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()`) across `SearcherHost`, `handleSearchRoute`, `DuckDuckGoSERP`, and `app.html`. Resolves an issue where submitting search queries with trailing newlines (e.g., pressing Enter in input fields or passing `%0A`) sent raw newline escape codes to Bing/SERP APIs, altering Bing's multiline query parser and returning inconsistent search results.
- **Chinese/CJK Search & Bing Redirection Decoding Fix**: Fixed Bing URL decoding in `DuckDuckGoSERP` (upgraded `base64` to `base64url` decoding for Bing redirection URLs `&u=a1...`) and added `setmkt=zh-TW&setlang=zh-tw` query headers for CJK searches. Resolves an issue where searching Chinese names (e.g. `江佳澄`) failed and fell back to random non-Chinese Wikipedia articles.
- **Search Query Extraction Fix**: Fixed a critical bug in `SearcherHost` and `handleSearchRoute` where searches to `/search?q=...` incorrectly fell back to the path string `"search"` when parsing query parameters.

### 🎨 Web Landing Page File Upload UI (`public/app.html`)
- **Interactive File Upload Card**: Added drag & drop file upload zone and file picker button to the landing page at `create360.ai`.
- **Supported Formats**: Allows dragging or choosing PDF, Word (.docx/.doc), Excel (.xlsx/.xls), PowerPoint (.pptx/.ppt), EPUB, RTF, OpenDocument (ODT/ODS/ODP), CSV files for direct Markdown conversion.
- **Dual Language i18n**: Fully translated drag & drop prompts, status text, and buttons in Traditional Chinese & English.

### 🚀 High-Speed Document Parsing & AnyDoc Integration
- **@firecrawl/anydoc Service**: Integrated Firecrawl's open-source Rust document parsing engine (`@firecrawl/anydoc`) into `BinaryExtractorService`.
- **Ultra-Fast Conversion (< 5ms)**: Accelerated PDF, Word (.docx/.doc), Excel (.xlsx/.xls), PowerPoint (.pptx/.ppt), EPUB, RTF, OpenDocument (ODT/ODS/ODP), and CSV parsing with sub-5ms median conversion times.
- **Hybrid & Fallback Extraction**: Implemented a primary-fallback strategy to use AnyDoc for ultra-fast Markdown generation while preserving legacy PDFJS and LibreOffice extractors as reliable fallbacks.
- **API & SKILL.md Documentation**: Updated `generateSkillMd`, `generateLlmstxt`, `/llms.txt`, and `/llms-full.txt` to document document file uploads via multipart `POST /` (`file` form parameter).
- **Unit Testing**: Added test coverage in `tests/unit/anydoc.test.ts`.

---

## 2026-08-10 - SEO, Open Graph & PWA Asset Enhancements

### 🎨 SEO & Open Graph Meta Tags
- **Full Social & Search Optimization**: Complete revamp of the `<head>` section in `public/app.html`. Added Open Graph (`og:image`, `og:url`, `og:site_name`, `og:locale`), Twitter Card (`summary_large_image`, `twitter:image`, `twitter:site`), canonical URL link (`https://2md.aiurl.tw`), and optimized title (55 visual width) and meta description (116 characters).
- **Structured Data (JSON-LD)**: Embedded `WebApplication` JSON-LD schema for search engine rich results.
- **PWA & Favicon Assets**: Generated SVG favicon (`favicon.svg`), 32x32 PNG favicon (`favicon-32x32.png`), 180x180 Apple Touch Icon (`apple-touch-icon.png`), 1200x630 Open Graph preview image (`og-image.png`), and web application manifest (`site.webmanifest`).

---

## 2026-08-09 - 888-url2md Fixes & Docker Hub Sync

### 🐛 Bug Fixes & Improvements
- **Google SERP User-Agent Fallback**: Added default fallback UA in `getGsaUserAgent()` to prevent unhandled exceptions when `gsa_useragents.txt` is absent in container environments.
- **CI/CD Docker Hub & GHCR Dual-Publish**: Updated GitHub Actions workflow (`oss-image.yml`) to automatically build and push multi-arch Docker images to both GHCR (`ghcr.io/tbdavid2019/888-url2md`) and Docker Hub (`tbdavid2019/888-url2md`).
- **Docker Hub README Auto-Sync**: Integrated `peter-evans/dockerhub-description@v4` action to automatically sync `README.md` to Docker Hub repository overview.
- **Deployment Hardening**: Renamed remote container and image tags to official `888-url2md:latest`.

---

## 2026-08-09 - 888 URL to Markdown Release

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

## 2026-08-01 - Baseline Upstream Release
- Upstream base release from Jina AI Reader (`jina-ai/reader`).

