# 用 AI 協作開發全端專案：TaiFin 台股監控系統實戰報告

> 從零到完整產品，65 個 commit、13 支 PR、20 項功能、268 個單元測試
> 分享給想把 AI coding 工具真正用起來的開發者

*TaiFin 專案：https://github.com/papap35/taiwan-stock-monitor*

---

## 一、專案背景

**TaiFin** 是一套個人台股監控系統，技術棧如下：

| 層次 | 技術 |
|------|------|
| 前端 | React + Vite（Vitest 測試） |
| 後端 | Node.js + Express（原生 `node --test`） |
| AI | Anthropic Claude API（SSE 串流） |
| 資料 | TWSE Open API（完全免費） |
| 推播 | LINE Notify |
| 部署 | Vercel（前端）+ Railway（後端） |

**功能規模**（20 項，全部由 AI 協作完成）：
- K 線圖、均線、布林通道、量比
- 三大法人籌碼評分、融資融券趨勢
- 停損警報、LINE 推播
- 交易日誌、績效統計儀表板
- AI K 線型態辨識、AI 覆盤助手
- 條件選股掃描器（13 條件）
- 除權息/財報行事曆
- 盤前/盤後自動 AI 簡報排程

---

## 二、最關鍵的一步：先寫規範文件（AGENTS.md）

這是整個協作過程中**最重要的一件事**。

在任何功能開發之前，先建立一份給 AI 看的「開發規範手冊」— `AGENTS.md`。這份文件告訴 AI：

- **架構原則**：前端/後端分離、API 格式、命名規則
- **開發流程**：branch → commit → PR 的完整 SOP
- **測試規則**：哪些東西必須寫測試、測試指令是什麼
- **文件同步規則**：每個 PR 必須同步更新哪些 .md 文件
- **PR 格式**：description 要包含哪些區塊

```
AGENTS.md 的核心價值：
讓 AI 在每次對話都能「自動做對」，不需要你每次重複說明。
```

**沒有 AGENTS.md 的後果（親身踩坑）**：
- PR 沒有更新文件
- 功能沒有寫測試
- PR description 格式不一致
- 新功能沿用舊架構寫法

---

## 三、開發流程 SOP（每個功能的標準步驟）

```
1. 讀 SPEC.md 確認需求
2. 開新 branch：feat/p{n}-{feature-name}
3. 實作功能
   ├─ 後端：先抽純函式到 utils/，再寫 route handler
   ├─ 前端：先寫邏輯，再接 UI
   └─ 確認沒有 inline 計算邏輯留在 handler 裡
4. 寫測試（與功能同一個 commit，不補考）
5. 更新 SPEC.md / README.md / USER_MANUAL.md（⛔ 必須在同一 branch）
6. gh pr create --body-file _pr_body.md（用暫存檔避免亂碼）
```

這個 SOP 不是一開始就完整的，**是踩了坑之後逐步補進 AGENTS.md 的**。

---

## 四、讓 AI 寫出可測試程式碼的關鍵：純函式規則

最早的程式碼，後端 route handler 大量包含計算邏輯：

```js
// ❌ 不好的寫法：handler 內有 inline 計算
router.post('/review', async (req, res) => {
  const pnlPct = ((lot.exitPrice - lot.entryPrice) / lot.entryPrice) * 100; // inline！
  const holdDays = Math.floor((new Date(lot.exitDate) - new Date(lot.entryDate)) / 86400000);
  // ...送給 Claude
});
```

問題：**這段計算邏輯沒辦法被獨立測試。**

改成純函式後：

```js
// ✅ 好的寫法：抽到 utils/，可以獨立測試
// backend/src/utils/aiHelpers.js
function calcLotReviewStats(lot) {
  return {
    pnlPct: ((lot.exitPrice - lot.entryPrice) / lot.entryPrice) * 100,
    holdDays: Math.floor((new Date(lot.exitDate) - new Date(lot.entryDate)) / 86400000),
  };
}

// handler 只負責 I/O
router.post('/review', async (req, res) => {
  const stats = calcLotReviewStats(req.body.lot);
  // ...送給 Claude
});
```

**這條規則寫進 AGENTS.md 後，後續所有功能都自動遵守了。**

---

## 五、測試策略：只測純函式，不測 UI

