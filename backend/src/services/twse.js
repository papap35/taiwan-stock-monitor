const fetch = require('node-fetch');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 15, checkperiod: 10 });

// 台灣證交所 API endpoints
const TWSE = {
  // 即時成交（盤中 09:00-13:30）
  REALTIME: 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp',
  // 每日收盤資料（全部股票）
  DAILY_ALL: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  // 大盤指數
  INDEX: 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX',
  // 成交量排行
  VOLUME_RANK: 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX20',
};

// 台灣常見股票代碼清單（熱門 + 大型股）
const POPULAR_STOCKS = [
  '2330', '2317', '2454', '2382', '2308',
  '2412', '2881', '2882', '2886', '2891',
  '1301', '2002', '3008', '2303', '6505',
  '2357', '2379', '3711', '2395', '2344',
  '2408', '2337', '3034', '4904', '2327',
];

/**
 * 判斷目前是否在交易時段（週一至週五 09:00-13:30 台灣時間）
 */
function isTradingHours() {
  const now = new Date();
  const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const day = twNow.getDay(); // 0=Sun, 6=Sat
  const hour = twNow.getHours();
  const min = twNow.getMinutes();
  const totalMin = hour * 60 + min;

  if (day === 0 || day === 6) return false;
  return totalMin >= 9 * 60 && totalMin <= 13 * 60 + 30;
}

/**
 * 抓取即時個股報價（盤中使用 mis.twse.com.tw）
 * @param {string[]} codes - 股票代號陣列，例如 ['2330', '2317']
 */
async function fetchRealtimeQuotes(codes) {
  const cacheKey = `rt_${codes.sort().join('_')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const exCh = codes.map(c => `tse_${c}.tw`).join('|');
    const url = `${TWSE.REALTIME}?ex_ch=${encodeURIComponent(exCh)}&_=${Date.now()}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://mis.twse.com.tw/' },
      timeout: 8000,
    });
    const data = await res.json();

    const result = {};
    (data.msgArray || []).forEach(s => {
      const code = s.c;
      const price = parseFloat(s.z) || parseFloat(s.y) || 0;
      const prevClose = parseFloat(s.y) || 0;
      result[code] = {
        code,
        name: s.n,
        price,
        prevClose,
        open: parseFloat(s.o) || 0,
        high: parseFloat(s.h) || 0,
        low: parseFloat(s.l) || 0,
        volume: parseInt(s.v) || 0,           // 成交張數
        change: price - prevClose,
        changePercent: prevClose ? +((price / prevClose - 1) * 100).toFixed(2) : 0,
        time: s.t || null,
        isTrading: isTradingHours(),
      };
    });

    cache.set(cacheKey, result, isTradingHours() ? 15 : 300);
    return result;
  } catch (err) {
    console.error('[TWSE] fetchRealtimeQuotes error:', err.message);
    // 回傳快取（如有）或空物件
    return cache.get(cacheKey) || {};
  }
}

/**
 * 抓取加權指數（大盤）
 */
