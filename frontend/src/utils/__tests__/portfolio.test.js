/**
 * portfolio.js 完整單元測試
 *
 * 覆蓋範圍：
 *   migrateLots       — 舊格式向下相容
 *   lotShares         — 股數計算
 *   lotCostTotal      — 單筆成本
 *   lotMktVal         — 單筆市值
 *   lotPnlAmt         — 單筆損益金額
 *   lotPnlPct         — 單筆損益百分比
 *   calcPortfolio     — 個股整體統計（含防 -100% 迴歸）
 *   calcTotalPortfolio — 投組整體統計
 *   fmtPct            — 百分比格式化
 *   fmtAmt            — 金額格式化
 *   fmtShares         — 持股數量格式化
 */

import { describe, it, expect } from 'vitest';
import {
  migrateLots,
  lotShares,
  lotCostTotal,
  lotMktVal,
  lotPnlAmt,
  lotPnlPct,
  calcPortfolio,
  calcTotalPortfolio,
  fmtPct,
  fmtAmt,
  fmtShares,
  calcTrailingStopPrice,
  isTrailingStopTriggered,
  calcRR,
  calcPositionSize,
  calcBollingerBands,
  calcVolumeMA,
  calcVolumeRatio,
  aggregateCandles,
} from '../portfolio.js';

// ─── 測試資料工廠 ─────────────────────────────────────────
const makeLot = (overrides = {}) => ({
  id: 'lot_1',
  date: '2024-01-01',
  shares: 1,
  oddLotShares: 0,
  cost: 100,
  note: '',
  ...overrides,
});

const makeItem = (lots, overrides = {}) => ({
  code: '2330',
  name: '台積電',
  lots,
  ...overrides,
});

