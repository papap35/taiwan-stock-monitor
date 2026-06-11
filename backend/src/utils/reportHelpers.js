/**
 * reportHelpers.js
 * 自動 AI 簡報的 prompt 建構純函式
 * 不依賴任何 HTTP 請求，可獨立測試
 */

/**
 * 建構盤前分析 prompt
 * @param {{ taiex, breadth, institutional, worldMarkets }} ctx
 * @returns {string}
 */
function buildPreMarketPrompt(ctx = {}) {
  const { taiex, breadth, institutional, worldMarkets } = ctx;
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

  let market = '';
  if (taiex) {
    market += `\n【昨日大盤】
加權指數：${taiex.value?.toLocaleString()} 點（${taiex.changePercent >= 0 ? '+' : ''}${taiex.changePercent}%）
成交量：約 ${taiex.volume ? (taiex.volume / 100).toFixed(0) : '?'} 億元`;
  }
  if (breadth) {
    market += `\n上漲：${breadth.up} 家，下跌：${breadth.down} 家，平盤：${breadth.flat} 家`;
  }
  if (institutional?.stocks?.length) {
    // 加總全市場三大法人買賣超（單位：張，除以 1000 換算為千張/億）
    const totFi = institutional.stocks.reduce((s, r) => s + (r.fiNet || 0), 0);
    const totIt = institutional.stocks.reduce((s, r) => s + (r.itNet || 0), 0);
    const totDl = institutional.stocks.reduce((s, r) => s + (r.dealerNet || 0), 0);
    market += `\n【昨日三大法人（全市場合計）】
外資：${totFi >= 0 ? '+' : ''}${totFi.toLocaleString()} 張
投信：${totIt >= 0 ? '+' : ''}${totIt.toLocaleString()} 張
自營商：${totDl >= 0 ? '+' : ''}${totDl.toLocaleString()} 張`;
  }
  if (worldMarkets && worldMarkets.length) {
    const parts = worldMarkets.slice(0, 4).map(m => `${m.name} ${m.changePercent >= 0 ? '+' : ''}${m.changePercent}%`);
    market += `\n【國際市場】${parts.join('，')}`;
  }

  return `現在時間：${now}（台灣），即將開盤。

${market || '（無市場資料）'}

請提供今日盤前分析，包含：
1. 昨日市場總結與今日開盤展望
2. 法人籌碼動向解讀（如有資料）
3. 國際市場對台股的影響（如有資料）
4. 今日值得關注的方向與操作策略
5. 主要風險提醒

格式：條列式，每點 1-2 句，最後一行給出今日操作基調（積極偏多/保守觀望/偏空防守）。`;
}

/**
 * 建構盤後總結 prompt
 * @param {{ taiex, breadth, institutional }} ctx
 * @returns {string}
 */
function buildPostMarketPrompt(ctx = {}) {
  const { taiex, breadth, institutional } = ctx;
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

  let market = '';
  if (taiex) {
    market += `\n【今日大盤】
加權指數：${taiex.value?.toLocaleString()} 點（${taiex.changePercent >= 0 ? '+' : ''}${taiex.changePercent}%）
開盤：${taiex.open?.toLocaleString()}，最高：${taiex.high?.toLocaleString()}，最低：${taiex.low?.toLocaleString()}
成交量：約 ${taiex.volume ? (taiex.volume / 100).toFixed(0) : '?'} 億元`;
  }
  if (breadth) {
    market += `\n上漲：${breadth.up} 家，下跌：${breadth.down} 家，平盤：${breadth.flat} 家`;
  }
  if (institutional?.stocks?.length) {
    const totFi = institutional.stocks.reduce((s, r) => s + (r.fiNet || 0), 0);
    const totIt = institutional.stocks.reduce((s, r) => s + (r.itNet || 0), 0);
    const totDl = institutional.stocks.reduce((s, r) => s + (r.dealerNet || 0), 0);
    market += `\n【今日三大法人（全市場合計）】
外資：${totFi >= 0 ? '+' : ''}${totFi.toLocaleString()} 張
投信：${totIt >= 0 ? '+' : ''}${totIt.toLocaleString()} 張
自營商：${totDl >= 0 ? '+' : ''}${totDl.toLocaleString()} 張`;
  }

  return `現在時間：${now}（台灣），今日收盤。

${market || '（無市場資料）'}

請提供今日收盤後總結，包含：
1. 今日盤勢覆盤（強弱、量能、類股表現）
2. 法人籌碼解讀（買賣方向代表的意涵）
3. 技術面觀察（指數位置、重要支撐壓力）
4. 明日開盤前需關注的重點
5. 操作建議（持股、減碼或觀望）

格式：條列式，每點 1-2 句，最後一行給出持股信心度（高/中/低）與理由。`;
}

