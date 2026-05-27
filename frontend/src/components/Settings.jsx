import { useStockStore } from '../stores/stockStore';

export default function Settings() {
  const { settings, updateSettings } = useStockStore();
  const card = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 14, marginBottom: 12 };
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid #f3f4f6', fontSize: 13 };
  const sel = { padding: '5px 8px', border: '0.5px solid #d1d5db', borderRadius: 8, fontSize: 13, background: 'var(--color-background-primary)' };

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>⏱ 更新設定</div>
        <div style={row}>
          <span>更新間隔</span>
          <select style={sel} value={settings.refreshInterval}
            onChange={e => updateSettings({ refreshInterval: parseInt(e.target.value) })}>
            <option value={10}>10 秒</option>
            <option value={30}>30 秒</option>
            <option value={60}>1 分鐘</option>
            <option value={120}>2 分鐘</option>
            <option value={300}>5 分鐘</option>
          </select>
        </div>
        <div style={{ ...row, borderBottom: 'none' }}>
          <span>顏色主題</span>
          <select style={sel} value={settings.colorTheme}
            onChange={e => updateSettings({ colorTheme: e.target.value })}>
            <option value="tw">台式（漲紅跌綠）</option>
            <option value="us">美式（漲綠跌紅）</option>
          </select>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>🔔 通知設定</div>
        {[
          { key: 'notifyLoss',   label: '停損觸發通知' },
          { key: 'notifyBuy',    label: '買入訊號通知' },
          { key: 'notifySell',   label: '賣出訊號通知' },
          { key: 'notifyMarket', label: '大盤漲跌超過 1.5% 通知' },
        ].map((item, i, arr) => (
          <div key={item.key} style={{ ...row, borderBottom: i === arr.length - 1 ? 'none' : undefined }}>
            <span>{item.label}</span>
            <input type="checkbox" checked={settings[item.key]}
              onChange={e => updateSettings({ [item.key]: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>⚙️ 風控設定</div>
        <div style={{ ...row, borderBottom: 'none', gap: 12 }}>
          <span>預設停損比例</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={1} max={30} value={settings.defaultStopLoss}
              onChange={e => updateSettings({ defaultStopLoss: parseInt(e.target.value) })}
              style={{ width: 60, padding: '5px 8px', border: '0.5px solid #d1d5db', borderRadius: 8, fontSize: 13, textAlign: 'center' }} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>%</span>
          </div>
        </div>
      </div>

      <div style={{ ...card, background: '#f0fdf4', borderColor: '#86efac' }}>
        <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.8 }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>📌 系統狀態</div>
          <div>後端 API：{import.meta.env.VITE_API_URL || '本地代理'}</div>
          <div>WebSocket：{import.meta.env.VITE_WS_URL || '本地代理'}</div>
          <div>資料來源：台灣證券交易所（TWSE）Open API</div>
          <div>AI 引擎：Claude Sonnet（Anthropic）</div>
        </div>
      </div>
    </div>
  );
}
