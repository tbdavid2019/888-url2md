# PaddleOCR 微服務架構與新主機部署指南

本目錄包含專為 `888-url2md` 設計的高性能 PaddleOCR 微服務。內建 **PP-OCRv4 旗艦中英文雙向模型**、**二維空間幾何表格重建演算法** 與 **CPU AVX 硬體相容性自動修補**。

---

### 一、 核心設定與演算法存放位置

所有微服務的改版與演算法已全部標準化收斂在本目錄中，受 Git 完整版本控管：

| 組件 / 演算法 | 存放檔案 | 說明 |
|---|---|---|
| **二維幾何表格重構演算法** | [`main.py`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/deploy/ocr/main.py) 之 `reconstruct_markdown()` | 基於 Bounding-Box 垂直重疊率分行，並以 1D X 軸橫向空隙（Gutters）偵測欄位邊界，自動將多欄多列轉換為 GitHub Flavored Markdown (GFM) 表格。 |
| **旗艦推論模型** | [`main.py`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/deploy/ocr/main.py) 之 `get_engine('ch')` | 預設採用官方旗艦 `ch`（PP-OCRv4 繁簡中文、英文、數字全字典），並支援隨選快取 `chinese_cht`。 |
| **CPU 相容性補丁 (AVX 崩潰防護)** | [`main.py`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/deploy/ocr/main.py) 頂部猴子補丁 | 自動移除未支援 CPU 指令集之 `self_attention_fuse_pass`，徹底防止 KVM / 虛擬化雲主機觸發 `SIGILL (Illegal instruction)` 崩潰。 |
| **模型預載入快取** | [`Dockerfile`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/deploy/ocr/Dockerfile) | Docker build 時自動執行預載指令，模型直接固化在映像檔 `/root/.paddleocr/` 中，開箱即用免即時下載。 |
| **自動打包與發布** | [`.github/workflows/ocr-image.yml`](file:///Users/david/Documents/git/tbdavid2019/888-url2md/.github/workflows/ocr-image.yml) | 每次修改 `deploy/ocr/` 自動編譯發布至 `ghcr.io/tbdavid2019/888-ocr:latest`。 |

---

### 二、 下次若有一台全新主機，如何快速部署？

新主機硬體建議：至少 4 核心 CPU、4 GiB 以上可用記憶體。

#### 方式 A：極速部署（直接使用 GitHub Container Registry 預建映像檔，推薦）

在新主機上只需建立一個目錄與 `docker-compose.yml`：

```bash
# 1. 建立服務目錄
mkdir -p /home/ubuntu/paddleocr-service && cd /home/ubuntu/paddleocr-service

# 2. 下載官方 Compose 設定檔
curl -sO https://raw.githubusercontent.com/tbdavid2019/888-url2md/main/deploy/ocr/docker-compose.yml

# 3. 啟動微服務容器（自動拉取包含 PP-OCRv4 與表格演算法之最新映像檔）
docker compose up -d

# 4. 驗證健康狀態
curl http://localhost:8089/health
# 預期輸出：{"status":"ok","service":"paddleocr","lang":"ch",...}
```

#### 方式 B：從原始碼本地構建部署

若新主機需要微調 Python 代碼或離線環境：

```bash
# 1. 複製專案倉庫
git clone https://github.com/tbdavid2019/888-url2md.git
cd 888-url2md/deploy/ocr

# 2. 本地構建映像檔並啟動
docker compose up -d --build

# 3. 驗證服務
curl http://localhost:8089/health
```

---

### 三、 將新主機納入 `888-url2md` 叢集負載與容錯池

部署完成後，只需在任何運行 `888-url2md` 主應用伺服器的 `.env` 或 `docker-compose.yml` 中登記新主機的網址：

```bash
# 支援多個節點以逗號分隔（自動依序負載與故障轉移）
OCR_SERVICE_URLS=https://ocr.aiurl.tw,https://new-node.yourdomain.com:8089
OCR_TIMEOUT_MS=10000
OCR_HEALTH_TIMEOUT_MS=2000
OCR_POLL_INTERVAL_MS=30000
```

- **自動健康檢查**：`888-url2md` 會以 30 秒 Jitter 背景探測新節點健康度。
- **自動點亮介面**：探測成功後前端會自動點亮「圖片辨識 (OCR)」功能頁籤。
- **平滑故障切換**：當節點異常時自動觸發 30 秒 Cooldown 並無縫轉發至備援節點。

---

### 四、 自動更新機制

容器預設標記 `com.centurylinklabs.watchtower.enable=true`：
- 若主機配置 Watchtower，將在 GitHub Actions 完成打包發布後自動拉取最新版本並零停機重啟。
- 亦可在服務目錄下手動執行 `./update.sh` 即時升級。

