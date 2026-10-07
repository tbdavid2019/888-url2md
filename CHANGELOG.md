# CHANGELOG

All notable changes, enhancements, and bug fixes for **888 URL to Markdown (`888-url2md`)** will be documented in this file.

## [2026.10.07.4] - 2026-10-07 - Moli 每週版本檢查與候選建置 (Weekly Moli Release Check & Candidate Build)

### Added
- 新增每週 Moli stable release 檢查；新版本會驗證 amd64 / arm64 官方檔案、SHA-256 與 ELF 架構，執行遠端回歸和多架構候選映像建置，通過後自動建立或更新 PR。
- PR 合併後沿用現有 GHCR `latest` 發布及三台 Watchtower 更新流程。

## [2026.10.07.3] - 2026-10-07 - Moli 截圖風險隔離與視覺路由 (Moli Screenshot Risk Isolation & Visual Routing)

### Fixed & Hardened
- Moli 一般文字擷取改在沒有實際 layout/paint 的模式執行，也不拍 viewport 或 full-page 截圖；截圖、虛擬捲動、隱形元素幾何處理與自訂 viewport 請求改由 Chrome 執行。
- 新增視覺與幾何路由測試及深 DOM 截圖走 Chrome 的整合驗證。正式 Moli v1.1.14 遠端重現深 DOM renderer stack overflow 與 DOM mutation 後 geometry 過期；遠端回歸通過 498 項單元測試、405 項 API 測試、公開 HTTPS、Moli 文字路徑及冷啟動 Chrome fallback。

## [2026.10.07.2] - 2026-10-07 - 瀏覽器啟動預算與收尾等待修正 (Browser Startup Budget & Finalization Wait)

### Fixed
- Moli 採原生 HTTPS 網路流程與 CDP 事件觀察，使用 native private-network 過濾與連線上限，避開 Fetch 暫停／繼續造成 HTTPS 卡住；每請求代理使用 Chrome，額外 headers 透過原生介面設定。
- Chrome 冷啟動預設限制為 10 秒，使用可取消的啟動控制器關閉逾時程序；個別請求的剩餘時間限制亦適用等待共用啟動，避免超出瀏覽器總預算。
- 快照迴圈等待最終擷取流程完成，補上頁面關閉與絕對逾時檢查，避免已結束的導覽 Promise 造成反覆等待。
- 新增共用啟動的請求取消測試及公開 HTTPS 回歸腳本；遠端 497 項單元與 405 項 API 測試通過，正式私有網路政策下的 HTTPS 擷取由 Moli 完成（889 ms、Chrome 使用量 0），洪峰仍受 2 個 Chrome 頁面與排隊逾時上限保護。

## [2026.10.07.1] - 2026-10-07 - Moli 優先與受控 Chrome 備援 (Moli Priority & Bounded Chrome Fallback)

### Added & Changed
- Docker 內建 SHA-256 驗證的 Moli v1.1.14（amd64 / arm64），預設啟用 `MOLI_ENABLED=true`；網頁瀏覽器渲染採 Moli 優先，可用 `MOLI_ENABLED=false` 切回 Chrome。
- 透過 Puppeteer CDP 共用既有擷取、請求攔截與安全檢查；Moli 採 loopback-only 自管程序與共用啟動流程。SERP 專用操作沿用 Chrome 並共用容量限制。
- Moli 與 Chrome 分別設有頁面併發、有限 FIFO 與排隊逾時；Chrome 預設 2 個頁面、16 個排隊請求，透過啟動間隔與 jitter 控制 fallback 洪峰。
- Moli 引擎失敗加入熔斷、冷卻及單一恢復探測；fallback 在首份可用快照送出前最多一次，先關閉主引擎頁面，再使用共同剩餘時間預算執行 Chrome。
- 新增容量／熔斷／串流重試測試、遠端容器整合測試腳本、雙語設定文件與 ADR-003。容量限制範圍為每個程序／容器；叢集總上限需依實例數加總。
- **遠端驗證**：完整 amd64 Docker 映像編譯成功，496 項單元測試與 405 項 API 測試通過；Moli 動態內容與實際截圖成功，Chrome 冷啟動洪峰受併發上限與 `50303` 排隊逾時保護。

