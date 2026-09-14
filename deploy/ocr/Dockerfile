FROM paddlepaddle/paddle:2.6.2

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    OMP_NUM_THREADS=4 \
    OCR_LANG=ch

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir --no-deps paddleocr==2.8.1

COPY main.py ocr_markdown.py ./

# Pre-download PP-OCRv4 Chinese/English and Traditional Chinese models
RUN python -c "import main; main.get_engine('ch'); main.get_engine('chinese_cht')"

EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD curl -f http://localhost:8088/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8088", "--workers", "1"]
