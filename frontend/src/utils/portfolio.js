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

// ── P0-1: 動態停損計算 ───────────────────────────────────

/**
 * 計算動態停損觸發價。
 * @param {number} peakPrice  追蹤高點
 * @param {number} trailingPct  回檔觸發百分比（例如 8 代表 8%）
 * @returns {number}
 */
export function calcTrailingStopPrice(peakPrice, trailingPct) {
  return peakPrice * (1 - trailingPct / 100);
}

/**
 * 檢查動態停損是否觸發。
 * @param {number} currentPrice
 * @param {number} peakPrice
 * @param {number} trailingPct
 * @returns {boolean}
 */
export function isTrailingStopTriggered(currentPrice, peakPrice, trailingPct) {
  if (!peakPrice || !trailingPct) return false;
  return currentPrice <= calcTrailingStopPrice(peakPrice, trailingPct);
}

// ── P0-2: 風險/報酬比 ────────────────────────────────────

/**
 * 計算風險報酬比（Risk/Reward Ratio）。
 * @param {number} cost      成本（進場價）
 * @param {number} target    目標價
 * @param {number} stopLoss  停損價
 * @returns {{ rr: number, reward: number, risk: number } | null}
 */
export function calcRR(cost, target, stopLoss) {
  if (!cost || !target || !stopLoss || cost <= 0) return null;
  const reward = target - cost;
  const risk   = cost - stopLoss;
  if (risk <= 0) return null;
  return {
    rr:     +(reward / risk).toFixed(2),
    reward: +reward.toFixed(2),
    risk:   +risk.toFixed(2),
  };
}

// ── P0-3: 部位規模計算 ───────────────────────────────────

/**
 * 計算建議買入股數（固定風險比例法）。
 * @param {number} capital    總資金（元）
 * @param {number} riskPct    單筆最大風險比例（例如 2 代表 2%）
 * @param {number} price      股價
 * @param {number} stopLoss   停損價
 * @returns {{ shares: number, lots: number, maxLoss: number } | null}
 */
export function calcPositionSize(capital, riskPct, price, stopLoss) {
  if (!capital || !riskPct || !price || !stopLoss || price <= stopLoss) return null;
  const maxLoss   = capital * (riskPct / 100);
  const riskPerSh = price - stopLoss;
  const shares    = Math.floor(maxLoss / riskPerSh);
  const lots      = Math.floor(shares / 1000);
  return { shares, lots, maxLoss: +maxLoss.toFixed(0) };
}

// ── P1-4: 布林通道 ───────────────────────────────────────

/**
 * 計算布林通道（Bollinger Bands）。
 * @param {{ time, close }[]} candles
 * @param {number} period    MA 週期（預設 20）
 * @param {number} mult      標準差倍數（預設 2）
 * @returns {{ time, upper, mid, lower, bandwidth }[]}
 */
export function calcBollingerBands(candles, period = 20, mult = 2) {
  return candles.map((c, i) => {
    if (i < period - 1) return null;
    const slice = candles.slice(i - period + 1, i + 1).map(x => x.close);
    const mean  = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd    = Math.sqrt(variance);
    const upper = +(mean + mult * sd).toFixed(2);
    const lower = +(mean - mult * sd).toFixed(2);
    const mid   = +mean.toFixed(2);
    return { time: c.time, upper, mid, lower, bandwidth: +((upper - lower) / mid * 100).toFixed(2) };
  }).filter(Boolean);
}

// ── P1-5: 成交量均線 ─────────────────────────────────────

/**
 * 計算成交量移動平均。
 * @param {{ time, volume }[]} candles
 * @param {number} period
 * @returns {{ time, value }[]}
 */
export function calcVolumeMA(candles, period) {
  return candles.map((c, i) => {
    if (i < period - 1) return null;
    const avg = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.volume, 0) / period;
    return { time: c.time, value: +avg.toFixed(0) };
  }).filter(Boolean);
}

/**
 * 計算量比（今日量 / 近 N 日均量）。
 * @param {{ volume }[]} candles
 * @param {number} period
 * @returns {number | null}
 */
