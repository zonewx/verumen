import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

function fmt(n, currency) {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (currency || '');
}

function withVanilla(name) {
  if (!name) return name;
  return name.replace(/\s*\|\s*Vanilla\s*$/i, ' | Vanilla').replace(/Vanilla$/, '| Vanilla');
}

function cleanName(name) {
  if (!name) return '';
  return withVanilla(name.replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, ''));
}

export default function TradeSharePage() {
  const { id } = useParams();
  const [trade, setTrade] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/cs/trades/${id}/public`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setTrade(d); })
      .catch(() => setError('Failed to load trade.'));
  }, [id]);

  const name = trade ? cleanName(trade.skinName) : '';
  const hasStar = name.startsWith('★');
  const isST = name.startsWith('StatTrak');
  const nameColor = hasStar ? 'text-violet-300' : isST ? 'text-orange-400' : 'text-white';

  const pnl = trade
    ? trade.sold
      ? (trade.salePrice ?? 0) - (trade.purchasePrice ?? 0)
      : null
    : null;
  const pnlPos = pnl != null && pnl >= 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <a href="/" className="flex items-center gap-2 mb-8 opacity-70 hover:opacity-100 transition">
        <img src="/logo.png" alt="Verumen" className="w-7 h-7 object-contain" />
        <span className="text-sm font-semibold tracking-wide text-zinc-300">Verumen</span>
      </a>

      {error && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 text-center max-w-sm w-full">
          <p className="text-zinc-400 text-sm">{error}</p>
        </div>
      )}

      {!trade && !error && (
        <div className="w-8 h-8 border-4 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      )}

      {trade && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wider font-semibold">Trade</p>
            <h1 className={`text-xl font-bold ${nameColor}`}>
              {hasStar ? <><span className="mr-1">★</span>{name.slice(1).trim()}</> : name}
            </h1>
            {trade.exterior && !(/vanilla\s*$/i.test(trade.skinName)) && <p className="text-sm text-zinc-400 mt-0.5">{trade.exterior}</p>}
            {trade.username && (
              <p className="text-xs text-zinc-500 mt-2">
                shared by <a href={`/user/${trade.username}`} className="text-zinc-400 hover:underline">{trade.username}</a>
              </p>
            )}
          </div>

          {/* Float bar */}
          {trade.floatValue && !(/vanilla\s*$/i.test(trade.skinName)) && (
            <div className="px-6 py-4 border-b border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Float</p>
              <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right,#22c55e,#84cc16,#eab308,#f97316,#ef4444)' }}>
                {[0.07, 0.15, 0.38, 0.45].map(v => (
                  <div key={v} className="absolute top-0 bottom-0 w-px bg-black/30" style={{ left: `${v * 100}%` }} />
                ))}
                <div
                  className="absolute top-1/2 w-2.5 h-2.5 bg-white rounded-full shadow border-2 border-zinc-900"
                  style={{ left: `${Math.min(parseFloat(trade.floatValue) * 100, 99.5)}%`, transform: 'translate(-50%, -50%)' }}
                />
              </div>
              <p className="text-xs font-mono text-zinc-400 mt-1.5">{parseFloat(trade.floatValue).toFixed(4)}</p>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-px bg-zinc-800 border-b border-zinc-800">
            {[
              ['Float', trade.floatValue ? parseFloat(trade.floatValue).toFixed(4) : '—'],
              ['Pattern', trade.pattern || '—'],
              ['Buy date', trade.purchaseDate || '—'],
              ['Buy price', fmt(trade.purchasePrice, trade.purchaseCurrency)],
              trade.sold
                ? ['Sale date', trade.saleDate || '—']
                : ['Status', 'Holding'],
              trade.sold
                ? ['Sale price', fmt(trade.salePrice, trade.saleCurrency)]
                : ['Current price', '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-zinc-900 px-5 py-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">{label}</p>
                <p className="text-sm font-mono font-medium text-zinc-100">{value}</p>
              </div>
            ))}
          </div>

          {/* P&L — sold only */}
          {trade.sold && pnl != null && (
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">P&L</p>
              <p className={`text-lg font-bold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                {pnlPos ? '+' : ''}{fmt(pnl, trade.purchaseCurrency)}
              </p>
            </div>
          )}

          {/* Status badge */}
          <div className="px-6 py-4 flex items-center justify-between">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${trade.sold ? 'bg-zinc-700 text-zinc-300' : 'bg-green-900/40 text-green-400'}`}>
              {trade.sold ? `Sold ${trade.saleDate || ''}` : 'Holding'}
            </span>
            {trade.screenshotUrl && (
              <a
                href={trade.screenshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-400 hover:underline"
              >
                View screenshot →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
