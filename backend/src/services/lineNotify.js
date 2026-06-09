/**
 * lineNotify.js
 * LINE Notify API 整合
 *
 * LINE Notify API 文件：https://notify-bot.line.me/doc/en/
 * 使用者需自行至 https://notify-bot.line.me/ 取得個人 token
 */

const https = require('https');
const querystring = require('querystring');

// ── Token 儲存（記憶體，伺服器重啟會清空）────────────────────────
// 生產環境可替換為環境變數或資料庫儲存
let _token = process.env.LINE_NOTIFY_TOKEN || null;

function setToken(token) {
  _token = token ? token.trim() : null;
}

function getToken() {
  return _token;
}

function hasToken() {
  return Boolean(_token);
}

function clearToken() {
  _token = null;
}

// ── 訊息格式化（純函式，可測試）─────────────────────────────────

/**
 * 警報觸發訊息
 * @param {object} alert   { name, code, type, targetPrice, note }
 * @param {object} quote   { price, changePercent }
 * @returns {string}
 */
function buildAlertMessage(alert, quote) {
  const TYPE_LABELS = {
    loss:        '🔴 停損觸發',
    buy:         '🟢 買入訊號',
    sell:        '🟡 賣出訊號',
    price_above: '🔔 突破目標價',
    price_below: '🔔 跌破目標價',
    limit_up:    '🚀 漲停板',
    limit_down:  '💥 跌停板',
  };
  const label = TYPE_LABELS[alert.type] || '⚠️ 警報';
  const pct   = quote.changePercent != null
    ? ` (${quote.changePercent >= 0 ? '+' : ''}${Number(quote.changePercent).toFixed(2)}%)`
    : '';
  const now   = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const noteLine = alert.note ? `\n備註：${alert.note}` : '';

  return [
    `\n[台股警報] ${label}`,
    `${alert.name} ${alert.code}`,
    `現價：${Number(quote.price).toFixed(2)}${pct}`,
    `目標：${Number(alert.targetPrice).toFixed(2)}`,
    `時間：${now}${noteLine}`,
  ].join('\n');
}

/**
 * 每日簡報訊息（盤前/盤後）
 * @param {'pre'|'post'} type
 * @param {string} content   AI 簡報文字
 * @returns {string}
 */
function buildReportMessage(type, content) {
  const prefix = type === 'pre' ? '📋 盤前 AI 簡報' : '📊 盤後 AI 簡報';
  const now = new Date().toLocaleDateString('zh-TW');
  return `\n${prefix} ${now}\n${'─'.repeat(20)}\n${content}`;
}

// ── HTTP 呼叫 ─────────────────────────────────────────────────────

/**
 * 呼叫 LINE Notify API 發送訊息
 * @param {string} token   LINE Notify personal access token
 * @param {string} message 訊息內容（不需加前綴換行，函式內會處理）
 * @returns {Promise<{ success: boolean, status: number, body: string }>}
 */
function sendLineNotify(token, message) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({ message });

    const options = {
      hostname: 'notify-api.line.me',
      port: 443,
      path: '/api/notify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          success: res.statusCode === 200,
          status: res.statusCode,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 使用已儲存的 token 發送警報
 * 若沒有設定 token 則靜默跳過（不報錯）
 */
async function notifyAlert(alert, quote) {
  if (!_token) return;
  try {
    const message = buildAlertMessage(alert, quote);
    const result = await sendLineNotify(_token, message);
    if (!result.success) {
      console.warn(`[LINE Notify] 發送失敗 (${result.status}):`, result.body);
    }
  } catch (err) {
    console.error('[LINE Notify] 錯誤:', err.message);
  }
}

module.exports = {
  setToken,
  getToken,
  hasToken,
  clearToken,
  buildAlertMessage,
  buildReportMessage,
  sendLineNotify,
  notifyAlert,
};