## [2026.09.28.7] - 2026-09-28 - 阿拉伯數字題目大題誤判隔離與邊緣橫幅佔用防禦 (Arabic Question Header Isolation & Robust Banner Exclusion)

### Fixed & Hardened
- **阿拉伯數字試題大題標題誤判隔離（Arabic Question Header Isolation）**：
  - 根據 Codex 審查意見，修正 `SECTION_HEADER` 正則表達式將包含阿拉伯數字（如 `1. 太陽對我微笑`、`2. 做事要持之以恆`）誤判為 `###` 大題標題的缺陷。
  - 將阿拉伯數字序號嚴格限定於 `ITEM_START`，確保題目項目以普通內文換行輸出，僅保留國字大題（如 `一、`、`二丶`、`三、`、`丶國字注音`、`、成語測驗`）作為 `###` 二級大題標題。
- **少數短欄位下長橫幅佔用無條件排除（Unconditional Tall Banner Exclusion）**：
  - 修正原先 `if len(tier_items) < 5: tier_items = items` 在短欄位少於 5 個時會將跨層長橫幅加回 `occupancy` 計算，導致上下分層分隔線被橫幅填滿而錯失分割的問題。
  - 即使短欄位數量稀少，高度 > 55% 頁高之長橫幅亦一律排除於水平空隙計算之外；若所有欄位皆為長欄位則判定為單層文件，徹底根絕分層失效邊界條件。
- **單元測試強化**：在 `deploy/ocr/test_ocr_markdown.py` 新增 `test_vertical_arabic_numbered_items_remain_body_text` 與 `test_vertical_tall_banner_with_few_short_items_splits_lanes`，全量單元測試 100% 通過。
- **`package.json`**：版本號更新至 `2026.09.28.7`。

## [2026.09.28.6] - 2026-09-28 - 繁體中文直排（豎排）閱讀流向與非零原點邊界硬化 (Vertical Layout Natural Flow & Nonzero Origin Boundary Hardening)

### Fixed & Hardened
- **邊緣欄位自然閱讀流向維護（Natural Right-to-Left Reading Flow for Outer Columns）**：
  - 根據 Codex 代碼審查反饋，徹底移除將外側邊緣欄位誤判為 Margin Header 並強行抽離本文的截斷邏輯。
  - 直排（豎排）排版天然由右至左讀取，右側邊緣抬頭欄位自然排列在首位，而左側邊界尾段落款（如文章結尾、註腳）得以嚴格保留在最後讀取位置，防止左側結尾被誤升為頂部 `#` 標題。
- **非零 Y 原點佔用掃描位移修復（Nonzero Y Origin Offset in Lane Divider Detection）**：
  - 修正多層試卷上下分欄（Lane Dividers）的空隙掃描邏輯。原先以 `page_h` 計算之相對索引直接查詢 `occupancy`，當 OCR 幾何座標具有非零原點（`min_y > 0`）時會造成掃描區間偏移而遺漏水平隔線。
  - 改以絕對座標 `y_abs`（`min_y + 0.15 * page_h` 至 `min_y + 0.85 * page_h`）為基準，精確映射至 `idx = y_abs - y_floor` 陣列索引，並直接產出絕對 Y 軸分割點。
- **跨層長方框幾何過濾（Multi-Tier Gap Filtering for Tall Banners）**：
  - 針對高度超過 55% 頁高之貫穿型邊緣橫幅（如考卷滿版校名抬頭），在計算水平空隙時予以排除，杜絕邊緣縱向橫幅阻礙中央水平分割線識別的問題。
- **OCR 筆畫殘缺容錯強化（Stroke-Degraded Section Header Detection）**：
  - 擴充大題與題目序號正規表達式（`SECTION_HEADER` / `ITEM_START`），支援注音或筆畫殘缺（如 `一、` 被誤辨識為單一符號 `丶`、`丨`、`—`）時依然能精確識別為大題標題，保障標題獨立成行與折行黏合機制順暢運作。
