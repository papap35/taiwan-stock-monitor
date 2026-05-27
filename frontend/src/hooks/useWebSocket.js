import { useEffect, useRef, useCallback } from 'react';
import { useStockStore } from '../stores/stockStore';

const WS_URL = import.meta.env.VITE_WS_URL
  ? `${import.meta.env.VITE_WS_URL}/ws`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export function useWebSocket() {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectCount = useRef(0);
  const { setTaiex, setQuotes, addTriggeredAlerts, setWsStatus } = useStockStore();

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setWsStatus('connecting');
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      reconnectCount.current = 0;
      setWsStatus('connected');
      console.log('[WS] Connected');
    };

    socket.onmessage = (e) => {
      try {
        const { type, payload } = JSON.parse(e.data);
        switch (type) {
          case 'taiex':           setTaiex(payload);                 break;
          case 'quotes':          setQuotes(payload);                break;
          case 'alerts_triggered': addTriggeredAlerts(payload);     break;
        }
      } catch {/* ignore */}
    };

    socket.onclose = () => {
      setWsStatus('disconnected');
      // 指數退避重連（最多 30 秒）
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
  }, [setTaiex, setQuotes, addTriggeredAlerts, setWsStatus]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((type, data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  return { sendMessage };
}
