import { describe, it, expect } from 'vitest';
import {
  calcRSI14, calcMAValue, calcHighN, calcKDLatest,
  checkConditions, filterPassed,
} from '../scanner';

// ─── 測試資料工廠 ────────────────────────────────────────────
const makeCandles = (closes, base = { open: 100, high: 105, low: 95, volume: 10000 }) =>
  closes.map(close => ({ ...base, high: close + 3, low: close - 3, open: close - 1, close, volume: base.volume }));

const makeInst = (fiNets, itNets) =>
  fiNets.map((fiNet, i) => ({ fiNet: fiNet * 1000, itNet: (itNets?.[i] ?? 0) * 1000 }));

const makeMargin = (bals) =>
  bals.map(marginBal => ({ marginBal }));

// ─── calcRSI14 ───────────────────────────────────────────────
describe('calcRSI14', () => {
  it('資料不足 15 根 → null', () => {
    expect(calcRSI14(makeCandles([100, 101, 102]))).toBeNull();
  });

  it('全漲 → RSI 接近 100', () => {
    const candles = makeCandles([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114]);
    const rsi = calcRSI14(candles);
    expect(rsi).toBeGreaterThan(90);
  });

  it('全跌 → RSI 接近 0', () => {
    const candles = makeCandles([114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100]);
    const rsi = calcRSI14(candles);
    expect(rsi).toBeLessThan(10);
  });

  it('無虧損時 → RSI = 100（不除以零）', () => {
    const candles = makeCandles(Array.from({ length: 15 }, (_, i) => 100 + i));
    expect(calcRSI14(candles)).toBe(100);
  });
});

// ─── calcMAValue ─────────────────────────────────────────────
describe('calcMAValue', () => {
  it('正常計算 MA5', () => {
    const candles = makeCandles([10, 20, 30, 40, 50]);
    expect(calcMAValue(candles, 5)).toBe(30);
  });

  it('資料不足 → null', () => {
    expect(calcMAValue(makeCandles([100, 200]), 5)).toBeNull();
  });

  it('只取最後 n 根', () => {
    const candles = makeCandles([1, 2, 3, 100, 200, 300]);
    // 最後 3 根平均 = 200
    expect(calcMAValue(candles, 3)).toBe(200);
  });
});

// ─── calcHighN ───────────────────────────────────────────────
describe('calcHighN', () => {
  it('取最近 3 根最高 high', () => {
    // high = close + 3
    const candles = makeCandles([100, 200, 150, 120, 180]);
    expect(calcHighN(candles, 3)).toBe(183); // max(153, 123, 183)
  });

  it('資料不足 → null', () => {
    expect(calcHighN(makeCandles([100, 200]), 5)).toBeNull();
  });
});

// ─── calcKDLatest ────────────────────────────────────────────
describe('calcKDLatest', () => {
  it('資料不足 → k/d null, golden false', () => {
    const { k, d, golden } = calcKDLatest(makeCandles([100, 101, 102]), 9);
    expect(k).toBeNull();
    expect(d).toBeNull();
    expect(golden).toBe(false);
  });

  it('資料足夠時回傳數值', () => {
    const candles = makeCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    const { k, d } = calcKDLatest(candles);
    expect(typeof k).toBe('number');
    expect(typeof d).toBe('number');
  });

  it('持續上漲後 K > D（多頭排列）', () => {
    const candles = makeCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    const { k, d } = calcKDLatest(candles);
    expect(k).toBeGreaterThan(d);
  });
});

