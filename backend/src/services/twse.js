const fetch = require('node-fetch');
const NodeCache = require('node-cache');

// ─── 分層快取策略 ──────────────────────────────────────────────────────────
// 盤中報價（個股/大盤）：15 秒，每 10 秒清除過期項
const cacheRealtime = new NodeCache({ stdTTL: 15,   checkperiod: 10  });
// 每日廣度/法人/期貨：5 分鐘，每分鐘清除過期項
const cacheDaily    = new NodeCache({ stdTTL: 300,  checkperiod: 60  });
// 歷史K線/本益比/融資券月資料：30 分鐘
const cacheHistory  = new NodeCache({ stdTTL: 1800, checkperiod: 120 });

// 相容舊呼叫：cache 預設指向盤中快取（部分 function 直接使用 cache.set/get）
const cache = cacheRealtime;

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
  const cached = cacheRealtime.get(cacheKey);
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

    cacheRealtime.set(cacheKey, result, isTradingHours() ? 15 : 300);
    return result;
  } catch (err) {
    console.error('[TWSE] fetchRealtimeQuotes error:', err.message);
    // 回傳快取（如有）或空物件
    return cacheRealtime.get(cacheKey) || {};
  }
}

/**
 * 抓取加權指數（大盤）
 */
async function fetchTaiex() {
  const cacheKey = 'taiex';
  const cached = cacheRealtime.get(cacheKey);
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

    // t.v 對大盤（tse_t00.tw）單位為「百萬元」，除以 100 換算為「億元」
    const volumeRaw = parseInt(t.v) || 0;
    const result = {
      value: price,
      prevClose,
      open: parseFloat(t.o) || 0,
      high: parseFloat(t.h) || 0,
      low: parseFloat(t.l) || 0,
      volumeRaw,                            // 原始值（百萬元）
      volume: Math.round(volumeRaw / 100),  // 億元
      change: +(price - prevClose).toFixed(2),
      changePercent: prevClose ? +((price / prevClose - 1) * 100).toFixed(2) : 0,
      time: t.t || null,
      updatedAt: new Date().toISOString(),
    };

    cacheRealtime.set(cacheKey, result, isTradingHours() ? 15 : 300);
    return result;
  } catch (err) {
    console.error('[TWSE] fetchTaiex error:', err.message);
    return cacheRealtime.get(cacheKey) || null;
  }
}

/**
 * 抓取每日全部股票資料（收盤後使用）
 */
async function fetchDailyAll() {
  const cacheKey = 'daily_all';
  const cached = cacheDaily.get(cacheKey);
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

    cacheDaily.set(cacheKey, result, 300); // 快取 5 分鐘
    return result;
  } catch (err) {
    console.error('[TWSE] fetchDailyAll error:', err.message);
    return cacheDaily.get(cacheKey) || {};
  }
}

/**
 * 抓取熱門股（依成交量排序）
 */
