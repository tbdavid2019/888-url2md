# 888 URL to Markdown (888-url2md) Agent Skill

---
name: 888-url2md
description: Convert any web page, document file (PDF/Word/Excel/PPT/EPUB/CSV), image (OCR), search query, or multiple URLs into LLM-friendly clean Markdown or structured JSON. Supports single URL, document file upload, PaddleOCR image extraction, web search, and multi-URL batch crawling.
---

## Overview
This service converts web pages, document files, images, and search queries into clean Markdown or JSON for LLM consumption.

## Agent Installation & Setup Instructions
If you are an LLM or AI Agent accessing this service for the first time:
1. Use **Single URL mode** to read individual web pages or online documents.
2. Use **Document File Upload mode** to parse PDF, Word, Excel, PPT, EPUB, CSV files via multipart form-data.
3. Use **Image OCR mode** (`POST /api/ocr` or `/v1/ocr`) to extract text and tables from images (PNG, JPG, WEBP, BMP) using PP-OCRv4.
4. Use **Web Search mode** to execute live web search queries.
5. Use **Multi-URL Batch mode** to fetch and extract multiple pages concurrently in a single request.
6. Include `Accept: application/json` header for JSON responses or `Accept: text/plain` for clean Markdown text.

---

## API Endpoints & Usage

### 1. Single URL Reading
- **GET Request**: `/<URL>`
  *Example*: `/https://news.ycombinator.com`
- **POST Request**: `/`
  *JSON Body*:
  ```json
  {
    "url": "https://news.ycombinator.com"
  }
  ```

### 2. Live Web Search (SERP)
- **A. Path-based Search (路徑式搜尋)**: `/s/<SEARCH_QUERY>`
  *Example*: `/s/%E5%8F%B0%E7%A9%8D%E9%9B%BB` or `/s/NVIDIA`
- **B. Query Parameter-based Search (Query 參數式搜尋)**: `/search?q=<SEARCH_QUERY>`
  *Example*: `/search?q=%E8%98%8B%E6%9E%9C%E5%85%AC%E5%8F%B8` or `/search?q=TSMC`

### 3. Multi-URL Batch Reading (Batch Crawl)
- **POST Request**: `/v1/batch` or `/batch` or `/`
  *JSON Body*:
  ```json
  {
    "urls": [
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page3"
    ]
  }
  ```

### 4. Document File Upload & Parsing (AnyDoc Engine)
- **POST Request**: `/`
  *Multipart Form-Data*: Attach file in form-data parameter `file` or `pdf`:
  `curl -X POST 'https://<HOST>/' -H 'Accept: text/plain' -F "file=@report.pdf"`
  *Supported Formats*: PDF, Word (.docx/.doc), Excel (.xlsx/.xls), PowerPoint (.pptx/.ppt), EPUB, RTF, OpenDocument (.odt/.ods/.odp), CSV.
  *Latency*: Sub-5ms conversion via Firecrawl AnyDoc engine.

### 5. Image OCR & Table Reconstruction (PaddleOCR PP-OCRv4 Engine)
- **POST Request**: `/api/ocr` or `/v1/ocr`
  *Multipart Form-Data*: Attach image in form-data parameter `file` or `image`:
  `curl -X POST 'https://<HOST>/api/ocr' -H 'Accept: text/plain' -F "file=@screenshot.png"`
  *JSON / Base64 Body*:
  ```json
  {
    "image": "data:image/png;base64,..."
  }
  ```
  *Supported Formats*: PNG, JPG, JPEG, WEBP, BMP, GIF.
  *Upload Size Limit*: Up to 50MB per file (supports ultra-high resolution screenshots, multi-megapixel scans, and uncompressed PNGs; reverse proxy configured for 50MB, internal engine up to 100MB).
  *Optional Query Parameters*:
    - `lang`: `ch` (default, PP-OCRv4 bilingual Chinese & English) or `chinese_cht` (Traditional Chinese).
    - `use_angle_cls`: `true` (default) / `false` (orientation angle auto-detection).
  *Capabilities & Health Check*:
    - `GET https://<HOST>/api/capabilities`: Probe dynamic OCR cluster readiness and node health (`data.ocr.available`).
    - `GET https://<HOST>/api/ocr/status`: Inspect active node and cluster health.

