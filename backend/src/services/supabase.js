/**
 * backend/src/services/supabase.js
 * Supabase 雲端同步服務
 * 策略：後端作為中介，前端透過 /api/sync/* 讀寫，不直接接觸 Supabase
 * 好處：key 不暴露在前端，未來加 Auth 只需改後端
 */
const { createClient } = require('@supabase/supabase-js');

const USER_ID = 'default'; // 單用戶策略，未來接 Auth 時改為 auth.uid()

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

function isEnabled() {
  return !!getClient();
}

// ─── Watchlist ──────────────────────────────────────────────────────────────

/**
 * 從 Supabase 拉取 watchlist
 * @returns {Array|null} watchlist 陣列，或 null（未啟用/失敗）
 */
async function pullWatchlist() {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('taifin_watchlist')
    .select('data')
    .eq('user_id', USER_ID)
    .order('updated_at', { ascending: true });
  if (error) { console.error('[Supabase] pullWatchlist:', error.message); return null; }
  return data.map(r => r.data);
}

/**
 * 推送整個 watchlist 到 Supabase（upsert，以 code 為 key）
 * @param {Array} watchlist
 */
async function pushWatchlist(watchlist) {
  const sb = getClient();
  if (!sb) return;
  const rows = watchlist.map(item => ({
    id: item.code,
    data: item,
    user_id: USER_ID,
  }));
  // 先刪除不在此次清單裡的（處理刪除自選股的情況）
  const codes = watchlist.map(w => w.code);
  await sb.from('taifin_watchlist').delete().eq('user_id', USER_ID).not('id', 'in', `(${codes.map(c => `'${c}'`).join(',')})`);
  if (rows.length) {
    const { error } = await sb.from('taifin_watchlist').upsert(rows, { onConflict: 'id' });
    if (error) console.error('[Supabase] pushWatchlist:', error.message);
  }
}

// ─── Groups ─────────────────────────────────────────────────────────────────

async function pullGroups() {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('taifin_groups')
    .select('data')
    .eq('user_id', USER_ID)
    .order('updated_at', { ascending: true });
  if (error) { console.error('[Supabase] pullGroups:', error.message); return null; }
  return data.map(r => r.data);
}

async function pushGroups(groups) {
  const sb = getClient();
  if (!sb) return;
  const rows = groups.map(g => ({ id: g.id, data: g, user_id: USER_ID }));
  const ids = groups.map(g => g.id);
  await sb.from('taifin_groups').delete().eq('user_id', USER_ID).not('id', 'in', `(${ids.map(i => `'${i}'`).join(',')})`);
  if (rows.length) {
    const { error } = await sb.from('taifin_groups').upsert(rows, { onConflict: 'id' });
    if (error) console.error('[Supabase] pushGroups:', error.message);
  }
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

async function pullAlerts() {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('taifin_alerts')
    .select('data')
    .eq('user_id', USER_ID)
    .order('updated_at', { ascending: true });
  if (error) { console.error('[Supabase] pullAlerts:', error.message); return null; }
  return data.map(r => r.data);
}

async function pushAlerts(alerts) {
  const sb = getClient();
  if (!sb) return;
  const rows = alerts.map(a => ({ id: String(a.id), data: a, user_id: USER_ID }));
  const ids = alerts.map(a => String(a.id));
  if (ids.length) {
    await sb.from('taifin_alerts').delete().eq('user_id', USER_ID).not('id', 'in', `(${ids.map(i => `'${i}'`).join(',')})`);
  } else {
    await sb.from('taifin_alerts').delete().eq('user_id', USER_ID);
  }
  if (rows.length) {
    const { error } = await sb.from('taifin_alerts').upsert(rows, { onConflict: 'id' });
    if (error) console.error('[Supabase] pushAlerts:', error.message);
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function pullSettings() {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('taifin_settings')
    .select('data')
    .eq('user_id', USER_ID)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return {}; // 尚無資料（初次使用）
    console.error('[Supabase] pullSettings:', error.message);
    return null;
  }
  return data?.data ?? {};
}

async function pushSettings(settings) {
  const sb = getClient();
  if (!sb) return;
  const { error } = await sb.from('taifin_settings').upsert(
    { user_id: USER_ID, data: settings },
    { onConflict: 'user_id' }
  );
  if (error) console.error('[Supabase] pushSettings:', error.message);
}

// ─── Pull All（一次拉取全部）────────────────────────────────────────────────

async function pullAll() {
  const [watchlist, groups, alerts, settings] = await Promise.all([
    pullWatchlist(),
    pullGroups(),
    pullAlerts(),
    pullSettings(),
  ]);
  return { watchlist, groups, alerts, settings };
}

// ─── Push All（一次推送全部）────────────────────────────────────────────────

async function pushAll({ watchlist, groups, alerts, settings }) {
  await Promise.all([
    watchlist != null ? pushWatchlist(watchlist) : Promise.resolve(),
    groups    != null ? pushGroups(groups)        : Promise.resolve(),
    alerts    != null ? pushAlerts(alerts)         : Promise.resolve(),
    settings  != null ? pushSettings(settings)    : Promise.resolve(),
  ]);
}

module.exports = {
  isEnabled,
  pullAll,
  pushAll,
  pullWatchlist, pushWatchlist,
  pullGroups,    pushGroups,
  pullAlerts,    pushAlerts,
  pullSettings,  pushSettings,
};
