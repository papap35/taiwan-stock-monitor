/**
 * backend/src/routes/sync.js
 * Supabase 雲端同步 API
 *
 * GET  /api/sync/status     - 查詢 Supabase 是否已啟用
 * GET  /api/sync/pull        - 從 Supabase 拉取所有資料
 * POST /api/sync/push        - 推送所有資料到 Supabase
 * POST /api/sync/push/watchlist  - 只推送 watchlist
 * POST /api/sync/push/alerts     - 只推送 alerts
 */
const express = require('express');
const router  = express.Router();
const sb      = require('../services/supabase');

// GET /api/sync/status
router.get('/status', (req, res) => {
  res.json({ enabled: sb.isEnabled() });
});

// GET /api/sync/pull
router.get('/pull', async (req, res) => {
  if (!sb.isEnabled()) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    const data = await sb.pullAll();
    res.json(data);
  } catch (err) {
    console.error('[sync] pull error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/push  body: { watchlist, groups, alerts, settings }
router.post('/push', async (req, res) => {
  if (!sb.isEnabled()) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    await sb.pushAll(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('[sync] push error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/push/watchlist
router.post('/push/watchlist', async (req, res) => {
  if (!sb.isEnabled()) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    await sb.pushWatchlist(req.body.watchlist ?? []);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/push/alerts
router.post('/push/alerts', async (req, res) => {
  if (!sb.isEnabled()) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    await sb.pushAlerts(req.body.alerts ?? []);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
