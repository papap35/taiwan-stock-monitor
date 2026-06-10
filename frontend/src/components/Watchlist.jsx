import { useState, useEffect, useRef, useMemo } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';
import StockChart from './StockChart';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  migrateLots, lotShares, lotCostTotal, lotMktVal, lotPnlAmt, lotPnlPct,
  calcPortfolio, fmtPct, fmtAmt, fmtShares,
  calcRR, calcPositionSize, calcTrailingStopPrice, isTrailingStopTriggered,
  calcChipScore, calcExitedLot, calcPerformance, getExitedEntries,
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
//  績效統計儀表板（P3-13）
// ─────────────────────────────────────────────────────────────
function PerformanceDashboard({ watchlist }) {
  // 收集所有已出場的 lot（exitPrice 存在）
  const exitedEntries = useMemo(() => getExitedEntries(watchlist), [watchlist]);

  const stats = useMemo(() => calcPerformance(exitedEntries), [exitedEntries]);

  if (exitedEntries.length === 0) {
    return (
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 48, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>尚無已出場記錄</div>
        <div style={{ fontSize: 12 }}>在持股管理頁面，點「編輯」任一買入記錄並填寫出場價格，即可在此查看績效統計</div>
      </div>
    );
  }

  const STAT_CARD = ({ label, value, sub, color }) => (
    <div style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: '12px 14px', minWidth: 100 }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: color || 'var(--color-text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const STRATEGY_LABEL = { long: '長期', swing: '波段', trade: '短線' };

  return (
    <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 18 }}>

      {/* ─ 核心指標 ────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <STAT_CARD label="總交易筆數" value={stats.totalTrades} />
        <STAT_CARD label="勝率" value={`${stats.winRate}%`}
          color={stats.winRate >= 60 ? '#00c48c' : stats.winRate >= 45 ? '#f59e0b' : '#ff4d4f'}
          sub={`${stats.winCount}勝 ${stats.totalTrades - stats.winCount}敗`} />
        <STAT_CARD label="平均獲利" value={`+${stats.avgWin}%`} color="#ff4d4f" />
        <STAT_CARD label="平均虧損" value={`${stats.avgLoss}%`} color="#00c48c" />
        <STAT_CARD label="獲利因子" value={stats.profitFactor ?? '∞'}
          color={stats.profitFactor >= 2 ? '#f59e0b' : stats.profitFactor >= 1 ? '#e2e8f0' : '#64748b'} />
        <STAT_CARD label="期望值" value={`${stats.expectancy > 0 ? '+' : ''}${stats.expectancy}%`}
          color={stats.expectancy > 0 ? '#ff4d4f' : '#00c48c'} />
        <STAT_CARD label="最大連勝" value={`${stats.maxWinStreak}連`} color="#ff4d4f" />
        <STAT_CARD label="最大連敗" value={`${stats.maxLossStreak}連`} color="#ff4d4f" />
      </div>

      {/* ─ 資金曲線 ───────────────────────────────── */}
      {stats.equityCurve.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>📈 累積損益曲線</div>
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '10px 4px', border: '1px solid var(--color-border-tertiary)' }}>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={stats.equityCurve} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={v => v >= 0 ? `+${(v/10000).toFixed(1)}萬` : `${(v/10000).toFixed(1)}萬`} width={55} />
                <Tooltip
                  contentStyle={{ background: '#0f1923', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, fontSize: 11 }}
                  formatter={(v) => [`${v >= 0 ? '+' : ''}${v.toLocaleString()} 元`, '累積損益']}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,.2)" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ─ 月度損益長條圖 ──────────────────────────── */}
      {stats.monthly.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>🗓 月度損益</div>
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '10px 4px', border: '1px solid var(--color-border-tertiary)' }}>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={stats.monthly} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={v => `${v >= 0 ? '+' : ''}${(v/10000).toFixed(1)}萬`} width={55} />
                <Tooltip
                  contentStyle={{ background: '#0f1923', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, fontSize: 11 }}
                  formatter={(v) => [`${v >= 0 ? '+' : ''}${v.toLocaleString()} 元`, '月度損益']}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,.2)" />
                <Bar dataKey="pnlAmt" radius={[3, 3, 0, 0]}
                  fill="#3b82f6"
                  label={false}
                  // 正負用不同色
                  isAnimationActive={false}
                  shape={(props) => {
                    const { x, y, width, height, value } = props;
                    const color = value >= 0 ? '#ff4d4f' : '#00c48c';
                    return <rect x={x} y={y} width={width} height={Math.abs(height) || 1} fill={color} rx={3} />;
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ─ 最佳/最差單筆 ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {stats.maxWinTrade && (
          <div style={{ background: 'rgba(255,77,79,.06)', border: '1px solid rgba(255,77,79,.15)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#ff4d4f', fontWeight: 700, marginBottom: 4 }}>🏆 最佳單筆</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{stats.maxWinTrade.name}（{stats.maxWinTrade.code}）</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#ff4d4f', fontWeight: 800 }}>+{stats.maxWinTrade.pnlPct?.toFixed(2)}%</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>+{stats.maxWinTrade.pnlAmt?.toLocaleString()} 元</div>
          </div>
        )}
        {stats.maxLossTrade && (
          <div style={{ background: 'rgba(0,196,140,.06)', border: '1px solid rgba(0,196,140,.15)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#00c48c', fontWeight: 700, marginBottom: 4 }}>📉 最大虧損</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{stats.maxLossTrade.name}（{stats.maxLossTrade.code}）</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#00c48c', fontWeight: 800 }}>{stats.maxLossTrade.pnlPct?.toFixed(2)}%</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{stats.maxLossTrade.pnlAmt?.toLocaleString()} 元</div>
          </div>
        )}
      </div>

      {/* ─ 個股勝率 ──────────────────────────────────── */}
      {stats.stockWinRate.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>🎯 個股勝率</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.stockWinRate.map(s => (
              <div key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderRadius: 6, background: 'var(--color-background-secondary)' }}>
                <div style={{ width: 80, fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{s.name} <span style={{ color: 'var(--color-text-tertiary)', fontSize: 9 }}>{s.code}</span></div>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${s.winRate}%`, height: '100%', background: s.winRate >= 60 ? '#00c48c' : s.winRate >= 40 ? '#f59e0b' : '#ff4d4f', borderRadius: 3 }} />
                </div>
                <div style={{ width: 50, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: s.winRate >= 60 ? '#00c48c' : s.winRate >= 40 ? '#f59e0b' : '#ff4d4f' }}>{s.winRate}%</div>
                <div style={{ width: 40, textAlign: 'right', fontSize: 10, color: 'var(--color-text-tertiary)' }}>{s.wins}/{s.total}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─ 策略勝率 ──────────────────────────────────── */}
      {stats.strategyWinRate.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>⚡ 策略勝率</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {stats.strategyWinRate.map(s => (
              <div key={s.strategy} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)', minWidth: 100 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>{STRATEGY_LABEL[s.strategy] || s.strategy}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: s.winRate >= 60 ? '#00c48c' : s.winRate >= 40 ? '#f59e0b' : '#ff4d4f' }}>{s.winRate}%</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{s.wins}勝 / {s.total - s.wins}敗</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Lot Modal（新增 / 編輯買入記錄）
// ─────────────────────────────────────────────────────────────
// ─── AI 覆盤 Modal ────────────────────────────────────────────
function AIReviewModal({ code, name, lot, text, loading, onStart, onClose }) {
  const exitReasonLabel = {
    target: '目標到達', stoploss: '停損出場',
    technical: '技術面破壞', fundamental: '基本面改變', other: '其他',
  };
  // 使用 calcExitedLot 統一計算，避免重複邏輯
  const exitedResult = lot.exitPrice ? calcExitedLot(lot) : null;
  const pnl    = exitedResult?.pnlPct ?? null;
  const pnlAmt = exitedResult?.pnlAmt ?? null;

  const renderText = (t) =>
    t.split(/(\*\*[^*]+\*\*)/).map((seg, i) =>
      seg.startsWith('**') && seg.endsWith('**')
        ? <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{seg.slice(2, -2)}</strong>
        : <span key={i}>{seg}</span>
    );

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#0f1923', border: '1px solid #1e2d40', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.8)' }} className="fade-in">

        {/* 標題 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #1a2535', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🔍 AI 覆盤 — {name}（{code}）</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #1e2d40', background: 'transparent', color: '#64748b', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        {/* 交易摘要 */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1a2535', flexShrink: 0 }}>
          {[
            { label: '進場', val: lot.date || '—', sub: `$${lot.cost}` },
            { label: '出場', val: lot.exitDate || '—', sub: `$${lot.exitPrice}` },
            { label: '損益', val: pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl}%` : '—', sub: pnlAmt != null ? `${Number(pnlAmt) >= 0 ? '+' : ''}${Number(pnlAmt).toLocaleString()}元` : '', color: pnl >= 0 ? '#ff4d4f' : '#00c48c' },
            { label: '出場理由', val: exitReasonLabel[lot.exitReason] || lot.exitReason || '—', sub: '' },
          ].map((c, i) => (
            <div key={i} style={{ flex: 1, padding: '8px 12px', borderRight: i < 3 ? '1px solid #1a2535' : 'none' }}>
              <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c.color || '#e2e8f0' }}>{c.val}</div>
              {c.sub && <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'var(--font-mono)' }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* 內容區 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 0 }}>
          {!text && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 30 }}>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 1.6 }}>
                AI 將根據你的進出場記錄、K 線背景和學習筆記<br />
                給出客觀的覆盤評估與改進建議。
              </div>
              {lot.lesson && (
                <div style={{ background: '#161f2e', border: '1px solid #1e2d40', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#94a3b8', width: '100%' }}>
                  💡 你的自評：{lot.lesson}
                </div>
              )}
              <button onClick={onStart} style={{
                padding: '8px 24px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                border: '1px solid #0ea5e9', background: 'rgba(14,165,233,.12)',
                color: '#0ea5e9', cursor: 'pointer', marginTop: 8,
              }}>
                開始 AI 覆盤
              </button>
            </div>
          )}

          {!text && loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>AI 正在分析這筆交易...</div>
              {[100, 80, 90, 70, 85].map((w, i) => (
                <div key={i} style={{ height: 10, borderRadius: 4, background: '#1e2d40', width: `${w}%`, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
          )}

          {text && (
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
              {renderText(text)}
              {loading && <span style={{ display: 'inline-block', width: 6, height: 13, background: '#0ea5e9', marginLeft: 2, animation: 'pulse 1s ease-in-out infinite', verticalAlign: 'middle' }} />}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid #1a2535', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: '#334155', flex: 1 }}>分析僅供參考，不構成投資建議</span>
          {text && !loading && (
            <button onClick={onStart} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, border: '1px solid #1e2d40', background: 'transparent', color: '#475569', cursor: 'pointer' }}>
              重新分析
            </button>
          )}
          <button onClick={onClose} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, border: '1px solid #1e2d40', background: 'transparent', color: '#475569', cursor: 'pointer' }}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

function LotModal({ stockName, lot, settings, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date:            lot?.date            ?? today,
    shares:          lot?.shares          ?? '',
    oddLotShares:    lot?.oddLotShares    ?? '',
    cost:            lot?.cost            ?? '',
    note:            lot?.note            ?? '',
    trailingStopPct: lot?.trailingStopPct ?? '',
    planTarget:      lot?.planTarget      ?? '',
    planStop:        lot?.planStop        ?? '',
    exitPrice:       lot?.exitPrice       ?? '',
    exitDate:        lot?.exitDate        ?? '',
    exitReason:      lot?.exitReason      ?? '',
    lesson:          lot?.lesson          ?? '',
  });
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inp = { padding: '7px 10px', border: '1px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 13, width: '100%' };
  const label = { fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 };

  const total = (parseInt(form.shares) || 0) * 1000 + (parseInt(form.oddLotShares) || 0);
  const totalCost = total * (parseFloat(form.cost) || 0);

  // R/R 計算
  const rrResult = calcRR(parseFloat(form.cost), parseFloat(form.planTarget), parseFloat(form.planStop));

  // 部位規模計算
  const capital = settings?.totalCapital ?? 0;
  const riskPct = settings?.maxRiskPct ?? 2;
  const posResult = calcPositionSize(capital, riskPct, parseFloat(form.cost), parseFloat(form.planStop));

  const valid = (form.shares || form.oddLotShares) && form.cost;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0f1923', border: '1px solid var(--color-border-secondary)', borderRadius: 10, width: '100%', maxWidth: 440, padding: 20, maxHeight: '90vh', overflowY: 'auto' }} className="fade-in">
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
            <div style={label}>買入日期</div>
            <input style={inp} type="date" value={form.date} onChange={e => f('date', e.target.value)} />
          </div>

          {/* 數量 */}
          <div>
            <div style={{ ...label, marginBottom: 6 }}>買入數量</div>
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
            <div style={label}>買入成本（元/股）</div>
            <input style={inp} type="number" step="0.01" placeholder="0.00" value={form.cost} onChange={e => f('cost', e.target.value)} />
            {totalCost > 0 && (
              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                本次總成本 <span style={{ color: '#f59e0b', fontWeight: 700 }}>{Math.round(totalCost).toLocaleString()} 元</span>
              </div>
            )}
          </div>

          {/* ── 動態停損 ─────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--color-border-tertiary)', paddingTop: 10 }}>
            <div style={label}>🛡 移動停損設定（選填）</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>移動停損比例（%）</div>
                <input style={inp} type="number" step="0.1" min="0" max="50" placeholder="例：8" value={form.trailingStopPct} onChange={e => f('trailingStopPct', e.target.value)} />
              </div>
              <div>
                {form.cost && form.trailingStopPct && (
                  <div style={{ paddingTop: 18, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    從成本觸發：<br />
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#f87171', fontWeight: 700 }}>
                      ${(parseFloat(form.cost) * (1 - parseFloat(form.trailingStopPct) / 100)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
              系統追蹤此批買入的價格高點，回落設定比例時發出警示
            </div>
          </div>

          {/* ── 風險報酬計算器 ──────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--color-border-tertiary)', paddingTop: 10 }}>
            <div style={label}>⚖️ 風險報酬計算器（選填）</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>規劃目標價</div>
                <input style={inp} type="number" step="0.01" placeholder="0.00" value={form.planTarget} onChange={e => f('planTarget', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>規劃停損價</div>
                <input style={inp} type="number" step="0.01" placeholder="0.00" value={form.planStop} onChange={e => f('planStop', e.target.value)} />
              </div>
            </div>
            {rrResult && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>潛在獲利</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ff4d4f', fontWeight: 700 }}>+{rrResult.reward}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>潛在風險</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#00c48c', fontWeight: 700 }}>-{rrResult.risk}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>R/R 比</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: rrResult.rr >= 2 ? '#f59e0b' : rrResult.rr >= 1 ? '#e2e8f0' : '#94a3b8' }}>
                    1:{rrResult.rr}
                  </div>
                </div>
              </div>
            )}
            {/* 部位規模建議 */}
            {posResult && (
              <div style={{ marginTop: 6, padding: '7px 10px', borderRadius: 6, background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', fontSize: 11 }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>📐 部位建議（資金 {(capital / 10000).toFixed(0)}萬，風險 {riskPct}%）：</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#f59e0b', fontWeight: 700, marginLeft: 6 }}>
                  {posResult.lots > 0 ? `${posResult.lots} 張` : `${posResult.shares} 股`}
                </span>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 10, marginLeft: 4 }}>
                  （最大損失 {posResult.maxLoss.toLocaleString()} 元）
                </span>
              </div>
            )}
            {capital === 0 && (
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 5 }}>
                💡 在「設定」中設定總資金，可顯示建議買入張數
              </div>
            )}
          </div>

          {/* 進場理由 */}
          <div>
            <div style={label}>進場理由（選填）</div>
            <input style={inp} placeholder="例：逢低布局、法說前布局、突破頸線..." value={form.note} onChange={e => f('note', e.target.value)} />
          </div>

          {/* ── 出場記錄 ──────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--color-border-tertiary)', paddingTop: 10 }}>
            <div style={label}>🚪 出場記錄（填寫後視為已出場）</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>出場價格（元）</div>
                <input style={inp} type="number" step="0.01" placeholder="0.00" value={form.exitPrice} onChange={e => f('exitPrice', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>出場日期</div>
                <input style={inp} type="date" value={form.exitDate} onChange={e => f('exitDate', e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>出場理由</div>
              <select style={{ ...inp, cursor: 'pointer' }} value={form.exitReason} onChange={e => f('exitReason', e.target.value)}>
                <option value="">請選擇...</option>
                <option value="target">🎯 目標價到達</option>
                <option value="stoploss">🛡 停損觸發</option>
                <option value="technical">📉 技術面破壞</option>
                <option value="fundamental">📋 基本面改變</option>
                <option value="other">💡 其他</option>
              </select>
            </div>
            {form.exitPrice && form.cost && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6,
                background: (parseFloat(form.exitPrice) >= parseFloat(form.cost)) ? 'rgba(0,196,140,.08)' : 'rgba(255,77,79,.08)',
                border: `1px solid ${(parseFloat(form.exitPrice) >= parseFloat(form.cost)) ? 'rgba(0,196,140,.2)' : 'rgba(255,77,79,.2)'}`,
                fontSize: 11, fontFamily: 'var(--font-mono)',
              }}>
                {(() => {
                  const ep = parseFloat(form.exitPrice), cp = parseFloat(form.cost);
                  const sh = (parseInt(form.shares)||0)*1000 + (parseInt(form.oddLotShares)||0);
                  const pct = cp > 0 ? ((ep/cp-1)*100).toFixed(2) : null;
                  const amt = sh > 0 ? Math.round((ep-cp)*sh) : null;
                  return <span style={{ color: ep >= cp ? '#00c48c' : '#ff4d4f', fontWeight: 700 }}>
                    {ep >= cp ? '▲ 獲利' : '▼ 虧損'} {pct}%
                    {amt != null && <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: 8 }}>{amt > 0 ? '+' : ''}{amt.toLocaleString()} 元</span>}
                  </span>;
                })()}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 3 }}>這筆學到什麼（選填）</div>
              <input style={inp} placeholder="例：停損太慢、法人轉賣時應提前出場..." value={form.lesson} onChange={e => f('lesson', e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid var(--color-border-secondary)', borderRadius: 6, color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button
            disabled={!valid}
            onClick={() => onSave({
              date:            form.date,
              shares:          parseInt(form.shares)       || 0,
              oddLotShares:    parseInt(form.oddLotShares) || 0,
              cost:            parseFloat(form.cost),
              note:            form.note.trim(),
              trailingStopPct: form.trailingStopPct ? parseFloat(form.trailingStopPct) : null,
              planTarget:      form.planTarget      ? parseFloat(form.planTarget)      : null,
              planStop:        form.planStop        ? parseFloat(form.planStop)        : null,
              exitPrice:       form.exitPrice       ? parseFloat(form.exitPrice)       : null,
              exitDate:        form.exitDate        || null,
              exitReason:      form.exitReason      || null,
              lesson:          form.lesson.trim()   || null,
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
function StockSettingsModal({ item, groups, onSave, onClose }) {
  const [form, setForm] = useState({
    strategy: item.strategy ?? 'long',
    target:   item.target   ?? '',
    stopLoss: item.stopLoss ?? '',
    notes:    item.notes    ?? '',
    group:    item.group    ?? 'holdings',
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
          {/* 群組選擇 */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 4 }}>📁 所屬群組</div>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.group} onChange={e => f('group', e.target.value)}>
              {(groups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
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
  const { watchlist, quotes, peakPrices, settings, groups,
    addToWatchlist, removeFromWatchlist, updateWatchlistItem, addLot, updateLot, removeLot,
    addGroup, renameGroup, deleteGroup,
  } = useStockStore();
  const [addCode, setAddCode]     = useState('');
  const [addName, setAddName]     = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [expanded, setExpanded]   = useState(new Set());
  const [lotModal, setLotModal]   = useState(null);   // { code, name, lot? }
  const [settingsModal, setSettingsModal] = useState(null);
  const [chartStock, setChartStock]       = useState(null);
  const [activeTab, setActiveTab] = useState('holdings');
  // 群組篩選
  const [activeGroup, setActiveGroup] = useState('all');  // 'all' | groupId
  const [groupEditMode, setGroupEditMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [briefType, setBriefType] = useState('open');
  const [briefText, setBriefText] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  // AI 覆盤
  const [reviewModal, setReviewModal] = useState(null); // { code, name, lot }
  const [reviewText, setReviewText]   = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [valMap, setValMap]       = useState({});
  const [chipData, setChipData]   = useState({}); // { [code]: { inst, margin } }
  const [chipExpanded, setChipExpanded] = useState(new Set()); // 展開籌碼明細的股票
  const [calEvents, setCalEvents] = useState({}); // { [code]: [event, ...] }
  const briefRef = useRef(null);

  useEffect(() => {
    api.getMarketValuation().then(d => setValMap(d || {})).catch(() => {});
  }, []);

  // ── 行事曆事件：抓自選股未來 14 天的除權息/財報
  useEffect(() => {
    if (!watchlist.length) return;
    const codes = watchlist.map(w => w.code);
    api.getCalendarEvents(14, codes)
      .then(res => {
        // 以 code 為 key 分組
        const map = {};
        for (const e of (res.events || [])) {
          (map[e.code] = map[e.code] || []).push(e);
        }
        setCalEvents(map);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.map(w => w.code).join(',')]);

  // ── 籌碼資料：每支自選股抓法人 + 融資券（mount 時一次，不需頻繁刷新）
  useEffect(() => {
    if (!watchlist.length) return;
    watchlist.forEach(({ code }) => {
      Promise.allSettled([
        api.getInstitutional(code, 1),
        api.getMargin(code, 1),
      ]).then(([instRes, margRes]) => {
        const inst   = instRes.status === 'fulfilled'  ? (instRes.value?.data  || []) : [];
        const margin = margRes.status === 'fulfilled'  ? (margRes.value?.data  || []) : [];
        setChipData(prev => ({ ...prev, [code]: { inst, margin } }));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.map(w => w.code).join(',')]);

  // ── 主動 REST 輪詢自選股報價（保底）──────────────────
  // WebSocket 只推熱門股；自選股可能不在清單內，需補充拉取。
  // 每 20 秒主動查詢一次，結果合入全域 quotes store。
  useEffect(() => {
    if (!watchlist.length) return;

    const { setQuotes } = useStockStore.getState();

    const fetchWatchlistQuotes = async () => {
      const codes = watchlist.map(w => w.code);
      try {
        const res = await api.getQuotes(codes);
        if (res?.quotes) setQuotes(res.quotes);
      } catch (e) {
        console.warn('[Watchlist] REST fallback error:', e.message);
      }
    };

    // 立即抓一次
    fetchWatchlistQuotes();

    // 每 20 秒補拉一次
    const timer = setInterval(fetchWatchlistQuotes, 20000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.map(w => w.code).join(',')]);

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

  // 依群組篩選（'all' = 全部）
  const displayRows = activeGroup === 'all'
    ? portfolioRows
    : portfolioRows.filter(r => (r.group || 'holdings') === activeGroup);

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

      {/* ── AI 覆盤 Modal ── */}
      {reviewModal && (
        <AIReviewModal
          code={reviewModal.code}
          name={reviewModal.name}
          lot={reviewModal.lot}
          text={reviewText}
          loading={reviewLoading}
          onStart={async () => {
            if (reviewLoading) return;
            setReviewLoading(true);
            setReviewText('');
            // 嘗試取得 K 線資料（3 個月）
            let candles = [];
            try {
              const res = await api.getHistory(reviewModal.code, 3);
              candles = res.candles || [];
            } catch { /* 無 K 線也能分析 */ }
            try {
              await api.reviewTrade(
                reviewModal.code,
                reviewModal.name,
                reviewModal.lot,
                candles,
                (chunk) => setReviewText(t => t + chunk),
                () => setReviewLoading(false),
              );
            } catch {
              setReviewText('⚠️ 覆盤失敗，請確認後端 API Key 是否設定。');
              setReviewLoading(false);
            }
          }}
          onClose={() => { setReviewModal(null); setReviewText(''); setReviewLoading(false); }}
        />
      )}

      {lotModal && (
        <LotModal
          stockName={`${lotModal.name}（${lotModal.code}）`}
          lot={lotModal.lot}
          settings={settings}
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
          groups={groups}
          onSave={(data) => { updateWatchlistItem(settingsModal.code, data); setSettingsModal(null); }}
          onClose={() => setSettingsModal(null)}
        />
      )}

      {/* ── 群組篩選列 ────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 全部 chip */}
          <button onClick={() => setActiveGroup('all')} style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid',
            borderColor: activeGroup === 'all' ? 'var(--color-brand)' : 'var(--color-border-secondary)',
            background:  activeGroup === 'all' ? 'rgba(59,130,246,.15)' : 'transparent',
            color:       activeGroup === 'all' ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
          }}>
            全部 <span style={{ fontSize: 10, opacity: .7 }}>{watchlist.length}</span>
          </button>

          {/* 各群組 chip */}
          {groups.map(g => {
            const cnt = watchlist.filter(w => (w.group || 'holdings') === g.id).length;
            const active = activeGroup === g.id;
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button onClick={() => setActiveGroup(g.id)} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                  borderColor: active ? '#f59e0b' : 'var(--color-border-secondary)',
                  background:  active ? 'rgba(245,158,11,.15)' : 'transparent',
                  color:       active ? '#f59e0b' : 'var(--color-text-tertiary)',
                }}>
                  {g.name} <span style={{ fontSize: 10, opacity: .7 }}>{cnt}</span>
                </button>
                {/* 非內建群組：重命名/刪除按鈕（編輯模式下顯示） */}
                {groupEditMode && !g.builtin && (
                  <>
                    <button title="重命名" onClick={() => {
                      const n = prompt('新名稱', g.name);
                      if (n?.trim()) renameGroup(g.id, n);
                    }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 11, padding: '2px 4px' }}>✏️</button>
                    <button title="刪除" onClick={() => {
                      if (confirm(`刪除「${g.name}」？其中的股票將移至「我的持股」`)) {
                        deleteGroup(g.id);
                        if (activeGroup === g.id) setActiveGroup('all');
                      }
                    }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 11, padding: '2px 4px' }}>✕</button>
                  </>
                )}
              </div>
            );
          })}

          {/* 新增群組 */}
          {groupEditMode ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newGroupName.trim()) { addGroup(newGroupName); setNewGroupName(''); } }}
                placeholder="群組名稱" style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 11, width: 90 }} />
              <button onClick={() => { if (newGroupName.trim()) { addGroup(newGroupName); setNewGroupName(''); } }}
                style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: 'var(--color-brand)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>+</button>
              <button onClick={() => { setGroupEditMode(false); setNewGroupName(''); }}
                style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--color-text-tertiary)', fontSize: 11, cursor: 'pointer' }}>完成</button>
            </div>
          ) : (
            <button onClick={() => setGroupEditMode(true)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, border: '1px dashed var(--color-border-tertiary)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
              ＋ 管理群組
            </button>
          )}
        </div>
      </div>

      {/* 投組摘要（依目前篩選的群組顯示） */}
      {watchlist.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 10 }}>
          {[
            { label: activeGroup === 'all' ? '持股檔數' : (groups.find(g=>g.id===activeGroup)?.name || '篩選中'), val: `${activeGroup === 'all' ? watchlist.length : watchlist.filter(w=>(w.group||'holdings')===activeGroup).length} 檔`, color: 'var(--color-brand)' },
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
        {[['holdings', '📋 持股管理'], ['performance', '📊 績效統計'], ['brief', '🤖 每日 AI 簡報']].map(([k, l]) => (
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
            {displayRows.length > 0 && (
              <button onClick={() => setExpanded(prev => {
                const visible = new Set(displayRows.map(r => r.code));
                const allExp = displayRows.every(r => prev.has(r.code));
                if (allExp) { const next = new Set(prev); visible.forEach(c => next.delete(c)); return next; }
                return new Set([...prev, ...visible]);
              })} className="btn" style={{ fontSize: 11 }}>
                {displayRows.every(r => expanded.has(r.code)) ? '全部收合 ▲' : '全部展開 ▼'}
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
          {/* 此群組無股票 */}
          {watchlist.length > 0 && displayRows.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              此群組尚無股票，在股票設定中選擇「{groups.find(g=>g.id===activeGroup)?.name || ''}」即可移入
            </div>
          )}

          {/* 欄位表頭 */}
          {displayRows.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 90px 90px 120px 120px 90px 80px 120px 60px 140px',
              padding: '5px 10px',
              borderBottom: '1px solid var(--color-border-tertiary)',
              background: 'rgba(0,0,0,.15)',
            }}>
              {['', '名稱／代號', '現價', '漲跌%', '加權均成', '損益%', '市值', 'P/E', '目標／停損', '籌碼分', '操作'].map((h, i) => (
                <div key={i} style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '.04em', textAlign: i >= 2 ? 'right' : 'left', paddingRight: i >= 2 && i < 10 ? 4 : 0 }}>
                  {h}
                </div>
              ))}
            </div>
          )}

          {/* 股票列表 */}
          {displayRows.map((row) => {
            const { code, name, q, price, lots, totalShares, avgCost, mktVal, pnlAmt, pnlPct, strategy, target, stopLoss, notes } = row;
            const isExp = expanded.has(code);
            const up = q?.changePercent > 0, flat = q?.changePercent === 0;
            const qColor = !q ? '#64748b' : flat ? '#64748b' : up ? '#ff4d4f' : '#00c48c';
            const pColor = pnlPct == null ? '#64748b' : pnlPct >= 0 ? '#ff4d4f' : '#00c48c';
            const strat = STRATEGY_MAP[strategy];
            const val = valMap[code];
            const chip = chipData[code];
            const chipResult = chip ? calcChipScore(chip.inst, chip.margin) : null;
            const chipScore = chipResult?.score ?? null;
            const chipColor = chipScore == null ? '#64748b'
              : chipScore >= 70 ? '#00c48c'
              : chipScore >= 40 ? '#f59e0b'
              : '#ef4444';
            const isChipExp = chipExpanded.has(code);
            const hasLots = lots.length > 0;

            return (
              <div key={code} style={{ borderBottom: '1px solid var(--color-border-tertiary)' }}>
                {/* ── 主列 ─────────────────────────────────── */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 90px 90px 120px 120px 90px 80px 120px 60px 140px',
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
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 1, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{code}</span>
                      {strat && <span style={{ fontSize: 9, fontWeight: 700, padding: '0 4px', borderRadius: 2, background: `${strat.color}18`, color: strat.color }}>{strat.icon}</span>}
                      {hasLots && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{lots.length} 筆買入</span>}
                      {activeGroup === 'all' && (() => {
                        const g = groups.find(g => g.id === (row.group || 'holdings'));
                        return g ? <span style={{ fontSize: 8, padding: '0 4px', borderRadius: 2, background: 'rgba(245,158,11,.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.2)' }}>{g.name}</span> : null;
                      })()}
                      {/* 行事曆事件提醒 */}
                      {(calEvents[code] || []).slice(0, 2).map((ev, i) => {
                        const TYPE_ICON = { dividend: '💰', rights: '📈', earnings: '📋' };
                        const icon = TYPE_ICON[ev.type] || '📅';
                        const dayLabel = ev.daysFromToday === 0 ? '今天' : ev.daysFromToday === 1 ? '明天' : `${ev.daysFromToday}天後`;
                        const urgent = ev.daysFromToday <= 3;
                        return (
                          <span key={i} style={{ fontSize: 8, padding: '0 4px', borderRadius: 2,
                            background: urgent ? 'rgba(245,158,11,.15)' : 'rgba(100,116,139,.1)',
                            color: urgent ? '#f59e0b' : '#64748b',
                            border: `1px solid ${urgent ? 'rgba(245,158,11,.3)' : 'rgba(100,116,139,.2)'}`,
                            whiteSpace: 'nowrap',
                          }}>
                            {icon} {dayLabel}{ev.amount ? ` $${ev.amount}` : ''}
                          </span>
                        );
                      })}
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

                  {/* 籌碼分 */}
                  <div style={{ textAlign: 'right' }} onClick={e => { e.stopPropagation(); if (chipResult) setChipExpanded(prev => { const next = new Set(prev); next.has(code) ? next.delete(code) : next.add(code); return next; }); }}>
                    {chipScore != null ? (
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: chipColor, lineHeight: 1 }}>
                          {chipScore}
                        </div>
                        <div style={{ fontSize: 8, color: chipColor, marginTop: 1 }}>籌碼分</div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>—</span>
                    )}
                  </div>

                  {/* 操作按鈕 */}
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    <SmBtn onClick={() => setChartStock({ code, name, price, changePercent: q?.changePercent })} color="var(--color-brand)">K線</SmBtn>
                    <SmBtn onClick={() => setSettingsModal({ code, name, strategy, target, stopLoss, notes })} color="#f59e0b">設定</SmBtn>
                    <SmBtn onClick={() => removeFromWatchlist(code)} color="#f87171" danger>刪除</SmBtn>
                  </div>
                </div>

                {/* ── 籌碼分明細展開 ──────────────────────── */}
                {isChipExp && chipResult && (
                  <div style={{ background: 'rgba(0,0,0,.25)', borderTop: '1px solid rgba(255,255,255,.04)', padding: '8px 16px' }}>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginBottom: 6, letterSpacing: '.06em' }}>籌碼評分明細</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {Object.values(chipResult.detail).map(item => (
                        <div key={item.label} style={{ background: 'var(--color-background-secondary)', borderRadius: 5, padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{item.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: item.score > 0 ? '#00c48c' : '#475569' }}>
                            +{item.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                      const isExited = !!lot.exitPrice;
                      const exitedResult = isExited ? calcExitedLot(lot) : null;
                      // 已出場：用 exitPrice 計算損益；持倉中：用 price
                      const lpnlPct = isExited
                        ? (exitedResult?.pnlPct ?? null)
                        : (lot.cost && price ? lotPnlPct(lot, price) : null);
                      const lpnlAmt = isExited
                        ? (exitedResult?.pnlAmt ?? null)
                        : (lot.cost && price ? lotPnlAmt(lot, price) : null);
                      const lmkt = isExited ? null : (price ? lotMktVal(lot, price) : null);
                      const lColor = lpnlPct == null ? '#64748b' : lpnlPct >= 0 ? '#ff4d4f' : '#00c48c';
                      // 動態停損計算（僅持倉中）
                      const peak = peakPrices?.[code] ?? 0;
                      const tsPct = !isExited ? lot.trailingStopPct : null;
                      const tsPrice = (peak > 0 && tsPct) ? calcTrailingStopPrice(peak, tsPct) : null;
                      const tsTriggered = (price > 0 && tsPrice) ? isTrailingStopTriggered(price, peak, tsPct) : false;
                      // R/R 摘要
                      const rrInfo = !isExited && lot.planTarget && lot.planStop && lot.cost ? calcRR(lot.cost, lot.planTarget, lot.planStop) : null;
                      return (
                        <div key={lot.id}>
                          <div
                            style={{ display: 'grid', gridTemplateColumns: '100px 100px 90px 100px 100px 90px 1fr', alignItems: 'center', padding: '7px 48px', borderTop: '1px solid rgba(255,255,255,.03)',
                              background: isExited ? 'rgba(100,116,139,.04)' : tsTriggered ? 'rgba(248,113,113,.04)' : 'transparent',
                              opacity: isExited ? 0.72 : 1,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = isExited ? 'rgba(100,116,139,.07)' : tsTriggered ? 'rgba(248,113,113,.07)' : 'rgba(255,255,255,.025)'}
                            onMouseLeave={e => e.currentTarget.style.background = isExited ? 'rgba(100,116,139,.04)' : tsTriggered ? 'rgba(248,113,113,.04)' : 'transparent'}
                          >
                            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                              {lot.date || <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                              {isExited && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>↩ {lot.exitDate || '已出場'}</div>}
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', paddingRight: 6 }}>
                              <div>{fmtShares(lot.shares, lot.oddLotShares)}</div>
                              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{ls.toLocaleString()} 股</div>
                            </div>
                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', paddingRight: 6 }}>
                              {lot.cost ? `$${lot.cost}` : '—'}
                              {isExited && <div style={{ fontSize: 9, color: '#94a3b8' }}>→ ${lot.exitPrice}</div>}
                            </div>
                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: lColor, paddingRight: 6 }}>
                              {lpnlPct != null ? fmtPct(lpnlPct) : '—'}
                            </div>
                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: lColor, paddingRight: 6 }}>
                              {lpnlAmt != null ? fmtAmt(lpnlAmt) : '—'}
                            </div>
                            <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)', paddingRight: 6 }}>
                              {isExited
                                ? (exitedResult?.holdDays ? <span style={{ fontSize: 9, color: '#64748b' }}>{exitedResult.holdDays}天</span> : '—')
                                : (lmkt ? `${(lmkt / 10000).toFixed(0)}萬` : '—')}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 6 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflow: 'hidden' }}>
                                {isExited ? (
                                  <>
                                    <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                                      ✓ 已出場
                                      {exitedResult?.annualReturn != null && (
                                        <span style={{ marginLeft: 6, color: exitedResult.annualReturn >= 0 ? '#ff4d4f' : '#00c48c' }}>
                                          年化 {exitedResult.annualReturn >= 0 ? '+' : ''}{exitedResult.annualReturn.toFixed(1)}%
                                        </span>
                                      )}
                                    </span>
                                    {lot.lesson && <span style={{ fontSize: 9, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>💡 {lot.lesson}</span>}
                                  </>
                                ) : (
                                  <>
                                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {lot.note || ''}
                                    </span>
                                    {/* 動態停損徽章 */}
                                    {tsPrice && (
                                      <span style={{ fontSize: 9, color: tsTriggered ? '#f87171' : '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                                        {tsTriggered ? '⚠️ 停損觸發！' : `🛡 移動停損 $${tsPrice.toFixed(2)}`}
                                        {peak > 0 && ` (峰 $${peak.toFixed(2)})`}
                                      </span>
                                    )}
                                    {/* R/R 徽章 */}
                                    {rrInfo && (
                                      <span style={{ fontSize: 9, color: rrInfo.rr >= 2 ? '#f59e0b' : '#64748b', fontFamily: 'var(--font-mono)' }}>
                                        ⚖️ R/R 1:{rrInfo.rr}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                {isExited && (
                                  <SmBtn onClick={() => { setReviewModal({ code, name, lot }); setReviewText(''); }} color="#0ea5e9">AI 覆盤</SmBtn>
                                )}
                                <SmBtn onClick={() => setLotModal({ code, name, lot })} color="#f59e0b">編輯</SmBtn>
                                <SmBtn onClick={() => removeLot(code, lot.id)} color="#f87171" danger>刪除</SmBtn>
                              </div>
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

      {/* ══ Tab: 績效統計 ══════════════════════════════════════ */}
      {activeTab === 'performance' && (
        <PerformanceDashboard watchlist={watchlist} />
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
