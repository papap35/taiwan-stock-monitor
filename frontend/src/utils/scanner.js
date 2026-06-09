/**
 * scanner.js — 條件選股掃描器純計算邏輯
 * 所有函式均為純函式，不依賴任何 React / store / API。
 */

import { calcVolumeRatio, calcVolumeMA } from './portfolio';

// ─── 條件定義 ────────────────────────────────────────────────

/**
 * 所有可用篩選條件的 metadata
 * id 作為唯一鍵；group 用於 UI 分組；check(data) 回傳 { pass, value, label }
 * data = { quote, candles, inst, margin, valuation }
 */
export const SCAN_CONDITIONS = [
  // 技術面
  {
    id: 'rsi_oversold',
    group: '技術面',
    label: 'RSI < 30（超賣）',
    desc: '近 14 日 RSI 低於 30，可能超賣',
    needsCandles: true,
  },
  {
    id: 'break_60d_high',
    group: '技術面',
    label: '突破 60 日高點',
    desc: '今日收盤創近 60 個交易日新高',
    needsCandles: true,
  },
  {
    id: 'above_ma60',
    group: '技術面',
    label: '站上季線（MA60）',
    desc: '收盤 > MA60',
    needsCandles: true,
  },
  {
    id: 'volume_surge',
    group: '技術面',
    label: '量比 > 1.5（放量）',
    desc: '今日成交量超過 5 日均量 1.5 倍',
    needsCandles: true,
  },
  {
    id: 'kd_golden',
    group: '技術面',
    label: 'KD 黃金交叉',
    desc: 'K 線由下往上穿越 D 線',
    needsCandles: true,
  },
  // 籌碼面
  {
    id: 'fi_buy_3d',
    group: '籌碼面',
    label: '外資連 3 日買超',
    desc: '外資近 3 個交易日均為買超',
    needsInst: true,
  },
  {
    id: 'it_buy',
    group: '籌碼面',
    label: '投信買超',
    desc: '最近一日投信為買超',
    needsInst: true,
  },
  {
    id: 'margin_decrease',
    group: '籌碼面',
    label: '融資餘額減少',
    desc: '最近一日融資餘額低於前一日（籌碼乾淨）',
    needsMargin: true,
  },
  // 基本面
  {
    id: 'pe_low',
    group: '基本面',
    label: 'PE < 15',
    desc: '本益比低於 15 倍',
    needsValuation: true,
  },
  {
    id: 'yield_high',
    group: '基本面',
    label: '殖利率 > 5%',
    desc: '現金殖利率高於 5%',
    needsValuation: true,
  },
  {
    id: 'pb_low',
    group: '基本面',
    label: 'PB < 1.5',
    desc: '股價淨值比低於 1.5 倍',
    needsValuation: true,
  },
  // 量能
  {
    id: 'vol_ratio_high',
    group: '量能',
    label: '量比 > 2（強力放量）',
    desc: '今日成交量超過 5 日均量 2 倍',
    needsCandles: true,
  },
  {
    id: 'turnover_high',
    group: '量能',
    label: '成交量 > 1 億元',
    desc: '今日成交金額超過 1 億元',
    needsQuote: true,
  },
];

export const CONDITION_MAP = Object.fromEntries(SCAN_CONDITIONS.map(c => [c.id, c]));

// ─── 技術指標計算（純函式）────────────────────────────────────

/**
 * 計算 RSI(14)
 * @param {Array<{close:number}>} candles
 * @returns {number|null}
 */
export function calcRSI14(candles) {
  if (candles.length < 15) return null;
  const recent = candles.slice(-15);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i].close - recent[i - 1].close;
    if (i <= 14) {
      avgGain += Math.max(0, diff) / 14;
      avgLoss += Math.max(0, -diff) / 14;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

/**
 * 計算 MA(n) 最新值
 * @param {Array<{close:number}>} candles
 * @param {number} period
 * @returns {number|null}
 */
export function calcMAValue(candles, period) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  return +(slice.reduce((s, c) => s + c.close, 0) / period).toFixed(2);
}

/**
 * 計算最近 N 根 K 棒的最高收盤價
 * @param {Array<{high:number}>} candles
 * @param {number} n
 * @returns {number|null}
 */
export function calcHighN(candles, n) {
  if (candles.length < n) return null;
  return Math.max(...candles.slice(-n).map(c => c.high));
}

/**
 * 計算 KD（隨機指標）最新 K、D 值，並判斷是否黃金交叉
 * @param {Array<{high:number,low:number,close:number}>} candles
 * @param {number} period
 * @returns {{ k: number|null, d: number|null, golden: boolean }}
 */
export function calcKDLatest(candles, period = 9) {
  if (candles.length < period + 1) return { k: null, d: null, golden: false };

  const rsv = (candle, slice) => {
    const high = Math.max(...slice.map(c => c.high));
    const low  = Math.min(...slice.map(c => c.low));
    return high === low ? 50 : ((candle.close - low) / (high - low)) * 100;
  };

  let k = 50, d = 50;
  let prevK = 50, prevD = 50;

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const r = rsv(candles[i], slice);
    prevK = k; prevD = d;
    k = +(prevK * 2 / 3 + r / 3).toFixed(2);
    d = +(prevD * 2 / 3 + k / 3).toFixed(2);
  }

  // 黃金交叉：前一根 K < D，現在 K > D
  const golden = prevK < prevD && k > d;
  return { k, d, golden };
}

