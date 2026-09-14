import os
import io
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Header, HTTPException, Query, Form, Request
from fastapi.responses import JSONResponse
from PIL import Image
import numpy as np

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

# Engine cache for different languages
_engines: Dict[str, PaddleOCR] = {}


def get_engine(lang: Optional[str] = None) -> PaddleOCR:
    target_lang = lang or DEFAULT_LANG
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

        image = Image.open(io.BytesIO(content)).convert("RGB")
        img_np = np.array(image)

        # Run PaddleOCR inference with requested or default engine
        engine = get_engine(lang)
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

        # Check table mode across query parameters, explicit arguments, and request headers
        req_mode = request.query_params.get("mode") or mode or request.headers.get("x-ocr-mode")
        req_table_only = (request.query_params.get("table_only") == "true") or table_only or (request.headers.get("x-table-only") == "true")
        is_table_mode = bool(req_table_only or (req_mode == "table"))

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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR inference failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8088"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
