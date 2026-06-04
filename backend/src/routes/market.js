const express = require('express');
const router = express.Router();
const twse = require('../services/twse');

// GET /api/market/taiex — 加權指數
router.get('/taiex', async (req, res) => {
  try {
    const data = await twse.fetchTaiex();
    if (!data) return res.status(503).json({ error: 'TWSE 資料暫時無法取得' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/hot?filter=vol|top|bottom|limit&limit=30
router.get('/hot', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 50);
    const filter = req.query.filter || 'vol';

    let stocks;
    switch (filter) {
      case 'top':    stocks = await twse.fetchTopGainers(limit); break;
      case 'bottom': stocks = await twse.fetchTopLosers(limit); break;
      case 'limit':
        stocks = (await twse.fetchHotStocks(100)).filter(s => Math.abs(s.changePercent) >= 9.9);
        break;
      default:
        stocks = await twse.fetchHotStocks(limit);
    }

    res.json({ stocks, tradingHours: twse.isTradingHours(), updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/breadth — 漲跌平家數
router.get('/breadth', async (req, res) => {
  try {
    const data = await twse.fetchMarketBreadth();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/valuation — 全市場本益比/殖利率/股價淨值比
router.get('/valuation', async (req, res) => {
  try {
    const data = await twse.fetchValuation();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/intraday — 今日大盤分時走勢
router.get('/intraday', async (req, res) => {
  try {
    const data = await twse.fetchIntradayTick();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/institutional — 三大法人今日全市場買賣超排行
router.get('/institutional', async (req, res) => {
  try {
    const data = await twse.fetchInstitutionalAll();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/status — 市場狀態
router.get('/status', (req, res) => {
  const now = new Date();
  res.json({
    trading: twse.isTradingHours(),
    serverTime: now.toISOString(),
    twTime: now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
  });
});

module.exports = router;