async function fetchHotStocks(limit = 30) {
  const cacheKey = `hot_${limit}`;
  const cached = cacheRealtime.get(cacheKey);
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

    cacheRealtime.set(cacheKey, sorted, isTradingHours() ? 20 : 300);
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
 * 取得市場廣度（漲/跌/平/漲停/跌停 家數）
 *
 * 盤中（09:00-13:30）：使用 TWSE MI_INDEX 即時漲跌家數（含上市）
 * 盤後：使用 STOCK_DAY_ALL 收盤資料計算
 */
async function fetchMarketBreadth() {
  const cacheKey = 'breadth';
  const cached = cacheRealtime.get(cacheKey);
  if (cached) return cached;

  try {
    // ── 盤中：MI_INDEX type=MS 提供即時漲跌家數（上市市場廣度） ──
    if (isTradingHours()) {
      const breadthUrl = 'https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&type=MS';
      const breadthRes = await fetch(breadthUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      const breadthData = await breadthRes.json();

      if (breadthData.stat === 'OK' && breadthData.data) {
        // 欄位：類別 上漲 下跌 未漲跌 漲停 跌停
        // 取上市（TSE）那列，通常為 index 0 或 label='上市'
        let up = 0, down = 0, flat = 0, limitUp = 0, limitDown = 0;
        const toN = s => parseInt(String(s).replace(/,/g, '')) || 0;
        for (const row of breadthData.data) {
          if (!row[0] || !/上市/.test(row[0])) continue;
          up       = toN(row[1]);
          down     = toN(row[2]);
          flat     = toN(row[3]);
          limitUp  = toN(row[4]);
          limitDown = toN(row[5]);
          break;
        }
        // fallback：如果沒有上市列，加總所有列
        if (!up && !down) {
          for (const row of breadthData.data) {
            const toNx = s => parseInt(String(s || '0').replace(/,/g, '')) || 0;
            up       += toNx(row[1]);
            down     += toNx(row[2]);
            flat     += toNx(row[3]);
            limitUp  += toNx(row[4]);
            limitDown += toNx(row[5]);
          }
        }
        if (up || down || flat) {
          const result = { up, down, flat, limitUp, limitDown, total: up + down + flat, source: 'realtime' };
          cacheRealtime.set(cacheKey, result, 30); // 盤中 30 秒快取
          return result;
        }
      }
      // 若 MI_INDEX type=MS 失敗，fall through 到 STOCK_DAY_ALL
    }

    // ── 盤後 / fallback：STOCK_DAY_ALL 收盤資料 ──
    const daily = await fetchDailyAll();
    let up = 0, down = 0, flat = 0, limitUp = 0, limitDown = 0;
    Object.values(daily).forEach(s => {
      if (s.changePercent >= 9.9)       { limitUp++;  up++; }
      else if (s.changePercent > 0.05)  up++;
      else if (s.changePercent <= -9.9) { limitDown++; down++; }
      else if (s.changePercent < -0.05) down++;
      else flat++;
    });
    const result = { up, down, flat, limitUp, limitDown, total: up + down + flat, source: 'daily' };
    cacheRealtime.set(cacheKey, result, isTradingHours() ? 30 : 120);
    return result;
  } catch (err) {
    console.error('[TWSE] fetchMarketBreadth error:', err.message);
    return cacheRealtime.get(cacheKey) || { up: 0, down: 0, flat: 0, limitUp: 0, limitDown: 0, total: 0, source: 'error' };
  }
}

/**
 * 全市場本益比/殖利率/股價淨值比（BWIBBU_d）
 */
async function fetchValuation() {
  const cacheKey = 'valuation';
  const cached = cacheHistory.get(cacheKey);
  if (cached) return cached;

  try {
    const now = new Date();
    const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const dateStr = `${tw.getFullYear()}${String(tw.getMonth() + 1).padStart(2, '0')}${String(tw.getDate()).padStart(2, '0')}`;

    const url = `https://www.twse.com.tw/exchangeReport/BWIBBU_d?response=json&date=${dateStr}&selectType=ALL`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
    const data = await res.json();

    if (data.stat !== 'OK' || !data.data) return cacheHistory.get(cacheKey) || {};

    // 欄位：0=代號 1=名稱 2=收盤 3=殖利率% 4=股利年度 5=本益比 6=股價淨值比 7=財報年/季
    const result = {};
    data.data.forEach(row => {
      const code = row[0]?.trim();
      if (!code) return;
      result[code] = {
        code,
        name:      row[1],
        close:     parseFloat(row[2]?.replace(/,/g, '')) || 0,
        yield:     parseFloat(row[3]) || null,
        divYear:   row[4] || '',
        pe:        parseFloat(row[5]) || null,
        pb:        parseFloat(row[6]) || null,
        period:    row[7] || '',
      };
    });

    cacheHistory.set(cacheKey, result, 1800); // 快取 30 分鐘
    return result;
  } catch (err) {
    console.error('[TWSE] fetchValuation error:', err.message);
    return cacheHistory.get(cacheKey) || {};
  }
}

/**
 * 今日大盤分時 tick（MI_5MINS_INDEX，每 5 秒一筆）
 * 回傳時每 12 筆取一筆（約 1 分鐘間隔）
 */
async function fetchIntradayTick() {
  const cacheKey = 'intraday_tick';
  const cached = cacheHistory.get(cacheKey);
  if (cached) return cached;

  try {
    const url = 'https://www.twse.com.tw/exchangeReport/MI_5MINS_INDEX?response=json';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    const data = await res.json();

    if (data.stat !== 'OK' || !data.data) return cacheHistory.get(cacheKey) || { date: '', ticks: [], sectors: [] };

    const now = new Date();
    const tw = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const baseDate = { y: tw.getFullYear(), m: tw.getMonth(), d: tw.getDate() };

    // 全量資料（每 5 秒）→ 降採樣每 12 筆取 1（1 分鐘）
    const ticks = data.data
      .filter((_, i) => i % 12 === 0)
      .map(row => {
        const parts = row[0].split(':').map(Number);
        const ts = new Date(baseDate.y, baseDate.m, baseDate.d, parts[0], parts[1], parts[2] || 0);
        return {
          time:  Math.floor(ts.getTime() / 1000),
          value: parseFloat(row[1]?.replace(/,/g, '')) || 0,
        };
      })
      .filter(t => t.value > 0);

    // 同時擷取今日各類股指數（收盤時最後一筆）
    const lastRow = data.data[data.data.length - 1] || [];
    const SECTOR_COLS = [
      { name: '電子', col: 19 }, { name: '半導體', col: 20 }, { name: '金融', col: 31 },
      { name: '航運', col: 29 }, { name: '電腦週邊', col: 21 }, { name: '數位雲端', col: 35 },
    ];
    const sectors = SECTOR_COLS.map(s => ({
      name: s.name,
      value: parseFloat(lastRow[s.col]?.replace(/,/g, '')) || 0,
    })).filter(s => s.value > 0);

    const result = { date: data.date, ticks, sectors };
    cacheHistory.set(cacheKey, result, isTradingHours() ? 60 : 3600);
    return result;
  } catch (err) {
    console.error('[TWSE] fetchIntradayTick error:', err.message);
    return cacheHistory.get(cacheKey) || { date: '', ticks: [], sectors: [] };
  }
}

/**
 * 取得今日三大法人全市場買賣超排行
 */
async function fetchInstitutionalAll() {
  const cacheKey = 'inst_all';
  const cached = cacheDaily.get(cacheKey);
  if (cached) return cached;

  try {
    const now = new Date();
    const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const dateStr = `${twNow.getFullYear()}${String(twNow.getMonth() + 1).padStart(2, '0')}${String(twNow.getDate()).padStart(2, '0')}`;

    const url = `https://www.twse.com.tw/fund/T86?response=json&date=${dateStr}&selectType=ALLBUT0999`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 });
    const data = await res.json();

    if (data.stat !== 'OK' || !data.data) {
      // 嘗試前一個交易日
      return cacheDaily.get(cacheKey) || { date: dateStr, stocks: [] };
    }

    // 欄位：0=代號 1=名稱 2=外資買 3=外資賣 4=外資超 5=外資自營買 6=自營賣 7=自營超
    //       8=投信買 9=投信賣 10=投信超 11=自營(自)超 12=自營(避)超 13=三大合計
    const toN = s => parseInt(String(s).replace(/,/g, '')) || 0;
    const stocks = data.data.map(row => ({
      code:        row[0],
      name:        row[1],
      fiBuy:       toN(row[2]),
      fiSell:      toN(row[3]),
      fiNet:       toN(row[4]),  // 外資買賣超
      itBuy:       toN(row[8]),
      itSell:      toN(row[9]),
      itNet:       toN(row[10]), // 投信買賣超
      dealerNet:   toN(row[11]) + toN(row[12]), // 自營商合計
      totalNet:    toN(row[13]), // 三大法人合計
    })).filter(s => s.code && /^\d{4}$/.test(s.code));

    const result = { date: dateStr, stocks };
    cacheDaily.set(cacheKey, result, isTradingHours() ? 300 : 3600);
    return result;
  } catch (err) {
    console.error('[TWSE] fetchInstitutionalAll error:', err.message);
    return cacheDaily.get(cacheKey) || { date: '', stocks: [] };
  }
}

