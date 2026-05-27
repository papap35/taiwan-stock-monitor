// HotStocks.jsx
import { useEffect, useState } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';

const FILTERS = [
  { value: 'vol',    label: '成交量' },
  { value: 'top',    label: '漲幅榜' },
  { value: 'bottom', label: '跌幅榜' },
  { value: 'limit',  label: '漲停板' },
];

export function HotStocks() {
  const { hotStocks, hotFilter, setHotStocks, setHotFilter, getColor } = useStockStore();
  const [loading, setLoading] = useState(false);

  const load = async (filter) => {
    setLoading(true);
    try {
      const data = await api.getHotStocks(filter);
      setHotStocks(data.stocks);
    } catch {/* ignore */}
    setLoading(false);
  };

  useEffect(() => { load(hotFilter); }, [hotFilter]);

  const fmt = (v, dec = 2) => typeof v === 'number' ? v.toFixed(dec) : '—';
  const fmtVol = v => v > 10000 ? `${(v / 10000).toFixed(1)}萬` : `${(v / 1000).toFixed(0)}千`;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => { setHotFilter(f.value); load(f.value); }}
            style={{ padding: '5px 12px', borderRadius: 20, border: '0.5px solid #d1d5db', background: hotFilter === f.value ? '#1d4ed8' : 'transparent', color: hotFilter === f.value ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer', fontSize: 12 }}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', padding: '8px 12px', borderBottom: '0.5px solid #f3f4f6', fontSize: 11, color: '#9ca3af' }}>
          <span style={{ width: 48 }}>代號</span>
          <span style={{ flex: 1 }}>名稱</span>
          <span style={{ width: 72, textAlign: 'right' }}>現價</span>
          <span style={{ width: 72, textAlign: 'right' }}>漲跌幅</span>
          <span style={{ width: 64, textAlign: 'right' }}>成交量</span>
        </div>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>載入中...</div>
        ) : hotStocks.map(s => {
          const color = getColor(s.changePercent);
          return (
            <div key={s.code} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '0.5px solid #f9fafb', fontSize: 13 }}>
              <span style={{ width: 48, color: '#9ca3af', fontSize: 12 }}>{s.code}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
              <span style={{ width: 72, textAlign: 'right', fontWeight: 500, color }}>{fmt(s.price, s.price >= 100 ? 1 : 2)}</span>
              <span style={{ width: 72, textAlign: 'right' }}>
                <span style={{ background: s.changePercent >= 0 ? '#fee2e2' : '#dcfce7', color: s.changePercent >= 0 ? '#991b1b' : '#166534', padding: '1px 6px', borderRadius: 6, fontSize: 11 }}>
                  {s.changePercent >= 0 ? '+' : ''}{fmt(s.changePercent)}%
                </span>
              </span>
              <span style={{ width: 64, textAlign: 'right', fontSize: 12, color: '#9ca3af' }}>{fmtVol(s.volume)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HotStocks;
