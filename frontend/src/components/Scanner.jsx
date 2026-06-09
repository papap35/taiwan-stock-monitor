import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { useStockStore } from '../stores/stockStore';
import { SCAN_CONDITIONS, checkConditions, filterPassed } from '../utils/scanner';

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
  const [selected, setSelected]     = useState(new Set());
  const [scanning, setScanning]     = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [results, setResults]       = useState(null);   // null=未跑, []|[...]=已跑
  const [showAllResults, setShowAllResults] = useState(false);

  // 解析輸入框的股票代號（支援空格、逗號、換行分隔）
  const parsedCodes = [...new Set(
    inputText.split(/[\s,，\n]+/).map(s => s.trim()).filter(s => /^\d{4,6}$/.test(s))
  )];

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

  const passedResults = results ? filterPassed(results) : [];
  const displayResults = showAllResults ? results : passedResults;

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

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

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
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showAllResults} onChange={e => setShowAllResults(e.target.checked)} style={{ accentColor: 'var(--color-brand)' }} />
                  顯示所有（含未符合）
                </label>
              </div>

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
      </div>
    </div>
  );
}
