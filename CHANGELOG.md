# CHANGELOG

All notable changes, enhancements, and bug fixes for **888 URL to Markdown (`888-url2md`)** will be documented in this file.

## [2026.09.14.6] - 2026-09-14 - 全量同步 AI Agent / LLM 規格文件包含 PaddleOCR 端點 (Comprehensive OCR Documentation Sync across llms.txt, SKILL.md & README)

### 📚 Documentation & Developer Experience
- **全量補齊 LLM 與 AI Agent 推理導覽文件中的 OCR 規格**：
  - **`src/api/crawler.ts` (`generateSkillMd`, `generateLlmstxt`, `getIndex`)**：加入 Image OCR 模式說明、`POST /api/ocr` 與 `POST /v1/ocr` 端點規範、multipart/form-data 與 Base64 JSON 傳參方式、支援圖片格式（PNG/JPG/WEBP/BMP/GIF）、動態探測端點（`/api/capabilities` 與 `/api/ocr/status`），並動態感知請求主機域名。
  - **`public/SKILL.md`**：補齊完整的 Agent Installation 流程指引與 `POST /api/ocr` 端點範例。
  - **`public/llms.txt`**：在 Capabilities、Endpoints & Documentation 與 Quick Usage Examples 中完整加入 PaddleOCR PP-OCRv4 圖片辨識說明與 curl 指令範例。
  - **`public/llms-full.txt`**：新增 `### 2.5 Image OCR & Text Extraction (PaddleOCR PP-OCRv4 Engine)` 詳細規格章節。
  - **`README.md`**：在中英文雙語總覽及 LLM 開發者工具標準清單中全數同步加入 PaddleOCR PP-OCRv4 與動態能力探測端點。
- **三台節點實機即時生效**：已透過編譯與熱替換同步更新 Host 1 (`2md.aiurl.tw`)、Host 2 (`create360.ai`)、Host 3 (`2md.glsoft.ai`)，端點實測均已成功回傳最新 OCR 規格。

## [2026.09.14.5] - 2026-09-14 - 前端介面現代化向量圖示重構 (Modernize Web UI with Cohesive Lucide Vector Icons)

### 🎨 UI & Design Enhancements
- **替換傳統 Emoji 圖示為現代化 Lucide 向量 SVG**：
  - **功能頁籤（Tabs Nav）**：全數更換為俐落一致的向量圖示（`Live SERP` 搜尋、`URL` 全球網址、`AnyDoc` 文件結構、`OCR` 觀景窗文字掃描）。
  - **拖曳上傳區（Dropzones）**：文檔解析與圖片 OCR 區塊統一升級為高解析向量圖示，加入懸浮（Hover/Dragover）流暢縮放微互動效果。
  - **動作按鈕（Actions）**：送出按鈕、複製 Markdown（`Copy`）及下載檔案（`Download`）更換為現代化向量圖示，提升介面精緻度與專業視覺體驗。
- **三台生產環境節點即時熱更新**：已透過 `docker cp` 即時同步更新至 Host 1 (`2md.aiurl.tw`)、Host 2 (`create360.ai`)、Host 3 (`2md.glsoft.ai`)。

## [2026.09.14.4] - 2026-09-14 - PaddleOCR 升級 PP-OCRv4 旗艦中英文雙向模型與 CPU AVX 相容性修補 (PaddleOCR PP-OCRv4 Chinese/English Upgrade & CPU AVX Compatibility Patch)

### 🚀 Enhancements & Operations
- **模型升級至 PP-OCRv4 (`ch`)**：將預設推論模型由字典狹窄的舊版 `chinese_cht` 升級為官方旗艦 `ch`（PP-OCRv4 繁簡中文、英文、數字、符號全字典模型）。解決英文單字與混排文字被誤判為形近繁體字（如 `Word` 誤判為 `Wo士d`、`Markdown` 誤判為 `Harkdown`、`URLBatch` 誤判等問題），中英文及網址識別率由約 60% 大幅提升至 95%~100%。
- **非 AVX-512 CPU 崩潰問題修復（`SIGILL Illegal instruction`）**：在 `deploy/ocr/main.py` 注入 `paddle.inference.Config` 猴子補丁，在建立推理引擎前自動剔除觸發未定義指令集的 `self_attention_fuse_pass`，使 PP-OCRv4 能在 Intel KVM 虛擬化實體機及各類雲端 VM 上以 Intel MKL 滿速穩定運行。
- **多語系引擎動態緩存**：實作 `get_engine(lang)` 緩存機制，預設加載 `ch`（PP-OCRv4），並支援隨選快取 `chinese_cht` 等其他語系。
- **Docker 配置與即時熱部署**：更新 `deploy/ocr/Dockerfile`、`docker-compose.yml`（掛載 `main.py` 與 `OCR_LANG=ch`），並已於 `10.9.0.9` 實機重啟驗證通過。

