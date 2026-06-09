/**
 * calendar.js
 * 重要事件行事曆服務：除權息、財報公布日
 *
 * 資料來源（TWSE OpenAPI，免費無需 token）：
 * - 除權息：https://openapi.twse.com.tw/v1/exchangeReport/TWT49U
 * - 上市財報：https://openapi.twse.com.tw/v1/opendata/t187ap03_L
 */

const fetch = require('node-fetch');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 60 * 60 * 4 }); // 4 小時快取

// ── 型別常數 ──────────────────────────────────────────────────────
const EVENT_TYPES = {
  DIVIDEND: 'dividend',   // 除息
  RIGHTS:   'rights',     // 除權
  EARNINGS: 'earnings',   // 財報公布
};

// ── 日期工具（純函式）────────────────────────────────────────────

/**
 * 將民國年日期字串轉為 ISO 日期字串
 * @param {string} rocDateStr  例如 "114/06/15" 或 "1140615"
 * @returns {string|null}  "2025-06-15"
 */
function rocToIso(rocDateStr) {
  if (!rocDateStr) return null;
  const s = String(rocDateStr).trim().replace(/\//g, '');
  if (s.length < 7) return null;
  // 7 碼：1140615 → 年3碼+月2碼+日2碼
  const year  = parseInt(s.slice(0, s.length - 4)) + 1911;
  const month = s.slice(-4, -2);
  const day   = s.slice(-2);
  if (isNaN(year) || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/**
 * 計算距今天數（正數=未來，負數=過去）
 * @param {string} isoDate
 * @returns {number}
 */
function daysFromToday(isoDate) {
  // 使用 UTC 日期避免時區偏移
  const todayUTC = new Date().toISOString().slice(0, 10);
  const todayMs  = new Date(todayUTC).getTime();
  const targetMs = new Date(isoDate).getTime();
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
}

/**
 * 過濾出未來 N 天內的事件（含今天）
 * @param {Array} events
 * @param {number} days
 * @returns {Array}
 */
function filterUpcoming(events, days = 30) {
  return events.filter(e => {
    const d = daysFromToday(e.date);
    return d >= 0 && d <= days;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 過濾出指定代號清單相關的事件
 * @param {Array} events
 * @param {string[]} codes
 * @returns {Array}
 */
function getEventsForCodes(events, codes) {
  const set = new Set(codes);
  return events.filter(e => set.has(e.code));
}

/**
 * 按日期分組
 * @param {Array} events
 * @returns {Object}  { "2025-06-15": [...events] }
 */
function groupByDate(events) {
  return events.reduce((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});
}

// ── 資料抓取 ──────────────────────────────────────────────────────

/**
 * 抓取當年度除權息公告
 * @returns {Promise<Array<{ code, name, date, type, amount, note }>>}
 */
async function fetchDividendEvents() {
  const cacheKey = 'calendar_dividend';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      'https://openapi.twse.com.tw/v1/exchangeReport/TWT49U',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }
    );
    const data = await res.json();

    const events = [];
    for (const row of (data || [])) {
      // 欄位：Code, Name, Date（民國年YYYYMMDD）, CashEarningsDistribution（現金股利）, StockEarningsDistribution（股票股利）
      const exDate = rocToIso(row['ExRightExDividendDate'] || row['Date'] || '');
      if (!exDate) continue;

      const cashDiv  = parseFloat(row['CashEarningsDistribution'] || 0);
      const stockDiv = parseFloat(row['StockEarningsDistribution'] || 0);

      if (cashDiv > 0) {
        events.push({
          code:   row['Code'] || row['StockCode'],
          name:   row['Name'] || row['StockName'],
          date:   exDate,
          type:   EVENT_TYPES.DIVIDEND,
          amount: cashDiv,
          note:   `現金股利 $${cashDiv}`,
          daysFromToday: daysFromToday(exDate),
        });
      }
      if (stockDiv > 0) {
        events.push({
          code:   row['Code'] || row['StockCode'],
          name:   row['Name'] || row['StockName'],
          date:   exDate,
          type:   EVENT_TYPES.RIGHTS,
          amount: stockDiv,
          note:   `股票股利 ${stockDiv} 股`,
          daysFromToday: daysFromToday(exDate),
        });
      }
    }

    cache.set(cacheKey, events);
    return events;
  } catch (err) {
    console.error('[Calendar] fetchDividendEvents error:', err.message);
    return cache.get(cacheKey) || [];
  }
}

/**
 * 抓取上市公司財報公布日
 * @returns {Promise<Array<{ code, name, date, type, note }>>}
 */
async function fetchEarningsEvents() {
  const cacheKey = 'calendar_earnings';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }
    );
    const data = await res.json();

    const events = [];
    for (const row of (data || [])) {
      // 欄位：公司代號、公司名稱、申報截止日（民國）、財務報告類別
      const dateRaw = row['申報截止日'] || row['財務報告申報截止日'] || '';
      const isoDate = rocToIso(dateRaw);
      if (!isoDate) continue;

      const code = row['公司代號'];
      const name = row['公司名稱'];
      const period = row['財務報告類別'] || row['報告類別'] || '財報';

      events.push({
        code,
        name,
        date:   isoDate,
        type:   EVENT_TYPES.EARNINGS,
        amount: null,
        note:   `${period}申報截止`,
        daysFromToday: daysFromToday(isoDate),
      });
    }

    cache.set(cacheKey, events);
    return events;
  } catch (err) {
    console.error('[Calendar] fetchEarningsEvents error:', err.message);
    return cache.get(cacheKey) || [];
  }
}

/**
 * 取得所有事件（除權息 + 財報），合併後依日期排序
 */
async function fetchAllEvents() {
  const [dividends, earnings] = await Promise.all([
    fetchDividendEvents(),
    fetchEarningsEvents(),
  ]);
  const all = [...dividends, ...earnings].sort((a, b) => a.date.localeCompare(b.date));
  // 更新每筆的 daysFromToday（cache 可能過期）
  return all.map(e => ({ ...e, daysFromToday: daysFromToday(e.date) }));
}

module.exports = {
  fetchAllEvents,
  fetchDividendEvents,
  fetchEarningsEvents,
  filterUpcoming,
  getEventsForCodes,
  groupByDate,
  rocToIso,
  daysFromToday,
  EVENT_TYPES,
};
