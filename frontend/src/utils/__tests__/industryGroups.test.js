import { describe, it, expect } from 'vitest';
import { INDUSTRY_GROUPS } from '../industryGroups';

describe('INDUSTRY_GROUPS', () => {
  it('至少有 10 個族群', () => {
    expect(INDUSTRY_GROUPS.length).toBeGreaterThanOrEqual(10);
  });

  it('每個族群都有 label 和至少 2 個代號', () => {
    INDUSTRY_GROUPS.forEach(g => {
      expect(typeof g.label).toBe('string');
      expect(g.label.length).toBeGreaterThan(0);
      expect(g.codes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('代號格式為 4-6 位數字（或 ETF 格式）', () => {
    INDUSTRY_GROUPS.forEach(g => {
      g.codes.forEach(code => {
        expect(code).toMatch(/^\d{4,6}[A-Z]?$/);
      });
    });
  });

  it('label 全部唯一', () => {
    const labels = INDUSTRY_GROUPS.map(g => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
