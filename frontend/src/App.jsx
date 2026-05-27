import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useStockStore } from './stores/stockStore';
import Market from './components/Market';
import HotStocks from './components/HotStocks';
import Watchlist from './components/Watchlist';
import Alerts from './components/Alerts';
import AIAnalysis from './components/AIAnalysis';
import Settings from './components/Settings';

const TABS = [
  { id: 'market',   label: '大盤',   icon: '📈' },
  { id: 'hot',      label: '熱門',   icon: '🔥' },
  { id: 'watch',    label: '自選股', icon: '⭐' },
  { id: 'alerts',   label: '警報',   icon: '🔔' },
  { id: 'ai',       label: 'AI分析', icon: '🤖' },
  { id: 'settings', label: '設定',   icon: '⚙️' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('market');
  const { wsStatus, lastUpdated, taiex } = useStockStore();
  useWebSocket(); // 建立 WebSocket 連線

  const statusColor = { connected: '#22c55e', connecting: '#f59e0b', disconnected: '#6b7280' }[wsStatus];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 16px', fontFamily: 'system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 14px', background: 'var(--color-background-primary,#fff)', border: '0.5px solid #e5e7eb', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 16, fontWeight: 500 }}>台股智能看盤</span>
          {taiex && (
            <span style={{ fontSize: 13, fontWeight: 500, color: taiex.changePercent >= 0 ? '#ef4444' : '#22c55e', marginLeft: 8 }}>
              {taiex.value.toLocaleString()} {taiex.changePercent >= 0 ? '▲' : '▼'} {Math.abs(taiex.changePercent)}%
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          {lastUpdated ? lastUpdated.toLocaleTimeString('zh-TW') : '—'}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: '#f3f4f6', padding: 4, borderRadius: 8 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1, padding: '6px 4px', border: 'none', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, background: activeTab === t.id ? '#fff' : 'transparent',
              color: activeTab === t.id ? '#111' : '#6b7280',
              fontWeight: activeTab === t.id ? 500 : 400,
              boxShadow: activeTab === t.id ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
              transition: 'all .15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      {activeTab === 'market'   && <Market />}
      {activeTab === 'hot'      && <HotStocks />}
      {activeTab === 'watch'    && <Watchlist />}
      {activeTab === 'alerts'   && <Alerts />}
      {activeTab === 'ai'       && <AIAnalysis />}
      {activeTab === 'settings' && <Settings />}
    </div>
  );
}