本專案採用的測試哲學：

```
✅ 測純函式（數學計算、資料轉換、邏輯判斷）
✅ 測業務邏輯（條件組合、邊界值、錯誤處理）
❌ 不測 UI 渲染（React 元件測試 ROI 低）
❌ 不測外部 API 呼叫（改用 mock 或整合測試）
```

最終數字：
- 前端：182 tests（portfolio 工具函式 + scanner 指標計算）
- 後端：86 tests（aiHelpers + alertEngine + lineNotify + calendar + reportHelpers）

**AI 寫測試的最佳提示方式**：

> 「請為 `calcRSI14(candles)` 寫測試，用 node:test 原生模組，涵蓋：資料不足時回傳 null、全漲接近 100、全跌接近 0、無虧損時不除以零。」

比起說「幫我寫測試」，**列出具體測試案例**讓 AI 產出更有針對性。

---

## 六、踩過的坑與解法

### 坑 1：PR description 在 PowerShell 出現亂碼

**原因**：PowerShell 的 `@"..."@` 雙引號 heredoc，反引號（`` ` ``）是跳脫字元，導致 markdown 的 ` ``` ` code block 被吃掉。

**解法**：改用 `--body-file` 流程：

```powershell
# 1. 用工具把 description 寫成 _pr_body.md
# 2. 執行：
gh pr create --title "標題" --body-file _pr_body.md
# 3. 刪除暫存檔：
Remove-Item _pr_body.md
```

**教訓**：AI 工具在不同 shell 環境下行為不同，發現問題後立即更新規範文件，讓後續自動避開。

---

### 坑 2：功能做完了，但文件沒更新

做完幾個功能後才發現 PR 都沒有更新 SPEC.md / README.md / USER_MANUAL.md。

**根本原因**：AGENTS.md 裡說「要更新文件」，但沒有說清楚「必須在同一個 branch、同一個 PR 裡」，AI 認為之後補就好。

**解法**：把規則從模糊改成明確：

```
⛔ 硬性門檻：在執行 gh pr create 之前，
   SPEC.md / README.md / USER_MANUAL.md 必須已在此 branch commit。
   不允許事後補。違反此規則的 PR 需要打回重做。
```

**教訓**：給 AI 的規則要夠具體，模糊的指令會有模糊的結果。

---

### 坑 3：時區問題讓測試在台灣時間早晨失敗

`new Date().toISOString().slice(0, 10)` 是 UTC 日期，但 `daysFromToday` 用本地時間計算。台灣 UTC+8，早上 8 點前 UTC 日期還是昨天，導致「今天 = 0 天」的測試失敗。

**解法**：統一在純函式和測試工廠裡都使用 UTC 基準。

```js
// ✅ 統一用 UTC
function daysFromToday(isoDate) {
  const todayUTC = new Date().toISOString().slice(0, 10);
  const todayMs  = new Date(todayUTC).getTime();
  return Math.round((new Date(isoDate).getTime() - todayMs) / 86400000);
}
```

**教訓**：時區問題在測試裡很隱蔽，AI 寫出來的程式不一定考慮到。自己要多一層驗證。

---

### 坑 4：AI 面板撐開父層高度

AI 分析結果面板（右側滑出）使用 `height: 100%` 作為 flex child，因為父層沒有明確高度，導致循環計算，讓整個 modal 被撐高。

**解法**：改用 `position: absolute` 脫離文檔流：

```jsx
{/* 面板脫離 flex flow，不影響父層高度 */}
<div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 300 }}>
  {/* 可滾動的內容 */}
</div>

{/* chart 區域留出右側空間 */}
<div style={{ marginRight: showAIPanel ? 300 : 0, transition: 'margin-right .25s' }}>
```

**教訓**：CSS 佈局問題 AI 有時會越修越壞。遇到這類問題，要把問題描述清楚（「不要讓 panel 撐開父層」）而不是讓 AI 自己猜。

---

## 七、提示詞（Prompt）技巧整理

### 技巧 1：給具體邊界條件，不要給模糊需求

```
❌ 「幫我寫 RSI 計算」

✅ 「寫 calcRSI14(candles)，資料少於 15 根回傳 null；
    分母為 0 時回傳 100（全漲情況）；
    結果用 toFixed(2) 四捨五入。」
```

