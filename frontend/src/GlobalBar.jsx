import { useState, useEffect, useRef } from 'react';
import { getToken } from './tokenStore';

export default function GlobalBar({ authUsername, onNavigate, onLogout, userRole, searchInputRef }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const timerRef = useRef(null);
  const searchRef = useRef(null);
  const inputRef = searchInputRef || useRef(null);

  useEffect(() => {
    fetch(`/api/users/${authUsername}/profile`, { headers: { ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) } })
      .then(r => r.json()).then(setProfile).catch(() => {});
    fetch('/api/friends/pending-count', { headers: { ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) } })
      .then(r => r.json()).then(d => setPendingCount(d.count || 0)).catch(() => {});
  }, [authUsername]);

  useEffect(() => {
    const handler = () => {
      fetch(`/api/users/${authUsername}/profile`, { headers: { ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) } })
        .then(r => r.json()).then(setProfile).catch(() => {});
    };
    const friendHandler = () => {
      fetch('/api/friends/pending-count', { headers: { ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) } })
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
        const users = await fetch('/api/users', { headers: { ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) } }).then(r => r.json());
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
    <div className={`fixed top-0 right-0 z-50 h-[40px] flex items-center px-4 bg-zinc-900`} style={{ left: 'var(--sidebar-w, 240px)' }}>
      {/* Center — Search (absolutely centered so ticker width never shifts it) */}
      <div ref={searchRef} className="absolute left-1/2 -translate-x-1/2 w-full max-w-md z-10">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm bg-zinc-800 border-zinc-700`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input ref={inputRef} value={search} onChange={handleSearchInput} placeholder="Search users..."
            className={`bg-transparent outline-none flex-1 text-sm text-white placeholder-zinc-500`} />
          {searching
            ? <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin shrink-0"/>
            : !search && <kbd className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-zinc-700/50 border-zinc-600 text-zinc-500 leading-none tracking-wide select-none">SPACE</kbd>
          }
        </div>
        {results.length > 0 && (
          <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl overflow-hidden z-50 bg-zinc-800 border-zinc-700`}>
            {results.map(u => {
              const rb = { admin: 'bg-red-900/40 text-red-400 border border-red-800', moderator: 'bg-blue-900/40 text-blue-400 border border-blue-800' };
              return (
                <button key={u.username} onClick={() => handleSelectUser(u.username)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition hover:bg-zinc-700 border-b border-zinc-700 last:border-0`}>
                  <div className="w-7 h-7 rounded-full bg-zinc-600 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
                    {u.avatarBase64 ? <img src={u.avatarBase64} className="w-full h-full object-cover"/> : u.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">{u.username}</span>
                      {u.role && rb[u.role] && <span className={`text-xs px-1.5 py-0.5 rounded-full ${rb[u.role]}`}>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>}
                    </div>
                    {u.bio && <p className={`text-xs truncate text-zinc-400`}>{u.bio}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {search.length >= 2 && !searching && results.length === 0 && (
          <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl px-4 py-3 text-sm bg-zinc-800 border-zinc-700 text-zinc-400`}>
            No users found for "{search}"
          </div>
        )}
      </div>

      {/* Right — pushed to far right, ticker clips when too wide */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {/* Friends with notification dot */}
        <button onClick={() => onNavigate('friends')} title="Friends" className={`relative p-1.5 rounded-lg shrink-0 text-zinc-400 hover:text-white hover:bg-zinc-800 transition`}>
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
        <button onClick={() => onLogout()} title="Sign out" className={`p-1.5 rounded-lg ml-1 shrink-0 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
