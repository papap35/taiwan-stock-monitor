import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { api } from '../services/api';
import { useStockStore } from '../stores/stockStore';
import {
  calcBollingerBands, calcVolumeMA, calcVolumeRatio, aggregateCandles,
} from '../utils/portfolio';

// ── 技術指標計算 ────────────────────────────────────────
function calcMA(candles, period) {
  return candles.map((c, i) => {
    if (i < period - 1) return null;
    const avg = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.close, 0) / period;
    return { time: c.time, value: +avg.toFixed(2) };
  }).filter(Boolean);
}

function calcKD(candles, period = 9) {
  let K = 50, D = 50;
  return candles.map((c, i) => {
    const slice = candles.slice(Math.max(0, i - period + 1), i + 1);
    const hh = Math.max(...slice.map(x => x.high));
    const ll = Math.min(...slice.map(x => x.low));
    const rsv = hh === ll ? 50 : (c.close - ll) / (hh - ll) * 100;
    K = 2 / 3 * K + 1 / 3 * rsv;
    D = 2 / 3 * D + 1 / 3 * K;
    return { time: c.time, k: +K.toFixed(2), d: +D.toFixed(2) };
  });
}

function calcRSI(candles, period = 14) {
  const result = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < candles.length; i++) {
    const chg = candles[i].close - candles[i - 1].close;
    const gain = chg > 0 ? chg : 0;
    const loss = chg < 0 ? -chg : 0;
    if (i < period) { avgGain += gain / period; avgLoss += loss / period; continue; }
    if (i === period) { avgGain += gain / period; avgLoss += loss / period; }
    else { avgGain = (avgGain * (period - 1) + gain) / period; avgLoss = (avgLoss * (period - 1) + loss) / period; }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: candles[i].time, value: +(100 - 100 / (1 + rs)).toFixed(2) });
  }
  return result;
}

function calcEMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  return values.map((v, i) => { if (i === 0) return ema; ema = v * k + ema * (1 - k); return ema; });
}

function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
  const closes = candles.map(c => c.close);
  const ema12 = calcEMA(closes, fast);
  const ema26 = calcEMA(closes, slow);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const sigLine = calcEMA(macdLine.slice(slow - 1), signal);
  const result = [];
  for (let i = slow - 1; i < candles.length; i++) {
    const si = i - (slow - 1);
    const m = macdLine[i];
    const s = si < signal - 1 ? null : sigLine[si - (signal - 1)];
    result.push({ time: candles[i].time, macd: +m.toFixed(4), signal: s !== null ? +s.toFixed(4) : null, hist: s !== null ? +(m - s).toFixed(4) : null });
  }
  return result;
}

// ── 共用 Chart Config ───────────────────────────────────
const CHART_OPTS = (height) => ({
  layout: { background: { color: '#0f1923' }, textColor: '#64748b', fontFamily: "'Fira Code', Consolas, monospace", fontSize: 10 },
  grid: { vertLines: { color: 'rgba(255,255,255,.04)' }, horzLines: { color: 'rgba(255,255,255,.04)' } },
  crosshair: { vertLine: { color: 'rgba(255,255,255,.15)', labelBackgroundColor: '#1e2d40' }, horzLine: { color: 'rgba(255,255,255,.15)', labelBackgroundColor: '#1e2d40' } },
  rightPriceScale: { borderColor: 'rgba(255,255,255,.06)', textColor: '#64748b' },
  timeScale: { borderColor: 'rgba(255,255,255,.06)', timeVisible: true, tickMarkFormatter: (t) => { const d = new Date(t * 1000); return `${d.getMonth() + 1}/${d.getDate()}`; } },
  height,
  handleScroll: { mouseWheel: true, pressedMouseMove: true },
  handleScale: { mouseWheel: true, pinch: true },
});

const PERIODS = [{ label: '1M', months: 1 }, { label: '3M', months: 3 }, { label: '6M', months: 6 }, { label: '1Y', months: 12 }];
const INDICATORS = ['OFF', 'KD', 'RSI', 'MACD'];
const MAIN_TABS = ['K線', '法人籌碼', '融資融券', '基本面'];
const CHART_PERIODS = [
  { key: 'D', label: '日K' },
  { key: 'W', label: '週K' },
  { key: 'M', label: '月K' },
];

const fmtN = n => n == null ? '—' : n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
const fmtColor = n => n > 0 ? '#ff4d4f' : n < 0 ? '#00c48c' : '#64748b';

const MA_DEFS = [
  { key: 'ma5',   period: 5,   label: 'MA5',   color: '#e2e8f0' },
  { key: 'ma10',  period: 10,  label: 'MA10',  color: '#facc15' },
  { key: 'ma20',  period: 20,  label: 'MA20',  color: '#f97316' },
  { key: 'ma60',  period: 60,  label: 'MA60',  color: '#8b5cf6' },
  { key: 'ma120', period: 120, label: 'MA120', color: '#3b82f6' },
  { key: 'ma240', period: 240, label: 'MA240', color: '#ef4444' },
];

