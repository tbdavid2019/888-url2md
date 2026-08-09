# 888 URL to Markdown (888-url2md)

> **感謝原作者 (Acknowledgement)**: 本專案基於著名的 [Jina AI Reader (`jina-ai/reader`)](https://github.com/jina-ai/reader) 開源專案進行二次開發與增強。特別感謝 Jina AI 團隊打造優秀且強大的網頁轉 Markdown 引擎！

A high-performance Web Reader, Multi-URL Batch Crawling, and Web Search API service designed specifically for LLMs, RAG pipelines, and AI Agents. Converts web pages and search queries into clean Markdown or structured JSON.

Currently deployed at: **[create360.ai](https://create360.ai)** (or easily self-hosted).

---

## 🚀 核心特性 (Features)

1. **單頁 / 多網址併發批次抓取 (Multi-URL Batch Crawling)**
   - 支援 `GET /<URL>`、`POST /v1/batch`、`POST /batch` 以及 `POST /`（傳送 `urls` 陣列）。
   - **高併發處理**：同時併行抓取多個網址，顯著降低 LLM 工具調用的往返時間 (RTT)。
   - **獨立容錯 (Fault Isolation)**：單一網址失敗（如 404 或 DNS 錯誤）不會中斷整批請求，成功頁面依舊正常返回。

2. **即時 Web 搜尋 (Real-time Web Search & SERP)**
   - 支援 `GET /s/<query>` 與 `GET /search?q=<query>`。
   - 內建開箱即用的 DuckDuckGo HTML SERP，完全免金鑰即可搜尋全球網頁與繁體中文內容並即時轉為 Markdown。

3. **Agent Skill & 首頁自動教學 (Interactive `SKILL.md`)**
   - 訪問首頁 `GET /`（使用 Markdown/Text）或 `GET /skill.md` 時，自動提供標準的 **`SKILL.md` 說明文件**，教導首次訪問的 LLM 如何安裝與呼叫 `888-url2md` 工具。

4. **符合 `/llms.txt` 與 `/llms-full.txt` 最新標準 (llmstxt.org)**
   - 內建 `/llms.txt` 與 `/llms-full.txt` 端點，方便 AI Agent（如 Cursor, Windsurf, LangChain, LlamaIndex, OpenAI GPTs, Claude 等）在 Inference 階段自動識別與導覽網站能力。

5. **動態 Domain 參數化 (Dynamic Domain Detection)**
   - 自動偵測環境變數 (`PUBLIC_DOMAIN`, `BASE_URL`) 或 HTTP 請求 Header (`x-forwarded-host`, `Host`)，自動將說明文件與 JSON 內的網址替換為目前部署的域名（如 `https://create360.ai` 或 `http://localhost:3000`）。

---

## 📖 API 使用指南 (Usage)

### 1. 單網址抓取 (Single URL Reading)

**GET 方式**：在網址前加上服務域名
```bash
curl 'https://create360.ai/https://example.com'
```

**POST 方式**：傳送 JSON Payload
```bash
curl -X POST 'https://create360.ai/' \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}'
```

---

### 2. 即時 Web 搜尋 (Real-time Web Search)

本服務提供兩種靈活的 Web 搜尋呼叫方式，皆會自動進行 Web 搜尋並將最相關結果轉譯為乾淨的 Markdown：

#### **A. 路徑式搜尋 (Path-based Search)**
直接將關鍵字放在 `/s/` 路徑後方（支援 URL 編碼）：
```bash
curl 'https://create360.ai/s/%E5%8F%B0%E7%A9%8D%E9%9B%BB'
# 或搜尋英文
curl 'https://create360.ai/s/NVIDIA'
```

#### **B. Query 參數式搜尋 (Query-based Search)**
使用標準 `?q=` 查詢參數：
```bash
curl 'https://create360.ai/search?q=%E8%98%8B%E6%9E%9C%E5%85%AC%E5%8F%B8'
# 或
curl 'https://create360.ai/search?q=TSMC'
```

---

### 3. 多網址批次抓取 (Multi-URL Batch Reading)

傳送包含 `urls` 陣列的 JSON 至 `/v1/batch` 或 `/` 端點：

#### **Markdown 格式回傳 (`Accept: text/plain`)**
```bash
curl -X POST 'https://create360.ai/v1/batch' \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/plain' \
  -d '{
    "urls": [
      "https://example.com/page1",
      "https://example.com/page2"
    ]
  }'
```
*回傳範例*：多個頁面以 `---` 標籤清晰分隔。

#### **JSON 格式回傳 (`Accept: application/json`)**
```bash
curl -X POST 'https://create360.ai/v1/batch' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "urls": [
      "https://example.com/page1",
      "https://example.com/page2"
    ]
  }'
```

---

### 4. LLM / Agent 開發者工具標準 (Skill & LLMs.txt)

- **`GET https://create360.ai/`** (Plain/Markdown): LLM 首頁 Skill 說明
- **`GET https://create360.ai/skill.md`**: Agent Skill 規格文檔
- **`GET https://create360.ai/llms.txt`**: 符合 [llmstxt.org](https://llmstxt.org/) 的推理指引
- **`GET https://create360.ai/llms-full.txt`**: 完整 API 與 Skill 規格

#### **JSON Schema (適用於 Tool Call 宣告)**:
```json
{
  "name": "888_url2md",
  "description": "Fetch and convert web pages, search results, or multiple URLs into clean Markdown.",
  "parameters": {
    "type": "object",
    "properties": {
      "urls": {
        "type": "array",
        "items": { "type": "string" },
        "description": "List of web page URLs to scrape in batch."
      },
      "url": {
        "type": "string",
        "description": "Single web page URL to scrape or search query."
      }
    }
  }
}
```

---

## ⚙️ 常用 Header 控制 (HTTP Headers)

可透過 Request Header 控制抓取與解析行為：

- `X-Respond-With`: `markdown` | `html` | `text` | `frontmatter`
- `X-Preset`: 預設模式（`reader`, `index`, `research`, `agent`, `spider`）
- `X-Target-Selector`: 指定 CSS Selector 提取特定 DOM 元素（如 `.article-body`）
- `X-Remove-Selector`: 指定 CSS Selector 剔除不需要的元素（如 `nav, footer, .ads`）
- `X-No-Cache: true`: 強制跳過快取重新抓取

---

## 🛠️ 本地開發與部署 (Local Development & Deployment)

### 需求條件
- Node.js >= 22.15

### 步驟
1. **安裝依賴套件**：
   ```bash
   npm install
   ```
2. **下載必備外部資產** (GeoIP 與字型檔)：
   ```bash
   npm run assets:download
   ```
3. **專案編譯**：
   ```bash
   npm run build
   ```
4. **啟動服務**：
   ```bash
   npm start
   ```

### 環境變數設定 (Environment Variables)
- `PUBLIC_DOMAIN`: 設定服務公開域名（如 `https://create360.ai`）。若未設定將自動從 HTTP 請求標頭動態推導。
- `PORT`: 指定伺服器監聽埠號（預設 3000）。

---

## 📄 開源協議與致謝 (License & Attribution)

- 原創作者: [Jina AI](https://jina.ai)
- 原始專案: [jina-ai/reader](https://github.com/jina-ai/reader)
- 本專案採用 Apache-2.0 / MIT 相關開源協議，歡迎社群自由使用與二次開發。
