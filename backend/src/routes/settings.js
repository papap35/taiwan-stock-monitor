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
const lineNotify = require('../services/lineNotify');

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

module.exports = router;