### 技巧 2：說清楚「為什麼」，讓 AI 做判斷

```
❌ 「把這個 function 移到 utils/」

✅ 「這個計算邏輯目前在 route handler 裡，需要抽到 utils/
    並寫對應測試，原因是 handler 裡的 inline 計算無法被單元測試。」
```

### 技巧 3：描述失敗現象，不要描述你猜的原因

```
❌ 「我覺得是 state 沒有更新，幫我修一下」

✅ 「AI 分析面板顯示後，整個 modal 的高度被撐大了，
    但關掉面板後高度不會縮回去。請修正這個問題。」
```

### 技巧 4：要 AI「確認」再「實作」

對於複雜功能，先讓 AI 說出它的理解和計畫，確認後再讓它動手：

```
「在開始實作 LINE Notify 之前，
 先告訴我你打算新增哪些檔案、改動哪些現有檔案，
 以及 token 儲存的策略。確認後再動手。」
```

### 技巧 5：把「邊界案例」說出來

AI 容易跳過邊界條件，要主動列出：

```
「calcKDLatest 需要處理：
 - 資料少於 period+1 根 → 回傳 k:null, d:null, golden:false
 - 持續上漲時 K 應大於 D
 - 黃金交叉判定：前一根 K < D，且當前 K > D（不是 K >= D）」
```

---

## 八、架構決策記錄

### SSE 串流替代 WebSocket 做 AI 輸出

AI 分析用 Server-Sent Events（SSE）而非 WebSocket，原因：
- 單向輸出不需要雙向通訊
- 比 WebSocket 更簡單，不需要心跳機制
- Railway 部署時需要加 `X-Accel-Buffering: no` header 才能讓 Nginx 不緩衝

```js
function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('X-Accel-Buffering', 'no'); // 關鍵！
  res.flushHeaders();
}
```

### 純函式 + 記憶體儲存 > 資料庫（短期）

警報、LINE token、自動簡報開關都存在記憶體而非資料庫，理由：
- 避免引入資料庫依賴，保持部署簡單
- 伺服器重啟場景少（Railway 穩定）
- 環境變數作為持久化的 fallback

### node-cron 內建時區支援

排程指定 `timezone: 'Asia/Taipei'`，避免 UTC 與台灣時間 8 小時差：

```js
cron.schedule('45 8 * * 1-5', runPreMarketReport, {
  timezone: 'Asia/Taipei',
});
```

---

## 九、數字總結

| 項目 | 數字 |
|------|------|
| 總 commit 數 | 65 |
| 合併的 PR | 12 |
| 開發中的 PR | 1（P5-20） |
| 前端測試 | 182 passed |
| 後端測試 | 86 passed |
| 前端元件 | 15 個 |
| 後端 routes | 6 個 |
| 後端 services | 5 個 |
| 後端 utils | 2 個 |
| 已完成功能 | 19 / 20（P5-17 Supabase 待建帳號） |

---

## 十、給想嘗試 AI Coding 協作的建議

1. **先寫 AGENTS.md，再寫第一行程式碼**
   規範文件是投報率最高的投資，省掉的時間遠超過寫它花的時間。

2. **每次踩坑後立刻更新 AGENTS.md**
   不要只修當次的問題，要讓下次 AI 自動避開。

3. **純函式是 AI 協作的最佳單位**
   輸入確定、輸出確定、可以測試，AI 最能發揮的地方就在這裡。

4. **讓 AI 寫測試，自己 review 測試案例**
   AI 寫測試很快，但邊界條件容易漏。自己列出場景，讓 AI 寫程式碼。

5. **UI 細節自己決策，邏輯讓 AI 跑**
   CSS 佈局、互動細節，描述「要達到什麼效果」比描述「怎麼改程式碼」更有效。

6. **測試要和功能同一個 commit**
   「之後再補測試」幾乎等於永遠不補。

7. **PR description 是給未來自己看的**
   寫清楚「做了什麼、為什麼、怎麼測、有沒有已知問題」，三個月後的自己會感謝現在的自己。

---

## 附錄：各 PR 複雜度與 AI Token 消耗估算

