/**
 * lineNotify.test.js
 * 測試 lineNotify 純函式（不觸發真實 HTTP 呼叫）
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// 直接 require（每次 test 前重設 module state）
const lineNotify = require('../services/lineNotify');

// ── token 管理 ──────────────────────────────────────────────────

describe('token 管理', () => {
  afterEach(() => lineNotify.clearToken());

  it('初始狀態 hasToken() = false', () => {
    lineNotify.clearToken();
    assert.equal(lineNotify.hasToken(), false);
  });

  it('setToken 後 hasToken() = true', () => {
    lineNotify.setToken('test-token-123');
    assert.equal(lineNotify.hasToken(), true);
  });

  it('getToken 回傳已設定的 token', () => {
    lineNotify.setToken('abc123');
    assert.equal(lineNotify.getToken(), 'abc123');
  });

  it('setToken 會 trim 空白', () => {
    lineNotify.setToken('  mytoken  ');
    assert.equal(lineNotify.getToken(), 'mytoken');
  });

  it('clearToken 後 hasToken() = false', () => {
    lineNotify.setToken('abc');
    lineNotify.clearToken();
    assert.equal(lineNotify.hasToken(), false);
  });

  it('setToken(null) 視為清除', () => {
    lineNotify.setToken('abc');
    lineNotify.setToken(null);
    assert.equal(lineNotify.hasToken(), false);
  });

  it('setToken 空字串視為清除', () => {
    lineNotify.setToken('abc');
    lineNotify.setToken('');
    assert.equal(lineNotify.hasToken(), false);
  });
});

// ── buildAlertMessage ────────────────────────────────────────────

describe('buildAlertMessage', () => {
  const { buildAlertMessage } = lineNotify;

  it('停損觸發包含 🔴 和股票資訊', () => {
    const msg = buildAlertMessage(
      { name: '台積電', code: '2330', type: 'loss', targetPrice: 800, note: '' },
      { price: 790, changePercent: -2.5 }
    );
    assert.ok(msg.includes('🔴 停損觸發'));
    assert.ok(msg.includes('台積電'));
    assert.ok(msg.includes('2330'));
    assert.ok(msg.includes('790.00'));
    assert.ok(msg.includes('800.00'));
  });

  it('買入訊號包含 🟢', () => {
    const msg = buildAlertMessage(
      { name: '鴻海', code: '2317', type: 'buy', targetPrice: 100, note: '' },
      { price: 99, changePercent: -1 }
    );
    assert.ok(msg.includes('🟢 買入訊號'));
  });

  it('有備註時訊息包含備註', () => {
    const msg = buildAlertMessage(
      { name: '台積電', code: '2330', type: 'sell', targetPrice: 900, note: '季線附近' },
      { price: 905, changePercent: 1 }
    );
    assert.ok(msg.includes('季線附近'));
  });

  it('沒有備註時不顯示備註行', () => {
    const msg = buildAlertMessage(
      { name: '台積電', code: '2330', type: 'sell', targetPrice: 900, note: '' },
      { price: 905, changePercent: 1 }
    );
    assert.ok(!msg.includes('備註：'));
  });

  it('changePercent 為正數時顯示 +', () => {
    const msg = buildAlertMessage(
      { name: 'X', code: '0000', type: 'price_above', targetPrice: 50, note: '' },
      { price: 51, changePercent: 2 }
    );
    assert.ok(msg.includes('+2.00%'));
  });

  it('漲停板 type 顯示 🚀', () => {
    const msg = buildAlertMessage(
      { name: 'X', code: '0000', type: 'limit_up', targetPrice: 0, note: '' },
      { price: 100, changePercent: 10 }
    );
    assert.ok(msg.includes('🚀 漲停板'));
  });
});

// ── buildReportMessage ───────────────────────────────────────────

describe('buildReportMessage', () => {
  const { buildReportMessage } = lineNotify;

  it('盤前簡報包含 📋', () => {
    const msg = buildReportMessage('pre', 'AI 分析內容');
    assert.ok(msg.includes('📋 盤前 AI 簡報'));
    assert.ok(msg.includes('AI 分析內容'));
  });

  it('盤後簡報包含 📊', () => {
    const msg = buildReportMessage('post', '收盤分析');
    assert.ok(msg.includes('📊 盤後 AI 簡報'));
  });
});
