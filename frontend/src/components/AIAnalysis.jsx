import { useState, useRef } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';

const ANALYSIS_TYPES = [
  { value: 'full',      label: '全面分析' },
  { value: 'buy',       label: '買入時機' },
  { value: 'sell',      label: '賣出時機' },
  { value: 'risk',      label: '風險評估' },
  { value: 'technical', label: '技術分析' },
];

export default function AIAnalysis() {
  const { taiex, quotes } = useStockStore();
  const [input, setInput] = useState('');
  const [analysisType, setAnalysisType] = useState('full');
  const [result, setResult] = useState('');
  const [marketResult, setMarketResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const abortRef = useRef(null);

  const runAnalysis = async () => {
    if (!input.trim() || loading) return;
    const parts = input.trim().split(/\s+/);
    const code = parts[0];
    const name = parts.slice(1).join(' ') || quotes[code]?.name || '';

    setLoading(true);
    setResult('');
    try {
      await api.analyzeStock(
        code, name, analysisType,
        (chunk) => setResult(prev => prev + chunk),
        () => setLoading(false),
      );
    } catch (err) {
      setResult(`分析失敗：${err.message}`);
      setLoading(false);
    }
  };

  const getMarketAnalysis = async () => {
    if (marketLoading) return;
    setMarketLoading(true);
    setMarketResult('');
    try {
      const breadth = await api.getBreadth();
      await api.analyzeMarket(
        taiex, breadth,
        (chunk) => setMarketResult(prev => prev + chunk),
        () => setMarketLoading(false),
      );
    } catch (err) {
      setMarketResult(`分析失敗：${err.message}`);
      setMarketLoading(false);
    }
  };

  const card = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 14, marginBottom: 12 };
  const resultBox = { background: '#f9fafb', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.8, minHeight: 80, whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' };

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>🤖 AI 個股分析</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runAnalysis()}
            placeholder="輸入代號 或 代號+名稱（例：2330 台積電）"
            style={{ flex: 1, minWidth: 180, padding: '7px 10px', border: '0.5px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
          />
          <select
            value={analysisType}
            onChange={e => setAnalysisType(e.target.value)}
            style={{ padding: '7px 10px', border: '0.5px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
          >
            {ANALYSIS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button
            onClick={runAnalysis}
            disabled={loading}
            style={{ padding: '7px 16px', background: loading ? '#9ca3af' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}
          >
            {loading ? '分析中...' : '分析 ↗'}
          </button>
        </div>
        <div style={{ ...resultBox, marginTop: 12 }}>
          {result || <span style={{ color: '#9ca3af' }}>輸入股票代號，按 Enter 或點擊「分析」</span>}
          {loading && <span style={{ color: '#6b7280' }}>▋</span>}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>📊 今日大盤 AI 解讀</div>
        {taiex && (
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
            大盤現值：{taiex.value.toLocaleString()} ({taiex.changePercent >= 0 ? '+' : ''}{taiex.changePercent}%)
          </div>
        )}
        <button
          onClick={getMarketAnalysis}
          disabled={marketLoading}
          style={{ padding: '7px 14px', background: marketLoading ? '#9ca3af' : 'transparent', color: marketLoading ? '#fff' : 'var(--color-text-primary)', border: '0.5px solid #d1d5db', borderRadius: 8, cursor: marketLoading ? 'not-allowed' : 'pointer', fontSize: 13, marginBottom: 10 }}
        >
          {marketLoading ? '解讀中...' : '🤖 取得今日大盤解讀 ↗'}
        </button>
        <div style={resultBox}>
          {marketResult || <span style={{ color: '#9ca3af' }}>點擊上方按鈕取得今日大盤 AI 解讀</span>}
          {marketLoading && <span style={{ color: '#6b7280' }}>▋</span>}
        </div>
      </div>
    </div>
  );
}