#### 5.1 2D Spatial Table Reconstruction & GFM Markdown Output
The OCR engine automatically performs 2D bounding-box spatial clustering and horizontal gutter detection on tabular images. Instead of dumping disjoint text lines, it outputs ready-to-render GitHub-Flavored Markdown (GFM) tables:
```markdown
| 貿易對象 / 年分 | 甲 | 乙 | 丙 | 丁 |
| :--- | :--- | :--- | :--- | :--- |
| 1980年 | 0 | 173,581 | 76,995 | 69,448 |
```

#### 5.2 Pure Frontend (SPA) Direct Access & BlockNote Integration
This service fully supports browser CORS (`Access-Control-Allow-Origin: *`, credentials, preflight OPTIONS). Pure frontend applications (React, Vue, Vite, Next.js client components) can call this API directly from the browser without a backend proxy:
```typescript
// Pure frontend: Upload image and insert reconstructed table into BlockNote editor
async function insertOcrTableIntoBlockNote(editor: BlockNoteEditor, imageBlob: Blob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'table.png');

  // Add ?mode=table to isolate only the table and strip editor chrome/footers
  const res = await fetch('https://<HOST>/api/ocr?mode=table', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: formData
  }).then(r => r.json());

  // res.data.tables[0] or res.data.markdown contains the isolated GFM table
  const markdownTable = res?.data?.tables?.[0] || res?.data?.markdown || res.markdown;
  const blocks = await editor.tryParseMarkdownToBlocks(markdownTable);
  editor.insertBlocks(blocks, editor.getTextCursorPosition().block, 'after');
}
```

### 6. Response Formats
- **Markdown / Plain Text (Default / `Accept: text/plain` or `Accept: text/markdown`)**:
  Returns clean Markdown content directly. When `mode=table` is specified, returns only the isolated GFM table. Batch requests separate pages with `---`.
- **JSON (`Accept: application/json`)**:
  Returns structured JSON object:
  - For standard crawler: `data` array with extracted pages.
  - For `/api/ocr`: `data.markdown`, `data.tables` (isolated tables array), `data.text`, and `data.lines`.
  ```json
  {
    "code": 200,
    "status": 20000,
    "data": [
      { "url": "https://example.com/page1", "title": "...", "content": "..." },
      { "url": "https://example.com/page2", "title": "...", "content": "..." }
    ]
  }
  ```

### 7. Optional Headers
- `X-With-Ocr: true` (or `X-Ocr: true`): Explicitly opt-in to OCR extraction for documents and scanned PDFs. Pure image scanned PDFs (with < 50 characters) automatically fall back to OCR.
- `X-Respond-With`: `markdown` | `html` | `text` | `frontmatter`
- `X-Preset`: `reader` | `index` | `research` | `agent` | `spider`
- `X-Target-Selector`: Extract specific CSS selector.
- `X-Remove-Selector`: Remove specific CSS selector.
- `X-No-Cache: true`: Bypass internal page cache.
- `X-With-Generated-Alt: true`: Generate AI alt text for images.
- `X-With-Images-Summary: true`: Include image metadata summaries.
- `X-Content-Filter: pruning | bm25`: Return compact filtered Markdown in JSON as `fitMarkdown`.
- `X-Content-Query: ...`: Query used by the BM25 content filter.
- `X-Session-Id: ...`: Reuse session cookies for related requests.
- `X-Prefetch: true`: Discover links without formatting the page.
- `X-Adaptive: true`: Enable conservative adaptive CSS structured extraction.
- `X-Adaptive-Id`: Identify the persisted selector profile.
- `X-Adaptive-Threshold`: Confidence threshold from `0.5` to `0.95`.

