import { useEffect, useState, useRef } from 'react';
import { createChart, LineSeries, HistogramSeries } from 'lightweight-charts';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';

const SECTORS = [
  { name: '半導體', codes: ['2330', '2454', '2303'], color: '#8b5cf6' },
  { name: '電子零組件', codes: ['2317', '2308'], color: '#3b82f6' },
  { name: '金融保險', codes: ['2881', '2882', '2886', '2891'], color: '#f59e0b' },
  { name: '電腦週邊', codes: ['2382'], color: '#10b981' },
  { name: '化工', codes: ['1301', '6505'], color: '#6366f1' },
  { name: '鋼鐵', codes: ['2002'], color: '#94a3b8' },
];

// ── 分時走勢圖 ────────────────────────────────────────
function IntradayChart({ ticks, prevClose }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !ticks.length) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#64748b', fontFamily: "'Fira Code', Consolas, monospace", fontSize: 10 },
      grid: { vertLines: { color: 'rgba(255,255,255,.04)' }, horzLines: { color: 'rgba(255,255,255,.04)' } },
      crosshair: { vertLine: { color: 'rgba(255,255,255,.2)', labelBackgroundColor: '#1e2d40' }, horzLine: { color: 'rgba(255,255,255,.2)', labelBackgroundColor: '#1e2d40' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,.06)', textColor: '#64748b' },
      timeScale: {
        borderColor: 'rgba(255,255,255,.06)', timeVisible: true,
        tickMarkFormatter: t => {
          const d = new Date(t * 1000);
          return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        },
      },
      handleScroll: false,
      handleScale: false,
    });

    const lastVal = ticks[ticks.length - 1]?.value ?? prevClose;
    const chgColor = lastVal >= prevClose ? '#ff4d4f' : '#00c48c';

    const lineSeries = chart.addSeries(LineSeries, {
      color: chgColor,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
    });
    lineSeries.setData(ticks);

    // 前日收盤參考線
    if (prevClose) {
      const refLine = chart.addSeries(LineSeries, {
        color: 'rgba(255,255,255,.2)',
        lineWidth: 1,
        lineStyle: 2, // dashed
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      refLine.setData(ticks.map(t => ({ time: t.time, value: prevClose })));
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chartRef.current?.applyOptions({ width: containerRef.current?.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chartRef.current?.remove(); chartRef.current = null; };
  }, [ticks, prevClose]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ── 主元件 ────────────────────────────────────────────
export default function Market() {
  const { taiex, quotes, getColor } = useStockStore();
  const [breadth, setBreadth] = useState(null);
  const [history, setHistory] = useState([]);
  const [intraday, setIntraday] = useState(null);
  const [chartMode, setChartMode] = useState('intraday'); // 'intraday' | 'history'

  useEffect(() => {
    api.getBreadth().then(setBreadth).catch(() => {});
    api.getMarketIntraday().then(setIntraday).catch(() => {});
  }, []);

  useEffect(() => {
    if (!taiex) return;
    setHistory(prev => {
      const next = [...prev, { t: Date.now(), v: taiex.value }];
      return next.slice(-120);
    });
  }, [taiex?.value]);

  const chgColor = taiex ? (taiex.changePercent > 0 ? '#ff4d4f' : taiex.changePercent < 0 ? '#00c48c' : '#64748b') : '#64748b';

  const sectorPerf = SECTORS.map(sector => {
    const vals = sector.codes.map(c => quotes[c]?.changePercent).filter(v => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { ...sector, avg: +avg.toFixed(2) };
  }).sort((a, b) => b.avg - a.avg);

  const breadthTotal = breadth ? breadth.up + breadth.down + breadth.flat : 0;
  const prevClose = taiex ? +(taiex.value - taiex.change).toFixed(2) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>

      {/* ── TAIEX 主卡（跨全欄）── */}
      <div style={{
        gridColumn: '1 / -1',
        background: 'var(--color-background-card)',
        border: '1px solid var(--color-border-tertiary)',
        borderRadius: 8,
        padding: '14px 16px',
      }}>
        {/* 上排：數值 + 切換 + OHLV */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 180px', gap: 16, alignItems: 'center', marginBottom: 10 }}>
          {/* 指數數值 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>
              加權指數 TAIEX
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: chgColor, fontFamily: 'var(--font-mono)', lineHeight: 1, letterSpacing: '-.02em' }}>
              {taiex ? taiex.value.toLocaleString() : '——'}
            </div>
            {taiex && (
              <div style={{ fontSize: 13, color: chgColor, marginTop: 5, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {taiex.changePercent > 0 ? '▲' : taiex.changePercent < 0 ? '▼' : '—'} {Math.abs(taiex.change).toFixed(2)}
                <span style={{ fontSize: 12, marginLeft: 6, opacity: .8 }}>({taiex.changePercent > 0 ? '+' : ''}{taiex.changePercent}%)</span>
              </div>
            )}
          </div>

          {/* 圖表區 + 切換按鈕 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              {[['intraday', '分時'], ['history', '走勢']].map(([k, l]) => (
                <button key={k} onClick={() => setChartMode(k)} style={{
                  padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                  border: `1px solid ${chartMode === k ? 'var(--color-brand)' : 'var(--color-border-secondary)'}`,
                  background: chartMode === k ? 'rgba(59,130,246,.15)' : 'transparent',
                  color: chartMode === k ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ height: 80 }}>
              {chartMode === 'intraday' && intraday?.ticks?.length > 2 ? (
                <IntradayChart ticks={intraday.ticks} prevClose={prevClose} />
              ) : chartMode === 'history' && history.length > 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                    <Tooltip formatter={v => [v.toLocaleString(), '指數']} labelFormatter={() => ''} contentStyle={{ background: '#1e2d40', border: '1px solid #1a2535', borderRadius: 4, fontSize: 11 }} />
                    <Line type="monotone" dataKey="v" stroke={chgColor} dot={false} strokeWidth={1.5} activeDot={{ r: 3, fill: chgColor, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                  {chartMode === 'intraday' ? '盤後無分時資料' : '等待資料...'}
                </div>
              )}
            </div>
          </div>

          {/* OHLV */}
          {taiex ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
              {[
                { label: '開', val: taiex.open?.toLocaleString(), color: 'var(--color-text-secondary)' },
                { label: '高', val: taiex.high?.toLocaleString(), color: 'var(--color-up)' },
                { label: '低', val: taiex.low?.toLocaleString(),  color: 'var(--color-down)' },
                { label: '昨收', val: prevClose?.toLocaleString(), color: 'var(--color-text-tertiary)' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)', marginTop: 1 }}>{item.val || '—'}</div>
                </div>
              ))}
            </div>
          ) : <div />}
        </div>

        {/* 類股分時指數（來自 MI_5MINS_INDEX 最後一筆）*/}
        {intraday?.sectors?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--color-border-tertiary)', paddingTop: 8, marginTop: 2 }}>
            {intraday.sectors.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'var(--color-background-secondary)', borderRadius: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{s.name}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{s.value.toLocaleString()}</span>
              </div>
            ))}
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', alignSelf: 'center', marginLeft: 'auto' }}>
              {intraday.date ? `${intraday.date.slice(0,4)}/${intraday.date.slice(4,6)}/${intraday.date.slice(6,8)}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── 市場廣度 ── */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">市場廣度</div>
        {breadth ? (
          <>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 14, gap: 1 }}>
              <div style={{ flex: breadth.up,   background: '#ff4d4f', transition: 'flex .5s' }} />
              <div style={{ flex: breadth.flat, background: '#334155' }} />
              <div style={{ flex: breadth.down, background: '#00c48c', transition: 'flex .5s' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                { label: '上漲', val: breadth.up,   color: '#ff4d4f', bg: 'rgba(255,77,79,.08)' },
                { label: '平盤', val: breadth.flat, color: '#64748b', bg: 'rgba(100,116,139,.08)' },
                { label: '下跌', val: breadth.down, color: '#00c48c', bg: 'rgba(0,196,140,.08)' },
              ].map(item => (
                <div key={item.label} style={{ background: item.bg, borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: item.color, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: item.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{item.val.toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {breadthTotal ? (item.val / breadthTotal * 100).toFixed(1) : 0}%
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
              共 {breadth.total?.toLocaleString()} 檔
              {breadth.up > breadth.down
                ? <span style={{ color: '#ff4d4f', marginLeft: 8, fontWeight: 600 }}>多方強勢</span>
                : breadth.down > breadth.up
                ? <span style={{ color: '#00c48c', marginLeft: 8, fontWeight: 600 }}>空方主導</span>
                : <span style={{ color: '#64748b', marginLeft: 8, fontWeight: 600 }}>多空拉鋸</span>}
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, textAlign: 'center', padding: 20 }}>載入中...</div>
        )}
      </div>

      {/* ── 類股表現 ── */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">類股表現</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sectorPerf.map(s => {
            const up = s.avg > 0;
            const color = up ? '#ff4d4f' : s.avg < 0 ? '#00c48c' : '#64748b';
            const barPct = Math.min(Math.abs(s.avg) / 5 * 100, 100);
            return (
              <div key={s.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{s.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{up ? '+' : ''}{s.avg}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--color-background-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 2, boxShadow: up ? 'var(--glow-up)' : 'var(--glow-down)', transition: 'width .5s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 重點個股 ── */}
      <div style={{ gridColumn: '1 / -1', background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">重點個股</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {['2330','2317','2454','2882','2303','2382','6505','2002'].map(code => {
            const q = quotes[code];
            if (!q) return (
              <div key={code} style={{ background: 'var(--color-background-secondary)', borderRadius: 6, padding: '8px 10px', opacity: .4 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{code}</div>
                <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>——</div>
              </div>
            );
            const up = q.changePercent > 0, flat = q.changePercent === 0;
            const color = flat ? '#64748b' : up ? '#ff4d4f' : '#00c48c';
            return (
              <div key={code} style={{
                background: up ? 'rgba(255,77,79,.06)' : flat ? 'var(--color-background-secondary)' : 'rgba(0,196,140,.06)',
                border: `1px solid ${up ? 'rgba(255,77,79,.15)' : flat ? 'var(--color-border-tertiary)' : 'rgba(0,196,140,.15)'}`,
                borderRadius: 6, padding: '8px 10px', transition: 'all .3s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{code}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: up ? 'rgba(255,77,79,.15)' : flat ? 'rgba(100,116,139,.15)' : 'rgba(0,196,140,.15)', color }}>
                    {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                  {q.price >= 100 ? q.price.toFixed(1) : q.price.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
