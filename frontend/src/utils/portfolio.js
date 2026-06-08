/**
 * portfolio.js — 持股計算工具
 *
 * 純函式，無副作用，不依賴任何 React / store / UI。
 * 遵循高內聚低耦合原則：所有「持股計算」邏輯集中於此，
 * Watchlist.jsx / Dashboard.jsx 等 UI 元件僅 import 需要的函式。
 *
 * 資料結構
 *   WatchlistItem : { code, name, strategy, target, stopLoss, notes, lots[] }
 *   Lot           : { id, date, shares, oddLotShares, cost, note }
 *
 * 股數換算
 *   整張 (shares)     × 1000 股
 *   零股 (oddLotShares)  × 1 股
 */

// ── 向下相容：舊格式 (cost/shares) → lots[] ────────────────
/**
 * 將舊格式 WatchlistItem 補齊 lots 陣列。
 * 若已有 lots[] 則原樣回傳，否則從 cost/shares/oddLotShares 產生一筆。
 * @param {object} item
 * @returns {Lot[]}
 */
export function migrateLots(item) {
  if (Array.isArray(item.lots) && item.lots.length > 0) return item.lots;
  if (item.cost || item.shares || item.oddLotShares) {
    return [{
      id:           `legacy_${item.code}`,
      date:         '',
      shares:       item.shares       ?? 0,
      oddLotShares: item.oddLotShares ?? 0,
      cost:         item.cost         ?? 0,
      note:         '（由舊版自動轉入）',
    }];
  }
  return [];
}

// ── 單筆 Lot 基本計算 ─────────────────────────────────────

/**
 * 一筆買入記錄的實際股數。
 * @param {Lot} lot
 * @returns {number} 股數（整數）
 */
export function lotShares(lot) {
  return (lot.shares ?? 0) * 1000 + (lot.oddLotShares ?? 0);
}

/**
 * 一筆買入記錄的總成本（元）。
 * @param {Lot} lot
 * @returns {number}
 */
export function lotCostTotal(lot) {
  return lot.cost * lotShares(lot);
}

/**
 * 一筆買入記錄的市值（元）。
 * @param {Lot} lot
 * @param {number} price 現價
 * @returns {number}
 */
export function lotMktVal(lot, price) {
  return price * lotShares(lot);
}

/**
 * 一筆買入記錄的損益金額（元）。
 * @param {Lot} lot
 * @param {number} price 現價
 * @returns {number}
 */
export function lotPnlAmt(lot, price) {
  return (price - lot.cost) * lotShares(lot);
}

/**
 * 一筆買入記錄的損益百分比。
 * cost=0 時回傳 0（防除以零）。
 * @param {Lot} lot
 * @param {number} price 現價
 * @returns {number}
 */
export function lotPnlPct(lot, price) {
  return lot.cost ? (price / lot.cost - 1) * 100 : 0;
}

// ── 個股整體統計 ──────────────────────────────────────────

/**
 * 計算一檔股票所有買入記錄的加總統計。
 *
 * price = 0 代表「尚無報價」，此時 pnlAmt / pnlPct 回傳 null，
 * 避免顯示錯誤的 -100%。
 *
 * @param {WatchlistItem} item
 * @param {number} price 現價（0 表示無報價）
 * @returns {{ lots, totalShares, totalCost, avgCost, mktVal, pnlAmt, pnlPct }}
 */
export function calcPortfolio(item, price) {
  const lots        = migrateLots(item);
  const totalShares = lots.reduce((s, l) => s + lotShares(l), 0);
  const totalCost   = lots.reduce((s, l) => s + lotCostTotal(l), 0);
  const avgCost     = totalShares > 0 ? totalCost / totalShares : 0;
  const hasPrice    = price > 0;
  const mktVal      = hasPrice ? price * totalShares : 0;
  const pnlAmt      = (hasPrice && totalCost > 0) ? mktVal - totalCost : null;
  const pnlPct      = (hasPrice && totalCost > 0) ? (mktVal / totalCost - 1) * 100 : null;
  return { lots, totalShares, totalCost, avgCost, mktVal, pnlAmt, pnlPct };
}

// ── 投資組合整體統計 ──────────────────────────────────────

/**
 * 計算所有自選股的投資組合整體統計。
 *
 * @param {WatchlistItem[]} watchlist
 * @param {object} quotes  { [code]: { price } }
 * @returns {{ totalMkt, totalCost, totalPnlAmt, totalPnlPct, rows }}
 */
export function calcTotalPortfolio(watchlist, quotes) {
  const rows = watchlist.map(w => {
    const price = quotes[w.code]?.price ?? 0;
    return { ...w, ...calcPortfolio(w, price), price };
  });
  const totalMkt    = rows.reduce((s, r) => s + r.mktVal,    0);
  const totalCost   = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalPnlAmt = (totalMkt && totalCost) ? totalMkt - totalCost : null;
  const totalPnlPct = (totalMkt && totalCost) ? (totalMkt / totalCost - 1) * 100 : null;
  return { rows, totalMkt, totalCost, totalPnlAmt, totalPnlPct };
}

// ── 格式化工具 ────────────────────────────────────────────

/**
 * 格式化百分比，帶正號。例：+12.34%、-3.00%、—
 * @param {number|null} n
 * @param {boolean} sign 是否補正號（預設 true）
 * @returns {string}
 */
export function fmtPct(n, sign = true) {
  return n == null ? '—' : `${sign && n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/**
 * 格式化金額，帶正號與千分位。例：+12,345、-1,000
 * @param {number|null} n
 * @returns {string}
 */
export function fmtAmt(n) {
  return n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString()}`;
}

/**
 * 格式化持股數量顯示。例：2張+300股、500股、—
 * @param {number} shares 整張數
 * @param {number} oddLot 零股數
 * @returns {string}
 */
export function fmtShares(shares, oddLot) {
  const l = parseInt(shares) || 0;
  const o = parseInt(oddLot)  || 0;
  if (!l && !o) return '—';
  return [l && `${l}張`, o && `${o}股`].filter(Boolean).join('+');
}
