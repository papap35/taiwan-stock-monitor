import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { useStockStore } from '../stores/stockStore';
import { SCAN_CONDITIONS, checkConditions, filterPassed, BACKTESTABLE_CONDITIONS, runBacktest } from '../utils/scanner';
import { INDUSTRY_GROUPS } from '../utils/industryGroups';

const GROUP_ORDER = ['技術面', '籌碼面', '基本面', '量能'];

// 每次最多同時並發幾支股票（避免打爆 API）
const CONCURRENCY = 3;

async function batchRun(codes, fn, concurrency = CONCURRENCY) {
  const results = [];
  for (let i = 0; i < codes.length; i += concurrency) {
    const chunk = codes.slice(i, i + concurrency);
    const res = await Promise.all(chunk.map(fn));
    results.push(...res);
  }
  return results;
}

export default function Scanner() {
  const { addToWatchlist, watchlist } = useStockStore();

  const [inputText, setInputText]   = useState('');
  const [groupPick, setGroupPick]   = useState('');
  const [selected, setSelected]     = useState(new Set());
  const [scanning, setScanning]     = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [results, setResults]       = useState(null);   // null=未跑, []|[...]=已跑
  const [showAllResults, setShowAllResults] = useState(false);

  // ── 模式切換 ──────────────────────────────────────────────────
  const [mode, setMode] = useState('scan'); // 'scan' | 'compare'

  // ── 回測 ──────────────────────────────────────────────────────
  const [holdDays, setHoldDays]         = useState(5);
  const [backtestResults, setBacktestResults] = useState({}); // { [code]: { loading, error, ...stats } }

  // ── 策略比較 ──────────────────────────────────────────────────
  const STRATEGY_LABELS = ['策略 A', '策略 B', '策略 C'];
  const [strategies, setStrategies] = useState([new Set(), new Set()]);  // 2 or 3 slots
  const [compareHoldDays, setCompareHoldDays] = useState(5);
  const [compareRunning, setCompareRunning] = useState(false);
  const [compareProgress, setCompareProgress] = useState({ done: 0, total: 0 });
  const [compareResults, setCompareResults] = useState(null); // [{ code, name, stats: [statsA, statsB, ...] }]

  const toggleStrategyCondition = (slotIdx, id) => {
    setStrategies(prev => {
      const next = prev.map((s, i) => {
        if (i !== slotIdx) return s;
        const ns = new Set(s);
        ns.has(id) ? ns.delete(id) : ns.add(id);
        return ns;
      });
      return next;
    });
  };

  const addStrategySlot = () => {
    if (strategies.length < 3) setStrategies(prev => [...prev, new Set()]);
  };
  const removeStrategySlot = (idx) => {
    if (strategies.length > 2) setStrategies(prev => prev.filter((_, i) => i !== idx));
  };

  // 解析輸入框的股票代號（支援空格、逗號、換行分隔）
  const parsedCodes = [...new Set(
    inputText.split(/[\s,，\n]+/).map(s => s.trim()).filter(s => /^\d{4,6}$/.test(s))
  )];

  const runCompare = useCallback(async () => {
    if (parsedCodes.length === 0) return;
    const validStrategies = strategies.map(s =>
      [...s].filter(id => BACKTESTABLE_CONDITIONS.some(c => c.id === id))
    );
    if (validStrategies.every(ids => ids.length === 0)) return;

    setCompareRunning(true);
    setCompareResults(null);
    setCompareProgress({ done: 0, total: parsedCodes.length });

    // 抓股票名稱
    let nameMap = {};
    try {
      for (let i = 0; i < parsedCodes.length; i += 20) {
        const res = await api.getQuotes(parsedCodes.slice(i, i + 20));
        if (res?.quotes) Object.assign(nameMap, Object.fromEntries(Object.entries(res.quotes).map(([k, v]) => [k, v?.name || k])));
      }
    } catch { /* 繼續 */ }

    const rows = await batchRun(parsedCodes, async (code) => {
      let candles = [];
      try {
        const res = await api.getHistory(code, 6);
        candles = res?.candles || [];
      } catch { /* 無資料 */ }
      const stats = validStrategies.map(ids => runBacktest(candles, ids, { holdDays: compareHoldDays, lookbackDays: 20 }));
      setCompareProgress(p => ({ ...p, done: p.done + 1 }));
      return { code, name: nameMap[code] || code, stats };
    });

    // 排序：依策略 A 勝率降冪
    rows.sort((a, b) => (b.stats[0]?.winRate ?? -1) - (a.stats[0]?.winRate ?? -1));
    setCompareResults(rows);
    setCompareRunning(false);
  }, [parsedCodes, strategies, compareHoldDays]);

  const toggleCondition = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runScan = useCallback(async () => {
    if (parsedCodes.length === 0 || selected.size === 0) return;
    setScanning(true);
    setResults(null);
    setBacktestResults({});
    setProgress({ done: 0, total: parsedCodes.length });

    const conditionIds = [...selected];
    const needsCandles     = conditionIds.some(id => SCAN_CONDITIONS.find(c => c.id === id)?.needsCandles);
    const needsInst        = conditionIds.some(id => SCAN_CONDITIONS.find(c => c.id === id)?.needsInst);
    const needsMargin      = conditionIds.some(id => SCAN_CONDITIONS.find(c => c.id === id)?.needsMargin);
    const needsValuation   = conditionIds.some(id => SCAN_CONDITIONS.find(c => c.id === id)?.needsValuation);
    const needsQuote       = conditionIds.some(id => SCAN_CONDITIONS.find(c => c.id === id)?.needsQuote);

    // 批次抓報價（一次最多抓多支）
    let quoteMap = {};
    if (needsQuote || true) { // 總是抓報價以取得股票名稱
      try {
        const chunkSize = 20;
        for (let i = 0; i < parsedCodes.length; i += chunkSize) {
          const chunk = parsedCodes.slice(i, i + chunkSize);
          const res = await api.getQuotes(chunk);
          Object.assign(quoteMap, res);
        }
      } catch { /* 繼續掃描 */ }
    }

    const scanResults = await batchRun(parsedCodes, async (code) => {
      const [candlesRes, instRes, marginRes, valRes] = await Promise.allSettled([
        needsCandles   ? api.getHistory(code, 4)       : Promise.resolve(null),
        needsInst      ? api.getInstitutional(code, 1) : Promise.resolve(null),
        needsMargin    ? api.getMargin(code, 1)        : Promise.resolve(null),
        needsValuation ? api.getStockValuation(code)   : Promise.resolve(null),
      ]);

      const candles    = candlesRes.status    === 'fulfilled' ? (candlesRes.value?.candles    || []) : [];
      const inst       = instRes.status       === 'fulfilled' ? (instRes.value?.data          || []) : [];
      const margin     = marginRes.status     === 'fulfilled' ? (marginRes.value?.data        || []) : [];
      const valuation  = valRes.status        === 'fulfilled' ? (valRes.value?.data           || null) : null;
      const quote      = quoteMap[code] || null;
      const name       = quote?.name || quoteMap[code]?.name || code;

      const condResults = checkConditions({ quote, candles, inst, margin, valuation }, conditionIds);

      setProgress(p => ({ ...p, done: p.done + 1 }));

      return { code, name, results: condResults };
    });

    setResults(scanResults);
    setScanning(false);
  }, [parsedCodes, selected]);

  // 持有天數變更時，已執行的回測結果失效，需重新執行
  useEffect(() => {
    setBacktestResults({});
  }, [holdDays]);

  const passedResults = results ? filterPassed(results) : [];
  const displayResults = showAllResults ? results : passedResults;

  // 已選條件中可用於回測的條件
  const backtestConditionIds = [...selected].filter(id => BACKTESTABLE_CONDITIONS.some(c => c.id === id));

  const runBacktestForStock = useCallback(async (code) => {
    if (backtestConditionIds.length === 0) return;
    setBacktestResults(prev => ({ ...prev, [code]: { loading: true } }));
    try {
      const res = await api.getHistory(code, 6); // 6 個月日K，足夠近 1 個月回測 + 持有期
      const candles = res?.candles || [];
      const stats = runBacktest(candles, backtestConditionIds, { holdDays, lookbackDays: 20 });
      setBacktestResults(prev => ({ ...prev, [code]: { loading: false, ...stats } }));
    } catch (e) {
      setBacktestResults(prev => ({ ...prev, [code]: { loading: false, error: e.message } }));
    }
  }, [backtestConditionIds, holdDays]);

  const conditionGroups = GROUP_ORDER.map(group => ({
    group,
    conditions: SCAN_CONDITIONS.filter(c => c.group === group),
  }));

  const isInWatchlist = (code) => watchlist.some(w => w.code === code);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 頁首 ── */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🔎 條件選股掃描器</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          輸入股票代號清單，勾選篩選條件，AI 自動掃描符合的標的
        </div>
      </div>

      {/* ── 模式切換 ── */}
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border-tertiary)', alignSelf: 'flex-start' }}>
        {[['scan', '🔍 掃描模式'], ['compare', '⚖️ 策略比較']].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: mode === m ? 'var(--color-brand)' : 'transparent',
            color: mode === m ? '#fff' : 'var(--color-text-tertiary)',
          }}>{label}</button>
        ))}
      </div>

      {mode === 'scan' && <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* ── 左欄：條件選擇 ── */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {conditionGroups.map(({ group, conditions }) => (
            <div key={group} style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>{group}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {conditions.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleCondition(c.id)}
                      style={{ marginTop: 2, accentColor: 'var(--color-brand)', flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: selected.has(c.id) ? 600 : 400, color: selected.has(c.id) ? '#e2e8f0' : 'var(--color-text-secondary)' }}>{c.label}</div>
                      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{c.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* 快速選擇 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: '全選技術', ids: SCAN_CONDITIONS.filter(c => c.group === '技術面').map(c => c.id) },
              { label: '籌碼乾淨', ids: ['fi_buy_3d', 'it_buy', 'margin_decrease'] },
              { label: '價值股', ids: ['pe_low', 'yield_high', 'pb_low'] },
              { label: '清除', ids: [] },
            ].map(({ label, ids }) => (
              <button key={label} onClick={() => setSelected(new Set(ids))} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--color-border-tertiary)', background: 'transparent',
                color: 'var(--color-text-tertiary)',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* ── 右欄：代號輸入 + 結果 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

          {/* 代號輸入 */}
          <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '.07em', marginBottom: 8 }}>
              掃描代號清單（空格/逗號/換行分隔）
            </div>

            {/* 族群快速代入 */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>快速代入族群：</span>
              <select value={groupPick} onChange={e => setGroupPick(e.target.value)}
                style={{
                  flex: 1, minWidth: 160, padding: '4px 8px', fontSize: 11,
                  background: 'var(--color-background-secondary)',
                  border: '1px solid var(--color-border-tertiary)',
                  borderRadius: 4, color: 'var(--color-text-primary)', cursor: 'pointer',
                }}>
                <option value="">-- 選擇族群 --</option>
                {INDUSTRY_GROUPS.map(g => (
                  <option key={g.label} value={g.label}>{g.label}（{g.codes.length} 檔）</option>
                ))}
              </select>
              {groupPick && (() => {
                const codes = INDUSTRY_GROUPS.find(g => g.label === groupPick)?.codes ?? [];
                const codesStr = codes.join(' ');
                return (
                  <>
                    <button onClick={() => setInputText(codesStr)}
                      style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--color-brand)', background: 'rgba(59,130,246,.1)', color: 'var(--color-brand)' }}>
                      取代輸入
                    </button>
                    <button onClick={() => setInputText(prev => (prev.trim() ? prev.trim() + ' ' : '') + codesStr)}
                      style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--color-border-tertiary)', background: 'transparent', color: 'var(--color-text-secondary)' }}>
                      合併輸入
                    </button>
                  </>
                );
              })()}
            </div>

            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={'2330 2317 2454\n0050 0056\n2881 2882 2883 2884 2885'}
              style={{
                width: '100%', height: 90, background: '#0a1018',
                border: '1px solid var(--color-border-tertiary)', borderRadius: 6,
                color: '#e2e8f0', fontSize: 12, padding: '8px 10px', resize: 'vertical',
                fontFamily: 'var(--font-mono)', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                已解析 {parsedCodes.length} 支 · 已選 {selected.size} 個條件
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={runScan}
                disabled={scanning || parsedCodes.length === 0 || selected.size === 0}
                style={{
                  padding: '7px 20px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  border: '1px solid var(--color-brand)',
                  background: (scanning || parsedCodes.length === 0 || selected.size === 0)
                    ? 'transparent' : 'rgba(59,130,246,.15)',
                  color: (scanning || parsedCodes.length === 0 || selected.size === 0)
                    ? 'var(--color-text-tertiary)' : 'var(--color-brand)',
                  cursor: (scanning || parsedCodes.length === 0 || selected.size === 0) ? 'not-allowed' : 'pointer',
                }}
              >
                {scanning ? `掃描中… ${progress.done}/${progress.total}` : '🔍 開始掃描'}
              </button>
            </div>

            {/* 進度條 */}
            {scanning && (
              <div style={{ height: 3, background: '#1e2d40', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: 'var(--color-brand)',
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  transition: 'width .3s ease',
                }} />
              </div>
            )}
          </div>

          {/* 結果區 */}
          {results !== null && (
            <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
              {/* 結果 header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--color-border-tertiary)' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  掃描完成：{results.length} 支中 <span style={{ color: passedResults.length > 0 ? '#00c48c' : 'var(--color-text-tertiary)' }}>{passedResults.length} 支符合</span>
                </span>
                <div style={{ flex: 1 }} />
                {backtestConditionIds.length > 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    回測持有
                    <select value={holdDays} onChange={e => setHoldDays(parseInt(e.target.value))}
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#0a1018', border: '1px solid var(--color-border-tertiary)', color: '#e2e8f0' }}>
                      <option value={1}>1 日</option>
                      <option value={5}>5 日</option>
                      <option value={10}>10 日</option>
                    </select>
                  </label>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showAllResults} onChange={e => setShowAllResults(e.target.checked)} style={{ accentColor: 'var(--color-brand)' }} />
                  顯示所有（含未符合）
                </label>
              </div>

              {backtestConditionIds.length === 0 && (
                <div style={{ padding: '6px 14px', fontSize: 10, color: 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border-tertiary)' }}>
                  💡 回測僅支援技術面/量能條件（不含籌碼面、基本面、成交金額），請至少勾選一項以啟用回測
                </div>
              )}

              {/* 結果列表 */}
              {displayResults && displayResults.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#0d1520' }}>
                        <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--color-text-tertiary)', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', borderBottom: '1px solid var(--color-border-tertiary)' }}>股票</th>
                        {[...selected].map(id => {
                          const cond = SCAN_CONDITIONS.find(c => c.id === id);
                          return (
                            <th key={id} style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', borderBottom: '1px solid var(--color-border-tertiary)', minWidth: 80 }}>
                              {cond?.label.split('（')[0]}
                            </th>
                          );
                        })}
                        {backtestConditionIds.length > 0 && (
                          <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', borderBottom: '1px solid var(--color-border-tertiary)', minWidth: 160 }}>回測（近 1 個月）</th>
                        )}
                        <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontWeight: 600, fontSize: 10, borderBottom: '1px solid var(--color-border-tertiary)' }}>加入</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayResults.map((row, ri) => {
                        const allPass = row.results.every(r => r.pass);
                        return (
                          <tr key={row.code} style={{ borderBottom: '1px solid #1a2535', background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)', opacity: allPass ? 1 : 0.5 }}>
                            <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{row.name}</div>
                              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{row.code}</div>
                            </td>
                            {row.results.map(r => (
                              <td key={r.id} style={{ padding: '7px 10px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                  <span style={{ fontSize: 13 }}>{r.pass ? '✅' : '❌'}</span>
                                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{r.displayValue}</span>
                                </div>
                              </td>
                            ))}
                            {backtestConditionIds.length > 0 && (
                              <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                {(() => {
                                  const bt = backtestResults[row.code];
                                  if (!bt) {
                                    return (
                                      <button onClick={() => runBacktestForStock(row.code)}
                                        style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(100,116,139,.4)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                                        📊 執行回測
                                      </button>
                                    );
                                  }
                                  if (bt.loading) return <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>回測中…</span>;
                                  if (bt.error) return <span style={{ fontSize: 10, color: '#ef4444' }}>失敗：{bt.error}</span>;
                                  if (bt.selectedCount === 0) return <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>近 1 個月無選中紀錄</span>;
                                  const winColor = bt.winRate >= 50 ? '#00c48c' : '#ef4444';
                                  return (
                                    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                      <span>選中 {bt.selectedCount} 次 · 勝率 <span style={{ color: winColor }}>{bt.winRate.toFixed(0)}%</span></span>
                                      <span>平均報酬 {bt.avgReturn >= 0 ? '+' : ''}{bt.avgReturn.toFixed(2)}% · 回撤 {bt.maxDrawdown.toFixed(2)}%</span>
                                    </div>
                                  );
                                })()}
                              </td>
                            )}
                            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                              {isInWatchlist(row.code) ? (
                                <span style={{ fontSize: 10, color: '#64748b' }}>已加入</span>
                              ) : (
                                <button
                                  onClick={() => addToWatchlist({ code: row.code, name: row.name })}
                                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(59,130,246,.4)', background: 'transparent', color: 'var(--color-brand)', cursor: 'pointer' }}
                                >
                                  ＋ 加入
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                  {showAllResults ? '無掃描結果' : '沒有股票符合所有條件，可勾選「顯示所有」查看個別指標'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>}

      {/* ══ 策略比較模式 ══════════════════════════════════════════ */}
      {mode === 'compare' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 代號輸入（共用）+ 持有天數 */}
          <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '.07em', marginBottom: 8 }}>
              掃描代號清單（與掃描模式共用）
            </div>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={'2330 2317 2454\n0050 0056\n2881 2882 2883'}
              style={{ width: '100%', height: 70, background: '#0a1018', border: '1px solid var(--color-border-tertiary)', borderRadius: 6, color: '#e2e8f0', fontSize: 12, padding: '8px 10px', resize: 'vertical', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>已解析 {parsedCodes.length} 支</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                持有天數
                <select value={compareHoldDays} onChange={e => setCompareHoldDays(parseInt(e.target.value))}
                  style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#0a1018', border: '1px solid var(--color-border-tertiary)', color: '#e2e8f0' }}>
                  <option value={1}>1 日</option>
                  <option value={5}>5 日</option>
                  <option value={10}>10 日</option>
                </select>
              </label>
              <div style={{ flex: 1 }} />
              <button
                onClick={runCompare}
                disabled={compareRunning || parsedCodes.length === 0 || strategies.every(s => [...s].filter(id => BACKTESTABLE_CONDITIONS.some(c => c.id === id)).length === 0)}
                style={{
                  padding: '7px 20px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  border: '1px solid #8b5cf6', background: compareRunning ? 'transparent' : 'rgba(139,92,246,.15)',
                  color: compareRunning ? 'var(--color-text-tertiary)' : '#a78bfa',
                  cursor: compareRunning ? 'not-allowed' : 'pointer',
                }}>
                {compareRunning ? `比較中… ${compareProgress.done}/${compareProgress.total}` : '⚖️ 開始比較'}
              </button>
            </div>
            {compareRunning && (
              <div style={{ height: 3, background: '#1e2d40', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: '#8b5cf6', width: `${compareProgress.total ? (compareProgress.done / compareProgress.total) * 100 : 0}%`, transition: 'width .3s ease' }} />
              </div>
            )}
          </div>

          {/* 策略槽位 */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {strategies.map((slot, slotIdx) => (
              <div key={slotIdx} style={{ flex: 1, minWidth: 220, background: 'var(--color-background-card)', border: `1px solid ${slotIdx === 0 ? '#3b82f6' : slotIdx === 1 ? '#f59e0b' : '#8b5cf6'}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: slotIdx === 0 ? '#60a5fa' : slotIdx === 1 ? '#fbbf24' : '#a78bfa' }}>
                    {STRATEGY_LABELS[slotIdx]} <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>（{[...slot].filter(id => BACKTESTABLE_CONDITIONS.some(c => c.id === id)).length} 個可回測條件）</span>
                  </div>
                  {strategies.length > 2 && slotIdx === strategies.length - 1 && (
                    <button onClick={() => removeStrategySlot(slotIdx)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  )}
                </div>
                {BACKTESTABLE_CONDITIONS.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginBottom: 5 }}>
                    <input type="checkbox" checked={slot.has(c.id)} onChange={() => toggleStrategyCondition(slotIdx, c.id)}
                      style={{ accentColor: slotIdx === 0 ? '#3b82f6' : slotIdx === 1 ? '#f59e0b' : '#8b5cf6', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: slot.has(c.id) ? '#e2e8f0' : 'var(--color-text-tertiary)' }}>{c.label}</span>
                  </label>
                ))}
              </div>
            ))}
            {strategies.length < 3 && (
              <button onClick={addStrategySlot} style={{ minWidth: 80, height: 40, borderRadius: 8, border: '1px dashed var(--color-border-tertiary)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start', marginTop: 0 }}>
                ＋ 新增策略
              </button>
            )}
          </div>

          {/* 比較結果表 */}
          {compareResults !== null && (
            <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-tertiary)', fontSize: 12, fontWeight: 700 }}>
                比較結果：{compareResults.length} 支 · 持有 {compareHoldDays} 日 · 回測近 1 個月
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#0d1520' }}>
                      <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--color-text-tertiary)', fontWeight: 600, fontSize: 10, borderBottom: '1px solid var(--color-border-tertiary)', whiteSpace: 'nowrap' }}>股票</th>
                      {strategies.map((_, i) => (
                        <th key={i} style={{ padding: '6px 14px', textAlign: 'center', color: i === 0 ? '#60a5fa' : i === 1 ? '#fbbf24' : '#a78bfa', fontWeight: 700, fontSize: 10, borderBottom: '1px solid var(--color-border-tertiary)', minWidth: 140 }}>
                          {STRATEGY_LABELS[i]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareResults.map((row, ri) => (
                      <tr key={row.code} style={{ borderBottom: '1px solid #1a2535', background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                        <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{row.name}</div>
                          <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{row.code}</div>
                        </td>
                        {row.stats.map((st, i) => {
                          if (st.selectedCount === 0) return (
                            <td key={i} style={{ padding: '7px 14px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 10 }}>—</td>
                          );
                          const winColor = st.winRate >= 50 ? '#00c48c' : '#ef4444';
                          const retColor = st.avgReturn >= 0 ? '#ff4d4f' : '#00c48c';
                          // highlight best winRate across strategies
                          const allWinRates = row.stats.map(s => s.winRate);
                          const best = st.winRate === Math.max(...allWinRates) && row.stats.filter(s => s.winRate === st.winRate).length === 1;
                          return (
                            <td key={i} style={{ padding: '7px 14px', textAlign: 'center', background: best ? 'rgba(0,196,140,.05)' : undefined }}>
                              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span>選中 {st.selectedCount} 次{best ? ' ⭐' : ''}</span>
                                <span>勝率 <span style={{ color: winColor, fontWeight: 700 }}>{st.winRate.toFixed(0)}%</span></span>
                                <span>均報 <span style={{ color: retColor }}>{st.avgReturn >= 0 ? '+' : ''}{st.avgReturn.toFixed(2)}%</span> · 回撤 {st.maxDrawdown.toFixed(2)}%</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
