import { create } from 'zustand';

export const useStockStore = create((set, get) => ({
  // WebSocket 狀態
  wsStatus: 'disconnected', // 'connecting' | 'connected' | 'disconnected'
  setWsStatus: (wsStatus) => set({ wsStatus }),

  // 大盤
  taiex: null,
  setTaiex: (taiex) => set({ taiex }),

  // 即時報價 map: { code: QuoteObject }
  quotes: {},
  setQuotes: (newQuotes) => set((s) => ({
    quotes: { ...s.quotes, ...newQuotes },
    lastUpdated: new Date(),
  })),

  // 上次更新時間
  lastUpdated: null,

  // 熱門股
  hotStocks: [],
  hotFilter: 'vol',
  setHotStocks: (hotStocks) => set({ hotStocks }),
  setHotFilter: (hotFilter) => set({ hotFilter }),

  // 自選股
  watchlist: JSON.parse(localStorage.getItem('watchlist') || '[]'),
  addToWatchlist: (stock) => set((s) => {
    if (s.watchlist.find(w => w.code === stock.code)) return s;
    const updated = [...s.watchlist, stock];
    localStorage.setItem('watchlist', JSON.stringify(updated));
    return { watchlist: updated };
  }),
  removeFromWatchlist: (code) => set((s) => {
    const updated = s.watchlist.filter(w => w.code !== code);
    localStorage.setItem('watchlist', JSON.stringify(updated));
    return { watchlist: updated };
  }),
  updateWatchlistItem: (code, patch) => set((s) => {
    const updated = s.watchlist.map(w => w.code === code ? { ...w, ...patch } : w);
    localStorage.setItem('watchlist', JSON.stringify(updated));
    return { watchlist: updated };
  }),

  // 警報
  alerts: [],
  triggerHistory: [],
  setAlerts: (alerts) => set({ alerts }),
  addTriggeredAlerts: (events) => set((s) => ({
    triggerHistory: [...events, ...s.triggerHistory].slice(0, 100),
    alerts: s.alerts.map(a => {
      const triggered = events.find(e => e.alert.id === a.id);
      return triggered ? { ...a, triggered: true } : a;
    }),
  })),

  // 設定
  settings: JSON.parse(localStorage.getItem('settings') || JSON.stringify({
    refreshInterval: 30,
    colorTheme: 'tw',    // 'tw' = 漲紅跌綠，'us' = 漲綠跌紅
    defaultStopLoss: 8,
    notifyLoss: true,
    notifyBuy: true,
    notifySell: true,
    notifyMarket: true,
  })),
  updateSettings: (patch) => set((s) => {
    const updated = { ...s.settings, ...patch };
    localStorage.setItem('settings', JSON.stringify(updated));
    return { settings: updated };
  }),

  // 工具：依設定取得漲跌顏色
  getColor: (changePercent) => {
    const { colorTheme } = get().settings;
    if (changePercent > 0) return colorTheme === 'tw' ? '#ef4444' : '#22c55e';
    if (changePercent < 0) return colorTheme === 'tw' ? '#22c55e' : '#ef4444';
    return 'var(--color-text-secondary)';
  },
}));
