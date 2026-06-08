/**
 * Dashboard — 客製化首頁
 *
 * 面板清單（可自由開關）：
 *   taiex        大盤指數
 *   portfolio    持股概況
 *   breadth      市場廣度
 *   sector       類股熱力
 *   topmovers    漲跌排行
 *   watchlist    自選快覽
 *   world        國際市場
 *   alerts       警報動態
 *   institutional 法人動向
 */
import { useEffect, useState, useCallback } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';
import { calcPortfolio, migrateLots, lotShares, lotCostTotal } from './Watchlist.jsx';

// ── localStorage helpers ──────────────────────────────────
const LS_KEY = 'dashboard_panels';
const DEFAULT_PANELS = {
  taiex:         true,
  portfolio:     true,
  breadth:       true,
  sector:        true,
  topmovers:     true,
  watchlist:     true,
  world:         true,
  alerts:        true,
  institutional: false,
};
const PANEL_META = [
  { id: 'taiex',         label: '大盤指數',  icon: '📈', desc: 'TAIEX 即時指數、漲跌點數' },
  { id: 'portfolio',     label: '持股概況',  icon: '💼', desc: '總市值、損益摘要' },
  { id: 'breadth',       label: '市場廣度',  icon: '🌊', desc: '漲跌平家數、漲停跌停統計' },
  { id: 'sector',        label: '類股熱力',  icon: '🔥', desc: '各類股漲跌強弱熱力圖' },
  { id: 'topmovers',     label: '漲跌排行',  icon: '🏆', desc: '今日前5漲 & 前5跌' },
  { id: 'watchlist',     label: '自選快覽',  icon: '⭐', desc: '自選股即時報價' },
  { id: 'world',         label: '國際市場',  icon: '🌍', desc: '美股、日股、港股、匯率、油價' },
  { id: 'alerts',        label: '警報動態',  icon: '🔔', desc: '最近觸發的警報記錄' },
  { id: 'institutional', label: '法人動向',  icon: '🏦', desc: '三大法人今日買超前5' },
];

const REGION_FLAG = { US: '🇺🇸', JP: '🇯🇵', HK: '🇭🇰', KR: '🇰🇷', FX: '💱', CM: '🪙' };

const SECTORS = [
  { name: '半導體', codes: ['2330', '2454', '2303'] },
  { name: '電子零組件', codes: ['2317', '2308'] },
  { name: '金融', codes: ['2881', '2882', '2886', '2891'] },
  { name: '電腦週邊', codes: ['2382'] },
  { name: '化工', codes: ['1301', '6505'] },
  { name: '鋼鐵', codes: ['2002'] },
  { name: '電信', codes: ['2412', '4904'] },
  { name: '航運', codes: ['2609', '2603', '2615'] },
];

// ── 工具函式 ──────────────────────────────────────────────
const fmtPct = (n, sign = true) => n == null ? '—' : `${sign && n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtAmt = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString()}`;

function loadPanels() {
  try { return { ...DEFAULT_PANELS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; }
  catch { return DEFAULT_PANELS; }
}
function savePanels(p) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
}

