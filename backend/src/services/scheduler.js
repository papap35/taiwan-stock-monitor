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
const supabase   = require('./supabase');
const calendar   = require('./calendar');
const { buildPreMarketPrompt, buildPostMarketPrompt, buildWeeklyPrompt, truncateForLine } = require('../utils/reportHelpers');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 設定儲存（記憶體）────────────────────────────────────────────
const _settings = {
  preMarketEnabled:  process.env.AUTO_REPORT_PRE  === 'true',
  postMarketEnabled: process.env.AUTO_REPORT_POST === 'true',
  weeklyReportEnabled: process.env.AUTO_REPORT_WEEKLY === 'true',
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

// ── 自選股本週漲跌幅 ─────────────────────────────────────────────

/**
 * 計算自選股本週（最近 5 個交易日）漲跌幅
 * 若 Supabase 未設定或無自選股，回傳空陣列
 */
async function fetchWatchlistWeeklyPerf() {
  if (!supabase.isEnabled()) return [];
  const watchlist = await supabase.pullWatchlist();
  if (!watchlist || !watchlist.length) return [];

  const results = [];
  for (const item of watchlist.slice(0, 20)) {
    if (!item?.code) continue;
    try {
      const history = await twse.fetchHistory(item.code, 1);
      if (history.length < 2) continue;
      const last  = history[history.length - 1];
      const prior = history[Math.max(0, history.length - 1 - 5)];
      if (!prior.close) continue;
      const weeklyChangePct = ((last.close - prior.close) / prior.close) * 100;
      results.push({ code: item.code, name: item.name || item.code, weeklyChangePct });
    } catch (e) {
      console.warn(`[Scheduler] 週報抓取 ${item.code} 歷史價格失敗:`, e.message);
    }
  }

  return results.sort((a, b) => b.weeklyChangePct - a.weeklyChangePct);
}

// ── 週報推播 ─────────────────────────────────────────────────────

async function runWeeklyReport() {
  if (!_settings.weeklyReportEnabled) return;
  if (!lineNotify.hasToken()) {
    console.log('[Scheduler] 週報跳過：未設定 LINE token');
    return;
  }

  console.log('[Scheduler] 開始生成週報摘要…');
  try {
    const [taiex, breadth, institutional] = await Promise.allSettled([
      twse.fetchTaiex(),
      twse.fetchMarketBreadth(),
      twse.fetchInstitutionalAll(),
    ]).then(r => r.map(x => x.status === 'fulfilled' ? x.value : null));

    const watchlistPerf = await fetchWatchlistWeeklyPerf().catch(() => []);

    let upcomingEvents = [];
    try {
      const events = await calendar.fetchAllEvents();
      const upcoming = calendar.filterUpcoming(events, 7);
      upcomingEvents = watchlistPerf.length
        ? calendar.getEventsForCodes(upcoming, watchlistPerf.map(s => s.code))
        : upcoming;
    } catch (e) {
      console.warn('[Scheduler] 週報抓取行事曆事件失敗:', e.message);
    }

    const prompt = buildWeeklyPrompt({ taiex, breadth, institutional, watchlistPerf, upcomingEvents });
    const text   = await generateReport(prompt);
    const msg    = lineNotify.buildReportMessage('weekly', truncateForLine(text));

    await lineNotify.sendLineNotify(lineNotify.getToken(), msg);
    console.log('[Scheduler] 週報摘要推播完成');
  } catch (err) {
    console.error('[Scheduler] 週報摘要失敗:', err.message);
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

  // 週報：每週五 14:30（收盤後）
  cron.schedule('30 14 * * 5', runWeeklyReport, {
    timezone: 'Asia/Taipei',
  });

  console.log('[Scheduler] 自動簡報排程已啟動（盤前 08:45 / 盤後 13:35 / 週報 週五 14:30）');
}

module.exports = {
  initScheduler,
  runPreMarketReport,
  runPostMarketReport,
  runWeeklyReport,
  getSettings,
  updateSettings,
};
