# CHANGELOG

All notable changes, enhancements, and bug fixes for **888 URL to Markdown (`888-url2md`)** will be documented in this file.

## [v0.7.0] - Firecrawl AnyDoc Integration & High-Speed Document Parsing (2026-08-11)

### 🐛 Bug Fixes
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

## [Unreleased]

### ✨ Human-facing Web Interface
- Added the **888 URL2MD** browser landing page at `GET /` for `create360.ai`. Users can paste one or more URLs to convert them into Markdown, preview the result, copy it, or download it as a `.md` file.
- The interface detects the browser language and defaults to Traditional Chinese or English accordingly. Users can switch languages manually, and their preference is retained locally.
- Bare domains entered in the web interface or batch API are normalized to `https://…` automatically.
- Added a web search input to the landing page. It uses the existing `GET /search?q=...` endpoint and presents the Markdown result in the same interface.
- Kept the API and LLM-facing behaviour unchanged: non-browser requests to `GET /` continue to receive the `SKILL.md` content, and `GET /skill.md` remains the direct LLM documentation endpoint.

### 🛠 CI
- Migrated GitHub Actions to Node 24-compatible action releases and configured the workflows to force remaining JavaScript actions to run on Node 24 ahead of Node 20 removal.

### 🐳 Deployment
- Replaced the legacy MinIO-only `docker-compose.yml` with a production-ready `888-url2md` service. `docker compose up -d --build` now builds and starts the application on host port `8083` by default; MinIO is available only with the optional `dev` profile.
- Rewrote `architecture.md` to document the actual `create360.ai` deployment, the browser/API route split, and the current Docker Compose workflow.

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
