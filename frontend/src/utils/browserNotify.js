// ── 瀏覽器推播通知純函式（P7-28）────────────────────

const TYPE_TITLES = {
  loss:        '🔴 停損觸發',
  buy:         '🟢 買入訊號',
  sell:        '🟡 賣出訊號',
  price_above: '🔔 突破目標價',
  price_below: '🔔 跌破目標價',
  limit_up:    '🔴 漲停板',
  limit_down:  '🟢 跌停板',
};

/**
 * 將警報觸發事件轉為通知標題 + 內文
 * @param {{ alert: { name: string, code: string, type: string, targetPrice?: number }, quote: { price: number } }} event
 * @returns {{ title: string, body: string }}
 */
export function formatNotification(event) {
  const { alert, quote } = event;
  const title = TYPE_TITLES[alert.type] || '⚠️ 警報觸發';
  const price = quote?.price != null ? `現價 $${quote.price.toFixed(2)}` : '';
  const target = alert.targetPrice != null ? `，目標 $${alert.targetPrice.toFixed(2)}` : '';
  const body = `${alert.name}（${alert.code}）${price}${target}`;
  return { title, body };
}

/**
 * 發出瀏覽器原生通知（前景通知，不需 Service Worker）
 * 只有在 Notification.permission === 'granted' 時才執行
 * @param {object[]} events
 */
export function fireBrowserNotifications(events) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  events.forEach(event => {
    const { title, body } = formatNotification(event);
    try {
      new Notification(title, { body, icon: '/logo.svg' });
    } catch {/* 某些環境不支援 */}
  });
}