// ─── checkConditions ─────────────────────────────────────────
describe('checkConditions — rsi_oversold', () => {
  it('RSI < 30 → pass', () => {
    // 全跌讓 RSI 很低
    const candles = makeCandles([114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100]);
    const [result] = checkConditions({ candles }, ['rsi_oversold']);
    expect(result.pass).toBe(true);
    expect(result.displayValue).toMatch(/RSI/);
  });

  it('RSI 正常 → 不 pass', () => {
    const candles = makeCandles([100, 101, 102, 101, 102, 103, 102, 103, 104, 103, 104, 105, 104, 105, 106]);
    const [result] = checkConditions({ candles }, ['rsi_oversold']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — above_ma60', () => {
  it('收盤 > MA60 → pass', () => {
    // 前 59 根 close=100，第 60 根 close=200（拉高 MA60），再加一根 close=999
    const candles = makeCandles([...Array(59).fill(100), 100, 999]);
    const [result] = checkConditions({ candles }, ['above_ma60']);
    expect(result.pass).toBe(true);
  });

  it('資料不足 60 根 → 不 pass', () => {
    const candles = makeCandles(Array(10).fill(100));
    const [result] = checkConditions({ candles }, ['above_ma60']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — fi_buy_3d', () => {
  it('外資連 3 日買超 → pass', () => {
    const inst = makeInst([5, 3, 7], [0, 0, 0]);
    const [result] = checkConditions({ inst }, ['fi_buy_3d']);
    expect(result.pass).toBe(true);
  });

  it('外資中間一天賣超 → 不 pass', () => {
    const inst = makeInst([5, -1, 7], [0, 0, 0]);
    const [result] = checkConditions({ inst }, ['fi_buy_3d']);
    expect(result.pass).toBe(false);
  });

  it('資料不足 3 天 → 不 pass', () => {
    const inst = makeInst([5, 3], [0, 0]);
    const [result] = checkConditions({ inst }, ['fi_buy_3d']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — it_buy', () => {
  it('投信買超 → pass', () => {
    const inst = makeInst([0], [2]);
    const [result] = checkConditions({ inst }, ['it_buy']);
    expect(result.pass).toBe(true);
  });

  it('投信賣超 → 不 pass', () => {
    const inst = makeInst([0], [-1]);
    const [result] = checkConditions({ inst }, ['it_buy']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — margin_decrease', () => {
  it('融資減少 → pass', () => {
    const margin = makeMargin([5000, 4800]);
    const [result] = checkConditions({ margin }, ['margin_decrease']);
    expect(result.pass).toBe(true);
  });

  it('融資增加 → 不 pass', () => {
    const margin = makeMargin([4800, 5000]);
    const [result] = checkConditions({ margin }, ['margin_decrease']);
    expect(result.pass).toBe(false);
  });

  it('資料不足 2 筆 → 不 pass', () => {
    const margin = makeMargin([5000]);
    const [result] = checkConditions({ margin }, ['margin_decrease']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — pe_low', () => {
  it('PE < 15 → pass', () => {
    const [result] = checkConditions({ valuation: { pe: 12, dividendYield: 3, pb: 2 } }, ['pe_low']);
    expect(result.pass).toBe(true);
  });

  it('PE = 0（虧損股）→ 不 pass', () => {
    const [result] = checkConditions({ valuation: { pe: 0 } }, ['pe_low']);
    expect(result.pass).toBe(false);
  });

  it('PE > 15 → 不 pass', () => {
    const [result] = checkConditions({ valuation: { pe: 20 } }, ['pe_low']);
    expect(result.pass).toBe(false);
  });

  it('無 valuation → 不 pass', () => {
    const [result] = checkConditions({ valuation: null }, ['pe_low']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — yield_high', () => {
  it('殖利率 > 5% → pass', () => {
    const [result] = checkConditions({ valuation: { dividendYield: 6 } }, ['yield_high']);
    expect(result.pass).toBe(true);
  });

  it('殖利率 < 5% → 不 pass', () => {
    const [result] = checkConditions({ valuation: { dividendYield: 3 } }, ['yield_high']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — pb_low', () => {
  it('PB < 1.5 → pass', () => {
    const [result] = checkConditions({ valuation: { pb: 1.2 } }, ['pb_low']);
    expect(result.pass).toBe(true);
  });

  it('PB > 1.5 → 不 pass', () => {
    const [result] = checkConditions({ valuation: { pb: 2 } }, ['pb_low']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — turnover_high', () => {
  it('成交金額 > 1 億 → pass', () => {
    // price=100, volume=1500（千股=150萬股）→ 1.5億
    const [result] = checkConditions({ quote: { price: 100, volume: 1500 } }, ['turnover_high']);
    expect(result.pass).toBe(true);
  });

  it('成交金額 < 1 億 → 不 pass', () => {
    const [result] = checkConditions({ quote: { price: 50, volume: 100 } }, ['turnover_high']);
    expect(result.pass).toBe(false);
  });
});

describe('checkConditions — 多條件組合', () => {
  it('同時滿足多條件 → 全部 pass', () => {
    const inst    = makeInst([5, 3, 7], [0, 0, 2]); // 最後一筆 itNet > 0
    const margin  = makeMargin([5000, 4800]);
    const valuation = { pe: 10, dividendYield: 6, pb: 1.2 };
    const results = checkConditions({ inst, margin, valuation }, ['fi_buy_3d', 'it_buy', 'margin_decrease', 'pe_low', 'yield_high', 'pb_low']);
    expect(results.every(r => r.pass)).toBe(true);
  });

  it('部分條件不符 → 對應項 pass=false', () => {
    const inst = makeInst([5, -1, 7], [0, 0, 3]); // fi_buy_3d 不符，但 it_buy 最後一筆正
    const results = checkConditions({ inst }, ['fi_buy_3d', 'it_buy']);
    expect(results[0].pass).toBe(false); // fi_buy_3d 不通過
    expect(results[1].pass).toBe(true);  // it_buy 通過
  });
});

// ─── filterPassed ────────────────────────────────────────────
describe('filterPassed', () => {
  it('全部 pass → 回傳全部', () => {
    const scanResults = [
      { code: '2330', name: '台積電', results: [{ id: 'pe_low', pass: true, displayValue: 'PE 12' }] },
      { code: '2317', name: '鴻海',   results: [{ id: 'pe_low', pass: true, displayValue: 'PE 8' }] },
    ];
    expect(filterPassed(scanResults).length).toBe(2);
  });

  it('部分 pass → 只回傳全 pass 的股票', () => {
    const scanResults = [
      { code: '2330', results: [{ pass: true }, { pass: false }] },
      { code: '2317', results: [{ pass: true }, { pass: true }] },
    ];
    const passed = filterPassed(scanResults);
    expect(passed.length).toBe(1);
    expect(passed[0].code).toBe('2317');
  });

  it('全部不 pass → 空陣列', () => {
    const scanResults = [
      { code: '2330', results: [{ pass: false }] },
    ];
    expect(filterPassed(scanResults).length).toBe(0);
  });
});
