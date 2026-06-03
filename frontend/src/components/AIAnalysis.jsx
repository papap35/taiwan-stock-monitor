import { useState, useRef } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';

const ANALYSIS_TYPES = [
  { value: 'full',      label: '全面分析', desc: '綜合評估股票現狀' },
  { value: 'buy',       label: '買入時機', desc: '判斷進場時機' },
  { value: 'sell',      label: '賣出時機', desc: '判斷出場時機' },
  { value: 'risk',      label: '風險評估', desc: '分析下行風險' },
  { value: 'technical', label: '技術分析', desc: '技術指標解讀' },
];

// 簡易 Markdown 渲染
function MarkdownResult({ text }) {
  if (!text) return null;
  return (
    <div style={{ lineHeight: 1.9 }}>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <div key={i} style={{
              fontSize: 14, fontWeight: 700, color: 'var(--color-brand)',
              marginTop: 14, marginBottom: 4, borderLeft: '2px solid var(--color-brand)',
              paddingLeft: 8,
            }}>{line.slice(3)}</div>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <div key={i} style={{
              fontSize: 15, fontWeight: 800, color: '#e2e8f0',
              marginTop: 14, marginBottom: 6,
            }}>{line.slice(2)}</div>
          );
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return (
            <div key={i} style={{ fontWeight: 700, color: '#e2e8f0', marginTop: 6 }}>
              {line.slice(2, -2)}
            </div>
          );
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 4, color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-brand)', flexShrink: 0, marginTop: 2 }}>▸</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
        return <div key={i} style={{ color: 'var(--color-text-secondary)' }}>{line}</div>;
      })}
    </div>
  );
}

