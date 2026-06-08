const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];

export function EmptyState({ title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h3 className="text-lg font-semibold text-zinc-300 mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 max-w-xs mb-6">{desc}</p>
      {action && <button onClick={action.fn} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-semibold transition">{action.label}</button>}
    </div>
  );
}

export function ShortcutsModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-800 border-zinc-700 border rounded-2xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">Keyboard shortcuts</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg">✕</button>
        </div>
        {[['Space / /','Focus search'],['?','Show shortcuts'],['Esc','Close / unfocus']].map(([key, desc]) => (
          <div key={key} className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-0">
            <span className="text-sm text-zinc-300">{desc}</span>
            <kbd className="bg-zinc-700 text-zinc-200 text-xs font-mono px-2 py-1 rounded">{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return null;
  let ca = -Math.PI / 2;
  const cx = 120, cy = 120, r = 90, inner = 52;
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(ca), y1 = cy + r * Math.sin(ca);
    ca += angle;
    const x2 = cx + r * Math.cos(ca), y2 = cy + r * Math.sin(ca);
    const ix1 = cx + inner * Math.cos(ca - angle), iy1 = cy + inner * Math.sin(ca - angle);
    const ix2 = cx + inner * Math.cos(ca), iy2 = cy + inner * Math.sin(ca);
    const large = angle > Math.PI ? 1 : 0;
    return { path: `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1} Z`, color: COLORS[i % COLORS.length], pct: ((d.value / total) * 100).toFixed(1), name: d.name };
  });
  return (
    <div className="flex flex-col lg:flex-row items-center gap-8">
      <svg width="240" height="240" viewBox="0 0 240 240" className="shrink-0">{slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity="0.9" />)}</svg>
      <div className="flex flex-col gap-2 w-full">{slices.map((s, i) => <div key={i} className="flex items-center gap-3"><div className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} /><span className="text-sm text-zinc-300 flex-1">{s.name}</span><span className="text-sm font-bold">{s.pct}%</span></div>)}</div>
    </div>
  );
}

export function LineChart({ data, loading }) {
  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin"/></div>;
  if (!data?.length) return <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">No data for this period.</div>;
  const W = 800, H = 260, PL = 52, PR = 16, PT = 16, PB = 32;
  const cw = W - PL - PR, ch = H - PT - PB;
  const vals = data.map(d => d.returnPct);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1, pad = range * 0.1;
  const lo = minV - pad, hi = maxV + pad;
  const tx = i => PL + (i / (data.length - 1)) * cw;
  const ty = v => PT + ch - ((v - lo) / (hi - lo)) * ch;
  const pts = data.map((d, i) => `${tx(i)},${ty(d.returnPct)}`).join(' ');
  const fillPts = `${PL},${PT + ch} ` + data.map((d, i) => `${tx(i)},${ty(d.returnPct)}`).join(' ') + ` ${tx(data.length - 1)},${PT + ch}`;
  const lastVal = vals[vals.length - 1], positive = lastVal >= 0;
  const lineColor = positive ? '#10b981' : '#ef4444';
  const gridVals = Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * i / 4);
  const labelIdxs = Array.from({ length: Math.min(6, data.length) }, (_, i) => Math.round(i * (data.length - 1) / (Math.min(6, data.length) - 1)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 260 }}>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity="0.25"/><stop offset="100%" stopColor={lineColor} stopOpacity="0"/></linearGradient></defs>
      {gridVals.map((v, i) => (<g key={i}><line x1={PL} y1={ty(v)} x2={W - PR} y2={ty(v)} stroke="#374151" strokeWidth="0.5"/><text x={PL - 4} y={ty(v) + 4} textAnchor="end" fontSize="10" fill="#6b7280">{v.toFixed(1)}%</text></g>))}
      {ty(0) > PT && ty(0) < PT + ch && <line x1={PL} y1={ty(0)} x2={W - PR} y2={ty(0)} stroke="#4b5563" strokeWidth="1" strokeDasharray="4,3"/>}
      <polygon points={fillPts} fill="url(#cg)"/>
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {labelIdxs.map(i => <text key={i} x={tx(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b7280">{data[i].date.slice(5)}</text>)}
      <circle cx={tx(data.length - 1)} cy={ty(lastVal)} r="4" fill={lineColor}/>
    </svg>
  );
}

export function TodayCards({ data, sortMode, fmt, fmtSym }) {
  const sorted = [...data].filter(s => s.todayChangePct != null).sort((a, b) => sortMode === 'currency' ? (b.todayGainBase ?? 0) - (a.todayGainBase ?? 0) : b.todayChangePct - a.todayChangePct);
  const best = sorted.slice(0, 3), worst = [...sorted].reverse().slice(0, 3);
  const Card = ({ s }) => {
    const pos = s.todayChangePct >= 0;
    return (
      <div className={`rounded-xl p-4 flex flex-col gap-2.5 border-l-2 ${pos ? 'border-l-emerald-500' : 'border-l-red-500'} bg-zinc-800 border border-zinc-700`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] truncate text-zinc-400">{s.ticker}</span>
          <span className={`text-xs font-bold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>{`${pos ? '+' : ''}${s.todayChangePct.toFixed(2)}%`}</span>
        </div>
        <div className="text-sm font-semibold truncate flex items-center gap-1.5 text-zinc-200">
          <img src={`https://flagcdn.com/${s.flag}.svg`} alt={s.flag} className="w-4 h-3 object-cover rounded-sm shrink-0" />
          {s.cleanName || s.name}
        </div>
        <div className="text-xs text-zinc-400">{fmt(s.nativePrice)} {s.currency}</div>
        <div className={`text-xs font-semibold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>{`${s.todayGainBase >= 0 ? '+' : ''}${fmtSym(s.todayGainBase)}`}</div>
      </div>
    );
  };
  const labelCls = 'text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <div className="flex items-center gap-2 mb-4"><div className="w-0.5 h-4 bg-emerald-500 rounded-full"/><h3 className={labelCls}>Best Today</h3></div>
        <div className="grid grid-cols-3 gap-3">{best.map(s => <Card key={s.ticker} s={s}/>)}</div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-4"><div className="w-0.5 h-4 bg-red-500 rounded-full"/><h3 className={labelCls}>Worst Today</h3></div>
        <div className="grid grid-cols-3 gap-3">{worst.map(s => <Card key={s.ticker} s={s}/>)}</div>
      </div>
    </div>
  );
}