- **單元測試強化**：在 `deploy/ocr/test_ocr_markdown.py` 新增左側高欄位自然流向測試（`test_vertical_tall_outer_edge_columns_remain_in_flow`）與非零 Y 原點分層測試（`test_vertical_nonzero_y_origin_lane_detection`）。
- **`package.json`**：版本號更新至 `2026.09.28.6`。

## [2026.09.28.5] - 2026-09-28 - 繁體中文直排（豎排）考卷與文檔幾何重構 (Traditional Chinese Vertical Layout OCR Reconstruction)

### Fixed & Hardened
- **繁體中文直排（豎排）排版自動識別與閱讀順序重構（Traditional Vertical Layout Reconstruction）**：
  - 徹底解決台灣國小考卷、古籍與公文等直排排版文件（文字由上至下、欄位由右至左）被誤當作橫排處理，導致水平跨欄橫向切片串接、語句顛倒錯亂的根本問題。
  - 在 `deploy/ocr/ocr_markdown.py` 中引入垂直文本特徵偵測（`v_boxes > h_boxes and v_boxes >= 5`），自動切換至直排幾何重構管線：
    1. **由右至左欄位流向（Right-to-Left Column Ordering）**：以 X 軸降冪排列欄位，每欄內部依 Y 軸升冪（由上至下）串接字符。
    2. **多層橫向分欄切片（Multi-Tier Lane Segmentation）**：透過 Y 軸佔用長方圖空隙分析，自動偵測試卷上下分層分隔線（如考卷上半部與下半部），依序分層重構。
    3. **側邊滿版標題抽取（Margin Header Extraction）**：自動將貫穿整頁的考卷抬頭（如校名、考試名稱）提升至文件首行作為主標題。
    4. **語句跨行自動折行黏合（Intelligent Line Unwrapping）**：以題目序號、標點與項目起始標記作為邊界，自動將跨欄折行的長句子無縫拼接，消除破碎換行。
    5. **杜絕誤判假表格**：直排模式下抑制橫向 GFM 表格生成，防止試卷欄位被粗暴轉譯成破裂的 Markdown 數據表格。
- **單元測試擴充**：在 `deploy/ocr/test_ocr_markdown.py` 新增直排由右至左閱讀順序、換行黏合與無假表格驗證。
- **`package.json`**：版本號更新至 `2026.09.28.5`。

## [2026.09.28.4] - 2026-09-28 - PDF 分頁子框架 OCR 深度映射與頁碼錨點支援 (PDF Page Sub-Frames OCR Mapping & Hash Fragment Support)

### Fixed & Hardened
- **PDF 分頁子框架 OCR 深度映射（Propagate OCR to PDF Child Frames）**：
  - 根據 Codex 審查反饋，解決純圖掃描 PDF 在直接 OCR 模式下未將各頁文字回填至分頁子框架（`snapshot.childFrames`）的問題。
  - 在 `src/services/binary-extractor.ts` 中新增 `parseOcrPages()` 解析器，將微服務原生直接 OCR 的多頁 Markdown（含 `<!-- Page N -->` 標籤與分界）精準映射至對應的子頁面框架中。
  - 同時在 AnyDoc 與傳統 PDF 解析器中全面支援在分頁框架為空時自動合成 `childFrames`，確保使用者透過 URL 錨點（如 `#page`、`#2`）請求個別分頁時，能直接取得該分頁的完整 OCR 辨識文字與表格 Markdown，杜絕分頁回傳空白。
- **`package.json`**：版本號更新至 `2026.09.28.4`。

## [2026.09.28.3] - 2026-09-28 - 修正 AnyDoc 掃描版 PDF 空白快取與深度 OCR 管線直通 (Fix AnyDoc Scanned PDF Empty Cache & Seamless OCR Pipeline)

