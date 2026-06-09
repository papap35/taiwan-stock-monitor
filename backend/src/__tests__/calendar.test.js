/**
 * calendar.test.js
 * 測試 calendar.js 純函式（不觸發真實 API 呼叫）
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  rocToIso,
  daysFromToday,
  filterUpcoming,
  getEventsForCodes,
  groupByDate,
  EVENT_TYPES,
} = require('../services/calendar');

// ── rocToIso ─────────────────────────────────────────────────────

describe('rocToIso', () => {
  it('斜線格式 114/06/15 → 2025-06-15', () => {
    assert.equal(rocToIso('114/06/15'), '2025-06-15');
  });

  it('無斜線格式 1140615 → 2025-06-15', () => {
    assert.equal(rocToIso('1140615'), '2025-06-15');
  });

  it('112/01/01 → 2023-01-01', () => {
    assert.equal(rocToIso('112/01/01'), '2023-01-01');
  });

  it('null → null', () => {
    assert.equal(rocToIso(null), null);
  });

  it('空字串 → null', () => {
    assert.equal(rocToIso(''), null);
  });

  it('過短字串 → null', () => {
    assert.equal(rocToIso('114'), null);
  });
});

// ── daysFromToday ────────────────────────────────────────────────

describe('daysFromToday', () => {
  it('今天 → 0', () => {
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(daysFromToday(today), 0);
  });

  it('明天 → 1', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    assert.equal(daysFromToday(tomorrow), 1);
  });

  it('昨天 → -1', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    assert.equal(daysFromToday(yesterday), -1);
  });
});

// ── filterUpcoming ───────────────────────────────────────────────

function makeEvent(daysOffset, code = '2330') {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const d = new Date(new Date(todayUtc).getTime() + daysOffset * 86400000).toISOString().slice(0, 10);
  return { code, name: '測試', date: d, type: EVENT_TYPES.DIVIDEND, amount: 2, note: '' };
}

describe('filterUpcoming', () => {
  it('今天的事件包含在內（days=0 以內）', () => {
    const events = [makeEvent(0), makeEvent(1), makeEvent(-1)];
    const result = filterUpcoming(events, 30);
    assert.equal(result.some(e => e.date === makeEvent(0).date), true);
    assert.equal(result.some(e => e.date === makeEvent(-1).date), false);
  });

  it('超過 days 的事件排除', () => {
    const events = [makeEvent(10), makeEvent(31)];
    const result = filterUpcoming(events, 30);
    assert.equal(result.length, 1);
    assert.equal(result[0].date, makeEvent(10).date);
  });

  it('結果依日期升冪排序', () => {
    const events = [makeEvent(5), makeEvent(2), makeEvent(8)];
    const result = filterUpcoming(events, 30);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i].date >= result[i - 1].date);
    }
  });

  it('空陣列 → 空陣列', () => {
    assert.deepEqual(filterUpcoming([], 30), []);
  });
});

// ── getEventsForCodes ────────────────────────────────────────────

describe('getEventsForCodes', () => {
  const events = [makeEvent(1, '2330'), makeEvent(2, '2317'), makeEvent(3, '2454')];

  it('只回傳指定代號', () => {
    const result = getEventsForCodes(events, ['2330', '2317']);
    assert.equal(result.length, 2);
    assert.ok(result.every(e => ['2330', '2317'].includes(e.code)));
  });

  it('代號不存在 → 空陣列', () => {
    assert.deepEqual(getEventsForCodes(events, ['9999']), []);
  });

  it('空代號清單 → 空陣列', () => {
    assert.deepEqual(getEventsForCodes(events, []), []);
  });
});

// ── groupByDate ──────────────────────────────────────────────────

describe('groupByDate', () => {
  it('相同日期的事件歸為同一組', () => {
    const today = makeEvent(0).date;
    const events = [
      { ...makeEvent(0), code: '2330' },
      { ...makeEvent(0), code: '2317' },
      makeEvent(1),
    ];
    const grouped = groupByDate(events);
    assert.equal(grouped[today].length, 2);
    assert.equal(Object.keys(grouped).length, 2);
  });

  it('空陣列 → 空物件', () => {
    assert.deepEqual(groupByDate([]), {});
  });
});
