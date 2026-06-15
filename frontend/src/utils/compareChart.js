// ── 多股同列比較（疊圖）純函式（P7-26）────────────────────

export const COMPARE_PERIODS = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 };
export const MAX_COMPARE = 5;
export const COMPARE_COLORS = ['#3b82f6', '#facc15', '#f87171', '#34d399', '#a78bfa'];
export const COMPARE_STORAGE_KEY = 'compare_selected_codes';

/**
 * 將 K 線資料正規化為「期初基準日 = 0%」的漲跌幅序列
 * @param {{time: number, close: number}[]} candles
 * @returns {{time: number, pct: number}[]}
 */
export function normalizeSeries(candles) {
  if (!candles || candles.length === 0) return [];
  const base = candles[0].close;
  if (!base) return [];
  return candles.map(c => ({ time: c.time, pct: +(((c.close - base) / base) * 100).toFixed(2) }));
}

/**
 * 將多檔股票的正規化序列依時間合併為單一陣列，供 recharts 多 series 使用
 * @param {Record<string, {time: number, pct: number}[]>} seriesMap key 為股票代號
 * @returns {Array<Record<string, number>>} 每筆包含 time + 各代號的 pct 值
 */
export function mergeSeries(seriesMap) {
  const codes = Object.keys(seriesMap);
  const timeSet = new Set();
  codes.forEach(code => seriesMap[code].forEach(p => timeSet.add(p.time)));
  const times = [...timeSet].sort((a, b) => a - b);

  const lookups = Object.fromEntries(
    codes.map(code => [code, new Map(seriesMap[code].map(p => [p.time, p.pct]))]),
  );

  return times.map(time => {
    const row = { time };
    codes.forEach(code => {
      const v = lookups[code].get(time);
      if (v != null) row[code] = v;
    });
    return row;
  });
}