export default function StockChart({ stock, onClose }) {
  const mainRef = useRef(null);
  const subRef = useRef(null);
  const mainChartRef = useRef(null);
  const subChartRef = useRef(null);

  const [candles, setCandles] = useState([]);
  const [instData, setInstData] = useState([]);
  const [marginData, setMarginData] = useState([]);
  const [valuation, setValuation] = useState(null);
  const [months, setMonths] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMA, setShowMA] = useState({ ma5: true, ma10: false, ma20: true, ma60: false, ma120: false, ma240: false });
  const [showBB, setShowBB] = useState(false);
  const [indicator, setIndicator] = useState('KD');
  const [mainTab, setMainTab] = useState('K線');
  const [chartPeriod, setChartPeriod] = useState('D'); // 'D' | 'W' | 'M'
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiText, setAiText]           = useState('');
  const aiAbortRef = useRef(null);

  const { quotes } = useStockStore();
  const q = quotes[stock.code];
  const price = q?.price ?? stock.price;
  const chgPct = q?.changePercent ?? stock.changePercent ?? 0;
  const chgColor = chgPct > 0 ? '#ff4d4f' : chgPct < 0 ? '#00c48c' : '#64748b';

  // ── 根據週期聚合 K 線 ────────────────────────────────
  const displayCandles = useMemo(() => {
    if (!candles.length) return candles;
    if (chartPeriod === 'W') return aggregateCandles(candles, 'weekly');
    if (chartPeriod === 'M') return aggregateCandles(candles, 'monthly');
    return candles;
  }, [candles, chartPeriod]);

  // ── 資料載入 ────────────────────────────────────────
  const loadAll = useCallback(async (m) => {
    setLoading(true); setError('');
    try {
      const [kRes, instRes, marginRes, valRes] = await Promise.allSettled([
        api.getHistory(stock.code, m),
        api.getInstitutional(stock.code, m),
        api.getMargin(stock.code, m),
        api.getStockValuation(stock.code),
      ]);
      if (kRes.status === 'fulfilled') setCandles(kRes.value.candles || []);
      else setError(`K線資料載入失敗：${kRes.reason?.message}`);
      if (instRes.status === 'fulfilled') setInstData(instRes.value.data || []);
      if (marginRes.status === 'fulfilled') setMarginData(marginRes.value.data || []);
      if (valRes.status === 'fulfilled') setValuation(valRes.value.data || null);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [stock.code]);

  useEffect(() => { loadAll(months); }, [months, loadAll]);

  // ── 主 K 線圖 ─────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current || displayCandles.length === 0 || mainTab !== 'K線') return;
    if (mainChartRef.current) { mainChartRef.current.remove(); mainChartRef.current = null; }

    const chart = createChart(mainRef.current, CHART_OPTS(indicator === 'OFF' ? 340 : 240));
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.02, bottom: 0.22 } });

    // 蠟燭
    const cs = chart.addSeries(CandlestickSeries, { upColor: '#ff4d4f', downColor: '#00c48c', borderUpColor: '#ff4d4f', borderDownColor: '#00c48c', wickUpColor: '#ff4d4f', wickDownColor: '#00c48c' });
    cs.setData(displayCandles);

    // 成交量均線（先算，供量柱放量判斷）
    const volMa5  = calcVolumeMA(displayCandles, 5);
    const volMa20 = calcVolumeMA(displayCandles, 20);
    // 建立 time → ma5 查詢 map
    const ma5Map = Object.fromEntries(volMa5.map(x => [x.time, x.value]));

    // 成交量（放量 > MA5×1.5 → 鮮豔；縮量 → 半透明）
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(displayCandles.map(c => {
      const ma5v = ma5Map[c.time];
      const isUp = c.close >= c.open;
      const isHigh = ma5v != null && c.volume > ma5v * 1.5;  // 放量
      const isLow  = ma5v != null && c.volume < ma5v * 0.5;  // 縮量
      const alpha = isHigh ? '.85' : isLow ? '.2' : '.4';
      return { time: c.time, value: c.volume, color: isUp ? `rgba(255,77,79,${alpha})` : `rgba(0,196,140,${alpha})` };
    }));
    if (volMa5.length) {
      const vma5 = chart.addSeries(LineSeries, { color: 'rgba(245,158,11,.6)', lineWidth: 1, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      vma5.setData(volMa5.map(x => ({ time: x.time, value: x.value })));
    }
    if (volMa20.length) {
      const vma20 = chart.addSeries(LineSeries, { color: 'rgba(59,130,246,.6)', lineWidth: 1, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      vma20.setData(volMa20.map(x => ({ time: x.time, value: x.value })));
    }

    // MA 線（MA5=白 MA10=黃 MA20=橘 MA60=紫 MA120=藍 MA240=紅）
    const maColors  = { ma5: '#e2e8f0', ma10: '#facc15', ma20: '#f97316', ma60: '#8b5cf6', ma120: '#3b82f6', ma240: '#ef4444' };
    const maPeriods = { ma5: 5, ma10: 10, ma20: 20, ma60: 60, ma120: 120, ma240: 240 };
    Object.entries(showMA).forEach(([key, on]) => {
      if (!on) return;
      const d = calcMA(displayCandles, maPeriods[key]);
      if (!d.length) return;
      const s = chart.addSeries(LineSeries, { color: maColors[key], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(d);
    });

    // 布林通道（P1-4）
    if (showBB && displayCandles.length >= 20) {
      const bb = calcBollingerBands(displayCandles, 20, 2);
      const bbOpts = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      const upperS = chart.addSeries(LineSeries, { ...bbOpts, color: 'rgba(168,85,247,.5)', lineStyle: 2 });
      upperS.setData(bb.map(x => ({ time: x.time, value: x.upper })));
      const midS   = chart.addSeries(LineSeries, { ...bbOpts, color: 'rgba(168,85,247,.3)', lineStyle: 3 });
      midS.setData(bb.map(x => ({ time: x.time, value: x.mid })));
      const lowerS = chart.addSeries(LineSeries, { ...bbOpts, color: 'rgba(168,85,247,.5)', lineStyle: 2 });
      lowerS.setData(bb.map(x => ({ time: x.time, value: x.lower })));
    }

    chart.timeScale().fitContent();
    mainChartRef.current = chart;

    const ro = new ResizeObserver(() => mainChartRef.current?.applyOptions({ width: mainRef.current?.clientWidth }));
    ro.observe(mainRef.current);
    return () => { ro.disconnect(); mainChartRef.current?.remove(); mainChartRef.current = null; };
  }, [displayCandles, showMA, showBB, indicator, mainTab]);

  // ── 副圖（KD / RSI / MACD）────────────────────────
  useEffect(() => {
    if (!subRef.current || displayCandles.length === 0 || indicator === 'OFF' || mainTab !== 'K線') {
      if (subChartRef.current) { subChartRef.current.remove(); subChartRef.current = null; }
      return;
    }
    if (subChartRef.current) { subChartRef.current.remove(); subChartRef.current = null; }

    const chart = createChart(subRef.current, { ...CHART_OPTS(100), timeScale: { visible: false } });

    if (indicator === 'KD') {
      const kd = calcKD(displayCandles);
      const kS = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      const dS = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      kS.setData(kd.map(x => ({ time: x.time, value: x.k })));
      dS.setData(kd.map(x => ({ time: x.time, value: x.d })));
      // 超買/超賣線
      const refSeries = chart.addSeries(LineSeries, { color: 'rgba(255,255,255,.1)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      refSeries.setData(kd.map(x => ({ time: x.time, value: 80 })));
      const refSeries2 = chart.addSeries(LineSeries, { color: 'rgba(255,255,255,.1)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      refSeries2.setData(kd.map(x => ({ time: x.time, value: 20 })));
    }

    if (indicator === 'RSI') {
      const rsi = calcRSI(displayCandles);
      const s = chart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
      s.setData(rsi);
      const r70 = chart.addSeries(LineSeries, { color: 'rgba(255,77,79,.25)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      r70.setData(rsi.map(x => ({ time: x.time, value: 70 })));
      const r30 = chart.addSeries(LineSeries, { color: 'rgba(0,196,140,.25)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      r30.setData(rsi.map(x => ({ time: x.time, value: 30 })));
    }

    if (indicator === 'MACD') {
      const macd = calcMACD(displayCandles);
      const histS = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      histS.setData(macd.filter(x => x.hist != null).map(x => ({ time: x.time, value: x.hist, color: x.hist >= 0 ? 'rgba(255,77,79,.7)' : 'rgba(0,196,140,.7)' })));
      const macdS = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      macdS.setData(macd.map(x => ({ time: x.time, value: x.macd })));
      const sigS = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      sigS.setData(macd.filter(x => x.signal != null).map(x => ({ time: x.time, value: x.signal })));
    }

    chart.timeScale().fitContent();
    subChartRef.current = chart;

    // 同步十字線與時間軸
    if (mainChartRef.current) {
      mainChartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => {
        subChartRef.current?.timeScale().setVisibleLogicalRange(range);
      });
    }

    const ro = new ResizeObserver(() => subChartRef.current?.applyOptions({ width: subRef.current?.clientWidth }));
    ro.observe(subRef.current);
    return () => { ro.disconnect(); subChartRef.current?.remove(); subChartRef.current = null; };
  }, [displayCandles, indicator, mainTab]);

  // ESC 關閉
  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // ── 統計摘要 ──────────────────────────────────────
  const stats = displayCandles.length > 0 ? (() => {
    const last  = displayCandles[displayCandles.length - 1];
    const high  = Math.max(...displayCandles.map(c => c.high));
    const low   = Math.min(...displayCandles.map(c => c.low));
    // 計算所有啟用 MA 的當前值
    const maValues = {};
    MA_DEFS.forEach(({ key, period }) => {
      if (showMA[key] && displayCandles.length >= period) {
        maValues[key] = +(displayCandles.slice(-period).reduce((s, c) => s + c.close, 0) / period).toFixed(2);
      }
    });
    const volRatio = calcVolumeRatio(displayCandles, 5);
    const bb = (showBB && displayCandles.length >= 20) ? calcBollingerBands(displayCandles, 20, 2) : null;
    const latestBB = bb?.length ? bb[bb.length - 1] : null;
    return { last, high, low, maValues, volRatio, latestBB };
  })() : null;

  // ── AI 型態辨識 ───────────────────────────────────
  const runAIPattern = useCallback(async () => {
    if (aiLoading || displayCandles.length === 0) return;
    setAiLoading(true);
    setAiText('');
    setShowAIPanel(true);

    // 收集當前技術指標值
    const maValues = {};
    MA_DEFS.forEach(({ key, period }) => {
      if (showMA[key] && displayCandles.length >= period) {
        maValues[key] = +(displayCandles.slice(-period).reduce((s, c) => s + c.close, 0) / period).toFixed(2);
      }
    });
    const vr = calcVolumeRatio(displayCandles, 5);
    const indicators = {
      ...maValues,
      ...(vr != null ? { 量比: vr } : {}),
    };
    if (showBB && displayCandles.length >= 20) {
      const bb = calcBollingerBands(displayCandles, 20, 2);
      if (bb.length) {
        const lb = bb[bb.length - 1];
        indicators['BB上軌'] = lb.upper;
        indicators['BB下軌'] = lb.lower;
        indicators['BB帶寬%'] = lb.bandwidth;
      }
    }

    try {
      await api.analyzePattern(
        stock.code,
        stock.name,
        displayCandles,
        indicators,
        (chunk) => setAiText(t => t + chunk),
        () => setAiLoading(false),
      );
    } catch {
      setAiText('⚠️ 分析失敗，請確認後端 API Key 是否設定。');
      setAiLoading(false);
    }
  }, [aiLoading, displayCandles, showMA, showBB, stock.code, stock.name]);

  // ── 最新法人資料 ───────────────────────────────────
  const latestInst = instData.length > 0 ? instData[instData.length - 1] : null;
  const latestMargin = marginData.length > 0 ? marginData[marginData.length - 1] : null;
  const prevMargin = marginData.length > 1 ? marginData[marginData.length - 2] : null;
  const shortratio = latestMargin && latestMargin.marginBal > 0
    ? +((latestMargin.shortBal / latestMargin.marginBal) * 100).toFixed(1) : null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#0f1923', border: '1px solid #1e2d40', borderRadius: 10, width: '100%', maxWidth: showAIPanel ? 1260 : 960, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.8)', transition: 'max-width .25s ease' }} className="fade-in">

        {/* ── 標題列 ───────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #1a2535', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{stock.name}</span>
              <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)' }}>{stock.code}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 1 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: chgColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                {price?.toFixed(price >= 100 ? 1 : 2)}
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: chgColor, fontWeight: 600 }}>
                {chgPct > 0 ? '▲' : chgPct < 0 ? '▼' : '—'} {Math.abs(chgPct).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* 資料期間 */}
          <div style={{ display: 'flex', gap: 3 }}>
            {PERIODS.map(p => (
              <button key={p.months} onClick={() => setMonths(p.months)} style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600, border: `1px solid ${months === p.months ? 'var(--color-brand)' : '#1e2d40'}`, background: months === p.months ? 'rgba(59,130,246,.15)' : 'transparent', color: months === p.months ? 'var(--color-brand)' : '#64748b', cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* 週期切換（日K / 週K / 月K） */}
          {mainTab === 'K線' && (
            <div style={{ display: 'flex', gap: 2, borderLeft: '1px solid #1e2d40', paddingLeft: 8 }}>
              {CHART_PERIODS.map(p => (
                <button key={p.key} onClick={() => setChartPeriod(p.key)} style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600, border: `1px solid ${chartPeriod === p.key ? '#a78bfa' : '#1e2d40'}`, background: chartPeriod === p.key ? 'rgba(167,139,250,.15)' : 'transparent', color: chartPeriod === p.key ? '#a78bfa' : '#64748b', cursor: 'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* MA 開關 + BB 開關（只在K線tab顯示） */}
          {mainTab === 'K線' && (
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {MA_DEFS.map(({ key, label, color }) => (
                <button key={key} onClick={() => setShowMA(p => ({ ...p, [key]: !p[key] }))}
                  style={{ padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${showMA[key] ? color : '#1e2d40'}`,
                    background: showMA[key] ? `${color}22` : 'transparent',
                    color: showMA[key] ? color : '#475569',
                    cursor: 'pointer',
                    textDecoration: showMA[key] ? 'none' : 'line-through',
                    opacity: showMA[key] ? 1 : .5 }}>
                  {label}
                </button>
              ))}
              <button onClick={() => setShowBB(p => !p)}
                style={{ padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  border: `1px solid ${showBB ? '#a78bfa' : '#1e2d40'}`,
                  background: showBB ? 'rgba(167,139,250,.15)' : 'transparent',
                  color: showBB ? '#a78bfa' : '#475569',
                  cursor: 'pointer', opacity: showBB ? 1 : .5 }}>
                BB
              </button>
              <div style={{ width: 1, height: 14, background: '#1e2d40', margin: '0 2px' }} />
              <button
                onClick={showAIPanel ? () => setShowAIPanel(false) : runAIPattern}
                disabled={aiLoading}
                style={{ padding: '2px 9px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  border: `1px solid ${showAIPanel ? '#0ea5e9' : '#1e2d40'}`,
                  background: showAIPanel ? 'rgba(14,165,233,.15)' : 'transparent',
                  color: showAIPanel ? '#0ea5e9' : '#475569',
                  cursor: aiLoading ? 'wait' : 'pointer',
                  opacity: aiLoading ? .7 : 1,
                  display: 'flex', alignItems: 'center', gap: 3 }}>
                {aiLoading ? '⏳' : '🤖'} AI 型態
              </button>
            </div>
          )}

          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #1e2d40', background: 'transparent', color: '#64748b', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* ── 統計摘要列 ───── */}
        {stats && (
          <div style={{ display: 'flex', borderBottom: '1px solid #1a2535', flexShrink: 0 }}>
            {[
              { label: `${months}M高`, val: stats.high?.toFixed(stats.high >= 100 ? 1 : 2), color: '#ff4d4f' },
              { label: `${months}M低`, val: stats.low?.toFixed(stats.low >= 100 ? 1 : 2),  color: '#00c48c' },
              ...MA_DEFS.filter(m => stats.maValues[m.key] != null).map(m => ({
                label: m.label,
                val: stats.maValues[m.key],
                color: m.color,
                sub: price > stats.maValues[m.key] ? '站上' : '跌破',
              })),
              ...(stats.volRatio != null ? [{ label: '量比', val: stats.volRatio.toFixed(2), color: stats.volRatio > 2 ? '#ff4d4f' : stats.volRatio < 0.5 ? '#00c48c' : '#94a3b8', sub: stats.volRatio > 2 ? '放量' : stats.volRatio < 0.5 ? '縮量' : '量平' }] : []),
              ...(stats.latestBB ? [{ label: 'BB 寬', val: `${stats.latestBB.bandwidth.toFixed(1)}%`, color: '#a78bfa', sub: `上${stats.latestBB.upper} 下${stats.latestBB.lower}` }] : []),
              ...(latestInst ? [
                { label: '外資(張)', val: fmtN(Math.round(latestInst.fiNet / 1000)), color: fmtColor(latestInst.fiNet), sub: '近1日' },
                { label: '投信(張)', val: fmtN(Math.round(latestInst.itNet / 1000)), color: fmtColor(latestInst.itNet), sub: '近1日' },
              ] : []),
              ...(latestMargin ? [
                { label: '融資餘額', val: `${latestMargin.marginBal?.toLocaleString()}張`, color: '#94a3b8', sub: shortratio != null ? `券資比${shortratio}%` : '' },
              ] : []),
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, padding: '6px 12px', borderRight: '1px solid #1a2535' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#475569', marginBottom: 1 }}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.val ?? '—'}</div>
                {s.sub && <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* ── 主 Tab 列 ──────  */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1a2535', background: '#0d1520', flexShrink: 0 }}>
          {MAIN_TABS.map(t => (
            <button key={t} onClick={() => setMainTab(t)} style={{ padding: '7px 16px', border: 'none', background: 'transparent', borderBottom: mainTab === t ? '2px solid var(--color-brand)' : '2px solid transparent', color: mainTab === t ? '#e2e8f0' : '#475569', fontSize: 12, fontWeight: mainTab === t ? 600 : 400, cursor: 'pointer', marginBottom: -1 }}>
              {t}
            </button>
          ))}
          {/* 指標切換（K線tab才顯示） */}
          {mainTab === 'K線' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', paddingRight: 10 }}>
              {INDICATORS.map(ind => (
                <button key={ind} onClick={() => setIndicator(ind)} style={{ padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600, border: `1px solid ${indicator === ind ? 'var(--color-brand)' : '#1e2d40'}`, background: indicator === ind ? 'rgba(59,130,246,.15)' : 'transparent', color: indicator === ind ? 'var(--color-brand)' : '#475569', cursor: 'pointer' }}>
                  {ind}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 內容區 ─────────── */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 320 }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1923', zIndex: 2, flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: '#475569' }}>載入 {stock.name} 資料中...</div>
              <div style={{ width: 100, height: 2, background: '#1e2d40', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--color-brand)', animation: 'ticker-scroll 1.2s linear infinite', width: '45%' }} />
              </div>
            </div>
          )}
          {error && !loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#475569' }}>{error}</div>
              <button onClick={() => loadAll(months)} className="btn btn-sm">重試</button>
            </div>
          )}

          {/* K 線 Tab */}
          {mainTab === 'K線' && (
            <div style={{ display: 'flex', height: '100%' }}>
              {/* 圖表區 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                <div ref={mainRef} style={{ flex: 1 }} />
                {indicator !== 'OFF' && (
                  <>
                    <div style={{ height: 1, background: '#1a2535', flexShrink: 0 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px', background: '#0d1520', flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '.06em' }}>{indicator}</span>
                      {indicator === 'KD' && <><span style={{ fontSize: 9, color: '#f59e0b' }}>● K</span><span style={{ fontSize: 9, color: '#3b82f6' }}>● D</span><span style={{ fontSize: 9, color: '#475569' }}>超買80 / 超賣20</span></>}
                      {indicator === 'RSI' && <><span style={{ fontSize: 9, color: '#a78bfa' }}>● RSI(14)</span><span style={{ fontSize: 9, color: '#475569' }}>超買70 / 超賣30</span></>}
                      {indicator === 'MACD' && <><span style={{ fontSize: 9, color: '#3b82f6' }}>● MACD(12,26)</span><span style={{ fontSize: 9, color: '#f59e0b' }}>● Signal(9)</span></>}
                    </div>
                    <div ref={subRef} style={{ height: 100, flexShrink: 0 }} />
                  </>
                )}
              </div>

              {/* AI 型態分析面板 */}
              {showAIPanel && (
                <div style={{
                  width: 300, flexShrink: 0,
                  borderLeft: '1px solid #1a2535',
                  background: '#0a1018',
                  display: 'flex', flexDirection: 'column',
                  overflow: 'hidden',
                  minHeight: 0,
                  height: '100%',
                }}>
                  {/* 面板標題 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #1a2535', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9', flex: 1 }}>🤖 AI 型態分析</span>
                    {aiLoading && (
                      <span style={{ fontSize: 9, color: '#475569' }}>分析中...</span>
                    )}
                    {!aiLoading && aiText && (
                      <button
                        onClick={runAIPattern}
                        style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: '1px solid #1e2d40', background: 'transparent', color: '#475569', cursor: 'pointer' }}>
                        重新分析
                      </button>
                    )}
                    <button
                      onClick={() => setShowAIPanel(false)}
                      style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid #1e2d40', background: 'transparent', color: '#475569', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      ×
                    </button>
                  </div>

                  {/* 分析內容 */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                    {!aiText && aiLoading && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 20 }}>
                        {[100, 85, 92, 70].map((w, i) => (
                          <div key={i} style={{ height: 8, borderRadius: 4, background: '#1e2d40', width: `${w}%`, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    )}
                    {aiText && (
                      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                        {/* 把 **粗體** 語法渲染出來 */}
                        {aiText.split(/(\*\*[^*]+\*\*)/).map((seg, i) =>
                          seg.startsWith('**') && seg.endsWith('**')
                            ? <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{seg.slice(2, -2)}</strong>
                            : <span key={i}>{seg}</span>
                        )}
                        {aiLoading && <span style={{ display: 'inline-block', width: 6, height: 12, background: '#0ea5e9', marginLeft: 2, animation: 'pulse 1s ease-in-out infinite', verticalAlign: 'middle' }} />}
                      </div>
                    )}
                  </div>

                  {/* 說明 */}
                  <div style={{ padding: '6px 12px', borderTop: '1px solid #1a2535', flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: '#334155', lineHeight: 1.5 }}>
                      以最近 {Math.min(displayCandles.length, 60)} 根 {chartPeriod === 'D' ? '日' : chartPeriod === 'W' ? '週' : '月'}K 為依據<br />
                      分析僅供參考，不構成投資建議
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 法人籌碼 Tab */}
          {mainTab === '法人籌碼' && (
            <InstitutionalPanel data={instData} loading={loading} />
          )}

          {/* 融資融券 Tab */}
          {mainTab === '融資融券' && (
            <MarginPanel data={marginData} loading={loading} />
          )}

          {/* 基本面 Tab */}
          {mainTab === '基本面' && (
            <FundamentalPanel valuation={valuation} price={price} loading={loading} />
          )}
        </div>

        {/* ── 底部說明 ─────── */}
        <div style={{ padding: '4px 12px', borderTop: '1px solid #1a2535', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: '#334155' }}>資料來源：TWSE・日K・{candles.length} 根蠟燭</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: '#334155' }}>ESC 關閉</span>
        </div>
      </div>
    </div>
  );
}

// ── 法人籌碼子面板 ──────────────────────────────────────
function InstitutionalPanel({ data, loading }) {
  if (loading) return <LoadingPlaceholder />;
  if (!data.length) return <EmptyPlaceholder text="無法人資料" />;

  const last30 = data.slice(-30);

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { label: '外資近期累計', val: data.slice(-10).reduce((s, r) => s + r.fiNet, 0), unit: '股' },
          { label: '投信近期累計', val: data.slice(-10).reduce((s, r) => s + r.itNet, 0), unit: '股' },
          { label: '自營商近期累計', val: data.slice(-10).reduce((s, r) => s + r.dealerNet, 0), unit: '股' },
        ].map((item, i) => (
          <div key={i} style={{ background: '#161f2e', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: fmtColor(item.val) }}>{fmtN(Math.round(item.val / 1000))} 張</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>每日明細（近 {last30.length} 個交易日）</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[...last30].reverse().map((row, i) => {
          const d = new Date(row.time * 1000);
          const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
          const maxAbs = Math.max(...last30.map(r => Math.abs(r.totalNet)), 1);
          const barW = Math.min(Math.abs(row.totalNet) / maxAbs * 100, 100);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 80px 80px 80px 1fr', gap: 6, alignItems: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-mono)' }}>{dateStr}</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: fmtColor(row.fiNet), textAlign: 'right' }}>{fmtN(Math.round(row.fiNet / 1000))}</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: fmtColor(row.itNet), textAlign: 'right' }}>{fmtN(Math.round(row.itNet / 1000))}</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: fmtColor(row.totalNet), fontWeight: 700, textAlign: 'right' }}>{fmtN(Math.round(row.totalNet / 1000))}</span>
              <div style={{ height: 4, background: '#1e2d40', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${barW}%`, height: '100%', background: row.totalNet > 0 ? '#ff4d4f' : '#00c48c', borderRadius: 2, float: row.totalNet < 0 ? 'right' : 'left' }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: 9, color: '#334155' }}>
        <span>外資 (張)</span><span>投信 (張)</span><span>三大合計 (張)</span>
      </div>
    </div>
  );
}

// ── 融資融券子面板 ─────────────────────────────────────
function MarginPanel({ data, loading }) {
  if (loading) return <LoadingPlaceholder />;
  if (!data.length) return <EmptyPlaceholder text="無融資融券資料" />;

  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const marginChg = prev ? last.marginBal - prev.marginBal : 0;
  const shortChg  = prev ? last.shortBal - prev.shortBal : 0;
  const shortratio = last.marginBal > 0 ? +((last.shortBal / last.marginBal) * 100).toFixed(1) : 0;

  const last30 = data.slice(-30);
  const maxMargin = Math.max(...last30.map(r => r.marginBal), 1);
  const maxShort  = Math.max(...last30.map(r => r.shortBal), 1);

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: '融資餘額', val: `${last.marginBal?.toLocaleString()} 張`, sub: `${marginChg >= 0 ? '+' : ''}${marginChg.toLocaleString()} 張`, color: marginChg > 0 ? '#ff4d4f' : '#00c48c' },
          { label: '融券餘額', val: `${last.shortBal?.toLocaleString()} 張`,  sub: `${shortChg >= 0 ? '+' : ''}${shortChg.toLocaleString()} 張`,  color: shortChg > 0 ? '#ff4d4f' : '#00c48c' },
          { label: '券資比',   val: `${shortratio}%`, sub: shortratio > 15 ? '偏高（空方壓力）' : shortratio < 5 ? '偏低' : '正常', color: shortratio > 15 ? '#f59e0b' : '#94a3b8' },
          { label: '資料日期', val: (() => { const d = new Date(last.time * 1000); return `${d.getMonth()+1}/${d.getDate()}`; })(), sub: `共 ${data.length} 筆`, color: '#94a3b8' },
        ].map((item, i) => (
          <div key={i} style={{ background: '#161f2e', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: item.color }}>{item.val}</div>
            <div style={{ fontSize: 9, color: item.color, marginTop: 2, opacity: .8 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>趨勢（近 {last30.length} 個交易日）</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[...last30].reverse().map((row, i) => {
          const d = new Date(row.time * 1000);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 10px 1fr', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)' }}>{(d.getMonth()+1)}/{d.getDate()}</span>
              {/* 融資 bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ flex: 1, height: 5, background: '#1e2d40', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(row.marginBal / maxMargin) * 100}%`, height: '100%', background: 'rgba(255,77,79,.6)', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'var(--font-mono)', width: 52, textAlign: 'right' }}>{row.marginBal?.toLocaleString()}</span>
              </div>
              <span style={{ fontSize: 8, color: '#334155', textAlign: 'center' }}>|</span>
              {/* 融券 bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ flex: 1, height: 5, background: '#1e2d40', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(row.shortBal / maxShort) * 100}%`, height: '100%', background: 'rgba(0,196,140,.6)', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'var(--font-mono)', width: 40, textAlign: 'right' }}>{row.shortBal?.toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 9, color: '#334155' }}>
        <span style={{ color: 'rgba(255,77,79,.7)' }}>■ 融資餘額 (張)</span>
        <span style={{ color: 'rgba(0,196,140,.7)' }}>■ 融券餘額 (張)</span>
      </div>
    </div>
  );
}

// ── 基本面子面板 ───────────────────────────────────────
function FundamentalPanel({ valuation: v, price, loading }) {
  if (loading) return <LoadingPlaceholder />;
  if (!v) return <EmptyPlaceholder text="無基本面資料（ETF 或新上市股票可能無資料）" />;

  // 本益比合理性判斷
  const peJudge = !v.pe ? '—'
    : v.pe < 10  ? { label: '偏低', color: '#00c48c', tip: '可能被低估或景氣循環低點' }
    : v.pe < 20  ? { label: '合理', color: '#f59e0b', tip: '一般成長股合理範圍' }
    : v.pe < 30  ? { label: '偏高', color: '#f87171', tip: '市場給予較高成長預期' }
    : v.pe < 50  ? { label: '昂貴', color: '#ff4d4f', tip: '高成長股或市場泡沫訊號' }
    : { label: '極高', color: '#ff4d4f', tip: '本益比過高，風險較大' };

  const pbJudge = !v.pb ? '—'
    : v.pb < 1   ? { label: '低於淨值', color: '#00c48c', tip: '股價低於每股淨資產' }
    : v.pb < 2   ? { label: '合理',     color: '#f59e0b', tip: '' }
    : v.pb < 5   ? { label: '偏高',     color: '#f87171', tip: '' }
    : { label: '極高', color: '#ff4d4f', tip: '' };

  const yieldJudge = !v.yield ? '—'
    : v.yield >= 5  ? { label: '高殖利率', color: '#00c48c', tip: '適合存股' }
    : v.yield >= 3  ? { label: '中等',     color: '#f59e0b', tip: '' }
    : { label: '偏低', color: '#64748b', tip: '' };

  const cards = [
    {
      label: '本益比 P/E',
      value: v.pe ? v.pe.toFixed(2) : '—',
      unit: '倍',
      judge: peJudge,
      desc: '股價 / 每股盈餘（EPS）',
      color: '#3b82f6',
    },
    {
      label: '殖利率',
      value: v.yield ? v.yield.toFixed(2) : '—',
      unit: '%',
      judge: yieldJudge,
      desc: `股利年度 ${v.divYear ? `民國 ${v.divYear} 年` : '—'}`,
      color: '#10b981',
    },
    {
      label: '股價淨值比 P/B',
      value: v.pb ? v.pb.toFixed(2) : '—',
      unit: '倍',
      judge: pbJudge,
      desc: '股價 / 每股淨資產',
      color: '#8b5cf6',
    },
    {
      label: '財報週期',
      value: v.period || '—',
      unit: '',
      judge: null,
      desc: '最新財報年/季',
      color: '#f59e0b',
    },
  ];

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      {/* KPI 卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 16 }}>
        {cards.map((card, i) => (
          <div key={i} style={{ background: '#161f2e', border: `1px solid ${card.color}25`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#475569', marginBottom: 6 }}>
              {card.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: card.color, lineHeight: 1 }}>
                {card.value}
              </span>
              {card.unit && <span style={{ fontSize: 12, color: '#64748b' }}>{card.unit}</span>}
            </div>
            {card.judge && typeof card.judge === 'object' && (
              <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: `${card.judge.color}18`, color: card.judge.color, marginBottom: 4 }}>
                {card.judge.label}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#475569' }}>{card.desc}</div>
            {card.judge?.tip && <div style={{ fontSize: 10, color: '#334155', marginTop: 2, fontStyle: 'italic' }}>{card.judge.tip}</div>}
          </div>
        ))}
      </div>

      {/* 說明區 */}
      <div style={{ background: '#0d1520', borderRadius: 6, padding: '12px 14px', fontSize: 11, color: '#475569', lineHeight: 1.9 }}>
        <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 6, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>資料說明</div>
        <div>📊 資料來源：TWSE BWIBBU_d（每日盤後更新）</div>
        <div>📅 財報週期：{v.period || '—'}（採用最新公告財報）</div>
        <div>⚠️ 本益比 0 = 虧損股或 ETF，無法計算</div>
        <div style={{ marginTop: 8, padding: '6px 10px', background: '#161f2e', borderRadius: 4, color: '#94a3b8' }}>
          💡 本益比僅供參考，需結合產業特性、成長率（PEG）及市場環境綜合判斷
        </div>
      </div>
    </div>
  );
}

function LoadingPlaceholder() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#475569', fontSize: 12 }}>載入中...</div>;
}
function EmptyPlaceholder({ text }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8 }}><div style={{ fontSize: 20, opacity: .2 }}>◈</div><div style={{ fontSize: 12, color: '#475569' }}>{text}</div></div>;
}
