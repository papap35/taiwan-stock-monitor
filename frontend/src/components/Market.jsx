import { useEffect, useState, useRef } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';
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

const REGION_FLAG = { US: '🇺🇸', JP: '🇯🇵', HK: '🇭🇰', KR: '🇰🇷', FX: '💱', CM: '🛢' };

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
      handleScroll: false, handleScale: false,
    });

    const lastVal = ticks[ticks.length - 1]?.value ?? prevClose;
    const chgColor = lastVal >= prevClose ? '#ff4d4f' : '#00c48c';

    const lineSeries = chart.addSeries(LineSeries, {
      color: chgColor, lineWidth: 1.5, priceLineVisible: false,
      lastValueVisible: true, crosshairMarkerRadius: 3,
    });
    lineSeries.setData(ticks);

    if (prevClose) {
      const refLine = chart.addSeries(LineSeries, {
        color: 'rgba(255,255,255,.2)', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
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

// ── 世界指數列 ────────────────────────────────────────
function WorldMarketsRow({ markets }) {
  if (!markets?.length) return null;
  return (
    <div style={{
      display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2,
      borderTop: '1px solid var(--color-border-tertiary)', paddingTop: 8, marginTop: 6,
    }}>
      {markets.map(m => {
        const up = m.changePercent > 0, dn = m.changePercent < 0;
        const color = up ? '#ff4d4f' : dn ? '#00c48c' : '#64748b';
        const bg = up ? 'rgba(255,77,79,.07)' : dn ? 'rgba(0,196,140,.07)' : 'rgba(100,116,139,.05)';
        return (
          <div key={m.symbol} style={{
            flexShrink: 0, background: bg, border: `1px solid ${up ? 'rgba(255,77,79,.15)' : dn ? 'rgba(0,196,140,.15)' : 'var(--color-border-tertiary)'}`,
            borderRadius: 5, padding: '4px 10px', minWidth: 110,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <span style={{ fontSize: 9 }}>{REGION_FLAG[m.region] || ''}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{m.name}</span>
              {m.marketState === 'REGULAR' && (
                <span style={{ fontSize: 8, background: 'rgba(0,196,140,.2)', color: '#00c48c', padding: '0 3px', borderRadius: 2, fontWeight: 700 }}>開盤</span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color }}>
              {m.type === 'fx' ? m.price.toFixed(3) : m.price >= 10000 ? m.price.toLocaleString() : m.price.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color, marginTop: 1 }}>
              {up ? '+' : ''}{m.changePercent.toFixed(2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────
export default function Market() {
  const { taiex, quotes, getColor } = useStockStore();
  const [breadth, setBreadth]     = useState(null);
  const [history, setHistory]     = useState([]);
  const [intraday, setIntraday]   = useState(null);
  const [worldMkts, setWorldMkts] = useState([]);
  const [chartMode, setChartMode] = useState('intraday');

  useEffect(() => {
    api.getBreadth().then(setBreadth).catch(() => {});
    api.getMarketIntraday().then(setIntraday).catch(() => {});
    api.getWorldMarkets().then(setWorldMkts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!taiex) return;
    setHistory(prev => [...prev, { t: Date.now(), v: taiex.value }].slice(-120));
  }, [taiex?.value]);

  const chgColor = taiex ? (taiex.changePercent > 0 ? '#ff4d4f' : taiex.changePercent < 0 ? '#00c48c' : '#64748b') : '#64748b';

  const sectorPerf = SECTORS.map(sector => {
    const vals = sector.codes.map(c => quotes[c]?.changePercent).filter(v => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { ...sector, avg: +avg.toFixed(2) };
  }).sort((a, b) => b.avg - a.avg);

  const breadthTotal = breadth ? breadth.up + breadth.down + breadth.flat : 0;
  const prevClose    = taiex ? +(taiex.value - taiex.change).toFixed(2) : 0;
  const volBil       = taiex?.volume ? (taiex.volume / 1000).toFixed(0) : null; // 億元
  const advance      = breadth ? (breadth.up / (breadthTotal || 1) * 100).toFixed(0) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ══ TAIEX 主卡 ══════════════════════════════════════ */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: '14px 16px' }}>

        {/* 頂部：指數 + 圖表 + OHLV + 統計 */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 160px 140px', gap: 16, alignItems: 'center', marginBottom: 8 }}>

          {/* 指數數值 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--color-text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>加權指數 TAIEX</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: chgColor, fontFamily: 'var(--font-mono)', lineHeight: 1, letterSpacing: '-.02em' }}>
              {taiex ? taiex.value.toLocaleString() : '——'}
            </div>
            {taiex && (
              <div style={{ fontSize: 13, color: chgColor, marginTop: 5, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {taiex.changePercent > 0 ? '▲' : taiex.changePercent < 0 ? '▼' : '—'} {Math.abs(taiex.change).toFixed(2)}
                <span style={{ fontSize: 12, marginLeft: 6, opacity: .8 }}>({taiex.changePercent > 0 ? '+' : ''}{taiex.changePercent}%)</span>
              </div>
            )}
            {advance && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--color-background-tertiary)', overflow: 'hidden' }}>
                  <div style={{ width: `${advance}%`, height: '100%', background: '#ff4d4f', transition: 'width .5s' }} />
                </div>
                <span style={{ fontSize: 9, color: '#ff4d4f', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{advance}%上漲</span>
              </div>
            )}
          </div>

          {/* 圖表區 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              {[['intraday', '分時'], ['history', '走勢']].map(([k, l]) => (
                <button key={k} onClick={() => setChartMode(k)} style={{
                  padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${chartMode === k ? 'var(--color-brand)' : 'var(--color-border-secondary)'}`,
                  background: chartMode === k ? 'rgba(59,130,246,.15)' : 'transparent',
                  color: chartMode === k ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
                }}>{l}</button>
              ))}
            </div>
            <div style={{ height: 80 }}>
              {chartMode === 'intraday' && intraday?.ticks?.length > 2
                ? <IntradayChart ticks={intraday.ticks} prevClose={prevClose} />
                : chartMode === 'history' && history.length > 2
                ? <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                      <Tooltip formatter={v => [v.toLocaleString(), '指數']} labelFormatter={() => ''} contentStyle={{ background: '#1e2d40', border: '1px solid #1a2535', borderRadius: 4, fontSize: 11 }} />
                      <Line type="monotone" dataKey="v" stroke={chgColor} dot={false} strokeWidth={1.5} activeDot={{ r: 3, fill: chgColor, strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                    {chartMode === 'intraday' ? '盤後無分時資料' : '等待資料...'}
                  </div>
              }
            </div>
          </div>

          {/* OHLV */}
          {taiex ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
              {[
                { label: '開', val: taiex.open?.toLocaleString(), color: 'var(--color-text-secondary)' },
                { label: '高', val: taiex.high?.toLocaleString(), color: '#ff4d4f' },
                { label: '低', val: taiex.low?.toLocaleString(),  color: '#00c48c' },
                { label: '昨收', val: prevClose?.toLocaleString(), color: 'var(--color-text-tertiary)' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)', marginTop: 1 }}>{item.val || '—'}</div>
                </div>
              ))}
            </div>
          ) : <div />}

          {/* 量能 & 廣度快速統計 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {volBil && (
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>成交量</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', marginTop: 1 }}>{volBil} <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>億</span></div>
              </div>
            )}
            {breadth && (
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>漲停 / 跌停</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#ff4d4f' }}>{breadth.limitUp ?? 0}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>/</span>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#00c48c' }}>{breadth.limitDown ?? 0}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 類股分時指數 */}
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

        {/* 國際市場 */}
        <WorldMarketsRow markets={worldMkts} />
      </div>

      {/* ══ 下排：三欄 ══════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>

        {/* ── 市場廣度 ── */}
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
          <div className="section-label">市場廣度</div>
          {breadth ? (
            <>
              {/* 主進度條 */}
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 14, gap: 1 }}>
                <div style={{ flex: breadth.up,   background: '#ff4d4f', transition: 'flex .5s' }} />
                <div style={{ flex: breadth.flat, background: '#334155' }} />
                <div style={{ flex: breadth.down, background: '#00c48c', transition: 'flex .5s' }} />
              </div>
              {/* 主三格 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 10 }}>
                {[
                  { label: '上漲', val: breadth.up,   color: '#ff4d4f', bg: 'rgba(255,77,79,.08)' },
                  { label: '平盤', val: breadth.flat, color: '#64748b', bg: 'rgba(100,116,139,.08)' },
                  { label: '下跌', val: breadth.down, color: '#00c48c', bg: 'rgba(0,196,140,.08)' },
                ].map(item => (
                  <div key={item.label} style={{ background: item.bg, borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: item.color, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: item.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{item.val.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
                      {breadthTotal ? (item.val / breadthTotal * 100).toFixed(1) : 0}%
                    </div>
                  </div>
                ))}
              </div>
              {/* 漲停跌停行 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { label: '漲停', val: breadth.limitUp ?? 0,   color: '#ff4d4f', bg: 'rgba(255,77,79,.06)', icon: '🔴' },
                  { label: '跌停', val: breadth.limitDown ?? 0, color: '#00c48c', bg: 'rgba(0,196,140,.06)', icon: '🟢' },
                ].map(item => (
                  <div key={item.label} style={{ background: item.bg, borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 1 }}>{item.icon} {item.label}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: item.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{item.val}</div>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>檔</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{s.name}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{up ? '+' : ''}{s.avg}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--color-background-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 重點個股 ── */}
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
          <div className="section-label">重點個股</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {['2330','2317','2454','2882','2303','2382','6505','2002'].map(code => {
              const q = quotes[code];
              if (!q) return (
                <div key={code} style={{ background: 'var(--color-background-secondary)', borderRadius: 6, padding: '7px 10px', opacity: .4 }}>
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
                  borderRadius: 6, padding: '7px 10px', transition: 'all .3s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                    <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{code}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: up ? 'rgba(255,77,79,.15)' : flat ? 'rgba(100,116,139,.15)' : 'rgba(0,196,140,.15)', color }}>
                      {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                    {q.price >= 100 ? q.price.toFixed(1) : q.price.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
