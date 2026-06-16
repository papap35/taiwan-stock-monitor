import { useState, useEffect } from 'react';
import { useStockStore } from '../stores/stockStore';
import DataManager from './DataManager';
import { api } from '../services/api';
import { useCloudSync } from '../hooks/useCloudSync';

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

function BrowserNotifToggle({ settings, updateSettings }) {
  const [permStatus, setPermStatus] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );

  const handleToggle = async (enabled) => {
    if (!enabled) {
      updateSettings({ browserNotifEnabled: false });
      return;
    }
    if (permStatus === 'denied') return;
    if (permStatus === 'granted') {
      updateSettings({ browserNotifEnabled: true });
      return;
    }
    const result = await Notification.requestPermission();
    setPermStatus(result);
    if (result === 'granted') updateSettings({ browserNotifEnabled: true });
  };

  const notSupported = permStatus === 'unsupported';
  const denied = permStatus === 'denied';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {notSupported ? '（此瀏覽器不支援通知 API）' : '開啟桌面通知'}
          </div>
          {denied && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>
              瀏覽器已封鎖通知權限，請至瀏覽器設定手動開放後再試
            </div>
          )}
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: notSupported || denied ? 'not-allowed' : 'pointer', opacity: notSupported || denied ? .4 : 1 }}>
          <input type="checkbox" checked={settings.browserNotifEnabled && !notSupported && !denied}
            disabled={notSupported || denied}
            onChange={e => handleToggle(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: settings.browserNotifEnabled && !denied ? 'var(--color-brand)' : 'var(--color-background-tertiary)',
            borderRadius: 10, transition: 'background .2s',
            border: '1px solid var(--color-border-secondary)',
          }} />
          <div style={{
            position: 'absolute', top: 2,
            left: settings.browserNotifEnabled && !denied ? 18 : 2,
            width: 14, height: 14,
            background: '#fff', borderRadius: '50%',
            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          }} />
        </label>
      </div>
      {permStatus === 'granted' && settings.browserNotifEnabled && (
        <div style={{ fontSize: 11, color: '#00c48c' }}>✅ 通知權限已取得，警報觸發時將顯示桌面通知</div>
      )}
    </div>
  );
}

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
  const [autoReport, setAutoReport] = useState({ preMarketEnabled: false, postMarketEnabled: false, weeklyReportEnabled: false });

  useEffect(() => {
    api.getAutoReportSettings().then(r => setAutoReport(r)).catch(() => {});
  }, []);

  const toggleAutoReport = async (key) => {
    const next = { ...autoReport, [key]: !autoReport[key] };
    setAutoReport(next);
    await api.setAutoReportSettings(next).catch(() => {});
  };

  // ── 雲端同步 ──────────────────────────────────────────────────
  const {
    enabled: syncEnabled, syncing, lastSyncAt, error: syncError, push: syncPush, pull: syncPull,
    authEnabled, user, signInWithGoogle, signOut,
  } = useCloudSync();

  const handleTriggerReport = async (type) => {
    const LABELS = { pre: '盤前', post: '盤後', weekly: '週報' };
    try {
      await api.triggerAutoReport(type);
      alert(`${LABELS[type] || ''}簡報已觸發，請查看 LINE！`);
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
        <Row label="總資金" desc="用於自選股「建議買入張數」計算，0 表示未設定">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={0} step={10000} value={settings.totalCapital}
              onChange={e => updateSettings({ totalCapital: Math.max(0, parseInt(e.target.value) || 0) })}
              style={{ ...sel, width: 110, textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>元</span>
          </div>
        </Row>
        <Row label="單筆最大風險比例" desc="單筆交易最大可承受虧損占總資金比例，建議 1~2%">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={0.1} max={20} step={0.1} value={settings.maxRiskPct}
              onChange={e => updateSettings({ maxRiskPct: Math.max(0, parseFloat(e.target.value) || 0) })}
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

      {/* 瀏覽器推播通知 */}
      <div style={{ gridColumn: '1 / -1', background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">瀏覽器推播通知</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.7 }}>
          警報觸發時直接在桌面顯示通知，不需切換至 LINE。僅在頁面開啟時有效（前景通知）。
        </div>
        <BrowserNotifToggle settings={settings} updateSettings={updateSettings} />
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
          {
            key: 'weeklyReportEnabled',
            label: 'AI 週報摘要',
            time: '週五 14:30',
            desc: '本週自選股漲跌排行 + 法人籌碼變化 + 下週關注事件',
            type: 'weekly',
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

      {/* 雲端同步（Supabase）*/}
      <div style={{ gridColumn: '1 / -1', background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
        <div className="section-label">☁️ 雲端同步（Supabase）</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.7 }}>
          將自選股、警報、設定備份至 Supabase，換裝置或清除快取後可快速還原。
          需在後端 <code style={{ fontFamily: 'var(--font-mono)' }}>.env</code> 設定{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>SUPABASE_URL</code> 與{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>SUPABASE_SERVICE_KEY</code>。
        </div>

        {!syncEnabled ? (
          <div style={{ fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚠️ Supabase 尚未設定，雲端同步功能停用
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Google 登入狀態 */}
            {authEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--color-border-tertiary)' }}>
                {user ? (
                  <>
                    {user.user_metadata?.avatar_url && (
                      <img src={user.user_metadata.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                    )}
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1 }}>
                      已登入：{user.email}
                    </div>
                    <button
                      onClick={signOut}
                      style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                        border: '1px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--color-text-secondary)' }}>
                      登出
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flex: 1 }}>
                      登入後可在多裝置間同步個人資料（未登入則使用共用單一帳號）
                    </div>
                    <button
                      onClick={signInWithGoogle}
                      style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                        border: '1px solid var(--color-brand)', background: 'rgba(59,130,246,.1)', color: 'var(--color-brand)', fontWeight: 600 }}>
                      使用 Google 登入
                    </button>
                  </>
                )}
              </div>
            )}

            {/* 上次同步時間 */}
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              上次同步：{lastSyncAt
                ? new Date(lastSyncAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '尚未同步'}
            </div>

            {/* 按鈕列 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={syncPush}
                disabled={syncing}
                style={{ fontSize: 12, padding: '7px 18px', borderRadius: 6, cursor: syncing ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--color-brand)', background: 'rgba(59,130,246,.1)', color: 'var(--color-brand)', fontWeight: 600 }}>
                {syncing ? '同步中…' : '⬆ 推送到雲端'}
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm('從雲端拉取資料將覆蓋本機所有設定，確定繼續？')) return;
                  await syncPull();
                }}
                disabled={syncing}
                style={{ fontSize: 12, padding: '7px 18px', borderRadius: 6, cursor: syncing ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--color-border-secondary)', background: 'transparent', color: 'var(--color-text-secondary)' }}>
                {syncing ? '同步中…' : '⬇ 從雲端還原'}
              </button>
            </div>

            {/* 錯誤訊息 */}
            {syncError && (
              <div style={{ fontSize: 11, color: '#ef4444' }}>❌ {syncError}</div>
            )}
          </div>
        )}
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
