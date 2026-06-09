-- TaiFin Supabase Migration
-- 在 Supabase Dashboard → SQL Editor 執行此檔案

-- ── 使用者資料表（以 user_id 隔離，支援未來多使用者）──────────────
-- 目前採用「單一用戶，固定 user_id = 'default'」策略
-- 若未來加入 Auth，改為 auth.uid() 即可

CREATE TABLE IF NOT EXISTS taifin_watchlist (
  id          TEXT PRIMARY KEY,          -- 股票代號（唯一）
  data        JSONB NOT NULL,            -- 完整 watchlist item（含 lots）
  user_id     TEXT NOT NULL DEFAULT 'default',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taifin_groups (
  id          TEXT PRIMARY KEY,          -- group id
  data        JSONB NOT NULL,            -- 完整 group object
  user_id     TEXT NOT NULL DEFAULT 'default',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taifin_alerts (
  id          TEXT PRIMARY KEY,          -- alert id
  data        JSONB NOT NULL,            -- 完整 alert object
  user_id     TEXT NOT NULL DEFAULT 'default',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taifin_settings (
  user_id     TEXT PRIMARY KEY DEFAULT 'default',
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 自動更新 updated_at ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER watchlist_updated_at
  BEFORE UPDATE ON taifin_watchlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER groups_updated_at
  BEFORE UPDATE ON taifin_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER alerts_updated_at
  BEFORE UPDATE ON taifin_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER settings_updated_at
  BEFORE UPDATE ON taifin_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
