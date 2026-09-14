import os
import io
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from PIL import Image
import numpy as np

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


def reconstruct_markdown(extracted_lines: List[Dict[str, Any]]) -> str:
    """
    Intelligently converts extracted bounding box lines into clean Markdown.
    Detects table structures (rows and columns) and formats them as GitHub Flavored Markdown (GFM) tables.
    Non-tabular text is formatted into coherent paragraphs.
    """
    if not extracted_lines:
        return ""

    items = []
    for line in extracted_lines:
        box = line.get("box")
        text = (line.get("text") or "").strip()
        if not text:
            continue
        if box and len(box) >= 4:
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            items.append({
                "text": text,
                "x_min": min(xs),
                "x_max": max(xs),
                "y_min": min(ys),
                "y_max": max(ys),
                "x_center": (min(xs) + max(xs)) / 2.0,
                "y_center": (min(ys) + max(ys)) / 2.0,
                "height": max(ys) - min(ys),
                "width": max(xs) - min(xs),
            })
        else:
            items.append({
                "text": text,
                "x_min": 0,
                "x_max": 100,
                "y_min": 0,
                "y_max": 20,
                "x_center": 50,
                "y_center": 10,
                "height": 20,
                "width": 100,
            })

    if not items:
        return ""

    # 1. Cluster items into horizontal rows based on vertical overlap
    items.sort(key=lambda it: it["y_center"])
    rows: List[List[Dict[str, Any]]] = []
    for it in items:
        placed = False
        for r in rows:
            r_ymin = min(x["y_min"] for x in r)
            r_ymax = max(x["y_max"] for x in r)
            r_h = max(1.0, r_ymax - r_ymin)
            overlap = max(0.0, min(r_ymax, it["y_max"]) - max(r_ymin, it["y_min"]))
            if overlap > 0.25 * min(r_h, max(1.0, it["height"])) or abs(it["y_center"] - (r_ymin + r_ymax) / 2.0) < 0.6 * max(r_h, it["height"]):
                r.append(it)
                placed = True
                break
        if not placed:
            rows.append([it])

    rows.sort(key=lambda r: min(it["y_min"] for it in r))

    def is_multi_column_row(r: List[Dict[str, Any]]) -> bool:
        if len(r) < 2:
            return False
        r_sorted = sorted(r, key=lambda x: x["x_min"])
        for i in range(len(r_sorted) - 1):
            gap = r_sorted[i+1]["x_min"] - r_sorted[i]["x_max"]
            if gap > 12:
                return True
        return False

    # 2. Partition rows into contiguous blocks: "table" vs "text"
    blocks: List[tuple[str, List[List[Dict[str, Any]]]]] = []
    curr_block: List[List[Dict[str, Any]]] = []
    curr_type = None

    for r in rows:
        is_table = is_multi_column_row(r)
        if is_table:
            if curr_type == "table":
                curr_block.append(r)
            else:
                if curr_block and curr_type:
                    blocks.append((curr_type, curr_block))
                curr_type = "table"
                curr_block = [r]
        else:
            if curr_type == "text":
                curr_block.append(r)
            else:
                if curr_block and curr_type:
                    blocks.append((curr_type, curr_block))
                curr_type = "text"
                curr_block = [r]

    if curr_block and curr_type:
        blocks.append((curr_type, curr_block))

    # 3. Format each block into Markdown
    md_outputs: List[str] = []
    for b_type, b_rows in blocks:
        if b_type == "table" and len(b_rows) >= 2:
            block_items = [it for r in b_rows for it in r]
            min_x = min(it["x_min"] for it in block_items)
            max_x = max(it["x_max"] for it in block_items)

            occupancy_len = int(max_x) + 2
            occupancy = [0] * occupancy_len
            for it in block_items:
                start_x = max(0, int(it["x_min"]))
                end_x = min(occupancy_len - 1, int(it["x_max"]))
                for x in range(start_x, end_x + 1):
                    occupancy[x] += 1

            gutters = []
            in_gap = False
            gap_start = 0
            for x in range(int(min_x), int(max_x) + 1):
                if occupancy[x] == 0:
                    if not in_gap:
                        in_gap = True
                        gap_start = x
                else:
                    if in_gap:
                        in_gap = False
                        if x - gap_start >= 6:
                            gutters.append((gap_start + x) / 2.0)

            if gutters:
                cutoffs = [-1e9] + gutters + [1e9]
                num_cols = len(cutoffs) - 1

                grid = []
                for r in b_rows:
                    cells = [[] for _ in range(num_cols)]
                    for it in r:
                        col_idx = 0
                        for i in range(num_cols):
                            if cutoffs[i] <= it["x_center"] < cutoffs[i+1]:
                                col_idx = i
                                break
                        cells[col_idx].append(it)

                    row_texts = []
                    for c in cells:
                        c.sort(key=lambda x: (x["y_min"], x["x_min"]))
                        if len(c) > 1:
                            joined_txt = " / ".join([x["text"].replace("|", "\\|") for x in c])
                        elif len(c) == 1:
                            joined_txt = c[0]["text"].replace("|", "\\|")
                        else:
                            joined_txt = ""
                        row_texts.append(joined_txt)
                    grid.append(row_texts)

                header = grid[0]
                sep = [":---" for _ in header]
                table_lines = [
                    "| " + " | ".join(header) + " |",
                    "| " + " | ".join(sep) + " |"
                ]
                for gr in grid[1:]:
                    table_lines.append("| " + " | ".join(gr) + " |")
                md_outputs.append("\n".join(table_lines))
                continue

        # Non-table rows
        for r in b_rows:
            r_sorted = sorted(r, key=lambda x: x["x_min"])
            line_text = " ".join([x["text"] for x in r_sorted])
            md_outputs.append(line_text)

    return "\n\n".join(md_outputs)


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
        markdown = reconstruct_markdown(extracted_lines)

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
