# Web Reader & Batch Web Reader Agent Skill

---
name: web-reader-batch
description: Convert any web page or multiple URLs into LLM-friendly clean Markdown or structured JSON. Supports single URL and multi-URL batch crawling.
---

## Overview
This service converts web pages into clean Markdown or JSON for LLM consumption.

## Agent Installation & Setup Instructions
If you are an LLM or AI Agent accessing this service for the first time:
1. Use **Single URL mode** to read individual web pages.
2. Use **Multi-URL Batch mode** to fetch and extract multiple pages in a single request.
3. Include `Accept: application/json` header for JSON responses or `Accept: text/plain` for clean Markdown text.

---

## API Endpoints & Usage

### 1. Single URL Reading
- **GET Request**: `/<URL>`
  *Example*: `/https://example.com`
- **POST Request**: `/`
  *JSON Body*:
  ```json
  {
    "url": "https://example.com"
  }
  ```

### 2. Multi-URL Batch Reading (Batch Crawl)
- **POST Request**: `/v1/batch` or `/batch` or `/`
  *JSON Body*:
  ```json
  {
    "urls": [
      "https://example.com/page1",
      "https://example.com/page2"
    ]
  }
  ```

### 3. Response Formats
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

### 4. Optional Headers
- `X-Respond-With`: `markdown` | `html` | `text` | `frontmatter`
- `X-Preset`: `reader` | `index` | `research` | `agent` | `spider`
- `X-Target-Selector`: Extract specific CSS selector.
- `X-Remove-Selector`: Remove specific CSS selector.
- `X-No-Cache: true`: Bypass internal page cache.

---

## Tool Specification (Schema)
```json
{
  "name": "web_reader_batch",
  "description": "Fetch and convert single or multiple web pages into clean Markdown.",
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
        "description": "Single web page URL to scrape."
      }
    }
  }
}
```
