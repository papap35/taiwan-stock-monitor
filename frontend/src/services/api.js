const BASE_URL = import.meta.env.VITE_API_URL || '';

// P6-21: 由 useAuth 設定，供 apiFetch 取得目前登入者的 access token
let authTokenGetter = null;
export function setAuthTokenGetter(fn) {
  authTokenGetter = fn;
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authTokenGetter) {
    const token = await authTokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // 市場
  getTaiex: () => apiFetch('/api/market/taiex'),
  getTaiexHistory: (months = 3) => apiFetch(`/api/market/taiex/history?months=${months}`),
  getHotStocks: (filter = 'vol', limit = 30) =>
    apiFetch(`/api/market/hot?filter=${filter}&limit=${limit}`),
  getBreadth: () => apiFetch('/api/market/breadth'),
  getMarketStatus: () => apiFetch('/api/market/status'),

  // 個股
  getQuotes: (codes) => apiFetch(`/api/stocks/${codes.join(',')}`),
  getHistory:       (code, months = 3) => apiFetch(`/api/stocks/${code}/history?months=${months}`),
  getInstitutional: (code, months = 3) => apiFetch(`/api/stocks/${code}/institutional?months=${months}`),
  getMargin:        (code, months = 3) => apiFetch(`/api/stocks/${code}/margin?months=${months}`),
  getMarketInstitutional: () => apiFetch('/api/market/institutional'),
  getMarketValuation:     () => apiFetch('/api/market/valuation'),
  getMarketIntraday:      () => apiFetch('/api/market/intraday'),
  getWorldMarkets:        () => apiFetch('/api/market/world'),
  getMarketFutures:       () => apiFetch('/api/market/futures'),
  getMarketMarginTrend:   () => apiFetch('/api/market/margin-trend'),
  getStockValuation:    (code) => apiFetch(`/api/stocks/${code}/valuation`),
  getAnnouncements:     (code) => apiFetch(`/api/stocks/${code}/announcements`),

  // 警報
  getAlerts: () => apiFetch('/api/alerts'),
  addAlert: (data) => apiFetch('/api/alerts', { method: 'POST', body: JSON.stringify(data) }),
  deleteAlert: (id) => apiFetch(`/api/alerts/${id}`, { method: 'DELETE' }),
  clearTriggered: () => apiFetch('/api/alerts/triggered/clear', { method: 'DELETE' }),

  // 行事曆
  getCalendarEvents: (days = 60, codes = null) => {
    const params = new URLSearchParams({ days });
    if (codes && codes.length) params.set('codes', codes.join(','));
    return apiFetch(`/api/calendar/events?${params}`);
  },

  // LINE Notify 設定
  getLineTokenStatus: () => apiFetch('/api/settings/line-token'),
  setLineToken: (token) => apiFetch('/api/settings/line-token', { method: 'POST', body: JSON.stringify({ token }) }),
  clearLineToken: () => apiFetch('/api/settings/line-token', { method: 'DELETE' }),
  testLineNotify: () => apiFetch('/api/settings/line-token/test', { method: 'POST' }),

  // 自動簡報排程
  getAutoReportSettings: () => apiFetch('/api/settings/auto-report'),
  setAutoReportSettings: (settings) => apiFetch('/api/settings/auto-report', { method: 'POST', body: JSON.stringify(settings) }),
  triggerAutoReport: (type = 'pre') => apiFetch('/api/settings/auto-report/trigger', { method: 'POST', body: JSON.stringify({ type }) }),

  // 雲端同步（Supabase）
  getSyncStatus:  () => apiFetch('/api/sync/status'),
  syncPull:       () => apiFetch('/api/sync/pull'),
  syncPush:       (data) => apiFetch('/api/sync/push', { method: 'POST', body: JSON.stringify(data) }),
  syncPushWatchlist: (watchlist) => apiFetch('/api/sync/push/watchlist', { method: 'POST', body: JSON.stringify({ watchlist }) }),
  syncPushAlerts:    (alerts)    => apiFetch('/api/sync/push/alerts',    { method: 'POST', body: JSON.stringify({ alerts }) }),

  // AI 分析（SSE streaming）
  analyzePortfolio: (holdings, type, onChunk, onDone) => {
    return fetchSSE('/api/ai/portfolio', { holdings, type }, onChunk, onDone);
  },
  analyzeStock: (code, name, analysisType, onChunk, onDone) => {
    return fetchSSE('/api/ai/analyze', { code, name, analysisType }, onChunk, onDone);
  },
  analyzeMarket: (taiex, breadth, onChunk, onDone) => {
    return fetchSSE('/api/ai/market', { taiex, breadth }, onChunk, onDone);
  },
  analyzePattern: (code, name, candles, indicators, onChunk, onDone) => {
    return fetchSSE('/api/ai/pattern', { code, name, candles, indicators }, onChunk, onDone);
  },
  reviewTrade: (code, name, lot, candles, onChunk, onDone) => {
    return fetchSSE('/api/ai/review', { code, name, lot, candles }, onChunk, onDone);
  },
};

/**
 * SSE POST helper
 */
async function fetchSSE(path, body, onChunk, onDone) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') { onDone?.(); return; }
      try {
        const parsed = JSON.parse(data);
        if (parsed.text) onChunk(parsed.text);
        if (parsed.error) throw new Error(parsed.error);
      } catch {/* 忽略解析錯誤 */}
    }
  }
  onDone?.();
}
