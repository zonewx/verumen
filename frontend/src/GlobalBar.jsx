import { useState, useEffect, useRef } from 'react';

export const MARKET_INDEXES = [
  { id: 'sp500',    label: 'S&P 500',              short: 'S&P 500', ticker: '^GSPC',      country: 'us' },
  { id: 'nasdaq100',label: 'NASDAQ 100',            short: 'NASDAQ 100', ticker: '^NDX',       country: 'us' },
  { id: 'omxs30',  label: 'OMXS30',                short: 'OMXS30',  ticker: '^OMX',       country: 'se' },
  { id: 'omxc25',  label: 'OMX Copenhagen 25',      short: 'OMXC25',  ticker: '^OMXC25',    country: 'dk' },
  { id: 'omxh25',  label: 'OMX Helsinki 25',        short: 'OMXH25',  ticker: '^OMXH25',    country: 'fi' },
  { id: 'osebx',   label: 'OSEBX Oslo',             short: 'OSEBX',   ticker: '^OSEAX',     country: 'no' },
  { id: 'dax',     label: 'DAX',                    short: 'DAX',     ticker: '^GDAXI',     country: 'de' },
  { id: 'tsx',     label: 'S&P/TSX Composite',      short: 'TSX',     ticker: '^GSPTSE',    country: 'ca' },
];

const STORAGE_KEY = 'marketIndexes';
const REFRESH_MS  = 60_000;

function authHeader() {
  const t = sessionStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function fmt(n) {
  return n?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—';
}

const QUOTES_CACHE_KEY = 'market_quotes_cache';

function MarketTicker({ isDark }) {
  const [quotes, setQuotes]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(QUOTES_CACHE_KEY)) || []; } catch { return []; }
  });
  const [selected, setSelected] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  });
  const [isOverflow, setIsOverflow] = useState(false);
  const [scrollPx, setScrollPx]     = useState(0);
  const containerRef = useRef(null);
  const firstCopyRef = useRef(null); // ref on the FIRST copy only — always measures single-copy width
  const intervalRef  = useRef(null);

  useEffect(() => {
    const onStorage = () => {
      try { setSelected(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []); } catch {}
    };
    window.addEventListener('marketIndexes-updated', onStorage);
    return () => window.removeEventListener('marketIndexes-updated', onStorage);
  }, []);

  useEffect(() => {
    const check = () => {
      if (!containerRef.current || !firstCopyRef.current) return;
      const w  = firstCopyRef.current.scrollWidth;
      const cw = containerRef.current.clientWidth;
      setScrollPx(w);
      setIsOverflow(w > cw);
    };
    requestAnimationFrame(() => setTimeout(check, 0));
    const ro = new ResizeObserver(() => setTimeout(check, 0));
    if (containerRef.current) ro.observe(containerRef.current);
    const mo = new MutationObserver(() => setTimeout(check, 0));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', check);
    return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', check); };
  }, [quotes, selected]);

  useEffect(() => {
    // Always fetch ALL indexes regardless of selection — data is cached so
    // selecting/deselecting an index shows its price instantly with no extra request.
    const allTickers = MARKET_INDEXES.map(m => m.ticker).join(',');
    const fetch_ = () =>
      fetch(`/api/market-indexes?symbols=${encodeURIComponent(allTickers)}`, { headers: authHeader() })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data) && data.length > 0) { setQuotes(data); localStorage.setItem(QUOTES_CACHE_KEY, JSON.stringify(data)); } })
        .catch(() => {});
    fetch_();
    intervalRef.current = setInterval(fetch_, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, []);

  const displayQuotes = quotes.filter(q => selected.some(id => MARKET_INDEXES.find(m => m.id === id)?.ticker === q.symbol));
  if (!selected.length || !displayQuotes.length) return null;

  const divider  = isDark ? 'border-gray-700' : 'border-gray-200';
  const labelCls = isDark ? 'text-gray-100' : 'text-gray-700';
  const valCls   = isDark ? 'text-gray-200' : 'text-gray-800';

  const renderItems = () => displayQuotes.map((q, i) => {
    const meta   = MARKET_INDEXES.find(m => m.ticker === q.symbol);
    const pos    = q.changePct >= 0;
    const pctCls = pos ? 'text-green-400' : 'text-red-400';
    return (
      <div key={q.symbol} className={`flex flex-col items-start leading-tight text-xs px-2 shrink-0 ${i > 0 ? `border-l ${divider}` : ''}`}>
        <div className="flex items-center gap-1">
          {meta?.country && <img src={`https://flagcdn.com/${meta.country}.svg`} alt={meta.country} className="w-3.5 h-2.5 object-cover shrink-0" />}
          <span className={`font-medium ${labelCls}`}>{meta?.short ?? q.symbol}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`font-mono ${valCls}`}>{fmt(q.price)}</span>
          <span className={`font-semibold ${pctCls}`}>{pos ? '▲' : '▼'}{Math.abs(q.changePct).toFixed(2)}%</span>
        </div>
      </div>
    );
  });

  return (
    <div ref={containerRef} className={`hidden md:flex flex-1 min-w-0 items-center border-r mr-2 pr-3 overflow-hidden ${divider}`}>
      <div
        className={`flex items-center gap-3 whitespace-nowrap${isOverflow ? ' marquee-scroll' : ''}`}
        style={isOverflow ? { '--marquee-offset': `-${scrollPx}px` } : {}}
      >
          {/* First copy — always present, measured via firstCopyRef */}
          <div ref={firstCopyRef} className="flex items-center gap-3">
            {renderItems()}
          </div>
          {/* Second copy — only rendered for the seamless loop */}
          {isOverflow && (
            <div className="flex items-center gap-3 pl-3">
              {renderItems()}
            </div>
          )}
        </div>
      </div>
  );
}

