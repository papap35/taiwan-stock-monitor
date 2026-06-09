/**
 * scheduler.js
 * 盤前/盤後自動 AI 簡報排程
 *
 * 時間表（台灣時間）：
 *   08:45 → 盤前分析推播
 *   13:35 → 盤後總結推播
 *
 * 依賴：
 *   - node-cron（已安裝）
 *   - lineNotify（token 管理 + 推播）
 *   - Anthropic SDK（AI 生成）
 *   - twse（市場資料）
 *   - reportHelpers（prompt 建構）
 */

const cron       = require('node-cron');
const Anthropic  = require('@anthropic-ai/sdk');
const twse       = require('./twse');
const lineNotify = require('./lineNotify');
const { buildPreMarketPrompt, buildPostMarketPrompt, truncateForLine } = require('../utils/reportHelpers');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 設定儲存（記憶體）────────────────────────────────────────────
const _settings = {
  preMarketEnabled:  process.env.AUTO_REPORT_PRE  === 'true',
  postMarketEnabled: process.env.AUTO_REPORT_POST === 'true',
};

function getSettings() {
  return { ..._settings };
}

function updateSettings(patch) {
  Object.assign(_settings, patch);
}

// ── AI 呼叫（非串流，用於背景排程）──────────────────────────────

async function generateReport(prompt) {
  const SYSTEM = `你是一位專業的台股投資分析師。請用繁體中文回覆，語氣專業但易懂。
重要聲明：以下分析僅供參考，不構成投資建議，投資人應自行判斷風險。`;

  const message = await client.messages.create({
    model:      'claude-haiku-4-5',   // 排程用 Haiku，節省 token
    max_tokens: 600,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: prompt }],
  });

  return message.content?.[0]?.text || '';
}

// ── 盤前推播 ─────────────────────────────────────────────────────

async function runPreMarketReport() {
  if (!_settings.preMarketEnabled) return;
  if (!lineNotify.hasToken()) {
    console.log('[Scheduler] 盤前簡報跳過：未設定 LINE token');
    return;
  }

  console.log('[Scheduler] 開始生成盤前簡報…');
  try {
    const [taiex, breadth, institutional, worldMarkets] = await Promise.allSettled([
      twse.fetchTaiex(),
      twse.fetchMarketBreadth(),
      twse.fetchInstitutionalAll(),
      twse.fetchWorldMarkets(),
    ]).then(r => r.map(x => x.status === 'fulfilled' ? x.value : null));

    const prompt = buildPreMarketPrompt({ taiex, breadth, institutional, worldMarkets });
    const text   = await generateReport(prompt);
    const msg    = lineNotify.buildReportMessage('pre', truncateForLine(text));

    await lineNotify.sendLineNotify(lineNotify.getToken(), msg);
    console.log('[Scheduler] 盤前簡報推播完成');
  } catch (err) {
    console.error('[Scheduler] 盤前簡報失敗:', err.message);
  }
}

// ── 盤後推播 ─────────────────────────────────────────────────────

async function runPostMarketReport() {
  if (!_settings.postMarketEnabled) return;
  if (!lineNotify.hasToken()) {
    console.log('[Scheduler] 盤後簡報跳過：未設定 LINE token');
    return;
  }

  console.log('[Scheduler] 開始生成盤後簡報…');
  try {
    const [taiex, breadth, institutional] = await Promise.allSettled([
      twse.fetchTaiex(),
      twse.fetchMarketBreadth(),
      twse.fetchInstitutionalAll(),
    ]).then(r => r.map(x => x.status === 'fulfilled' ? x.value : null));

    const prompt = buildPostMarketPrompt({ taiex, breadth, institutional });
    const text   = await generateReport(prompt);
    const msg    = lineNotify.buildReportMessage('post', truncateForLine(text));

    await lineNotify.sendLineNotify(lineNotify.getToken(), msg);
    console.log('[Scheduler] 盤後簡報推播完成');
  } catch (err) {
    console.error('[Scheduler] 盤後簡報失敗:', err.message);
  }
}

// ── cron 初始化 ───────────────────────────────────────────────────

function initScheduler() {
  // 盤前：週一至週五 08:45（台灣時間 = UTC+8，cron 用 TZ 設定）
  cron.schedule('45 8 * * 1-5', runPreMarketReport, {
    timezone: 'Asia/Taipei',
  });

  // 盤後：週一至週五 13:35
  cron.schedule('35 13 * * 1-5', runPostMarketReport, {
    timezone: 'Asia/Taipei',
  });

  console.log('[Scheduler] 自動簡報排程已啟動（盤前 08:45 / 盤後 13:35，週一至週五）');
}

module.exports = {
  initScheduler,
  runPreMarketReport,
  runPostMarketReport,
  getSettings,
  updateSettings,
};
