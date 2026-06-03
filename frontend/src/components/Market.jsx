import { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis, ReferenceLine } from 'recharts';
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

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e2d40', border: '1px solid #1a2535',
      borderRadius: 4, padding: '4px 8px', fontSize: 11,
      fontFamily: 'var(--font-mono)', color: '#e2e8f0',
    }}>
      {payload[0]?.value?.toLocaleString()}
    </div>
  );
};

export default function Market() {
  const { taiex, quotes, getColor } = useStockStore();
  const [breadth, setBreadth] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.getBreadth().then(setBreadth).catch(() => {});
  }, []);

  useEffect(() => {
    if (!taiex) return;
    setHistory(prev => {
      const next = [...prev, { t: Date.now(), v: taiex.value }];
      return next.slice(-120);
    });
  }, [taiex?.value]);

  const chgColor = taiex
    ? (taiex.changePercent > 0 ? '#ff4d4f' : taiex.changePercent < 0 ? '#00c48c' : '#64748b')
    : '#64748b';
  const upStr = taiex?.changePercent >= 0;

  const sectorPerf = SECTORS.map(sector => {
    const vals = sector.codes
      .map(c => quotes[c]?.changePercent)
      .filter(v => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { ...sector, avg: +avg.toFixed(2) };
  }).sort((a, b) => b.avg - a.avg);

  const breadthTotal = breadth ? breadth.up + breadth.down + breadth.flat : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>

      {/* ── 大盤指數（跨欄）────────────────────── */}
      <div style={{
        gridColumn: '1 / -1',
        background: 'var(--color-background-card)',
        border: '1px solid var(--color-border-tertiary)',
        borderRadius: 8,
        padding: '14px 16px',
        display: 'grid',
        gridTemplateColumns: '200px 1fr 160px',
        gap: 20,
        alignItems: 'center',
      }}>
        {/* 指數數值 */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--color-text-tertiary)', marginBottom: 6, textTransform: 'uppercase' }}>
            加權指數 TAIEX
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: chgColor, fontFamily: 'var(--font-mono)', lineHeight: 1, letterSpacing: '-.02em' }}>
            {taiex ? taiex.value.toLocaleString() : '——'}
          </div>
          {taiex && (
            <div style={{ fontSize: 14, color: chgColor, marginTop: 6, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {upStr ? '▲' : '▼'} {Math.abs(taiex.change).toFixed(2)}
              <span style={{ fontSize: 12, marginLeft: 6, opacity: .8 }}>
                ({upStr ? '+' : ''}{taiex.changePercent}%)
              </span>
            </div>
          )}
        </div>

        {/* 迷你走勢圖 */}
        <div style={{ height: 64 }}>
          {history.length > 2 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                <ReferenceLine y={history[0]?.v} stroke="rgba(255,255,255,.08)" strokeDasharray="3 2" />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone" dataKey="v"
                  stroke={chgColor} dot={false} strokeWidth={1.5}
                  activeDot={{ r: 3, fill: chgColor, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* OHLV */}
        {taiex && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
            {[
              { label: '開', val: taiex.open?.toLocaleString(), color: 'var(--color-text-secondary)' },
              { label: '高', val: taiex.high?.toLocaleString(), color: 'var(--color-up)' },
              { label: '低', val: taiex.low?.toLocaleString(), color: 'var(--color-down)' },
              { label: '量', val: taiex.volume ? `${(taiex.volume / 100).toFixed(0)}億` : '—', color: 'var(--color-text-secondary)' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)', marginTop: 1 }}>{item.val || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 市場廣度 ─────────────────────────────── */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">市場廣度</div>

        {breadth ? (
          <>
            {/* 廣度進度條 */}
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 14, gap: 1 }}>
              <div style={{ flex: breadth.up, background: '#ff4d4f', transition: 'flex .5s' }} />
              <div style={{ flex: breadth.flat, background: '#334155' }} />
              <div style={{ flex: breadth.down, background: '#00c48c', transition: 'flex .5s' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                { label: '上漲', val: breadth.up, color: '#ff4d4f', bg: 'rgba(255,77,79,.08)' },
                { label: '平盤', val: breadth.flat, color: '#64748b', bg: 'rgba(100,116,139,.08)' },
                { label: '下跌', val: breadth.down, color: '#00c48c', bg: 'rgba(0,196,140,.08)' },
              ].map(item => (
                <div key={item.label} style={{ background: item.bg, borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: item.color, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: item.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                    {item.val.toLocaleString()}
                  </div>
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
                : <span style={{ color: '#64748b', marginLeft: 8, fontWeight: 600 }}>多空拉鋸</span>
              }
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, textAlign: 'center', padding: 20 }}>載入中...</div>
        )}
      </div>

      {/* ── 類股表現 ─────────────────────────────── */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">類股表現</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sectorPerf.map(s => {
            const up = s.avg > 0;
            const barPct = Math.min(Math.abs(s.avg) / 5 * 100, 100);
            const sectorColor = up ? '#ff4d4f' : s.avg < 0 ? '#00c48c' : '#64748b';
            return (
              <div key={s.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{s.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: sectorColor,
                  }}>
                    {up ? '+' : ''}{s.avg}%
                  </span>
                </div>
                <div style={{ height: 4, background: 'var(--color-background-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${barPct}%`, height: '100%',
                    background: sectorColor,
                    borderRadius: 2,
                    boxShadow: up ? 'var(--glow-up)' : 'var(--glow-down)',
                    transition: 'width .5s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 重點個股報價 ────────────────────────── */}
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
            const up = q.changePercent > 0;
            const flat = q.changePercent === 0;
            const color = flat ? '#64748b' : up ? '#ff4d4f' : '#00c48c';
            return (
              <div key={code} style={{
                background: up ? 'rgba(255,77,79,.06)' : flat ? 'var(--color-background-secondary)' : 'rgba(0,196,140,.06)',
                border: `1px solid ${up ? 'rgba(255,77,79,.15)' : flat ? 'var(--color-border-tertiary)' : 'rgba(0,196,140,.15)'}`,
                borderRadius: 6, padding: '8px 10px',
                transition: 'all .3s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{code}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
                    background: up ? 'rgba(255,77,79,.15)' : flat ? 'rgba(100,116,139,.15)' : 'rgba(0,196,140,.15)',
                    color,
                  }}>
                    {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.name}</div>
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
