import { useState, useEffect } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';

const ALERT_TYPES = [
  { value: 'loss',        label: '停損觸及', icon: '🔴' },
  { value: 'buy',         label: '買入訊號', icon: '🟢' },
  { value: 'sell',        label: '賣出訊號', icon: '🟡' },
  { value: 'price_above', label: '突破目標', icon: '🔔' },
  { value: 'price_below', label: '跌破目標', icon: '🔔' },
];

export default function Alerts() {
  const { alerts, setAlerts, triggerHistory, quotes } = useStockStore();
  const [form, setForm] = useState({ code: '', name: '', type: 'loss', targetPrice: '', note: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getAlerts().then(d => setAlerts(d.alerts)).catch(() => {});
  }, []);

  const addAlert = async () => {
    if (!form.code || !form.targetPrice) return;
    const name = form.name || quotes[form.code]?.name || form.code;
    setLoading(true);
    try {
      const alert = await api.addAlert({ ...form, name, targetPrice: parseFloat(form.targetPrice) });
      setAlerts([...alerts, alert]);
      setForm({ code: '', name: '', type: 'loss', targetPrice: '', note: '' });
    } catch (err) {
      alert(`新增失敗：${err.message}`);
    }
    setLoading(false);
  };

  const removeAlert = async (id) => {
    await api.deleteAlert(id).catch(() => {});
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const card = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 14, marginBottom: 12 };
  const inp = { padding: '6px 10px', border: '0.5px solid #d1d5db', borderRadius: 8, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' };

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>🛡️ 新增警報</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input style={{ ...inp, width: 80 }} placeholder="代號" value={form.code}
            onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
          <input style={{ ...inp, flex: 1 }} placeholder="名稱（可留空）" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <select style={inp} value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
            {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inp, width: 120 }} type="number" placeholder="目標價格" value={form.targetPrice}
            onChange={e => setForm(p => ({ ...p, targetPrice: e.target.value }))} />
          <input style={{ ...inp, flex: 1 }} placeholder="備註（選填）" value={form.note}
            onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
          <button onClick={addAlert} disabled={loading}
            style={{ padding: '6px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            + 新增
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
          警報列表 <span style={{ background: '#f3f4f6', padding: '1px 8px', borderRadius: 10, fontSize: 11 }}>{alerts.length}</span>
        </div>
        {alerts.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 16 }}>尚無警報設定</div>
        ) : alerts.map(a => {
          const type = ALERT_TYPES.find(t => t.value === a.type);
          const cur = quotes[a.code];
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', background: a.triggered ? '#f9fafb' : 'var(--color-background-secondary)', borderRadius: 8, marginBottom: 6, opacity: a.triggered ? 0.6 : 1 }}>
              <span style={{ fontSize: 18 }}>{type?.icon || '⚠️'}</span>
              <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>
                  {a.name}（{a.code}）{type?.label}
                  {a.triggered && <span style={{ marginLeft: 6, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 10, fontSize: 10 }}>已觸發</span>}
                </div>
                <div style={{ color: '#6b7280', marginTop: 2 }}>
                  目標 ${a.targetPrice.toFixed(2)}
                  {cur && `  現價 $${cur.price.toFixed(2)}`}
                  {a.note && `  ${a.note}`}
                </div>
              </div>
              <button onClick={() => removeAlert(a.id)}
                style={{ padding: '3px 8px', background: 'transparent', border: '0.5px solid #fca5a5', color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                刪除
              </button>
            </div>
          );
        })}
      </div>

      {triggerHistory.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>📋 觸發紀錄</div>
          {triggerHistory.slice(0, 10).map((event, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '0.5px solid #f3f4f6', fontSize: 12 }}>
              <span style={{ background: event.alert.type === 'loss' ? '#fee2e2' : '#dcfce7', color: event.alert.type === 'loss' ? '#991b1b' : '#166534', padding: '1px 6px', borderRadius: 8 }}>
                {ALERT_TYPES.find(t => t.value === event.alert.type)?.label}
              </span>
              <span style={{ fontWeight: 500 }}>{event.alert.name}（{event.alert.code}）</span>
              <span>${event.quote.price.toFixed(2)}</span>
              <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>
                {new Date(event.alert.triggeredAt).toLocaleTimeString('zh-TW')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
