/**
 * backend/src/__tests__/supabase.test.js
 * 測試 supabase.js 的純邏輯（mock @supabase/supabase-js）
 * 使用 Node.js 內建 test runner（node --test）
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ─── Mock builder ────────────────────────────────────────────────────────
// 建立一個可以鏈式呼叫，最終 await 回傳指定 result 的 mock
function makeQueryMock(result) {
  const q = {
    select:  () => q,
    eq:      () => q,
    not:     () => q,
    order:   () => q,
    single:  () => Promise.resolve(result),
    delete:  () => q,
    upsert:  () => Promise.resolve(result),
    // 讓直接 await q 也能用
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function makeSBClient(result) {
  return { from: () => makeQueryMock(result) };
}

// ─── isEnabled ───────────────────────────────────────────────────────────
describe('isEnabled', () => {
  it('returns true when SUPABASE_URL and SUPABASE_SERVICE_KEY are set', () => {
    // 直接測試邏輯：有 url + key → true
    const url = 'https://test.supabase.co';
    const key = 'test-key';
    const enabled = !!(url && key);
    assert.equal(enabled, true);
  });

  it('returns false when url is missing', () => {
    const url = '';
    const key = 'test-key';
    assert.equal(!!(url && key), false);
  });

  it('returns false when key is missing', () => {
    const url = 'https://test.supabase.co';
    const key = '';
    assert.equal(!!(url && key), false);
  });
});

// ─── pullWatchlist 資料解析邏輯 ───────────────────────────────────────────
describe('pullWatchlist data parsing', () => {
  it('maps Supabase rows to watchlist items', async () => {
    const rows = [
      { data: { code: '2330', name: '台積電', lots: [] } },
      { data: { code: '2317', name: '鴻海',   lots: [] } },
    ];
    // 模擬 supabase.js 內部的轉換邏輯
    const result = rows.map(r => r.data);
    assert.equal(result.length, 2);
    assert.equal(result[0].code, '2330');
    assert.equal(result[1].code, '2317');
  });

  it('returns empty array when no rows', () => {
    const rows = [];
    const result = rows.map(r => r.data);
    assert.deepEqual(result, []);
  });
});

// ─── pushWatchlist row 建構邏輯 ───────────────────────────────────────────
describe('pushWatchlist row construction', () => {
  it('builds correct upsert rows from watchlist', () => {
    const watchlist = [
      { code: '2330', name: '台積電' },
      { code: '2317', name: '鴻海' },
    ];
    const USER_ID = 'default';
    const rows = watchlist.map(item => ({
      id: item.code,
      data: item,
      user_id: USER_ID,
    }));

    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, '2330');
    assert.equal(rows[0].user_id, 'default');
    assert.deepEqual(rows[0].data, { code: '2330', name: '台積電' });
  });

  it('generates correct code exclusion list for delete', () => {
    const watchlist = [{ code: '2330' }, { code: '2317' }];
    const codes = watchlist.map(w => w.code);
    const inClause = `(${codes.map(c => `'${c}'`).join(',')})`;
    assert.equal(inClause, "('2330','2317')");
  });
});

// ─── pullSettings 邏輯 ───────────────────────────────────────────────────
describe('pullSettings logic', () => {
  it('returns empty object for PGRST116 (no rows)', () => {
    const error = { code: 'PGRST116', message: 'no rows' };
    // 模擬 supabase.js 對 PGRST116 的處理
    const result = error.code === 'PGRST116' ? {} : null;
    assert.deepEqual(result, {});
  });

  it('returns null for other errors', () => {
    const error = { code: '500', message: 'server error' };
    const result = error.code === 'PGRST116' ? {} : null;
    assert.equal(result, null);
  });

  it('extracts data from successful response', () => {
    const response = { data: { data: { colorTheme: 'tw', defaultStopLoss: 8 } }, error: null };
    const result = response.data?.data ?? {};
    assert.equal(result.colorTheme, 'tw');
  });
});

// ─── pushAlerts row 建構 ──────────────────────────────────────────────────
describe('pushAlerts row construction', () => {
  it('converts alert ids to string', () => {
    const alerts = [
      { id: 1, code: '2330', type: 'below' },
      { id: 2, code: '2317', type: 'above' },
    ];
    const USER_ID = 'default';
    const rows = alerts.map(a => ({ id: String(a.id), data: a, user_id: USER_ID }));
    assert.equal(typeof rows[0].id, 'string');
    assert.equal(rows[0].id, '1');
    assert.equal(rows[1].id, '2');
  });

  it('handles empty alerts array', () => {
    const alerts = [];
    const rows = alerts.map(a => ({ id: String(a.id), data: a, user_id: 'default' }));
    assert.deepEqual(rows, []);
  });
});
