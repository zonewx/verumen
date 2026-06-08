import { EmptyState } from './PortfolioComponents';

const TX_TYPE_CFG = [
  { key: 'buy',         label: 'Buy',         activeCls: 'bg-emerald-900/60 text-emerald-400 border-emerald-700/50' },
  { key: 'sell',        label: 'Sell',        activeCls: 'bg-red-900/60 text-red-400 border-red-700/50' },
  { key: 'dividend',    label: 'Dividend',    activeCls: 'bg-blue-900/60 text-blue-400 border-blue-700/50' },
  { key: 'deposit',     label: 'Deposit',     activeCls: 'bg-green-900/60 text-green-400 border-green-700/50' },
  { key: 'withdrawal',  label: 'Withdrawal',  activeCls: 'bg-zinc-600 text-zinc-200 border-zinc-500' },
  { key: 'foreign-tax', label: 'Foreign Tax', activeCls: 'bg-zinc-600 text-zinc-200 border-zinc-500' },
  { key: 'other',       label: 'Other',       activeCls: 'bg-zinc-600 text-zinc-200 border-zinc-500' },
];

export default function TransactionHistoryTab({
  txHistory, txHistoryLoading,
  txSearch, setTxSearch,
  txTypeFilter, setTxTypeFilter,
  txFilterOpen, setTxFilterOpen,
  txDateFrom, setTxDateFrom,
  txDateTo, setTxDateTo,
  txDateOpen, setTxDateOpen,
  txCalView, setTxCalView,
  txCalFromMonth, setTxCalFromMonth,
  txCalToMonth, setTxCalToMonth,
  sym, fmt, cardCls,
}) {
  const COLS = [
    { label: 'Date',           w: 'w-[100px]', align: '' },
    { label: 'Type',           w: 'w-[130px]', align: '' },
    { label: 'Source',         w: 'w-[100px]', align: '' },
    { label: 'Ticker',         w: 'w-[120px]', align: '' },
    { label: 'Name',           w: 'w-[220px]', align: '' },
    { label: 'Qty',            w: 'w-[75px]',  align: 'text-right' },
    { label: 'Price',          w: 'w-[105px]', align: 'text-right' },
    { label: `Total (${sym})`, w: 'w-[140px]', align: 'text-right' },
  ];

  const presentTypes = new Set(txHistory.map(t => t.type));
  const visibleTypes = TX_TYPE_CFG.filter(t => presentTypes.has(t.key));
  const toggleType = key => setTxTypeFilter(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]);
  const activeFilterCount = txTypeFilter.length + (txDateFrom ? 1 : 0) + (txDateTo ? 1 : 0);

  const q = txSearch.trim().toLowerCase();
  const filteredTx = txHistory.filter(tx => {
    if (txTypeFilter.length > 0 && !txTypeFilter.includes(tx.type)) return false;
    if (txDateFrom && tx.date < txDateFrom) return false;
    if (txDateTo   && tx.date > txDateTo)   return false;
    if (!q) return true;
    return (tx.ticker||'').toLowerCase().includes(q) ||
           (tx.name||'').toLowerCase().includes(q) ||
           (tx.date||'').includes(q);
  });
  const capped = filteredTx.slice(0, 500);

  const today = new Date();
  const toDateStr = d => d.toISOString().split('T')[0];
  const fmtDateShort = s => s ? new Date(s + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const addMonths = (d, n) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };

  const DATE_PRESETS = [
    { label: '3 months', from: toDateStr(addMonths(today, -3)),  to: toDateStr(today) },
    { label: 'This year', from: `${today.getFullYear()}-01-01`,  to: toDateStr(today) },
    { label: '1 year',    from: toDateStr(addMonths(today, -12)), to: toDateStr(today) },
    { label: 'Last year', from: `${today.getFullYear()-1}-01-01`, to: `${today.getFullYear()-1}-12-31` },
    { label: 'All time',  from: '', to: '' },
  ];

  const renderCal = (selected, onSelect, calMonth, setCalMonth) => {
    const { year, month } = calMonth;
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = toDateStr(today);
    const prevMo = () => setCalMonth(p => { const d = new Date(p.year, p.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; });
    const nextMo = () => setCalMonth(p => { const d = new Date(p.year, p.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; });
    const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    const monthLabel = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return (
      <div className="px-3 pb-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevMo} className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </button>
          <span className="text-xs font-medium text-zinc-200">{monthLabel}</span>
          <button onClick={nextMo} className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => <div key={d} className="text-center text-[10px] text-zinc-600 py-0.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {cells.map((d, i) => {
            if (!d) return <div key={i}/>;
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isSel = ds === selected;
            const inRange = txDateFrom && txDateTo && ds > txDateFrom && ds < txDateTo;
            const isToday = ds === todayStr;
            return (
              <button key={i} onClick={() => onSelect(ds)} className={`text-[11px] w-full aspect-square rounded flex items-center justify-center leading-none transition
                ${isSel ? 'bg-violet-500 text-white font-bold' : inRange ? 'bg-violet-500/20 text-zinc-200' : isToday ? 'border border-zinc-600 text-white' : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (txHistory.length === 0 && !txHistoryLoading) {
    return <EmptyState title="No transactions" desc="Upload a CSV to populate history." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cardCls}>
        {/* Toolbar — single row */}
        <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center gap-2">
          {/* Filters dropdown */}
          <div className="relative shrink-0">
            {txFilterOpen && <div className="fixed inset-0 z-10" onClick={() => setTxFilterOpen(false)}/>}
            <button onClick={() => setTxFilterOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${txFilterOpen || activeFilterCount > 0 ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-transparent border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M11 20h2"/></svg>
              Filters
              {activeFilterCount > 0 && <span className="flex items-center justify-center w-4 h-4 rounded-full bg-violet-500 text-white text-[10px] font-bold leading-none">{activeFilterCount}</span>}
            </button>
            {txFilterOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-3 min-w-[180px]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Transaction type</p>
                <div className="flex flex-col gap-0.5">
                  {visibleTypes.map(({ key, label }) => {
                    const checked = txTypeFilter.includes(key);
                    return (
                      <button key={key} onClick={() => toggleType(key)}
                        className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-left transition ${checked ? 'bg-zinc-700/80 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}>
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${checked ? 'bg-violet-500 border-violet-500' : 'border-zinc-600'}`}>
                          {checked && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {txTypeFilter.length > 0 && (
                  <button onClick={() => setTxTypeFilter([])} className="mt-2 pt-2 border-t border-zinc-700/50 text-xs text-zinc-500 hover:text-zinc-300 transition w-full text-left">
                    Clear selection
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Date range picker */}
          <div className="relative shrink-0">
            {txDateOpen && <div className="fixed inset-0 z-10" onClick={() => setTxDateOpen(false)}/>}
            <button onClick={() => { setTxDateOpen(o => { if (!o) { setTxCalView('from'); if (txDateFrom) { const d = new Date(txDateFrom+'T00:00'); setTxCalFromMonth({ year: d.getFullYear(), month: d.getMonth() }); } } return !o; }); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition whitespace-nowrap ${txDateOpen || txDateFrom || txDateTo ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-transparent border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'}`}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              {txDateFrom || txDateTo ? `${fmtDateShort(txDateFrom) || '…'} — ${fmtDateShort(txDateTo) || '…'}` : 'Date range'}
              {(txDateFrom || txDateTo) && <span onClick={e => { e.stopPropagation(); setTxDateFrom(''); setTxDateTo(''); }} className="ml-0.5 text-zinc-400 hover:text-white leading-none text-base">×</span>}
            </button>
            {txDateOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-72 overflow-hidden">
                <div className="p-3 border-b border-zinc-800 flex flex-wrap gap-1.5">
                  {DATE_PRESETS.map(p => (
                    <button key={p.label} onClick={() => { setTxDateFrom(p.from); setTxDateTo(p.to); }}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition ${txDateFrom === p.from && txDateTo === p.to ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-transparent border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="border-b border-zinc-800">
                  <button onClick={() => setTxCalView(v => v === 'from' ? null : 'from')} className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-zinc-800/50 transition">
                    <span className="text-zinc-400 font-medium">From</span>
                    <div className="flex items-center gap-2">
                      {txDateFrom ? <span className="text-zinc-200">{fmtDateShort(txDateFrom)}</span> : <span className="text-zinc-600">Not set</span>}
                      <svg className={`w-3 h-3 text-zinc-500 transition-transform ${txCalView === 'from' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </button>
                  {txCalView === 'from' && renderCal(txDateFrom, date => { setTxDateFrom(date); const d = new Date(date+'T00:00'); setTxCalToMonth({ year: d.getFullYear(), month: d.getMonth() }); setTxCalView('to'); }, txCalFromMonth, setTxCalFromMonth)}
                </div>
                <div>
                  <button onClick={() => setTxCalView(v => v === 'to' ? null : 'to')} className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-zinc-800/50 transition">
                    <span className="text-zinc-400 font-medium">To</span>
                    <div className="flex items-center gap-2">
                      {txDateTo ? <span className="text-zinc-200">{fmtDateShort(txDateTo)}</span> : <span className="text-zinc-600">Not set</span>}
                      <svg className={`w-3 h-3 text-zinc-500 transition-transform ${txCalView === 'to' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </button>
                  {txCalView === 'to' && renderCal(txDateTo, date => { setTxDateTo(date); setTxCalView(null); }, txCalToMonth, setTxCalToMonth)}
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input type="text" placeholder="Search ticker, name, date…" value={txSearch} onChange={e => setTxSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition"/>
            {txSearch && (
              <button onClick={() => setTxSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>

          {/* Count */}
          <span className="text-xs text-zinc-400 shrink-0 tabular-nums">
            {filteredTx.length === txHistory.length ? `${txHistory.length} transactions` : `${filteredTx.length} of ${txHistory.length}`}
          </span>
        </div>

        {/* Table — own overflow wrapper so toolbar dropdowns can escape the card */}
        <div className="overflow-hidden rounded-b-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm table-fixed">
              <colgroup>{COLS.map(({ w }, ci) => <col key={ci} className={w}/>)}</colgroup>
              <thead className="bg-zinc-900 border-zinc-700 border-b">
                <tr>{COLS.map(({ label, align }) => <th key={label} className={`px-4 py-3 font-bold text-xs text-zinc-400 uppercase tracking-wider ${align}`}>{label}</th>)}</tr>
              </thead>
              <tbody>
                {capped.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-500">No transactions match your search.</td></tr>
                ) : capped.map((tx, i) => {
                  const typeCfg = TX_TYPE_CFG.find(c => c.key === tx.type);
                  const typeBadgeCls = typeCfg?.activeCls || 'bg-zinc-700/40 text-zinc-300 border-zinc-600/50';
                  const typeLabel = typeCfg?.label || tx.type;
                  return (
                    <tr key={i} className={`border-t border-zinc-700/30 ${i % 2 === 1 ? 'bg-zinc-700/20' : ''} hover:bg-zinc-700/30 transition`}>
                      <td className="px-4 py-3 text-xs font-mono text-zinc-300">{tx.date}</td>
                      <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap ${typeBadgeCls}`}>{typeLabel}</span></td>
                      <td className="px-4 py-3">{tx.broker ? <span className="text-xs text-zinc-300 capitalize">{tx.broker}</span> : <span className="text-zinc-500">—</span>}</td>
                      <td className="px-4 py-3 overflow-hidden"><span className={`font-mono font-bold text-sm ${tx.ticker ? 'text-white' : 'text-zinc-500'}`}>{tx.ticker || '—'}</span></td>
                      <td className="px-4 py-3 overflow-hidden truncate text-zinc-200">{tx.name}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">{tx.quantity}</td>
                      <td className="px-4 py-3 text-right text-zinc-300">{fmt(tx.price)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${tx.total >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(tx.total)} {sym}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredTx.length > 500 && (
            <div className="px-4 py-3 border-t border-zinc-700/50 text-xs text-zinc-500 text-center">
              Showing 500 of {filteredTx.length} — use search or filters to narrow results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
