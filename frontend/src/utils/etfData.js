// ── ETF 靜態資料（P7-32）─────────────────────────────────
// 追蹤指數與前 10 大成分股權重為人工維護的靜態清單，需定期更新（季度為主）
// 殖利率／配息頻率不在此維護，沿用既有 BWIBBU_d 殖利率資料（StockChart 基本面 tab）

/**
 * @typedef {{ name: string, weight: number }} Holding
 * @typedef {{
 *   trackingIndex: string,
 *   distributionFreq: string,
 *   holdings: Holding[],
 *   updatedAt: string,
 * }} EtfInfo
 */

/** @type {Record<string, EtfInfo>} */
export const ETF_DATA = {
  '0050': {
    trackingIndex: '臺灣50指數',
    distributionFreq: '每年 1、7 月配息（2 次）',
    holdings: [
      { name: '台積電', weight: 58.2 },
      { name: '鴻海', weight: 5.1 },
      { name: '聯發科', weight: 3.4 },
      { name: '台達電', weight: 2.6 },
      { name: '富邦金', weight: 2.1 },
      { name: '廣達', weight: 2.0 },
      { name: '中信金', weight: 1.9 },
      { name: '國泰金', weight: 1.8 },
      { name: '日月光投控', weight: 1.5 },
      { name: '聯電', weight: 1.4 },
    ],
    updatedAt: '2026-04',
  },
  '0056': {
    trackingIndex: '臺灣高股息指數',
    distributionFreq: '每季配息（4 次）',
    holdings: [
      { name: '緯創', weight: 4.8 },
      { name: '長榮', weight: 4.3 },
      { name: '群創', weight: 3.9 },
      { name: '友達', weight: 3.7 },
      { name: '仁寶', weight: 3.5 },
      { name: '英業達', weight: 3.3 },
      { name: '微星', weight: 3.0 },
      { name: '兆豐金', weight: 2.9 },
      { name: '可成', weight: 2.7 },
      { name: '華碩', weight: 2.5 },
    ],
    updatedAt: '2026-04',
  },
  '006208': {
    trackingIndex: '臺灣50指數',
    distributionFreq: '每年 1 次配息',
    holdings: [
      { name: '台積電', weight: 58.0 },
      { name: '鴻海', weight: 5.0 },
      { name: '聯發科', weight: 3.4 },
      { name: '台達電', weight: 2.6 },
      { name: '富邦金', weight: 2.1 },
      { name: '廣達', weight: 2.0 },
      { name: '中信金', weight: 1.9 },
      { name: '國泰金', weight: 1.8 },
      { name: '日月光投控', weight: 1.5 },
      { name: '聯電', weight: 1.4 },
    ],
    updatedAt: '2026-04',
  },
  '00878': {
    trackingIndex: '台灣永續高股息ESG投資指數',
    distributionFreq: '每季配息（4 次）',
    holdings: [
      { name: '台泥', weight: 4.2 },
      { name: '聯電', weight: 4.0 },
      { name: '兆豐金', weight: 3.8 },
      { name: '統一', weight: 3.5 },
      { name: '中信金', weight: 3.3 },
      { name: '台達電', weight: 3.1 },
      { name: '玉山金', weight: 2.9 },
      { name: '合庫金', weight: 2.7 },
      { name: '第一金', weight: 2.6 },
      { name: '華南金', weight: 2.5 },
    ],
    updatedAt: '2026-04',
  },
  '00919': {
    trackingIndex: '臺灣價值高息指數',
    distributionFreq: '每季配息（4 次）',
    holdings: [
      { name: '聯電', weight: 5.5 },
      { name: '中信金', weight: 5.2 },
      { name: '兆豐金', weight: 4.9 },
      { name: '台泥', weight: 4.3 },
      { name: '元大期', weight: 3.8 },
      { name: '台新金', weight: 3.5 },
      { name: '第一金', weight: 3.3 },
      { name: '合庫金', weight: 3.1 },
      { name: '群益期', weight: 2.9 },
      { name: '華南金', weight: 2.8 },
    ],
    updatedAt: '2026-04',
  },
  '00929': {
    trackingIndex: '中証台灣科技優息指數',
    distributionFreq: '每月配息（12 次）',
    holdings: [
      { name: '緯創', weight: 5.8 },
      { name: '群創', weight: 4.6 },
      { name: '友達', weight: 4.4 },
      { name: '仁寶', weight: 4.1 },
      { name: '英業達', weight: 3.9 },
      { name: '微星', weight: 3.6 },
      { name: '可成', weight: 3.2 },
      { name: '華碩', weight: 3.0 },
      { name: '技嘉', weight: 2.8 },
      { name: '神達', weight: 2.5 },
    ],
    updatedAt: '2026-04',
  },
};

/** 判斷代號是否為已知 ETF */
export function isKnownEtf(code) {
  return Object.prototype.hasOwnProperty.call(ETF_DATA, code);
}

/** 取得 ETF 資訊，未知代號回傳 null */
export function getEtfInfo(code) {
  return ETF_DATA[code] || null;
}
