import { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';

const SECTORS = [
  { name: '半導體', codes: ['2330', '2454', '2303'] },
  { name: '電子零組件', codes: ['2317', '2308'] },
  { name: '金融', codes: ['2881', '2882', '2886', '2891'] },
  { name: '電腦及週邊', codes: ['2382'] },
  { name: '化工', codes: ['1301', '6505'] },
  { name: '鋼鐵', codes: ['2002'] },
];

export default function Market() {
  const { taiex, quotes, getColor } = useStockStore();
  const [breadth, setBreadth] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.getBreadth().then(setBreadth).catch(() => {});
  }, []);

  // 每次 taiex 更新，追加到歷史
  useEffect(() => {
    if (!taiex) return;
    setHistory(prev => {
      const next = [...prev, { t: Date.now(), v: taiex.value }];
      return next.slice(-60); // 保留最近 60 筆
    });
  }, [taiex?.value]);

  const chgColor = taiex ? getColor(taiex.changePercent) : 'inherit';
  const upStr = taiex?.changePercent >= 0;

  const sectorPerf = SECTORS.map(sector => {
    const vals = sector.codes
      .map(c => quotes[c]?.changePercent)
      .filter(v => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { ...sector, avg: +avg.toFixed(2) };
  }).sort((a, b) => b.avg - a.avg);

  return (
    <div>
      {/* 大盤指數卡 */}
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>加權指數 TAIEX</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: chgColor, lineHeight: 1 }}>
              {taiex ? taiex.value.toLocaleString() : '—'}
            </div>
            {taiex && (
              <div style={{ fontSize: 14, color: chgColor, marginTop: 4 }}>
                {upStr ? '▲' : '▼'} {Math.abs(taiex.change).toFixed(2)} ({upStr ? '+' : ''}{taiex.changePercent}%)
              </div>
            )}
          </div>
          <div style={{ width: 140, height: 52 }}>
            {history.length > 2 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <YAxis domain={['dataMin', 'dataMax']} hide />
                  <Tooltip formatter={v => [v.toLocaleString(), '指數']} labelFormatter={() => ''} />
                  <Line type="monotone" dataKey="v" stroke={chgColor} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        {taiex && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12, fontSize: 12 }}>
            {[
              { label: '開盤', val: taiex.open?.toLocaleString() },
              { label: '最高', val: taiex.high?.toLocaleString() },
              { label: '最低', val: taiex.low?.toLocaleString() },
              { label: '成交量', val: taiex.volume ? `${(taiex.volume / 100).toFixed(0)}億` : '—' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ color: 'var(--color-text-secondary)' }}>{item.label}</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{item.val || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 市場廣度 */}
      {breadth && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: '上漲', val: breadth.up, color: '#ef4444' },
            { label: '下跌', val: breadth.down, color: '#22c55e' },
            { label: '平盤', val: breadth.flat, color: 'var(--color-text-secondary)' },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{item.label}家數</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: item.color }}>{item.val.toLocaleString()}</div>
              <div style={{ marginTop: 4, height: 4, background: 'var(--color-background-primary)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(item.val / breadth.total * 100).toFixed(0)}%`, height: '100%', background: item.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 類股表現 */}
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>類股表現</div>
        {sectorPerf.map(s => {
          const up = s.avg >= 0;
          const pct = Math.min(Math.abs(s.avg) / 5 * 100, 100);
          return (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12 }}>
              <span style={{ width: 72, color: 'var(--color-text-secondary)' }}>{s.name}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--color-background-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: up ? '#ef4444' : '#22c55e', borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
              <span style={{ width: 52, textAlign: 'right', fontWeight: 500, color: up ? '#ef4444' : '#22c55e' }}>
                {up ? '+' : ''}{s.avg}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
