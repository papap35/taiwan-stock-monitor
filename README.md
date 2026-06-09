# TaiFin — 台股資訊站

> 數據驅動，掌握台股脈動

台灣股市個人投資輔助平台，提供即時看盤、深度技術分析、籌碼追蹤、交易日誌與 AI 簡報，採用深色儀表板介面設計。

📖 **[查看完整使用手冊](./USER_MANUAL.md)**

---

## 功能特色

### 📊 大盤儀表板
- TAIEX 即時指數、漲跌幅、成交量（億元）
- 漲跌家數廣度分析（即時/昨收自動切換）
- 國際主要市場指數（美股、日股、港股）

### 📋 自選股與持股管理
- 多群組管理（我的持股 / 觀察中 / 候選清單 / 空頭觀察 / 自訂群組）
- 多筆 Lot 買入記錄，加權均成自動計算
- 整張 + 零股分開記錄
- 目標價 / 停損價設定，進度視覺化

### 📈 技術分析（K 線圖）
- 日K / 週K / 月K 切換（前端聚合，無額外 API）
- 均線：MA5 / MA10 / MA20 / MA60 / MA120 / MA240，各自獨立開關
- 布林通道（BB），帶寬顯示
- 成交量均線（MA5 / MA20）+ 放量/縮量高亮
- 副圖指標：KD / RSI / MACD

### 🔍 籌碼分析
- 三大法人（外資/投信/自營商）近期買賣超趨勢
- 融資融券餘額走勢
- 籌碼評分系統（0-100，6 項加權評分）

### 📊 市場總覽
- 熱門股排行（成交量 / 漲幅 / 跌幅 / 漲停）
- 外資台指期淨部位（多/空/淨/當日變化）
- 全市場融資融券近 20 日趨勢圖

### 🛡 交易風控工具
- 移動停損追蹤（Trailing Stop），從持股高點自動計算
- 風險報酬計算器（R/R Ratio），進場前評估
- 部位規模計算器（Position Sizing），依資金和風險比例建議張數

### 📅 交易日誌
- 出場記錄（出場價 / 日期 / 理由 / 學習筆記）
- 已出場 Lot 顯示年化報酬率
- 績效統計儀表板（勝率 / 獲利因子 / 期望值 / 連勝連敗 / 資金曲線 / 月度損益 / 個股勝率 / 策略勝率）

### 🔔 價格警報
- 個股突破 / 跌破指定價位通知

### 🤖 AI 功能（需 Claude API Key）
- 開盤前建議 / 盤中更新 / 收盤覆盤三種 AI 簡報
- 個股技術面 + 籌碼面分析
- **K 線型態辨識**：近 60 根 K 棒送 AI，辨識頭肩、W/M 底頂、旗形、三角收斂等型態，給出壓力支撐與操作建議
- **AI 覆盤助手**：已出場交易送 AI 分析進出場時機、找出操作偏誤、給出系統性改進方向

### 📲 LINE Notify 警報推播
- 警報觸發時即時推播 LINE 訊息（停損 / 買入 / 賣出 / 漲跌停）
- 系統設定頁輸入個人 token 即可啟用，無需帳號系統
- 支援測試訊息發送確認連線正常

### 🔎 條件選股掃描器
- 13 個篩選條件（技術面 / 籌碼面 / 基本面 / 量能），AND 邏輯組合
- 一次輸入多支代號，批次掃描，即時顯示進度條
- 結果表格顯示每支股票各條件通過狀態與指標數值
- 一鍵加入自選股；快速預設（全選技術面 / 籌碼乾淨 / 價值股）

---

## 架構說明

```
前端 (React/Vite) ──▶ Vercel          免費部署
後端 (Node.js/Express) ──▶ Railway    免費 $5/月 額度
台股資料 ──▶ TWSE / TAIFEX Open API   完全免費
AI 分析 ──▶ Anthropic Claude API      按 token 計費（選配）
```

