const WebSocket = require('ws');
const cron = require('node-cron');
const twse = require('./services/twse');
const alertEngine = require('./services/alert-engine');

let wss = null;
let latestQuotes = {};
let latestTaiex = null;

function broadcast(type, payload) {
  if (!wss) return;
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

/**
 * 收集所有已連線 client 訂閱的股票代號
 */
function collectSubscribedCodes() {
  const codes = new Set();
  if (!wss) return codes;
  wss.clients.forEach(client => {
    if (Array.isArray(client._subscribedCodes)) {
      client._subscribedCodes.forEach(c => codes.add(c));
    }
  });
  return codes;
}

/**
 * 主要抓取任務：大盤 + 熱門股 + 所有 client 自選股 → 推播
 */
async function fetchAndBroadcast() {
  try {
    // 合併 POPULAR_STOCKS + 所有 client 訂閱的自選股代號
    const extraCodes = collectSubscribedCodes();
    const allCodes = [...new Set([...twse.POPULAR_STOCKS, ...extraCodes])];

    const [taiex, realtimeQuotes] = await Promise.all([
      twse.fetchTaiex(),
      twse.fetchRealtimeQuotes(allCodes),
    ]);

    latestTaiex  = taiex;
    latestQuotes = realtimeQuotes;

    if (taiex) broadcast('taiex', taiex);
    broadcast('quotes', realtimeQuotes);

    // 檢查警報
    const triggered = alertEngine.checkQuotes(realtimeQuotes);
    if (triggered.length > 0) {
      broadcast('alerts_triggered', triggered);
    }
  } catch (err) {
    console.error('[WS] fetchAndBroadcast error:', err.message);
  }
}

/**
 * 初始化 WebSocket Server 並綁定排程
 * @param {http.Server} server
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected: ${ip} (total: ${wss.clients.size})`);

    // 連線後立即推播最新資料
    if (latestTaiex) ws.send(JSON.stringify({ type: 'taiex', payload: latestTaiex, ts: Date.now() }));
    if (Object.keys(latestQuotes).length) ws.send(JSON.stringify({ type: 'quotes', payload: latestQuotes, ts: Date.now() }));

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(ws, msg);
      } catch {/* ignore */}
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected (total: ${wss.clients.size})`);
    });

    ws.on('error', err => console.error('[WS] Client error:', err.message));
  });

  // 交易時段：每 15 秒抓取
  cron.schedule('*/15 * * * * *', () => {
    if (twse.isTradingHours()) fetchAndBroadcast();
  });

  // 非交易時段：每 5 分鐘抓取一次（維持資料新鮮）
  cron.schedule('*/5 * * * *', () => {
    if (!twse.isTradingHours()) fetchAndBroadcast();
  });

  // 啟動時先抓一次
  fetchAndBroadcast();

  console.log('[WS] WebSocket server initialized');
  return wss;
}

/**
 * 處理客戶端訊息（例如訂閱特定股票）
 */
function handleClientMessage(ws, msg) {
  switch (msg.type) {
    case 'subscribe':
      // 訂閱特定股票的即時報價
      ws._subscribedCodes = msg.codes || [];
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      break;
  }
}

module.exports = { initWebSocket, broadcast };
