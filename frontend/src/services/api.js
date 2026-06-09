const BASE_URL = import.meta.env.VITE_API_URL || '';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
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
  getStockValuation: (code)   => apiFetch(`/api/stocks/${code}/valuation`),

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