/**
 * 取得個股三大法人歷史（BFIAUU，以月為單位）
 * @param {string} code 股票代號
 * @param {number} months 月數
 */
async function fetchInstitutionalStock(code, months = 3) {
  const cacheKey = `inst_${code}_${months}`;
  const cached = cacheDaily.get(cacheKey);
  if (cached) return cached;

  try {
    const results = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
      const url = `https://www.twse.com.tw/fund/BFIAUU?response=json&date=${dateStr}&stockNo=${code}`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const data = await res.json();
        if (data.stat !== 'OK' || !data.data) continue;

        // 欄位: 0=日期 3=外資淨 9=投信淨 14=自營淨 16=三大合計（千股）
        for (const row of data.data) {
          const parts = row[0].trim().split('/');
          if (parts.length !== 3) continue;
          const year = parseInt(parts[0]) + 1911;
          const month = parts[1].padStart(2, '0');
          const day = parts[2].padStart(2, '0');
          const time = Math.floor(new Date(`${year}-${month}-${day}T00:00:00+08:00`).getTime() / 1000);
          const toN = s => parseInt(String(s).replace(/,/g, '')) || 0;
          results.push({
            time,
            fiNet:     toN(row[3]),
            itNet:     toN(row[9]),
            dealerNet: toN(row[14]),
            totalNet:  toN(row[16]),
          });
        }
      } catch (e) {
        console.warn(`[TWSE] fetchInstitutionalStock ${code} ${dateStr}:`, e.message);
      }
    }

    results.sort((a, b) => a.time - b.time);
    cacheDaily.set(cacheKey, results, 3600);
    return results;
  } catch (err) {
    console.error('[TWSE] fetchInstitutionalStock error:', err.message);
    return [];
  }
}

