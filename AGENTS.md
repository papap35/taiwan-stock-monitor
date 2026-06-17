# AGENTS.md — 開發規範手冊

本文件定義所有 AI agent 與人類開發者在此專案中必須遵守的原則。
每次開發新功能、修 bug、更新 SPEC.md 前，請先通讀對應章節。

> **每次 PR 前都必須執行 3.5 Step 2.5 文件同步檢查**，確認 SPEC.md、README.md、USER_MANUAL.md、AGENTS.md 均已反映本次異動。

---

## 目錄

1. [寫程式的原則](#1-寫程式的原則)
2. [測試的原則](#2-測試的原則)
3. [開發流程原則（Branch → Commit → PR）](#3-開發流程原則branch--commit--pr)
4. [Commit Code 的原則（Branch 上的 commit）](#4-commit-code-的原則branch-上的-commit)
5. [判讀與更新 SPEC.md 的原則](#5-判讀與更新-specmd-的原則)

---

## 1. 寫程式的原則

### 1.1 高內聚低耦合（核心架構原則）

- **純計算邏輯** 必須放在 `frontend/src/utils/` 下的純函式模組，不依賴任何 React hook、store 或 UI。
- **UI 元件**（`components/`）只能從 `utils/` 或自己的 props 取得資料，禁止從其他 UI 元件直接 import 業務邏輯。
- **Store**（`stores/`）只負責狀態持久化與跨元件共享，不含複雜的計算邏輯。
- 違反此原則的典型反例：`Dashboard.jsx` import `calcPortfolio` from `Watchlist.jsx`（已修正為從 `utils/portfolio.js` import）。

```
允許的依賴方向：
  components → utils        ✅
  components → stores       ✅
  components → services     ✅
  utils → （無任何依賴）      ✅
  stores → utils            ✅
  components → components   ❌（禁止 import 業務邏輯）
```

### 1.2 純函式優先

- 所有可以寫成純函式的計算，**必須**寫成純函式（相同輸入永遠得到相同輸出，無副作用）。
- 純函式放在 `utils/` 下，並附上 JSDoc 說明參數型別與回傳值。
- 需要副作用的操作（API 呼叫、localStorage、DOM 操作）集中在 hooks、services、store action 中。

```js
// ✅ 純函式（utils/portfolio.js）
export function calcRR(cost, target, stopLoss) { ... }

// ❌ 不純（混入副作用）
export function calcRR(cost, target, stopLoss) {
  localStorage.setItem('lastRR', result); // 副作用
  return result;
}
```

### 1.3 防禦性資料處理

- 任何從外部來的數值（API 回應、localStorage、使用者輸入），都必須做 null / 0 / NaN 防護。
- 回傳「無資料」的語意用 `null`（不是 `0`、不是 `-1`、不是 `''`）。
- 展示層遇到 `null` 統一顯示 `'—'`，不顯示錯誤數字。

```js
// ✅ price=0 代表「無報價」，不等於虧損 -100%
const pnlPct = (hasPrice && totalCost > 0) ? (mktVal / totalCost - 1) * 100 : null;

// ❌ 未防護，導致 price=0 時顯示 -100%
const pnlPct = (mktVal / totalCost - 1) * 100;
```

### 1.4 資料結構一致性

- 每個核心資料結構必須有唯一的定義來源（Single Source of Truth）。
- 變更資料結構時，同步更新 JSDoc、相關 utils 函式、測試的 `makeLot` / `makeItem` 工廠函式。

目前核心資料結構：

```js
// WatchlistItem
{ code, name, strategy, target, stopLoss, notes, lots[] }

// Lot
{ id, date, shares, oddLotShares, cost, note, trailingStopPct, planTarget, planStop }

// Quote
{ price, changePercent, volume, name, ... }
```

### 1.5 錯誤處理

- API 呼叫一律用 `try/catch`，失敗時 `console.warn()`，不讓元件崩潰。
- WebSocket 斷線有指數退避重連（`Math.min(2000 * 2^n, 30000)`）。
- localStorage 讀寫一律透過 `ls.get` / `ls.set` 包裝，防止 JSON parse 錯誤。

### 1.6 效能注意事項

- 昂貴計算（聚合 K 線、布林通道、MA）用 `useMemo` 包裝，依賴陣列要精確。
- WebSocket 推播的 `setQuotes` 使用 merge（`{ ...s.quotes, ...newQuotes }`），不整批替換。
- REST fallback 輪詢間隔最短 20 秒，避免打爆 TWSE API。

---

## 2. 測試的原則

### 2.1 測試涵蓋範圍

**前端：**
- `frontend/src/utils/` 下的每一個 exported 函式**都必須有對應測試**。
- 新增函式 → 同一個 PR/commit 內必須附上測試，不能事後補。
- UI 元件邏輯提取到 utils 後，測試寫在 utils 層，不寫元件整合測試（避免測試與實作緊耦合）。

**後端：**
- `backend/src/utils/` 下的每一個 exported 函式**都必須有對應測試**（與前端相同規則）。
- Route handler 裡**禁止包含純計算邏輯**（損益計算、資料切片、條件判斷…）。有純計算就抽到 `backend/src/utils/`，再從 handler 呼叫，並補測試。
- `services/` 裡含有純邏輯的 method（如 `AlertEngine.checkQuotes`、`_buildMessage`）也必須測試，測試放在 `backend/src/__tests__/`。
- 後端測試執行方式：`cd backend && node --test src/__tests__/*.test.js`

### 2.2 測試結構

每個函式的測試遵循此結構：

```
describe('函式名稱', () => {
  it('正常情況：描述期待行為',    () => { ... });
  it('邊界情況：0、null、空陣列', () => { ... });
  it('錯誤情況：非法輸入',        () => { ... });
  it('【防迴歸】具體 bug 描述',   () => { ... }); // 曾發生過的 bug 必加
});
```

### 2.3 防迴歸測試（必加）

每次修復 bug，必須補一個描述該 bug 的測試，並在 `it()` 描述開頭加上 `【防迴歸】`：

```js
it('【防迴歸】price=0 → pnlPct 必須為 null，絕對不能是 -100', () => {
  const { pnlPct } = calcPortfolio(item, 0);
  expect(pnlPct).toBeNull();
});
```

### 2.4 測試資料工廠

使用工廠函式產生測試資料，保持測試簡潔且易維護：

```js
const makeLot = (overrides = {}) => ({
  id: 'lot_1', date: '2024-01-01',
  shares: 1, oddLotShares: 0, cost: 100, note: '',
  ...overrides,
});

const makeItem = (lots, overrides = {}) => ({
  code: '2330', name: '台積電', lots,
  ...overrides,
});
```

### 2.5 測試命名規範

- `describe` 第一層：函式名稱（例：`calcPortfolio`）
- `describe` 第二層（可選）：情境分組（例：`— 正常情況`、`— price=0 防迴歸`、`— 邊界情況`）
- `it` 描述要說明**期待結果**，不說明實作細節

```js
// ✅ 描述期待結果
it('現價為 0 時損益百分比回傳 null', () => { ... });

// ❌ 描述實作細節
it('hasPrice 為 false 時跳過計算', () => { ... });
```

### 2.6 執行測試

```bash
# 前端測試（單次執行，CI / commit 前）
cd frontend && npm test

# 前端測試（監看模式，開發中）
cd frontend && npm run test:watch

# 後端測試
cd backend && node --test src/__tests__/*.test.js

# e2e（需先啟動 backend + frontend dev server）
cd e2e && npx playwright test
```

**每次 commit 前，前端和後端測試都必須全數通過**（0 failed）。

### 2.7 修改元件前先讀對應 e2e 測試

改動 UI 元件前，先開對應的 e2e 測試確認測試依賴的 DOM 文字、role、placeholder 不受影響：

| 元件 | e2e 測試檔 |
|------|-----------|
| Scanner.jsx | `e2e/tests/scanner.spec.js` |
| Watchlist.jsx | `e2e/tests/watchlist.spec.js` |
| Portfolio.jsx | `e2e/tests/portfolio.spec.js` |
| Dashboard / App | `e2e/tests/dashboard.spec.js` |

### 2.8 React hook 宣告順序（TDZ 陷阱）

`useCallback` / `useMemo` 的 dependency array 裡的所有變數，**必須在該 hook 宣告之前**就已定義。`npm run build`（Rollup）不觸發 TDZ 錯誤，但 `npm run dev`（Vite dev server）會導致元件 crash。

```js
// ❌ 錯誤：parsedCodes 在 useCallback 之後才宣告
const runCompare = useCallback(() => {
  parsedCodes.length  // TDZ 錯誤！
}, [parsedCodes]);
const parsedCodes = [...];

// ✅ 正確：先宣告，再寫 useCallback
const parsedCodes = [...];
const runCompare = useCallback(() => {
  parsedCodes.length  // OK
}, [parsedCodes]);
```

---

## 3. 開發流程原則（Branch → Commit → PR）

### 3.0 完整開發流程（必須遵守）

每一個需求（新功能、bug fix、重構）都必須走完以下流程，**禁止直接在 main 上開發**：

```
1. 確認目前在 main，且 main 是最新的
   git checkout main && git pull

2. 從 main 建立新 branch（命名規則見下方）
   git checkout -b <type>/<scope>-<簡述>

3. 在 branch 上開發，分批 commit（每個 commit 一件事）

4. 開發完畢，執行自我 review（見 3.5），**包含文件同步（Step 2.5），必須在同一 branch 補 commit**

5. 建立 PR（gh pr create），並等待 review 後 merge

6. 若 PR 開啟後有追加 commit，執行 Step 2.6 更新 PR title / description
```

**Branch 命名規則：**

| Prefix     | 用途                         | 範例                              |
| ---------- | ---------------------------- | --------------------------------- |
| `feat/`    | 新功能                       | `feat/stockchart-bollinger-bands` |
| `fix/`     | Bug 修正                     | `fix/dashboard-volume-display`    |
| `refactor/`| 重構                         | `refactor/portfolio-utils-split`  |
| `test/`    | 補測試                       | `test/portfolio-calc-coverage`    |
| `docs/`    | 文件更新                     | `docs/agents-md-workflow`         |
| `chore/`   | 依賴、工具、CI 等雜務        | `chore/update-vite-config`        |

---

### 3.5 PR 建立前的自我 Review 流程

在執行 `gh pr create` **之前**，必須完成以下自我 review：

#### Step 1：確認 diff 範圍合理

```bash
git diff main...HEAD --stat          # 確認改動範圍符合需求
git diff main...HEAD                 # 逐行確認沒有意外改動
```

#### Step 2：逐項清單檢查

```
□ 所有改動都是本次需求的範疇，沒有夾帶不相關的修改
□ 沒有 console.log / debugger 遺留
□ 沒有 TODO 尚未處理（或已標記在 SPEC.md / issue）
□ 每一個修改過的計算邏輯，都能說明「改前有什麼問題、改後為什麼正確」
□ 新函式有 JSDoc 說明（@param / @returns）
□ npm test 通過（0 failed）
□ npm run build 無 error
□ SPEC.md 狀態已同步更新（若適用）
```

#### Step 2.5：文件同步檢查（每次 PR 必做）

> ⛔ **這是硬性門檻，不是選填 checklist。**
> `.md` 更新必須 commit 在**同一個 branch** 裡，與功能程式碼一起進 PR。
> 不可以「先開 PR，事後再補文件」——那代表 PR 本身是不完整的。

功能開發完畢後，在執行 `gh pr create` 之前，**必須逐一確認以下 4 個 .md 檔案**是否反映此次異動，並在同一個 branch 上 commit 更新：

| 檔案 | 每次功能 PR 應確認的事項 |
|------|------------------------|
| **SPEC.md** | 對應功能項目是否已標記 `[x]`；若有新功能需求，是否已補充規格 |
| **README.md** | 「功能特色」區塊是否反映新功能；指令、API 端點是否仍正確 |
| **USER_MANUAL.md** | 新功能是否有對應的操作說明；截圖描述是否過時 |
| **AGENTS.md** | 若有新的開發規範、技術棧或架構決策，是否已補充 |

**判斷要不要更新的原則：**

- 新增了使用者可見的功能（新頁面、新按鈕、新欄位）→ **USER_MANUAL.md 必更新**
- 新增 API endpoint 或改變呼叫方式 → **README.md 必更新**
- 功能完成 → **SPEC.md 必標 `[x]`**
- 只是內部重構或 bug fix（使用者感知不到）→ .md 可不更新，但 commit message 要說明

#### Step 2.6：已開 PR 追加 commit 時，同步更新 PR title / description

Push 新 commit 到**已開啟的 PR** 之後，必須立即執行。

**⚠️ 在 Windows PowerShell 環境下，禁止用 `--body` 直接傳字串**（反引號會被 PowerShell 當跳脫字元，導致 ` ``` ` code block 變成亂碼）。

**正確做法**：用 Write 工具把 description 寫成暫存 `_pr_body.md`，再用 `--body-file` 傳入，最後刪除暫存檔：

```powershell
# 1. 用 Write 工具建立 _pr_body.md（內容包含完整 markdown）
# 2. 執行：
gh pr create --title "標題" --body-file _pr_body.md
# 或：
gh pr edit <PR號碼> --title "新標題" --body-file _pr_body.md
# 3. 刪除暫存檔：
Remove-Item _pr_body.md
```

**PR description 原則**：目標是讓 reviewer 能看懂「做了什麼、為什麼、怎麼測、有沒有風險」。區塊視實際需要加減，**寧可多寫也不要漏掉重要資訊**。

常用區塊（依需要取捨）：

```
## Summary
- **功能名稱**：一句話說明做了什麼
- 其他重點變更（測試、規範、文件）

## 功能說明          ← 有新 UI / 流程時加，用表格列出各功能點
## 測試明細          ← 有新增測試檔時加，列出檔案、測試數、涵蓋內容
## Files Changed    ← 每個異動檔案一行說明做了什麼
## How to Test      ← reviewer 要怎麼手動驗證，逐步操作說明
## Known Issues     ← 已知限制、邊界 case、刻意不處理的 trade-off
## TODO             ← 這支 PR 沒做但後續要跟進的事
## Test             ← 自動測試結果（Frontend N passed ✅ / Backend N passed ✅）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

> `## Summary` 和 `## Files Changed` 是必填。其餘區塊有內容才加，沒有就省略，不要寫空區塊。

PR description 必須反映 **目前 branch 上所有 commit 的累積狀態**，不是只描述最新一個 commit。具體來說：

- 新增了修正（fix commit）→ 在 Summary 裡補一條，或新增 `## Fixes` 區塊
- 新增了文件更新（docs commit）→ 在 Files Changed 表格裡補上 .md 欄位
- 功能範圍有變化 → title 視情況更新

**判斷是否需要更新：**
執行 `git log main..HEAD --oneline` 後，如果 PR description 無法完整反映這些 commit 的改動，就必須更新。

#### Step 3：針對這次 PR 的 bug 風險評估

自問以下問題，**若任何一題答「不確定」，必須補測試或補說明**：

1. 這個改動影響到哪些現有功能？有沒有可能意外破壞它們？
2. 有沒有邊界情況（null / 0 / 空陣列 / 非交易時段）沒有處理到？
3. 資料來源的格式假設（API 欄位名稱、單位）是否已驗證？

#### Step 4：撰寫 PR 描述

PR 描述必須包含：

```markdown
## 需求背景
（一句話說明為什麼要做這個改動）

## 改動摘要
- 改了什麼（列點）
- 為什麼這樣改

## 測試方式
- [ ] 手動測試步驟 1
- [ ] 手動測試步驟 2
- [ ] npm test 通過

## 已知風險 / 後續待辦
（有的話列出來，沒有填「無」）
```

---

## 4. Commit Code 的原則（Branch 上的 commit）

### 4.1 Commit 時機

- 一個 commit 只做一件事（功能、修 bug、重構、測試各自分開）。
- 功能與對應測試**可以放在同一個 commit**（鼓勵一起提交）。
- 不 commit 未完成的半成品（除非用 `WIP:` 前綴明確標示）。

### 4.2 Commit Message 格式

採用 Conventional Commits 格式：

```
<type>(<scope>): <簡短說明（中文或英文）>

[選填] 較詳細的說明，說明「為什麼」而非「做了什麼」
```

**type 清單：**

| type       | 用途                                       |
| ---------- | ------------------------------------------ |
| `feat`     | 新功能                                     |
| `fix`      | 修 bug                                     |
| `refactor` | 重構（不影響行為）                         |
| `test`     | 新增或修改測試                             |
| `perf`     | 效能優化                                   |
| `style`    | 格式調整（不影響邏輯）                     |
| `docs`     | 文件更新（README、SPEC.md、AGENTS.md）     |
| `chore`    | 建置工具、依賴更新等雜務                   |

**scope 範例：** `portfolio`、`watchlist`、`stockchart`、`store`、`backend`、`ws`

```bash
# 範例
feat(portfolio): 新增動態停損、R/R 比、部位規模計算函式
test(portfolio): 補充 calcRR、calcPositionSize 等 34 個單元測試
fix(watchlist): price=0 時不應顯示 -100% 損益
refactor(portfolio): 將計算邏輯從 Watchlist.jsx 提取至 utils/portfolio.js
feat(stockchart): 新增布林通道、成交量均線、週K/月K 聚合
```

### 4.3 commit 前檢查清單

```
□ 前端：npm test 通過（0 failed）
□ 後端：node --test src/__tests__/*.test.js 通過（0 failed）
□ npm run build 無 error（warning 可接受）
□ e2e：cd e2e && npx playwright test 通過（不可只靠 build 確認，見 2.7、2.8）
□ 新功能有對應測試（前端 utils/ 函式 + 後端 utils/ 與 services/ 純邏輯）
□ Route handler 內無 inline 純計算邏輯（已抽至 utils/）
□ 新的 bug fix 有防迴歸測試
□ 沒有 console.log 除錯碼遺留（console.warn 可接受）
□ 沒有 hardcode 的 API key 或機密資訊
□ SPEC.md 中對應功能的狀態已更新（若適用）
□ 文件同步：README / USER_MANUAL / AGENTS 已在本 branch 更新（見 3.5 Step 2.5）——不可事後補，必須在同一 PR 內
```

### 4.4 不應該 commit 的東西

- `node_modules/`（已在 .gitignore）
- `.env` 或含有 API key 的檔案
- `dist/`（build 產物）
- 暫時的測試用 `console.log`
- 大量自動格式化造成的 whitespace diff（應獨立為 `style:` commit）

---

## 5. 判讀與更新 SPEC.md 的原則

### 5.1 SPEC.md 的用途

`SPEC.md` 是本系統的**功能規格書**，以一位專業股票交易員的視角定義系統應具備的功能。
它是開發的「北極星」——決定下一步做什麼、什麼不做。

### 5.2 優先級判讀規則

SPEC.md 中的功能以 P0～P5 排序，判讀時遵循：

| 優先級 | 意義                             | 開發原則                             |
| ------ | -------------------------------- | ------------------------------------ |
| P0     | 交易安全相關，缺少會造成損失     | **必須最先實作**，不可跳過           |
| P1     | 技術分析核心功能                 | 在 P0 完成後立即實作                 |
| P2     | 進階功能，提升使用效率           | P1 穩定後排入                        |
| P3     | 錦上添花，有則更好               | 有餘力再做                           |
| P4/P5  | 實驗性或需外部資源的功能         | 評估可行性後再決定                   |

**禁止「跳著做」**：不可因為某個低優先級功能「比較有趣」就跳過高優先級功能。

### 5.3 標記功能狀態

SPEC.md 中每個功能項目用以下標記標示狀態：

```
- [ ] 待開發
- [x] 已完成
- [~] 進行中（partial / WIP）
- [-] 已決定不做（附理由）
```

每次功能完成後，**必須同步更新 SPEC.md 的狀態**，並在 commit message 中加入 `docs(spec): 標記 P0-1 動態停損為已完成`。

### 5.4 新增功能到 SPEC.md

新增功能規格時，需包含：

```markdown
### Pn-序號: 功能名稱（中英文）

**使用者故事**：作為一個＿，我想要＿，這樣我可以＿

**驗收標準**：
- [ ] 具體可測試的條件 1
- [ ] 具體可測試的條件 2

**技術方案**：
- 前端：影響哪些檔案、用什麼方法
- 後端：是否需要新 API endpoint
- 資料來源：TWSE / Yahoo Finance / 其他

**優先級理由**：為什麼這個優先級？
```

### 5.5 判讀「做還是不做」的問題

遇到 SPEC.md 沒寫、但使用者提出的功能，先問：

1. **是否提升交易安全？** → 是，立即評估，視情況插隊到 P0
2. **是否解決現有功能的 bug 或資料錯誤？** → 是，列為 hotfix，立即處理
3. **是否在現有架構下可以快速實作（< 2hr）？** → 是，可插入目前迭代
4. **是否需要付費 API 或複雜基礎設施？** → 記錄在 SPEC.md P4/P5，不立即實作

### 5.6 資料來源評估準則

優先使用免費且穩定的資料來源：

| 優先級 | 來源                              | 限制                         |
| ------ | --------------------------------- | ---------------------------- |
| 1      | TWSE 官方 API（mis.twse.com.tw）  | 僅台股，盤中限制頻率         |
| 2      | TWSE openapi（openapi.twse.com.tw）| 每日盤後，資料較完整         |
| 3      | Yahoo Finance v8（免費，無 key）  | 適合國際指數、匯率、商品     |
| 4      | 需要 API key 的服務               | 記錄在 SPEC.md，評估成本後再做 |

---

## 附錄：專案技術棧速查

```
前端：React 18 + Vite 5 + Zustand 4
圖表：lightweight-charts v5（K線）、Recharts（報表）
測試：Vitest + jsdom（npm test）
後端：Node.js + Express + ws（WebSocket）
資料：TWSE API（台股）、Yahoo Finance v8（國際）
部署：Docker Compose（frontend + backend + nginx）
```

## 附錄：常用指令

```bash
# 前端開發
cd frontend && npm run dev

# 前端測試（必須在 commit 前通過）
cd frontend && npm test

# 後端開發
cd backend && node src/index.js

# 完整啟動（Docker）
docker-compose up --build
```
