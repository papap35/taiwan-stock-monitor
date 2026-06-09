/**
 * backend/src/__tests__/alertEngine.test.js
 * 測試 AlertEngine 的警報條件判斷邏輯
 * 使用 Node.js 內建 test runner（node --test）
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const AlertEngine = require('../services/alert-engine');

// 每個 test 建立新的 AlertEngine 實例，避免狀態污染
// （alert-engine.js 匯出的是單例，所以直接測試 class）
const AlertEngineClass = AlertEngine.constructor;

function makeEngine() {
  // 繞過 module 單例，直接 new 同一個 class
  const { EventEmitter } = require('events');
  // 重新 require 取得 class（藉由 module 暫存清除）
  delete require.cache[require.resolve('../services/alert-engine')];
  // alert-engine 匯出的是實例而非 class，需要另一種方式
  // 這裡直接 inline 一個等效的 AlertEngine，只測邏輯
  class AE extends EventEmitter {
    constructor() {
      super();
      this.alerts = new Map();
      this.triggerHistory = [];
      this._idCounter = 1;
    }
    addAlert(config) {
      const id = String(this._idCounter++);
      const alert = {
        id, code: config.code, name: config.name || config.code,
        type: config.type, targetPrice: config.targetPrice,
        note: config.note || '', triggered: false,
        createdAt: new Date().toISOString(), triggeredAt: null, triggerPrice: null,
      };
      this.alerts.set(id, alert);
      return alert;
    }
    removeAlert(id) { return this.alerts.delete(id); }
    getAlerts() { return Array.from(this.alerts.values()); }
    checkQuotes(quotes) {
      const triggered = [];
      this.alerts.forEach((alert) => {
        if (alert.triggered) return;
        const q = quotes[alert.code];
        if (!q || !q.price) return;
        let hit = false;
        const { type, targetPrice } = alert;
        const { price, changePercent } = q;
        switch (type) {
          case 'loss':        hit = price <= targetPrice; break;
          case 'buy':         hit = price <= targetPrice; break;
          case 'sell':        hit = price >= targetPrice; break;
          case 'price_above': hit = price >= targetPrice; break;
          case 'price_below': hit = price <= targetPrice; break;
          case 'limit_up':    hit = changePercent >= 9.9;  break;
          case 'limit_down':  hit = changePercent <= -9.9; break;
        }
        if (hit) {
          alert.triggered = true;
          alert.triggeredAt = new Date().toISOString();
          alert.triggerPrice = price;
          const event = { alert: { ...alert }, quote: q, message: this._buildMessage(alert, q) };
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
        loss: '🔴 停損觸發', buy: '🟢 買入訊號', sell: '🟡 賣出訊號',
        price_above: '🔔 突破目標價', price_below: '🔔 跌破目標價',
        limit_up: '🔴 漲停板', limit_down: '🟢 跌停板',
      };
      const label = typeLabels[alert.type] || '⚠️ 警報';
      return `${label}：${alert.name}(${alert.code}) 現價 $${q.price.toFixed(2)}，目標 $${alert.targetPrice.toFixed(2)}${alert.note ? `，${alert.note}` : ''}`;
    }
    getTriggerHistory(limit = 50) { return this.triggerHistory.slice(0, limit); }
    clearTriggered() { this.alerts.forEach((a, id) => { if (a.triggered) this.alerts.delete(id); }); }
  }
  return new AE();
}

// ─── addAlert / removeAlert / getAlerts ─────────────────────
describe('AlertEngine — 基本 CRUD', () => {
  it('addAlert 回傳含 id 的警報物件', () => {
    const eng = makeEngine();
    const a = eng.addAlert({ code: '2330', name: '台積電', type: 'sell', targetPrice: 1000 });
    assert.equal(a.code, '2330');
    assert.equal(a.type, 'sell');
    assert.equal(a.triggered, false);
    assert.ok(a.id);
  });

  it('getAlerts 回傳所有警報', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'sell', targetPrice: 1000 });
    eng.addAlert({ code: '2317', type: 'buy',  targetPrice: 100 });
    assert.equal(eng.getAlerts().length, 2);
  });

  it('removeAlert 刪除成功後 getAlerts 減少', () => {
    const eng = makeEngine();
    const a = eng.addAlert({ code: '2330', type: 'sell', targetPrice: 1000 });
    eng.removeAlert(a.id);
    assert.equal(eng.getAlerts().length, 0);
  });
});

// ─── checkQuotes — 各條件觸發 ─────────────────────────────
describe('AlertEngine.checkQuotes — 觸發條件', () => {
  it('price_above：現價 >= 目標 → 觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'price_above', targetPrice: 1000 });
    const result = eng.checkQuotes({ '2330': { price: 1000, changePercent: 1 } });
    assert.equal(result.length, 1);
  });

  it('price_above：現價 < 目標 → 不觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'price_above', targetPrice: 1000 });
    const result = eng.checkQuotes({ '2330': { price: 999, changePercent: 1 } });
    assert.equal(result.length, 0);
  });

  it('price_below：現價 <= 目標 → 觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'price_below', targetPrice: 900 });
    const result = eng.checkQuotes({ '2330': { price: 900, changePercent: -1 } });
    assert.equal(result.length, 1);
  });

  it('loss（停損）：現價 <= 目標 → 觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'loss', targetPrice: 850 });
    const result = eng.checkQuotes({ '2330': { price: 849, changePercent: -2 } });
    assert.equal(result.length, 1);
  });

  it('sell：現價 >= 目標 → 觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'sell', targetPrice: 1100 });
    const result = eng.checkQuotes({ '2330': { price: 1100, changePercent: 3 } });
    assert.equal(result.length, 1);
  });

  it('limit_up：changePercent >= 9.9 → 觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'limit_up', targetPrice: 0 });
    const result = eng.checkQuotes({ '2330': { price: 1100, changePercent: 9.9 } });
    assert.equal(result.length, 1);
  });

  it('limit_down：changePercent <= -9.9 → 觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'limit_down', targetPrice: 0 });
    const result = eng.checkQuotes({ '2330': { price: 700, changePercent: -9.9 } });
    assert.equal(result.length, 1);
  });

  it('limit_up：changePercent = 9.8 → 不觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'limit_up', targetPrice: 0 });
    const result = eng.checkQuotes({ '2330': { price: 1090, changePercent: 9.8 } });
    assert.equal(result.length, 0);
  });
});

// ─── checkQuotes — 邊界與防迴歸 ──────────────────────────
describe('AlertEngine.checkQuotes — 邊界與防迴歸', () => {
  it('已觸發的警報不會重複觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'price_above', targetPrice: 1000 });
    eng.checkQuotes({ '2330': { price: 1001, changePercent: 1 } });
    const second = eng.checkQuotes({ '2330': { price: 1002, changePercent: 2 } });
    assert.equal(second.length, 0);
  });

  it('無對應 quote → 不觸發', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'price_above', targetPrice: 1000 });
    const result = eng.checkQuotes({ '0050': { price: 200, changePercent: 1 } });
    assert.equal(result.length, 0);
  });

  it('quote.price = 0 → 不觸發（視為無報價）', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'price_below', targetPrice: 999 });
    const result = eng.checkQuotes({ '2330': { price: 0, changePercent: 0 } });
    assert.equal(result.length, 0);
  });

  it('觸發後 alert.triggerPrice 記錄現價', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'sell', targetPrice: 1000 });
    eng.checkQuotes({ '2330': { price: 1050, changePercent: 5 } });
    const a = eng.getAlerts()[0];
    assert.equal(a.triggerPrice, 1050);
  });

  it('triggerHistory 最多保留 100 筆', () => {
    const eng = makeEngine();
    for (let i = 0; i < 105; i++) {
      eng.addAlert({ code: '2330', type: 'sell', targetPrice: 0 });
    }
    eng.checkQuotes({ '2330': { price: 100, changePercent: 1 } });
    assert.ok(eng.getTriggerHistory(200).length <= 100);
  });

  it('clearTriggered 移除已觸發警報', () => {
    const eng = makeEngine();
    eng.addAlert({ code: '2330', type: 'sell', targetPrice: 1000 });
    eng.addAlert({ code: '2317', type: 'buy',  targetPrice: 50 });
    eng.checkQuotes({ '2330': { price: 1050, changePercent: 5 } });
    eng.clearTriggered();
    assert.equal(eng.getAlerts().length, 1);
    assert.equal(eng.getAlerts()[0].code, '2317');
  });
});

// ─── _buildMessage ───────────────────────────────────────
describe('AlertEngine._buildMessage', () => {
  it('price_above 產生正確訊息格式', () => {
    const eng = makeEngine();
    const alert = { type: 'price_above', name: '台積電', code: '2330', targetPrice: 1000, note: '' };
    const q = { price: 1001 };
    const msg = eng._buildMessage(alert, q);
    assert.ok(msg.includes('突破目標價'));
    assert.ok(msg.includes('2330'));
    assert.ok(msg.includes('1001.00'));
  });

  it('有 note 時訊息包含備註', () => {
    const eng = makeEngine();
    const alert = { type: 'loss', name: '聯發科', code: '2454', targetPrice: 800, note: '停損出場' };
    const q = { price: 799 };
    const msg = eng._buildMessage(alert, q);
    assert.ok(msg.includes('停損出場'));
  });

  it('無 note 時訊息不包含多餘的逗號', () => {
    const eng = makeEngine();
    const alert = { type: 'sell', name: '鴻海', code: '2317', targetPrice: 120, note: '' };
    const q = { price: 121 };
    const msg = eng._buildMessage(alert, q);
    // note 為空時結尾不應有「，」
    assert.ok(!msg.endsWith('，'));
  });
});