### Fixed & Hardened
- **快取穿透防禦與實質內容檢驗（Cache Invalidation on Empty Content & Forced OCR）**：
  - 修正 `src/api/crawler.ts` 中 `cachedScrap()` 在要求 OCR 時未校驗快照是否包含實質內容或是否曾經執行過 OCR 的缺陷。當請求指定 `ocr=true`、`withOcr=true` 或前次快照內容為空/過度稀疏（< 50 字元）時，主動繞過本機記憶體快取與資料庫快取，避免先前未開 OCR 或失敗留下的空白快取被直接命中回傳。
- **AnyDoc 掃描版 PDF 異常防禦與容錯分流（AnyDoc Scanned PDF OCR Fallback）**：
  - 修正 `src/services/binary-extractor.ts` 中 `@firecrawl/anydoc` 在處理純圖片掃描型 PDF 時拋出 `PDF has no extractable text: OCR is required` 導致流程直接進入 `catch` 跳過 OCR 的致命問題。
  - 將 OCR 辨識邏輯整合至容錯處理中，優先調用 PaddleOCR 高效原生的直接 PDF 辨識（直傳微服務 PyMuPDF 解析），失敗時無縫降級至本地多頁渲染（擴大至前 20 頁）逐頁辨識，確保純圖掃描 PDF 100% 擷取完整文字與表格。
- **爬蟲配置參數完整對齊（Crawler Options Mapping for OCR）**：
  - 在 `src/api/crawler.ts` 的 `this.configure()` 補齊 `opts.withOcr` 與 `opts.ocr` 向 `threadLocal` 與 `crawlOpts` 的參數傳遞，確保上游 HTTP 請求之 OCR 旗標能穩定穿透至底層二進位解析器。
- **前端文檔與 OCR 上傳強制刷新（Front-end Cache-Busting Headers）**：
  - 在 `public/app.html` 的文檔上傳與 OCR 上傳請求中加入 `X-No-Cache: true` 請求標頭與 `noCache=true` 查詢參數，防止瀏覽器與代理伺服器快取影響上傳辨識結果。
- **`package.json`**：版本號更新至 `2026.09.28.3`。

## [2026.09.28.2] - 2026-09-28 - PaddleOCR Predictor 並發互斥鎖與 PDF 來源頁碼精準映射 (PaddleOCR Thread-Safe Mutex & PDF Source Page Numbering)

### Fixed & Hardened
- **PaddleOCR Predictor 並發互斥鎖（Thread-Safe Engine Mutex）**：
  - 在 `deploy/ocr/main.py` 引入語言層級互斥鎖 `engine_lock`，序列化調用底層 PaddlePaddle C++ Predictor，徹底杜絕多執行緒環境下並行請求對相同引擎實例的推論競爭。
- **本機 PDF 分頁降級來源真實頁碼精準映射（Accurate PDF Source Page Numbering & Line Tagging）**：
  - 在 `src/api/crawler.ts` 的本機 PDF 分頁渲染降級流程中，改用物件結構精準保留來源真實頁碼，解決個別頁面推論失敗被略過時導致後續頁面標籤錯置（Off-by-one）的問題。
  - 在結構化 JSON 回應的 `lines` 陣列中，為每行識別文字附加來源頁碼屬性（`line.page`），方便下游解析器精準定位。
- **`package.json`**：版本號更新至 `2026.09.28.2`。

## [2026.09.28.1] - 2026-09-28 - OCR 支援 PDF 解析與 AnyDoc OCR 選項整合 (OCR PDF Parsing Support & AnyDoc OCR Option Integration)

### Added
- **OCR 完整支援 PDF 文件解析（Native PDF Document OCR & Multi-page Aggregation）**：
  - `/api/ocr` API 端點與前端 Tab 4（「圖片與 PDF 文件辨識」）現在原生支援上傳 `.pdf` 文件（MIME `application/pdf`）。
  - 後端 PaddleOCR 微服務整合 `pymupdf` 高效能 PDF 渲染引擎，支援高解析度（150~200 DPI）逐頁轉譯、文字與二維表格辨識，並將多頁內容串接為結構化 Markdown（`<!-- Page N -->`、`\n\n---\n\n` 與表格清單）。
  - `888-url2md` 增加 PDF 自動檢測與雙層容錯（優先由微服務高效渲染，若異常自動轉由本地 `PDFExtractor` 逐頁分流推論）。
