import { useState, useEffect, useRef } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';
import StockChart from './StockChart';

const STRATEGIES = [
  { value: 'long',  label: '長期持有', color: '#3b82f6', icon: '🏦' },
  { value: 'swing', label: '波段操作', color: '#f59e0b', icon: '📊' },
  { value: 'trade', label: '短線交易', color: '#8b5cf6', icon: '⚡' },
];
const STRATEGY_MAP = Object.fromEntries(STRATEGIES.map(s => [s.value, s]));

// ── 簡易 Markdown 渲染（與 AIAnalysis 共用邏輯）────────
function MdText({ text }) {
  if (!text) return null;
  return (
    <div style={{ lineHeight: 1.9, fontSize: 13 }}>
      {text.split('\n').map((line, i) => {
        if (/^#{1,2}\s/.test(line) || /^═+$/.test(line)) {
          return <div key={i} style={{ height: line.trim() === '' ? 6 : 2, background: line.trim() ? 'var(--color-border-tertiary)' : 'transparent', margin: '10px 0' }} />;
        }
        if (/^──/.test(line)) return (
          <div key={i} style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-brand)', marginTop: 14, marginBottom: 4, borderLeft: '2px solid var(--color-brand)', paddingLeft: 8 }}>
            {line.replace(/^──\s*/, '').replace(/\s*──$/, '')}
          </div>
        );
        if (/^【.+】$/.test(line.trim())) return (
          <div key={i} style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginTop: 10, marginBottom: 2 }}>{line}</div>
        );
        if (line.startsWith('- ') || line.startsWith('• ')) return (
          <div key={i} style={{ display: 'flex', gap: 8, color: 'var(--color-text-secondary)', paddingLeft: 4 }}>
            <span style={{ color: 'var(--color-brand)', flexShrink: 0 }}>▸</span>
            <span>{line.slice(2)}</span>
          </div>
        );
        if (line.trim() === '') return <div key={i} style={{ height: 5 }} />;
        return <div key={i} style={{ color: 'var(--color-text-secondary)' }}>{line}</div>;
      })}
    </div>
  );
}

// ── 持股格式化（張 + 零股）────────────────────────────
function formatHolding(shares, oddLot) {
  const lots = parseInt(shares) || 0;
  const odd  = parseInt(oddLot)  || 0;
  if (!lots && !odd) return '—';
  if (lots && odd)  return `${lots}張 ${odd}股`;
  if (lots)         return `${lots}張`;
  return `${odd}股`;
}

// 總股數（股）
function totalStockShares(shares, oddLot) {
  return (parseInt(shares) || 0) * 1000 + (parseInt(oddLot) || 0);
}

