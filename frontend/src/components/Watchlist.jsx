import { useState } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';

export default function Watchlist() {
  const { watchlist, quotes, addToWatchlist, removeFromWatchlist, getColor } = useStockStore();
  const [form, setForm] = useState({ code: '', name: '', cost: '' });
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!form.code.trim()) return;
    setAdding(true);
    let name = form.name || '';
    // 嘗試抓報價取得名稱
    if (!name) {
      try {
        const q = await api.getQuotes([form.code]);
        name = q.quotes[form.code]?.name || form.code;
      } catch {
        name = form.code;
      }
    }
    addToWatchlist({ code: form.code.trim(), name, cost: form.cost ? parseFloat(form.cost) : null });
    setForm({ code: '', name: '', cost: '' });
    setAdding(false);
  };

  const fmt = (v, dec = 2) => typeof v === 'number' ? v.toFixed(dec) : '—';
  const card = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 14, marginBottom: 12 };
  const inp = { padding: '6px 10px', border: '0.5px solid #d1d5db', borderRadius: 8, fontSize: 13 };

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>加入自選股</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inp, width: 80 }} placeholder="代號" value={form.code}
            onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
          <input style={{ ...inp, flex: 1 }} placeholder="名稱（可自動查詢）" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <input style={{ ...inp, width: 100 }} type="number" placeholder="持有成本" value={form.cost}
            onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
          <button onClick={add} disabled={adding}
            style={{ padding: '6px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            + 加入
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, overflow: 'hidden' }}>
        {watchlist.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>尚未加入自選股</div>
        ) : watchlist.map(w => {
          const q = quotes[w.code];
          const pnl = q && w.cost ? +((q.price / w.cost - 1) * 100).toFixed(2) : null;
          const color = q ? getColor(q.changePercent) : 'inherit';
          return (
            <div key={w.code} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '0.5px solid #f3f4f6', fontSize: 13 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{w.name} <span style={{ color: '#9ca3af', fontSize: 12 }}>{w.code}</span></div>
                {w.cost && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>成本 ${w.cost}</div>}
              </div>
              {q ? (
                <>
                  <span style={{ width: 72, textAlign: 'right', fontWeight: 500, color }}>{fmt(q.price, q.price >= 100 ? 1 : 2)}</span>
                  <span style={{ width: 72, textAlign: 'right' }}>
                    <span style={{ background: q.changePercent >= 0 ? '#fee2e2' : '#dcfce7', color: q.changePercent >= 0 ? '#991b1b' : '#166534', padding: '1px 6px', borderRadius: 6, fontSize: 11 }}>
                      {q.changePercent >= 0 ? '+' : ''}{fmt(q.changePercent)}%
                    </span>
                  </span>
                  {pnl !== null && (
                    <span style={{ width: 72, textAlign: 'right', fontSize: 12, fontWeight: 500, color: pnl >= 0 ? '#ef4444' : '#22c55e' }}>
                      {pnl >= 0 ? '+' : ''}{pnl}%
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: '#9ca3af', fontSize: 12, width: 160, textAlign: 'right' }}>載入中...</span>
              )}
              <button onClick={() => removeFromWatchlist(w.code)}
                style={{ marginLeft: 8, padding: '3px 8px', background: 'transparent', border: '0.5px solid #fca5a5', color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                移除
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
