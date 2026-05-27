/**
 * alert-engine.js
 * 管理價格警報，包含停損、買入訊號、賣出訊號判斷
 */

const EventEmitter = require('events');

class AlertEngine extends EventEmitter {
  constructor() {
    super();
    this.alerts = new Map(); // id → Alert
    this.triggerHistory = [];
    this._idCounter = 1;
  }

  /**
   * 新增警報
   * @param {object} config
   * @param {string} config.code       股票代號
   * @param {string} config.name       股票名稱
   * @param {'loss'|'buy'|'sell'|'price_above'|'price_below'} config.type
   * @param {number} config.targetPrice 目標觸發價格
   * @param {string} [config.note]     備註
   */
  addAlert(config) {
    const id = String(this._idCounter++);
    const alert = {
      id,
      code: config.code,
      name: config.name || config.code,
      type: config.type,
      targetPrice: config.targetPrice,
      note: config.note || '',
      triggered: false,
      createdAt: new Date().toISOString(),
      triggeredAt: null,
      triggerPrice: null,
    };
    this.alerts.set(id, alert);
    return alert;
  }

  removeAlert(id) {
    return this.alerts.delete(id);
  }

  getAlerts() {
    return Array.from(this.alerts.values());
  }

  /**
   * 傳入最新報價，檢查是否觸發警報
   * @param {object} quotes  { code: { price, changePercent, ... } }
   */
  checkQuotes(quotes) {
    const triggered = [];

    this.alerts.forEach((alert, id) => {
      if (alert.triggered) return;
      const q = quotes[alert.code];
      if (!q || !q.price) return;

      let hit = false;
      const { type, targetPrice } = alert;
      const { price, changePercent } = q;

      switch (type) {
        case 'loss':          hit = price <= targetPrice; break;
        case 'buy':           hit = price <= targetPrice; break;
        case 'sell':          hit = price >= targetPrice; break;
        case 'price_above':   hit = price >= targetPrice; break;
        case 'price_below':   hit = price <= targetPrice; break;
        case 'limit_up':      hit = changePercent >= 9.9;  break;
        case 'limit_down':    hit = changePercent <= -9.9; break;
      }

      if (hit) {
        alert.triggered = true;
        alert.triggeredAt = new Date().toISOString();
        alert.triggerPrice = price;

        const event = {
          alert: { ...alert },
          quote: q,
          message: this._buildMessage(alert, q),
        };

        triggered.push(event);
        this.triggerHistory.unshift(event);
        if (this.triggerHistory.length > 100) this.triggerHistory.pop();

        this.emit('triggered', event);
      }
    });

    return triggered;
  }

  _buildMessage(alert, q) {
    const typeLabels = {
      loss: '🔴 停損觸發',
      buy: '🟢 買入訊號',
      sell: '🟡 賣出訊號',
      price_above: '🔔 突破目標價',
      price_below: '🔔 跌破目標價',
      limit_up: '🔴 漲停板',
      limit_down: '🟢 跌停板',
    };
    const label = typeLabels[alert.type] || '⚠️ 警報';
    return `${label}：${alert.name}(${alert.code}) 現價 $${q.price.toFixed(2)}，目標 $${alert.targetPrice.toFixed(2)}${alert.note ? `，${alert.note}` : ''}`;
  }

  getTriggerHistory(limit = 50) {
    return this.triggerHistory.slice(0, limit);
  }

  clearTriggered() {
    this.alerts.forEach((alert, id) => {
      if (alert.triggered) this.alerts.delete(id);
    });
  }
}

// 單例
const alertEngine = new AlertEngine();
module.exports = alertEngine;