/**
 * 建構週報摘要 prompt
 * @param {{ taiex, breadth, institutional, watchlistPerf, upcomingEvents }} ctx
 *   - watchlistPerf: [{ code, name, weeklyChangePct }]（依漲跌幅排序）
 *   - upcomingEvents: [{ code, name, type, date }]（未來 7 天事件）
 * @returns {string}
 */
function buildWeeklyPrompt(ctx = {}) {
  const { taiex, breadth, institutional, watchlistPerf, upcomingEvents } = ctx;
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

  let market = '';
  if (taiex) {
    market += `\n【本週收盤大盤】
加權指數：${taiex.value?.toLocaleString()} 點（${taiex.changePercent >= 0 ? '+' : ''}${taiex.changePercent}%）`;
  }
  if (breadth) {
    market += `\n上漲：${breadth.up} 家，下跌：${breadth.down} 家，平盤：${breadth.flat} 家`;
  }
  if (institutional?.stocks?.length) {
    const totFi = institutional.stocks.reduce((s, r) => s + (r.fiNet || 0), 0);
    const totIt = institutional.stocks.reduce((s, r) => s + (r.itNet || 0), 0);
    const totDl = institutional.stocks.reduce((s, r) => s + (r.dealerNet || 0), 0);
    market += `\n【三大法人（最近交易日合計）】
外資：${totFi >= 0 ? '+' : ''}${totFi.toLocaleString()} 張
投信：${totIt >= 0 ? '+' : ''}${totIt.toLocaleString()} 張
自營商：${totDl >= 0 ? '+' : ''}${totDl.toLocaleString()} 張`;
  }

  let watchlist = '';
  if (watchlistPerf && watchlistPerf.length) {
    const lines = watchlistPerf.map(s =>
      `${s.name}(${s.code})：${s.weeklyChangePct >= 0 ? '+' : ''}${s.weeklyChangePct.toFixed(2)}%`);
    watchlist = `\n【自選股本週漲跌幅】\n${lines.join('\n')}`;
  }

  let events = '';
  if (upcomingEvents && upcomingEvents.length) {
    const lines = upcomingEvents.map(e => `${e.date} ${e.name}(${e.code}) ${e.type}`);
    events = `\n【下週關注事件】\n${lines.join('\n')}`;
  }

  return `現在時間：${now}（台灣），本週交易週期已結束。

${market || '（無市場資料）'}
${watchlist}
${events}

請提供本週週報摘要，包含：
1. 本週大盤走勢總結
2. 自選股本週表現排行與簡評（如有資料）
3. 三大法人籌碼變化解讀（如有資料）
4. 技術面轉折提醒（如有明顯轉折訊號）
5. 下週關注事件與操作建議（如有資料）

格式：條列式，每點 1-3 句，最後一行給出下週整體操作基調（積極偏多/保守觀望/偏空防守）。`;
}

/**
 * 將 AI 回應截斷至適合 LINE 推播的長度（LINE 訊息上限 1000 字）
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncateForLine(text, maxLen = 900) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n\n（訊息過長已截斷，請至 TaiFin 查看完整分析）';
}

module.exports = {
  buildPreMarketPrompt,
  buildPostMarketPrompt,
  buildWeeklyPrompt,
  truncateForLine,
};