export default function GlobalBar({ isDark, authUsername, onNavigate, onLogout, userRole, searchInputRef }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const timerRef = useRef(null);
  const searchRef = useRef(null);
  const inputRef = searchInputRef || useRef(null);

  useEffect(() => {
    fetch(`/api/users/${authUsername}/profile`, { headers: { ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) } })
      .then(r => r.json()).then(setProfile).catch(() => {});
    fetch('/api/friends/pending-count', { headers: { ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) } })
      .then(r => r.json()).then(d => setPendingCount(d.count || 0)).catch(() => {});
  }, [authUsername]);

  useEffect(() => {
    const handler = () => {
      fetch(`/api/users/${authUsername}/profile`, { headers: { ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) } })
        .then(r => r.json()).then(setProfile).catch(() => {});
    };
    const friendHandler = () => {
      fetch('/api/friends/pending-count', { headers: { ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) } })
        .then(r => r.json()).then(d => setPendingCount(d.count || 0)).catch(() => {});
    };
    window.addEventListener('profile-updated', handler);
    window.addEventListener('friends-updated', friendHandler);
    return () => { window.removeEventListener('profile-updated', handler); window.removeEventListener('friends-updated', friendHandler); };
  }, [authUsername]);

  function handleSearchInput(e) {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const users = await fetch('/api/users', { headers: { ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) } }).then(r => r.json());
        setResults(users.filter(u => u.username.toLowerCase().includes(q.toLowerCase()) || (u.bio || '').toLowerCase().includes(q.toLowerCase())));
      } catch(e) {}
      setSearching(false);
    }, 250);
  }

  function handleSelectUser(username) {
    setSearch(''); setResults([]);
    onNavigate('view-profile', username);
  }

  useEffect(() => {
    const close = e => { if (searchRef.current && !searchRef.current.contains(e.target)) setResults([]); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const roleBadgeColor = { admin: 'text-red-400', moderator: 'text-blue-400' };

  const avatarContent = profile?.avatarBase64
    ? <img src={profile.avatarBase64} alt="avatar" className="w-full h-full object-cover" />
    : <span className="text-xs font-bold">{authUsername?.[0]?.toUpperCase() ?? ''}</span>;

  return (
    <div className={`fixed top-0 right-0 z-50 h-12 flex items-center px-4 ${isDark ? 'bg-gray-900' : 'bg-white'}`} style={{ left: 'var(--sidebar-w, 240px)' }}>
      {/* Center — Search (absolutely centered so ticker width never shifts it) */}
      <div ref={searchRef} className="absolute left-1/2 -translate-x-1/2 w-full max-w-md z-10">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <svg width="16" height="16" viewBox="0 0 28 28" fill="none" className="shrink-0">
            <rect width="28" height="28" rx="6" fill="#0f1e3c"/>
            <path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isDark ? 'text-gray-500' : 'text-gray-400'}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input ref={inputRef} value={search} onChange={handleSearchInput} placeholder="Search users..."
            className={`bg-transparent outline-none flex-1 text-sm ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`} />
          {searching && <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0"/>}
        </div>
        {results.length > 0 && (
          <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl overflow-hidden z-50 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            {results.map(u => {
              const rb = { admin: 'bg-red-900/40 text-red-400 border border-red-800', moderator: 'bg-blue-900/40 text-blue-400 border border-blue-800' };
              return (
                <button key={u.username} onClick={() => handleSelectUser(u.username)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} last:border-0`}>
                  <div className="w-7 h-7 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
                    {u.avatarBase64 ? <img src={u.avatarBase64} className="w-full h-full object-cover"/> : u.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">{u.username}</span>
                      {u.role && rb[u.role] && <span className={`text-xs px-1.5 py-0.5 rounded-full ${rb[u.role]}`}>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>}
                    </div>
                    {u.bio && <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{u.bio}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {search.length >= 2 && !searching && results.length === 0 && (
          <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl px-4 py-3 text-sm ${isDark ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-white border-gray-200 text-gray-500'}`}>
            No users found for "{search}"
          </div>
        )}
      </div>

      {/* Spacer: pushes right section to start exactly after the search bar ends.
           50% = bar centre, +224px = half of max-w-md (14rem @ 16px base font). */}
      <div className="shrink-0" style={{ width: 'calc(50% + 224px)' }} />
      {/* Right — fills all remaining space after the search bar */}
      <div className="flex flex-1 min-w-0 items-center gap-1">
        <MarketTicker isDark={isDark} />
        {/* Friends with notification dot */}
        <button onClick={() => onNavigate('friends')} title="Friends" className={`relative p-1.5 rounded-lg shrink-0 ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>

        {/* Logout */}
        <button onClick={() => onLogout()} title="Sign out" className={`p-1.5 rounded-lg ml-1 shrink-0 ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'} transition`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
