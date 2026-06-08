import { useState, useEffect, useRef } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';
import StockChart from './StockChart';
import {
  migrateLots, lotShares, lotCostTotal, lotMktVal, lotPnlAmt, lotPnlPct,
  calcPortfolio, fmtPct, fmtAmt, fmtShares,
} from '../utils/portfolio';

// ─────────────────────────────────────────────────────────────
//  資料結構說明（詳見 src/utils/portfolio.js）
//  WatchlistItem: { code, name, strategy, target, stopLoss, notes, lots[] }
//  Lot:           { id, date, shares, oddLotShares, cost, note }
// ─────────────────────────────────────────────────────────────

const STRATEGIES = [
  { value: 'long',  label: '長期持有', color: '#3b82f6', icon: '🏦' },
  { value: 'swing', label: '波段操作', color: '#f59e0b', icon: '📊' },
  { value: 'trade', label: '短線交易', color: '#8b5cf6', icon: '⚡' },
];
const STRATEGY_MAP = Object.fromEntries(STRATEGIES.map(s => [s.value, s]));

// Re-export for backward compat（測試與其他元件可從此處取得）
export { lotShares, lotCostTotal, lotMktVal, lotPnlAmt, lotPnlPct, calcPortfolio };

// ─────────────────────────────────────────────────────────────
//  Markdown 渲染（每日簡報用）
// ─────────────────────────────────────────────────────────────
function MdText({ text }) {
  if (!text) return null;
  return (
    <div style={{ lineHeight: 1.9, fontSize: 13 }}>
      {text.split('\n').map((line, i) => {
        if (/^═+$/.test(line.trim())) return <div key={i} style={{ height: 1, background: 'var(--color-border-tertiary)', margin: '8px 0' }} />;
        if (/^──/.test(line)) return (
          <div key={i} style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-brand)', marginTop: 12, marginBottom: 3, borderLeft: '2px solid var(--color-brand)', paddingLeft: 8 }}>
            {line.replace(/^──\s*/, '').replace(/\s*──$/, '')}
          </div>
        );
        if (/^【.+】/.test(line.trim())) return (
          <div key={i} style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginTop: 10, marginBottom: 2 }}>{line}</div>
        );
        if (line.startsWith('- ') || line.startsWith('• ')) return (
          <div key={i} style={{ display: 'flex', gap: 8, color: 'var(--color-text-secondary)', paddingLeft: 4 }}>
            <span style={{ color: 'var(--color-brand)', flexShrink: 0 }}>▸</span><span>{line.slice(2)}</span>
          </div>
        );
        if (line.trim() === '') return <div key={i} style={{ height: 5 }} />;
        return <div key={i} style={{ color: 'var(--color-text-secondary)' }}>{line}</div>;
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Lot Modal（新增 / 編輯買入記錄）
// ─────────────────────────────────────────────────────────────
function LotModal({ stockName, lot, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date:         lot?.date         ?? today,
    shares:       lot?.shares       ?? '',
    oddLotShares: lot?.oddLotShares ?? '',
    cost:         lot?.cost         ?? '',
    note:         lot?.note         ?? '',
  });
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inp = { padding: '7px 10px', border: '1px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 13, width: '100%' };

  const total = (parseInt(form.shares) || 0) * 1000 + (parseInt(form.oddLotShares) || 0);
  const totalCost = total * (parseFloat(form.cost) || 0);

  const valid = (form.shares || form.oddLotShares) && form.cost;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f1923', border: '1px solid var(--color-border-secondary)', borderRadius: 10, width: '100%', maxWidth: 400, padding: 20 }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {lot ? '編輯買入記錄' : '新增買入記錄'}
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{stockName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 日期 */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>買入日期</div>
            <input style={inp} type="date" value={form.date} onChange={e => f('date', e.target.value)} />
          </div>

          {/* 數量 */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>買入數量</div>
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
            {total > 0 && (
              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                合計 <span style={{ color: 'var(--color-brand)', fontWeight: 700 }}>{total.toLocaleString()} 股</span>
              </div>
            )}
          </div>

          {/* 成本 */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>買入成本（元/股）</div>
            <input style={inp} type="number" step="0.01" placeholder="0.00" value={form.cost} onChange={e => f('cost', e.target.value)} />
            {totalCost > 0 && (
              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                本次總成本 <span style={{ color: '#f59e0b', fontWeight: 700 }}>{Math.round(totalCost).toLocaleString()} 元</span>
              </div>
            )}
          </div>

          {/* 備註 */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>備註（選填）</div>
            <input style={inp} placeholder="例：逢低布局、法說前布局..." value={form.note} onChange={e => f('note', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--color-border-secondary)', borderRadius: 6, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button
            disabled={!valid}
            onClick={() => onSave({
              date:         form.date,
              shares:       parseInt(form.shares)       || 0,
              oddLotShares: parseInt(form.oddLotShares) || 0,
              cost:         parseFloat(form.cost),
              note:         form.note.trim(),
            })}
            style={{ flex: 1, padding: '8px', background: valid ? 'var(--color-brand)' : 'var(--color-background-tertiary)', border: 'none', borderRadius: 6, color: valid ? '#fff' : 'var(--color-text-tertiary)', cursor: valid ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
            {lot ? '儲存變更' : '新增記錄'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  股票設定 Modal（策略、目標、停損）
// ─────────────────────────────────────────────────────────────
function StockSettingsModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({
    strategy: item.strategy ?? 'long',
    target:   item.target   ?? '',
    stopLoss: item.stopLoss ?? '',
    notes:    item.notes    ?? '',
  });
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inp = { padding: '7px 10px', border: '1px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 13, width: '100%' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f1923', border: '1px solid var(--color-border-secondary)', borderRadius: 10, width: '100%', maxWidth: 380, padding: 20 }} className="fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{item.name} 設定</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{item.code}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 4 }}>目標價（元）</div>
              <input style={inp} type="number" step="0.01" placeholder="選填" value={form.target} onChange={e => f('target', e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 4 }}>停損價（元）</div>
              <input style={inp} type="number" step="0.01" placeholder="選填" value={form.stopLoss} onChange={e => f('stopLoss', e.target.value)} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 4 }}>備註</div>
            <input style={inp} placeholder="選填" value={form.notes} onChange={e => f('notes', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--color-border-secondary)', borderRadius: 6, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button onClick={() => onSave({ ...form, target: form.target ? parseFloat(form.target) : null, stopLoss: form.stopLoss ? parseFloat(form.stopLoss) : null })}
            style={{ flex: 1, padding: '8px', background: 'var(--color-brand)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  主元件
// ─────────────────────────────────────────────────────────────
export default function Watchlist() {
  const { watchlist, quotes, addToWatchlist, removeFromWatchlist, updateWatchlistItem, addLot, updateLot, removeLot } = useStockStore();
  const [addCode, setAddCode]     = useState('');
  const [addName, setAddName]     = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [expanded, setExpanded]   = useState(new Set());
  const [lotModal, setLotModal]   = useState(null);   // { code, name, lot? }
  const [settingsModal, setSettingsModal] = useState(null);
  const [chartStock, setChartStock]       = useState(null);
  const [activeTab, setActiveTab] = useState('holdings');
  const [briefType, setBriefType] = useState('open');
  const [briefText, setBriefText] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [valMap, setValMap]       = useState({});
  const briefRef = useRef(null);

  useEffect(() => {
    api.getMarketValuation().then(d => setValMap(d || {})).catch(() => {});
  }, []);

  // ── 新增股票（只加代號，不含買入記錄）───────────────
  const addStock = async () => {
    if (!addCode.trim()) return;
    const code = addCode.trim().toUpperCase();
    if (watchlist.find(w => w.code === code)) return;
    setAddLoading(true);
    let name = addName;
    if (!name) {
      try { const q = await api.getQuotes([code]); name = q.quotes[code]?.name || code; }
      catch { name = code; }
    }
    addToWatchlist({ code, name, strategy: 'long', lots: [] });
    setAddCode(''); setAddName('');
    // 自動展開並開啟新增 lot
    setExpanded(prev => new Set([...prev, code]));
    setLotModal({ code, name });
    setAddLoading(false);
  };

  // ── 切換展開 ─────────────────────────────────────
  const toggleExpand = (code) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });

  // ── 整體統計 ─────────────────────────────────────
  const portfolioRows = watchlist.map(w => {
    const price = quotes[w.code]?.price ?? 0;
    const p = calcPortfolio(w, price);
    return { ...w, ...p, price, q: quotes[w.code] };
  });
  const totalMkt  = portfolioRows.reduce((s, r) => s + (r.mktVal || 0), 0);
  const totalCost = portfolioRows.reduce((s, r) => s + (r.totalCost || 0), 0);
  const totalPnlAmt = totalMkt - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalMkt / totalCost - 1) * 100 : null;

  // ── 每日簡報 ─────────────────────────────────────
  const generateBrief = async () => {
    if (briefLoading || !watchlist.length) return;
    setBriefLoading(true); setBriefText('');
    try {
      const holdings = watchlist.map(w => {
        const lots = migrateLots(w);
        const totalShares = lots.reduce((s, l) => s + lotShares(l), 0);
        const totalCost   = lots.reduce((s, l) => s + lotCostTotal(l), 0);
        const avgCost     = totalShares > 0 ? +(totalCost / totalShares).toFixed(2) : null;
        return {
          code: w.code, name: w.name,
          shares:   Math.floor(totalShares / 1000) || null,
          oddLotShares: totalShares % 1000 || null,
          cost:     avgCost,
          strategy: w.strategy, target: w.target, stopLoss: w.stopLoss, notes: w.notes,
        };
      });
      await api.analyzePortfolio(holdings, briefType,
        (chunk) => { setBriefText(p => p + chunk); if (briefRef.current) briefRef.current.scrollTop = briefRef.current.scrollHeight; },
        () => setBriefLoading(false),
      );
    } catch (e) { setBriefText(`分析失敗：${e.message}`); setBriefLoading(false); }
  };

  const inp = { padding: '7px 10px', border: '1px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 13 };

  const now = new Date();
  const totalMin = now.getHours() * 60 + now.getMinutes();
  const isOpen = now.getDay() >= 1 && now.getDay() <= 5 && totalMin >= 540 && totalMin <= 810;

  return (
    <div>
      {/* Modals */}
      {chartStock && <StockChart stock={chartStock} onClose={() => setChartStock(null)} />}
      {lotModal && (
        <LotModal
          stockName={`${lotModal.name}（${lotModal.code}）`}
          lot={lotModal.lot}
          onSave={(data) => {
            if (lotModal.lot) updateLot(lotModal.code, lotModal.lot.id, data);
            else addLot(lotModal.code, data);
            setLotModal(null);
          }}
          onClose={() => setLotModal(null)}
        />
      )}
      {settingsModal && (
        <StockSettingsModal
          item={settingsModal}
          onSave={(data) => { updateWatchlistItem(settingsModal.code, data); setSettingsModal(null); }}
          onClose={() => setSettingsModal(null)}
        />
      )}

      {/* 投組摘要 */}
      {watchlist.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
          {[
            { label: '持股檔數', val: `${watchlist.length} 檔`,                       color: 'var(--color-brand)' },
            { label: '總市值',   val: totalMkt ? `${(totalMkt/10000).toFixed(0)}萬`   : '—', color: 'var(--color-text-secondary)' },
            { label: '總損益額', val: totalCost ? fmtAmt(totalPnlAmt)                 : '—', color: totalPnlAmt >= 0 ? '#ff4d4f' : '#00c48c' },
            { label: '整體損益', val: totalPnlPct != null ? fmtPct(totalPnlPct)        : '—', color: totalPnlPct >= 0 ? '#ff4d4f' : '#00c48c' },
          ].map((s, i) => (
            <div key={i} className="stat-tile">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: '1.2rem', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 切換 */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', borderRadius: '8px 8px 0 0' }}>
        {[['holdings', '📋 持股管理'], ['brief', '🤖 每日 AI 簡報']].map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            padding: '9px 18px', border: 'none', background: 'transparent',
            borderBottom: activeTab === k ? '2px solid var(--color-brand)' : '2px solid transparent',
            color: activeTab === k ? '#e2e8f0' : 'var(--color-text-tertiary)',
            fontSize: 13, fontWeight: activeTab === k ? 600 : 400, cursor: 'pointer', marginBottom: -1,
          }}>{l}</button>
        ))}
      </div>

      {/* ══ Tab: 持股管理 ══════════════════════════════════════ */}
      {activeTab === 'holdings' && (
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>

          {/* 新增股票列 */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-tertiary)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: 'var(--color-background-secondary)' }}>
            <input style={{ ...inp, width: 80 }} placeholder="股票代號" value={addCode} onChange={e => setAddCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStock()} />
            <input style={{ ...inp, minWidth: 120, flex: 1 }} placeholder="名稱（可自動查詢）" value={addName} onChange={e => setAddName(e.target.value)} />
            <button onClick={addStock} disabled={addLoading || !addCode} className="btn btn-primary" style={{ minWidth: 80 }}>
              {addLoading ? '查詢中...' : '+ 加入追蹤'}
            </button>
            {watchlist.length > 0 && (
              <button onClick={() => setExpanded(prev => prev.size === watchlist.length ? new Set() : new Set(watchlist.map(w => w.code)))}
                className="btn" style={{ fontSize: 11 }}>
                {expanded.size === watchlist.length ? '全部收合 ▲' : '全部展開 ▼'}
              </button>
            )}
          </div>

          {/* 無資料 */}
          {watchlist.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              <div style={{ fontSize: 28, opacity: .2, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>尚未加入任何股票</div>
              <div style={{ fontSize: 11 }}>輸入代號開始追蹤，可記錄多筆不同價格的買入記錄</div>
            </div>
          )}

          {/* 股票列表 */}
          {portfolioRows.map((row) => {
            const { code, name, q, price, lots, totalShares, avgCost, mktVal, pnlAmt, pnlPct, strategy, target, stopLoss, notes } = row;
            const isExp = expanded.has(code);
            const up = q?.changePercent > 0, flat = q?.changePercent === 0;
            const qColor = !q ? '#64748b' : flat ? '#64748b' : up ? '#ff4d4f' : '#00c48c';
            const pColor = pnlPct == null ? '#64748b' : pnlPct >= 0 ? '#ff4d4f' : '#00c48c';
            const strat = STRATEGY_MAP[strategy];
            const val = valMap[code];
            const hasLots = lots.length > 0;

            return (
              <div key={code} style={{ borderBottom: '1px solid var(--color-border-tertiary)' }}>
                {/* ── 主列 ─────────────────────────────────── */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 90px 90px 120px 120px 90px 80px 120px 140px',
                  alignItems: 'center',
                  padding: '10px 10px',
                  cursor: 'pointer',
                  background: isExp ? 'rgba(255,255,255,.02)' : 'transparent',
                  transition: 'background .1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(255,255,255,.02)' : 'transparent'}
                  onClick={() => toggleExpand(code)}
                >
                  {/* 展開箭頭 */}
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', userSelect: 'none' }}>{isExp ? '▼' : '▶'}</div>

                  {/* 名稱代號 */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 1 }}>
                      <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{code}</span>
                      {strat && <span style={{ fontSize: 9, fontWeight: 700, padding: '0 4px', borderRadius: 2, background: `${strat.color}18`, color: strat.color }}>{strat.icon}</span>}
                      {hasLots && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{lots.length} 筆買入</span>}
                    </div>
                  </div>

                  {/* 現價 */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: qColor }}>
                      {price ? price.toFixed(price >= 100 ? 1 : 2) : '—'}
                    </div>
                    {q && (
                      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: qColor }}>
                        {q.changePercent > 0 ? '+' : ''}{q.changePercent?.toFixed(2)}%
                      </div>
                    )}
                  </div>

                  {/* 總持股 */}
                  <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {totalShares > 0 ? (
                      <>
                        <div>{Math.floor(totalShares / 1000) > 0 && `${Math.floor(totalShares / 1000)}張`} {totalShares % 1000 > 0 && `${totalShares % 1000}股`}</div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{totalShares.toLocaleString()} 股</div>
                      </>
                    ) : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                  </div>

                  {/* 加權均成 */}
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {avgCost > 0 ? (
                      <>
                        <div>{avgCost.toFixed(avgCost >= 100 ? 1 : 2)}</div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>加權均成</div>
                      </>
                    ) : <span style={{ color: 'var(--color-text-tertiary)' }}>無成本</span>}
                  </div>

                  {/* 損益% */}
                  <div style={{ textAlign: 'right' }}>
                    {pnlPct != null ? (
                      <>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: pColor }}>
                          {fmtPct(pnlPct)}
                        </div>
                        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: pColor }}>
                          {fmtAmt(pnlAmt)} 元
                        </div>
                      </>
                    ) : <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>未設成本</span>}
                  </div>

                  {/* 市值 */}
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {mktVal > 0 ? `${(mktVal / 10000).toFixed(0)}萬` : '—'}
                  </div>

                  {/* P/E */}
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {val?.pe ? <span style={{ color: val.pe > 30 ? '#f87171' : val.pe < 15 ? '#00c48c' : '#94a3b8' }}>{val.pe.toFixed(1)}</span> : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                  </div>

                  {/* 目標/停損 */}
                  <div style={{ textAlign: 'right', fontSize: 10, lineHeight: 1.6 }}>
                    {target && <div style={{ color: '#ff4d4f', fontFamily: 'var(--font-mono)' }}>🎯 {target}</div>}
                    {stopLoss && <div style={{ color: '#00c48c', fontFamily: 'var(--font-mono)' }}>🛡 {stopLoss}</div>}
                    {!target && !stopLoss && <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                  </div>

                  {/* 操作按鈕 */}
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    <SmBtn onClick={() => setChartStock({ code, name, price, changePercent: q?.changePercent })} color="var(--color-brand)">K線</SmBtn>
                    <SmBtn onClick={() => setSettingsModal({ code, name, strategy, target, stopLoss, notes })} color="#f59e0b">設定</SmBtn>
                    <SmBtn onClick={() => removeFromWatchlist(code)} color="#f87171" danger>刪除</SmBtn>
                  </div>
                </div>

                {/* ── 展開：買入記錄 ─────────────────────── */}
                {isExp && (
                  <div style={{ background: 'rgba(0,0,0,.2)', borderTop: '1px solid rgba(255,255,255,.04)' }}>
                    {/* 表頭 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 100px 90px 100px 100px 90px 1fr', gap: 0, padding: '5px 48px', background: 'rgba(0,0,0,.2)' }}>
                      {['買入日期', '持有數量', '買入成本', '損益 %', '損益 元', '市值', '備註'].map((h, i) => (
                        <div key={i} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', textAlign: i === 0 ? 'left' : 'right', padding: '0 6px' }}>{h}</div>
                      ))}
                    </div>

                    {/* 各筆買入 */}
                    {lots.length === 0 ? (
                      <div style={{ padding: '12px 48px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>尚無買入記錄，點下方「+ 新增買入記錄」開始記錄</div>
                    ) : lots.map(lot => {
                      const ls = lotShares(lot);
                      const lpnlPct = lot.cost && price ? lotPnlPct(lot, price) : null;
                      const lpnlAmt = lot.cost && price ? lotPnlAmt(lot, price) : null;
                      const lmkt    = price ? lotMktVal(lot, price) : null;
                      const lColor  = lpnlPct == null ? '#64748b' : lpnlPct >= 0 ? '#ff4d4f' : '#00c48c';
                      return (
                        <div key={lot.id}
                          style={{ display: 'grid', gridTemplateColumns: '100px 100px 90px 100px 100px 90px 1fr', alignItems: 'center', padding: '7px 48px', borderTop: '1px solid rgba(255,255,255,.03)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.025)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {lot.date || <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', paddingRight: 6 }}>
                            <div>{fmtShares(lot.shares, lot.oddLotShares)}</div>
                            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{ls.toLocaleString()} 股</div>
                          </div>
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', paddingRight: 6 }}>
                            {lot.cost ? `$${lot.cost}` : '—'}
                          </div>
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: lColor, paddingRight: 6 }}>
                            {lpnlPct != null ? fmtPct(lpnlPct) : '—'}
                          </div>
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: lColor, paddingRight: 6 }}>
                            {lpnlAmt != null ? fmtAmt(lpnlAmt) : '—'}
                          </div>
                          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', paddingRight: 6 }}>
                            {lmkt ? `${(lmkt / 10000).toFixed(0)}萬` : '—'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 6 }}>
                            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lot.note || ''}
                            </span>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <SmBtn onClick={() => setLotModal({ code, name, lot })} color="#f59e0b">編輯</SmBtn>
                              <SmBtn onClick={() => removeLot(code, lot.id)} color="#f87171" danger>刪除</SmBtn>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* 新增買入 */}
                    <div style={{ padding: '8px 48px' }}>
                      <button onClick={() => setLotModal({ code, name })} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        border: '1px dashed rgba(59,130,246,.4)', background: 'transparent', color: 'var(--color-brand)',
                        cursor: 'pointer', transition: 'all .15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-brand)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(59,130,246,.4)'}
                      >
                        + 新增買入記錄
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ Tab: 每日 AI 簡報 ══════════════════════════════════ */}
      {activeTab === 'brief' && (
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { k: 'open',  icon: '🌅', label: '開盤前建議' },
                { k: 'close', icon: '🌙', label: '收盤後檢討' },
              ].map(t => (
                <button key={t.k} onClick={() => setBriefType(t.k)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 6,
                  border: `1px solid ${briefType === t.k ? 'var(--color-brand)' : 'var(--color-border-secondary)'}`,
                  background: briefType === t.k ? 'rgba(59,130,246,.12)' : 'transparent',
                  color: briefType === t.k ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{isOpen ? '🟢 交易中' : '⚫ 已收盤'}</span>
            <div style={{ flex: 1 }} />
            <button onClick={generateBrief} disabled={briefLoading || !watchlist.length}
              style={{ padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, background: briefLoading ? 'rgba(59,130,246,.3)' : 'var(--color-brand)', color: '#fff', border: 'none', cursor: briefLoading ? 'not-allowed' : 'pointer', minWidth: 130 }}>
              {briefLoading ? '生成中... ▋' : `🤖 生成簡報`}
            </button>
          </div>
          <div ref={briefRef} style={{ padding: 16, minHeight: 280, maxHeight: '60vh', overflowY: 'auto' }}>
            {briefText ? (
              <>
                <MdText text={briefText} />
                {briefLoading && <span className="cursor" style={{ color: 'var(--color-brand)' }}>▋</span>}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, gap: 10, color: 'var(--color-text-tertiary)' }}>
                <div style={{ fontSize: 32, opacity: .15 }}>🤖</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>每日 AI 持倉簡報</div>
                <div style={{ fontSize: 11, textAlign: 'center', maxWidth: 300, lineHeight: 1.7 }}>
                  AI 將自動計算加權均成、合計損益，並結合即時行情生成個人化建議。
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 小按鈕元件 ────────────────────────────────────────────
function SmBtn({ onClick, color, danger, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '2px 7px', borderRadius: 3, fontSize: 10,
      border: `1px solid ${danger ? 'rgba(248,113,113,.2)' : 'var(--color-border-secondary)'}`,
      background: 'transparent',
      color: danger ? 'rgba(248,113,113,.6)' : 'var(--color-text-tertiary)',
      cursor: 'pointer', transition: 'all .15s',
    }}
      onMouseEnter={e => { e.target.style.borderColor = color; e.target.style.color = color; }}
      onMouseLeave={e => {
        e.target.style.borderColor = danger ? 'rgba(248,113,113,.2)' : 'var(--color-border-secondary)';
        e.target.style.color = danger ? 'rgba(248,113,113,.6)' : 'var(--color-text-tertiary)';
      }}>
      {children}
    </button>
  );
}
