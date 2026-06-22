/**
 * chipScan.test.js
 * 測試籌碼異動偵測純函式（P7-34）
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { detectChipSignal, scanWatchPool } = require('../utils/chipScan');

function makeInstHistory(fiNetSeries) {
  return fiNetSeries.map((fiNet, i) => ({ time: i, fiNet }));
}
function makeCandles(closeSeries) {
  return closeSeries.map((close, i) => ({ time: i, close }));
}

describe('detectChipSignal', () => {
  it('連續3日外資買超 + 創20日新高 → matched = true', () => {
    const instHistory = makeInstHistory([-100, -50, 200, 300, 400]); // 最後3日皆為正
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i); // 遞增，最後一筆最高
    const result = detectChipSignal(instHistory, makeCandles(closes));
    assert.equal(result.matched, true);
    assert.equal(result.consecutiveBuyDays, 3);
    assert.equal(result.isNewHigh, true);
    assert.ok(result.reason.includes('連續3日外資買超'));
  });

  it('只連續2日外資買超 → matched = false', () => {
    const instHistory = makeInstHistory([-100, -50, 200, 300]); // 最後2日為正
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = detectChipSignal(instHistory, makeCandles(closes));
    assert.equal(result.matched, false);
    assert.equal(result.consecutiveBuyDays, 2);
  });

  it('連續買超但未創新高 → matched = false', () => {
    const instHistory = makeInstHistory([100, 200, 300]);
    const closes = [...Array.from({ length: 19 }, (_, i) => 100 + i), 90]; // 最後一筆非最高
    const result = detectChipSignal(instHistory, makeCandles(closes));
    assert.equal(result.matched, false);
    assert.equal(result.isNewHigh, false);
  });

  it('連續4日以上買超仍視為符合（>=3）', () => {
    const instHistory = makeInstHistory([100, 200, 300, 400, 500]);
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = detectChipSignal(instHistory, makeCandles(closes));
    assert.equal(result.matched, true);
    assert.equal(result.consecutiveBuyDays, 5);
  });

  it('空 instHistory → matched = false 且不報錯', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = detectChipSignal([], makeCandles(closes));
    assert.equal(result.matched, false);
    assert.equal(result.consecutiveBuyDays, 0);
  });

  it('空 candles → matched = false 且不報錯', () => {
    const instHistory = makeInstHistory([100, 200, 300]);
    const result = detectChipSignal(instHistory, []);
    assert.equal(result.matched, false);
  });

  it('資料不足 20 根 K 棒時，仍以現有資料判斷新高', () => {
    const instHistory = makeInstHistory([100, 200, 300]);
    const closes = [100, 105, 110]; // 僅3根，最後一筆最高
    const result = detectChipSignal(instHistory, makeCandles(closes));
    assert.equal(result.isNewHigh, true);
    assert.equal(result.matched, true);
  });
});

describe('scanWatchPool', () => {
  it('回傳所有符合條件的股票', () => {
    const pool = ['2330', '2317', '2454'];
    const instDataByCode = {
      '2330': makeInstHistory([100, 200, 300]),
      '2317': makeInstHistory([-100, -200, -300]),
      '2454': makeInstHistory([100, 200, 300]),
    };
    const candlesByCode = {
      '2330': makeCandles(Array.from({ length: 20 }, (_, i) => 100 + i)),
      '2317': makeCandles(Array.from({ length: 20 }, (_, i) => 100 + i)),
      '2454': makeCandles(Array.from({ length: 20 }, (_, i) => 100 + i)),
    };
    const candidates = scanWatchPool(pool, instDataByCode, candlesByCode);
    assert.equal(candidates.length, 2);
    assert.deepEqual(candidates.map(c => c.code).sort(), ['2330', '2454']);
  });

  it('無符合股票時回傳空陣列', () => {
    const pool = ['2330'];
    const candidates = scanWatchPool(pool, { '2330': [] }, { '2330': [] });
    assert.deepEqual(candidates, []);
  });

  it('缺少資料的代號不報錯，視為不符合', () => {
    const pool = ['9999'];
    const candidates = scanWatchPool(pool, {}, {});
    assert.deepEqual(candidates, []);
  });
});
