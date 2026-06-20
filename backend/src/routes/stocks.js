const express = require('express');
const router = express.Router();
const twse = require('../services/twse');
const { fetchAllEvents } = require('../services/calendar');

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

// GET /api/stocks/:code/valuation — 個股本益比/殖利率/股價淨值比
router.get('/:code/valuation', async (req, res) => {
  try {
    const all = await twse.fetchValuation();
    const data = all[req.params.code] || null;
    res.json({ code: req.params.code, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/:code/institutional?months=3 — 個股三大法人歷史
router.get('/:code/institutional', async (req, res) => {
  try {
    const { code } = req.params;
    const months = Math.min(parseInt(req.query.months) || 3, 12);
    const data = await twse.fetchInstitutionalStock(code, months);
    res.json({ code, months, data, count: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/:code/margin?months=3 — 個股融資融券歷史
router.get('/:code/margin', async (req, res) => {
  try {
    const { code } = req.params;
    const months = Math.min(parseInt(req.query.months) || 3, 12);
    const data = await twse.fetchMarginStock(code, months);
    res.json({ code, months, data, count: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/:code/announcements — 個股重要事件（除息/除權/財報）
router.get('/:code/announcements', async (req, res) => {
  try {
    const { code } = req.params;
    const all = await fetchAllEvents();
    const events = all.filter(e => e.code === code);
    res.json({ code, events, count: events.length });
  } catch (err) {
    res.json({ code: req.params.code, events: [], count: 0 });
  }
});

// GET /api/stocks/:code/financials?months=13 — 個股月營收 YoY（MOPS）
router.get('/:code/financials', async (req, res) => {
  try {
    const { code } = req.params;
    const months = Math.min(parseInt(req.query.months) || 13, 24);
    const data = await twse.fetchMonthlyRevenue(code, months);
    res.json({ code, months, data, count: data.length });
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