/**
 * 取得個股融資融券歷史（MARGIN_PURCHASE_SHORT_SALE，以月為單位）
 * @param {string} code 股票代號
 * @param {number} months 月數
 */
async function fetchMarginStock(code, months = 3) {
  const cacheKey = `margin_${code}_${months}`;
  const cached = cacheDaily.get(cacheKey);
  if (cached) return cached;

  try {
    const results = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
      const url = `https://www.twse.com.tw/exchangeReport/MARGIN_PURCHASE_SHORT_SALE?response=json&date=${dateStr}&stockNo=${code}`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const data = await res.json();
        if (data.stat !== 'OK' || !data.data) continue;

        // 欄位：0=日期 1=融資買進 2=融資賣出 3=現金償還 4=前日融資餘額 5=今日融資餘額
        //       9=融券賣出 10=融券買進 11=現券償還 12=前日融券餘額 13=今日融券餘額
        for (const row of data.data) {
          const parts = row[0].trim().split('/');
          if (parts.length !== 3) continue;
          const year = parseInt(parts[0]) + 1911;
          const month = parts[1].padStart(2, '0');
          const day = parts[2].padStart(2, '0');
          const time = Math.floor(new Date(`${year}-${month}-${day}T00:00:00+08:00`).getTime() / 1000);
          const toN = s => parseInt(String(s).replace(/,/g, '')) || 0;
          results.push({
            time,
            marginBal:  toN(row[5]),  // 融資餘額（張）
            shortBal:   toN(row[13]), // 融券餘額（張）
            marginBuy:  toN(row[1]),
            marginSell: toN(row[2]),
            shortSell:  toN(row[9]),
            shortBuy:   toN(row[10]),
          });
        }
      } catch (e) {
        console.warn(`[TWSE] fetchMarginStock ${code} ${dateStr}:`, e.message);
      }
    }

    results.sort((a, b) => a.time - b.time);
    cacheDaily.set(cacheKey, results, 3600);
    return results;
  } catch (err) {
    console.error('[TWSE] fetchMarginStock error:', err.message);
    return [];
  }
}

