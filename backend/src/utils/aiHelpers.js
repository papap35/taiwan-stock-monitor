/**
 * aiHelpers.js — AI 路由共用的純計算工具
 * 所有函式均為純函式（相同輸入永遠得到相同輸出，無副作用）
 */

/**
 * 計算已出場交易的基本數字
 * @param {{ cost?: number, shares?: number, exitPrice?: number, date?: string, exitDate?: string }} lot
 * @returns {{ pnlPct: number|null, pnlAmt: number|null, holdDays: number|null }}
 */
function calcLotReviewStats(lot) {
  const { cost, shares, exitPrice, date: entryDate, exitDate } = lot;

  const pnlPct = exitPrice && cost
    ? +((((exitPrice - cost) / cost) * 100).toFixed(2))
    : null;

  const pnlAmt = exitPrice && cost && shares != null
    ? +((exitPrice - cost) * shares).toFixed(0)
    : null;

  const holdDays = entryDate && exitDate
    ? Math.round((new Date(exitDate) - new Date(entryDate)) / 86_400_000)
    : null;

  return { pnlPct, pnlAmt, holdDays };
}

/**
 * 從 K 線陣列中取出進出場日期前後各 padding 根的切片，作為 AI 分析的背景
 * candles 元素需含 { time: number }（Unix timestamp，秒）
 *
 * @param {Array<{time: number}>} candles
 * @param {string|null} entryDate  'YYYY-MM-DD'
 * @param {string|null} exitDate   'YYYY-MM-DD'
 * @param {number} padding         進出場前後各保留幾根，預設 15
 * @returns {Array<{time: number}>}
 */
function sliceContextCandles(candles, entryDate, exitDate, padding = 15) {
  if (!candles.length) return [];

  const entryTs = entryDate ? Math.floor(new Date(entryDate).getTime() / 1000) : null;
  const exitTs  = exitDate  ? Math.floor(new Date(exitDate).getTime()  / 1000) : null;

  if (!entryTs && !exitTs) return candles.slice(-40);

  const entryIdx = entryTs
    ? candles.findIndex(c => c.time >= entryTs)
    : 0;
  const exitIdx = exitTs
    ? (() => {
        for (let i = candles.length - 1; i >= 0; i--) {
          if (candles[i].time <= exitTs) return i;
        }
        return candles.length - 1;
      })()
    : candles.length - 1;

  const start = Math.max(0, (entryIdx >= 0 ? entryIdx : 0) - padding);
  const end   = Math.min(candles.length, (exitIdx >= 0 ? exitIdx : candles.length - 1) + padding);

  return candles.slice(start, end);
}

/**
 * 從近 N 根 K 線計算 AI 型態分析所需的統計數字
 * @param {Array<{high: number, low: number, close: number}>} candles
 * @returns {{ high: number|null, low: number|null, pricePosPct: number|null }}
 */
function calcPatternStats(candles) {
  if (!candles.length) return { high: null, low: null, pricePosPct: null };

  const last  = candles[candles.length - 1];
  const high  = Math.max(...candles.map(c => c.high));
  const low   = Math.min(...candles.map(c => c.low));
  const range = high - low;

  const pricePosPct = range > 0
    ? +((((last.close - low) / range) * 100).toFixed(1))
    : null;

  return { high, low, pricePosPct };
}

module.exports = { calcLotReviewStats, sliceContextCandles, calcPatternStats };
