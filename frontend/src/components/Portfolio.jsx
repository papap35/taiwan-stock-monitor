/**
 * Portfolio — 庫存/損益總覽（P6-22）
 *
 * 彙整所有持股的市值、成本、未實現損益，
 * 並以圓餅圖呈現資產配置，搭配個股損益排行。
 */
import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useStockStore } from '../stores/stockStore';
import {
  calcTotalPortfolio, fmtPct, fmtAmt, getExitedEntries, calcPerformance,
} from '../utils/portfolio';

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#ef4444', '#a3a3a3', '#14b8a6', '#eab308'];

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: color || 'var(--color-text-primary)' }}>{value}</div>
    </div>
  );
}

export default function Portfolio() {
  const { watchlist, quotes } = useStockStore();

  const { rows, totalMkt, totalCost, totalPnlAmt, totalPnlPct } = useMemo(
    () => calcTotalPortfolio(watchlist, quotes),
    [watchlist, quotes]
  );

  const holdings = useMemo(() => rows.filter(r => r.totalShares > 0), [rows]);

  const realizedPnl = useMemo(() => {
    const stats = calcPerformance(getExitedEntries(watchlist));
    if (!stats) return 0;
    return stats.results.reduce((s, r) => s + r.pnlAmt, 0);
  }, [watchlist]);

  const pieData = useMemo(
    () => holdings
      .filter(r => r.mktVal > 0)
      .map(r => ({ name: r.name, code: r.code, value: r.mktVal }))
      .sort((a, b) => b.value - a.value),
    [holdings]
  );

  const ranking = useMemo(
    () => [...holdings].sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity)),
    [holdings]
  );

  const pnlColor = totalPnlPct == null ? '#64748b' : totalPnlPct >= 0 ? '#ff4d4f' : '#00c48c';
  const realizedColor = realizedPnl > 0 ? '#ff4d4f' : realizedPnl < 0 ? '#00c48c' : '#64748b';

  if (holdings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        尚未設定任何持股成本。<br />
        <span style={{ fontSize: 11, opacity: .7 }}>前往「自選股」為持股新增買入記錄（Lot），即可在此查看庫存總覽。</span>
      </div>
    );
  }

  return (
    <div>
      {/* ── 統計卡片 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard label="持股檔數" value={`${holdings.length} 檔`} />
        <StatCard label="總市值" value={`${Math.round(totalMkt).toLocaleString()}`} />
        <StatCard label="總成本" value={`${Math.round(totalCost).toLocaleString()}`} />
        <StatCard label="未實現損益" value={fmtAmt(totalPnlAmt)} color={pnlColor} />
        <StatCard label="未實現損益 %" value={fmtPct(totalPnlPct)} color={pnlColor} />
      </div>

      {realizedPnl !== 0 && (
        <div style={{ marginBottom: 16, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          已實現損益（交易日誌累計）：<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: realizedColor }}>{fmtAmt(realizedPnl)}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, alignItems: 'start' }}>
        {/* ── 資產配置圓餅圖 ── */}
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>資產配置</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ percent }) => `${(percent * 100).toFixed(0)}%`}>
                {pieData.map((entry, i) => <Cell key={entry.code} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value, name, p) => [`${Math.round(value).toLocaleString()} 元`, `${p.payload.code} ${name}`]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {pieData.map((d, i) => (
              <div key={d.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{((d.value / totalMkt) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 持股損益排行 ── */}
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>持股損益排行</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 90px', gap: 4, fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', padding: '0 4px', marginBottom: 4 }}>
            <span>股票</span>
            <span style={{ textAlign: 'right' }}>市值</span>
            <span style={{ textAlign: 'right' }}>成本</span>
            <span style={{ textAlign: 'right' }}>損益</span>
            <span style={{ textAlign: 'right' }}>損益%</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ranking.map(r => {
              const color = r.pnlPct == null ? '#64748b' : r.pnlPct >= 0 ? '#ff4d4f' : '#00c48c';
              return (
                <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 90px', gap: 4, fontSize: 11, padding: '5px 4px', borderRadius: 4, background: 'rgba(255,255,255,.015)', alignItems: 'center' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginRight: 6, fontSize: 9 }}>{r.code}</span>
                    {r.name}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(r.mktVal).toLocaleString()}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{Math.round(r.totalCost).toLocaleString()}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{fmtAmt(r.pnlAmt)}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{fmtPct(r.pnlPct)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
