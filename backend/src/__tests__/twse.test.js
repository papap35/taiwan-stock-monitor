/**
 * backend/src/__tests__/twse.test.js
 * 測試 twse.js 的資料解析邏輯（mock node-fetch，不真正呼叫 TWSE API）
 * 使用 Node.js 內建 test runner（node --test）
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Mock node-fetch ───────────────────────────────────────────────────────
// 在 require twse 之前先攔截 node-fetch
let _mockFetchImpl = null;

function mockFetch(impl) {
  _mockFetchImpl = impl;
}

function makeFetchResponse(data, ok = true) {
  return {
    ok,
    json: async () => data,
    status: ok ? 200 : 500,
  };
}

// 替換 require cache，讓 twse.js 拿到 mock fetch
require.cache[require.resolve('node-fetch')] = {
  id: require.resolve('node-fetch'),
  filename: require.resolve('node-fetch'),
  loaded: true,
  exports: async (url, opts) => {
    if (!_mockFetchImpl) throw new Error('fetch called but no mock set');
    return _mockFetchImpl(url, opts);
  },
};

// 清除 twse cache 再 require，確保拿到 mock 版本
delete require.cache[require.resolve('../services/twse')];
const twse = require('../services/twse');

// 每個 test 前清除 NodeCache（讓測試互不影響）
function clearTwseCache() {
  delete require.cache[require.resolve('../services/twse')];
  delete require.cache[require.resolve('node-cache')];
}

// ─── isTradingHours ────────────────────────────────────────────────────────
describe('isTradingHours', () => {
  it('exports isTradingHours as a function', () => {
    assert.equal(typeof twse.isTradingHours, 'function');
  });

  it('returns a boolean', () => {
    const result = twse.isTradingHours();
    assert.equal(typeof result, 'boolean');
  });
});

// ─── POPULAR_STOCKS ────────────────────────────────────────────────────────
describe('POPULAR_STOCKS', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(twse.POPULAR_STOCKS));
    assert.ok(twse.POPULAR_STOCKS.length > 0);
  });

  it('contains 2330 (TSMC)', () => {
    assert.ok(twse.POPULAR_STOCKS.includes('2330'));
  });

  it('all entries are string stock codes', () => {
    twse.POPULAR_STOCKS.forEach(code => {
      assert.equal(typeof code, 'string');
      assert.match(code, /^\d{4,6}$/);
    });
  });
});

// ─── fetchRealtimeQuotes ───────────────────────────────────────────────────
describe('fetchRealtimeQuotes', () => {
  beforeEach(() => {
    // 每次清除 module cache，讓 NodeCache 重置
    delete require.cache[require.resolve('../services/twse')];
  });

  it('parses realtime API response correctly', async () => {
    // 重新 require 確保 cache 是乾淨的
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse({
      msgArray: [{
        c: '2330',
        n: '台積電',
        z: '950.00',
        y: '940.00',
        o: '942.00',
        h: '955.00',
        l: '938.00',
        v: '35000',
        t: '13:25:00',
      }],
    }));

    const result = await freshTwse.fetchRealtimeQuotes(['2330']);
    assert.ok(result['2330']);
    assert.equal(result['2330'].code, '2330');
    assert.equal(result['2330'].name, '台積電');
    assert.equal(result['2330'].price, 950);
    assert.equal(result['2330'].prevClose, 940);
    assert.equal(result['2330'].open, 942);
    assert.equal(result['2330'].high, 955);
    assert.equal(result['2330'].low, 938);
    assert.equal(result['2330'].volume, 35000);
    assert.equal(result['2330'].change, 10);
    assert.ok(typeof result['2330'].changePercent === 'number');
  });

  it('falls back to prevClose (y) when z is dash', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse({
      msgArray: [{
        c: '2330', n: '台積電',
        z: '-',   // 未成交時為 '-'
        y: '940.00',
        o: '-', h: '-', l: '-', v: '0', t: null,
      }],
    }));

    const result = await freshTwse.fetchRealtimeQuotes(['2330']);
    // parseFloat('-') = NaN → 應 fallback 到 y
    assert.equal(result['2330'].price, 940);
  });

  it('returns empty object on fetch error', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => { throw new Error('network error'); });

    const result = await freshTwse.fetchRealtimeQuotes(['2330']);
    assert.deepEqual(result, {});
  });

  it('returns empty object when msgArray is missing', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse({ msgArray: [] }));

    const result = await freshTwse.fetchRealtimeQuotes(['2330']);
    assert.deepEqual(result, {});
  });
});

// ─── fetchDailyAll ─────────────────────────────────────────────────────────
describe('fetchDailyAll', () => {
  it('parses STOCK_DAY_ALL format correctly（使用 Change 欄位計算昨收）', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse([
      {
        Code: '2330',
        Name: '台積電',
        ClosingPrice: '950',
        Change: '+10',   // 今漲 10 元 → 昨收 = 950 - 10 = 940
        OpeningPrice: '942',
        HighestPrice: '955',
        LowestPrice: '938',
        TradeVolume: '35,000',
      },
    ]));

    const result = await freshTwse.fetchDailyAll();
    assert.ok(result['2330']);
    assert.equal(result['2330'].price, 950);
    assert.equal(result['2330'].prevClose, 940);    // 950 - 10
    assert.equal(result['2330'].change, 10);
    assert.equal(result['2330'].volume, 35000);
  });

  it('handles comma-formatted numbers and negative Change', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse([
      {
        Code: '2330', Name: '台積電',
        ClosingPrice: '1,050',
        Change: '-50',   // 今跌 50 元 → 昨收 = 1050 - (-50) = 1100
        OpeningPrice: '1,010',
        HighestPrice: '1,060',
        LowestPrice: '1,000',
        TradeVolume: '100,000',
      },
    ]));

    const result = await freshTwse.fetchDailyAll();
    assert.equal(result['2330'].price, 1050);
    assert.equal(result['2330'].prevClose, 1100);  // 1050 - (-50)
    assert.ok(result['2330'].changePercent < 0);   // 跌，changePercent 應為負
    assert.equal(result['2330'].volume, 100000);
  });

  it('【防迴歸】Change 欄位不存在時 changePercent 不應為全部 0（prevClose fallback）', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse([
      { Code: '2330', Name: '台積電', ClosingPrice: '950', TradeVolume: '35,000' },
    ]));

    const result = await freshTwse.fetchDailyAll();
    // Change 不存在時 change=0，prevClose=950，changePercent=0（平盤，不崩潰）
    assert.equal(result['2330'].price, 950);
    assert.equal(result['2330'].prevClose, 950);
    assert.equal(result['2330'].changePercent, 0);
  });

  it('returns empty object on error', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => { throw new Error('timeout'); });

    const result = await freshTwse.fetchDailyAll();
    assert.deepEqual(result, {});
  });
});

// ─── fetchTaiex ───────────────────────────────────────────────────────────
describe('fetchTaiex', () => {
  it('parses taiex data and converts volume to 億元', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse({
      msgArray: [{
        z: '20000.00',
        y: '19800.00',
        o: '19850.00',
        h: '20100.00',
        l: '19800.00',
        v: '30000', // 百萬元 → 300 億元
        t: '13:30:00',
      }],
    }));

    const result = await freshTwse.fetchTaiex();
    assert.ok(result);
    assert.equal(result.value, 20000);
    assert.equal(result.prevClose, 19800);
    assert.equal(result.volumeRaw, 30000);
    assert.equal(result.volume, 300);           // 30000 / 100
    assert.equal(result.change, 200);
    assert.ok(typeof result.changePercent === 'number');
    assert.ok(result.updatedAt);
  });

  it('returns null on error', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse({ msgArray: [] }));

    const result = await freshTwse.fetchTaiex();
    assert.equal(result, null);
  });
});

// ─── fetchMarketBreadth（盤後路徑）─────────────────────────────────────────
describe('fetchMarketBreadth (盤後計算)', () => {
  it('calculates breadth from daily data correctly', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    // 模擬盤後 STOCK_DAY_ALL 資料（使用 Change 欄位，昨收 = ClosingPrice - Change）
    mockFetch(() => makeFetchResponse([
      { Code: 'A', Name: 'A', ClosingPrice: '105', Change: '+5',  OpeningPrice: '100', HighestPrice: '106', LowestPrice: '99',  TradeVolume: '1000' }, // 昨收100 +5%
      { Code: 'B', Name: 'B', ClosingPrice: '95',  Change: '-5',  OpeningPrice: '100', HighestPrice: '101', LowestPrice: '94',  TradeVolume: '1000' }, // 昨收100 -5%
      { Code: 'C', Name: 'C', ClosingPrice: '100', Change: '0',   OpeningPrice: '100', HighestPrice: '101', LowestPrice: '99',  TradeVolume: '500'  }, // 昨收100 0%
      { Code: 'D', Name: 'D', ClosingPrice: '110', Change: '+10', OpeningPrice: '101', HighestPrice: '110', LowestPrice: '100', TradeVolume: '2000' }, // 昨收100 +10% 漲停
      { Code: 'E', Name: 'E', ClosingPrice: '90',  Change: '-10', OpeningPrice: '99',  HighestPrice: '100', LowestPrice: '90',  TradeVolume: '2000' }, // 昨收100 -10% 跌停
    ]));

    const result = await freshTwse.fetchMarketBreadth();
    assert.equal(result.up, 2);       // A, D
    assert.equal(result.down, 2);     // B, E
    assert.equal(result.flat, 1);     // C
    assert.equal(result.limitUp, 1);  // D (≥9.9%)
    assert.equal(result.limitDown, 1);// E (≤-9.9%)
    assert.equal(result.total, 5);
    assert.equal(result.source, 'daily');
  });
});

// ─── fetchFuturesInstitutional ────────────────────────────────────────────
describe('fetchFuturesInstitutional', () => {
  it('calculates net position and daily change', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse([
      // 最新日
      { Date: '20260610', ContractCode: 'TX', InstitutionType: '外資及陸資', LongOpenInterestVolume: '50000', ShortOpenInterestVolume: '30000', LongOpenInterestAmount: '0', ShortOpenInterestAmount: '0' },
      // 前一日
      { Date: '20260609', ContractCode: 'TX', InstitutionType: '外資及陸資', LongOpenInterestVolume: '48000', ShortOpenInterestVolume: '30000', LongOpenInterestAmount: '0', ShortOpenInterestAmount: '0' },
      // 其他不相關的列
      { Date: '20260610', ContractCode: 'TE', InstitutionType: '外資及陸資', LongOpenInterestVolume: '999', ShortOpenInterestVolume: '999', LongOpenInterestAmount: '0', ShortOpenInterestAmount: '0' },
    ]));

    const result = await freshTwse.fetchFuturesInstitutional();
    assert.ok(result);
    assert.equal(result.longQty, 50000);
    assert.equal(result.shortQty, 30000);
    assert.equal(result.netQty, 20000);
    assert.equal(result.prevNetQty, 18000); // 48000-30000
    assert.equal(result.change, 2000);      // 20000-18000
  });

  it('returns null on empty response', async () => {
    delete require.cache[require.resolve('../services/twse')];
    const freshTwse = require('../services/twse');

    mockFetch(() => makeFetchResponse([]));

    const result = await freshTwse.fetchFuturesInstitutional();
    assert.equal(result, null);
  });
});