// ── 面板容器 ──────────────────────────────────────────────
function Panel({ title, icon, children, span = 1, minH }) {
  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: 'var(--color-background-card)',
      border: '1px solid var(--color-border-tertiary)',
      borderRadius: 8,
      padding: 14,
      minHeight: minH,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{title}</span>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  個別面板元件
// ═══════════════════════════════════════════════════════════

// 大盤指數
function TaiexPanel({ taiex }) {
  const chgColor = taiex ? (taiex.changePercent > 0 ? '#ff4d4f' : taiex.changePercent < 0 ? '#00c48c' : '#64748b') : '#64748b';
  const prevClose = taiex ? +(taiex.value - taiex.change).toFixed(2) : 0;
  if (!taiex) return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 20 }}>等待資料...</div>;
  return (
    <div>
      <div style={{ fontSize: '2.4rem', fontWeight: 800, color: chgColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {taiex.value.toLocaleString()}
      </div>
      <div style={{ fontSize: 14, color: chgColor, marginTop: 6, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
        {taiex.changePercent > 0 ? '▲' : taiex.changePercent < 0 ? '▼' : '—'} {Math.abs(taiex.change).toFixed(2)}
        <span style={{ fontSize: 13, marginLeft: 8, opacity: .8 }}>({taiex.changePercent > 0 ? '+' : ''}{taiex.changePercent}%)</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
        {[
          { label: '開盤', val: taiex.open?.toLocaleString(), color: 'var(--color-text-secondary)' },
          { label: '最高', val: taiex.high?.toLocaleString(), color: '#ff4d4f' },
          { label: '最低', val: taiex.low?.toLocaleString(),  color: '#00c48c' },
          { label: '昨收', val: prevClose?.toLocaleString(),  color: 'var(--color-text-tertiary)' },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--color-background-secondary)', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.val || '—'}</div>
          </div>
        ))}
      </div>
      {taiex.volume > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
          成交量：<span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{(taiex.volume / 1000).toFixed(0)} 億</span>
        </div>
      )}
    </div>
  );
}