export default function AIAnalysis() {
  const { taiex, quotes, watchlist } = useStockStore();
  const [input, setInput] = useState('');
  const [analysisType, setAnalysisType] = useState('full');
  const [result, setResult] = useState('');
  const [marketResult, setMarketResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState('stock'); // 'stock' | 'market'
  const resultRef = useRef(null);

  const runAnalysis = async () => {
    if (!input.trim() || loading) return;
    const parts = input.trim().split(/\s+/);
    const code = parts[0];
    const name = parts.slice(1).join(' ') || quotes[code]?.name || '';
    setLoading(true);
    setResult('');
    setActiveResultTab('stock');
    try {
      await api.analyzeStock(
        code, name, analysisType,
        (chunk) => {
          setResult(prev => prev + chunk);
          if (resultRef.current) resultRef.current.scrollTop = resultRef.current.scrollHeight;
        },
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
    setActiveResultTab('market');
    try {
      const breadth = await api.getBreadth();
      await api.analyzeMarket(
        taiex, breadth,
        (chunk) => {
          setMarketResult(prev => prev + chunk);
          if (resultRef.current) resultRef.current.scrollTop = resultRef.current.scrollHeight;
        },
        () => setMarketLoading(false),
      );
    } catch (err) {
      setMarketResult(`分析失敗：${err.message}`);
      setMarketLoading(false);
    }
  };

  const quickAnalyze = (code, name) => {
    setInput(`${code} ${name}`);
    setAnalysisType('full');
  };

  const activeResult = activeResultTab === 'stock' ? result : marketResult;
  const isLoading = activeResultTab === 'stock' ? loading : marketLoading;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 10, alignItems: 'start' }}>

      {/* 左側：控制面板 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* 個股分析 */}
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
          <div className="section-label">個股 AI 分析</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runAnalysis()}
              placeholder="輸入代號（例：2330 台積電）"
              style={{
                padding: '8px 10px',
                border: '1px solid var(--color-border-secondary)',
                borderRadius: 6,
                background: 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)',
                fontSize: 13,
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {ANALYSIS_TYPES.map(t => (
                <button key={t.value} onClick={() => setAnalysisType(t.value)}
                  style={{
                    padding: '6px 8px', borderRadius: 4,
                    border: `1px solid ${analysisType === t.value ? 'var(--color-brand)' : 'var(--color-border-secondary)'}`,
                    background: analysisType === t.value ? 'rgba(59,130,246,.12)' : 'transparent',
                    color: analysisType === t.value ? 'var(--color-brand)' : 'var(--color-text-secondary)',
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    transition: 'all .15s', textAlign: 'left',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={runAnalysis} disabled={loading || !input.trim()}
              style={{
                padding: '8px 14px',
                background: loading ? 'rgba(59,130,246,.3)' : 'var(--color-brand)',
                color: '#fff', border: 'none', borderRadius: 6,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
                transition: 'background .15s',
              }}>
              {loading ? '分析中... ▋' : '開始分析 →'}
            </button>
          </div>
        </div>

        {/* 大盤解讀 */}
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
          <div className="section-label">今日大盤解讀</div>
          {taiex && (
            <div style={{
              background: 'var(--color-background-secondary)',
              borderRadius: 6, padding: '8px 10px', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>TAIEX</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14,
                color: taiex.changePercent >= 0 ? '#ff4d4f' : '#00c48c',
              }}>
                {taiex.value.toLocaleString()}
                <span style={{ fontSize: 11, marginLeft: 6, opacity: .8 }}>
                  {taiex.changePercent >= 0 ? '+' : ''}{taiex.changePercent}%
                </span>
              </span>
            </div>
          )}
          <button onClick={getMarketAnalysis} disabled={marketLoading}
            style={{
              width: '100%', padding: '8px 14px',
              background: 'transparent',
              color: marketLoading ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
              border: '1px solid var(--color-border-secondary)',
              borderRadius: 6, cursor: marketLoading ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 500,
              transition: 'all .15s',
            }}
            onMouseEnter={e => !marketLoading && (e.target.style.borderColor = 'var(--color-brand)')}
            onMouseLeave={e => e.target.style.borderColor = 'var(--color-border-secondary)'}
          >
            {marketLoading ? '解讀中... ▋' : '◆ 取得今日大盤 AI 解讀'}
          </button>
        </div>

        {/* 自選股快速分析 */}
        {watchlist.length > 0 && (
          <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
            <div className="section-label">自選股快速分析</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {watchlist.slice(0, 8).map(w => (
                <button key={w.code} onClick={() => quickAnalyze(w.code, w.name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', borderRadius: 4,
                    border: '1px solid var(--color-border-tertiary)',
                    background: 'transparent', cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{w.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{w.code} →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 右側：結果顯示 */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
        {/* Tab */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
        }}>
          {[
            { k: 'stock',  label: '個股分析', hasContent: !!result },
            { k: 'market', label: '大盤解讀', hasContent: !!marketResult },
          ].map(tab => (
            <button key={tab.k} onClick={() => setActiveResultTab(tab.k)} style={{
              padding: '9px 16px', border: 'none', background: 'transparent',
              borderBottom: activeResultTab === tab.k ? '2px solid var(--color-brand)' : '2px solid transparent',
              color: activeResultTab === tab.k ? '#e2e8f0' : 'var(--color-text-tertiary)',
              fontSize: 12, fontWeight: activeResultTab === tab.k ? 600 : 400,
              cursor: 'pointer', marginBottom: -1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {tab.label}
              {tab.hasContent && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-brand)', display: 'inline-block' }} />
              )}
            </button>
          ))}
        </div>

        {/* 結果區 */}
        <div ref={resultRef} style={{
          padding: 16, minHeight: 400, maxHeight: '60vh', overflowY: 'auto',
          fontSize: 13,
        }}>
          {activeResult ? (
            <>
              <MarkdownResult text={activeResult} />
              {isLoading && (
                <span className="cursor" style={{ color: 'var(--color-brand)', marginLeft: 2 }}>▋</span>
              )}
            </>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: 360, color: 'var(--color-text-tertiary)', gap: 10,
            }}>
              <div style={{ fontSize: 32, opacity: .2 }}>◆</div>
              <div style={{ fontSize: 13 }}>
                {activeResultTab === 'stock'
                  ? '輸入股票代號，選擇分析類型後按下分析'
                  : '點擊左側「取得今日大盤 AI 解讀」'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