export function calcVolumeRatio(candles, period = 5) {
  if (candles.length < period + 1) return null;
  const todayVol = candles[candles.length - 1].volume;
  const avgVol   = candles.slice(-period - 1, -1).reduce((s, c) => s + c.volume, 0) / period;
  return avgVol > 0 ? +(todayVol / avgVol).toFixed(2) : null;
}

// ── P1-6: 多週期聚合 ─────────────────────────────────────

/**
 * 將日K蠟燭聚合為週K或月K。
 * @param {{ time, open, high, low, close, volume }[]} candles  日K（time 為 Unix 秒）
 * @param {'weekly' | 'monthly'} period
 * @returns {{ time, open, high, low, close, volume }[]}
 */
export function aggregateCandles(candles, period) {
  if (!candles.length) return [];
  const getKey = (ts) => {
    const d = new Date(ts * 1000);
    if (period === 'weekly') {
      // 以週一為起點的週序號
      const day = d.getDay() || 7; // 0=Sun → 7
      const mon = new Date(d);
      mon.setDate(d.getDate() - day + 1);
      return `${mon.getFullYear()}-W${String(Math.ceil((mon.getDate()) / 7)).padStart(2,'0')}-${mon.getMonth()}`;
    }
    // monthly
    return `${d.getFullYear()}-${d.getMonth()}`;
  };

  const groups = new Map();
  const order  = [];

  for (const c of candles) {
    const key = getKey(c.time);
    if (!groups.has(key)) {
      groups.set(key, { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
      order.push(key);
    } else {
      const g = groups.get(key);
      g.high   = Math.max(g.high, c.high);
      g.low    = Math.min(g.low,  c.low);
      g.close  = c.close;  // 最後一個交易日收盤
      g.volume += c.volume;
    }
  }

  return order.map(k => groups.get(k));
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

// ── P2-10: 個股籌碼評分系統 ─────────────────────────────

/**
 * 計算個股籌碼評分（0～100 分）。
 *
 * 各項配分：
 *   外資連續買超天數  × 5  （上限 25 分）
 *   投信連續買超天數  × 3  （上限 15 分）
 *   自營商連續買超天數 × 2 （上限 10 分）
 *   融資餘額連續減少天數 × 3（上限 15 分，代表籌碼乾淨）
 *   融券連續增加天數  × 2  （上限 10 分，代表軋空潛力）
 *   法人合計買超佔比  × 25 （上限 25 分，按比例映射）
 *
 * @param {Array<{time:number, fiNet:number, itNet:number, dealerNet:number, totalNet:number}>} instData
 * @param {Array<{time:number, marginBal:number, shortBal:number}>} marginData
 * @returns {{ score: number, detail: object } | null}
 */
export function calcChipScore(instData, marginData) {
  if (!instData || instData.length === 0) return null;

  // 確保依 time 升冪排序
  const inst = [...instData].sort((a, b) => a.time - b.time);
  const latest = inst[inst.length - 1];

  // ── 1. 外資連續買超天數 × 5（上限 25）────────────────
  let fiBuyDays = 0;
  for (let i = inst.length - 1; i >= 0; i--) {
    if ((inst[i].fiNet ?? 0) > 0) fiBuyDays++;
    else break;
  }
  const fiScore = Math.min(fiBuyDays * 5, 25);

  // ── 2. 投信連續買超天數 × 3（上限 15）────────────────
  let itBuyDays = 0;
  for (let i = inst.length - 1; i >= 0; i--) {
    if ((inst[i].itNet ?? 0) > 0) itBuyDays++;
    else break;
  }
  const itScore = Math.min(itBuyDays * 3, 15);

  // ── 3. 自營商連續買超天數 × 2（上限 10）──────────────
  let dlBuyDays = 0;
  for (let i = inst.length - 1; i >= 0; i--) {
    if ((inst[i].dealerNet ?? 0) > 0) dlBuyDays++;
    else break;
  }
  const dlScore = Math.min(dlBuyDays * 2, 10);

  // ── 4. 融資餘額連續減少天數 × 3（上限 15）────────────
  let marginDecrDays = 0;
  if (marginData && marginData.length >= 2) {
    const marg = [...marginData].sort((a, b) => a.time - b.time);
    for (let i = marg.length - 1; i >= 1; i--) {
      if ((marg[i].marginBal ?? 0) < (marg[i - 1].marginBal ?? 0)) marginDecrDays++;
      else break;
    }
  }
  const marginScore = Math.min(marginDecrDays * 3, 15);

  // ── 5. 融券連續增加天數 × 2（上限 10）────────────────
  let shortIncrDays = 0;
  if (marginData && marginData.length >= 2) {
    const marg = [...marginData].sort((a, b) => a.time - b.time);
    for (let i = marg.length - 1; i >= 1; i--) {
      if ((marg[i].shortBal ?? 0) > (marg[i - 1].shortBal ?? 0)) shortIncrDays++;
      else break;
    }
  }
  const shortScore = Math.min(shortIncrDays * 2, 10);

  // ── 6. 法人合計買超佔比（上限 25）────────────────────
  // totalNet 單位：張；用最新日資料
  // 以 totalNet 佔近 5 日平均成交量的比例映射，比例每 1% 對應 5 分，上限 25
  const totalNet = latest.totalNet ?? ((latest.fiNet ?? 0) + (latest.itNet ?? 0) + (latest.dealerNet ?? 0));
  // 取近 5 日 totalNet 中位數作為基準（若只有 1 筆則直接用）
  const recent5 = inst.slice(-5).map(r => Math.abs(r.totalNet ?? 0));
  const vol5avg  = recent5.reduce((s, v) => s + v, 0) / (recent5.length || 1);
  // 比例：totalNet / vol5avg，正值代表買超，每 20% 給 5 分
  const netRatio  = vol5avg > 0 ? (totalNet / vol5avg) : 0;
  const netScore  = Math.min(Math.max(Math.round(netRatio * 25), 0), 25);

  const score = fiScore + itScore + dlScore + marginScore + shortScore + netScore;

  return {
    score: Math.min(Math.round(score), 100),
    detail: {
      fi:     { days: fiBuyDays,     score: fiScore,     label: '外資連買' },
      it:     { days: itBuyDays,     score: itScore,     label: '投信連買' },
      dealer: { days: dlBuyDays,     score: dlScore,     label: '自營連買' },
      margin: { days: marginDecrDays, score: marginScore, label: '融資減少' },
      short:  { days: shortIncrDays, score: shortScore,  label: '融券增加' },
      net:    { ratio: +netRatio.toFixed(2), score: netScore, label: '法人佔比' },
    },
  };
}

// ── P3-12/P3-13: 交易日誌 & 績效統計 ────────────────────

/**
 * 計算已出場 Lot 的實現損益、持有天數、年化報酬率。
 * @param {object} lot - 含 exitPrice, exitDate, date, cost, shares, oddLotShares
 * @returns {{ pnlAmt: number, pnlPct: number, holdDays: number, annualReturn: number } | null}
 */
export function calcExitedLot(lot) {
  const { exitPrice, exitDate, date, cost, shares, oddLotShares } = lot;
  if (!exitPrice || !cost || exitPrice <= 0 || cost <= 0) return null;

  const totalShares = (parseInt(shares) || 0) * 1000 + (parseInt(oddLotShares) || 0);
  if (totalShares <= 0) return null;

  const pnlAmt    = (exitPrice - cost) * totalShares;
  const pnlPct    = (exitPrice / cost - 1) * 100;
  const entryMs   = new Date(date).getTime();
  const exitMs    = new Date(exitDate || date).getTime();
  const holdDays  = Math.max(Math.round((exitMs - entryMs) / 86400000), 1);
  const annualReturn = (Math.pow(1 + pnlPct / 100, 365 / holdDays) - 1) * 100;

  return {
    pnlAmt:       +pnlAmt.toFixed(0),
    pnlPct:       +pnlPct.toFixed(2),
    holdDays,
    annualReturn: +annualReturn.toFixed(1),
  };
}

/**
 * 收集 watchlist 中所有已出場（含 exitPrice）的 lot。
 * @param {WatchlistItem[]} watchlist
 * @returns {Array<{ lot: object, code: string, name: string, strategy: string }>}
 */
export function getExitedEntries(watchlist) {
  const arr = [];
  for (const item of watchlist) {
    for (const lot of item.lots || []) {
      if (lot.exitPrice) arr.push({ lot, code: item.code, name: item.name, strategy: item.strategy });
    }
  }
  return arr;
}

/**
 * 從所有已出場 Lot 計算績效統計。
 * @param {Array<{ lot: object, code: string, name: string, strategy: string }>} exitedEntries
 * @returns {object} 績效統計
 */
export function calcPerformance(exitedEntries) {
  if (!exitedEntries || exitedEntries.length === 0) return null;

  const results = exitedEntries
    .map(({ lot, code, name, strategy }) => {
      const r = calcExitedLot(lot);
      if (!r) return null;
      return { ...r, code, name, strategy, exitDate: lot.exitDate || lot.date };
    })
    .filter(Boolean);

  if (results.length === 0) return null;

  const wins   = results.filter(r => r.pnlPct > 0);
  const losses = results.filter(r => r.pnlPct <= 0);

  const totalTrades  = results.length;
  const winCount     = wins.length;
  const winRate      = +(winCount / totalTrades * 100).toFixed(1);
  const avgWin       = wins.length   ? +(wins.reduce((s, r)   => s + r.pnlPct, 0) / wins.length).toFixed(2)   : 0;
  const avgLoss      = losses.length ? +(losses.reduce((s, r) => s + r.pnlPct, 0) / losses.length).toFixed(2) : 0;
  const profitFactor = avgLoss < 0   ? +Math.abs(avgWin * wins.length / (avgLoss * losses.length)).toFixed(2) : null;
  const expectancy   = +(winRate / 100 * avgWin + (1 - winRate / 100) * avgLoss).toFixed(2);

  // 最大連勝/連敗
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  results.sort((a, b) => (a.exitDate || '').localeCompare(b.exitDate || ''));
  for (const r of results) {
    if (r.pnlPct > 0) { curWin++; curLoss = 0; maxWinStreak  = Math.max(maxWinStreak,  curWin);  }
    else              { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
  }

  // 最大單筆
  const maxWinTrade  = results.reduce((m, r) => r.pnlAmt > (m?.pnlAmt ?? -Infinity) ? r : m, null);
  const maxLossTrade = results.reduce((m, r) => r.pnlAmt < (m?.pnlAmt ?? Infinity)  ? r : m, null);

  // 月度損益（按出場月份）
  const monthlyMap = {};
  for (const r of results) {
    const month = (r.exitDate || '').slice(0, 7); // YYYY-MM
    if (!month) continue;
    monthlyMap[month] = (monthlyMap[month] || 0) + r.pnlAmt;
  }
  const monthly = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnlAmt]) => ({ month, pnlAmt: +pnlAmt.toFixed(0) }));

  // 個股勝率
  const byCode = {};
  for (const r of results) {
    if (!byCode[r.code]) byCode[r.code] = { code: r.code, name: r.name, wins: 0, total: 0 };
    byCode[r.code].total++;
    if (r.pnlPct > 0) byCode[r.code].wins++;
  }
  const stockWinRate = Object.values(byCode)
    .map(s => ({ ...s, winRate: +(s.wins / s.total * 100).toFixed(0) }))
    .sort((a, b) => b.winRate - a.winRate);

  // 策略勝率
  const byStrategy = {};
  for (const r of results) {
    const s = r.strategy || 'unknown';
    if (!byStrategy[s]) byStrategy[s] = { strategy: s, wins: 0, total: 0 };
    byStrategy[s].total++;
    if (r.pnlPct > 0) byStrategy[s].wins++;
  }
  const strategyWinRate = Object.values(byStrategy)
    .map(s => ({ ...s, winRate: +(s.wins / s.total * 100).toFixed(0) }));

  // 資金曲線（累積損益金額）
  let cumulative = 0;
  const equityCurve = results.map(r => {
    cumulative += r.pnlAmt;
    return { date: r.exitDate, pnlAmt: r.pnlAmt, cumulative: +cumulative.toFixed(0) };
  });

  return {
    totalTrades, winCount, winRate,
    avgWin, avgLoss, profitFactor, expectancy,
    maxWinStreak, maxLossStreak,
    maxWinTrade, maxLossTrade,
    monthly, stockWinRate, strategyWinRate, equityCurve,
    results,
  };
}