// 持股概況
function PortfolioPanel({ watchlist, quotes }) {
  if (!watchlist.length) return (
    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 16 }}>
      尚未加入任何持股<br />
      <span style={{ fontSize: 10, opacity: .6 }}>前往「自選股」新增</span>
    </div>
  );

  const rows = watchlist.map(w => {
    const price = quotes[w.code]?.price ?? 0;
    return calcPortfolio(w, price);
  });
  const totalMkt   = rows.reduce((s, r) => s + r.mktVal, 0);
  const totalCost  = rows.reduce((s, r) => s + r.totalCost, 0);
  const pnlAmt     = (totalMkt && totalCost) ? totalMkt - totalCost : null;
  const pnlPct     = (totalMkt && totalCost) ? (totalMkt / totalCost - 1) * 100 : null;
  const pColor     = pnlPct == null ? '#64748b' : pnlPct >= 0 ? '#ff4d4f' : '#00c48c';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          { label: '持股檔數', val: `${watchlist.length} 檔`, color: 'var(--color-brand)' },
          { label: '總市值',   val: totalMkt ? `${(totalMkt/10000).toFixed(0)} 萬` : '—', color: 'var(--color-text-secondary)' },
          { label: '損益 %',  val: fmtPct(pnlPct), color: pColor },
          { label: '損益 元', val: pnlAmt != null ? fmtAmt(pnlAmt) : '—', color: pColor },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--color-background-secondary)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>
      {/* 前3持股 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {watchlist.slice(0, 3).map(w => {
          const price = quotes[w.code]?.price ?? 0;
          const { pnlPct: pp } = calcPortfolio(w, price);
          const pc = pp == null ? '#64748b' : pp >= 0 ? '#ff4d4f' : '#00c48c';
          return (
            <div key={w.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', borderRadius: 4, background: 'rgba(255,255,255,.02)' }}>
              <div style={{ fontSize: 11 }}><span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginRight: 6 }}>{w.code}</span>{w.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: pc }}>{fmtPct(pp)}</div>
            </div>
          );
        })}
        {watchlist.length > 3 && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>...共 {watchlist.length} 檔</div>}
      </div>
    </div>
  );
}

// 市場廣度
function BreadthPanel({ breadth }) {
  if (!breadth) return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 20 }}>載入中...</div>;
  const total = breadth.up + breadth.down + breadth.flat || 1;
  return (
    <div>
      {/* 進度條 */}
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 12, gap: 1 }}>
        <div style={{ flex: breadth.up,   background: '#ff4d4f' }} />
        <div style={{ flex: breadth.flat, background: '#334155' }} />
        <div style={{ flex: breadth.down, background: '#00c48c' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 8 }}>
        {[
          { label: '上漲', val: breadth.up,   pct: (breadth.up/total*100).toFixed(0),   color: '#ff4d4f' },
          { label: '平盤', val: breadth.flat, pct: (breadth.flat/total*100).toFixed(0), color: '#64748b' },
          { label: '下跌', val: breadth.down, pct: (breadth.down/total*100).toFixed(0), color: '#00c48c' },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: item.color, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{item.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: item.color, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{item.val.toLocaleString()}</div>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{item.pct}%</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[
          { label: '🔴 漲停', val: breadth.limitUp ?? 0,   color: '#ff4d4f' },
          { label: '🟢 跌停', val: breadth.limitDown ?? 0, color: '#00c48c' },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--color-background-secondary)', borderRadius: 5, padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{item.label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: item.color }}>{item.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 類股熱力
function SectorPanel({ quotes }) {
  const sectors = SECTORS.map(s => {
    const vals = s.codes.map(c => quotes[c]?.changePercent).filter(v => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { ...s, avg };
  }).filter(s => s.avg != null).sort((a, b) => b.avg - a.avg);

  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.avg)), 0.01);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {sectors.map(s => {
        const up = s.avg > 0;
        const pct = Math.abs(s.avg) / maxAbs;
        const intensity = Math.min(pct * 0.5, 0.4);
        const bg = up ? `rgba(255,77,79,${intensity})` : `rgba(0,196,140,${intensity})`;
        const color = up ? '#ff4d4f' : '#00c48c';
        return (
          <div key={s.name} style={{ background: bg, border: `1px solid ${up ? 'rgba(255,77,79,.15)' : 'rgba(0,196,140,.15)'}`, borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 3, fontWeight: 600 }}>{s.name}</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>{up ? '+' : ''}{s.avg.toFixed(2)}%</div>
            <div style={{ height: 2, marginTop: 5, borderRadius: 1, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
              <div style={{ width: `${pct * 100}%`, height: '100%', background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 漲跌排行
function TopMoversPanel({ quotes }) {
  const list = Object.values(quotes).filter(q => q.price > 0 && q.name);
  const topUp   = [...list].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
  const topDown = [...list].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);

  const Row = ({ q, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', borderRadius: 4, background: 'rgba(255,255,255,.015)' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginRight: 4 }}>{q.code}</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</span>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{color === '#ff4d4f' ? '+' : ''}{q.changePercent.toFixed(2)}%</div>
        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{q.price.toFixed(q.price >= 100 ? 1 : 2)}</div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div>
        <div style={{ fontSize: 9, color: '#ff4d4f', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>▲ 今日前5漲</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {topUp.map(q => <Row key={q.code} q={q} color="#ff4d4f" />)}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 9, color: '#00c48c', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>▼ 今日前5跌</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {topDown.map(q => <Row key={q.code} q={q} color="#00c48c" />)}
        </div>
      </div>
    </div>
  );
}

// 自選快覽
function WatchlistPanel({ watchlist, quotes }) {
  if (!watchlist.length) return (
    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 16 }}>
      自選股為空，前往「自選股」新增
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {watchlist.slice(0, 8).map(w => {
        const q = quotes[w.code];
        const price = q?.price ?? 0;
        const up = (q?.changePercent ?? 0) > 0;
        const dn = (q?.changePercent ?? 0) < 0;
        const qColor = !q ? '#64748b' : up ? '#ff4d4f' : dn ? '#00c48c' : '#64748b';
        const { pnlPct } = calcPortfolio(w, price);
        const pColor = pnlPct == null ? '#64748b' : pnlPct >= 0 ? '#ff4d4f' : '#00c48c';
        return (
          <div key={w.code} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto',
            alignItems: 'center', gap: 8, padding: '5px 6px',
            borderRadius: 5, background: 'rgba(255,255,255,.015)',
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700 }}>{w.name}</span>
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginLeft: 5, fontFamily: 'var(--font-mono)' }}>{w.code}</span>
            </div>
            {pnlPct != null && (
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: pColor, fontWeight: 600 }}>{fmtPct(pnlPct)}</span>
            )}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: qColor }}>
                {price ? price.toFixed(price >= 100 ? 1 : 2) : '——'}
              </div>
              {q && <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: qColor }}>{up?'+':''}{q.changePercent.toFixed(2)}%</div>}
            </div>
          </div>
        );
      })}
      {watchlist.length > 8 && (
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', marginTop: 2 }}>...共 {watchlist.length} 檔</div>
      )}
    </div>
  );
}