async function fetchTaiex() {
  const cacheKey = 'taiex';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // 大盤即時
    const url = `${TWSE.REALTIME}?ex_ch=tse_t00.tw&_=${Date.now()}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://mis.twse.com.tw/' },
      timeout: 8000,
    });
    const data = await res.json();
    const t = data.msgArray?.[0];
    if (!t) throw new Error('No taiex data');

    const price = parseFloat(t.z) || parseFloat(t.y) || 0;
    const prevClose = parseFloat(t.y) || 0;

    const result = {
      value: price,
      prevClose,
      open: parseFloat(t.o) || 0,
      high: parseFloat(t.h) || 0,
      low: parseFloat(t.l) || 0,
      volume: parseInt(t.v) || 0,
      change: +(price - prevClose).toFixed(2),
      changePercent: prevClose ? +((price / prevClose - 1) * 100).toFixed(2) : 0,
      time: t.t || null,
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, result, isTradingHours() ? 15 : 300);
    return result;
  } catch (err) {
    console.error('[TWSE] fetchTaiex error:', err.message);
    return cache.get(cacheKey) || null;
  }
}

/**
 * 抓取每日全部股票資料（收盤後使用）
 */
async function fetchDailyAll() {
  const cacheKey = 'daily_all';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(TWSE.DAILY_ALL, { timeout: 15000 });
    const data = await res.json();

    const result = {};
    data.forEach(s => {
      const code = s.Code;
      const price = parseFloat(s.ClosingPrice?.replace(/,/g, '')) || 0;
      const prevClose = parseFloat(s.LastBestAskPrice?.replace(/,/g, '')) || price;
      result[code] = {
        code,
        name: s.Name,
        price,
        prevClose,
        open: parseFloat(s.OpeningPrice?.replace(/,/g, '')) || 0,
        high: parseFloat(s.HighestPrice?.replace(/,/g, '')) || 0,
        low: parseFloat(s.LowestPrice?.replace(/,/g, '')) || 0,
        volume: parseInt(s.TradeVolume?.replace(/,/g, '')) || 0,
        changePercent: prevClose ? +((price / prevClose - 1) * 100).toFixed(2) : 0,
      };
    });

    cache.set(cacheKey, result, 300); // 快取 5 分鐘
    return result;
  } catch (err) {
    console.error('[TWSE] fetchDailyAll error:', err.message);
    return cache.get(cacheKey) || {};
  }
}

/**
 * 抓取熱門股（依成交量排序）
 */
async function fetchHotStocks(limit = 30) {
  const cacheKey = `hot_${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    let quotes = {};
    if (isTradingHours()) {
      quotes = await fetchRealtimeQuotes(POPULAR_STOCKS);
    } else {
      const daily = await fetchDailyAll();
      POPULAR_STOCKS.forEach(c => {
        if (daily[c]) quotes[c] = daily[c];
      });
    }

    const sorted = Object.values(quotes)
      .filter(s => s.price > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, limit);

    cache.set(cacheKey, sorted, isTradingHours() ? 20 : 300);
    return sorted;
  } catch (err) {
    console.error('[TWSE] fetchHotStocks error:', err.message);
    return [];
  }
}

/**
 * 抓取漲幅榜
 */
async function fetchTopGainers(limit = 20) {
  const quotes = isTradingHours()
    ? await fetchRealtimeQuotes(POPULAR_STOCKS)
    : await fetchDailyAll().then(d => {
        const r = {};
        POPULAR_STOCKS.forEach(c => { if (d[c]) r[c] = d[c]; });
        return r;
      });

  return Object.values(quotes)
    .filter(s => s.price > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);
}

/**
 * 抓取跌幅榜
 */
async function fetchTopLosers(limit = 20) {
  const quotes = isTradingHours()
    ? await fetchRealtimeQuotes(POPULAR_STOCKS)
    : await fetchDailyAll().then(d => {
        const r = {};
        POPULAR_STOCKS.forEach(c => { if (d[c]) r[c] = d[c]; });
        return r;
      });

  return Object.values(quotes)
    .filter(s => s.price > 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);
}

/**
 * 抓取指定股票報價（支援自定義代號）
 */
async function fetchQuote(code) {
  const quotes = await fetchRealtimeQuotes([code]);
  return quotes[code] || null;
}

/**
 * 取得市場廣度（漲/跌/平 家數估算）
 */
async function fetchMarketBreadth() {
  const cacheKey = 'breadth';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const daily = await fetchDailyAll();
    let up = 0, down = 0, flat = 0;
    Object.values(daily).forEach(s => {
      if (s.changePercent > 0.05) up++;
      else if (s.changePercent < -0.05) down++;
      else flat++;
    });
    const result = { up, down, flat, total: up + down + flat };
    cache.set(cacheKey, result, 60);
    return result;
  } catch (err) {
    return { up: 0, down: 0, flat: 0, total: 0 };
  }
}

module.exports = {
  fetchTaiex,
  fetchRealtimeQuotes,
  fetchDailyAll,
  fetchHotStocks,
  fetchTopGainers,
  fetchTopLosers,
  fetchQuote,
  fetchMarketBreadth,
  isTradingHours,
  POPULAR_STOCKS,
};
