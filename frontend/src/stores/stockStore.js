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
  // 追蹤高點 map: { code: number }（用於動態停損計算）
  peakPrices: ls.get('peak_prices', {}),
  setQuotes: (newQuotes) => set((s) => {
    // 更新追蹤高點：若新報價高於紀錄高點則更新
    const peakPrices = { ...s.peakPrices };
    for (const [code, q] of Object.entries(newQuotes)) {
      const p = q?.price ?? 0;
      if (p > 0 && (!peakPrices[code] || p > peakPrices[code])) {
        peakPrices[code] = p;
      }
    }
    ls.set('peak_prices', peakPrices);
    return {
      quotes: { ...s.quotes, ...newQuotes },
      peakPrices,
      lastUpdated: new Date(),
    };
  }),
  // 手動重置某支股票的追蹤高點（例如換手後重新計算）
  resetPeakPrice: (code) => set((s) => {
    const peakPrices = { ...s.peakPrices };
    delete peakPrices[code];
    ls.set('peak_prices', peakPrices);
    return { peakPrices };
  }),
  lastUpdated: null,

  // 熱門股
  hotStocks: [],
  hotFilter: 'vol',
  setHotStocks: (hotStocks) => set({ hotStocks }),
  setHotFilter: (hotFilter) => set({ hotFilter }),

  // ── 投資組合 ────────────────────────────────────────
  portfolios: ls.get('portfolios', [
    { id: 'default', name: '預設組合', order: 0, builtin: true },
  ]),
  activePortfolioId: ls.get('active_portfolio', 'default'),

  addPortfolio: (name) => set((s) => {
    const id = `p_${Date.now()}`;
    const updated = [...s.portfolios, { id, name: name.trim(), order: s.portfolios.length, builtin: false }];
    ls.set('portfolios', updated);
    ls.set('active_portfolio', id);
    return { portfolios: updated, activePortfolioId: id };
  }),

  renamePortfolio: (id, name) => set((s) => {
    const updated = s.portfolios.map(p => p.id === id ? { ...p, name: name.trim() } : p);
    ls.set('portfolios', updated);
    return { portfolios: updated };
  }),

  deletePortfolio: (id) => set((s) => {
    const updated = s.portfolios.filter(p => p.id !== id);
    ls.set('portfolios', updated);
    // 移至 default
    const wl = s.watchlist.map(w => w.portfolioId === id ? { ...w, portfolioId: 'default' } : w);
    ls.set('watchlist', wl);
    const active = s.activePortfolioId === id ? 'default' : s.activePortfolioId;
    ls.set('active_portfolio', active);
    return { portfolios: updated, watchlist: wl, activePortfolioId: active };
  }),

  setActivePortfolio: (id) => set(() => {
    ls.set('active_portfolio', id);
    return { activePortfolioId: id };
  }),

  // ── 自選股分群 ──────────────────────────────────────
  // 預設群組（id 固定）+ 使用者自訂群組
  groups: ls.get('wl_groups', [
    { id: 'holdings',   name: '我的持股', order: 0, builtin: true },
    { id: 'watching',   name: '觀察中',   order: 1, builtin: true },
    { id: 'candidates', name: '候選清單', order: 2, builtin: true },
    { id: 'short',      name: '空頭觀察', order: 3, builtin: true },
  ]),

  addGroup: (name) => set((s) => {
    const id = `g_${Date.now()}`;
    const updated = [...s.groups, { id, name: name.trim(), order: s.groups.length, builtin: false }];
    ls.set('wl_groups', updated);
    return { groups: updated };
  }),

  renameGroup: (id, name) => set((s) => {
    const updated = s.groups.map(g => g.id === id ? { ...g, name: name.trim() } : g);
    ls.set('wl_groups', updated);
    return { groups: updated };
  }),

  deleteGroup: (id) => set((s) => {
    const updated = s.groups.filter(g => g.id !== id);
    ls.set('wl_groups', updated);
    // 移除此群組的股票改歸到 holdings
    const wl = s.watchlist.map(w => w.group === id ? { ...w, group: 'holdings' } : w);
    ls.set('watchlist', wl);
    return { groups: updated, watchlist: wl };
  }),

  // ── 自選股 / 持股 ───────────────────────────────────
  // 資料遷移：補上 portfolioId（向後相容）
  watchlist: ls.get('watchlist', []).map(w => w.portfolioId ? w : { ...w, portfolioId: 'default' }),

  addToWatchlist: (stock) => set((s) => {
    if (s.watchlist.find(w => w.code === stock.code)) return s;
    const portfolioId = stock.portfolioId || s.activePortfolioId || 'default';
    const updated = [...s.watchlist, { group: 'holdings', portfolioId, ...stock }];
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
    // P0-3: 部位規模計算
    totalCapital:       0,     // 總資金（元），0 = 未設定
    maxRiskPct:         2,     // 單筆最大風險比例（%）
    // P7-28: 瀏覽器推播
    browserNotifEnabled: false,
  }),

  updateSettings: (patch) => set((s) => {
    const updated = { ...s.settings, ...patch };
    ls.set('settings', updated);
    return { settings: updated };
  }),

  // ── 匯入整筆資料 ────────────────────────────────────
  importData: ({ watchlist, alerts, settings, groups }) => set((s) => {
    const newWatchlist = watchlist ?? s.watchlist;
    const newAlerts    = alerts    ?? s.alerts;
    const newSettings  = settings  ? { ...s.settings, ...settings } : s.settings;
    const newGroups    = groups    ?? s.groups;
    ls.set('watchlist',     newWatchlist);
    ls.set('alerts_local',  newAlerts);
    ls.set('settings',      newSettings);
    ls.set('wl_groups',     newGroups);
    return { watchlist: newWatchlist, alerts: newAlerts, settings: newSettings, groups: newGroups };
  }),

  // ── 工具 ────────────────────────────────────────────
  getColor: (changePercent) => {
    const { colorTheme } = get().settings;
    if (changePercent > 0) return colorTheme === 'tw' ? '#ef4444' : '#22c55e';
    if (changePercent < 0) return colorTheme === 'tw' ? '#22c55e' : '#ef4444';
    return 'var(--color-text-secondary)';
  },
}));