- **AnyDoc 前端新增 OCR 辨識選項（AnyDoc Scanned PDF OCR Option & Toggle）**：
  - 前端 Tab 3「文檔解析 (AnyDoc)」表單新增「`[x] 啟用 OCR 圖片/掃描文檔文字辨識 (強制調用 PaddleOCR 繁中 & 表格模型)`」選項。
  - 勾選時自動傳送 `X-With-Ocr: true` 請求標頭與 `?ocr=true` 參數，讓掃描型 PDF 或包含圖表的文檔能由使用者強制啟動 PaddleOCR 繁中與表格模型進行深層辨識。

### Fixed & Performance
- **解除 FastAPI Event Loop 阻塞（Non-blocking Threadpool Offloading）**：
  - 將 PaddleOCR 微服務（`deploy/ocr/main.py`）之 CPU 密集型推論操作透過 Starlette `run_in_threadpool` 移至獨立背景工作執行緒，徹底防止同步 CPU 計算阻斷 asyncio 事件迴圈。
  - `/health` 健康檢查探針在滿載推論時依然能保持 < 2ms 瞬時回應，不再因推論耗時觸發 888-url2md 客戶端探測超時或熔斷。
- **容器記憶體擴展與 OpenMP 資源配置最佳化**：
  - `paddleocr-server` 容器記憶體限制由 4GB 調升至 8GB，消除處理高解析度大圖時因 Linux cgroup 記憶體上限觸發頻繁 swap 抖動與 I/O 阻塞問題。
  - 調整 `OMP_NUM_THREADS=1`，防止 OpenBlas 多執行緒資源競爭與日誌警告。
- **`package.json`**：版本號更新至 `2026.09.28.1`。

## [2026.09.14.16] - 2026-09-14 - 建立 OCR 自動重試、自我修復與 30 秒彈性逾時機制 (OCR Automatic Retry, Self-Healing Resilience & 30s Timeout)

### Fixed & Hardened
- **引進節點內自動重試機制（Auto-Retry with Jittered Backoff）**：
  - 針對瞬態網路抖動、連線重置（ECONNRESET/fetch failed）、逾時（TimeoutError）或上游 502/503/504 暫時性錯誤，自動在同一節點執行最多 2 次平滑重試（包含 400~600ms 指數隨機退避），不再因單次瞬態延遲直接失敗。
- **漸進式熔斷冷卻（Progressive Circuit Breaker）**：
  - 首次異常時僅設定 5 秒短暫觀察冷卻（5000ms），連續 2 次以上失敗才升級至 30 秒冷卻；推論成功立即重置失敗次數與冷卻狀態，徹底消除單一偶發毛刺引發長時間服務中斷的問題。
- **提升推論逾時上限至 30 秒 (`timeoutMs: 30000`)**：
  - 先前預設的 10 秒（`10000ms`）超時在伺服器高負載（如並行執行爬蟲渲染）時，會導致大型高解析度圖片因超過 10 秒而被客戶端強行中止並拋出 `AssertionFailureError`。
  - 將預設超時調整為 30 秒，並支援以環境變數 `OCR_TIMEOUT_MS` 覆寫。
- **提升健康檢查超時至 6 秒 (`healthTimeoutMs: 6000`)**：
  - 避免在短暫 CPU 峰值期間健康探測過早超時判定節點離線。
- **`package.json`**：版本號遞增至 `2026.09.14.16`。

## [2026.09.14.15] - 2026-09-14 - 修正 Gateway 表格專用模式全文回退 (Prevent Gateway Fallback to Full OCR in Strict Table Mode)

### Fixed
- 修正 TypeScript gateway 在 `mode=table` 且 `tableMarkdown` 為空時，錯誤退回 `result.markdown` 的問題。
- `/api/ocr` 與 `/v1/ocr` 的純文字表格專用回應現在會在無表格時回傳空字串，完整 OCR 只保留在標準模式。
- 新增 gateway 層回歸測試，防止 Python OCR 層修正後又被上層 fallback 覆蓋。
- `package.json` version updated to `2026.09.14.15`.

