/**
 * reportHelpers.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPreMarketPrompt,
  buildPostMarketPrompt,
  buildWeeklyPrompt,
  truncateForLine,
} = require('../utils/reportHelpers');

// 測試用 mock 資料
const mockTaiex = { value: 20000, changePercent: 0.5, change: 100, open: 19900, high: 20100, low: 19850, volume: 300000 };
const mockBreadth = { up: 600, down: 300, flat: 100 };
const mockInstitutional = {
  stocks: [
    { fiNet: 5000, itNet: 1000, dealerNet: -500 },
    { fiNet: -2000, itNet: 500, dealerNet: 300 },
    { fiNet: 3000, itNet: -200, dealerNet: 100 },
  ],
};
const mockWorld = [
  { name: '美股道瓊', changePercent: 0.3 },
  { name: '那斯達克', changePercent: -0.5 },
  { name: '日經225', changePercent: 1.2 },
];

// ── buildPreMarketPrompt ─────────────────────────────────────────

describe('buildPreMarketPrompt', () => {
  it('包含大盤資訊', () => {
    const p = buildPreMarketPrompt({ taiex: mockTaiex });
    assert.ok(p.includes('20,000'));
    assert.ok(p.includes('+0.5%'));
  });

  it('包含漲跌家數', () => {
    const p = buildPreMarketPrompt({ breadth: mockBreadth });
    assert.ok(p.includes('600'));
    assert.ok(p.includes('300'));
  });

  it('包含法人資料（加總）', () => {
    const p = buildPreMarketPrompt({ institutional: mockInstitutional });
    // fiNet 加總：5000 - 2000 + 3000 = 6000
    assert.ok(p.includes('+6,000'));
    // itNet 加總：1000 + 500 - 200 = 1300
    assert.ok(p.includes('+1,300'));
  });

  it('包含國際市場（最多 4 個）', () => {
    const p = buildPreMarketPrompt({ worldMarkets: mockWorld });
    assert.ok(p.includes('美股道瓊'));
    assert.ok(p.includes('那斯達克'));
  });

  it('無資料時包含佔位文字', () => {
    const p = buildPreMarketPrompt({});
    assert.ok(p.includes('無市場資料'));
  });

  it('包含開盤展望相關指令字', () => {
    const p = buildPreMarketPrompt({ taiex: mockTaiex });
    assert.ok(p.includes('盤前分析'));
  });
});

// ── buildPostMarketPrompt ────────────────────────────────────────

describe('buildPostMarketPrompt', () => {
  it('包含今日大盤資訊', () => {
    const p = buildPostMarketPrompt({ taiex: mockTaiex });
    assert.ok(p.includes('20,000'));
    assert.ok(p.includes('收盤'));
  });

  it('包含三大法人資料', () => {
    const p = buildPostMarketPrompt({ institutional: mockInstitutional });
    assert.ok(p.includes('6,000'));
  });

  it('包含盤後總結指令', () => {
    const p = buildPostMarketPrompt({});
    assert.ok(p.includes('收盤後總結'));
  });

  it('無資料時包含佔位文字', () => {
    const p = buildPostMarketPrompt({});
    assert.ok(p.includes('無市場資料'));
  });
});

// ── buildWeeklyPrompt ────────────────────────────────────────────

describe('buildWeeklyPrompt', () => {
  it('包含本週大盤資訊', () => {
    const p = buildWeeklyPrompt({ taiex: mockTaiex });
    assert.ok(p.includes('20,000'));
    assert.ok(p.includes('本週收盤大盤'));
  });

  it('包含三大法人資料（加總）', () => {
    const p = buildWeeklyPrompt({ institutional: mockInstitutional });
    assert.ok(p.includes('+6,000'));
  });

  it('包含自選股本週漲跌幅排行', () => {
    const p = buildWeeklyPrompt({
      watchlistPerf: [
        { code: '2330', name: '台積電', weeklyChangePct: 3.21 },
        { code: '2317', name: '鴻海', weeklyChangePct: -1.5 },
      ],
    });
    assert.ok(p.includes('台積電(2330)：+3.21%'));
    assert.ok(p.includes('鴻海(2317)：-1.50%'));
  });

  it('包含下週關注事件', () => {
    const p = buildWeeklyPrompt({
      upcomingEvents: [
        { code: '2330', name: '台積電', type: '除息', date: '2026-06-20' },
      ],
    });
    assert.ok(p.includes('下週關注事件'));
    assert.ok(p.includes('台積電(2330)'));
  });

  it('無資料時包含佔位文字', () => {
    const p = buildWeeklyPrompt({});
    assert.ok(p.includes('無市場資料'));
  });

  it('包含週報指令字', () => {
    const p = buildWeeklyPrompt({});
    assert.ok(p.includes('週報摘要'));
  });
});

// ── truncateForLine ──────────────────────────────────────────────

describe('truncateForLine', () => {
  it('短文字不截斷', () => {
    const text = '短文字';
    assert.equal(truncateForLine(text), text);
  });

  it('超過 900 字截斷並加提示', () => {
    const text = 'A'.repeat(950);
    const result = truncateForLine(text);
    assert.ok(result.length < 950);
    assert.ok(result.includes('訊息過長已截斷'));
  });

  it('自訂長度限制', () => {
    const text = 'B'.repeat(200);
    const result = truncateForLine(text, 100);
    assert.ok(result.length < 200);
  });

  it('null 輸入回傳 null/undefined 不報錯', () => {
    assert.equal(truncateForLine(null), null);
    assert.equal(truncateForLine(''), '');
  });
});
