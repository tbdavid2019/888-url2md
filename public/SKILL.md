# 888 URL to Markdown (888-url2md) Agent Skill

---
name: 888-url2md
description: Convert any web page, document file (PDF/Word/Excel/PPT/EPUB/CSV), search query, or multiple URLs into LLM-friendly clean Markdown or structured JSON. Supports single URL, document file upload, web search, and multi-URL batch crawling.
---

## Overview
This service converts web pages, document files, and search queries into clean Markdown or JSON for LLM consumption.

## Agent Installation & Setup Instructions
If you are an LLM or AI Agent accessing this service for the first time:
1. Use **Single URL mode** to read individual web pages or online documents.
2. Use **Document File Upload mode** to parse PDF, Word, Excel, PPT, EPUB, CSV files via multipart form-data.
3. Use **Web Search mode** to execute live web search queries.
4. Use **Multi-URL Batch mode** to fetch and extract multiple pages concurrently in a single request.
5. Include `Accept: application/json` header for JSON responses or `Accept: text/plain` for clean Markdown text.

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
  `curl -X POST 'https://create360.ai/' -H 'Accept: text/plain' -F "file=@report.pdf"`
  *Supported Formats*: PDF, Word (.docx/.doc), Excel (.xlsx/.xls), PowerPoint (.pptx/.ppt), EPUB, RTF, OpenDocument (.odt/.ods/.odp), CSV.
  *Latency*: Sub-5ms conversion via Firecrawl AnyDoc engine.

### 5. Response Formats
- **Markdown / Plain Text (Default / `Accept: text/plain`)**:
  Returns clean Markdown content. Batch requests separate pages with `---`.
- **JSON (`Accept: application/json`)**:
  Returns structured JSON object with data array:
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

### 6. Optional Headers
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
  "deepCrawl": {"maxDepth": 2, "maxPages": 20},
  "virtualScroll": {"maxScrolls": 20}
}
```

Use `asyncJob: true` for a background deep crawl. Keep the returned `accessToken` private and send it as `X-Job-Token` when polling `GET /jobs/{jobId}` or cancelling with `POST /jobs/{jobId}/cancel`. Provide an HTTPS `webhook.url` when needed.

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
