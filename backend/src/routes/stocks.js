const express = require('express');
const router = express.Router();
const twse = require('../services/twse');

// GET /api/stocks/:codes — 單一或多個股票報價（逗號分隔）
// 例：/api/stocks/2330  或  /api/stocks/2330,2317,2454
router.get('/:codes', async (req, res) => {
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

module.exports = router;
