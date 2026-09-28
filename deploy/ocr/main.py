import os
import io
import time
import threading
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Header, HTTPException, Query, Form, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from PIL import Image
import numpy as np

try:
    import pymupdf
except ImportError:
    try:
        import fitz as pymupdf
    except ImportError:
        pymupdf = None

from ocr_markdown import reconstruct_markdown

# Apply hardware pass patch for CPU compatibility (prevents SIGILL Illegal instruction on CPUs without AVX512)
try:
    from paddle import inference
    _orig_config_init = inference.Config.__init__
    def _safe_config_init(self, *args, **kwargs):
        _orig_config_init(self, *args, **kwargs)
        try:
            self.delete_pass("self_attention_fuse_pass")
        except Exception:
            pass
    inference.Config.__init__ = _safe_config_init
except Exception as e:
    print(f"[!] Warning: Unable to patch inference.Config: {e}")

# PaddleOCR is imported
from paddleocr import PaddleOCR

OCR_SECRET_KEY = os.getenv("OCR_SECRET_KEY", "").strip()
DEFAULT_LANG = os.getenv("OCR_LANG", "ch")  # PP-OCRv4 (Chinese + English + Numbers) by default

app = FastAPI(
    title="PaddleOCR Microservice for 888-url2md",
    description="High-performance OCR engine with PP-OCRv4 Chinese & English and PP-Structure support.",
    version="1.1.0"
)

# Engine cache and thread safety locks for different languages
_engines: Dict[str, PaddleOCR] = {}
_engine_locks: Dict[str, threading.Lock] = {}
_engine_init_lock = threading.Lock()


def get_engine_lock(lang: str) -> threading.Lock:
    with _engine_init_lock:
        if lang not in _engine_locks:
            _engine_locks[lang] = threading.Lock()
        return _engine_locks[lang]


def get_engine(lang: Optional[str] = None) -> PaddleOCR:
    target_lang = lang or DEFAULT_LANG
    with get_engine_lock(target_lang):
        if target_lang not in _engines:
            print(f"[*] Initializing PaddleOCR engine for lang={target_lang}...")
            try:
                _engines[target_lang] = PaddleOCR(use_angle_cls=True, lang=target_lang, show_log=False)
            except Exception:
                _engines[target_lang] = PaddleOCR(lang=target_lang, show_log=False)
            print(f"[+] PaddleOCR engine ({target_lang}) ready.")
        return _engines[target_lang]


# Pre-load default engine
print(f"[*] Pre-loading default OCR engine (lang={DEFAULT_LANG})...")
get_engine(DEFAULT_LANG)
print("[+] Default OCR engine pre-loaded successfully.")


def verify_secret(x_api_key: Optional[str] = Header(None)):
    if OCR_SECRET_KEY and x_api_key != OCR_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")


@app.get("/health")
async def health_check():
    """
    Ultra-lightweight health probe endpoint.
    Performs zero inference to keep latency sub-10ms and prevent thundering herd impact.
    """
    return {
        "status": "ok",
        "service": "paddleocr",
        "lang": DEFAULT_LANG,
        "timestamp": int(time.time())
    }