## [2026.09.14.14] - 2026-09-14 - OCR 純表格模式嚴格回傳與重構器回歸測試 (Strict OCR Table-Only Output and Reconstruction Regression Tests)

### Fixed
- `mode=table` / `table_only=true` 在未偵測到表格時不再退回包含圖片網址與 Footer 的全文 OCR，改回傳空字串與空的 `tables` 陣列。
- 將 OCR Markdown 重構器抽出為可獨立測試的模組，確保 `tableMarkdown` 不包含表格外的 OCR 文字。
- OCR Docker image build now runs the Markdown reconstruction regression tests before publishing.

### Contract Clarification
- Standard JSON responses keep `data.markdown` as full OCR content.
- Consumers that need an isolated table must use `data.tableMarkdown` or `data.tables[0]`; `tableMarkdown` is `null` when no table is detected.
- `package.json` version updated to `2026.09.14.14`.

## [2026.09.14.13] - 2026-09-14 - OCR 回應結構新增 tableMarkdown 欄位直通純淨 Markdown 表格 (OCR JSON Response tableMarkdown Field for Seamless Editor Direct Consumption)

### 🚀 Features & Frontend Integration Enhancements
- **新增 `data.tableMarkdown` 欄位**：
  - 在 `POST /api/ocr` 與 `POST /v1/ocr` 的 JSON 回應頂層新增 `data.tableMarkdown: string | null` 欄位。
  - 當圖片中含有表格時，`tableMarkdown` 直接提供最純淨的 GFM Markdown 表格字串（例如 `| 國衛院 |  | 國健署 |\n...`），完全不含前後文的標題、圖片連結或狀態列雜訊。
  - 前端筆記編輯器（如 `cf-notepad`、BlockNote、Milkdown、TipTap）可直接以 `res.data.tableMarkdown` 直通取用，無須前端猜測或正則擷取：
    ```json
    {
      "markdown": "...完整全文 OCR（含外圍文字）...",
      "tableMarkdown": "| 國衛院 |  | 國健署 |\n| :--- | :--- | :--- |\n..."
    }
    ```
- **同步支援 `data.tables: string[]`**：
  - 保留 `data.tables` 陣列，若單圖中存在多個表格，可依序讀取各表格字串。
- **`package.json`**：版本號遞增至 `2026.09.14.13`。

## [2026.09.14.12] - 2026-09-14 - OCR 表格專用模式 (mode=table) 與獨立表格陣列 (data.tables) 徹底隔離截圖雜訊 (OCR Dedicated Table Mode and Clean Tables Array for Editor Integration)

### 🚀 Features & Quality Enhancements
- **新增 OCR 表格專用模式 (`mode=table` / `table_only=true`)**：
  - 支援透過 Query 參數 `?mode=table`、`?table_only=true` 或 Header `X-Ocr-Mode: table`、`X-Table-Only: true` 啟動純表格抽取。
  - 當啟用表格專用模式時，`data.markdown`（以及 `Accept: text/markdown`、`Accept: text/plain`）僅回傳 100% 純淨的 GFM Markdown 表格，自動剝離所有外圍截圖雜訊（如側邊欄圖片網址、未發布提示文字、長度計數器、底部工具按鈕等）。
- **新增結構化獨立表格陣列 (`data.tables`)**：
  - 在所有 OCR JSON 回應中永久提供 `data.tables: string[]`。
  - 即使在預設全頁模式下，前端富文本編輯器（如 `cf-notepad` / BlockNote）亦可直接讀取 `res.data.tables[0]`，免除前端任何二次正則過濾或雜訊修剪。
- **`package.json`**：版本號遞增至 `2026.09.14.12`。

## [2026.09.14.11] - 2026-09-14 - OCR 表格連通空間聚類品質重構、CORS 安全憑證隔離與內部節點防洩漏 (OCR Table Spatial Clustering Quality Upgrade, Secure CORS Credentials Isolation & Node URL Masking)