## [2026.09.14.3] - 2026-09-14 - 修復動態能力探測 API 回應解包與前端 OCR 頁籤即時顯示 (Fix Dynamic Capability Envelope Unpacking & Immediate OCR Tab Activation)

### 🐛 Bug Fixes
- **動態能力探測回應解包修正**：修正 `public/app.html` 前端在解析 `/api/capabilities` 時未解封 FoalTS 標準包裹物件（`{ code: 200, status: 20000, data: { ... } }`）的問題。相容 `payload = res?.data || res`，使 `ocr.available` 能即時正確命中布林狀態。
- **三台節點即時熱更新**：已直接熱部署修正後的 `app.html` 至 Host 1 (`2md.aiurl.tw`)、Host 2 (`create360.ai`)、Host 3 (`2md.glsoft.ai`)。使用者重新整理頁面後，第四個頁籤 `[ 🖼️ 圖片辨識 (OCR) ]` 即可正常點亮顯示。

## [2026.09.14.2] - 2026-09-14 - PaddleOCR 官方映像檔對標、CI/CD 自動打包與端口衝突收斂 (PaddleOCR Official Image Alignment, CI/CD Packaging & Port Convergence)

### 🚀 Enhancements & Operations
- **官方映像檔對標與推論穩定化**：將 `deploy/ocr/Dockerfile` 升級對標官方 `paddlepaddle/paddle:2.6.2` 基礎映像檔，內建最佳化 C++ runtime 與 Intel MKL 支援，徹底消除 Debian 13 (Trixie) 函式庫衝突與 `inflateReset2` 記憶體區段錯誤（Segmentation fault）。
- **依賴套件精簡與零回溯解析**：移除與單純推論無關之冗餘依賴（如訓練用 `albumentations`、PyTorch 綁定之 `albucore` 等），以 `--no-deps` 載入 `paddleocr==2.8.1`，實現秒級套件下載與確定性構建。
- **端口衝突收斂與 Watchtower 自動化標籤**：將 `deploy/ocr/docker-compose.yml` 容器對外端口調整為 `8089:8088`，避免與 Host 1 (`10.9.0.9`) 現有 `open-webui` (8088) 發生端口衝突；加入 `com.centurylinklabs.watchtower.enable=true` 標籤，納入既有 Watchtower 零停機滾動更新體系。
- **持續對標官方更新工作流**：
  - 新增 GitHub Actions 工作流 `.github/workflows/ocr-image.yml`，排程每週日 03:00 UTC（或變更時）自動建置並發布至 `ghcr.io/tbdavid2019/888-ocr:latest`。
  - 新增本機自動維護腳本 `deploy/ocr/update.sh`，支援一鍵拉取更新、重建與自我健康檢查。
- **實機 Live 驗證成功**：`10.9.0.9` 成功啟動 `paddleocr-server` 容器，`/health` 端點回傳 200，單張繁體中文圖片推論耗時 107ms，順利完成端到端驗證。

## [2026.09.14.1] - 2026-09-14 - PaddleOCR 繁體中文圖片辨識與高可用容錯叢集 (PaddleOCR Traditional Chinese Image-to-Markdown & Resilient Cluster)

### 🚀 Enhancements
- **OcrClientService 高可用叢集支援**：新增 `OcrClientService`，支援多節點容錯備援池（`OCR_SERVICE_URLS`，如 `https://ocr.aiurl.tw,https://ocr2.aiurl.tw`）。當主節點發生連線中斷或 5xx 錯誤時，系統自動無縫重試下一個備援節點。
- **防驚群效應設計（Anti-Thundering Herd）**：
  - **Single-Flight 請求合併**：多個並發探測或請求共用同一個 Promise 鎖，避免同時擊穿後端 OCR 節點。
  - **隨機抖動背景輪詢（Jittered Probing）**：以配置的間隔（預設 30s ± 3s Jitter）背景探測 `/health` 端點，完全錯開多台主機的輪詢週期。
  - **熔斷冷卻期（Circuit Breaker Cooldown）**：失敗節點自動進入 30 秒冷卻期，防止備援節點遭遇突發流量壓垮。
