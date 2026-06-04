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
  getHistory: (code, months = 3) => apiFetch(`/api/stocks/${code}/history?months=${months}`),

  // 警報
  getAlerts: () => apiFetch('/api/alerts'),
  addAlert: (data) => apiFetch('/api/alerts', { method: 'POST', body: JSON.stringify(data) }),
  deleteAlert: (id) => apiFetch(`/api/alerts/${id}`, { method: 'DELETE' }),
  clearTriggered: () => apiFetch('/api/alerts/triggered/clear', { method: 'DELETE' }),

  // AI 分析（SSE streaming）
  analyzeStock: (code, name, analysisType, onChunk, onDone) => {
    return fetchSSE('/api/ai/analyze', { code, name, analysisType }, onChunk, onDone);
  },
  analyzeMarket: (taiex, breadth, onChunk, onDone) => {
    return fetchSSE('/api/ai/market', { taiex, breadth }, onChunk, onDone);
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
