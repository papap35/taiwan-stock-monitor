/**
 * chipScan.js
 * 籌碼異動偵測純函式（P7-34）
 * 條件：連續 3 個交易日外資買超 + 股價創 20 日新高
 */

/**
 * @param {{ time: number, fiNet: number }[]} instHistory 外資買賣超歷史（升冪，最後一筆為最新）
 * @param {{ time: number, close: number }[]} candles 日K歷史（升冪，最後一筆為最新）
 * @returns {{ matched: boolean, reason: string|null, consecutiveBuyDays: number, isNewHigh: boolean }}
 */
function detectChipSignal(instHistory, candles) {
  if (!instHistory?.length || !candles?.length) {
    return { matched: false, reason: null, consecutiveBuyDays: 0, isNewHigh: false };
  }

  // 連續外資買超天數（由最新一日往前數，中斷即停止）
  let consecutiveBuyDays = 0;
  for (let i = instHistory.length - 1; i >= 0; i--) {
    if (instHistory[i].fiNet > 0) consecutiveBuyDays++;
    else break;
  }

  // 股價創 20 日新高（取最後 20 根K棒，今日收盤 >= 區間最高收盤）
  const last20 = candles.slice(-20);
  const todayClose = candles[candles.length - 1].close;
  const maxClose = Math.max(...last20.map(c => c.close));
  const isNewHigh = last20.length > 0 && todayClose >= maxClose;

  const matched = consecutiveBuyDays >= 3 && isNewHigh;
  return {
    matched,
    reason: matched ? `連續${consecutiveBuyDays}日外資買超 + 股價創${last20.length}日新高` : null,
    consecutiveBuyDays,
    isNewHigh,
  };
}

/**
 * 對觀察池批量偵測籌碼異動
 * @param {string[]} pool 代號清單
 * @param {Record<string, {time:number,fiNet:number}[]>} instDataByCode
 * @param {Record<string, {time:number,close:number}[]>} candlesByCode
 * @returns {{ code: string, reason: string, consecutiveBuyDays: number, isNewHigh: boolean }[]}
 */
function scanWatchPool(pool, instDataByCode, candlesByCode) {
  const candidates = [];
  for (const code of pool) {
    const signal = detectChipSignal(instDataByCode[code] || [], candlesByCode[code] || []);
    if (signal.matched) {
      candidates.push({ code, reason: signal.reason, consecutiveBuyDays: signal.consecutiveBuyDays, isNewHigh: signal.isNewHigh });
    }
  }
  return candidates;
}

module.exports = { detectChipSignal, scanWatchPool };