// ─── 核心掃描函式 ─────────────────────────────────────────────

/**
 * 對單一股票執行所有選取條件的檢查
 * @param {{ quote, candles, inst, margin, valuation }} data  各項資料
 * @param {string[]} conditionIds  要檢查的條件 id 清單
 * @returns {Array<{ id, pass, displayValue }>}
 */
export function checkConditions(data, conditionIds) {
  const { quote = null, candles = [], inst = [], margin = [], valuation = null } = data;

  return conditionIds.map(id => {
    let pass = false;
    let displayValue = '—';

    switch (id) {
      case 'rsi_oversold': {
        const rsi = calcRSI14(candles);
        pass = rsi != null && rsi < 30;
        displayValue = rsi != null ? `RSI ${rsi}` : '—';
        break;
      }
      case 'break_60d_high': {
        const high60 = calcHighN(candles, 61); // 取前 60 根的高點（不含今日）
        const last = candles[candles.length - 1];
        if (high60 != null && last) {
          const prev60High = calcHighN(candles.slice(0, -1), 60);
          pass = prev60High != null && last.close > prev60High;
          displayValue = prev60High != null ? `今 ${last.close} / 60日高 ${prev60High}` : '—';
        }
        break;
      }
      case 'above_ma60': {
        const ma60 = calcMAValue(candles, 60);
        const last = candles[candles.length - 1];
        pass = ma60 != null && last != null && last.close > ma60;
        displayValue = ma60 != null ? `MA60 ${ma60}` : '—';
        break;
      }
      case 'volume_surge': {
        const vr = calcVolumeRatio(candles, 5);
        pass = vr != null && vr > 1.5;
        displayValue = vr != null ? `量比 ${vr.toFixed(2)}` : '—';
        break;
      }
      case 'kd_golden': {
        const { k, d, golden } = calcKDLatest(candles);
        pass = golden;
        displayValue = k != null ? `K ${k} / D ${d}` : '—';
        break;
      }
      case 'fi_buy_3d': {
        const last3 = inst.slice(-3);
        pass = last3.length >= 3 && last3.every(r => (r.fiNet ?? 0) > 0);
        const total = last3.reduce((s, r) => s + (r.fiNet ?? 0), 0);
        displayValue = last3.length > 0 ? `外資近3日 ${total >= 0 ? '+' : ''}${Math.round(total / 1000)}張` : '—';
        break;
      }
      case 'it_buy': {
        const last = inst[inst.length - 1];
        pass = last != null && (last.itNet ?? 0) > 0;
        displayValue = last != null ? `投信 ${(last.itNet ?? 0) >= 0 ? '+' : ''}${Math.round((last.itNet ?? 0) / 1000)}張` : '—';
        break;
      }
      case 'margin_decrease': {
        const l = margin[margin.length - 1];
        const p = margin[margin.length - 2];
        pass = l != null && p != null && l.marginBal < p.marginBal;
        displayValue = l != null ? `融資 ${l.marginBal?.toLocaleString()}張` : '—';
        break;
      }
      case 'pe_low': {
        const pe = valuation?.pe;
        pass = pe != null && pe > 0 && pe < 15;
        displayValue = pe != null && pe > 0 ? `PE ${pe}` : '—';
        break;
      }
      case 'yield_high': {
        const y = valuation?.dividendYield;
        pass = y != null && y > 5;
        displayValue = y != null ? `殖利率 ${y}%` : '—';
        break;
      }
      case 'pb_low': {
        const pb = valuation?.pb;
        pass = pb != null && pb > 0 && pb < 1.5;
        displayValue = pb != null ? `PB ${pb}` : '—';
        break;
      }
      case 'vol_ratio_high': {
        const vr = calcVolumeRatio(candles, 5);
        pass = vr != null && vr > 2;
        displayValue = vr != null ? `量比 ${vr.toFixed(2)}` : '—';
        break;
      }
      case 'turnover_high': {
        // quote.volume 單位為張，成交金額 ≈ volume * price（粗估）
        const price = quote?.price;
        const vol   = quote?.volume; // 千股
        const turnover = price && vol ? (price * vol * 1000) : null;
        pass = turnover != null && turnover > 1e8;
        displayValue = turnover != null ? `${(turnover / 1e8).toFixed(1)} 億` : '—';
        break;
      }
      default:
        break;
    }

    return { id, pass, displayValue };
  });
}

/**
 * 過濾掃描結果：回傳所有條件都通過的股票
 * @param {Array<{code, name, results}>} scanResults
 * @returns {Array<{code, name, results}>}
 */
export function filterPassed(scanResults) {
  return scanResults.filter(r => r.results.every(c => c.pass));
}
