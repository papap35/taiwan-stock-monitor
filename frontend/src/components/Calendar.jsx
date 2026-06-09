import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useStockStore } from '../stores/stockStore';

const TYPE_META = {
  dividend: { icon: '💰', label: '除息', color: '#00c48c' },
  rights:   { icon: '📈', label: '除權', color: '#f59e0b' },
  earnings: { icon: '📋', label: '財報', color: '#a78bfa' },
};

const DAYS_OPTIONS = [
  { value: 7,  label: '7 天' },
  { value: 14, label: '14 天' },
  { value: 30, label: '30 天' },
  { value: 60, label: '60 天' },
];

function DaysBadge({ days }) {
  if (days === 0) return <span style={{ fontSize: 9, background: '#ff4d4f22', color: '#ff4d4f', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>今天</span>;
  if (days === 1) return <span style={{ fontSize: 9, background: '#f59e0b22', color: '#f59e0b', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>明天</span>;
  if (days <= 3)  return <span style={{ fontSize: 9, background: '#f59e0b22', color: '#f59e0b', padding: '1px 5px', borderRadius: 3 }}>{days} 天後</span>;
  return <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{days} 天後</span>;
}

export default function Calendar() {
  const { watchlist } = useStockStore();
  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [days, setDays]             = useState(30);
  const [filterType, setFilterType] = useState('all');
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);

  const watchlistCodes = watchlist.map(w => w.code);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const codes = onlyWatchlist && watchlistCodes.length ? watchlistCodes : null;
      const res = await api.getCalendarEvents(days, codes);
      setEvents(res.events || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [days, onlyWatchlist, watchlistCodes.join(',')]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const filtered = filterType === 'all' ? events : events.filter(e => e.type === filterType);

  // 按日期分組
  const grouped = filtered.reduce((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* 頁首 */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📅 重要事件行事曆</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          除權息日期、財報公布截止日（資料來源：證交所 OpenAPI）
        </div>
      </div>

      {/* 篩選列 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 天數 */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--color-background-secondary)', borderRadius: 6, padding: 2 }}>
          {DAYS_OPTIONS.map(o => (
            <button key={o.value} onClick={() => setDays(o.value)} style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: days === o.value ? 'var(--color-brand)' : 'transparent',
              color: days === o.value ? '#fff' : 'var(--color-text-tertiary)',
              fontWeight: days === o.value ? 700 : 400,
            }}>{o.label}</button>
          ))}
        </div>

        {/* 類型 */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--color-background-secondary)', borderRadius: 6, padding: 2 }}>
          {[
            { value: 'all',      label: '全部' },
            { value: 'dividend', label: '💰 除息' },
            { value: 'rights',   label: '📈 除權' },
            { value: 'earnings', label: '📋 財報' },
          ].map(o => (
            <button key={o.value} onClick={() => setFilterType(o.value)} style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: filterType === o.value ? 'rgba(59,130,246,.2)' : 'transparent',
              color: filterType === o.value ? 'var(--color-brand)' : 'var(--color-text-tertiary)',
              fontWeight: filterType === o.value ? 700 : 400,
            }}>{o.label}</button>
          ))}
        </div>

        {/* 只看自選股 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyWatchlist} onChange={e => setOnlyWatchlist(e.target.checked)}
            style={{ accentColor: 'var(--color-brand)' }} />
          只看自選股（{watchlistCodes.length} 支）
        </label>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          共 {filtered.length} 筆
        </span>
      </div>

      {/* 主要內容 */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 60, background: 'var(--color-background-card)', borderRadius: 8, opacity: .4 }} className="skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          {onlyWatchlist ? '自選股在此期間內沒有重要事件' : '此期間內沒有事件'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedDates.map(date => {
            const dayEvents = grouped[date];
            const daysLeft = dayEvents[0].daysFromToday;
            const dateObj = new Date(date);
            const weekday = dateObj.toLocaleDateString('zh-TW', { weekday: 'short' });
            const mmdd = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

            return (
              <div key={date} style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
                {/* 日期 header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: '#0d1520', borderBottom: '1px solid var(--color-border-tertiary)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: daysLeft <= 3 ? '#f59e0b' : '#e2e8f0' }}>
                    {mmdd}（{weekday}）
                  </span>
                  <DaysBadge days={daysLeft} />
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{dayEvents.length} 筆</span>
                </div>

                {/* 事件列表 */}
                {dayEvents.map((e, i) => {
                  const meta = TYPE_META[e.type] || { icon: '📌', label: e.type, color: '#64748b' };
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px',
                      borderBottom: i < dayEvents.length - 1 ? '1px solid #1a2535' : 'none',
                    }}>
                      {/* 類型 badge */}
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4,
                        background: meta.color + '22', color: meta.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {meta.icon} {meta.label}
                      </span>
                      {/* 股票 */}
                      <span style={{ fontWeight: 700, fontSize: 12, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{e.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{e.code}</span>
                      {/* 說明 */}
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1 }}>{e.note}</span>
                      {/* 自選股標記 */}
                      {watchlistCodes.includes(e.code) && (
                        <span style={{ fontSize: 9, background: 'rgba(59,130,246,.15)', color: 'var(--color-brand)', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>
                          ⭐ 自選
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
