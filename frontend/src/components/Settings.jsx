import { useStockStore } from '../stores/stockStore';

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
