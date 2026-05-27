const express = require('express');
const router = express.Router();
const alertEngine = require('../services/alert-engine');

// GET /api/alerts — 取得所有警報
router.get('/', (req, res) => {
  res.json({
    alerts: alertEngine.getAlerts(),
    history: alertEngine.getTriggerHistory(20),
  });
});

// POST /api/alerts — 新增警報
// Body: { code, name, type, targetPrice, note }
router.post('/', (req, res) => {
  const { code, name, type, targetPrice, note } = req.body;

  if (!code || !type || targetPrice == null) {
    return res.status(400).json({ error: '必填欄位：code, type, targetPrice' });
  }

  const validTypes = ['loss', 'buy', 'sell', 'price_above', 'price_below', 'limit_up', 'limit_down'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type 必須是：${validTypes.join(', ')}` });
  }

  const alert = alertEngine.addAlert({ code, name, type, targetPrice: parseFloat(targetPrice), note });
  res.status(201).json(alert);
});

// DELETE /api/alerts/:id — 刪除警報
router.delete('/:id', (req, res) => {
  const deleted = alertEngine.removeAlert(req.params.id);
  if (!deleted) return res.status(404).json({ error: '警報不存在' });
  res.json({ success: true });
});

// DELETE /api/alerts/triggered/clear — 清除已觸發警報
router.delete('/triggered/clear', (req, res) => {
  alertEngine.clearTriggered();
  res.json({ success: true });
});

// GET /api/alerts/history — 觸發歷史紀錄
router.get('/history', (req, res) => {
  res.json(alertEngine.getTriggerHistory(50));
});

module.exports = router;
