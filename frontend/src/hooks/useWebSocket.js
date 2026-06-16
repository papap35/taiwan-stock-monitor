import { useEffect, useRef, useCallback } from 'react';
import { useStockStore } from '../stores/stockStore';
import { fireBrowserNotifications } from '../utils/browserNotify';

const WS_URL = import.meta.env.VITE_WS_URL
  ? `${import.meta.env.VITE_WS_URL}/ws`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export function useWebSocket() {
  const ws             = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectCount = useRef(0);
  const { setTaiex, setQuotes, addTriggeredAlerts, setWsStatus, watchlist, settings } = useStockStore();

  // ── 訂閱自選股代號 ────────────────────────────────────
  const subscribeWatchlist = useCallback((socket) => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const codes = (watchlist || []).map(w => w.code).filter(Boolean);
    if (!codes.length) return;
    socket.send(JSON.stringify({ type: 'subscribe', codes }));
  }, [watchlist]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setWsStatus('connecting');
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      reconnectCount.current = 0;
      setWsStatus('connected');
      console.log('[WS] Connected');
      // 連線成功後立即訂閱自選股，讓後端下次推播時包含這些代號
      subscribeWatchlist(socket);
    };

    socket.onmessage = (e) => {
      try {
        const { type, payload } = JSON.parse(e.data);
        switch (type) {
          case 'taiex':            setTaiex(payload);            break;
          case 'quotes':           setQuotes(payload);           break;
          case 'alerts_triggered':
            addTriggeredAlerts(payload);
            if (settings.browserNotifEnabled) fireBrowserNotifications(payload);
            break;
        }
      } catch {/* ignore */}
    };

    socket.onclose = () => {
      setWsStatus('disconnected');
      const delay = Math.min(2000 * (2 ** reconnectCount.current), 30000);
      reconnectCount.current++;
      console.log(`[WS] Disconnected. Reconnecting in ${delay}ms...`);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    socket.onerror = (err) => {
      console.error('[WS] Error:', err);
      socket.close();
    };

    ws.current = socket;
  }, [setTaiex, setQuotes, addTriggeredAlerts, setWsStatus, subscribeWatchlist]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  // ── 自選股變動時重新訂閱 ─────────────────────────────
  useEffect(() => {
    subscribeWatchlist(ws.current);
  }, [watchlist, subscribeWatchlist]);

  const sendMessage = useCallback((type, data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  return { sendMessage };
}