### 7. Advanced JSON Options

The POST body can also include:

```json
{
  "extraction": {
    "type": "css",
    "baseSelector": ".product",
    "fields": [{"name": "title", "selector": "h2"}]
  },
  "contentFilter": "bm25",
  "contentQuery": "product price",
  "adaptive": true,
  "adaptiveId": "product-card",
  "adaptiveThreshold": 0.7,
  "deepCrawl": {
    "maxDepth": 2,
    "maxPages": 20,
    "concurrency": 3,
    "concurrencyPerDomain": 2,
    "autoThrottle": true
  },
  "virtualScroll": {"maxScrolls": 20}
}
```

Adaptive extraction is CSS-only, opt-in, and rejects ambiguous candidates. Deep-crawl concurrency is capped at 20 globally and 10 per domain; defaults remain sequential. With `asyncJob: true`, keep the returned `accessToken` private and send it as `X-Job-Token` when polling `GET /jobs/{jobId}`, cancelling with `POST /jobs/{jobId}/cancel`, or resuming with `POST /jobs/{jobId}/resume`. Provide an HTTPS `webhook.url` when needed.

### 7.1 LLM Wait and Async Job Rules

- For a normal page, allow a client timeout of **15–30 seconds**.
- For a JavaScript-heavy page or anti-bot challenge, allow **30–45 seconds**.
- For a deep crawl or document conversion, allow **45–60 seconds or more**. Use `asyncJob: true` when the task may exceed the client timeout.
- Do not start a fallback crawler or submit the same POST again before the timeout. A premature retry can duplicate browser work and create a thundering-herd spike.
- With `asyncJob: true`, wait only for the initial job acceptance response, keep `accessToken` private, then poll `GET /jobs/{jobId}` every **2–5 seconds**. Stop at `completed`, `failed`, or `cancelled`.
- Use the HTTPS webhook for long jobs when polling is not suitable. Treat webhook delivery as a notification and keep polling available for recovery.

#### Exact Async Job Contract

1. Submit **one** `POST /` request with `asyncJob: true` and `deepCrawl`.
2. Read the job fields from the JSON envelope at `data.id` and `data.accessToken`:

   ```json
   {"code":200,"status":20000,"data":{"id":"crawl_...","status":"running","accessToken":"...","statusUrl":"/jobs/crawl_..."}}
   ```

3. Poll `GET /jobs/{data.id}` with `X-Job-Token: {data.accessToken}`. Read the current state from `data.status`.
4. Stop at `completed`, `failed`, or `cancelled`. Read the crawl result from `data.result`.
5. To stop work, call `POST /jobs/{data.id}/cancel` with the same token. Poll until `data.status` becomes `cancelled`, then call `POST /jobs/{data.id}/resume` with the same token to continue.

Pitfalls: `GET` is only for polling; cancel and resume require `POST`. Cancel acknowledgement can arrive while the job is still `running`, so do not resume until polling reports `cancelled`. Do not put the access token in the URL, do not use `job.id` as the token, and do not submit a second crawl while the first job is still running.

### 8. WebMCP Browser Tools

When the homepage is opened in a WebMCP-enabled Chrome browser, it registers
the following read-only tools through `document.modelContext`:

- `search_web`: Search the live web. Input: `{ "query": "..." }`.
- `read_web_page`: Read one page. Input: `{ "url": "https://..." }`.
- `read_web_pages`: Read multiple pages concurrently. Input: `{ "urls": ["https://..."] }`.

The tools return clean Markdown and update the visible result panel. Browsers
without `document.modelContext` continue to use the regular API and forms.

---

## Tool Specification (Schema)
```json
{
  "name": "888_url2md",
  "description": "Fetch and convert web pages, document files (PDF/Word/Excel/PPT/EPUB/CSV), search results, or multiple URLs into clean Markdown.",
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
        "description": "Single web page URL to scrape, document file URL, or search query."
      }
    }
  }
}
```
