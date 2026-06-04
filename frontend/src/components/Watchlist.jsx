import { useState, useEffect } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';
import StockChart from './StockChart';

export default function Watchlist() {
  const { watchlist, quotes, addToWatchlist, removeFromWatchlist } = useStockStore();
  const [form, setForm] = useState({ code: '', name: '', cost: '' });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const [chartStock, setChartStock] = useState(null);
  const [valMap, setValMap] = useState({});

  useEffect(() => {
    api.getMarketValuation().then(data => setValMap(data || {})).catch(() => {});
  }, []);

  const add = async () => {
    if (!form.code.trim()) return;
    setAdding(true);
    setErr('');
    let name = form.name || '';
    if (!name) {
      try {
        const q = await api.getQuotes([form.code]);
        name = q.quotes[form.code]?.name || form.code;
      } catch { name = form.code; }
    }
    addToWatchlist({ code: form.code.trim().toUpperCase(), name, cost: form.cost ? parseFloat(form.cost) : null });
    setForm({ code: '', name: '', cost: '' });
    setAdding(false);
  };

  const fmt = (v, dec = 2) => typeof v === 'number' ? v.toFixed(dec) : '—';

  // 計算投資組合摘要
  const portfolio = watchlist.map(w => {
    const q = quotes[w.code];
    const pnl = q && w.cost ? +((q.price / w.cost - 1) * 100).toFixed(2) : null;
    return { ...w, q, pnl };
  });
  const withPnl = portfolio.filter(p => p.pnl !== null);
  const totalPnl = withPnl.length
    ? +(withPnl.reduce((s, p) => s + p.pnl, 0) / withPnl.length).toFixed(2)
    : null;

  const inp = {
    padding: '7px 10px',
    border: '1px solid var(--color-border-secondary)',
    borderRadius: 6,
    background: 'var(--color-background-secondary)',
    color: 'var(--color-text-primary)',
    fontSize: 13,
  };

  return (
    <div>
      {chartStock && <StockChart stock={chartStock} onClose={() => setChartStock(null)} />}
      {/* 投資組合摘要 */}
      {portfolio.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${withPnl.length > 0 ? 3 : 2}, 1fr)`,
          gap: 8, marginBottom: 10,
        }}>
          <div className="stat-tile">
            <div className="stat-label">自選股數</div>
            <div className="stat-value" style={{ color: 'var(--color-text-primary)' }}>
              {watchlist.length}
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">有報價</div>
            <div className="stat-value" style={{ color: 'var(--color-brand)' }}>
              {portfolio.filter(p => p.q).length}
            </div>
          </div>
          {withPnl.length > 0 && (
            <div className="stat-tile">
              <div className="stat-label">平均損益</div>
              <div className="stat-value" style={{ color: totalPnl >= 0 ? '#ff4d4f' : '#00c48c' }}>
                {totalPnl > 0 ? '+' : ''}{totalPnl}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* 新增表單 */}
      <div style={{
        background: 'var(--color-background-card)',
        border: '1px solid var(--color-border-tertiary)',
        borderRadius: 8, padding: 14, marginBottom: 10,
      }}>
        <div className="section-label">新增自選股</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inp, width: 88 }} placeholder="代號" value={form.code}
            onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <input style={{ ...inp, flex: 1, minWidth: 120 }} placeholder="名稱（可自動查詢）" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <input style={{ ...inp, width: 110 }} type="number" placeholder="持有成本（選填）" value={form.cost}
            onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
          <button onClick={add} disabled={adding || !form.code} className="btn btn-primary"
            style={{ minWidth: 64 }}>
            {adding ? '加入中...' : '+ 加入'}
          </button>
        </div>
        {err && <div style={{ fontSize: 11, color: 'var(--color-text-danger)', marginTop: 6 }}>{err}</div>}
      </div>

      {/* 股票列表 */}
      <div style={{
        background: 'var(--color-background-card)',
        border: '1px solid var(--color-border-tertiary)',
        borderRadius: 8, overflow: 'hidden',
      }}>
        {watchlist.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8, opacity: .3 }}>◉</div>
            尚未加入自選股
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-background-secondary)' }}>
                {['名稱 / 代號', '現價', '漲跌幅', 'P/E', '殖利率', '持有成本', '損益%', '', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '7px 10px', fontSize: 10, fontWeight: 700,
                    letterSpacing: '.07em', textTransform: 'uppercase',
                    color: 'var(--color-text-tertiary)',
                    textAlign: i === 0 ? 'left' : 'right',
                    borderBottom: '1px solid var(--color-border-tertiary)',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.map(({ code, name, cost, q, pnl }) => {
                const up = q && q.changePercent > 0;
                const flat = q && q.changePercent === 0;
                const qColor = !q ? '#64748b' : flat ? '#64748b' : up ? '#ff4d4f' : '#00c48c';
                const pnlColor = pnl === null ? '#64748b' : pnl >= 0 ? '#ff4d4f' : '#00c48c';
                return (
                  <tr key={code} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{code}</div>
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: qColor }}>
                      {q ? fmt(q.price, q.price >= 100 ? 1 : 2) : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      {q ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 7px', borderRadius: 3,
                          background: up ? 'rgba(255,77,79,.12)' : flat ? 'rgba(100,116,139,.1)' : 'rgba(0,196,140,.12)',
                          color: qColor, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        }}>
                          {q.changePercent > 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                        </span>
                      ) : <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {valMap[code]?.pe
                        ? <span style={{ color: valMap[code].pe > 30 ? '#f87171' : valMap[code].pe < 15 ? '#00c48c' : '#94a3b8' }}>{valMap[code].pe.toFixed(1)}</span>
                        : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {valMap[code]?.yield
                        ? <span style={{ color: valMap[code].yield >= 5 ? '#00c48c' : '#94a3b8' }}>{valMap[code].yield.toFixed(2)}%</span>
                        : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {cost ? `$${cost}` : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: pnlColor }}>
                      {pnl !== null ? `${pnl >= 0 ? '+' : ''}${pnl}%` : <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, fontSize: 11 }}>未設成本</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      <button
                      onClick={() => setChartStock({ code, name, price: q?.price, changePercent: q?.changePercent })}
                      style={{
                        padding: '2px 8px', background: 'transparent',
                        border: '1px solid var(--color-border-secondary)',
                        color: 'var(--color-text-tertiary)',
                        borderRadius: 4, cursor: 'pointer', fontSize: 11,
                        transition: 'all .15s', marginRight: 4,
                      }}
                      onMouseEnter={e => { e.target.style.borderColor = 'var(--color-brand)'; e.target.style.color = 'var(--color-brand)'; }}
                      onMouseLeave={e => { e.target.style.borderColor = 'var(--color-border-secondary)'; e.target.style.color = 'var(--color-text-tertiary)'; }}
                    >K線</button>
                    <button onClick={() => removeFromWatchlist(code)}
                        style={{
                          padding: '2px 8px', background: 'transparent',
                          border: '1px solid rgba(248,113,113,.2)', color: 'rgba(248,113,113,.6)',
                          borderRadius: 4, cursor: 'pointer', fontSize: 11,
                          transition: 'all .15s',
                        }}
                        onMouseEnter={e => { e.target.style.borderColor = '#f87171'; e.target.style.color = '#f87171'; }}
                        onMouseLeave={e => { e.target.style.borderColor = 'rgba(248,113,113,.2)'; e.target.style.color = 'rgba(248,113,113,.6)'; }}
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