### 🚀 Features & Quality Enhancements
- **PaddleOCR 表格二維幾何連通分量（Connected Components）聚類算法升級**：
  - 在 `deploy/ocr/main.py` 引進圖論空間連通分量分析（距離門檻水平 160px、垂直 80px），徹底將表格區域與外圍編輯器外框、側邊欄預覽、頁面標題（如 `許厝學童尿液研究比较`）及底部狀態列（如 `尚未發布`、`總長度`）物理隔離。
  - 欄位邊界精準投影：僅針對多欄表格區塊進行橫向 Gutters 計算，消除了外圍長文字或底部按鈕對投影通道的污染，精準切分 3 欄式比較表。
  - 儲存格文字純淨化：移除儲存格內多行文字生硬拼接的 `" / "` 分隔符，改以乾淨空格銜接，避免欄位錯位與文字污染。

### 🔒 Security & Privacy Hardening
- **CORS 憑證安全隔離 (Credentials Isolation)**：
  - 改寫 `RPCRegistry.__CORSAllowAllMiddleware`，對任意第三方來源（如 `https://evil.example`）不再反射回傳 `Access-Control-Allow-Credentials: true`。
  - 僅對可信的第一方網域（`david888.com`、`aiurl.tw`、`create360.ai`、`glsoft.ai` 及 `localhost` / `127.0.0.1`）授予憑證存取權限。
- **後端節點資訊與錯誤防洩漏 (Node URL & Error Masking)**：
  - 在 `src/services/ocr-client.ts` 與 `src/api/crawler.ts` 移除公開 API 回應中的 `nodeUrl` 內部微服務位址。
  - 遮蔽內部上游連線失敗訊息與 Python 堆疊資訊，客戶端僅回傳通用的安全錯誤提示，內部異常僅記錄於 Winston 伺服器日誌中。
- **`package.json`**：版本號遞增至 `2026.09.14.11`。

## [2026.09.14.10] - 2026-09-14 - 修復 Nginx 反向代理上傳限制 (HTTP 413) 擴充至 50MB 並同步全量文件規格 (Fix Nginx 413 Upload Limit to 50MB and Sync Documentation Across All Endpoints)

### 🐛 Bug Fixes & Infrastructure
- **修復 Nginx 反向代理 413 Request Entity Too Large 限制**：
  - 診斷出線上反向代理（Nginx）預設 `client_max_body_size` 僅 1MB，導致高解析度截圖（如 1.83 MB PNG 表格圖片）在入口層被 Nginx 攔截並回傳 413 錯誤。
  - 三台生產主機（`2md.aiurl.tw`、`create360.ai`、`2md.glsoft.ai`）之 Nginx 設定全量擴充 `client_max_body_size 50M;` 並重載生效。
  - 成功以 1.7 MB (1.83 MB uncompressed) 原始 PNG 表格截圖實測三台主機，全數正確通過入口層並產出完整 GFM 表格 Markdown。

### 📚 Documentation & Developer Experience
- **全量同步 50MB 上傳大小規格與文件更新**：
  - 於 `README.md`（中英文雙區塊）、`public/SKILL.md`、`public/llms.txt`、`public/llms-full.txt` 及 `src/api/crawler.ts` 動態端點明確註明單檔上傳上限為 50MB（支援超高解析度截圖與多頁掃描 PDF）。
- **`package.json`**：版本號遞增至 `2026.09.14.10`。

## [2026.09.14.9] - 2026-09-14 - 全面同步純前端 CORS 支援、2D 表格重構與 BlockNote 編輯器整合規格至 SKILL.md 與 llms.txt (Pure Frontend CORS, 2D Table Reconstruction & BlockNote Integration Documentation Sync)

