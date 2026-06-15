import { describe, it, expect } from 'vitest';
import { normalizeSeries, mergeSeries } from '../compareChart';

describe('normalizeSeries', () => {
  it('以第一筆收盤價為基準，計算各筆漲跌幅 %', () => {
    const candles = [
      { time: 1, close: 100 },
      { time: 2, close: 110 },
      { time: 3, close: 90 },
    ];
    expect(normalizeSeries(candles)).toEqual([
      { time: 1, pct: 0 },
      { time: 2, pct: 10 },
      { time: 3, pct: -10 },
    ]);
  });

  it('空陣列回傳空陣列', () => {
    expect(normalizeSeries([])).toEqual([]);
  });

  it('【防迴歸】第一筆收盤價為 0 時回傳空陣列（避免除以零）', () => {
    const candles = [{ time: 1, close: 0 }, { time: 2, close: 10 }];
    expect(normalizeSeries(candles)).toEqual([]);
  });
});

describe('mergeSeries', () => {
  it('依時間合併多檔股票的正規化序列', () => {
    const seriesMap = {
      '2330': [{ time: 1, pct: 0 }, { time: 2, pct: 5 }],
      '2317': [{ time: 1, pct: 0 }, { time: 2, pct: -3 }],
    };
    expect(mergeSeries(seriesMap)).toEqual([
      { time: 1, '2330': 0, '2317': 0 },
      { time: 2, '2330': 5, '2317': -3 },
    ]);
  });

  it('時間點不一致時，缺漏的代號不出現該 key（不補 0）', () => {
    const seriesMap = {
      '2330': [{ time: 1, pct: 0 }, { time: 2, pct: 5 }],
      '2317': [{ time: 1, pct: 0 }],
    };
    const result = mergeSeries(seriesMap);
    expect(result).toEqual([
      { time: 1, '2330': 0, '2317': 0 },
      { time: 2, '2330': 5 },
    ]);
  });

  it('空 seriesMap 回傳空陣列', () => {
    expect(mergeSeries({})).toEqual([]);
  });
});
