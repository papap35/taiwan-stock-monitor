/**
 * backend/src/services/supabase.js
 * Supabase 雲端同步服務
 * 策略：後端作為中介，前端透過 /api/sync/* 讀寫，不直接接觸 Supabase
 * 好處：key 不暴露在前端，未來加 Auth 只需改後端
 */
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_USER_ID = 'default'; // 未登入時的單用戶 fallback（向下相容舊資料）

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

/**
 * 驗證前端帶來的 Supabase access token，回傳 user id。
 * @param {string} token
 * @returns {Promise<string|null>} user id，token 無效或未啟用時回傳 null
 */
async function getUserIdFromToken(token) {
  const sb = getClient();
  if (!sb || !token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

// ─── Watchlist ──────────────────────────────────────────────────────────────

/**
 * 從 Supabase 拉取 watchlist
 * @param {string} userId
 * @returns {Array|null} watchlist 陣列，或 null（未啟用/失敗）
 */
async function pullWatchlist(userId = DEFAULT_USER_ID) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('taifin_watchlist')
    .select('data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });
  if (error) { console.error('[Supabase] pullWatchlist:', error.message); return null; }
  return data.map(r => r.data);
}

/**
 * 推送整個 watchlist 到 Supabase（upsert，以 code 為 key）
 * @param {Array} watchlist
 * @param {string} userId
 */
async function pushWatchlist(watchlist, userId = DEFAULT_USER_ID) {
  const sb = getClient();
  if (!sb) return;
  const rows = watchlist.map(item => ({
    id: item.code,
    data: item,
    user_id: userId,
  }));
  // 先刪除不在此次清單裡的（處理刪除自選股的情況）
  const codes = watchlist.map(w => w.code);
  await sb.from('taifin_watchlist').delete().eq('user_id', userId).not('id', 'in', `(${codes.map(c => `'${c}'`).join(',')})`);
  if (rows.length) {
    const { error } = await sb.from('taifin_watchlist').upsert(rows, { onConflict: 'id,user_id' });
    if (error) console.error('[Supabase] pushWatchlist:', error.message);
  }
}

// ─── Groups ─────────────────────────────────────────────────────────────────

async function pullGroups(userId = DEFAULT_USER_ID) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('taifin_groups')
    .select('data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });
  if (error) { console.error('[Supabase] pullGroups:', error.message); return null; }
  return data.map(r => r.data);
}

async function pushGroups(groups, userId = DEFAULT_USER_ID) {
  const sb = getClient();
  if (!sb) return;
  const rows = groups.map(g => ({ id: g.id, data: g, user_id: userId }));
  const ids = groups.map(g => g.id);
  await sb.from('taifin_groups').delete().eq('user_id', userId).not('id', 'in', `(${ids.map(i => `'${i}'`).join(',')})`);
  if (rows.length) {
    const { error } = await sb.from('taifin_groups').upsert(rows, { onConflict: 'id,user_id' });
    if (error) console.error('[Supabase] pushGroups:', error.message);
  }
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

async function pullAlerts(userId = DEFAULT_USER_ID) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('taifin_alerts')
    .select('data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });
  if (error) { console.error('[Supabase] pullAlerts:', error.message); return null; }
  return data.map(r => r.data);
}

async function pushAlerts(alerts, userId = DEFAULT_USER_ID) {
  const sb = getClient();
  if (!sb) return;
  const rows = alerts.map(a => ({ id: String(a.id), data: a, user_id: userId }));
  const ids = alerts.map(a => String(a.id));
  if (ids.length) {
    await sb.from('taifin_alerts').delete().eq('user_id', userId).not('id', 'in', `(${ids.map(i => `'${i}'`).join(',')})`);
  } else {
    await sb.from('taifin_alerts').delete().eq('user_id', userId);
  }
  if (rows.length) {
    const { error } = await sb.from('taifin_alerts').upsert(rows, { onConflict: 'id,user_id' });
    if (error) console.error('[Supabase] pushAlerts:', error.message);
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function pullSettings(userId = DEFAULT_USER_ID) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('taifin_settings')
    .select('data')
    .eq('user_id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return {}; // 尚無資料（初次使用）
    console.error('[Supabase] pullSettings:', error.message);
    return null;
  }
  return data?.data ?? {};
}

async function pushSettings(settings, userId = DEFAULT_USER_ID) {
  const sb = getClient();
  if (!sb) return;
  const { error } = await sb.from('taifin_settings').upsert(
    { user_id: userId, data: settings },
    { onConflict: 'user_id' }
  );
  if (error) console.error('[Supabase] pushSettings:', error.message);
}

// ─── Pull All（一次拉取全部）────────────────────────────────────────────────

async function pullAll(userId = DEFAULT_USER_ID) {
  const [watchlist, groups, alerts, settings] = await Promise.all([
    pullWatchlist(userId),
    pullGroups(userId),
    pullAlerts(userId),
    pullSettings(userId),
  ]);
  return { watchlist, groups, alerts, settings };
}

// ─── Push All（一次推送全部）────────────────────────────────────────────────

async function pushAll({ watchlist, groups, alerts, settings }, userId = DEFAULT_USER_ID) {
  await Promise.all([
    watchlist != null ? pushWatchlist(watchlist, userId) : Promise.resolve(),
    groups    != null ? pushGroups(groups, userId)        : Promise.resolve(),
    alerts    != null ? pushAlerts(alerts, userId)         : Promise.resolve(),
    settings  != null ? pushSettings(settings, userId)    : Promise.resolve(),
  ]);
}

module.exports = {
  isEnabled,
  getUserIdFromToken,
  DEFAULT_USER_ID,
  pullAll,
  pushAll,
  pullWatchlist, pushWatchlist,
  pullGroups,    pushGroups,
  pullAlerts,    pushAlerts,
  pullSettings,  pushSettings,
};