@app.post("/ocr")
async def perform_ocr(
    request: Request,
    file: UploadFile = File(...),
    lang: Optional[str] = Query(None),
    use_angle_cls: Optional[bool] = Query(True),
    table_only: Optional[bool] = Query(False),
    extract_tables: Optional[bool] = Query(True),
    mode: Optional[str] = Query(None),
    x_api_key: Optional[str] = Header(None)
):
    """
    Perform OCR on an uploaded image file and return extracted text, Markdown, and isolated tables.
    """
    verify_secret(x_api_key)

    t0 = time.time()
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        filename = file.filename or "file.png"
        is_pdf = content.startswith(b"%PDF-") or filename.lower().endswith(".pdf")

        # Check table mode across query parameters, explicit arguments, and request headers
        req_mode = request.query_params.get("mode") or mode or request.headers.get("x-ocr-mode")
        req_table_only = (request.query_params.get("table_only") == "true") or table_only or (request.headers.get("x-table-only") == "true")
        is_table_mode = bool(req_table_only or (req_mode == "table"))

        def _sync_ocr() -> Dict[str, Any]:
            target_lang = lang or DEFAULT_LANG
            engine = get_engine(target_lang)
            engine_lock = get_engine_lock(target_lang)

            if is_pdf:
                if pymupdf is None:
                    raise HTTPException(
                        status_code=400,
                        detail="PDF processing requires 'pymupdf' in the OCR microservice. Please install pymupdf or route via 888-url2md."
                    )
                doc = pymupdf.open(stream=content, filetype="pdf")
                total_pages = len(doc)
                max_pages = min(total_pages, 20)

                all_extracted_lines: List[Dict[str, Any]] = []
                page_markdowns: List[str] = []
                all_tables: List[str] = []
                page_table_markdowns: List[str] = []
                all_raw_texts: List[str] = []

                for pno in range(max_pages):
                    page = doc[pno]
                    pix = page.get_pixmap(dpi=150)
                    page_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    page_np = np.array(page_img)

                    with engine_lock:
                        result = engine.ocr(page_np, cls=use_angle_cls)
                    page_lines: List[Dict[str, Any]] = []
                    if result and len(result) > 0 and result[0]:
                        for line in result[0]:
                            box = line[0]
                            text = line[1][0].strip() if line[1] and len(line[1]) > 0 else ""
                            score = float(line[1][1]) if line[1] and len(line[1]) > 1 else 1.0
                            if text:
                                page_lines.append({
                                    "text": text,
                                    "confidence": round(score, 4),
                                    "box": [[int(coord[0]), int(coord[1])] for coord in box] if box else None,
                                    "page": pno + 1
                                })

                    all_extracted_lines.extend(page_lines)
                    page_text = "\n".join([l["text"] for l in page_lines])
                    if page_text:
                        all_raw_texts.append(page_text)

                    md, tables = reconstruct_markdown(page_lines, table_only=is_table_mode)
                    if tables:
                        all_tables.extend(tables)
                        page_table_markdowns.append(f"<!-- Table (Page {pno + 1}) -->\n" + "\n\n".join(tables))
                    if md and md.strip():
                        page_markdowns.append(f"<!-- Page {pno + 1} -->\n{md.strip()}")

                doc.close()

                combined_table_md = "\n\n".join(page_table_markdowns) if page_table_markdowns else None
                combined_markdown = combined_table_md if is_table_mode else ("\n\n---\n\n".join(page_markdowns) if page_markdowns else (combined_table_md or ""))
                combined_text = "\n\n".join(all_raw_texts)
                duration_ms = int((time.time() - t0) * 1000)

                return {
                    "text": combined_text,
                    "markdown": combined_markdown or "",
                    "tableMarkdown": combined_table_md,
                    "tables": all_tables,
                    "lines": all_extracted_lines,
                    "durationMs": duration_ms
                }

            # Standard Single Image OCR
            image = Image.open(io.BytesIO(content)).convert("RGB")
            img_np = np.array(image)

            with engine_lock:
                result = engine.ocr(img_np, cls=use_angle_cls)

            extracted_lines: List[Dict[str, Any]] = []
            if result and len(result) > 0 and result[0]:
                for line in result[0]:
                    box = line[0]  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
                    text = line[1][0].strip() if line[1] and len(line[1]) > 0 else ""
                    score = float(line[1][1]) if line[1] and len(line[1]) > 1 else 1.0
                    if text:
                        extracted_lines.append({
                            "text": text,
                            "confidence": round(score, 4),
                            "box": [[int(coord[0]), int(coord[1])] for coord in box] if box else None
                        })

            raw_text = "\n".join([line["text"] for line in extracted_lines])
            markdown, tables = reconstruct_markdown(extracted_lines, table_only=is_table_mode)
            table_markdown = "\n\n".join(tables) if tables else None
            duration_ms = int((time.time() - t0) * 1000)

            return {
                "text": raw_text,
                "markdown": markdown,
                "tableMarkdown": table_markdown,
                "tables": tables,
                "lines": extracted_lines,
                "durationMs": duration_ms
            }

        return await run_in_threadpool(_sync_ocr)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR inference failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8088"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
