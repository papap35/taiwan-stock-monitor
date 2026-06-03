import { useStockStore } from '../stores/stockStore';

export default function MarketTicker() {
  const { hotStocks, watchlist, quotes, getColor } = useStockStore();

  // 優先顯示自選股，補足熱門股
  const watchItems = watchlist.map(w => {
    const q = quotes[w.code];
    return q ? { code: w.code, name: w.name, price: q.price, changePercent: q.changePercent } : null;
  }).filter(Boolean);

  const hotItems = hotStocks.slice(0, 20).map(s => ({
    code: s.code, name: s.name, price: s.price, changePercent: s.changePercent,
  }));

  const items = [...watchItems, ...hotItems].filter(
    (s, i, arr) => arr.findIndex(x => x.code === s.code) === i
  ).slice(0, 30);

  if (!items.length) return null;

  const ticker = [...items, ...items]; // 雙份以無縫循環

  return (
    <div style={{
      borderBottom: '1px solid var(--color-border-tertiary)',
      background: 'var(--color-background-secondary)',
      overflow: 'hidden',
      height: 30,
      display: 'flex',
      alignItems: 'center',
    }}>
      <div style={{
        display: 'flex',
        gap: 0,
        animation: `ticker-scroll ${items.length * 4}s linear infinite`,
        willChange: 'transform',
        width: 'max-content',
      }}>
        {ticker.map((s, i) => {
          const up = s.changePercent > 0;
          const flat = s.changePercent === 0;
          const color = flat ? 'var(--color-flat)' : up ? 'var(--color-up)' : 'var(--color-down)';
          const arrow = flat ? '' : up ? '▲' : '▼';
          return (
            <span key={i} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 16px',
              borderRight: '1px solid var(--color-border-tertiary)',
              whiteSpace: 'nowrap',
              fontSize: 11,
              height: 30,
            }}>
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{s.code}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{s.name}</span>
              <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {s.price?.toFixed(s.price >= 100 ? 1 : 2)}
              </span>
              <span style={{ color, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                {arrow} {Math.abs(s.changePercent).toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
