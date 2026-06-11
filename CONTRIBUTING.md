# 貢獻指南

感謝你願意為 TaiFin 貢獻！這份文件說明開發環境設定、開發流程與提交規範。

## 開發環境設定

### 後端

```bash
cd backend
cp .env.example .env
# 視需要填入 ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY 等（皆為選配）
yarn install
yarn dev
```

### 前端

```bash
cd frontend
cp .env.example .env
yarn install
yarn dev
```

開啟 http://localhost:5173 即可看到系統。未設定的選配服務（Supabase、Claude API、LINE Notify）會自動停用對應功能，不影響其餘功能運作。

## 開發流程

1. 從 `main` 切出新分支，命名建議 `feat/<描述>`、`fix/<描述>`、`chore/<描述>`
2. 一個 PR 專注一件事，避免把多個不相關的功能/修正混在同一個 PR
3. 開發時請參考：
   - [SPEC.md](./SPEC.md) — 功能規格與開發進度
   - [AGENTS.md](./AGENTS.md) — 專案架構、程式風格與 AI agent 開發規範
4. 新增功能或修正 bug 請補上對應測試

## 測試

```bash
# 後端（node:test）
cd backend && yarn test

# 前端（vitest）
cd frontend && yarn test
```

PR 開啟後 GitHub Actions 會自動跑上述測試與前端 build，請確認 CI 通過。

## 提交 PR

- PR 標題請說明做了什麼（可參考既有 commit/PR 慣例，如 `feat(p6-21): ...`、`fix: ...`、`chore: ...`）
- PR 說明請包含：變更摘要、測試方式（Test plan）
- 若變更需要額外的環境變數設定或手動步驟（例如 Supabase migration），請在 PR 說明中註明

## 回報問題

歡迎使用 [Issue 範本](.github/ISSUE_TEMPLATE) 回報 bug 或提出功能建議。
