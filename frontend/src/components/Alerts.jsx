import { useState, useEffect } from 'react';
import { useStockStore } from '../stores/stockStore';
import { api } from '../services/api';

const ALERT_TYPES = [
  { value: 'loss',        label: '停損觸及', color: '#ff4d4f', bg: 'rgba(255,77,79,.12)' },
  { value: 'buy',         label: '買入訊號', color: '#00c48c', bg: 'rgba(0,196,140,.12)' },
  { value: 'sell',        label: '賣出訊號', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
  { value: 'price_above', label: '突破目標', color: '#ff4d4f', bg: 'rgba(255,77,79,.08)' },
  { value: 'price_below', label: '跌破目標', color: '#00c48c', bg: 'rgba(0,196,140,.08)' },
];

const TYPE_MAP = Object.fromEntries(ALERT_TYPES.map(t => [t.value, t]));

export default function Alerts() {
  const { alerts, setAlerts, triggerHistory, quotes } = useStockStore();
  const [form, setForm] = useState({ code: '', name: '', type: 'loss', targetPrice: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('active');

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
      console.error(err);
    }
    setLoading(false);
  };

  const removeAlert = async (id) => {
    await api.deleteAlert(id).catch(() => {});
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const inp = {
    padding: '7px 10px',
    border: '1px solid var(--color-border-secondary)',
    borderRadius: 6,
    background: 'var(--color-background-secondary)',
    color: 'var(--color-text-primary)',
    fontSize: 13,
  };

  const activeAlerts = alerts.filter(a => !a.triggered);
  const triggeredAlerts = alerts.filter(a => a.triggered);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 10, alignItems: 'start' }}>

      {/* 左側：新增警報 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14 }}>
          <div className="section-label">新增警報</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inp, width: 88 }} placeholder="代號" value={form.code}
                onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
              <input style={{ ...inp, flex: 1 }} placeholder="名稱（選填）" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <select style={{ ...inp }} value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {ALERT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inp, flex: 1 }} type="number" placeholder="目標價格" value={form.targetPrice}
                onChange={e => setForm(p => ({ ...p, targetPrice: e.target.value }))} />
            </div>
            <input style={inp} placeholder="備註（選填）" value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
            <button onClick={addAlert} disabled={loading || !form.code || !form.targetPrice}
              className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '8px' }}>
              {loading ? '新增中...' : '+ 新增警報'}
            </button>
          </div>
        </div>

        {/* 統計 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="stat-tile">
            <div className="stat-label">監控中</div>
            <div className="stat-value" style={{ color: 'var(--color-brand)' }}>{activeAlerts.length}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">已觸發</div>
            <div className="stat-value" style={{ color: '#ff4d4f' }}>{triggeredAlerts.length}</div>
          </div>
        </div>
      </div>

      {/* 右側：警報列表 */}
      <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
        {/* Tab */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
          {[
            { k: 'active',    label: `監控中 (${activeAlerts.length})` },
            { k: 'triggered', label: `已觸發 (${triggeredAlerts.length})` },
            { k: 'history',   label: `觸發紀錄 (${triggerHistory.length})` },
          ].map(tab => (
            <button key={tab.k} onClick={() => setActiveTab(tab.k)} style={{
              padding: '9px 14px', border: 'none', background: 'transparent',
              borderBottom: activeTab === tab.k ? '2px solid var(--color-brand)' : '2px solid transparent',
              color: activeTab === tab.k ? '#e2e8f0' : 'var(--color-text-tertiary)',
              fontSize: 11, fontWeight: activeTab === tab.k ? 600 : 400,
              cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 12 }}>
          {/* 監控中 */}
          {activeTab === 'active' && (
            activeAlerts.length === 0 ? (
              <EmptyState text="尚無監控中的警報" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeAlerts.map(a => <AlertRow key={a.id} alert={a} quotes={quotes} onDelete={removeAlert} />)}
              </div>
            )
          )}

          {/* 已觸發 */}
          {activeTab === 'triggered' && (
            triggeredAlerts.length === 0 ? (
              <EmptyState text="尚無已觸發的警報" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {triggeredAlerts.map(a => <AlertRow key={a.id} alert={a} quotes={quotes} onDelete={removeAlert} triggered />)}
              </div>
            )
          )}

          {/* 觸發紀錄 */}
          {activeTab === 'history' && (
            triggerHistory.length === 0 ? (
              <EmptyState text="尚無觸發紀錄" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {triggerHistory.slice(0, 20).map((event, i) => {
                  const type = TYPE_MAP[event.alert.type];
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 6,
                      background: 'var(--color-background-secondary)',
                      borderLeft: `3px solid ${type?.color || '#64748b'}`,
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px',
                        borderRadius: 3, background: type?.bg,
                        color: type?.color, whiteSpace: 'nowrap',
                      }}>{type?.label}</span>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{event.alert.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{event.alert.code}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: type?.color }}>
                        ${event.quote.price.toFixed(2)}
                      </span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(event.alert.triggeredAt).toLocaleTimeString('zh-TW', { hour12: false })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function AlertRow({ alert: a, quotes, onDelete, triggered = false }) {
  const type = TYPE_MAP[a.type];
  const cur = quotes[a.code];
  const diff = cur ? ((cur.price - a.targetPrice) / a.targetPrice * 100).toFixed(1) : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 6,
      background: triggered ? 'rgba(255,255,255,.02)' : 'var(--color-background-secondary)',
      border: `1px solid ${triggered ? 'var(--color-border-tertiary)' : (type?.color ? `rgba(${type.color === '#ff4d4f' ? '255,77,79' : type.color === '#00c48c' ? '0,196,140' : '245,158,11'},.15)` : 'var(--color-border-tertiary)')}`,
      opacity: triggered ? .6 : 1,
      transition: 'opacity .2s',
    }}>
      <div style={{ width: 3, height: 36, borderRadius: 2, background: type?.color || '#64748b', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{a.code}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
            background: type?.bg, color: type?.color,
          }}>{type?.label}</span>
          {triggered && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
              background: 'rgba(245,158,11,.15)', color: '#f59e0b', letterSpacing: '.04em',
            }}>TRIGGERED</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          <span>目標 <span style={{ color: type?.color, fontWeight: 600 }}>${a.targetPrice.toFixed(2)}</span></span>
          {cur && <span>現價 <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>${cur.price.toFixed(2)}</span></span>}
          {diff && <span>距離 <span style={{ color: Math.abs(parseFloat(diff)) < 2 ? '#f59e0b' : 'var(--color-text-tertiary)' }}>{diff > 0 ? '+' : ''}{diff}%</span></span>}
          {a.note && <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{a.note}</span>}
        </div>
      </div>
      <button onClick={() => onDelete(a.id)}
        style={{
          padding: '3px 8px', background: 'transparent',
          border: '1px solid rgba(248,113,113,.2)', color: 'rgba(248,113,113,.5)',
          borderRadius: 4, cursor: 'pointer', fontSize: 10, flexShrink: 0,
          transition: 'all .15s',
        }}
        onMouseEnter={e => { e.target.style.borderColor = '#f87171'; e.target.style.color = '#f87171'; }}
        onMouseLeave={e => { e.target.style.borderColor = 'rgba(248,113,113,.2)'; e.target.style.color = 'rgba(248,113,113,.5)'; }}
      >
        刪除
      </button>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
      <div style={{ fontSize: 24, marginBottom: 8, opacity: .2 }}>◎</div>
      {text}
    </div>
  );
}
