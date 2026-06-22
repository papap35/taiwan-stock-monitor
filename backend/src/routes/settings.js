/**
 * settings.js
 * 後端系統設定 API
 *
 * POST   /api/settings/line-token        儲存 LINE Notify token
 * GET    /api/settings/line-token        查詢是否已設定（不回傳明文 token）
 * DELETE /api/settings/line-token        清除 token
 * POST   /api/settings/line-token/test   發送測試訊息
 */

const express = require('express');
const router  = express.Router();
const lineNotify  = require('../services/lineNotify');
const scheduler   = require('../services/scheduler');
const chipScanner = require('../services/chipScanner');

// GET /api/settings/line-token
router.get('/line-token', (_req, res) => {
  res.json({ configured: lineNotify.hasToken() });
});

// POST /api/settings/line-token
router.post('/line-token', (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'token 不得為空' });
  }
  lineNotify.setToken(token.trim());
  res.json({ success: true, configured: true });
});

// DELETE /api/settings/line-token
router.delete('/line-token', (_req, res) => {
  lineNotify.clearToken();
  res.json({ success: true, configured: false });
});

// POST /api/settings/line-token/test
router.post('/line-token/test', async (req, res) => {
  if (!lineNotify.hasToken()) {
    return res.status(400).json({ error: '尚未設定 LINE Notify token' });
  }
  try {
    const result = await lineNotify.sendLineNotify(
      lineNotify.getToken(),
      '\n[台股監控] 測試訊息 ✅\nLINE Notify 連結成功！'
    );
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: `LINE Notify 回應 ${result.status}，請確認 token 是否正確` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/auto-report — 查詢自動簡報設定
router.get('/auto-report', (_req, res) => {
  res.json(scheduler.getSettings());
});

// POST /api/settings/auto-report — 更新自動簡報設定
// Body: { preMarketEnabled, postMarketEnabled, weeklyReportEnabled }
router.post('/auto-report', (req, res) => {
  const { preMarketEnabled, postMarketEnabled, weeklyReportEnabled } = req.body;
  const patch = {};
  if (typeof preMarketEnabled    === 'boolean') patch.preMarketEnabled    = preMarketEnabled;
  if (typeof postMarketEnabled   === 'boolean') patch.postMarketEnabled   = postMarketEnabled;
  if (typeof weeklyReportEnabled === 'boolean') patch.weeklyReportEnabled = weeklyReportEnabled;
  scheduler.updateSettings(patch);
  res.json({ success: true, ...scheduler.getSettings() });
});

// POST /api/settings/auto-report/trigger — 立即手動觸發（測試用）
router.post('/auto-report/trigger', async (req, res) => {
  const { type = 'pre', entryReasonStats = null } = req.body;
  if (!lineNotify.hasToken()) {
    return res.status(400).json({ error: '尚未設定 LINE Notify token' });
  }
  try {
    if (type === 'pre') {
      await scheduler.runPreMarketReport();
    } else if (type === 'weekly') {
      await scheduler.runWeeklyReport(entryReasonStats);
    } else {
      await scheduler.runPostMarketReport();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/chip-scan — 查詢籌碼異動掃描設定
router.get('/chip-scan', (_req, res) => {
  res.json(chipScanner.getSettings());
});

// POST /api/settings/chip-scan — 更新籌碼異動掃描設定
// Body: { enabled, pool }
router.post('/chip-scan', (req, res) => {
  const { enabled, pool } = req.body;
  const patch = {};
  if (typeof enabled === 'boolean') patch.enabled = enabled;
  if (Array.isArray(pool)) patch.pool = pool;
  chipScanner.updateSettings(patch);
  res.json({ success: true, ...chipScanner.getSettings() });
});

// POST /api/settings/chip-scan/trigger — 立即手動觸發（測試用）
router.post('/chip-scan/trigger', async (req, res) => {
  try {
    await scheduler.runChipScanJob();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
