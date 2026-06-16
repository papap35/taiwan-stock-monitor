import { describe, it, expect } from 'vitest';
import { formatNotification } from '../browserNotify';

describe('formatNotification', () => {
  const makeEvent = (type, overrides = {}) => ({
    alert: { name: '台積電', code: '2330', type, targetPrice: 800, ...overrides },
    quote: { price: 780.5 },
  });

  it('停損觸發 — 標題與內文格式正確', () => {
    const { title, body } = formatNotification(makeEvent('loss'));
    expect(title).toBe('🔴 停損觸發');
    expect(body).toBe('台積電（2330）現價 $780.50，目標 $800.00');
  });

  it('漲停板 — 無 targetPrice 時不顯示目標欄', () => {
    const { title, body } = formatNotification(makeEvent('limit_up', { targetPrice: undefined }));
    expect(title).toBe('🔴 漲停板');
    expect(body).toBe('台積電（2330）現價 $780.50');
  });

  it('未知 type — 回傳通用標題', () => {
    const { title } = formatNotification(makeEvent('unknown_type'));
    expect(title).toBe('⚠️ 警報觸發');
  });

  it('quote 為 null — 不崩潰，price 部分空白', () => {
    const event = { alert: { name: '鴻海', code: '2317', type: 'buy', targetPrice: 100 }, quote: null };
    const { body } = formatNotification(event);
    expect(body).toBe('鴻海（2317），目標 $100.00');
  });

  it.each([
    ['buy',         '🟢 買入訊號'],
    ['sell',        '🟡 賣出訊號'],
    ['price_above', '🔔 突破目標價'],
    ['price_below', '🔔 跌破目標價'],
    ['limit_down',  '🟢 跌停板'],
  ])('type=%s → title=%s', (type, expected) => {
    expect(formatNotification(makeEvent(type)).title).toBe(expected);
  });
});
