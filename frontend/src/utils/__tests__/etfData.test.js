import { describe, it, expect } from 'vitest';
import { ETF_DATA, isKnownEtf, getEtfInfo } from '../etfData';

describe('ETF_DATA', () => {
  it('至少有 5 個常見 ETF', () => {
    expect(Object.keys(ETF_DATA).length).toBeGreaterThanOrEqual(5);
  });

  it('包含 0050 / 0056 / 006208', () => {
    expect(ETF_DATA['0050']).toBeDefined();
    expect(ETF_DATA['0056']).toBeDefined();
    expect(ETF_DATA['006208']).toBeDefined();
  });

  it('每個 ETF 都有 trackingIndex / distributionFreq / holdings / updatedAt', () => {
    Object.values(ETF_DATA).forEach(etf => {
      expect(typeof etf.trackingIndex).toBe('string');
      expect(etf.trackingIndex.length).toBeGreaterThan(0);
      expect(typeof etf.distributionFreq).toBe('string');
      expect(Array.isArray(etf.holdings)).toBe(true);
      expect(typeof etf.updatedAt).toBe('string');
    });
  });

  it('每個 ETF 恰有 10 個成分股', () => {
    Object.values(ETF_DATA).forEach(etf => {
      expect(etf.holdings.length).toBe(10);
    });
  });

  it('每個成分股都有 name 和 weight（正數）', () => {
    Object.values(ETF_DATA).forEach(etf => {
      etf.holdings.forEach(h => {
        expect(typeof h.name).toBe('string');
        expect(h.name.length).toBeGreaterThan(0);
        expect(typeof h.weight).toBe('number');
        expect(h.weight).toBeGreaterThan(0);
      });
    });
  });
});

describe('isKnownEtf', () => {
  it('已知 ETF 代號回傳 true', () => {
    expect(isKnownEtf('0050')).toBe(true);
  });

  it('未知代號回傳 false', () => {
    expect(isKnownEtf('2330')).toBe(false);
    expect(isKnownEtf('9999')).toBe(false);
  });
});

describe('getEtfInfo', () => {
  it('已知代號回傳完整資訊', () => {
    const info = getEtfInfo('0050');
    expect(info).not.toBeNull();
    expect(info.trackingIndex).toBe('臺灣50指數');
  });

  it('未知代號回傳 null', () => {
    expect(getEtfInfo('2330')).toBeNull();
  });
});
