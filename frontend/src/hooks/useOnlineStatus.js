import { useState, useEffect } from 'react';

/**
 * 偵測網路連線狀態
 * @returns {{ isOnline: boolean, since: Date|null }}
 *   isOnline  - 目前是否在線
 *   since     - 最後一次狀態改變的時間（null 表示從未離線）
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [since, setSince] = useState(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSince(new Date());
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSince(new Date());
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, since };
}
