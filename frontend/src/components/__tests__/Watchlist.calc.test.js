/**
 * 持股計算邏輯單元測試
 * 確保 lotShares / calcPortfolio 在各種邊界情況下不會顯示錯誤損益
 */

import { describe, it, expect } from 'vitest';
import { lotShares, lotCostTotal, lotPnlPct, lotPnlAmt, calcPortfolio } from '../../utils/portfolio.js';

// ─── lotShares ───────────────────────────────────────────────
describe('lotShares', () => {
  it('整張：1張 = 1000股', () => {
    expect(lotShares({ shares: 1, oddLotShares: 0 })).toBe(1000);
  });
  it('零股只計零股', () => {
    expect(lotShares({ shares: 0, oddLotShares: 500 })).toBe(500);
  });
  it('整張＋零股混合', () => {
    expect(lotShares({ shares: 2, oddLotShares: 300 })).toBe(2300);
  });
  it('沒有數量欄位時回傳 0', () => {
    expect(lotShares({})).toBe(0);
  });
});

// ─── lotPnlPct ───────────────────────────────────────────────
describe('lotPnlPct', () => {
  it('現價高於成本 → 正損益', () => {
    expect(lotPnlPct({ cost: 100 }, 120)).toBeCloseTo(20);
  });
  it('現價低於成本 → 負損益', () => {
    expect(lotPnlPct({ cost: 100 }, 80)).toBeCloseTo(-20);
  });
  it('成本為 0 → 回傳 0（不除以零）', () => {
    expect(lotPnlPct({ cost: 0 }, 100)).toBe(0);
  });
});

// ─── calcPortfolio ───────────────────────────────────────────
describe('calcPortfolio — 正常情況', () => {
  const item = {
    lots: [
      { id: '1', shares: 2, oddLotShares: 0, cost: 800 },
      { id: '2', shares: 1, oddLotShares: 0, cost: 850 },
    ],
  };

  it('加權均成計算正確', () => {
    const { avgCost } = calcPortfolio(item, 900);
    // (800*2000 + 850*1000) / 3000 = 2450000/3000 ≈ 816.67
    expect(avgCost).toBeCloseTo(816.67, 1);
  });

  it('總股數 = 3000', () => {
    expect(calcPortfolio(item, 900).totalShares).toBe(3000);
  });

  it('損益%為正時不為 null', () => {
    const { pnlPct } = calcPortfolio(item, 900);
    expect(pnlPct).not.toBeNull();
    expect(pnlPct).toBeGreaterThan(0);
  });
});

// ─── 【關鍵 Bug 防護】price=0 時不應顯示 -100% ─────────────
describe('calcPortfolio — price=0（無報價）', () => {
  const item = {
    lots: [{ id: '1', shares: 1, oddLotShares: 0, cost: 100 }],
  };

  it('price=0 → pnlPct 為 null，不顯示 -100%', () => {
    const { pnlPct } = calcPortfolio(item, 0);
    expect(pnlPct).toBeNull();
  });

  it('price=0 → pnlAmt 為 null，不顯示負值', () => {
    const { pnlAmt } = calcPortfolio(item, 0);
    expect(pnlAmt).toBeNull();
  });

  it('price=0 → mktVal 為 0', () => {
    const { mktVal } = calcPortfolio(item, 0);
    expect(mktVal).toBe(0);
  });
});

// ─── 空 lots ─────────────────────────────────────────────────
describe('calcPortfolio — 無買入記錄', () => {
  it('空 lots → totalShares=0, avgCost=0, pnlPct=null', () => {
    const { totalShares, avgCost, pnlPct } = calcPortfolio({ lots: [] }, 100);
    expect(totalShares).toBe(0);
    expect(avgCost).toBe(0);
    expect(pnlPct).toBeNull();
  });
});

// ─── 向下相容（舊格式 cost/shares）────────────────────────
describe('calcPortfolio — 舊格式向下相容', () => {
  const oldItem = { cost: 500, shares: 1, oddLotShares: 0 }; // 無 lots 欄位

  it('舊格式自動轉換，計算損益正確', () => {
    const { totalShares, avgCost, pnlPct } = calcPortfolio(oldItem, 600);
    expect(totalShares).toBe(1000);
    expect(avgCost).toBeCloseTo(500);
    expect(pnlPct).toBeCloseTo(20);
  });

  it('舊格式 price=0 → pnlPct 仍為 null', () => {
    const { pnlPct } = calcPortfolio(oldItem, 0);
    expect(pnlPct).toBeNull();
  });
});

// ─── 零股＋整張混合持倉 ──────────────────────────────────
describe('calcPortfolio — 混合整張＋零股', () => {
  const item = {
    lots: [
      { id: '1', shares: 1, oddLotShares: 0,   cost: 1000 }, // 1000股
      { id: '2', shares: 0, oddLotShares: 500,  cost: 1050 }, // 500股
    ],
  };

  it('總股數 = 1500', () => {
    expect(calcPortfolio(item, 1100).totalShares).toBe(1500);
  });

  it('加權均成正確', () => {
    // (1000*1000 + 1050*500) / 1500 = 1525000/1500 ≈ 1016.67
    expect(calcPortfolio(item, 1100).avgCost).toBeCloseTo(1016.67, 1);
  });

  it('損益%正確', () => {
    const { pnlPct } = calcPortfolio(item, 1100);
    // 市值 = 1100*1500 = 1650000，成本 = 1000*1000+1050*500 = 1525000
    // pnlPct ≈ (1650000/1525000-1)*100 ≈ 8.20%
    expect(pnlPct).toBeCloseTo(8.20, 1);
  });
});