- **圖片抽取優先整合**：於 `BinaryExtractorService` 整合 `OcrClientService`。當 OCR 節點在線時，圖片文件優先使用 PaddleOCR 進行文字與表格結構抽取；離線或無文字時自動優雅降級至 VLM。
- **專屬 API 端點**：
  - `GET /api/capabilities` 與 `GET /api/ocr/status`：查詢即時服務能力與節點池健康延遲。
  - `POST /api/ocr` 與 `POST /v1/ocr`：支援圖片檔案（`multipart/form-data`）或 Base64 提交，直接回傳乾淨 Markdown 或結構化 JSON。
- **前端動態第四功能頁籤（UI Tab 4）**：
  - 首頁新增 `[ 🖼️ 圖片辨識 (OCR) ]` 功能，支援檔案拖曳、點擊選擇、以及全域截圖貼上（Ctrl+V / Cmd+V）。
  - 動態特性探測：若檢測到 OCR 節點在線則自動顯示該頁籤；所有節點離線時乾淨隱藏，不干擾使用者。
  - 完整繁體中文（Traditional Chinese）與英文雙語 i18n 介面。
- **獨立 PaddleOCR 微服務範本（`deploy/ocr/`）**：
  - 提供專為 `10.9.0.9`（Intel i9-10900）設計的 FastAPI + PaddleOCR（`chinese_cht` 繁體中文與方向角校正）容器化部署檔案（`Dockerfile`, `docker-compose.yml`, `main.py`, `README.md`）。

## [2026.09.12.1] - 2026-09-12 - Docker CI/CD Smoke Deployment Note (Docker CI/CD Smoke Deployment Note)

### 📝 Documentation
- Added the expected GHCR digest and three-host Watchtower convergence checks for CI/CD smoke deployments.

## [2026.09.11.3] - 2026-09-11 - LLM 非同步任務契約與路由修正 (Clarify LLM Async Job Contract & Routes)

