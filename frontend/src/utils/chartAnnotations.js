// ── K 線繪圖標註（趨勢線 / 水平線）純函式 ──────────────────

export const ANNOTATION_COLOR = '#facc15';

/**
 * 取得某股票標註資料的 localStorage key
 * @param {string} code 股票代號
 * @returns {string}
 */
export function annotationStorageKey(code) {
  return `chart_annotations_${code}`;
}

/**
 * 建立一筆新標註
 * @param {'horizontal'|'trendline'} type
 * @param {{time: number, price: number}[]} points
 * @param {string} [color]
 * @returns {{id: string, type: string, points: {time:number, price:number}[], color: string}}
 */
export function createAnnotation(type, points, color = ANNOTATION_COLOR) {
  return {
    id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    points,
    color,
  };
}

/**
 * 新增一筆標註到清單
 * @param {Array} list
 * @param {object} annotation
 * @returns {Array}
 */
export function addAnnotation(list, annotation) {
  return [...list, annotation];
}

/**
 * 依 id 移除一筆標註
 * @param {Array} list
 * @param {string} id
 * @returns {Array}
 */
export function removeAnnotation(list, id) {
  return list.filter(a => a.id !== id);
}