/**
 * 抓取個股歷史日K資料（TWSE STOCK_DAY，以月為單位）
 * @param {string} code - 股票代號，例如 '2330'
 * @param {number} months - 要抓幾個月，預設 3
 */
async function fetchHistory(code, months = 3) {
  const cacheKey = `hist_${code}_${months}`;
  const cached = cacheHistory.get(cacheKey);
  if (cached) return cached;

  try {
    const results = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`;

      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000,
        });
        const data = await res.json();

        if (data.stat !== 'OK' || !data.data) continue;

        // 欄位：日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數
        for (const row of data.data) {
          const [twDate, , , open, high, low, close, , volume] = row;
          // 民國年轉西元：113/01/02 → 2024-01-02
          const parts = twDate.trim().split('/');
          if (parts.length !== 3) continue;
          const year = parseInt(parts[0]) + 1911;
          const month = parts[1].padStart(2, '0');
          const day = parts[2].padStart(2, '0');
          const time = Math.floor(new Date(`${year}-${month}-${day}T00:00:00+08:00`).getTime() / 1000);

          const toNum = s => parseFloat(String(s).replace(/,/g, '')) || 0;
          const o = toNum(open), h = toNum(high), l = toNum(low), c = toNum(close);
          if (!o || !h || !l || !c) continue;

          results.push({ time, open: o, high: h, low: l, close: c, volume: toNum(volume) });
        }
      } catch (e) {
        console.warn(`[TWSE] fetchHistory ${code} ${dateStr}:`, e.message);
      }
    }

    // 依時間排序並去重
    results.sort((a, b) => a.time - b.time);
    const unique = results.filter((r, i) => i === 0 || r.time !== results[i - 1].time);

    cacheHistory.set(cacheKey, unique, 3600); // 快取 1 小時
    return unique;
  } catch (err) {
    console.error('[TWSE] fetchHistory error:', err.message);
    return cacheHistory.get(cacheKey) || [];
  }
}

/**
 * 抓取國際主要指數（Yahoo Finance 免費 API）
 * 含美股三大指數、日經、恆生、韓股、美元/台幣、WTI 原油
 */
async function fetchWorldMarkets() {
  const cacheKey = 'world_markets';
  const cached = cacheDaily.get(cacheKey);
  if (cached) return cached;

  const SYMBOLS = [
    { symbol: '^GSPC',    name: 'S&P 500',    region: 'US',  type: 'index' },
    { symbol: '^DJI',     name: 'DJIA',        region: 'US',  type: 'index' },
    { symbol: '^IXIC',    name: 'NASDAQ',      region: 'US',  type: 'index' },
    { symbol: '^N225',    name: '日經 225',    region: 'JP',  type: 'index' },
    { symbol: '^HSI',     name: '恆生指數',    region: 'HK',  type: 'index' },
    { symbol: '^KS11',    name: 'KOSPI',       region: 'KR',  type: 'index' },
    { symbol: 'USDTWD=X', name: '美元/台幣',   region: 'FX',  type: 'fx' },
    { symbol: 'CL=F',     name: 'WTI 原油',    region: 'CM',  type: 'commodity' },
    { symbol: 'GC=F',     name: '黃金',        region: 'CM',  type: 'commodity' },
  ];

  const results = await Promise.allSettled(
    SYMBOLS.map(async (s) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)', 'Accept': 'application/json' },
        timeout: 8000,
      });
      const json = await res.json();
      const meta = json.chart?.result?.[0]?.meta;
      if (!meta) throw new Error('no data');
      const price = meta.regularMarketPrice ?? 0;
      const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
      const chg   = price - prev;
      const chgPct = prev ? (chg / prev * 100) : 0;
      return {
        ...s,
        price:         +price.toFixed(s.type === 'fx' ? 3 : 2),
        prevClose:     +prev.toFixed(2),
        change:        +chg.toFixed(2),
        changePercent: +chgPct.toFixed(2),
        marketState:   meta.marketState || 'CLOSED',
      };
    })
  );

  const data = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  cacheDaily.set(cacheKey, data, isTradingHours() ? 120 : 600);
  return data;
}

/**
 * 抓取三大法人期貨部位（台指期外資淨多空）
 * 資料來源：台灣期交所 TAIFEX opendata
 * 回傳：{ date, longQty, shortQty, netQty, prevNetQty, change }
 */
async function fetchFuturesInstitutional() {
  const cacheKey = 'futures_inst';
  const cached = cacheDaily.get(cacheKey);
  if (cached) return cached;

  try {
    // TAIFEX 三大法人期貨 opendata
    const url = 'https://opendata.taifex.com.tw/v1/ThreeLargeTraders';
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      timeout: 10000,
    });
    const data = await res.json();

    // 找出最新日期的臺股期貨(TX)外資及陸資資料
    // 欄位：Date, ContractCode, InstitutionType, LongOpenInterestVolume,
    //       ShortOpenInterestVolume, LongOpenInterestAmount, ShortOpenInterestAmount
    const TX_CODE  = 'TX';
    const FI_TYPE  = '外資及陸資'; // Foreign Institutional Investors

    if (!Array.isArray(data) || !data.length) throw new Error('empty response');

    // 取最新兩日資料（用於計算日變化）
    const txRows = data.filter(r =>
      (r.ContractCode || '').trim() === TX_CODE &&
      (r.InstitutionType || '').trim() === FI_TYPE
    );

    if (!txRows.length) throw new Error('TX FI rows not found');

    // 依日期降冪排列
    txRows.sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
    const latest = txRows[0];
    const prev   = txRows[1];

    const toN = v => parseInt(String(v || '0').replace(/,/g, '')) || 0;
    const longQty    = toN(latest.LongOpenInterestVolume);
    const shortQty   = toN(latest.ShortOpenInterestVolume);
    const netQty     = longQty - shortQty;
    const prevNetQty = prev ? toN(prev.LongOpenInterestVolume) - toN(prev.ShortOpenInterestVolume) : null;
    const change     = prevNetQty !== null ? netQty - prevNetQty : null;

    const result = {
      date: latest.Date,
      longQty,
      shortQty,
      netQty,
      prevNetQty,
      change,
    };

    cacheDaily.set(cacheKey, result, isTradingHours() ? 60 : 600);
    return result;
  } catch (err) {
    console.warn('[TAIFEX] fetchFuturesInstitutional error:', err.message);
    return cacheDaily.get(cacheKey) || null;
  }
}

/**
 * 抓取全市場融資融券趨勢（近 20 個交易日）
 * 資料來源：TWSE MI_MARGN（每月匯總，免費公開）
 * 回傳：[{ date, marginBal, shortBal, ratio }]  依日期升冪
 */
async function fetchMarketMarginTrend() {
  const cacheKey = 'market_margin_trend';
  const cached = cacheDaily.get(cacheKey);
  if (cached) return cached;

  try {
    const now   = new Date();
    const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

    const fetchMonth = async (year, month) => {
      const dateStr = `${year}${String(month).padStart(2, '0')}01`;
      const url = `https://www.twse.com.tw/fund/MI_MARGN?response=json&date=${dateStr}&selectType=MS`;
      const res  = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 });
      const data = await res.json();
      if (data.stat !== 'OK' || !data.data) return [];

      // 欄位（selectType=MS 為市場合計）：
      // 0=日期 1=融資買進 2=融資賣出 3=融資現償 4=融資餘額 5=融資限額
      // 6=融券賣出 7=融券買進 8=融券現償 9=融券餘額 10=融券限額 11=資券互抵
      return data.data.map(row => {
        const toN = s => parseInt(String(s || '0').replace(/,/g, '')) || 0;
        const marginBal = toN(row[4]); // 融資餘額（千股）→ 轉為億元：×1000股×股價，這裡先存千股
        const shortBal  = toN(row[9]); // 融券餘額（千股）
        // 日期格式：民國年/月/日 → 轉 ISO
        const [y, m, d] = String(row[0]).split('/');
        const isoDate   = `${parseInt(y) + 1911}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        return {
          date:      isoDate,
          marginBal,
          shortBal,
          ratio: marginBal > 0 ? +(shortBal / marginBal * 100).toFixed(2) : 0,
        };
      });
    };

    // 抓當月 + 上月，確保能湊到 20 個交易日
    const thisMonth = await fetchMonth(twNow.getFullYear(), twNow.getMonth() + 1);
    let rows = [...thisMonth];

    if (rows.length < 20) {
      const prev = twNow.getMonth() === 0
        ? await fetchMonth(twNow.getFullYear() - 1, 12)
        : await fetchMonth(twNow.getFullYear(), twNow.getMonth());
      rows = [...prev, ...rows];
    }

    // 依日期升冪，取最後 20 筆
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const result = rows.slice(-20);

    cacheDaily.set(cacheKey, result, isTradingHours() ? 300 : 3600);
    return result;
  } catch (err) {
    console.warn('[TWSE] fetchMarketMarginTrend error:', err.message);
    return cacheDaily.get(cacheKey) || [];
  }
}

/**
 * 抓取大盤加權指數歷史日收盤資料（TWSE MI_5MINS_HIST，以月為單位）
 * @param {number} months - 要抓幾個月，預設 3
 * @returns {{time: number, close: number}[]}
 */
async function fetchTaiexHistory(months = 3) {
  const cacheKey = `taiex_hist_${months}`;
  const cached = cacheHistory.get(cacheKey);
  if (cached) return cached;

  try {
    const results = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
      const url = `https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?response=json&date=${dateStr}`;

      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const data = await res.json();

        if (data.stat !== 'OK' || !data.data) continue;

        // 欄位：日期, 開盤指數, 最高指數, 最低指數, 收盤指數
        for (const row of data.data) {
          const [twDate, , , , close] = row;
          const parts = twDate.trim().split('/');
          if (parts.length !== 3) continue;
          const year = parseInt(parts[0]) + 1911;
          const month = parts[1].padStart(2, '0');
          const day = parts[2].padStart(2, '0');
          const time = Math.floor(new Date(`${year}-${month}-${day}T00:00:00+08:00`).getTime() / 1000);
          const c = parseFloat(String(close).replace(/,/g, '')) || 0;
          if (!c) continue;
          results.push({ time, close: c });
        }
      } catch (e) {
        console.warn(`[TWSE] fetchTaiexHistory ${dateStr}:`, e.message);
      }
    }

    results.sort((a, b) => a.time - b.time);
    const unique = results.filter((r, i) => i === 0 || r.time !== results[i - 1].time);
    cacheHistory.set(cacheKey, unique, 3600);
    return unique;
  } catch (err) {
    console.error('[TWSE] fetchTaiexHistory error:', err.message);
    return cacheHistory.get(cacheKey) || [];
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
  fetchHistory,
  fetchValuation,
  fetchIntradayTick,
  fetchInstitutionalAll,
  fetchInstitutionalStock,
  fetchMarginStock,
  fetchWorldMarkets,
  fetchFuturesInstitutional,
  fetchMarketMarginTrend,
  fetchTaiexHistory,
  isTradingHours,
  POPULAR_STOCKS,
};
