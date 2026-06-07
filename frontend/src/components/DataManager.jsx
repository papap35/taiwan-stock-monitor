import { useState, useRef } from 'react';
import { useStockStore, saveSnapshot, getSnapshots, deleteSnapshot } from '../stores/stockStore';

const APP_VERSION = '1.0';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtBytes(str) {
  const b = new TextEncoder().encode(str).length;
  return b > 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;
}

export default function DataManager() {
  const { watchlist, alerts, settings, importData } = useStockStore();
  const [snapshots, setSnapshots] = useState(() => getSnapshots());
  const [importStatus, setImportStatus] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(null);
  const importRef = useRef(null);

  // ── 產生完整備份物件 ─────────────────────────────
  const buildBackup = () => ({
    version:    APP_VERSION,
    exportedAt: new Date().toISOString(),
    watchlist,
    alerts,
    settings,
  });

  // ── 匯出 JSON ────────────────────────────────────
  const exportJSON = () => {
    const data = buildBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `taiwan-stock-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 匯出 CSV（持股清單）─────────────────────────
  const exportCSV = () => {
    const headers = ['代號', '名稱', '整張數(張)', '零股數(股)', '總股數(股)', '平均成本', '策略', '目標價', '停損價', '備註'];
    const stratMap = { long: '長期持有', swing: '波段操作', trade: '短線交易' };
    const rows = watchlist.map(w => {
      const total = (parseInt(w.shares) || 0) * 1000 + (parseInt(w.oddLotShares) || 0);
      return [
        w.code, w.name,
        w.shares ?? '', w.oddLotShares ?? '', total || '',
        w.cost ?? '',
        stratMap[w.strategy] ?? w.strategy ?? '',
        w.target ?? '', w.stopLoss ?? '',
        w.notes ?? '',
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `watchlist-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── 建立快照 ─────────────────────────────────────
  const createSnapshot = (label) => {
    saveSnapshot(label, buildBackup());
    setSnapshots(getSnapshots());
  };

  // ── 還原快照 ─────────────────────────────────────
  const restoreSnapshot = (snap) => {
    // 先備份當前狀態
    saveSnapshot('還原前自動備份', buildBackup());
    importData(snap.data);
    setSnapshots(getSnapshots());
    setConfirmRestore(null);
    setImportStatus('✅ 已還原快照「' + snap.label + '」');
    setTimeout(() => setImportStatus(''), 4000);
  };

  // ── 匯入 JSON ────────────────────────────────────
  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.watchlist && !data.alerts && !data.settings) throw new Error('格式不正確');
        // 先備份
        saveSnapshot('匯入前自動備份', buildBackup());
        importData(data);
        setSnapshots(getSnapshots());
        setImportStatus(`✅ 匯入成功：${data.watchlist?.length ?? 0} 檔持股、${data.alerts?.length ?? 0} 筆警報`);
      } catch (err) {
        setImportStatus(`❌ 匯入失敗：${err.message}`);
      }
      setTimeout(() => setImportStatus(''), 5000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── 刪除快照 ─────────────────────────────────────
  const removeSnapshot = (id) => {
    deleteSnapshot(id);
    setSnapshots(getSnapshots());
  };

  // ── 計算資料大小 ─────────────────────────────────
  const jsonSize  = fmtBytes(JSON.stringify(buildBackup()));
  const storeSize = (() => {
    try {
      let total = 0;
      ['watchlist', 'alerts_local', 'settings', 'data_snapshots', 'trigger_history'].forEach(k => {
        total += (localStorage.getItem(k) || '').length * 2;
      });
      return total > 1024 * 1024 ? `${(total / 1024 / 1024).toFixed(1)} MB` : `${(total / 1024).toFixed(1)} KB`;
    } catch { return '—'; }
  })();

  const Section = ({ title, children }) => (
    <div style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div className="section-label">{title}</div>
      {children}
    </div>
  );

  const Btn = ({ onClick, color, children, disabled, style = {} }) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '7px 14px', borderRadius: 5, fontSize: 12, fontWeight: 600,
      border: `1px solid ${color || 'var(--color-border-secondary)'}`,
      background: color ? `${color}18` : 'transparent',
      color: color || 'var(--color-text-secondary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      transition: 'all .15s',
      display: 'inline-flex', alignItems: 'center', gap: 5,
      ...style,
    }}>{children}</button>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>

      {/* 左欄 */}
      <div>
        {/* 資料狀況 */}
        <Section title="📦 目前資料狀況">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: '自選 / 持股', val: `${watchlist.length} 檔`, color: 'var(--color-brand)' },
              { label: '價格警報',    val: `${alerts.length} 筆`,    color: '#f59e0b' },
              { label: '備份快照',    val: `${snapshots.length} 份`, color: '#8b5cf6' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--color-background-secondary)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.color }}>{s.val}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            <span>備份大小：<strong style={{ color: 'var(--color-text-secondary)' }}>{jsonSize}</strong></span>
            <span style={{ opacity: .4 }}>|</span>
            <span>localStorage 使用：<strong style={{ color: 'var(--color-text-secondary)' }}>{storeSize}</strong></span>
          </div>
        </Section>

        {/* 匯出 */}
        <Section title="📤 匯出資料">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={exportJSON} color="#3b82f6" style={{ flex: 1, justifyContent: 'center' }}>
                ⬇ 匯出完整備份（JSON）
              </Btn>
            </div>
            <Btn onClick={exportCSV} color="#10b981" style={{ justifyContent: 'center' }}>
              ⬇ 匯出持股清單（CSV，可用 Excel 開啟）
            </Btn>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.7, marginTop: 2 }}>
              JSON 包含：自選股、警報設定、系統設定<br />
              CSV 只含持股清單，適合用 Excel 整理後再匯回
            </div>
          </div>
        </Section>

        {/* 匯入 */}
        <Section title="📥 匯入資料">
          <input ref={importRef} type="file" accept=".json" onChange={handleFileImport} style={{ display: 'none' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Btn onClick={() => importRef.current?.click()} color="#f59e0b" style={{ justifyContent: 'center' }}>
              ⬆ 從 JSON 備份檔匯入
            </Btn>
            {importStatus && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, fontSize: 12,
                background: importStatus.startsWith('✅') ? 'rgba(0,196,140,.1)' : 'rgba(255,77,79,.1)',
                color: importStatus.startsWith('✅') ? '#00c48c' : '#ff4d4f',
                border: `1px solid ${importStatus.startsWith('✅') ? 'rgba(0,196,140,.2)' : 'rgba(255,77,79,.2)'}`,
              }}>{importStatus}</div>
            )}
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.7 }}>
              ⚠️ 匯入前會自動建立「匯入前自動備份」快照<br />
              匯入後如發現問題，可從快照歷史還原
            </div>
          </div>
        </Section>
      </div>

      {/* 右欄：快照歷史 */}
      <div>
        <Section title="🕐 備份快照歷史">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Btn onClick={() => { const label = prompt('快照名稱（可留空）') ?? '手動備份'; createSnapshot(label); }} color="#8b5cf6" style={{ flex: 1, justifyContent: 'center' }}>
              📷 建立快照
            </Btn>
            <Btn onClick={() => createSnapshot('自動備份')} color="#3b82f6">
              ⚡ 快速備份
            </Btn>
          </div>

          {snapshots.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              <div style={{ fontSize: 20, opacity: .2, marginBottom: 6 }}>🕐</div>
              尚無快照，點上方按鈕建立第一個備份
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {snapshots.map((snap, i) => (
                <div key={snap.id} style={{
                  background: 'var(--color-background-secondary)',
                  border: '1px solid var(--color-border-tertiary)',
                  borderRadius: 6, padding: '10px 12px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: confirmRestore?.id === snap.id ? .6 : 1,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{snap.label}</span>
                      {i === 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,.15)', color: 'var(--color-brand)' }}>最新</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', display: 'flex', gap: 8 }}>
                      <span>{fmtDate(snap.createdAt)}</span>
                      <span>{snap.watchlistCount} 檔持股</span>
                      <span>{snap.alertsCount} 筆警報</span>
                    </div>
                  </div>

                  {confirmRestore?.id === snap.id ? (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <Btn onClick={() => restoreSnapshot(snap)} color="#ff4d4f">確認還原</Btn>
                      <Btn onClick={() => setConfirmRestore(null)}>取消</Btn>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <Btn onClick={() => setConfirmRestore(snap)} color="#f59e0b">還原</Btn>
                      <button onClick={() => removeSnapshot(snap.id)} style={{
                        padding: '4px 8px', borderRadius: 4, fontSize: 10,
                        border: '1px solid rgba(248,113,113,.2)', background: 'transparent',
                        color: 'rgba(248,113,113,.5)', cursor: 'pointer',
                      }}
                        onMouseEnter={e => { e.target.style.borderColor = '#f87171'; e.target.style.color = '#f87171'; }}
                        onMouseLeave={e => { e.target.style.borderColor = 'rgba(248,113,113,.2)'; e.target.style.color = 'rgba(248,113,113,.5)'; }}
                      >刪除</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.7 }}>
            最多保留 10 筆快照 · 儲存於瀏覽器 localStorage<br />
            還原前會自動建立「還原前自動備份」保護當前資料
          </div>
        </Section>

        {/* 儲存位置說明 */}
        <Section title="📍 資料儲存位置說明">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'watchlist', label: '自選股 / 持股', where: 'localStorage', safe: true, note: '瀏覽器本機儲存，清除快取會消失' },
              { key: 'settings', label: '系統設定', where: 'localStorage', safe: true, note: '瀏覽器本機儲存' },
              { key: 'alerts', label: '價格警報', where: 'localStorage + 後端記憶體', safe: false, note: '⚠️ 後端重啟警報消失，現已同步備份至 localStorage' },
              { key: 'snapshots', label: '備份快照', where: 'localStorage', safe: true, note: '最多 10 筆快照' },
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{item.note}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, fontWeight: 600, background: item.safe ? 'rgba(0,196,140,.1)' : 'rgba(245,158,11,.1)', color: item.safe ? '#00c48c' : '#f59e0b', border: `1px solid ${item.safe ? 'rgba(0,196,140,.2)' : 'rgba(245,158,11,.2)'}` }}>
                    {item.where}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.15)', borderRadius: 6, fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
            💡 <strong>跨裝置同步</strong>：目前資料僅存本機。如需跨裝置，請定期匯出 JSON 備份，換裝置時匯入即可。
            未來若部署 Supabase 資料庫，可實現自動雲端同步。
          </div>
        </Section>
      </div>
    </div>
  );
}
