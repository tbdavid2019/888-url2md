#!/usr/bin/env bash
# ==============================================================================
# PaddleOCR Microservice Auto-Updater
# Continuous Upstream Tracking & Rolling Recreate for Host 10.9.0.9
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Checking and updating PaddleOCR microservice..."

# 1. Attempt to pull prebuilt GHCR image if available
if docker compose pull paddleocr 2>/dev/null; then
    echo "[+] Pulled latest image from GHCR."
else
    echo "[*] GHCR pull skipped or image not published yet; building locally..."
    docker compose build --no-cache
fi

# 2. Restart container gracefully
docker compose up -d --remove-orphans

# 3. Wait and verify healthcheck
echo "[*] Verifying service health..."
for i in {1..30}; do
    if curl -sf http://127.0.0.1:8089/health > /dev/null; then
        echo "[+] PaddleOCR microservice is healthy at http://127.0.0.1:8089"
        exit 0
    fi
    sleep 2
done

echo "[-] ERROR: Healthcheck timed out after 60 seconds."
exit 1
