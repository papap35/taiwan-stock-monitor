# 台股終端機 PRO

專業台股看盤系統，提供即時報價、AI 個股分析、價格警報通知，採用深色終端機介面設計。

## 功能特色

- **即時大盤** — TAIEX 走勢圖、市場廣度分析、類股表現、重點個股卡片
- **熱門股票** — 可依成交量、漲跌幅排序，支援欄位點擊排序
- **跑馬燈報價** — 頂部滾動顯示自選股與熱門股即時價格
- **自選股管理** — 追蹤持有成本，自動計算損益百分比
- **價格警報** — 停損/買入/賣出/突破/跌破五種警報類型，觸發即時推播
- **AI 個股分析** — 串接 Claude API，支援全面分析/買入時機/賣出時機/風險/技術五種模式
- **AI 大盤解讀** — 結合 TAIEX 與廣度資料，產生每日市場報告

## 架構說明

```
前端 (React/Vite) ──▶ Vercel          免費部署
後端 (Node.js/Express) ──▶ Railway    免費 $5/月 額度
資料庫 ──▶ Supabase PostgreSQL        免費 500MB（選配）
台股資料 ──▶ TWSE Open API             完全免費
AI 分析 ──▶ Anthropic Claude API      按 token 計費
```

## 快速開始（本地開發）

### 1. 複製專案

```bash
git clone <your-repo>
cd taiwan-stock-monitor
```

### 2. 後端設定

```bash
cd backend
cp .env.example .env
# 編輯 .env，填入 ANTHROPIC_API_KEY
yarn install
yarn dev
```

### 3. 前端設定

```bash
cd frontend
cp .env.example .env
# 開發環境不需要修改 .env（使用 Vite proxy）
yarn install
yarn dev
```

開啟 http://localhost:5173 即可看到系統。

### 使用 Docker Compose（整合測試）

```bash
# 在根目錄建立 .env
echo "ANTHROPIC_API_KEY=your_key_here" > .env

docker-compose up --build
```

---

## 部署到雲端（免費方案）

### 步驟一：部署後端到 Railway

1. 前往 https://railway.app 並登入（支援 GitHub OAuth）

2. 點擊 **New Project** → **Deploy from GitHub Repo**

3. 選擇你的 repository，**Root Directory** 設為 `backend`

4. 在 **Variables** 分頁新增環境變數：
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxx
   CORS_ORIGIN=https://your-app.vercel.app
   NODE_ENV=production
   ```

5. Railway 會自動偵測 Dockerfile 並建置部署

6. 部署完成後，取得後端 URL，格式為：
   `https://taiwan-stock-backend-xxxx.up.railway.app`

### 步驟二：部署前端到 Vercel

1. 前往 https://vercel.com 並登入

2. 點擊 **Add New Project** → 匯入 GitHub repository

3. **Framework Preset** 選 `Vite`，**Root Directory** 設為 `frontend`

4. 在 **Environment Variables** 填入：
   ```
   VITE_API_URL=https://taiwan-stock-backend-xxxx.up.railway.app
   VITE_WS_URL=wss://taiwan-stock-backend-xxxx.up.railway.app
   ```

5. 點擊 **Deploy**，幾分鐘後完成

6. 取得前端 URL，格式為：`https://your-app.vercel.app`

7. 回到 Railway，更新 `CORS_ORIGIN` 為 Vercel 的實際網址

### 步驟三（選配）：設定 Supabase 資料庫

如果需要跨裝置同步自選股和警報：

1. 前往 https://supabase.com 建立免費專案

2. 在 SQL Editor 執行：
   ```sql
   CREATE TABLE watchlist (
     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id text NOT NULL,
     code text NOT NULL,
     name text,
     cost numeric,
     created_at timestamptz DEFAULT now()
   );

   CREATE TABLE alerts (
     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id text NOT NULL,
     code text NOT NULL,
     name text,
     type text NOT NULL,
     target_price numeric NOT NULL,
     note text,
     triggered boolean DEFAULT false,
     created_at timestamptz DEFAULT now()
   );
   ```

3. 在 Railway 新增環境變數：
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=your_service_key
   ```

---

## API 文件

### REST API

| Method | Path | 說明 |
|--------|------|------|
| GET | /api/market/taiex | 加權指數即時資料 |
| GET | /api/market/hot | 熱門個股（?filter=vol/top/bottom/limit） |
| GET | /api/market/breadth | 漲跌家數 |
| GET | /api/stocks/:codes | 指定股票報價（逗號分隔） |
| GET | /api/alerts | 取得所有警報 |
| POST | /api/alerts | 新增警報 |
| DELETE | /api/alerts/:id | 刪除警報 |
| POST | /api/ai/analyze | AI 個股分析（SSE streaming） |
| POST | /api/ai/market | AI 大盤解讀（SSE streaming） |
| GET | /health | 健康檢查 |

### WebSocket 訊息格式

連線：`ws://your-backend/ws`

**Server → Client：**
```json
{ "type": "taiex",    "payload": { "value": 22450, "changePercent": 0.52 } }
{ "type": "quotes",   "payload": { "2330": { "price": 985, "changePercent": 1.2 } } }
{ "type": "alerts_triggered", "payload": [{ "alert": {...}, "quote": {...} }] }
```

**Client → Server：**
```json
{ "type": "subscribe", "codes": ["2330", "2317"] }
{ "type": "ping" }
```

---

## 資料來源說明

- **台灣證交所（TWSE）Open API**：`openapi.twse.com.tw`，免費無限制
- **盤中即時報價**：`mis.twse.com.tw`，僅交易時段（週一至週五 09:00–13:30）可用
- **盤後資料**：退回使用每日收盤資料

---

## 費用估算

| 服務 | 免費額度 | 超出費用 |
|------|---------|---------|
| Vercel | 無限靜態部署 | - |
| Railway | $5/月 免費額度 | ~$0.000463/vCPU·秒 |
| Supabase | 500MB DB, 50K MAU | $25/月起 |
| TWSE API | 完全免費 | - |
| Anthropic API | 無免費額度 | ~$0.003/1K tokens |

預估月費：**$0–$5 美元**（不含 Claude API token 費用）

---

## 開發注意事項

- TWSE API 在盤中（09:00–13:30）提供即時資料，盤後自動切換至收盤資料
- 建議在 Railway 設定 `RAILWAY_HEALTHCHECK_TIMEOUT_SEC=10` 避免冷啟動逾時
- Vercel 免費方案的 Serverless Function 有 10 秒逾時限制，WebSocket 必須走後端
- Claude API 的 streaming 端點需要後端代理，不可直接從前端呼叫（保護 API Key）
