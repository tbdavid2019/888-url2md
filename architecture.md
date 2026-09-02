# 888 URL2MD Architecture

## Overview

**888 URL2MD** converts web pages, documents, and web-search results into clean Markdown. It provides both a browser interface for people and HTTP endpoints for LLMs, agents, and applications.

The same conversion pipeline serves both entry points:

```text
Browser user ─┐
              ├─ HTTPS / Nginx ─ HTTP/1.1 :8083→:8081 ─ 888-url2md container
LLM / API ────┘                                      │
                                                     ├─ URL / document fetch and render
                                                     ├─ Markdown formatting
                                                     └─ Search providers
```

## Entry Points

### Human Web Interface

`GET /` returns the **888 URL2MD** browser interface when the request accepts HTML. It provides:

- URL-to-Markdown conversion for one or more URLs.
- Automatic `https://` completion for bare domains such as `david888.com`.
- Web search using the existing `/search?q=...` endpoint.
- Markdown preview, clipboard copy, and `.md` download.
- Automatic Traditional Chinese / English selection from the browser language, with a persistent manual language switch.

### LLM and API Interface

Non-browser requests to `GET /` retain the machine-facing behaviour and return the generated Skill document. LLM-specific documentation remains available from `GET /skill.md` and `GET /SKILL.md`; discovery documents are available from `/llms.txt` and `/llms-full.txt`.

The main data endpoints are:

- `GET /<URL>` — convert one URL to Markdown.
- `POST /v1/batch` or `POST /batch` — convert one or more URLs concurrently.
- `GET /search?q=<query>` or `GET /s/<query>` — return web search results as Markdown.

## Conversion Pipeline

888 URL2MD is a multi-threaded Node.js 24 application.

1. It validates and normalizes the requested URL. Batch requests automatically add `https://` to bare domains.
2. It fetches and renders content using the appropriate engine:
   - **Auto** combines lightweight HTTP fetching and browser rendering.
   - **Browser** uses headless Chrome through Puppeteer for JavaScript-heavy pages.
   - **CURL** uses `curl-impersonate` when browser rendering is unnecessary.
   - **CF Browser Rendering** is an optional fallback.
3. It extracts the useful document content:
   - HTML uses Readability plus rule-based Markdown conversion.
   - PDF uses PDF.js.
   - Office documents use LibreOffice before entering the PDF/HTML path.
4. It returns Markdown, JSON, or server-sent events according to the request's `Accept` header.

Search uses the built-in SERP integrations and fallbacks, so the browser UI does not need a separate search service.

## Production Deployment: create360.ai

- The active production deployment is self-hosted on `gitlab.aicreate360.com` (`34.80.178.194`).
- **Domain:** `https://create360.ai`
- **Reverse proxy:** Nginx (GitLab Omnibus custom virtual host) terminates TLS with Let's Encrypt and proxies all traffic to `127.0.0.1:8085`.
- **Container:** `888-url2md` runs the Node application. Its HTTP/1.1 compatibility listener is container port `8082`; the application h2c listener is port `8081`.
- **Runtime:** Node 24, Google Chrome, LibreOffice, and required fonts are packaged by the project Dockerfile.
- **Container hardening:** `seccomp=unconfined` is required for the headless-browser runtime.
- **CI/CD Auto Update:** Watchtower monitors `ghcr.io/tbdavid2019/888-url2md:latest` and auto-updates on new image pushes.

### Docker Compose

`docker-compose.yml` is the canonical deployment definition:

```bash
PUBLIC_DOMAIN=https://create360.ai docker compose up -d --build
```

By default it builds and starts `888-url2md:latest`, exposing host port `8083` to container port `8081`. Override the host port with `HOST_PORT`; override the internal h2c port with `APP_PORT`.

MinIO is retained only for local development and is not part of the default production startup. Start it explicitly when needed:

```bash
docker compose --profile dev up -d
```

## CI/CD

GitHub Actions tests the project and builds multi-architecture container images for GHCR and, when configured, Docker Hub. The workflows and their JavaScript actions use the Node 24 runtime. Production can be updated directly from the host with `git pull` followed by Docker Compose build/up; it does not depend on a GitHub Actions deployment job.

## Operational Notes

- Headless Chrome and LibreOffice are resource-intensive. Size the host for concurrent browser and document-conversion work.
- The open-source deployment is stateless by default. Object storage, database indexing, billing, and SaaS rate limiting are optional integrations, not required for `create360.ai`.
- Request validation, robots handling, concurrency limits, and content-size/depth fallbacks protect the conversion pipeline from unsafe or excessively expensive requests.
