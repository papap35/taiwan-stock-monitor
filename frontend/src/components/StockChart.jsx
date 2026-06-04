import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { api } from '../services/api';
import { useStockStore } from '../stores/stockStore';

const PERIODS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
];

/** 計算簡單移動平均 */
function calcMA(candles, period) {
  return candles.map((c, i) => {
    if (i < period - 1) return null;
    const avg = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.close, 0) / period;
    return { time: c.time, value: +avg.toFixed(2) };
  }).filter(Boolean);
}

export default function StockChart({ stock, onClose }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [candles, setCandles] = useState([]);
  const [months, setMonths] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMA, setShowMA] = useState({ ma5: true, ma20: true, ma60: false });
  const { quotes, getColor } = useStockStore();

  const q = quotes[stock.code];
  const price = q?.price ?? stock.price;
  const changePercent = q?.changePercent ?? stock.changePercent ?? 0;
  const chgColor = changePercent > 0 ? '#ff4d4f' : changePercent < 0 ? '#00c48c' : '#64748b';

  // 載入歷史資料
  const loadHistory = useCallback(async (m) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getHistory(stock.code, m);
      setCandles(data.candles || []);
    } catch (e) {
      setError(`無法載入歷史資料：${e.message}`);
    }
    setLoading(false);
  }, [stock.code]);

  useEffect(() => { loadHistory(months); }, [months, loadHistory]);

  // 建立圖表
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // 銷毀舊圖表
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0f1923' },
        textColor: '#64748b',
        fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,.04)' },
        horzLines: { color: 'rgba(255,255,255,.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,.15)', labelBackgroundColor: '#1e2d40' },
        horzLine: { color: 'rgba(255,255,255,.15)', labelBackgroundColor: '#1e2d40' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,.06)',
        textColor: '#64748b',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,.06)',
        timeVisible: true,
        tickMarkFormatter: (time) => {
          const d = new Date(time * 1000);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    // 主 K 線（上方 75% 高度）
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ff4d4f',
      downColor: '#00c48c',
      borderUpColor: '#ff4d4f',
      borderDownColor: '#00c48c',
      wickUpColor: '#ff4d4f',
      wickDownColor: '#00c48c',
      priceScaleId: 'right',
    });
    candleSeries.setData(candles);

    // 成交量（下方 20% 高度，獨立 pane 效果）
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      color: '#26a69a',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    chart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.02, bottom: 0.22 },
    });
    volSeries.setData(candles.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(255,77,79,.4)' : 'rgba(0,196,140,.4)',
    })));

    // MA 線
    const maColors = { ma5: '#f59e0b', ma20: '#3b82f6', ma60: '#8b5cf6' };
    const maPeriods = { ma5: 5, ma20: 20, ma60: 60 };

    Object.entries(showMA).forEach(([key, visible]) => {
      if (!visible) return;
      const maData = calcMA(candles, maPeriods[key]);
      if (maData.length === 0) return;
      const lineSeries = chart.addSeries(LineSeries, {
        color: maColors[key],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'right',
      });
      lineSeries.setData(maData);
    });

    chart.timeScale().fitContent();
    chartRef.current = chart;

    // 自適應寬度
    const ro = new ResizeObserver(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [candles, showMA]);

  // 關閉（ESC）
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 計算統計
  const stats = candles.length > 0 ? (() => {
    const last = candles[candles.length - 1];
    const prev = candles.length > 1 ? candles[candles.length - 2] : null;
    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    const pctFromHigh = high ? +((last.close / high - 1) * 100).toFixed(1) : 0;
    const pctFromLow = low ? +((last.close / low - 1) * 100).toFixed(1) : 0;
    const ma20val = candles.length >= 20
      ? +(candles.slice(-20).reduce((s, c) => s + c.close, 0) / 20).toFixed(2)
      : null;
    const ma5val = candles.length >= 5
      ? +(candles.slice(-5).reduce((s, c) => s + c.close, 0) / 5).toFixed(2)
      : null;
    return { last, prev, high, low, pctFromHigh, pctFromLow, ma20val, ma5val };
  })() : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#0f1923',
        border: '1px solid var(--color-border-secondary)',
        borderRadius: 10,
        width: '100%', maxWidth: 900,
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,.8)',
      }}
        className="fade-in"
      >
        {/* ── 標題列 ───────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-tertiary)',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{stock.name}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{stock.code}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', padding: '1px 6px', background: 'var(--color-background-tertiary)', borderRadius: 3 }}>
                日K
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: chgColor, fontFamily: 'var(--font-mono)' }}>
                {price?.toFixed(price >= 100 ? 1 : 2)}
              </span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: chgColor, fontWeight: 600 }}>
                {changePercent > 0 ? '▲' : changePercent < 0 ? '▼' : '—'}
                {Math.abs(changePercent).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* 期間選擇 */}
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODS.map(p => (
              <button key={p.months} onClick={() => setMonths(p.months)}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${months === p.months ? 'var(--color-brand)' : 'var(--color-border-secondary)'}`,
                  background: months === p.months ? 'rgba(59,130,246,.15)' : 'transparent',
                  color: months === p.months ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
                  cursor: 'pointer', transition: 'all .15s',
                }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* MA 開關 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[
              { key: 'ma5',  label: 'MA5',  color: '#f59e0b' },
              { key: 'ma20', label: 'MA20', color: '#3b82f6' },
              { key: 'ma60', label: 'MA60', color: '#8b5cf6' },
            ].map(ma => (
              <button key={ma.key}
                onClick={() => setShowMA(p => ({ ...p, [ma.key]: !p[ma.key] }))}
                style={{
                  padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  border: `1px solid ${showMA[ma.key] ? ma.color : 'var(--color-border-secondary)'}`,
                  background: showMA[ma.key] ? `rgba(${ma.color === '#f59e0b' ? '245,158,11' : ma.color === '#3b82f6' ? '59,130,246' : '139,92,246'},.12)` : 'transparent',
                  color: showMA[ma.key] ? ma.color : 'var(--color-text-tertiary)',
                  cursor: 'pointer', transition: 'all .15s',
                  textDecoration: showMA[ma.key] ? 'none' : 'line-through',
                  opacity: showMA[ma.key] ? 1 : .5,
                }}>
                {ma.label}
              </button>
            ))}
          </div>

          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 4,
            border: '1px solid var(--color-border-secondary)',
            background: 'transparent', color: 'var(--color-text-tertiary)',
            fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* ── 統計摘要 ─────────────────────── */}
        {stats && (
          <div style={{
            display: 'flex', gap: 0,
            borderBottom: '1px solid var(--color-border-tertiary)',
            flexShrink: 0,
          }}>
            {[
              { label: `${months}M 高`, val: stats.high?.toFixed(stats.high >= 100 ? 1 : 2), sub: `距高 ${stats.pctFromHigh}%`, color: 'var(--color-up)' },
              { label: `${months}M 低`, val: stats.low?.toFixed(stats.low >= 100 ? 1 : 2), sub: `距低 +${stats.pctFromLow}%`, color: 'var(--color-down)' },
              { label: 'MA5',  val: stats.ma5val,  sub: stats.ma5val  ? (price > stats.ma5val  ? '站上 MA5'  : '跌破 MA5')  : '—', color: '#f59e0b' },
              { label: 'MA20', val: stats.ma20val, sub: stats.ma20val ? (price > stats.ma20val ? '站上 MA20' : '跌破 MA20') : '—', color: '#3b82f6' },
              { label: '最後收盤', val: stats.last?.close?.toFixed(stats.last?.close >= 100 ? 1 : 2), sub: `量 ${stats.last?.volume ? (stats.last.volume / 1000).toFixed(0) + '千' : '—'}`, color: 'var(--color-text-primary)' },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1, padding: '8px 14px',
                borderRight: i < 4 ? '1px solid var(--color-border-tertiary)' : 'none',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.val ?? '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── 圖表區 ───────────────────────── */}
        <div style={{ flex: 1, minHeight: 320, position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: '#0f1923', zIndex: 1,
              flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                載入 {stock.name} 日K資料...
              </div>
              <div style={{
                width: 120, height: 2, background: 'var(--color-background-tertiary)',
                borderRadius: 1, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', background: 'var(--color-brand)',
                  animation: 'ticker-scroll 1.5s linear infinite',
                  width: '40%',
                }} />
              </div>
            </div>
          )}
          {error && !loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8,
            }}>
              <div style={{ fontSize: 20, opacity: .3 }}>⚠</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{error}</div>
              <button onClick={() => loadHistory(months)} className="btn btn-sm" style={{ marginTop: 4 }}>重新載入</button>
            </div>
          )}
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%', minHeight: 360 }} />
        </div>

        {/* ── 說明列 ───────────────────────── */}
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--color-border-tertiary)',
          display: 'flex', gap: 14, alignItems: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
            資料來源：台灣證券交易所 TWSE・日K線・{candles.length} 根蠟燭
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { color: '#ff4d4f', label: '上漲' },
              { color: '#00c48c', label: '下跌' },
            ].map(item => (
              <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                <span style={{ width: 8, height: 8, background: item.color, borderRadius: 1, display: 'inline-block' }} />
                {item.label}
              </span>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>ESC 關閉</span>
        </div>
      </div>
    </div>
  );
}
