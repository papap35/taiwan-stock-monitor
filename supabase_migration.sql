-- TaiFin Supabase Migration
-- 在 Supabase Dashboard → SQL Editor 執行此檔案

-- ── 使用者資料表（以 user_id 隔離，支援多使用者）──────────────────
-- user_id 為 TEXT：未登入時為 'default'（向下相容），登入後為 auth.uid()::text

CREATE TABLE IF NOT EXISTS taifin_watchlist (
  id          TEXT NOT NULL,             -- 股票代號
  data        JSONB NOT NULL,            -- 完整 watchlist item（含 lots）
  user_id     TEXT NOT NULL DEFAULT 'default',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS taifin_groups (
  id          TEXT NOT NULL,             -- group id
  data        JSONB NOT NULL,            -- 完整 group object
  user_id     TEXT NOT NULL DEFAULT 'default',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS taifin_alerts (
  id          TEXT NOT NULL,             -- alert id
  data        JSONB NOT NULL,            -- 完整 alert object
  user_id     TEXT NOT NULL DEFAULT 'default',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS taifin_settings (
  user_id     TEXT PRIMARY KEY DEFAULT 'default',
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── P6-21：既有環境升級（若資料表已存在於舊版單欄 PK，執行以下三段）──
-- 將 (id) 主鍵改為 (id, user_id)，讓不同使用者可擁有相同代號的列
-- ALTER TABLE taifin_watchlist DROP CONSTRAINT taifin_watchlist_pkey;
-- ALTER TABLE taifin_watchlist ADD PRIMARY KEY (id, user_id);
-- ALTER TABLE taifin_groups    DROP CONSTRAINT taifin_groups_pkey;
-- ALTER TABLE taifin_groups    ADD PRIMARY KEY (id, user_id);
-- ALTER TABLE taifin_alerts    DROP CONSTRAINT taifin_alerts_pkey;
-- ALTER TABLE taifin_alerts    ADD PRIMARY KEY (id, user_id);

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

-- ── P6-21：Row Level Security ────────────────────────────────────────
-- 後端使用 service role key（已自動繞過 RLS），以下政策主要作為防護層，
-- 避免未來不慎使用 anon key 直接存取資料表時，使用者能讀寫到他人資料。
-- user_id = 'default'（未登入單用戶模式）的資料不受 RLS 限制保護，
-- 僅登入後 user_id = auth.uid()::text 的列會被隔離。

ALTER TABLE taifin_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE taifin_groups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE taifin_alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE taifin_settings  ENABLE ROW LEVEL SECURITY;

CREATE POLICY taifin_watchlist_owner ON taifin_watchlist
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY taifin_groups_owner ON taifin_groups
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY taifin_alerts_owner ON taifin_alerts
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY taifin_settings_owner ON taifin_settings
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