// ── 編輯 Modal ────────────────────────────────────────
function EditModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({
    shares:      item.shares      ?? '',
    oddLotShares: item.oddLotShares ?? '',
    cost:        item.cost        ?? '',
    strategy:    item.strategy    ?? 'long',
    target:      item.target      ?? '',
    stopLoss:    item.stopLoss    ?? '',
    notes:       item.notes       ?? '',
  });
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inp = { padding: '6px 10px', border: '1px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 13, width: '100%' };

  const totalDisplay = totalStockShares(form.shares, form.oddLotShares);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f1923', border: '1px solid var(--color-border-secondary)', borderRadius: 10, width: '100%', maxWidth: 440, padding: 20 }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{item.code}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 持股數量 */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>持有數量</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>整張（張）</div>
                <input style={inp} type="number" min="0" step="1" placeholder="0" value={form.shares} onChange={e => f('shares', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>零股（股）</div>
                <input style={inp} type="number" min="0" step="1" placeholder="0" value={form.oddLotShares} onChange={e => f('oddLotShares', e.target.value)} />
              </div>
            </div>
            {totalDisplay > 0 && (
              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                合計 <span style={{ color: 'var(--color-brand)', fontWeight: 700 }}>{totalDisplay.toLocaleString()} 股</span>
                {form.shares > 0 && form.oddLotShares > 0 && ` （${form.shares}張 + ${form.oddLotShares}股）`}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>平均成本（元/股）</div>
            <input style={inp} type="number" step="0.01" placeholder="0.00" value={form.cost} onChange={e => f('cost', e.target.value)} />
          </div>

          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>操作策略</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {STRATEGIES.map(s => (
                <button key={s.value} onClick={() => f('strategy', s.value)} style={{
                  flex: 1, padding: '7px 4px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${form.strategy === s.value ? s.color : 'var(--color-border-secondary)'}`,
                  background: form.strategy === s.value ? `${s.color}18` : 'transparent',
                  color: form.strategy === s.value ? s.color : 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                }}>{s.icon} {s.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>目標價（元）</div>
              <input style={inp} type="number" step="0.01" placeholder="選填" value={form.target} onChange={e => f('target', e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>停損價（元）</div>
              <input style={inp} type="number" step="0.01" placeholder="選填" value={form.stopLoss} onChange={e => f('stopLoss', e.target.value)} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>備註</div>
            <input style={inp} placeholder="例：已達目標、等待回測..." value={form.notes} onChange={e => f('notes', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--color-border-secondary)', borderRadius: 6, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button onClick={() => onSave({
              ...form,
              shares:       form.shares       ? parseInt(form.shares)       : null,
              oddLotShares: form.oddLotShares ? parseInt(form.oddLotShares) : null,
              cost:         form.cost         ? parseFloat(form.cost)       : null,
              target:       form.target       ? parseFloat(form.target)     : null,
              stopLoss:     form.stopLoss     ? parseFloat(form.stopLoss)   : null,
            })}
            style={{ flex: 1, padding: '8px', background: 'var(--color-brand)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────
export default function Watchlist() {
  const { watchlist, quotes, addToWatchlist, removeFromWatchlist, updateWatchlistItem } = useStockStore();
  const [form, setForm] = useState({ code: '', name: '', cost: '', shares: '', oddLotShares: '', strategy: 'long' });
  const [adding, setAdding] = useState(false);
  const [chartStock, setChartStock] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [activeTab, setActiveTab] = useState('holdings'); // 'holdings' | 'brief'
  const [briefType, setBriefType] = useState('open');
  const [briefText, setBriefText] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [valMap, setValMap] = useState({});
  const briefRef = useRef(null);

  useEffect(() => {
    api.getMarketValuation().then(d => setValMap(d || {})).catch(() => {});
  }, []);

  const add = async () => {
    if (!form.code.trim()) return;
    setAdding(true);
    let name = form.name || '';
    if (!name) {
      try { const q = await api.getQuotes([form.code]); name = q.quotes[form.code]?.name || form.code; }
      catch { name = form.code; }
    }
    addToWatchlist({
      code: form.code.trim().toUpperCase(), name,
      cost:         form.cost         ? parseFloat(form.cost)         : null,
      shares:       form.shares       ? parseInt(form.shares)         : null,
      oddLotShares: form.oddLotShares ? parseInt(form.oddLotShares)  : null,
      strategy:     form.strategy || 'long',
    });
    setForm({ code: '', name: '', cost: '', shares: '', oddLotShares: '', strategy: 'long' });
    setAdding(false);
  };

  // ── 每日簡報 ─────────────────────────────────────
  const generateBrief = async () => {
    if (briefLoading || !watchlist.length) return;
    setBriefLoading(true);
    setBriefText('');
    try {
      const holdings = watchlist.map(w => ({
        code:         w.code,
        name:         w.name,
        shares:       w.shares       ?? null,
        oddLotShares: w.oddLotShares ?? null,
        cost:         w.cost         ?? null,
        strategy:     w.strategy     ?? 'long',
        target:       w.target       ?? null,
        stopLoss:     w.stopLoss     ?? null,
        notes:        w.notes        ?? '',
      }));
      await api.analyzePortfolio(
        holdings, briefType,
        (chunk) => {
          setBriefText(p => p + chunk);
          if (briefRef.current) briefRef.current.scrollTop = briefRef.current.scrollHeight;
        },
        () => setBriefLoading(false),
      );
    } catch (e) {
      setBriefText(`分析失敗：${e.message}`);
      setBriefLoading(false);
    }
  };

  // ── 投組統計 ──────────────────────────────────────
  const portfolio = watchlist.map(w => {
    const q = quotes[w.code];
    const price = q?.price ?? 0;
    const totalShares = totalStockShares(w.shares, w.oddLotShares); // 總股數
    const pnlPct = w.cost && price ? +((price / w.cost - 1) * 100).toFixed(2) : null;
    const pnlAmt = totalShares && w.cost && price ? Math.round((price - w.cost) * totalShares) : null;
    const mktVal = totalShares && price ? Math.round(price * totalShares) : null;
    return { ...w, q, price, pnlPct, pnlAmt, mktVal, totalShares };
  });
  const totalCost = portfolio.filter(p => p.totalShares && p.cost).reduce((s, p) => s + p.cost * p.totalShares, 0);
  const totalMkt  = portfolio.filter(p => p.mktVal).reduce((s, p) => s + p.mktVal, 0);
  const totalPnlPct = totalCost ? +((totalMkt / totalCost - 1) * 100).toFixed(2) : null;
  const totalPnlAmt = totalCost ? Math.round(totalMkt - totalCost) : null;

  const inp = { padding: '7px 10px', border: '1px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 13 };

  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const totalMin = h * 60 + m;
  const isOpen = now.getDay() >= 1 && now.getDay() <= 5 && totalMin >= 9 * 60 && totalMin <= 13 * 60 + 30;
  const autoType = totalMin < 9 * 60 ? 'open' : totalMin > 13 * 60 + 30 ? 'close' : 'open';

  return (
    <div>
      {chartStock && <StockChart stock={chartStock} onClose={() => setChartStock(null)} />}
      {editItem && (
        <EditModal
          item={editItem}
          onSave={patch => { updateWatchlistItem(editItem.code, patch); setEditItem(null); }}
          onClose={() => setEditItem(null)}
        />
      )}

      {/* ── 投組摘要 ─── */}
      {portfolio.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
          {[
            { label: '持股數', val: `${watchlist.length} 檔`, color: 'var(--color-brand)' },
            { label: '總市值', val: totalMkt ? `${(totalMkt / 10000).toFixed(0)}萬` : '—', color: 'var(--color-text-secondary)' },
            { label: '總損益額', val: totalPnlAmt != null ? `${totalPnlAmt >= 0 ? '+' : ''}${totalPnlAmt.toLocaleString()}` : '—', color: totalPnlAmt >= 0 ? '#ff4d4f' : '#00c48c' },
            { label: '整體損益%', val: totalPnlPct != null ? `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct}%` : '—', color: totalPnlPct >= 0 ? '#ff4d4f' : '#00c48c' },
          ].map((s, i) => (
            <div key={i} className="stat-tile">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: '1.2rem', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab 切換 ─── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', borderRadius: '8px 8px 0 0', marginBottom: 0 }}>
        {[['holdings', '📋 持股管理'], ['brief', '🤖 每日 AI 簡報']].map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            padding: '9px 18px', border: 'none', background: 'transparent',
            borderBottom: activeTab === k ? '2px solid var(--color-brand)' : '2px solid transparent',
            color: activeTab === k ? '#e2e8f0' : 'var(--color-text-tertiary)',
            fontSize: 13, fontWeight: activeTab === k ? 600 : 400, cursor: 'pointer', marginBottom: -1,
          }}>{l}</button>
        ))}
      </div>

      {/* ══ Tab: 持股管理 ═══════════════════════════════ */}
      {activeTab === 'holdings' && (
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {/* 新增列 */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-tertiary)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--color-background-secondary)' }}>
            <input style={{ ...inp, width: 80 }} placeholder="代號" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} onKeyDown={e => e.key === 'Enter' && add()} />
            <input style={{ ...inp, minWidth: 100, flex: 1 }} placeholder="名稱（可自動查詢）" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <input style={{ ...inp, width: 80 }} type="number" step="0.01" placeholder="成本" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
            <input style={{ ...inp, width: 60 }} type="number" min="0" step="1" placeholder="張" value={form.shares} onChange={e => setForm(p => ({ ...p, shares: e.target.value }))} />
            <input style={{ ...inp, width: 68 }} type="number" min="0" step="1" placeholder="零股(股)" value={form.oddLotShares} onChange={e => setForm(p => ({ ...p, oddLotShares: e.target.value }))} />
            <select style={{ ...inp, width: 100 }} value={form.strategy} onChange={e => setForm(p => ({ ...p, strategy: e.target.value }))}>
              {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
            </select>
            <button onClick={add} disabled={adding || !form.code} className="btn btn-primary" style={{ minWidth: 60 }}>
              {adding ? '加入中' : '+ 加入'}
            </button>
          </div>

          {/* 持股列表 */}
          {watchlist.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              <div style={{ fontSize: 28, opacity: .2, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>尚未加入持股</div>
              <div style={{ fontSize: 11 }}>在上方輸入代號開始追蹤</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-background-secondary)' }}>
                  {['名稱 / 代號', '現價', '漲跌幅', '持有', '成本', '損益 %', '損益 元', '策略', 'P/E', '目標/停損', ''].map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', textAlign: i === 0 ? 'left' : 'right', borderBottom: '1px solid var(--color-border-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolio.map(({ code, name, q, price, pnlPct, pnlAmt, mktVal, shares, oddLotShares, totalShares, cost, strategy, target, stopLoss, notes }) => {
                  const up = q && q.changePercent > 0, flat = q && q.changePercent === 0;
                  const qColor = !q ? '#64748b' : flat ? '#64748b' : up ? '#ff4d4f' : '#00c48c';
                  const pColor = pnlPct === null ? '#64748b' : pnlPct >= 0 ? '#ff4d4f' : '#00c48c';
                  const strat = STRATEGY_MAP[strategy];
                  const val = valMap[code];
                  return (
                    <tr key={code}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.025)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      style={{ borderBottom: '1px solid rgba(255,255,255,.03)', cursor: 'default' }}
                    >
                      <td style={{ padding: '8px 8px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 1 }}>
                          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{code}</span>
                          {notes && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notes}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: qColor }}>
                        {price ? price.toFixed(price >= 100 ? 1 : 2) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        {q ? (
                          <span style={{ padding: '2px 6px', borderRadius: 3, background: up ? 'rgba(255,77,79,.12)' : flat ? 'rgba(100,116,139,.1)' : 'rgba(0,196,140,.12)', color: qColor, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            {q.changePercent > 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                          </span>
                        ) : <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontSize: 11 }}>
                        {totalShares > 0 ? (
                          <div>
                            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                              {formatHolding(shares, oddLotShares)}
                            </div>
                            {totalShares > 0 && (
                              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                                {totalShares.toLocaleString()} 股
                              </div>
                            )}
                          </div>
                        ) : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {cost ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: pColor }}>
                        {pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct}%` : <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, fontSize: 11 }}>未設成本</span>}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: pColor }}>
                        {pnlAmt !== null ? `${pnlAmt >= 0 ? '+' : ''}${pnlAmt.toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        {strat ? (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: `${strat.color}18`, color: strat.color }}>{strat.icon} {strat.label}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {val?.pe ? <span style={{ color: val.pe > 30 ? '#f87171' : val.pe < 15 ? '#00c48c' : '#94a3b8' }}>{val.pe.toFixed(1)}</span> : '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontSize: 10, lineHeight: 1.6 }}>
                        {target && <div style={{ color: '#ff4d4f', fontFamily: 'var(--font-mono)' }}>🎯 {target}</div>}
                        {stopLoss && <div style={{ color: '#00c48c', fontFamily: 'var(--font-mono)' }}>🛡 {stopLoss}</div>}
                        {!target && !stopLoss && <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => setChartStock({ code, name, price, changePercent: q?.changePercent })}
                            style={{ padding: '2px 6px', borderRadius: 3, fontSize: 10, border: '1px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
                            onMouseEnter={e => { e.target.style.borderColor = 'var(--color-brand)'; e.target.style.color = 'var(--color-brand)'; }}
                            onMouseLeave={e => { e.target.style.borderColor = 'var(--color-border-secondary)'; e.target.style.color = 'var(--color-text-tertiary)'; }}>
                            K線
                          </button>
                          <button onClick={() => setEditItem({ code, name, cost, shares, oddLotShares, strategy, target, stopLoss, notes })}
                            style={{ padding: '2px 6px', borderRadius: 3, fontSize: 10, border: '1px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
                            onMouseEnter={e => { e.target.style.borderColor = '#f59e0b'; e.target.style.color = '#f59e0b'; }}
                            onMouseLeave={e => { e.target.style.borderColor = 'var(--color-border-secondary)'; e.target.style.color = 'var(--color-text-tertiary)'; }}>
                            編輯
                          </button>
                          <button onClick={() => removeFromWatchlist(code)}
                            style={{ padding: '2px 6px', borderRadius: 3, fontSize: 10, border: '1px solid rgba(248,113,113,.2)', background: 'transparent', color: 'rgba(248,113,113,.5)', cursor: 'pointer' }}
                            onMouseEnter={e => { e.target.style.borderColor = '#f87171'; e.target.style.color = '#f87171'; }}
                            onMouseLeave={e => { e.target.style.borderColor = 'rgba(248,113,113,.2)'; e.target.style.color = 'rgba(248,113,113,.5)'; }}>
                            移除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ Tab: 每日 AI 簡報 ══════════════════════════ */}
      {activeTab === 'brief' && (
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>

          {/* 控制列 */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

            {/* 報告類型 */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { k: 'open',  icon: '🌅', label: '開盤前建議', desc: '今日操作策略' },
                { k: 'close', icon: '🌙', label: '收盤後檢討', desc: '今日績效與明日策略' },
              ].map(t => (
                <button key={t.k} onClick={() => setBriefType(t.k)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '8px 16px', borderRadius: 6,
                  border: `1px solid ${briefType === t.k ? 'var(--color-brand)' : 'var(--color-border-secondary)'}`,
                  background: briefType === t.k ? 'rgba(59,130,246,.12)' : 'transparent',
                  color: briefType === t.k ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                  cursor: 'pointer', transition: 'all .15s', minWidth: 120,
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{t.label}</span>
                  <span style={{ fontSize: 10, opacity: .7 }}>{t.desc}</span>
                </button>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            {/* 市場狀態提示 */}
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
              <div>{isOpen ? '🟢 交易中' : '⚫ 已收盤'}</div>
              <div style={{ marginTop: 2 }}>建議：{autoType === 'open' ? '開盤前建議' : '收盤後檢討'}</div>
            </div>

            {/* 生成按鈕 */}
            <button
              onClick={generateBrief}
              disabled={briefLoading || watchlist.length === 0}
              style={{
                padding: '10px 20px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                background: briefLoading ? 'rgba(59,130,246,.3)' : 'var(--color-brand)',
                color: '#fff', border: 'none', cursor: briefLoading ? 'not-allowed' : 'pointer',
                minWidth: 130,
              }}>
              {briefLoading ? '生成中... ▋' : `🤖 生成${briefType === 'open' ? '開盤前' : '收盤後'}簡報`}
            </button>
          </div>

          {/* 無持股提示 */}
          {watchlist.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13 }}>請先在「持股管理」中加入持股</div>
            </div>
          )}

          {/* AI 輸出 */}
          {watchlist.length > 0 && (
            <div ref={briefRef} style={{ padding: 16, minHeight: 300, maxHeight: '60vh', overflowY: 'auto' }}>
              {briefText ? (
                <>
                  <MdText text={briefText} />
                  {briefLoading && <span className="cursor" style={{ color: 'var(--color-brand)', marginLeft: 2 }}>▋</span>}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 12, color: 'var(--color-text-tertiary)' }}>
                  <div style={{ fontSize: 36, opacity: .15 }}>🤖</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>每日 AI 持倉簡報</div>
                  <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 320, lineHeight: 1.7 }}>
                    AI 將自動抓取你持股的即時行情、本益比、法人動向，<br/>
                    生成針對你持倉的個人化操作建議。
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, marginTop: 4 }}>
                    {['即時報價', '法人籌碼', '本益比估值', '大盤分析'].map(tag => (
                      <span key={tag} style={{ padding: '2px 8px', background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-secondary)', borderRadius: 20, color: 'var(--color-text-tertiary)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
