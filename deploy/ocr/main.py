import os
import io
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from PIL import Image
import numpy as np

# PaddleOCR is imported
from paddleocr import PaddleOCR

OCR_SECRET_KEY = os.getenv("OCR_SECRET_KEY", "").strip()
DEFAULT_LANG = os.getenv("OCR_LANG", "chinese_cht")  # Traditional Chinese by default

app = FastAPI(
    title="PaddleOCR Microservice for 888-url2md",
    description="High-performance OCR engine with Traditional Chinese (chinese_cht) & PP-Structure support.",
    version="1.0.0"
)

# Initialize PaddleOCR engine
# Note: ch_PP-OCRv4 supports Traditional & Simplified Chinese.
print(f"[*] Initializing PaddleOCR with lang={DEFAULT_LANG}...")
ocr_engine = PaddleOCR(use_angle_cls=True, lang=DEFAULT_LANG, show_log=False)
print("[+] PaddleOCR initialized successfully.")


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
    file: UploadFile = File(...),
    lang: Optional[str] = Query(None),
    use_angle_cls: Optional[bool] = Query(True),
    x_api_key: Optional[str] = Header(None)
):
    """
    Perform OCR on an uploaded image file and return extracted text and Markdown.
    """
    verify_secret(x_api_key)

    t0 = time.time()
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        image = Image.open(io.BytesIO(content)).convert("RGB")
        img_np = np.array(image)

        # Run PaddleOCR inference
        result = ocr_engine.ocr(img_np, cls=use_angle_cls)

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

        # Convert to readable Markdown paragraphs
        markdown_blocks = []
        for line in extracted_lines:
            markdown_blocks.append(line["text"])

        markdown = "\n\n".join(markdown_blocks) if markdown_blocks else ""

        duration_ms = int((time.time() - t0) * 1000)

        return {
            "text": raw_text,
            "markdown": markdown,
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
