const express = require('express');
const router = express.Router();
const twse = require('../services/twse');

// GET /api/stocks/:codes — 單一或多個股票報價（逗號分隔）
router.get('/:codes', async (req, res) => {
  // 避免與 /history 路由衝突
  if (req.params.codes === 'history') return res.status(400).json({ error: '請提供股票代號' });

  try {
    const codes = req.params.codes.split(',').map(c => c.trim()).filter(Boolean).slice(0, 20);
    if (!codes.length) return res.status(400).json({ error: '請提供股票代號' });

    const quotes = await twse.fetchRealtimeQuotes(codes);
    res.json({
      quotes,
      tradingHours: twse.isTradingHours(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/:code/history?months=3 — 個股日K歷史資料
router.get('/:code/history', async (req, res) => {
  try {
    const { code } = req.params;
    const months = Math.min(parseInt(req.query.months) || 3, 12);
    const data = await twse.fetchHistory(code, months);
    res.json({ code, months, candles: data, count: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
