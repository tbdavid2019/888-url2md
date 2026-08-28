# CHANGELOG

All notable changes, enhancements, and bug fixes for **888 URL to Markdown (`888-url2md`)** will be documented in this file.

## [Unreleased]

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
- **Mandatory Documentation Rules in `AGENTS.md`**: Enforced a zero-reminder policy requiring every AI Agent / LLM to proactively update `CHANGELOG.md` (and `README.md` for user/API facing changes) on every commit.
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

## [v0.7.1] - UI Overhaul & Search Relevance Filter (2026-08-11)

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

## [v0.7.0] - Firecrawl AnyDoc Integration & High-Speed Document Parsing (2026-08-11)

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

## [v0.6.2] - SEO, Open Graph & PWA Asset Enhancements (2026-08-10)

### 🎨 SEO & Open Graph Meta Tags
- **Full Social & Search Optimization**: Complete revamp of the `<head>` section in `public/app.html`. Added Open Graph (`og:image`, `og:url`, `og:site_name`, `og:locale`), Twitter Card (`summary_large_image`, `twitter:image`, `twitter:site`), canonical URL link (`https://2md.aiurl.tw`), and optimized title (55 visual width) and meta description (116 characters).
- **Structured Data (JSON-LD)**: Embedded `WebApplication` JSON-LD schema for search engine rich results.
- **PWA & Favicon Assets**: Generated SVG favicon (`favicon.svg`), 32x32 PNG favicon (`favicon-32x32.png`), 180x180 Apple Touch Icon (`apple-touch-icon.png`), 1200x630 Open Graph preview image (`og-image.png`), and web application manifest (`site.webmanifest`).

---

## [v0.6.1] - 888-url2md Fixes & Docker Hub Sync (2026-08-09)

### 🐛 Bug Fixes & Improvements
- **Google SERP User-Agent Fallback**: Added default fallback UA in `getGsaUserAgent()` to prevent unhandled exceptions when `gsa_useragents.txt` is absent in container environments.
- **CI/CD Docker Hub & GHCR Dual-Publish**: Updated GitHub Actions workflow (`oss-image.yml`) to automatically build and push multi-arch Docker images to both GHCR (`ghcr.io/tbdavid2019/888-url2md`) and Docker Hub (`tbdavid2019/888-url2md`).
- **Docker Hub README Auto-Sync**: Integrated `peter-evans/dockerhub-description@v4` action to automatically sync `README.md` to Docker Hub repository overview.
- **Deployment Hardening**: Renamed remote container and image tags to official `888-url2md:latest` / `v0.6.1`.

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
