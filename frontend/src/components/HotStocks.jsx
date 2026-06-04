import { useEffect, useState, useCallback } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';
import StockChart from './StockChart';

const FILTERS = [
  { value: 'vol',    label: '成交量排行', short: '成交量' },
  { value: 'top',    label: '漲幅排行',   short: '漲幅榜' },
  { value: 'bottom', label: '跌幅排行',   short: '跌幅榜' },
  { value: 'limit',  label: '漲停板',     short: '漲停' },
];

const fmt = (v, dec = 2) => typeof v === 'number' ? v.toFixed(dec) : '—';
const fmtVol = v => {
  if (!v) return '—';
  if (v >= 100000) return `${(v / 10000).toFixed(1)}萬`;
  if (v >= 1000)   return `${(v / 1000).toFixed(0)}千`;
  return v.toString();
};

export function HotStocks() {
  const { hotStocks, hotFilter, setHotStocks, setHotFilter } = useStockStore();
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [chartStock, setChartStock] = useState(null);

  const load = useCallback(async (filter) => {
    setLoading(true);
    try {
      const data = await api.getHotStocks(filter);
      setHotStocks(data.stocks);
    } catch { /* ignore */ }
    setLoading(false);
  }, [setHotStocks]);

  useEffect(() => { load(hotFilter); }, [hotFilter, load]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const displayed = [...hotStocks].sort((a, b) => {
    if (!sortKey) return 0;
    const va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <span style={{ opacity: .3, fontSize: 9 }}>⇅</span>;
    return <span style={{ fontSize: 9, color: 'var(--color-brand)' }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  const Th = ({ k, children, style = {} }) => (
    <th onClick={() => handleSort(k)} style={{
      cursor: 'pointer', userSelect: 'none',
      padding: '7px 10px', fontSize: 10, fontWeight: 700,
      letterSpacing: '.07em', textTransform: 'uppercase',
      color: sortKey === k ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
      textAlign: 'right', borderBottom: '1px solid var(--color-border-tertiary)',
      whiteSpace: 'nowrap', ...style,
    }}>
      {children} <SortIcon k={k} />
    </th>
  );

  return (
    <div>
      {chartStock && <StockChart stock={chartStock} onClose={() => setChartStock(null)} />}
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => { setHotFilter(f.value); load(f.value); }}
            style={{
              padding: '5px 14px', borderRadius: 4,
              border: `1px solid ${hotFilter === f.value ? 'var(--color-brand)' : 'var(--color-border-secondary)'}`,
              background: hotFilter === f.value ? 'rgba(59,130,246,.12)' : 'transparent',
              color: hotFilter === f.value ? 'var(--color-brand)' : 'var(--color-text-secondary)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              transition: 'all .15s',
            }}>
            {f.short}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', alignSelf: 'center' }}>
          {displayed.length} 檔
        </span>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--color-background-card)',
        border: '1px solid var(--color-border-tertiary)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-background-secondary)' }}>
              <th style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: 'var(--color-text-tertiary)', textAlign: 'left', borderBottom: '1px solid var(--color-border-tertiary)', whiteSpace: 'nowrap' }}>
                # 代號 / 名稱
              </th>
              <Th k="price">現價</Th>
              <Th k="change">漲跌</Th>
              <Th k="changePercent">漲跌幅</Th>
              <Th k="volume">成交量</Th>
              <Th k="high">最高</Th>
              <Th k="low">最低</Th>
              <th style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border-tertiary)', width: 52 }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>載入中...</td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>無資料</td></tr>
            ) : displayed.map((s, idx) => {
              const up = s.changePercent > 0;
              const flat = s.changePercent === 0;
              const color = flat ? '#64748b' : up ? '#ff4d4f' : '#00c48c';
              const isLimit = Math.abs(s.changePercent) >= 9.9;
              return (
                <tr key={s.code} style={{
                  borderBottom: '1px solid rgba(255,255,255,.03)',
                  background: isLimit ? 'rgba(255,77,79,.04)' : 'transparent',
                  transition: 'background .1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = isLimit ? 'rgba(255,77,79,.04)' : 'transparent'}
                >
                  <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)',
                        width: 16, textAlign: 'center', opacity: .5,
                      }}>{idx + 1}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{s.code}</div>
                      </div>
                      {isLimit && (
                        <span style={{
                          fontSize: 9, padding: '1px 4px', borderRadius: 2,
                          background: 'rgba(255,77,79,.2)', color: '#ff7875',
                          fontWeight: 700, letterSpacing: '.04em',
                        }}>漲停</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color }}>
                    {fmt(s.price, s.price >= 100 ? 1 : 2)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color }}>
                    {s.change > 0 ? '+' : ''}{fmt(s.change, s.price >= 100 ? 1 : 2)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 7px', borderRadius: 3,
                      background: up ? 'rgba(255,77,79,.12)' : flat ? 'rgba(100,116,139,.1)' : 'rgba(0,196,140,.12)',
                      color,
                      fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    }}>
                      {s.changePercent > 0 ? '+' : ''}{fmt(s.changePercent)}%
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {fmtVol(s.volume)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'rgba(255,77,79,.7)', fontFamily: 'var(--font-mono)' }}>
                    {fmt(s.high, s.high >= 100 ? 1 : 2)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'rgba(0,196,140,.7)', fontFamily: 'var(--font-mono)' }}>
                    {fmt(s.low, s.low >= 100 ? 1 : 2)}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                    <button
                      onClick={() => setChartStock(s)}
                      title="查看K線圖"
                      style={{
                        padding: '3px 7px', borderRadius: 4, fontSize: 11,
                        border: '1px solid var(--color-border-secondary)',
                        background: 'transparent', color: 'var(--color-text-tertiary)',
                        cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-brand)'; e.currentTarget.style.color = 'var(--color-brand)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border-secondary)'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                    >
                      K線
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default HotStocks;
