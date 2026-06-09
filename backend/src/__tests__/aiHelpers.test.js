/**
 * backend/src/__tests__/aiHelpers.test.js
 * 使用 Node.js 內建 test runner（node --test）
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calcLotReviewStats, sliceContextCandles, calcPatternStats } = require('../utils/aiHelpers');

// ─── 測試資料工廠 ────────────────────────────────────────────
const makeLot = (o = {}) => ({
  cost: 100, shares: 1000, exitPrice: 110,
  date: '2024-01-01', exitDate: '2024-03-01',
  ...o,
});

/** 建立一組連續 Unix timestamp K 棒（每根間距 1 天 = 86400 秒） */
const makeCandles = (count, startDate = '2024-01-01') => {
  const base = Math.floor(new Date(startDate).getTime() / 1000);
  return Array.from({ length: count }, (_, i) => ({
    time:  base + i * 86_400,
    open:  100, high: 105, low: 98, close: 102, volume: 1000,
  }));
};

// ─── calcLotReviewStats ─────────────────────────────────────
describe('calcLotReviewStats', () => {
  it('正常：計算損益百分比', () => {
    const { pnlPct } = calcLotReviewStats(makeLot({ cost: 100, exitPrice: 110 }));
    assert.equal(pnlPct, 10);
  });

  it('正常：計算損益金額（shares=1000，單位「股」）', () => {
    const { pnlAmt } = calcLotReviewStats(makeLot({ cost: 100, exitPrice: 110, shares: 1000 }));
    assert.equal(pnlAmt, 10_000);
  });

  it('正常：計算持有天數', () => {
    const { holdDays } = calcLotReviewStats(makeLot({ date: '2024-01-01', exitDate: '2024-04-10' }));
    assert.equal(holdDays, 100);
  });

  it('虧損：pnlPct 為負數', () => {
    const { pnlPct, pnlAmt } = calcLotReviewStats(makeLot({ cost: 100, exitPrice: 80, shares: 1000 }));
    assert.equal(pnlPct, -20);
    assert.equal(pnlAmt, -20_000);
  });

  it('邊界：exitPrice 缺失 → pnlPct / pnlAmt 為 null', () => {
    const { pnlPct, pnlAmt } = calcLotReviewStats(makeLot({ exitPrice: undefined }));
    assert.equal(pnlPct, null);
    assert.equal(pnlAmt, null);
  });

  it('邊界：cost 為 0 → pnlPct / pnlAmt 為 null（避免除以 0）', () => {
    const { pnlPct, pnlAmt } = calcLotReviewStats(makeLot({ cost: 0 }));
    assert.equal(pnlPct, null);
    assert.equal(pnlAmt, null);
  });

  it('邊界：entryDate 缺失 → holdDays 為 null', () => {
    const { holdDays } = calcLotReviewStats(makeLot({ date: undefined }));
    assert.equal(holdDays, null);
  });

  it('邊界：exitDate 缺失 → holdDays 為 null', () => {
    const { holdDays } = calcLotReviewStats(makeLot({ exitDate: undefined }));
    assert.equal(holdDays, null);
  });
});

// ─── sliceContextCandles ────────────────────────────────────
describe('sliceContextCandles', () => {
  it('空陣列 → 回傳空陣列', () => {
    const result = sliceContextCandles([], '2024-01-10', '2024-02-10');
    assert.deepEqual(result, []);
  });

  it('無日期 → 回傳末尾 40 根', () => {
    const candles = makeCandles(60);
    const result  = sliceContextCandles(candles, null, null);
    assert.equal(result.length, 40);
  });

  it('正常：切片包含進出場前後各 15 根', () => {
    // 60 根，進場在第 20 根（index 20），出場在第 40 根（index 40）
    const candles   = makeCandles(60, '2024-01-01');
    const entryDate = new Date(candles[20].time * 1000).toISOString().slice(0, 10);
    const exitDate  = new Date(candles[40].time * 1000).toISOString().slice(0, 10);

    const result = sliceContextCandles(candles, entryDate, exitDate, 15);
    // start = 20-15=5, end = 40+15=55 → 50 根
    assert.equal(result[0].time, candles[5].time);
    assert.equal(result[result.length - 1].time, candles[54].time);
    assert.equal(result.length, 50);
  });

  it('邊界：進場很早，start 不低於 0', () => {
    const candles   = makeCandles(30, '2024-01-01');
    const entryDate = new Date(candles[2].time * 1000).toISOString().slice(0, 10);
    const exitDate  = new Date(candles[20].time * 1000).toISOString().slice(0, 10);

    const result = sliceContextCandles(candles, entryDate, exitDate, 15);
    assert.equal(result[0].time, candles[0].time); // 不超出陣列起點
  });

  it('邊界：出場很晚，end 不超過陣列長度', () => {
    const candles   = makeCandles(30, '2024-01-01');
    const entryDate = new Date(candles[5].time * 1000).toISOString().slice(0, 10);
    const exitDate  = new Date(candles[28].time * 1000).toISOString().slice(0, 10);

    const result = sliceContextCandles(candles, entryDate, exitDate, 15);
    assert.equal(result[result.length - 1].time, candles[29].time); // 不超出陣列終點
  });

  it('自訂 padding', () => {
    const candles   = makeCandles(60, '2024-01-01');
    const entryDate = new Date(candles[30].time * 1000).toISOString().slice(0, 10);
    const exitDate  = new Date(candles[30].time * 1000).toISOString().slice(0, 10); // 同日

    const result = sliceContextCandles(candles, entryDate, exitDate, 5);
    assert.equal(result.length, 10); // slice(30-5=25, 30+5=35) → 10 根
  });
});

// ─── calcPatternStats ───────────────────────────────────────
describe('calcPatternStats', () => {
  it('空陣列 → 全部回傳 null', () => {
    const result = calcPatternStats([]);
    assert.equal(result.high, null);
    assert.equal(result.low, null);
    assert.equal(result.pricePosPct, null);
  });

  it('正常：計算區間最高最低和價格位置百分比', () => {
    const candles = [
      { high: 120, low: 80, close: 100 },
      { high: 130, low: 90, close: 110 },
    ];
    const { high, low, pricePosPct } = calcPatternStats(candles);
    assert.equal(high, 130);
    assert.equal(low, 80);
    // close=110, range=50, pos=(110-80)/50*100 = 60
    assert.equal(pricePosPct, 60);
  });

  it('邊界：最高 = 最低（橫盤）→ pricePosPct 為 null', () => {
    const candles = [{ high: 100, low: 100, close: 100 }];
    const { pricePosPct } = calcPatternStats(candles);
    assert.equal(pricePosPct, null);
  });

  it('邊界：收盤在最低點 → pricePosPct 為 0', () => {
    const candles = [{ high: 120, low: 80, close: 80 }];
    const { pricePosPct } = calcPatternStats(candles);
    assert.equal(pricePosPct, 0);
  });

  it('邊界：收盤在最高點 → pricePosPct 為 100', () => {
    const candles = [{ high: 120, low: 80, close: 120 }];
    const { pricePosPct } = calcPatternStats(candles);
    assert.equal(pricePosPct, 100);
  });
});