### 🐛 Fixes & Documentation
- Fixed job route matching for `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, and `POST /jobs/{id}/resume`.
- Documented the response envelope paths (`data.id`, `data.accessToken`, `data.status`, and `data.result`) and the required polling step after cancellation.
- Synchronized the LLM skill and discovery documents with exact wait, polling, retry, and HTTP method rules.

## [2026.09.11.2] - 2026-09-11 - Watchtower 自動更新可靠性修正 (Harden Watchtower Auto-Update Reliability)

### 🛠️ Deployment & Operations
- Switched the production Watchtower target to explicit `url2md` labels and scope instead of a container-name-only command.
- Reduced the production polling interval from 300 seconds to 60 seconds.
- Enabled warnings when registry HEAD checks fail, making GHCR update detection failures observable.
- Added a daily scoped Docker image cleanup schedule for unused 888-url2md images older than 7 days.
- Applied the configuration to the `2md.aiurl.tw` production host and verified the Watchtower container health.

## [2026.09.11.1] - 2026-09-11 - Scrapling 自適應抽取與可恢復深度爬取 (Scrapling-Inspired Adaptive Extraction & Resumable Deep Crawling)

### 🚀 Enhancements
- Added opt-in adaptive CSS structured extraction with bounded, origin-scoped selector profiles and ambiguity rejection.
- Added bounded global/per-domain deep-crawl concurrency and optional per-domain AutoThrottle using response latency and blocked responses.
- Added JSON checkpoint persistence for asynchronous deep crawls; cancelled jobs can resume through `POST /jobs/{jobId}/resume` with the existing job token.
- Added `X-Adaptive`, `X-Adaptive-Id`, and `X-Adaptive-Threshold` controls and documented the new deep-crawl options in Traditional Chinese and English.

### 🛡️ Security
- Validated and size-limited adaptive profiles and crawl checkpoints before loading them.
- Kept adaptive matching disabled by default and rejected ambiguous element candidates instead of silently selecting one.

## [2026.09.08.5] - 2026-09-08 - ARM64 純 JavaScript 推論與成本閘門 (ARM64 Pure-JS Inference and Cost Guard)

### 🐛 Fixes & Runtime
- Replaced the ARM64-incompatible native Magika path with the pure JavaScript binding and a loopback-only local model server.
- Added conservative MIME inspection defaults and `MAGIKA_VERIFY_DECLARED_TYPE` for opt-in strict validation.

## [2026.09.08.4] - 2026-09-08 - Docker Build 階段模型載入驗證 (Validate Model Loading During Docker Build)

### 🐳 Docker & Runtime
- Moved Magika runtime environment variables before the Docker build dry-run so image construction verifies local model loading.

## [2026.09.08.3] - 2026-09-08 - Docker 內建 Magika 本地模型 (Embed Magika Model in Docker Images)

### 🐳 Docker & Runtime
- Added a pinned `standard_v3_3` Magika model download with SHA-256 verification during Docker build.
- Enabled local Magika model loading in Docker by default through `MAGIKA_ENABLED` and `MAGIKA_MODEL_DIR`.
- Added Node 24 compatibility for the current `@tensorflow/tfjs-node` runtime and npm overrides for its vulnerable archive dependencies.
- Added bilingual deployment and local-development documentation for the model assets and environment variables.

## [2026.09.08.2] - 2026-09-08 - Magika 接入檔案辨識流程 (Wire Magika into File Detection Flow)

### 🚀 Enhancements
- Run the local Magika model before text and binary content routing when enabled.
- Correct supported mislabeled document and text files while preserving the existing fallback for unknown labels.
- Load the Magika model once through the DI singleton during service initialization.

## [2026.09.08.1] - 2026-09-08 - Magika 本地模型整合基礎 (Magika Local Model Integration Foundation)

### 🚀 Enhancements
- Added the pinned `magika` JavaScript dependency and content-type routing helpers for supported document and text labels.
- Preserved the existing extractor path for unknown or unsupported Magika labels.

## [2026.09.04.1] - 2026-09-04 - 爬蟲等待時間指引與驚群效應防護規範 (Crawler Timeout Sizing & Thundering Herd Prevention Guidelines)

### 📚 Documentation & Architecture Best Practices
- **爬蟲等待時間與防驚群效應指引 (Timeout Sizing & Thundering Herd Warning)**:
  - Added explicit warnings and architectural guidelines across [`public/llms.txt`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/public/llms.txt), [`public/llms-full.txt`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/public/llms-full.txt), [`src/api/crawler.ts`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/src/api/crawler.ts) (`generateLlmstxt`, `generateSkillMd`), and [`README.md`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/README.md) (both Traditional Chinese and English sections).
  - Addressed multi-crawler fallback cascades (e.g. `888-url2md` ➔ `Jina Reader` ➔ `Crawl4AI` or vice versa): explicitly warned against setting client timeouts too aggressively short (e.g. 3–5 seconds), which causes premature aborts on dynamic SPAs and triggers a cascading failover storm (Thundering Herd Problem / 驚群效應) collapsing the final fallback scraper.
  - Specified recommended timeout budgets: standard web pages (15s–30s), dynamic SPAs/heavy JavaScript (30s–45s), and deep crawls/large documents (45s–60s+ or `asyncJob: true`).
  - Documented resilience strategies: exponential backoff with randomized jitter (200ms–800ms) between failover tiers and domain-level circuit breakers.
- **HTTP 標頭控制規格更新 (HTTP Headers Specification)**:
  - Documented `X-Timeout` (max 180s) and advanced extraction headers (`X-Content-Filter`, `X-Content-Query`, `X-Session-Id`, `X-Detach-Invisibles`) in `README.md` and LLM discovery documents.

---

## [2026.09.02.10] - 2026-09-02 - 全面安全審計漏洞修復與防護加固 (Comprehensive Security Audit Remediation & Hardening)

### 🛡️ Security Hardening & Remediation
- **SSRF 跨環境多層防禦 (Multi-layer SSRF Defense)**:
  - Fixed private IP blocking in [`src/services/misc.ts`](file:///Users/david/git/tbdavid2019/888-url2md/src/services/misc.ts) (`isPrivateIpForbidden()`) to protect Docker, VPS, and cloud deployments beyond GCP.
  - Corrected operator precedence bug in `assertNormalizedUrl` IPv6 hostname validation.
  - Added redirect hop target SSRF validation in [`src/services/curl.ts`](file:///Users/david/git/tbdavid2019/888-url2md/src/services/curl.ts) (`urlToFile`) ensuring HTTP 301/302 redirects cannot pivot into AWS metadata (`169.254.169.254`) or private subnets.
  - Enforced SSRF URL normalization checks before fetching remote injection scripts (`injectFrameScript` & `injectPageScript`) in [`src/api/crawler.ts`](file:///Users/david/git/tbdavid2019/888-url2md/src/api/crawler.ts).
  - Enhanced Puppeteer request interception in [`src/services/puppeteer.ts`](file:///Users/david/git/tbdavid2019/888-url2md/src/services/puppeteer.ts) to drop sub-resource requests to non-public CIDR ranges.
- **DOM XSS 防禦 (DOM XSS Elimination)**:
  - Replaced unsafe `innerHTML` interpolation in [`public/app.html`](file:///Users/david/git/tbdavid2019/888-url2md/public/app.html) `setStatus()` with safe `document.createElement()` and `textContent` assignment to prevent script execution via crafted file names.
- **機敏端點訪問控制 (Sensitive Endpoint Protection)**:
  - Enforced strict 403 Forbidden checks on sensitive monitoring endpoints (`/api/stats/logs`, `/api/abuse/logs`, `/api/stats/export`, `/api/stats/backup`) in [`src/services/abuse-monitor.ts`](file:///Users/david/git/tbdavid2019/888-url2md/src/services/abuse-monitor.ts) when running in production without `ADMIN_API_KEY`.
- **HTTP 安全標頭防護 (HTTP Security Headers Middleware)**:
  - Injected `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security` headers into the Koa response pipeline in [`src/stand-alone/crawl.ts`](file:///Users/david/git/tbdavid2019/888-url2md/src/stand-alone/crawl.ts).
- **Prompt 注入隔離 (LLM Prompt Injection Isolation)**:
  - Wrapped untrusted HTML payloads inside explicit `<untrusted_web_content>` boundary delimiters with defensive system instructions in [`src/services/lm.ts`](file:///Users/david/git/tbdavid2019/888-url2md/src/services/lm.ts).
- **供應鏈相依性修復 (Supply Chain CVE Remediation)**:
  - Ran `npm audit fix` updating vulnerable dependencies (`tar`, `undici`, `ws`, `ip-address`, `form-data`, `js-yaml`).
- **單元測試套件 (Automated Test Suite)**:
  - Added [`tests/unit/security-remediations.test.ts`](file:///Users/david/git/tbdavid2019/888-url2md/tests/unit/security-remediations.test.ts) verifying all 460 unit tests pass with 0 failures.

---

## [2026.09.02.9] - 2026-09-02 - 本地運維日誌規範與 Git 排除規則 (Local Operations Log Standard & Git Ignore Rules)

### 📝 Documentation & Repository Standards
- **Local Operational Standard (`local.md`)**: Added strict guidelines in [`AGENTS.md`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/AGENTS.md) detailing when to record host infrastructure, AWS resources, and production evidence into local operational files.
- **Git Ignore Security**: Added `local.md` and `local*.md` patterns to [`.gitignore`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/.gitignore) to guarantee private infrastructure operational details are not exposed to public Git repositories.

---

## [2026.09.02.8] - 2026-09-02 - 強化即時 S3 備份參數解析 (Robust Query Parsing for S3 Backup Trigger)

### 🐛 Bug Fixes & Improvements
- **Coercion-Resistant Query Parsing**: Supported boolean and string variations (`today=true`, `today=1`, `now=true`) when invoking `POST /api/stats/backup`.

---

## [2026.09.02.7] - 2026-09-02 - 修復 Docker 構建 Dry-Run 與初始化時序 (Fix Docker Build Dry-Run & Dependency Resolution)

### 🐛 Bug Fixes & Improvements
- **Fixed Subclass Property Initialization Timing**: Removed redundant manual `this.abuseMonitor.serviceReady()` calls inside `init()` which were invoked before subclass constructor fields were assigned during `super()` execution.
- **Docker Dry-Run Success**: Verified `NODE_ENV=dry-run node ./build/stand-alone/search.js` passes without exceptions during Docker Buildx.

---

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
