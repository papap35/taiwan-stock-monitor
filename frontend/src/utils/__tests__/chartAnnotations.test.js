import { describe, it, expect } from 'vitest';
import {
  annotationStorageKey, createAnnotation, addAnnotation, removeAnnotation, ANNOTATION_COLOR,
} from '../chartAnnotations';

describe('annotationStorageKey', () => {
  it('依股票代號產生對應的 localStorage key', () => {
    expect(annotationStorageKey('2330')).toBe('chart_annotations_2330');
  });
});

describe('createAnnotation', () => {
  it('建立水平線標註，包含 id / type / points / color', () => {
    const ann = createAnnotation('horizontal', [{ time: 1000, price: 850 }]);
    expect(ann.type).toBe('horizontal');
    expect(ann.points).toEqual([{ time: 1000, price: 850 }]);
    expect(ann.color).toBe(ANNOTATION_COLOR);
    expect(ann.id).toMatch(/^ann_/);
  });

  it('建立趨勢線標註，可指定自訂顏色', () => {
    const points = [{ time: 1000, price: 850 }, { time: 2000, price: 900 }];
    const ann = createAnnotation('trendline', points, '#ff0000');
    expect(ann.type).toBe('trendline');
    expect(ann.points).toEqual(points);
    expect(ann.color).toBe('#ff0000');
  });

  it('每次建立的 id 皆不同', () => {
    const a = createAnnotation('horizontal', [{ time: 1, price: 1 }]);
    const b = createAnnotation('horizontal', [{ time: 1, price: 1 }]);
    expect(a.id).not.toBe(b.id);
  });
});

describe('addAnnotation', () => {
  it('將標註加入清單尾端，不修改原陣列', () => {
    const list = [createAnnotation('horizontal', [{ time: 1, price: 1 }])];
    const ann = createAnnotation('trendline', [{ time: 1, price: 1 }, { time: 2, price: 2 }]);
    const result = addAnnotation(list, ann);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(ann);
    expect(list).toHaveLength(1);
  });

  it('空清單新增第一筆標註', () => {
    const ann = createAnnotation('horizontal', [{ time: 1, price: 1 }]);
    expect(addAnnotation([], ann)).toEqual([ann]);
  });
});

describe('removeAnnotation', () => {
  it('依 id 移除對應標註', () => {
    const a = createAnnotation('horizontal', [{ time: 1, price: 1 }]);
    const b = createAnnotation('horizontal', [{ time: 2, price: 2 }]);
    const result = removeAnnotation([a, b], a.id);
    expect(result).toEqual([b]);
  });

  it('【防迴歸】id 不存在時回傳原清單內容不變（不丟錯）', () => {
    const a = createAnnotation('horizontal', [{ time: 1, price: 1 }]);
    const result = removeAnnotation([a], 'not_exist');
    expect(result).toEqual([a]);
  });
});
