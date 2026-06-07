import { create } from 'zustand';

// ── localStorage helpers ──────────────────────────────
const ls = {
  get: (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
};

// ── 快照管理（最多保留 10 筆）──────────────────────────
const SNAPSHOT_KEY = 'data_snapshots';
const MAX_SNAPSHOTS = 10;

export function saveSnapshot(label, data) {
  const snapshots = ls.get(SNAPSHOT_KEY, []);
  const entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    label: label || '手動備份',
    watchlistCount: data.watchlist?.length ?? 0,
    alertsCount:    data.alerts?.length    ?? 0,
    data,
  };
  const updated = [entry, ...snapshots].slice(0, MAX_SNAPSHOTS);
  ls.set(SNAPSHOT_KEY, updated);
  return entry;
}

export function getSnapshots() {
  return ls.get(SNAPSHOT_KEY, []);
}

export function deleteSnapshot(id) {
  const updated = ls.get(SNAPSHOT_KEY, []).filter(s => s.id !== id);
  ls.set(SNAPSHOT_KEY, updated);
}

// ── 主 Store ─────────────────────────────────────────
export const useStockStore = create((set, get) => ({
  // WebSocket 狀態
  wsStatus: 'disconnected',
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
  lastUpdated: null,

  // 熱門股
  hotStocks: [],
  hotFilter: 'vol',
  setHotStocks: (hotStocks) => set({ hotStocks }),
  setHotFilter: (hotFilter) => set({ hotFilter }),

  // ── 自選股 / 持股 ───────────────────────────────────
  watchlist: ls.get('watchlist', []),

  addToWatchlist: (stock) => set((s) => {
    if (s.watchlist.find(w => w.code === stock.code)) return s;
    const updated = [...s.watchlist, stock];
    ls.set('watchlist', updated);
    return { watchlist: updated };
  }),

  removeFromWatchlist: (code) => set((s) => {
    const updated = s.watchlist.filter(w => w.code !== code);
    ls.set('watchlist', updated);
    return { watchlist: updated };
  }),

  updateWatchlistItem: (code, patch) => set((s) => {
    const updated = s.watchlist.map(w => w.code === code ? { ...w, ...patch } : w);
    ls.set('watchlist', updated);
    return { watchlist: updated };
  }),

  replaceWatchlist: (newList) => set(() => {
    ls.set('watchlist', newList);
    return { watchlist: newList };
  }),

  // ── Lot（買入記錄）管理 ────────────────────────────
  addLot: (code, lot) => set((s) => {
    const updated = s.watchlist.map(w => {
      if (w.code !== code) return w;
      const lots = w.lots ?? [];
      return { ...w, lots: [...lots, { id: `lot_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, ...lot }] };
    });
    ls.set('watchlist', updated);
    return { watchlist: updated };
  }),

  updateLot: (code, lotId, patch) => set((s) => {
    const updated = s.watchlist.map(w => {
      if (w.code !== code) return w;
      return { ...w, lots: (w.lots ?? []).map(l => l.id === lotId ? { ...l, ...patch } : l) };
    });
    ls.set('watchlist', updated);
    return { watchlist: updated };
  }),

  removeLot: (code, lotId) => set((s) => {
    const updated = s.watchlist.map(w => {
      if (w.code !== code) return w;
      return { ...w, lots: (w.lots ?? []).filter(l => l.id !== lotId) };
    });
    ls.set('watchlist', updated);
    return { watchlist: updated };
  }),

  // ── 警報（localStorage 持久化）──────────────────────
  // 初始從 localStorage 載入，同時也會從後端同步覆寫
  alerts: ls.get('alerts_local', []),
  triggerHistory: ls.get('trigger_history', []),

  setAlerts: (alerts) => set(() => {
    ls.set('alerts_local', alerts);
    return { alerts };
  }),

  addTriggeredAlerts: (events) => set((s) => {
    const history = [...events, ...s.triggerHistory].slice(0, 100);
    const alerts  = s.alerts.map(a => {
      const triggered = events.find(e => e.alert.id === a.id);
      return triggered ? { ...a, triggered: true } : a;
    });
    ls.set('trigger_history', history);
    ls.set('alerts_local', alerts);
    return { triggerHistory: history, alerts };
  }),

  // ── 設定 ────────────────────────────────────────────
  settings: ls.get('settings', {
    refreshInterval: 30,
    colorTheme:      'tw',
    defaultStopLoss: 8,
    notifyLoss:      true,
    notifyBuy:       true,
    notifySell:      true,
    notifyMarket:    true,
  }),

  updateSettings: (patch) => set((s) => {
    const updated = { ...s.settings, ...patch };
    ls.set('settings', updated);
    return { settings: updated };
  }),

  // ── 匯入整筆資料 ────────────────────────────────────
  importData: ({ watchlist, alerts, settings }) => set((s) => {
    const newWatchlist = watchlist ?? s.watchlist;
    const newAlerts    = alerts    ?? s.alerts;
    const newSettings  = settings  ? { ...s.settings, ...settings } : s.settings;
    ls.set('watchlist',     newWatchlist);
    ls.set('alerts_local',  newAlerts);
    ls.set('settings',      newSettings);
    return { watchlist: newWatchlist, alerts: newAlerts, settings: newSettings };
  }),

  // ── 工具 ────────────────────────────────────────────
  getColor: (changePercent) => {
    const { colorTheme } = get().settings;
    if (changePercent > 0) return colorTheme === 'tw' ? '#ef4444' : '#22c55e';
    if (changePercent < 0) return colorTheme === 'tw' ? '#22c55e' : '#ef4444';
    return 'var(--color-text-secondary)';
  },
}));