> **複雜度**：以 git diff 實際新增行數、異動檔案數、測試數為基準，分為 S / M / L / XL 四級。  
> **Token**：無法從 API 取得歷史帳單，以功能複雜度估算，模型為 Claude Sonnet 4.5。  
> 定價基準：input $3 / 1M tokens，output $15 / 1M tokens（2026 年）。  
> ⚠️ Token 與費用為估算值，僅供參考。

| PR | 功能 | 新增行數 | 異動檔案 | 測試數 | 複雜度 | 估算 Input Tokens | 估算 Output Tokens | 估算費用 (USD) |
|----|------|:--------:|:--------:|:------:|:------:|:-----------------:|:------------------:|:--------------:|
| #1 | P0 初始架構 + P1 Dashboard 審計 + AGENTS.md | 1,697 | 12 | 72 | **XL** | ~180,000 | ~45,000 | ~$1.22 |
| #2 | P1-7 均線系統完整化（MA10/120/240） | 51 | 2 | 0 | **S** | ~20,000 | ~5,000 | ~$0.14 |
| #3 | P2-9 外資期貨淨部位 + P2-11 融資融券趨勢 | 326 | 5 | 0 | **M** | ~60,000 | ~18,000 | ~$0.45 |
| #4 | P2-10 個股籌碼評分系統 | 283 | 4 | 0 | **M** | ~55,000 | ~16,000 | ~$0.40 |
| #5 | P3-12/13 交易日誌 + 績效儀表板 | 512 | 4 | 110 | **XL** | ~220,000 | ~65,000 | ~$1.64 |
| #6 | P1 補完 + P4-16 自選股分群 | 169 | 4 | 0 | **S** | ~40,000 | ~12,000 | ~$0.30 |
| #7 | 品牌命名 TaiFin + Logo + 文件全更名 | 989 | 11 | 0 | **M**（大量文字替換） | ~70,000 | ~20,000 | ~$0.51 |
| #8 | P1-8 AI K 線型態辨識 | 846 | 10 | 0 | **L** | ~50,000 | ~15,000 | ~$0.38 |
| #9 | P3-14 AI 覆盤助手 + 測試補齊 | 966 | 8 | 29 | **L** | ~65,000 | ~20,000 | ~$0.50 |
| #10 | P4-15 條件選股掃描器 | 502 | 11 | 0 | **M** | ~55,000 | ~18,000 | ~$0.44 |
| #11 | P5-18 LINE Notify 推播 | 669 | 11 | 15 | **L** | ~60,000 | ~18,000 | ~$0.45 |
| #12 | P5-19 重要事件行事曆 | 534 | 11 | 18 | **L** | ~65,000 | ~20,000 | ~$0.50 |
| #13 | P5-20 自動 AI 簡報排程 | 966 | 10 | 14 | **L** | ~55,000 | ~16,000 | ~$0.41 |
| — | **本份報告撰寫** | — | 1 | — | **S** | ~30,000 | ~8,000 | ~$0.21 |
| | **合計** | **~8,510** | — | **268** | | **~1,025,000** | **~296,000** | **≈ $7.55** |

### 說明

**複雜度分級定義：**

| 等級 | 新增行數 | 說明 |
|------|:--------:|------|
| S | < 200 | 單一小功能或補丁 |
| M | 200～600 | 單一完整功能，有前後端 |
| L | 600～1000 | 跨多層（route + service + utils + test） |
| XL | > 1000 或跨多功能 | 架構建立或複合功能群 |

**觀察：**
- 整個專案共 **8,510 行有效程式碼**，其中包含 268 個測試。
- **XL 功能（#1、#5）** 貢獻了約 45% 的 token 消耗，是成本的主要來源。
- **#7 品牌更名** 行數多但複雜度屬 M，因為主要是文字搜尋替換，AI 對話回合少。
- 整個專案 **約 130 萬 tokens**，以 Claude Sonnet 定價約 **$7.55 美元**。
- 若改用 Claude Haiku（input $0.8 / output $4 per 1M）：同規模約 **$2.00 美元**。

**效益比較：**

| 項目 | 傳統方式 | AI 協作 |
|------|---------|---------|
| 預估開發時間 | 3～4 週（1 人） | 2 天（1 人） |
| AI 工具費用 | — | ~$7.55 |
| 單元測試數 | 通常最後補 / 不補 | 268 個（與功能同步） |
| 文件同步 | 通常滯後 | 每個 PR 強制同步 |