---

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
# 編輯 .env，填入 ANTHROPIC_API_KEY（選配，不填 AI 功能不可用）
npm install
npm run dev
```

### 3. 前端設定

```bash
cd frontend
npm install
npm run dev
```

開啟 http://localhost:5173 即可看到系統。

### 使用 Docker Compose

```bash
echo "ANTHROPIC_API_KEY=your_key_here" > .env
docker-compose up --build
```

---

## 部署到雲端（免費方案）

### 步驟一：部署後端到 Railway

1. 前往 https://railway.app 並以 GitHub 登入
2. **New Project** → **Deploy from GitHub Repo**
3. **Root Directory** 設為 `backend`
4. 在 **Variables** 新增：
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxx   # 選配
   CORS_ORIGIN=https://your-app.vercel.app
   NODE_ENV=production
   ```
5. 部署完成後取得後端 URL：`https://taiwan-stock-backend-xxxx.up.railway.app`

### 步驟二：部署前端到 Vercel

1. 前往 https://vercel.com 並以 GitHub 登入
2. **Add New Project** → 匯入 repository
3. **Framework Preset** 選 `Vite`，**Root Directory** 設為 `frontend`
4. **Environment Variables** 填入：
   ```
   VITE_API_URL=https://taiwan-stock-backend-xxxx.up.railway.app
   ```
5. 點擊 **Deploy**

---

## API 端點

| Method | Path | 說明 |
|--------|------|------|
| GET | /api/market/taiex | 加權指數 |
| GET | /api/market/hot | 熱門股（?filter=vol/top/bottom/limit） |
| GET | /api/market/breadth | 漲跌家數 |
| GET | /api/market/institutional | 三大法人全市場 |
| GET | /api/market/futures | 外資台指期淨部位 |
| GET | /api/market/margin-trend | 全市場融資融券趨勢 |
| GET | /api/market/world | 國際市場 |
| GET | /api/stocks/:codes | 個股報價 |
| GET | /api/stocks/:code/history | K 線歷史資料 |
| GET | /api/stocks/:code/institutional | 個股法人資料 |
| GET | /api/stocks/:code/margin | 個股融資融券 |
| GET | /api/alerts | 警報列表 |
| POST | /api/alerts | 新增警報 |
| DELETE | /api/alerts/:id | 刪除警報 |
| POST | /api/ai/analyze | AI 個股分析（SSE） |
| POST | /api/ai/portfolio | AI 持倉簡報（SSE） |
| POST | /api/ai/market | AI 大盤解讀（SSE） |
| POST | /api/ai/pattern | AI K 線型態辨識（SSE） |
| POST | /api/ai/review | AI 交易覆盤（SSE） |
| GET | /api/settings/line-token | 查詢 LINE Notify token 是否已設定 |
| POST | /api/settings/line-token | 儲存 LINE Notify token |
| DELETE | /api/settings/line-token | 清除 token |
| POST | /api/settings/line-token/test | 發送 LINE 測試訊息 |

---

## 資料來源

| 來源 | 用途 | 費用 |
|------|------|------|
| [TWSE Open API](https://openapi.twse.com.tw) | K線、法人、融資券 | 免費 |
| [TWSE 即時報價](https://mis.twse.com.tw) | 盤中個股報價 | 免費 |
| [TAIFEX OpenData](https://opendata.taifex.com.tw) | 外資期貨部位 | 免費 |
| [Anthropic Claude API](https://anthropic.com) | AI 簡報分析 | 按量計費 |

---

## 費用估算

| 服務 | 免費額度 | 備註 |
|------|---------|------|
| Vercel | 無限靜態部署 | 前端 |
| Railway | $5/月 免費額度 | 後端，約可跑 500 小時 |
| TWSE / TAIFEX API | 完全免費 | 公開資料 |
| Anthropic API | 無免費額度 | ~$0.003/1K tokens，選配 |

預估月費：**$0–$5 美元**（不含 Claude API）

---

## 開發文件

- [功能規格書 SPEC.md](./SPEC.md)
- [AI Agent 開發規範 AGENTS.md](./AGENTS.md)
- [使用手冊 USER_MANUAL.md](./USER_MANUAL.md)
