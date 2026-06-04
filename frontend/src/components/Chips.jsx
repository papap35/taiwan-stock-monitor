import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useStockStore } from '../stores/stockStore';
import StockChart from './StockChart';

const RANK_TABS = [
  { key: 'fiNet',    label: '外資買超', color: '#ff4d4f' },
  { key: 'fiNetS',   label: '外資賣超', color: '#00c48c' },
  { key: 'itNet',    label: '投信買超', color: '#3b82f6' },
  { key: 'itNetS',   label: '投信賣超', color: '#8b5cf6' },
  { key: 'totalNet', label: '三大合計', color: '#f59e0b' },
];

const fmtN = n => n == null ? '—' : n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
const fmtColor = n => n > 0 ? '#ff4d4f' : n < 0 ? '#00c48c' : '#64748b';
const toK = n => Math.round(n / 1000); // 股→張

export default function Chips() {
  const { quotes } = useStockStore();
  const [instAll, setInstAll] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rankTab, setRankTab] = useState('fiNet');
  const [chartStock, setChartStock] = useState(null);
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

  // 載入今日三大法人排行
  const loadInst = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getMarketInstitutional();
      setInstAll(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadInst(); }, [loadInst]);

  // 個股搜尋
  const doSearch = async () => {
    if (!searchCode.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const [instRes, marginRes] = await Promise.allSettled([
        api.getInstitutional(searchCode.trim(), 1),
        api.getMargin(searchCode.trim(), 1),
      ]);
      setSearchResult({
        code: searchCode.trim(),
        name: quotes[searchCode.trim()]?.name || searchCode.trim(),
        inst: instRes.status === 'fulfilled' ? instRes.value.data : [],
        margin: marginRes.status === 'fulfilled' ? marginRes.value.data : [],
      });
    } catch (e) { console.error(e); }
    setSearching(false);
  };

  // 排行榜資料
  const ranked = instAll?.stocks ? (() => {
    const stocks = [...instAll.stocks];
    if (rankTab === 'fiNet')    return stocks.sort((a, b) => b.fiNet - a.fiNet).slice(0, 20);
    if (rankTab === 'fiNetS')   return stocks.sort((a, b) => a.fiNet - b.fiNet).slice(0, 20);
    if (rankTab === 'itNet')    return stocks.sort((a, b) => b.itNet - a.itNet).slice(0, 20);
    if (rankTab === 'itNetS')   return stocks.sort((a, b) => a.itNet - b.itNet).slice(0, 20);
    if (rankTab === 'totalNet') return stocks.sort((a, b) => b.totalNet - a.totalNet).slice(0, 20);
    return [];
  })() : [];

  const curTab = RANK_TABS.find(t => t.key === rankTab);
  const valKey = rankTab.replace('S', '');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 10, alignItems: 'start' }}>
      {chartStock && <StockChart stock={chartStock} onClose={() => setChartStock(null)} />}

      {/* ── 左：三大法人排行 ───────────────────────── */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
        {/* 標題 + Tab */}
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
          <div style={{ padding: '8px 14px', flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
              三大法人今日排行
            </div>
            {instAll?.date && (
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                {instAll.date.slice(0,4)}/{instAll.date.slice(4,6)}/{instAll.date.slice(6,8)}・{instAll.stocks?.length ?? 0} 檔
              </div>
            )}
          </div>
          <button onClick={loadInst} style={{ padding: '6px 10px', background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }} title="重新載入">↻</button>
        </div>

        {/* Tab 選擇 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-tertiary)', background: '#0d1520' }}>
          {RANK_TABS.map(t => (
            <button key={t.key} onClick={() => setRankTab(t.key)} style={{
              flex: 1, padding: '7px 4px', border: 'none', background: 'transparent',
              borderBottom: rankTab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
              color: rankTab === t.key ? t.color : 'var(--color-text-tertiary)',
              fontSize: 10, fontWeight: rankTab === t.key ? 700 : 400, cursor: 'pointer',
              marginBottom: -1, whiteSpace: 'nowrap',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 排行列表 */}
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>載入中...</div>
        ) : ranked.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
            <div style={{ fontSize: 20, opacity: .2, marginBottom: 8 }}>◈</div>
            暫無資料（非交易時段或資料更新中）
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-background-secondary)' }}>
                {['#', '代號 / 名稱', '現價', curTab?.label, '外資', '投信', '自營'].map((h, i) => (
                  <th key={i} style={{ padding: '6px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', textAlign: i <= 1 ? 'left' : 'right', borderBottom: '1px solid var(--color-border-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
                <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border-tertiary)', width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, idx) => {
                const q = quotes[s.code];
                const chgPct = q?.changePercent ?? 0;
                const qColor = chgPct > 0 ? '#ff4d4f' : chgPct < 0 ? '#00c48c' : '#64748b';
                const mainVal = s[valKey] ?? 0;
                const maxVal = Math.max(...ranked.map(r => Math.abs(r[valKey] ?? 0)), 1);
                const barW = Math.min(Math.abs(mainVal) / maxVal * 100, 100);

                return (
                  <tr key={s.code} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '7px 8px', fontSize: 9, color: 'var(--color-text-tertiary)', textAlign: 'center', opacity: .5 }}>{idx + 1}</td>
                    <td style={{ padding: '7px 8px' }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{s.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{s.code}</span>
                        <div style={{ flex: 1, height: 3, background: 'var(--color-background-tertiary)', borderRadius: 1, overflow: 'hidden', maxWidth: 60 }}>
                          <div style={{ width: `${barW}%`, height: '100%', background: curTab?.color, borderRadius: 1 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: qColor }}>
                      {q ? q.price.toFixed(q.price >= 100 ? 1 : 2) : '—'}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, color: fmtColor(mainVal) }}>
                      {fmtN(toK(mainVal))}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: fmtColor(s.fiNet) }}>
                      {fmtN(toK(s.fiNet))}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: fmtColor(s.itNet) }}>
                      {fmtN(toK(s.itNet))}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: fmtColor(s.dealerNet) }}>
                      {fmtN(toK(s.dealerNet))}
                    </td>
                    <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                      <button onClick={() => setChartStock({ code: s.code, name: s.name, price: q?.price, changePercent: q?.changePercent })}
                        style={{ padding: '2px 6px', borderRadius: 3, fontSize: 10, border: '1px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', transition: 'all .15s' }}
                        onMouseEnter={e => { e.target.style.borderColor = 'var(--color-brand)'; e.target.style.color = 'var(--color-brand)'; }}
                        onMouseLeave={e => { e.target.style.borderColor = 'var(--color-border-secondary)'; e.target.style.color = 'var(--color-text-tertiary)'; }}>
                        K線
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 右：個股籌碼快查 ─────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* 搜尋框 */}
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
          <div className="section-label">個股籌碼快查</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={searchCode} onChange={e => setSearchCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="輸入股票代號（例：2330）"
              style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--color-border-secondary)', borderRadius: 6, background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 13 }}
            />
            <button onClick={doSearch} disabled={searching || !searchCode.trim()} className="btn btn-primary" style={{ minWidth: 56 }}>
              {searching ? '查詢中' : '查詢'}
            </button>
          </div>
        </div>

        {/* 搜尋結果 */}
        {searchResult && (
          <>
            {/* 最新法人 */}
            <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="section-label" style={{ marginBottom: 0 }}>
                  {searchResult.name} {searchResult.code} 法人
                </div>
                <button onClick={() => setChartStock({ code: searchResult.code, name: searchResult.name, price: quotes[searchResult.code]?.price, changePercent: quotes[searchResult.code]?.changePercent })}
                  style={{ padding: '2px 8px', fontSize: 10, border: '1px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--color-text-tertiary)', borderRadius: 4, cursor: 'pointer' }}
                  onMouseEnter={e => { e.target.style.borderColor = 'var(--color-brand)'; e.target.style.color = 'var(--color-brand)'; }}
                  onMouseLeave={e => { e.target.style.borderColor = 'var(--color-border-secondary)'; e.target.style.color = 'var(--color-text-tertiary)'; }}>
                  K線圖 →
                </button>
              </div>
              {searchResult.inst.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 12 }}>無法人資料</div>
              ) : (() => {
                const recent = searchResult.inst.slice(-5).reverse();
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr', gap: 4, fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', marginBottom: 2 }}>
                      <span>日期</span><span style={{ textAlign: 'right' }}>外資</span><span style={{ textAlign: 'right' }}>投信</span><span style={{ textAlign: 'right' }}>合計</span>
                    </div>
                    {recent.map((row, i) => {
                      const d = new Date(row.time * 1000);
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr', gap: 4, fontSize: 10, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                          <span style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{(d.getMonth()+1)}/{d.getDate()}</span>
                          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: fmtColor(row.fiNet), fontWeight: 600 }}>{fmtN(toK(row.fiNet))}</span>
                          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: fmtColor(row.itNet), fontWeight: 600 }}>{fmtN(toK(row.itNet))}</span>
                          <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: fmtColor(row.totalNet), fontWeight: 700 }}>{fmtN(toK(row.totalNet))}</span>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2 }}>單位：張</div>
                  </div>
                );
              })()}
            </div>

            {/* 最新融資融券 */}
            <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
              <div className="section-label">融資融券</div>
              {searchResult.margin.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 12 }}>無融資融券資料</div>
              ) : (() => {
                const last = searchResult.margin[searchResult.margin.length - 1];
                const prev = searchResult.margin.length > 1 ? searchResult.margin[searchResult.margin.length - 2] : null;
                const mChg = prev ? last.marginBal - prev.marginBal : 0;
                const sChg = prev ? last.shortBal - prev.shortBal : 0;
                const sr = last.marginBal > 0 ? +((last.shortBal / last.marginBal) * 100).toFixed(1) : 0;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: '融資餘額', val: `${last.marginBal?.toLocaleString()} 張`, chg: mChg, color: 'rgba(255,77,79,.7)' },
                      { label: '融券餘額', val: `${last.shortBal?.toLocaleString()} 張`,  chg: sChg, color: 'rgba(0,196,140,.7)' },
                      { label: '券資比',   val: `${sr}%`, chg: null, color: sr > 15 ? '#f59e0b' : '#94a3b8' },
                    ].map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 3, height: 14, borderRadius: 2, background: item.color }} />
                          <span style={{ fontSize: 12 }}>{item.label}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: item.color }}>{item.val}</div>
                          {item.chg != null && <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: fmtColor(item.chg) }}>{fmtN(item.chg)} 張</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {/* 說明卡 */}
        {!searchResult && (
          <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
            <div className="section-label">資料說明</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.8 }}>
              <div>📊 <strong style={{ color: 'var(--color-text-secondary)' }}>三大法人排行</strong>：每日盤後 T86 報表，外資 / 投信 / 自營商買賣超前 20 名</div>
              <div>💰 <strong style={{ color: 'var(--color-text-secondary)' }}>個股法人歷史</strong>：BFIAUU 報表，每月一次 API 呼叫</div>
              <div>📈 <strong style={{ color: 'var(--color-text-secondary)' }}>融資融券</strong>：MARGIN_PURCHASE_SHORT_SALE，資料次日更新</div>
              <div style={{ marginTop: 4, padding: '6px 8px', background: 'var(--color-background-secondary)', borderRadius: 4 }}>
                資料來源：台灣證券交易所 TWSE Open API（完全免費）
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
