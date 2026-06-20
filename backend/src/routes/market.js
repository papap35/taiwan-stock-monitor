const express = require('express');
const router = express.Router();
const twse = require('../services/twse');

// GET /api/market/taiex/history?months=3 — 大盤加權指數歷史日收盤
router.get('/taiex/history', async (req, res) => {
  try {
    const months = Math.min(parseInt(req.query.months) || 3, 12);
    const candles = await twse.fetchTaiexHistory(months);
    res.json({ months, candles, count: candles.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// GET /api/market/world — 國際主要指數
router.get('/world', async (req, res) => {
  try {
    const data = await twse.fetchWorldMarkets();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/futures — 外資台指期淨部位（TAIFEX 三大法人）
router.get('/futures', async (req, res) => {
  try {
    const data = await twse.fetchFuturesInstitutional();
    res.json(data || { error: 'no data' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/options — 台指選擇權 Put/Call Ratio（TAIFEX）
router.get('/options', async (req, res) => {
  try {
    const data = await twse.fetchOptionsData();
    res.json(data || { error: 'no data' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/margin-trend — 全市場融資融券近 20 日趨勢
router.get('/margin-trend', async (req, res) => {
  try {
    const data = await twse.fetchMarketMarginTrend();
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
