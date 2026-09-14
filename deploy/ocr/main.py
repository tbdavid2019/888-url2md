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

    # 1. Cluster items into spatial blocks (Connected Components) to separate
    # tables from external editor chrome, sidebars, titles, and toolbars.
    n = len(items)
    adj: Dict[int, List[int]] = {i: [] for i in range(n)}
    for i in range(n):
        for j in range(i + 1, n):
            dx = max(0.0, max(items[i]["x_min"], items[j]["x_min"]) - min(items[i]["x_max"], items[j]["x_max"]))
            dy = max(0.0, max(items[i]["y_min"], items[j]["y_min"]) - min(items[i]["y_max"], items[j]["y_max"]))
            # Proximity threshold: within 160px horizontal, 80px vertical
            if dx <= 160 and dy <= 80:
                adj[i].append(j)
                adj[j].append(i)

    visited = set()
    components: List[List[Dict[str, Any]]] = []
    for i in range(n):
        if i not in visited:
            comp: List[Dict[str, Any]] = []
            queue = [i]
            visited.add(i)
            while queue:
                curr = queue.pop(0)
                comp.append(items[curr])
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(comp)

    # Sort components top-to-bottom, left-to-right
    components.sort(key=lambda c: (min(it["y_min"] for it in c), min(it["x_min"] for it in c)))

    md_blocks: List[str] = []

    for comp in components:
        # Group items within component into horizontal rows
        rows: List[List[Dict[str, Any]]] = []
        for it in sorted(comp, key=lambda x: (x["y_min"], x["x_min"])):
            placed = False
            for r in rows:
                r_ymin = min(x["y_min"] for x in r)
                r_ymax = max(x["y_max"] for x in r)
                r_h = max(1.0, r_ymax - r_ymin)
                overlap = max(0.0, min(r_ymax, it["y_max"]) - max(r_ymin, it["y_min"]))
                if overlap > 0.3 * min(r_h, it["height"]):
                    r.append(it)
                    placed = True
                    break
            if not placed:
                rows.append([it])

        rows.sort(key=lambda r: min(it["y_min"] for it in r))

        # Check for multi-column table rows
        def is_multi_col(r: List[Dict[str, Any]]) -> bool:
            if len(r) < 2:
                return False
            rs = sorted(r, key=lambda x: x["x_min"])
            for i in range(len(rs) - 1):
                if rs[i + 1]["x_min"] - rs[i]["x_max"] > 12:
                    return True
            return False

        multi_indices = [idx for idx, r in enumerate(rows) if is_multi_col(r)]
        table_rows: List[List[Dict[str, Any]]] = []
        lead_rows: List[List[Dict[str, Any]]] = []
        trail_rows: List[List[Dict[str, Any]]] = []
        is_table = False

        if len(multi_indices) >= 2:
            start_idx = multi_indices[0]
            end_idx = multi_indices[-1] + 1
            lead_rows = rows[:start_idx]
            table_rows = rows[start_idx:end_idx]
            trail_rows = rows[end_idx:]
            is_table = True
        else:
            lead_rows = rows

        for lr in lead_rows:
            txt = " ".join(x["text"] for x in sorted(lr, key=lambda x: x["x_min"]))
            if txt:
                md_blocks.append(txt)

        if is_table and len(table_rows) >= 2:
            t_items = [it for r in table_rows for it in r]
            min_x = min(it["x_min"] for it in t_items)
            max_x = max(it["x_max"] for it in t_items)
            occupancy = [0] * (int(max_x) + 2)
            for it in t_items:
                for x in range(int(it["x_min"]), int(it["x_max"]) + 1):
                    occupancy[x] += 1

            gutters: List[float] = []
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
                        if x - gap_start >= 8:
                            gutters.append((gap_start + x) / 2.0)

            if gutters:
                cutoffs = [-1e9] + gutters + [1e9]
                ncols = len(cutoffs) - 1
                grid: List[List[str]] = []
                for r in table_rows:
                    cells: List[List[Dict[str, Any]]] = [[] for _ in range(ncols)]
                    for it in r:
                        for i in range(ncols):
                            if cutoffs[i] <= it["x_center"] < cutoffs[i + 1]:
                                cells[i].append(it)
                                break
                    row_txts: List[str] = []
                    for c in cells:
                        c.sort(key=lambda x: (x["y_min"], x["x_min"]))
                        # Clean cell text join without redundant separators
                        clean_cell = " ".join(x["text"].replace("|", "\\|") for x in c)
                        row_txts.append(clean_cell)
                    grid.append(row_txts)

                hdr = grid[0]
                sep = [":---" for _ in hdr]
                t_lines = ["| " + " | ".join(hdr) + " |", "| " + " | ".join(sep) + " |"]
                for gr in grid[1:]:
                    t_lines.append("| " + " | ".join(gr) + " |")
                md_blocks.append("\n".join(t_lines))
            else:
                for r in table_rows:
                    md_blocks.append(" ".join(x["text"] for x in sorted(r, key=lambda x: x["x_min"])))

        for tr in trail_rows:
            txt = " ".join(x["text"] for x in sorted(tr, key=lambda x: x["x_min"]))
            if txt:
                md_blocks.append(txt)

    return "\n\n".join(md_blocks)


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