// 國際市場
function WorldPanel({ markets }) {
  if (!markets?.length) return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 20 }}>載入中...</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {markets.map(m => {
        const up = m.changePercent > 0, dn = m.changePercent < 0;
        const color = up ? '#ff4d4f' : dn ? '#00c48c' : '#64748b';
        return (
          <div key={m.symbol} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 4, background: 'rgba(255,255,255,.015)' }}>
            <span style={{ fontSize: 11 }}>{REGION_FLAG[m.region] || ''}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{m.name}</div>
              {m.marketState === 'REGULAR' && <span style={{ fontSize: 8, background: 'rgba(0,196,140,.2)', color: '#00c48c', padding: '0 3px', borderRadius: 2, fontWeight: 700 }}>開盤中</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>
                {m.type === 'fx' ? m.price.toFixed(3) : m.price >= 10000 ? m.price.toLocaleString() : m.price.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color }}>{up?'+':''}{m.changePercent.toFixed(2)}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 警報動態
function AlertsPanel({ triggerHistory }) {
  const recent = triggerHistory.slice(0, 6);
  if (!recent.length) return <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 16 }}>目前無警報記錄</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {recent.map((ev, i) => {
        const isUp = ev.alert?.type === 'above';
        const color = isUp ? '#ff4d4f' : '#00c48c';
        const time = ev.triggeredAt ? new Date(ev.triggeredAt).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 4, background: 'rgba(255,255,255,.015)' }}>
            <span style={{ fontSize: 10, color, fontWeight: 700 }}>{isUp ? '▲' : '▼'}</span>
            <div style={{ flex: 1, fontSize: 10 }}>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{ev.alert?.code || '—'}</span>
              <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>{ev.alert?.type === 'above' ? '突破' : '跌破'} {ev.alert?.price}</span>
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{time}</span>
          </div>
        );
      })}
    </div>
  );
}

