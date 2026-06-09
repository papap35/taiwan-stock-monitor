import { useState, useEffect } from 'react';
import { useStockStore } from '../stores/stockStore';
import DataManager from './DataManager';
import { api } from '../services/api';

const Row = ({ label, desc, children }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
  }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      {desc && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{desc}</div>}
    </div>
    {children}
  </div>
);

const sel = {
  padding: '5px 10px',
  border: '1px solid var(--color-border-secondary)',
  borderRadius: 6, fontSize: 12,
  background: 'var(--color-background-secondary)',
  color: 'var(--color-text-primary)',
};

export default function Settings() {
  const { settings, updateSettings, wsStatus, lastUpdated, alerts } = useStockStore();

  // ── LINE Notify 狀態 ──────────────────────────────────────────
  const [lineConfigured, setLineConfigured] = useState(false);
  const [lineToken, setLineToken]           = useState('');
  const [lineStatus, setLineStatus]         = useState(null); // null | 'testing' | 'ok' | 'error'
  const [lineMsg, setLineMsg]               = useState('');
  const [lineSaving, setLineSaving]         = useState(false);

  useEffect(() => {
    api.getLineTokenStatus().then(r => setLineConfigured(r.configured)).catch(() => {});
  }, []);

  const handleSaveToken = async () => {
    if (!lineToken.trim()) return;
    setLineSaving(true);
    try {
      await api.setLineToken(lineToken.trim());
      setLineConfigured(true);
      setLineToken('');
      setLineMsg('');
    } catch (e) {
      setLineMsg('儲存失敗：' + e.message);
    } finally {
      setLineSaving(false);
    }
  };

  const handleClearToken = async () => {
    await api.clearLineToken().catch(() => {});
    setLineConfigured(false);
    setLineMsg('');
  };

  // ── 自動簡報開關 ──────────────────────────────────────────────
  const [autoReport, setAutoReport] = useState({ preMarketEnabled: false, postMarketEnabled: false });

  useEffect(() => {
    api.getAutoReportSettings().then(r => setAutoReport(r)).catch(() => {});
  }, []);

  const toggleAutoReport = async (key) => {
    const next = { ...autoReport, [key]: !autoReport[key] };
    setAutoReport(next);
    await api.setAutoReportSettings(next).catch(() => {});
  };

  const handleTriggerReport = async (type) => {
    try {
      await api.triggerAutoReport(type);
      alert(`${type === 'pre' ? '盤前' : '盤後'}簡報已觸發，請查看 LINE！`);
    } catch (e) {
      alert('觸發失敗：' + e.message);
    }
  };

  const handleTestLine = async () => {
    setLineStatus('testing');
    setLineMsg('');
    try {
      await api.testLineNotify();
      setLineStatus('ok');
      setLineMsg('測試訊息已送出，請查看 LINE！');
    } catch (e) {
      setLineStatus('error');
      setLineMsg(e.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>

      {/* 更新 & 顯示 */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">顯示設定</div>
        <Row label="資料更新間隔" desc="WebSocket 推播即時更新，此設定影響主動查詢頻率">
          <select style={sel} value={settings.refreshInterval}
            onChange={e => updateSettings({ refreshInterval: parseInt(e.target.value) })}>
            <option value={10}>10 秒</option>
            <option value={30}>30 秒</option>
            <option value={60}>1 分鐘</option>
            <option value={120}>2 分鐘</option>
            <option value={300}>5 分鐘</option>
          </select>
        </Row>
        <Row label="漲跌色系" desc="台式：漲紅跌綠 / 美式：漲綠跌紅">
          <select style={sel} value={settings.colorTheme}
            onChange={e => updateSettings({ colorTheme: e.target.value })}>
            <option value="tw">台式（漲紅跌綠）</option>
            <option value="us">美式（漲綠跌紅）</option>
          </select>
        </Row>
        <Row label="預設停損比例" desc="新增停損警報時的預設觸發比例">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={1} max={30} value={settings.defaultStopLoss}
              onChange={e => updateSettings({ defaultStopLoss: parseInt(e.target.value) })}
              style={{ ...sel, width: 64, textAlign: 'center' }} />
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>%</span>
          </div>
        </Row>
      </div>

      {/* 通知設定 */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">通知設定</div>
        {[
          { key: 'notifyLoss',   label: '停損觸發通知', desc: '當持股跌破停損點時提醒' },
          { key: 'notifyBuy',    label: '買入訊號通知', desc: '買入條件滿足時提醒' },
          { key: 'notifySell',   label: '賣出訊號通知', desc: '賣出條件滿足時提醒' },
          { key: 'notifyMarket', label: '大盤劇烈波動',  desc: '大盤漲跌超過 1.5% 時提醒' },
        ].map((item) => (
          <Row key={item.key} label={item.label} desc={item.desc}>
            <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={settings[item.key]}
                onChange={e => updateSettings({ [item.key]: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
              <div style={{
                position: 'absolute', inset: 0,
                background: settings[item.key] ? 'var(--color-brand)' : 'var(--color-background-tertiary)',
                borderRadius: 10, transition: 'background .2s',
                border: '1px solid var(--color-border-secondary)',
              }} />
              <div style={{
                position: 'absolute', top: 2,
                left: settings[item.key] ? 18 : 2,
                width: 14, height: 14,
                background: '#fff', borderRadius: '50%',
                transition: 'left .2s',
                boxShadow: '0 1px 3px rgba(0,0,0,.3)',
              }} />
            </label>
          </Row>
        ))}
      </div>

      {/* LINE Notify */}
      <div style={{ gridColumn: '1 / -1', background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">LINE Notify 推播</div>

        {/* 說明 */}
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.7 }}>
          警報觸發時自動推播 LINE 訊息。請先至{' '}
          <a href="https://notify-bot.line.me/" target="_blank" rel="noreferrer"
            style={{ color: 'var(--color-brand)', textDecoration: 'none' }}>
            notify-bot.line.me
          </a>{' '}
          登入並建立個人存取權杖（Personal Access Token），再貼到下方。
        </div>

        {lineConfigured ? (
          /* 已設定狀態 */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#00c48c', fontWeight: 600 }}>
              <span>✅</span> Token 已設定
            </div>
            <button onClick={handleTestLine} disabled={lineStatus === 'testing'}
              style={{ fontSize: 11, padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid var(--color-brand)', background: 'rgba(59,130,246,.1)', color: 'var(--color-brand)' }}>
              {lineStatus === 'testing' ? '發送中…' : '📩 發送測試訊息'}
            </button>
            <button onClick={handleClearToken}
              style={{ fontSize: 11, padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid #ef4444', background: 'transparent', color: '#ef4444' }}>
              移除 Token
            </button>
            {lineMsg && (
              <span style={{ fontSize: 11, color: lineStatus === 'ok' ? '#00c48c' : '#ef4444' }}>
                {lineMsg}
              </span>
            )}
          </div>
        ) : (
          /* 未設定狀態 */
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <input
              type="password"
              value={lineToken}
              onChange={e => setLineToken(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
              placeholder="貼上 LINE Notify Personal Access Token"
              style={{ flex: 1, minWidth: 220, padding: '7px 10px', fontSize: 12,
                background: '#0a1018', border: '1px solid var(--color-border-tertiary)',
                borderRadius: 6, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}
            />
            <button onClick={handleSaveToken} disabled={lineSaving || !lineToken.trim()}
              style={{ fontSize: 12, padding: '7px 16px', borderRadius: 6, cursor: lineSaving || !lineToken.trim() ? 'not-allowed' : 'pointer',
                border: '1px solid var(--color-brand)', background: lineToken.trim() ? 'rgba(59,130,246,.15)' : 'transparent',
                color: lineToken.trim() ? 'var(--color-brand)' : 'var(--color-text-tertiary)', fontWeight: 600 }}>
              {lineSaving ? '儲存中…' : '儲存'}
            </button>
            {lineMsg && <div style={{ width: '100%', fontSize: 11, color: '#ef4444' }}>{lineMsg}</div>}
          </div>
        )}
      </div>

      {/* 自動 AI 簡報排程 */}
      <div style={{ gridColumn: '1 / -1', background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">自動 AI 簡報排程</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.7 }}>
          每個交易日自動生成 AI 市場簡報並推播至 LINE（需先設定 LINE Notify token 及 Claude API Key）
        </div>

        {[
          {
            key: 'preMarketEnabled',
            label: '盤前簡報',
            time: '08:45',
            desc: '整合前日法人籌碼 + 國際市場，給出今日操作基調',
            type: 'pre',
          },
          {
            key: 'postMarketEnabled',
            label: '盤後總結',
            time: '13:35',
            desc: '今日大盤覆盤 + 法人動向 + 明日展望',
            type: 'post',
          },
        ].map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'rgba(59,130,246,.1)', color: 'var(--color-brand)', fontFamily: 'var(--font-mono)' }}>
                  {item.time} 台灣時間
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{item.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {autoReport[item.key] && (
                <button
                  onClick={() => handleTriggerReport(item.type)}
                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                    border: '1px solid rgba(100,116,139,.4)', background: 'transparent', color: 'var(--color-text-tertiary)' }}>
                  立即觸發
                </button>
              )}
              {/* Toggle */}
              <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
                <input type="checkbox" checked={autoReport[item.key]}
                  onChange={() => toggleAutoReport(item.key)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: autoReport[item.key] ? 'var(--color-brand)' : 'var(--color-background-tertiary)',
                  borderRadius: 10, transition: 'background .2s',
                  border: '1px solid var(--color-border-secondary)',
                }} />
                <div style={{
                  position: 'absolute', top: 2,
                  left: autoReport[item.key] ? 18 : 2,
                  width: 14, height: 14,
                  background: '#fff', borderRadius: '50%',
                  transition: 'left .2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                }} />
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* 資料管理（跨欄）*/}
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          資料管理
          <span style={{ flex: 1, height: 1, background: 'var(--color-border-tertiary)', display: 'block' }} />
        </div>
        <DataManager />
      </div>

      {/* 系統狀態 */}
      <div style={{
        gridColumn: '1 / -1',
        background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14,
      }}>
        <div className="section-label">系統狀態</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {[
            {
              label: 'WebSocket',
              value: { connected: '連線正常', connecting: '連線中', disconnected: '已斷線' }[wsStatus] || '—',
              color: { connected: '#00c48c', connecting: '#f59e0b', disconnected: '#64748b' }[wsStatus],
            },
            { label: '最後更新', value: lastUpdated ? lastUpdated.toLocaleTimeString('zh-TW') : '—', color: 'var(--color-text-secondary)' },
            { label: '後端 API', value: import.meta.env.VITE_API_URL || '本地代理', color: 'var(--color-text-secondary)' },
            { label: 'AI 引擎', value: 'Claude Sonnet', color: 'var(--color-brand)' },
            { label: '資料來源', value: 'TWSE Open API', color: 'var(--color-text-secondary)' },
            { label: '警報數量', value: `${alerts.length} 組`, color: 'var(--color-text-secondary)' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'var(--color-background-secondary)',
              borderRadius: 6, padding: '8px 12px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: item.color, fontWeight: 600 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