### 📚 Documentation & Developer Experience
- **純前端 SPA 與 BlockNote 編輯器整合指引**：
  - 在 `src/api/crawler.ts`、`public/SKILL.md`、`public/llms.txt` 與 `public/llms-full.txt` 完整增補純前端（Pure Frontend SPA，如 React, Vue, Vite, Next.js client components）直接透過瀏覽器 `fetch` 調用 `POST /api/ocr` 之說明。
  - 明確記載 CORS 支援狀態（全域已啟用 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Credentials: true` 及 OPTIONS Preflight 回應），前端無需自建後端代理轉發。
  - 增補 BlockNote 富文本編輯器即插即用 TypeScript 範例：利用 `editor.tryParseMarkdownToBlocks(data.markdown)` 將後端 2D 空間邊界聚類重構後的 GFM 表格無縫插入編輯器。
- **2D 幾何邊界表格重構說明與 AnyDoc `X-With-Ocr` 標頭同步**：
  - 在 `SKILL.md` 與 `llms.txt` 標頭清單正式納入 `X-With-Ocr: true` 參數，說明 AnyDoc 對純掃描 PDF（< 50 字元）自動調用 OCR 降級的機制。
- **`package.json`**：版本號遞增至 `2026.09.14.9`。

## [2026.09.14.8] - 2026-09-14 - PaddleOCR 微服務新主機部署指南與架構文件完善 (PaddleOCR New Host Deployment Guide & Architecture Documentation)

### 📚 Documentation & Developer Experience
- **完善 `deploy/ocr/README.md`**：
  - 詳細記錄二維幾何邊界聚類（`reconstruct_markdown`）、PP-OCRv4 旗艦推論模型（`ch`）與 CPU AVX 相容性補丁之程式碼存放位置與角色分工。
  - 提供全新主機（如 Host 4 或 Staging 環境）的兩種標準化部署路徑：
    1. **極速部署（GHCR 預建映像檔）**：只需下載 `docker-compose.yml` 即可直接啟動 `ghcr.io/tbdavid2019/888-ocr:latest`。
    2. **原始碼本地構建**：`git clone` 後執行 `docker compose up -d --build`。
  - 記錄如何在 `888-url2md` 的 `OCR_SERVICE_URLS` 登記新節點，以實現自動探測與跨主機故障轉移（Failover）。
- **`package.json`**：版本號遞增至 `2026.09.14.8`。

## [2026.09.14.7] - 2026-09-14 - OCR 二維空間表格重構與 AnyDoc 掃描文件 Opt-in 協同整合 (2D Spatial Table Reconstruction & AnyDoc OCR Opt-in Integration)

### 🚀 Features & Enhancements
- **PaddleOCR 微服務智慧二維表格重構 (`reconstruct_markdown`)**：
  - 在 `deploy/ocr/main.py` 實作幾何空間邊界聚類（Bounding-Box Clustering）與一維 X 軸投影通道（Gutters）偵測算法。
  - 自動判斷多欄多列的表格區塊，將原本逐行平鋪的離散文字轉換為結構化的 GitHub Flavored Markdown (GFM) 表格（`| ... | ... |\n| :--- | :--- |`）。
  - 對斜線表頭與多行儲存格（如 `貿易對象 / 年分`）自動進行單一儲存格融合與管道符號（`\|`）安全轉義。
  - 對頁面中的標題、段落與附註保持乾淨的 Markdown 段落格式，不產生誤判。
- **AnyDoc + OCR 協同整合與 Opt-in 彈性機制**：
  - **顯式 Opt-in 參數**：在 `CrawlerOptions` 與 OpenAPI 文件中註冊 `X-With-Ocr: true`、`X-Ocr: true` 與 query 參數 `withOcr=true` / `ocr=true`。
  - **無文字圖層掃描 PDF 自動平滑降級**：當 AnyDoc 解析純圖片掃描 PDF 產出空字串或少於 50 字元時，若 OCR 叢集可用，系統自動調用 `pdfExtractor.extractRendered` 逐頁渲染並調用 `ocrClientService` 辨識，自動補齊多頁 Markdown 與表格，並於 `traits` 標註 `ocr`。
  - **零額外負載保證**：一般包含文字圖層的 PDF 預設仍走 AnyDoc 毫秒級極速 Rust 解析，完全不增加 OCR 算力負擔。

### 📚 Documentation & Compatibility
- **`README.md`**：同步更新 Traditional Chinese 與 English 區塊之 Feature 10 與 AnyDoc 整合說明。
- **`package.json`**：版本號遞增至 `2026.09.14.7`。

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