// 法人動向
function InstitutionalPanel({ data }) {
  if (!data?.stocks?.length) return <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center', paddingTop: 20 }}>載入中...</div>;
  const top5 = [...data.stocks].sort((a, b) => b.totalNet - a.totalNet).slice(0, 5);
  const maxNet = Math.max(...top5.map(s => Math.abs(s.totalNet)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 2 }}>三大法人買超前5</div>
      {top5.map(s => {
        const up = s.totalNet > 0;
        const color = up ? '#ff4d4f' : '#00c48c';
        const barPct = Math.abs(s.totalNet) / maxNet * 100;
        return (
          <div key={s.code}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10 }}><span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginRight: 4 }}>{s.code}</span>{s.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{up?'+':''}{(s.totalNet/1000).toFixed(0)}K</span>
            </div>
            <div style={{ height: 3, background: 'var(--color-background-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  主元件
// ═══════════════════════════════════════════════════════════
export default function Dashboard() {
  const { taiex, quotes, watchlist, triggerHistory } = useStockStore();
  const [panels, setPanels]         = useState(loadPanels);
  const [showConfig, setShowConfig] = useState(false);
  const [breadth, setBreadth]       = useState(null);
  const [worldMkts, setWorldMkts]   = useState([]);
  const [instData, setInstData]     = useState(null);

  useEffect(() => {
    api.getBreadth().then(setBreadth).catch(() => {});
    api.getWorldMarkets().then(setWorldMkts).catch(() => {});
    if (panels.institutional) {
      api.getMarketInstitutional().then(setInstData).catch(() => {});
    }
  }, []);

  const togglePanel = (id) => {
    setPanels(prev => {
      const next = { ...prev, [id]: !prev[id] };
      savePanels(next);
      return next;
    });
  };

  const now = new Date();
  const isTradingHours = (() => {
    const h = now.getHours(), m = now.getMinutes();
    const min = h * 60 + m;
    const day = now.getDay();
    return day >= 1 && day <= 5 && min >= 9 * 60 && min <= 13 * 60 + 30;
  })();

  return (
    <div>
      {/* ── 工具列 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
            儀表板
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 10, fontWeight: 400 }}>
              {now.toLocaleDateString('zh-TW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
            {isTradingHours
              ? <span style={{ color: '#ff4d4f' }}>● 台股交易中</span>
              : <span>● 今日已收盤 / 非交易日</span>}
          </div>
        </div>
        <button
          onClick={() => setShowConfig(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${showConfig ? 'var(--color-brand)' : 'var(--color-border-secondary)'}`,
            background: showConfig ? 'rgba(59,130,246,.12)' : 'transparent',
            color: showConfig ? 'var(--color-brand)' : 'var(--color-text-secondary)',
          }}
        >
          ⚙ 自訂面板
        </button>
      </div>

      {/* ── 面板設定列 ── */}
      {showConfig && (
        <div style={{
          background: 'var(--color-background-card)',
          border: '1px solid var(--color-brand)',
          borderRadius: 8, padding: '12px 14px', marginBottom: 10,
        }} className="fade-in">
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-brand)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            ⚙ 選擇要顯示的面板
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
            {PANEL_META.map(p => (
              <label key={p.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                padding: '8px 10px', borderRadius: 6,
                background: panels[p.id] ? 'rgba(59,130,246,.08)' : 'var(--color-background-secondary)',
                border: `1px solid ${panels[p.id] ? 'rgba(59,130,246,.25)' : 'var(--color-border-tertiary)'}`,
                transition: 'all .15s',
              }}>
                <input type="checkbox" checked={panels[p.id]} onChange={() => togglePanel(p.id)}
                  style={{ accentColor: 'var(--color-brand)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.icon} {p.label}</div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{p.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── 面板格線 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignItems: 'start' }}>

        {panels.taiex && (
          <Panel title="大盤指數" icon="📈" span={1} minH={160}>
            <TaiexPanel taiex={taiex} />
          </Panel>
        )}

        {panels.portfolio && (
          <Panel title="持股概況" icon="💼" span={1} minH={160}>
            <PortfolioPanel watchlist={watchlist} quotes={quotes} />
          </Panel>
        )}

        {panels.breadth && (
          <Panel title="市場廣度" icon="🌊" span={1} minH={160}>
            <BreadthPanel breadth={breadth} />
          </Panel>
        )}

        {panels.sector && (
          <Panel title="類股熱力" icon="🔥" span={1}>
            <SectorPanel quotes={quotes} />
          </Panel>
        )}

        {panels.topmovers && (
          <Panel title="漲跌排行" icon="🏆" span={2}>
            <TopMoversPanel quotes={quotes} />
          </Panel>
        )}

        {panels.world && (
          <Panel title="國際市場" icon="🌍" span={1}>
            <WorldPanel markets={worldMkts} />
          </Panel>
        )}

        {panels.watchlist && (
          <Panel title="自選快覽" icon="⭐" span={2}>
            <WatchlistPanel watchlist={watchlist} quotes={quotes} />
          </Panel>
        )}

        {panels.alerts && (
          <Panel title="警報動態" icon="🔔" span={1}>
            <AlertsPanel triggerHistory={triggerHistory} />
          </Panel>
        )}

        {panels.institutional && (
          <Panel title="法人動向" icon="🏦" span={1}>
            <InstitutionalPanel data={instData} />
          </Panel>
        )}

      </div>
    </div>
  );
}
