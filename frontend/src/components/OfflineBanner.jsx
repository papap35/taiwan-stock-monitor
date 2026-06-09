import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * 網路斷線提示橫幅
 * 離線時顯示紅色 banner，重新連線時顯示短暫綠色提示後消失
 */
export function OfflineBanner() {
  const { isOnline, since } = useOnlineStatus();

  // 初始狀態（since === null）且在線 → 完全不顯示
  if (isOnline && since === null) return null;

  // 重新連線後 3 秒內顯示「已重新連線」提示
  if (isOnline && since) {
    const secsSince = (Date.now() - since.getTime()) / 1000;
    if (secsSince > 3) return null;

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#16a34a', color: '#fff',
        padding: '8px 16px', textAlign: 'center', fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        ✅ 網路已恢復，資料將自動更新
      </div>
    );
  }

  // 離線中
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#b91c1c', color: '#fff',
      padding: '8px 16px', textAlign: 'center', fontSize: 13,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      ⚠️ 網路已斷線，目前顯示快取資料
      {since && (
        <span style={{ opacity: 0.8 }}>
          （{since.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })} 起）
        </span>
      )}
    </div>
  );
}

export default OfflineBanner;
