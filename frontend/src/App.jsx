import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useStockStore } from './stores/stockStore';
import Dashboard from './components/Dashboard';
import Market from './components/Market';
import HotStocks from './components/HotStocks';
import Watchlist from './components/Watchlist';
import Alerts from './components/Alerts';
import AIAnalysis from './components/AIAnalysis';
import Settings from './components/Settings';
import MarketTicker from './components/MarketTicker';
import Chips from './components/Chips';

const TABS = [
  { id: 'home',     label: '首頁',     icon: '🏠' },
  { id: 'market',   label: '大盤總覽', icon: '📈' },
  { id: 'hot',      label: '熱門股票', icon: '🔥' },
  { id: 'watch',    label: '自選股',   icon: '⭐' },
  { id: 'chips',    label: '籌碼分析', icon: '🧩' },
  { id: 'alerts',   label: '警報設定', icon: '🔔' },
  { id: 'ai',       label: 'AI 分析',  icon: '🤖' },
  { id: 'settings', label: '系統設定', icon: '⚙️' },
];

const WS_LABEL = { connected: '連線中', connecting: '連線中...', disconnected: '已斷線' };
const WS_COLOR = { connected: '#00c48c', connecting: '#f59e0b', disconnected: '#64748b' };

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const { wsStatus, lastUpdated, taiex, alerts, triggerHistory } = useStockStore();
  useWebSocket();

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isTW = taiex && taiex.changePercent >= 0;
  const chgColor = taiex ? (taiex.changePercent > 0 ? '#ff4d4f' : taiex.changePercent < 0 ? '#00c48c' : '#64748b') : '#64748b';
  const unreadAlerts = triggerHistory.filter(e => !e._read).length;

  // 是否在台股交易時段 09:00–13:30
  const isTradingHours = (() => {
    const h = now.getHours(), m = now.getMinutes();
    const min = h * 60 + m;
    const day = now.getDay();
    return day >= 1 && day <= 5 && min >= 9 * 60 && min <= 13 * 60 + 30;
  })();

  return (
    <div style={{ minHeight: '100dvh', background: '#0a1018', display: 'flex', flexDirection: 'column' }}>

      {/* ── TOP BAR ─────────────────────────────── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 16px',
        height: 48,
        background: 'var(--color-background-card)',
        borderBottom: '1px solid var(--color-border-tertiary)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <div style={{
            width: 6, height: 24, borderRadius: 3,
            background: 'linear-gradient(180deg,#ff4d4f,#3b82f6)',
          }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-.01em', color: '#e2e8f0' }}>
            台股終端機
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
            color: 'var(--color-text-tertiary)', marginLeft: 2,
          }}>PRO</span>
        </div>

        {/* 大盤數值 */}
        {taiex ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '.06em' }}>
              TAIEX
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: chgColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {taiex.value.toLocaleString()}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)',
              color: chgColor, display: 'flex', alignItems: 'center', gap: 3,
            }}>
              {taiex.changePercent > 0 ? '▲' : taiex.changePercent < 0 ? '▼' : '—'}
              {Math.abs(taiex.change).toFixed(0)}
              <span style={{ opacity: .7 }}>({taiex.changePercent > 0 ? '+' : ''}{taiex.changePercent}%)</span>
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>等待資料...</span>
        )}

        {/* 交易狀態 */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
          padding: '2px 8px', borderRadius: 3,
          background: isTradingHours ? 'rgba(255,77,79,.12)' : 'rgba(100,116,139,.1)',
          color: isTradingHours ? '#ff4d4f' : '#64748b',
          border: `1px solid ${isTradingHours ? 'rgba(255,77,79,.25)' : 'rgba(100,116,139,.2)'}`,
        }}>
          {isTradingHours ? '● 交易中' : '○ 已收盤'}
        </span>

        <div style={{ flex: 1 }} />

        {/* 最後更新 */}
        {lastUpdated && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            更新 {lastUpdated.toLocaleTimeString('zh-TW', { hour12: false })}
          </span>
        )}

        {/* 時間 */}
        <span style={{
          fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600,
          color: 'var(--color-text-secondary)',
          minWidth: 70, textAlign: 'right',
        }}>
          {now.toLocaleTimeString('zh-TW', { hour12: false })}
        </span>

        {/* 連線狀態 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: WS_COLOR[wsStatus],
            boxShadow: wsStatus === 'connected' ? '0 0 6px #00c48c' : 'none',
          }} className={wsStatus === 'connecting' ? 'pulse' : ''} />
          <span style={{ fontSize: 10, color: WS_COLOR[wsStatus], fontWeight: 600, letterSpacing: '.04em' }}>
            {WS_LABEL[wsStatus]}
          </span>
        </div>
      </header>

      {/* ── TICKER ──────────────────────────────── */}
      <MarketTicker />

      {/* ── NAV TABS ────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 1,
        padding: '0 12px',
        background: 'var(--color-background-secondary)',
        borderBottom: '1px solid var(--color-border-tertiary)',
        flexShrink: 0,
      }}>
        {TABS.map(t => {
          const isActive = activeTab === t.id;
          const hasBadge = t.id === 'alerts' && unreadAlerts > 0;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              position: 'relative',
              padding: '9px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--color-brand)' : '2px solid transparent',
              color: isActive ? '#e2e8f0' : 'var(--color-text-tertiary)',
              fontWeight: isActive ? 600 : 400,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'color .15s',
              whiteSpace: 'nowrap',
              marginBottom: -1,
            }}>
              <span style={{ fontSize: 11, opacity: .7 }}>{t.icon}</span>
              {t.label}
              {hasBadge && (
                <span style={{
                  background: '#ff4d4f', color: '#fff',
                  fontSize: 9, fontWeight: 700,
                  padding: '0 4px', borderRadius: 10, lineHeight: '14px',
                  minWidth: 14, textAlign: 'center',
                }}>{unreadAlerts}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── CONTENT ─────────────────────────────── */}
      <main style={{
        flex: 1,
        padding: '12px 14px',
        maxWidth: 1200,
        width: '100%',
        margin: '0 auto',
        alignSelf: 'stretch',
      }} className="fade-in" key={activeTab}>
        {activeTab === 'home'     && <Dashboard />}
        {activeTab === 'market'   && <Market />}
        {activeTab === 'hot'      && <HotStocks />}
        {activeTab === 'watch'    && <Watchlist />}
        {activeTab === 'chips'    && <Chips />}
        {activeTab === 'alerts'   && <Alerts />}
        {activeTab === 'ai'       && <AIAnalysis />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* ── STATUS BAR ──────────────────────────── */}
      <footer style={{
        height: 22,
        background: 'var(--color-background-card)',
        borderTop: '1px solid var(--color-border-tertiary)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 16,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          資料來源：台灣證券交易所 TWSE
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          AI：Claude Sonnet
        </span>
        {taiex && (
          <>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              開：<span style={{ fontFamily: 'var(--font-mono)' }}>{taiex.open?.toLocaleString()}</span>
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              高：<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-up)' }}>{taiex.high?.toLocaleString()}</span>
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              低：<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-down)' }}>{taiex.low?.toLocaleString()}</span>
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              量：<span style={{ fontFamily: 'var(--font-mono)' }}>{taiex.volume ? `${(taiex.volume / 100).toFixed(0)}億` : '—'}</span>
            </span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          警報 {alerts.length} 組
        </span>
      </footer>
    </div>
  );
}
