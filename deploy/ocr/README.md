# PaddleOCR 微服務部署說明 (Host 1: 10.9.0.9)

本目錄包含專為 `888-url2md` 設計的 PaddleOCR 高性能微服務。預設載入繁體中文（`chinese_cht`）模型與方向角校正。

---

### 一、 部署於 `10.9.0.9` 伺服器

將此目錄複製至主機 `david@10.9.0.9` 並啟動：

```bash
# 1. 複製目錄至 10.9.0.9
scp -r deploy/ocr david@10.9.0.9:/home/david/paddleocr-service

# 2. 登入主機並啟動容器
ssh david@10.9.0.9
cd /home/david/paddleocr-service
docker compose up -d --build

# 3. 驗證服務運行狀態
curl http://localhost:8089/health
# 預期回傳：{"status":"ok","service":"paddleocr","lang":"chinese_cht",...}
```

---

### 二、 外部網路與 Cloudflare 橘雲配置

1. **防火牆 / NAT 映射**：
   - 將外網 IP `60.248.142.126` 的 TCP `8088`（或透過 Nginx 反向代理至 `80/443`）對應至內網 `10.9.0.9:8089`。
2. **Cloudflare DNS**：
   - 設定 A 記錄 `ocr.aiurl.tw` 指向 `60.248.142.126`，開啟橘雲（Proxied）。
3. **驗證公開端點**：
   ```bash
   curl -I https://ocr.aiurl.tw/health
   # 預期回傳 HTTP 200 OK
   ```

---

### 三、 `888-url2md` 端點設定

在三台 `888-url2md`（`10.9.0.9`, `create360.ai`, `2md.glsoft.ai`）的容器環境變數中加入：

```bash
OCR_SERVICE_URLS=https://ocr.aiurl.tw,https://ocr2.aiurl.tw
OCR_TIMEOUT_MS=10000
OCR_HEALTH_TIMEOUT_MS=2000
OCR_POLL_INTERVAL_MS=30000
```

`888-url2md` 將自動以 Single-Flight 與 Jitter 探測集群存活狀態；當檢測到在線時，前端自動點亮第 4 個 Tab「圖片辨識 (OCR)」，多節點間自動支援故障轉移（Failover）。