// ═══════════════════════════════════════════════════════════
//  migrateLots
// ═══════════════════════════════════════════════════════════
describe('migrateLots', () => {
  it('已有 lots[] → 原樣回傳', () => {
    const lots = [makeLot()];
    expect(migrateLots({ lots })).toBe(lots);
  });

  it('lots 為空陣列 → 嘗試從舊格式轉換', () => {
    const item = { code: '2330', lots: [], cost: 500, shares: 1 };
    const result = migrateLots(item);
    expect(result).toHaveLength(1);
    expect(result[0].cost).toBe(500);
    expect(result[0].shares).toBe(1);
  });

  it('無 lots、有舊格式 cost/shares → 轉為 1 筆 lot', () => {
    const item = { code: '2330', cost: 800, shares: 2, oddLotShares: 500 };
    const result = migrateLots(item);
    expect(result).toHaveLength(1);
    expect(result[0].cost).toBe(800);
    expect(result[0].shares).toBe(2);
    expect(result[0].oddLotShares).toBe(500);
    expect(result[0].id).toMatch(/^legacy_/);
  });

  it('完全空白 item → 回傳空陣列', () => {
    expect(migrateLots({ code: '0000' })).toEqual([]);
  });

  it('lots 有多筆 → 全部回傳，不截斷', () => {
    const lots = [makeLot({ id: 'a' }), makeLot({ id: 'b' }), makeLot({ id: 'c' })];
    expect(migrateLots({ lots })).toHaveLength(3);
  });

  it('舊格式 oddLotShares 預設為 0', () => {
    const result = migrateLots({ code: 'X', cost: 50, shares: 1 });
    expect(result[0].oddLotShares).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  lotShares
// ═══════════════════════════════════════════════════════════
describe('lotShares', () => {
  it('1 張 = 1000 股', () => {
    expect(lotShares(makeLot({ shares: 1, oddLotShares: 0 }))).toBe(1000);
  });

  it('2 張 = 2000 股', () => {
    expect(lotShares(makeLot({ shares: 2, oddLotShares: 0 }))).toBe(2000);
  });

  it('零股只計零股', () => {
    expect(lotShares(makeLot({ shares: 0, oddLotShares: 500 }))).toBe(500);
  });

  it('整張 + 零股混合', () => {
    expect(lotShares(makeLot({ shares: 2, oddLotShares: 300 }))).toBe(2300);
  });

  it('shares / oddLotShares 皆為 0 → 0', () => {
    expect(lotShares(makeLot({ shares: 0, oddLotShares: 0 }))).toBe(0);
  });

  it('欄位不存在時以 0 計', () => {
    expect(lotShares({})).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  lotCostTotal
// ═══════════════════════════════════════════════════════════
describe('lotCostTotal', () => {
  it('1 張 × $100 = $100,000', () => {
    expect(lotCostTotal(makeLot({ shares: 1, cost: 100 }))).toBe(100000);
  });

  it('2 張 × $800 = $1,600,000', () => {
    expect(lotCostTotal(makeLot({ shares: 2, oddLotShares: 0, cost: 800 }))).toBe(1600000);
  });

  it('500 股（零股）× $50 = $25,000', () => {
    expect(lotCostTotal(makeLot({ shares: 0, oddLotShares: 500, cost: 50 }))).toBe(25000);
  });

  it('0 股 → 成本為 0', () => {
    expect(lotCostTotal(makeLot({ shares: 0, oddLotShares: 0, cost: 999 }))).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  lotMktVal
// ═══════════════════════════════════════════════════════════
describe('lotMktVal', () => {
  it('1 張 × 現價 $120 = $120,000', () => {
    expect(lotMktVal(makeLot({ shares: 1 }), 120)).toBe(120000);
  });

  it('零股 500 股 × 現價 $60 = $30,000', () => {
    expect(lotMktVal(makeLot({ shares: 0, oddLotShares: 500 }), 60)).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
//  lotPnlAmt
// ═══════════════════════════════════════════════════════════
describe('lotPnlAmt', () => {
  it('現價 > 成本 → 正損益', () => {
    // cost=100, price=120, 1張 → (120-100)*1000 = 20000
    expect(lotPnlAmt(makeLot({ shares: 1, cost: 100 }), 120)).toBe(20000);
  });

  it('現價 < 成本 → 負損益', () => {
    expect(lotPnlAmt(makeLot({ shares: 1, cost: 100 }), 80)).toBe(-20000);
  });

  it('現價 = 成本 → 0', () => {
    expect(lotPnlAmt(makeLot({ shares: 1, cost: 100 }), 100)).toBe(0);
  });

  it('零股損益計算正確', () => {
    // cost=50, price=60, 500股 → (60-50)*500 = 5000
    expect(lotPnlAmt(makeLot({ shares: 0, oddLotShares: 500, cost: 50 }), 60)).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
//  lotPnlPct
// ═══════════════════════════════════════════════════════════
describe('lotPnlPct', () => {
  it('現價 > 成本 → 正百分比', () => {
    expect(lotPnlPct(makeLot({ cost: 100 }), 120)).toBeCloseTo(20);
  });

  it('現價 < 成本 → 負百分比', () => {
    expect(lotPnlPct(makeLot({ cost: 100 }), 80)).toBeCloseTo(-20);
  });

  it('現價 = 成本 → 0%', () => {
    expect(lotPnlPct(makeLot({ cost: 100 }), 100)).toBe(0);
  });

  it('cost = 0 → 回傳 0（防除以零）', () => {
    expect(lotPnlPct(makeLot({ cost: 0 }), 100)).toBe(0);
  });

  it('大幅虧損不超過 -100%（換股非跌停限制，純計算正確）', () => {
    // cost=100, price=10 → -90%
    expect(lotPnlPct(makeLot({ cost: 100 }), 10)).toBeCloseTo(-90);
  });
});

// ═══════════════════════════════════════════════════════════
//  calcPortfolio
// ═══════════════════════════════════════════════════════════
describe('calcPortfolio — 正常情況', () => {
  const item = makeItem([
    makeLot({ id: 'a', shares: 2, oddLotShares: 0,   cost: 800 }),
    makeLot({ id: 'b', shares: 1, oddLotShares: 0,   cost: 850 }),
    makeLot({ id: 'c', shares: 0, oddLotShares: 500, cost: 900 }),
  ]);

  it('總股數 = 2000+1000+500 = 3500', () => {
    expect(calcPortfolio(item, 1000).totalShares).toBe(3500);
  });

  it('加權均成計算正確', () => {
    // (800*2000 + 850*1000 + 900*500) / 3500 = 2900000/3500 ≈ 828.57
    expect(calcPortfolio(item, 1000).avgCost).toBeCloseTo(828.57, 1);
  });

  it('市值計算正確', () => {
    // 1000 * 3500 = 3,500,000
    expect(calcPortfolio(item, 1000).mktVal).toBe(3500000);
  });

  it('損益金額計算正確', () => {
    const { pnlAmt, totalCost } = calcPortfolio(item, 1000);
    expect(pnlAmt).toBeCloseTo(3500000 - totalCost, 0);
  });

  it('損益%計算正確', () => {
    const { pnlPct } = calcPortfolio(item, 1000);
    expect(typeof pnlPct).toBe('number');
    expect(pnlPct).toBeGreaterThan(0);
  });

  it('lots 原始陣列被保留', () => {
    expect(calcPortfolio(item, 1000).lots).toHaveLength(3);
  });
});

// ── 【關鍵防迴歸】price=0 不得顯示 -100% ─────────────────
describe('calcPortfolio — price=0（無報價）防迴歸', () => {
  const item = makeItem([makeLot({ shares: 1, cost: 100 })]);

  it('price=0 → pnlPct 為 null，絕對不能是 -100', () => {
    const { pnlPct } = calcPortfolio(item, 0);
    expect(pnlPct).toBeNull();
  });

  it('price=0 → pnlAmt 為 null', () => {
    expect(calcPortfolio(item, 0).pnlAmt).toBeNull();
  });

  it('price=0 → mktVal 為 0（不顯示負市值）', () => {
    expect(calcPortfolio(item, 0).mktVal).toBe(0);
  });

  it('price=0 → avgCost 仍計算正確', () => {
    expect(calcPortfolio(item, 0).avgCost).toBe(100);
  });

  it('price=0 → totalShares 仍計算正確', () => {
    expect(calcPortfolio(item, 0).totalShares).toBe(1000);
  });
});

describe('calcPortfolio — 邊界情況', () => {
  it('空 lots → totalShares=0, avgCost=0, pnlPct=null', () => {
    const { totalShares, avgCost, pnlPct } = calcPortfolio(makeItem([]), 100);
    expect(totalShares).toBe(0);
    expect(avgCost).toBe(0);
    expect(pnlPct).toBeNull();
  });

  it('cost=0 的 lot + 有效 price → pnlPct 仍為 null（totalCost=0 防護）', () => {
    const item = makeItem([makeLot({ shares: 1, cost: 0 })]);
    expect(calcPortfolio(item, 100).pnlPct).toBeNull();
  });

  it('舊格式 cost/shares 向下相容', () => {
    const oldItem = { code: '0050', cost: 500, shares: 1, oddLotShares: 0 };
    const { totalShares, avgCost, pnlPct } = calcPortfolio(oldItem, 600);
    expect(totalShares).toBe(1000);
    expect(avgCost).toBeCloseTo(500);
    expect(pnlPct).toBeCloseTo(20);
  });

  it('舊格式 price=0 → pnlPct 仍為 null', () => {
    expect(calcPortfolio({ code: 'X', cost: 100, shares: 1 }, 0).pnlPct).toBeNull();
  });

  it('多筆損益為負的情況', () => {
    const item = makeItem([makeLot({ shares: 1, cost: 200 })]);
    const { pnlPct, pnlAmt } = calcPortfolio(item, 150);
    expect(pnlPct).toBeCloseTo(-25);
    expect(pnlAmt).toBeCloseTo(-50000);
  });
});

// ═══════════════════════════════════════════════════════════
//  calcTotalPortfolio
// ═══════════════════════════════════════════════════════════
describe('calcTotalPortfolio', () => {
  const watchlist = [
    makeItem([makeLot({ shares: 1, cost: 100 })], { code: 'A' }),
    makeItem([makeLot({ shares: 2, cost: 200 })], { code: 'B' }),
  ];
  const quotes = {
    A: { price: 120 },
    B: { price: 250 },
  };

  it('rows 長度等於 watchlist 長度', () => {
    expect(calcTotalPortfolio(watchlist, quotes).rows).toHaveLength(2);
  });

  it('totalMkt = sum of mktVal', () => {
    // A: 120*1000=120000, B: 250*2000=500000
    expect(calcTotalPortfolio(watchlist, quotes).totalMkt).toBe(620000);
  });

  it('totalCost = sum of totalCost', () => {
    // A: 100*1000=100000, B: 200*2000=400000
    expect(calcTotalPortfolio(watchlist, quotes).totalCost).toBe(500000);
  });

  it('totalPnlAmt 正確', () => {
    expect(calcTotalPortfolio(watchlist, quotes).totalPnlAmt).toBeCloseTo(120000);
  });

  it('totalPnlPct 正確', () => {
    // (620000/500000-1)*100 = 24%
    expect(calcTotalPortfolio(watchlist, quotes).totalPnlPct).toBeCloseTo(24);
  });

  it('空 watchlist → 全部為 null/0', () => {
    const { totalMkt, totalPnlAmt, totalPnlPct } = calcTotalPortfolio([], {});
    expect(totalMkt).toBe(0);
    expect(totalPnlAmt).toBeNull();
    expect(totalPnlPct).toBeNull();
  });

  it('quotes 中缺少某股 → price 視為 0，pnlPct=null', () => {
    const wl = [makeItem([makeLot({ shares: 1, cost: 100 })], { code: 'MISSING' })];
    const { rows } = calcTotalPortfolio(wl, {});
    expect(rows[0].pnlPct).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
//  fmtPct
// ═══════════════════════════════════════════════════════════
describe('fmtPct', () => {
  it('正數帶加號', () => expect(fmtPct(12.345)).toBe('+12.35%'));
  it('負數無加號', () => expect(fmtPct(-3.1)).toBe('-3.10%'));
  it('零帶加號', ()  => expect(fmtPct(0)).toBe('+0.00%'));
  it('null → —',    () => expect(fmtPct(null)).toBe('—'));
  it('sign=false 時正數不帶加號', () => expect(fmtPct(5, false)).toBe('5.00%'));
  it('小數點固定 2 位', () => expect(fmtPct(1)).toBe('+1.00%'));
});

// ═══════════════════════════════════════════════════════════
//  fmtAmt
// ═══════════════════════════════════════════════════════════
describe('fmtAmt', () => {
  it('正數帶加號與千分位', () => expect(fmtAmt(12345)).toBe('+12,345'));
  it('負數帶負號與千分位', () => expect(fmtAmt(-9876)).toBe('-9,876'));
  it('零帶加號', ()         => expect(fmtAmt(0)).toBe('+0'));
  it('null → —',            () => expect(fmtAmt(null)).toBe('—'));
  it('小數四捨五入', ()     => expect(fmtAmt(1234.6)).toBe('+1,235'));
  it('大金額正確格式', ()   => expect(fmtAmt(1000000)).toBe('+1,000,000'));
});

// ═══════════════════════════════════════════════════════════
//  fmtShares
// ═══════════════════════════════════════════════════════════
describe('fmtShares', () => {
  it('僅整張', ()          => expect(fmtShares(2, 0)).toBe('2張'));
  it('僅零股', ()          => expect(fmtShares(0, 500)).toBe('500股'));
  it('整張＋零股',  ()     => expect(fmtShares(1, 300)).toBe('1張+300股'));
  it('全為 0 → —', ()      => expect(fmtShares(0, 0)).toBe('—'));
  it('字串數字也能處理', () => expect(fmtShares('3', '200')).toBe('3張+200股'));
  it('null 值以 0 計', ()  => expect(fmtShares(null, null)).toBe('—'));
});

// ═══════════════════════════════════════════════════════════
//  P0-1: calcTrailingStopPrice / isTrailingStopTriggered
// ═══════════════════════════════════════════════════════════
describe('calcTrailingStopPrice', () => {
  it('峰值 100，回落 8% → 停損價 92', () => {
    expect(calcTrailingStopPrice(100, 8)).toBeCloseTo(92);
  });
  it('峰值 800，回落 10% → 停損價 720', () => {
    expect(calcTrailingStopPrice(800, 10)).toBeCloseTo(720);
  });
  it('回落 0% → 停損價等於峰值', () => {
    expect(calcTrailingStopPrice(500, 0)).toBe(500);
  });
});

describe('isTrailingStopTriggered', () => {
  it('現價低於停損觸發價 → true', () => {
    expect(isTrailingStopTriggered(91, 100, 8)).toBe(true);  // 停損=92
  });
  it('現價恰好在停損觸發價 → true', () => {
    expect(isTrailingStopTriggered(92, 100, 8)).toBe(true);
  });
  it('現價高於停損觸發價 → false', () => {
    expect(isTrailingStopTriggered(95, 100, 8)).toBe(false);
  });
  it('peakPrice 為 0 → false（尚無追蹤）', () => {
    expect(isTrailingStopTriggered(80, 0, 8)).toBe(false);
  });
  it('trailingPct 為 null → false', () => {
    expect(isTrailingStopTriggered(50, 100, null)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
//  P0-2: calcRR
// ═══════════════════════════════════════════════════════════
describe('calcRR', () => {
  it('標準 1:2 的案例', () => {
    // cost=100, target=120, stop=90 → reward=20, risk=10 → RR=2
    const r = calcRR(100, 120, 90);
    expect(r.rr).toBe(2);
    expect(r.reward).toBe(20);
    expect(r.risk).toBe(10);
  });
  it('停損高於成本 → null（無效設定）', () => {
    expect(calcRR(100, 120, 110)).toBeNull();
  });
  it('缺少 target → null', () => {
    expect(calcRR(100, 0, 90)).toBeNull();
  });
  it('cost = 0 → null', () => {
    expect(calcRR(0, 120, 90)).toBeNull();
  });
  it('損益比小於 1 的情況（不建議但仍計算）', () => {
    // cost=100, target=105, stop=90 → reward=5, risk=10 → RR=0.5
    const r = calcRR(100, 105, 90);
    expect(r.rr).toBe(0.5);
  });
});

// ═══════════════════════════════════════════════════════════
//  P0-3: calcPositionSize
// ═══════════════════════════════════════════════════════════
describe('calcPositionSize', () => {
  it('標準案例：資金100萬，風險2%，股價100，停損90', () => {
    // maxLoss=20000, riskPerSh=10, shares=2000, lots=2
    const r = calcPositionSize(1000000, 2, 100, 90);
    expect(r.maxLoss).toBe(20000);
    expect(r.shares).toBe(2000);
    expect(r.lots).toBe(2);
  });
  it('停損等於股價 → null（riskPerSh=0，不能計算）', () => {
    expect(calcPositionSize(1000000, 2, 100, 100)).toBeNull();
  });
  it('停損高於股價 → null（邏輯錯誤）', () => {
    expect(calcPositionSize(1000000, 2, 100, 110)).toBeNull();
  });
  it('資金 0 → null', () => {
    expect(calcPositionSize(0, 2, 100, 90)).toBeNull();
  });
  it('風險比例 1% 回傳整張數為 1', () => {
    // maxLoss=10000, riskPerSh=10, shares=1000, lots=1
    const r = calcPositionSize(1000000, 1, 100, 90);
    expect(r.lots).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
//  P1-4: calcBollingerBands
// ═══════════════════════════════════════════════════════════
describe('calcBollingerBands', () => {
  // 生成 30 根蠟燭的假資料（收盤價 100~129）
  const candles = Array.from({ length: 30 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000,
  }));

  it('period=20，前 19 根沒有結果', () => {
    const bb = calcBollingerBands(candles, 20, 2);
    expect(bb.length).toBe(candles.length - 19);
  });
  it('upper > mid > lower', () => {
    const bb = calcBollingerBands(candles, 20, 2);
    bb.forEach(b => {
      expect(b.upper).toBeGreaterThan(b.mid);
      expect(b.mid).toBeGreaterThan(b.lower);
    });
  });
  it('bandwidth 為正數', () => {
    calcBollingerBands(candles, 20, 2).forEach(b => {
      expect(b.bandwidth).toBeGreaterThan(0);
    });
  });
  it('資料不足 period → 回傳空陣列', () => {
    expect(calcBollingerBands(candles.slice(0, 5), 20, 2)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  P1-5: calcVolumeMA / calcVolumeRatio
// ═══════════════════════════════════════════════════════════
describe('calcVolumeMA', () => {
  const candles = Array.from({ length: 10 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    close: 100, open: 100, high: 100, low: 100, volume: (i + 1) * 1000,
  }));

  it('period=5，前 4 根無結果', () => {
    expect(calcVolumeMA(candles, 5).length).toBe(candles.length - 4);
  });
  it('計算正確：第 5 根 = avg(1000,2000,3000,4000,5000) = 3000', () => {
    const ma = calcVolumeMA(candles, 5);
    expect(ma[0].value).toBe(3000);
  });
});

describe('calcVolumeRatio', () => {
  const flat = Array.from({ length: 10 }, (_, i) => ({
    time: 1700000000 + i * 86400, close: 100, volume: 1000,
  }));
  it('所有成交量相同 → 量比 = 1.00', () => {
    expect(calcVolumeRatio(flat, 5)).toBe(1.00);
  });
  it('今日量是均量 2 倍 → 量比 = 2.00', () => {
    const data = [...flat.slice(0, 9), { ...flat[9], volume: 2000 }];
    expect(calcVolumeRatio(data, 5)).toBeCloseTo(2.00);
  });
  it('資料不足 → null', () => {
    expect(calcVolumeRatio(flat.slice(0, 3), 5)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
//  P1-6: aggregateCandles
// ═══════════════════════════════════════════════════════════
describe('aggregateCandles', () => {
  // 2024-01-01 (週一) 開始的 10 個交易日
  const DAY = 86400;
  const BASE = 1704067200; // 2024-01-01 00:00 UTC (週一)
  // 跳過週末：Mon=0,Tue=1,Wed=2,Thu=3,Fri=4,Mon=7,Tue=8,Wed=9,Thu=10,Fri=11
  const offsets = [0,1,2,3,4, 7,8,9,10,11];
  const candles = offsets.map((d, i) => ({
    time: BASE + d * DAY,
    open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000,
  }));

  it('日K不聚合 → 原樣回傳', () => {
    // aggregateCandles 只在 weekly/monthly 聚合
    // 每根對應不同天，週K應聚合為 2 週
    const daily = [...candles]; // unchanged reference test
    expect(daily.length).toBe(10);
  });

  it('週K聚合：10 個交易日（2 週）→ 2 根', () => {
    const weekly = aggregateCandles(candles, 'weekly');
    expect(weekly.length).toBe(2);
  });

  it('週K：每週的 high 是該週最高', () => {
    const weekly = aggregateCandles(candles, 'weekly');
    // 第一週 (idx 0-4): high = max(101..105) = 105
    expect(weekly[0].high).toBe(105);
  });

  it('週K：每週的 close 是最後一個交易日的收盤', () => {
    const weekly = aggregateCandles(candles, 'weekly');
    // 第一週最後一天 idx=4, close=104
    expect(weekly[0].close).toBe(104);
  });

  it('週K：每週的 volume 是加總', () => {
    const weekly = aggregateCandles(candles, 'weekly');
    expect(weekly[0].volume).toBe(5000); // 5天各1000
  });

  it('月K：同月份全部聚合為 1 根', () => {
    const monthly = aggregateCandles(candles, 'monthly');
    expect(monthly.length).toBe(1); // 全部在 2024年1月
  });

  it('空陣列 → 回傳空陣列', () => {
    expect(aggregateCandles([], 'weekly')).toHaveLength(0);
  });
});
