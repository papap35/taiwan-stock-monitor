import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';
import {
  COMPARE_PERIODS, MAX_COMPARE, COMPARE_COLORS, COMPARE_STORAGE_KEY,
  normalizeSeries, mergeSeries,
} from '../utils/compareChart';

const ls = {
  get: (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
};

const fmtDate = (time) => {
  const d = new Date(time * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const TAIEX_KEY = 'TAIEX';
const TAIEX_COLOR = '#94a3b8';

export default function StockCompare() {
  const { watchlist } = useStockStore();
  const [selected, setSelected] = useState(() => ls.get(COMPARE_STORAGE_KEY, []));
  const [period, setPeriod] = useState('3M');
  const [includeTaiex, setIncludeTaiex] = useState(() => ls.get('compare_include_taiex', false));
  const [seriesMap, setSeriesMap] = useState({});
  const [hidden, setHidden] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 去重後的自選股清單（依 code）
  const stocks = useMemo(() => {
    const seen = new Set();
    return watchlist.filter(w => {
      if (seen.has(w.code)) return false;
      seen.add(w.code);
      return true;
    });
  }, [watchlist]);

  const toggleSelect = (code) => {
    setSelected(prev => {
      let next;
      if (prev.includes(code)) {
        next = prev.filter(c => c !== code);
      } else {
        if (prev.length >= MAX_COMPARE) return prev;
        next = [...prev, code];
      }
      ls.set(COMPARE_STORAGE_KEY, next);
      return next;
    });
  };

  const toggleLegend = (code) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const toggleTaiex = () => {
    setIncludeTaiex(prev => {
      ls.set('compare_include_taiex', !prev);
      return !prev;
    });
  };

  useEffect(() => {
    if (selected.length === 0 && !includeTaiex) { setSeriesMap({}); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const months = COMPARE_PERIODS[period];
    const stockRequests = selected.map(code =>
      api.getHistory(code, months)
        .then(res => [code, normalizeSeries(res.candles)])
        .catch(() => [code, []]),
    );
    const taiexRequest = includeTaiex
      ? api.getTaiexHistory(months)
          .then(res => [TAIEX_KEY, normalizeSeries(res.candles)])
          .catch(() => [TAIEX_KEY, []])
      : null;
    Promise.all(taiexRequest ? [...stockRequests, taiexRequest] : stockRequests)
      .then(entries => {
        if (cancelled) return;
        setSeriesMap(Object.fromEntries(entries));
      }).catch(e => { if (!cancelled) setError(e.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, period, includeTaiex]);

  const chartData = useMemo(() => mergeSeries(seriesMap), [seriesMap]);

  const nameOf = (code) => code === TAIEX_KEY ? '大盤 TAIEX' : (stocks.find(s => s.code === code)?.name || code);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            多股同列比較（漲跌幅 %）
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
            從自選股勾選最多 {MAX_COMPARE} 檔，以「期初 = 0%」比較相對強弱
          </div>
        </div>

        {/* 選股區 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px' }}>
          {/* 大盤 TAIEX 勾選項 */}
          <button onClick={toggleTaiex}
            style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              border: `1px solid ${includeTaiex ? TAIEX_COLOR : 'var(--color-border-tertiary)'}`,
              background: includeTaiex ? 'rgba(148,163,184,.15)' : 'transparent',
              color: includeTaiex ? TAIEX_COLOR : 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}>
            大盤 TAIEX
          </button>
          <div style={{ width: 1, background: 'var(--color-border-tertiary)', margin: '0 2px' }} />
          {stocks.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>尚無自選股，請先到「自選股」頁加入股票</div>
          )}
          {stocks.map(s => {
            const isSelected = selected.includes(s.code);
            const disabled = !isSelected && selected.length >= MAX_COMPARE;
            return (
              <button key={s.code} onClick={() => !disabled && toggleSelect(s.code)} disabled={disabled}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${isSelected ? 'var(--color-brand)' : 'var(--color-border-tertiary)'}`,
                  background: isSelected ? 'rgba(59,130,246,.15)' : 'transparent',
                  color: isSelected ? 'var(--color-brand)' : disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? .5 : 1,
                }}>
                {s.name} ({s.code})
              </button>
            );
          })}
        </div>

        {/* 區間切換 */}
        <div style={{ display: 'flex', gap: 4, padding: '0 14px 10px' }}>
          {Object.keys(COMPARE_PERIODS).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{
                padding: '3px 10px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                border: `1px solid ${period === p ? 'var(--color-brand)' : 'var(--color-border-tertiary)'}`,
                background: period === p ? 'rgba(59,130,246,.15)' : 'transparent',
                color: period === p ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 圖表區 */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 10, height: 420 }}>
        {selected.length === 0 && !includeTaiex ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
            請先勾選要比較的股票
          </div>
        ) : loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
            載入中...
          </div>
        ) : error ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
            {error}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
              <XAxis dataKey="time" tickFormatter={fmtDate} tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} width={45} />
              <ReferenceLine y={0} stroke="var(--color-border-tertiary)" />
              <Tooltip
                labelFormatter={fmtDate}
                formatter={(value, code) => [`${value}%`, nameOf(code)]}
                contentStyle={{ background: '#1e2d40', border: '1px solid #1a2535', borderRadius: 4, fontSize: 11 }}
              />
              <Legend
                onClick={(e) => toggleLegend(e.dataKey)}
                formatter={(value) => nameOf(value)}
                wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
              />
              {selected.map((code, i) => (
                <Line key={code} type="monotone" dataKey={code}
                  stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                  strokeWidth={1.5} dot={false} connectNulls
                  hide={hidden.has(code)}
                  activeDot={{ r: 3 }}
                />
              ))}
              {includeTaiex && (
                <Line key={TAIEX_KEY} type="monotone" dataKey={TAIEX_KEY}
                  stroke={TAIEX_COLOR} strokeWidth={1.5} strokeDasharray="4 2"
                  dot={false} connectNulls hide={hidden.has(TAIEX_KEY)}
                  activeDot={{ r: 3 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
