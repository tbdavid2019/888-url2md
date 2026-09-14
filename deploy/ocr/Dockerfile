FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    OMP_NUM_THREADS=4 \
    OCR_LANG=chinese_cht

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxrender1 \
    libxext6 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download models during docker build to speed up container startup
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='chinese_cht', show_log=False)"

COPY main.py .

EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD curl -f http://localhost:8088/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8088", "--workers", "1"]
