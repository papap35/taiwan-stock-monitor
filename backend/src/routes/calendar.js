/**
 * calendar.js route
 *
 * GET /api/calendar/events            取得所有事件（預設未來 60 天）
 * GET /api/calendar/events?days=30    取得未來 N 天事件
 * GET /api/calendar/events?codes=2330,2317  指定代號過濾
 */

const express = require('express');
const router  = express.Router();
const {
  fetchAllEvents,
  filterUpcoming,
  getEventsForCodes,
} = require('../services/calendar');

router.get('/events', async (req, res) => {
  try {
    const days  = parseInt(req.query.days)  || 60;
    const codes = req.query.codes ? req.query.codes.split(',').map(c => c.trim()).filter(Boolean) : null;

    let events = await fetchAllEvents();

    // 過濾未來 N 天
    events = filterUpcoming(events, days);

    // 可選：只回傳指定代號
    if (codes && codes.length > 0) {
      events = getEventsForCodes(events, codes);
    }

    res.json({ events, total: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
