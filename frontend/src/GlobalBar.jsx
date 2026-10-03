import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getToken } from './tokenStore';
import { TOPBAR_H, contentColumn, focusRing } from './ui';

const authHeader = () => (getToken() ? { Authorization: `Bearer ${getToken()}` } : {});

const svg = (children, size = 15) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const Icons = {
  grid: svg(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>),
  box: svg(<><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/><path d="m7.5 4.27 9 5.15"/></>),
  swap: svg(<><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>),
  db: svg(<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>),
  users: svg(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
  bell: svg(<><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>),
  pulse: svg(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>),
  user: svg(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
  pencil: svg(<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>),
  logout: svg(<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>),
  cog: svg(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>, 18),
  friends: svg(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>, 18),
  search: svg(<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>, 14),
  chevron: svg(<path d="m6 9 6 6 6-6"/>, 14),
  menu: svg(<><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></>, 20),
};

const SKINS_MENU = [
  { label: 'Overview', path: '/skins/overview', icon: Icons.grid },
  { label: 'Steam Inventory', path: '/skins/inventory', icon: Icons.box },
  { label: 'Trade Registry', path: '/skins/traderegistry', icon: Icons.swap },
];
const ADMIN_MENU = [
  { label: 'Overview', path: '/adminpanel', icon: Icons.grid },
  { label: 'Database', path: '/adminpanel/database', icon: Icons.db },
  { label: 'User Management', path: '/adminpanel/users', icon: Icons.users },
  { label: 'Announcements', path: '/adminpanel/announcements', icon: Icons.bell },
  { label: 'Diagnostics', path: '/adminpanel/diagnostics', icon: Icons.pulse },
];

// Top-level nav entries. A `menu` makes it a dropdown; `match` decides when it's the active section.
function navFor(role) {
  const items = [
    { id: 'feed', label: 'Feed', path: '/feed', match: p => p === '/feed' },
    { id: 'skins', label: 'Skins', menu: SKINS_MENU, match: p => p.startsWith('/skins') },
  ];
  if (role === 'admin') items.push({ id: 'admin', label: 'Admin Panel', menu: ADMIN_MENU, match: p => p.startsWith('/adminpanel') });
  if (role === 'moderator') items.push({ id: 'moderator', label: 'Moderator Panel', path: '/moderatorpanel', match: p => p.startsWith('/moderatorpanel') });
  return items;
}

const navText = active => `relative h-full flex items-center gap-1 px-3 text-sm font-medium transition-colors ${active ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'} ${focusRing} rounded-md`;
const ActiveMark = () => <span className="absolute left-3 right-3 bottom-0 h-0.5 rounded-full bg-emerald-500" aria-hidden="true" />;
const panel = 'absolute mt-2 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/40 p-1.5 z-50';
const iconBtn = active => `relative w-9 h-9 flex items-center justify-center rounded-lg transition ${active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'} ${focusRing}`;

function MenuItem({ item, active, onSelect }) {
  return (
    <button role="menuitem" onClick={() => onSelect(item.path)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left whitespace-nowrap transition ${active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'} ${focusRing}`}>
      <span className={active ? 'text-emerald-400' : 'text-zinc-500'}>{item.icon}</span>
      {item.label}
    </button>
  );
}

export default function GlobalBar({ authUsername, onLogout, userRole, searchInputRef }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(null); // which menu is open: a nav id, 'avatar' or 'mobile'
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const timerRef = useRef(null);
  const barRef = useRef(null);
  const searchRef = useRef(null);
  const ownInputRef = useRef(null);
  const inputRef = searchInputRef || ownInputRef;
  const nav = navFor(userRole);

  const loadProfile = () => fetch(`/api/users/${authUsername}/profile`, { headers: authHeader() }).then(r => r.json()).then(setProfile).catch(() => {});
  const loadPending = () => fetch('/api/friends/pending-count', { headers: authHeader() }).then(r => r.json()).then(d => setPendingCount(d.count || 0)).catch(() => {});
  useEffect(() => { loadProfile(); loadPending(); }, [authUsername]);
  useEffect(() => {
    window.addEventListener('profile-updated', loadProfile);
    window.addEventListener('friends-updated', loadPending);
    return () => { window.removeEventListener('profile-updated', loadProfile); window.removeEventListener('friends-updated', loadPending); };
  }, [authUsername]);

  // Close menus on navigation, outside click and Escape
  useEffect(() => { setOpen(null); }, [pathname]);
  useEffect(() => {
    const onDown = e => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(null);
      if (searchRef.current && !searchRef.current.contains(e.target)) setResults([]);
    };
    const onKey = e => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  const go = path => { setOpen(null); navigate(path); };
  const toggle = id => setOpen(o => (o === id ? null : id));

  function handleSearchInput(e) {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const users = await fetch('/api/users', { headers: authHeader() }).then(r => r.json());
        const lq = q.toLowerCase();
        setResults(users.filter(u => u.username.toLowerCase().includes(lq) || (u.bio || '').toLowerCase().includes(lq)));
      } catch {}
      setSearching(false);
    }, 250);
  }
  const selectUser = username => { setSearch(''); setResults([]); navigate(`/user/${username}`); };

  const roleBadge = { admin: 'bg-red-900/40 text-red-400 border border-red-800', moderator: 'bg-blue-900/40 text-blue-400 border border-blue-800' };
  const avatar = (size) => (
    <span className={`${size} rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0`}>
      {profile?.avatarBase64 ? <img src={profile.avatarBase64} alt="" className="w-full h-full object-cover" /> : authUsername?.[0]?.toUpperCase()}
    </span>
  );

  return (
    <header ref={barRef} className="fixed top-0 inset-x-0 z-50 bg-zinc-900 border-b border-zinc-800" style={{ height: TOPBAR_H }}>
      <div className={`${contentColumn} h-full px-6 flex items-center gap-2`}>

        {/* Mobile menu button (nav doesn't fit below lg) */}
        <button onClick={() => toggle('mobile')} aria-label="Menu" aria-expanded={open === 'mobile'} className={`lg:hidden -ml-2 ${iconBtn(open === 'mobile')}`}>{Icons.menu}</button>

        <button onClick={() => go('/feed')} className={`text-[19px] font-bold text-white mr-4 rounded-md ${focusRing}`} style={{ fontFamily: "'Geist', sans-serif", letterSpacing: '-0.03em' }}>
          Verumen
        </button>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-stretch h-full" aria-label="Main">
          {nav.map(item => {
            const active = item.match(pathname);
            if (!item.menu) {
              return (
                <button key={item.id} onClick={() => go(item.path)} className={navText(active)} aria-current={active ? 'page' : undefined}>
                  {item.label}{active && <ActiveMark />}
                </button>
              );
            }
            const isOpen = open === item.id;
            return (
              <div key={item.id} className="relative h-full flex items-stretch">
                <button onClick={() => toggle(item.id)} className={navText(active || isOpen)} aria-haspopup="menu" aria-expanded={isOpen}>
                  {item.label}
                  <span className={`text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>{Icons.chevron}</span>
                  {active && <ActiveMark />}
                </button>
                {isOpen && (
                  <div role="menu" className={`${panel} left-0 top-full w-max`}>
                    {item.menu.map(m => <MenuItem key={m.path} item={m} active={pathname === m.path} onSelect={go} />)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* User search */}
          <div ref={searchRef} className="relative hidden md:block w-64 xl:w-72 mr-1">
            <div className="flex items-center gap-2 px-3 h-9 rounded-lg border bg-zinc-800/70 border-zinc-700 focus-within:border-zinc-500 transition">
              <span className="text-zinc-500">{Icons.search}</span>
              <input ref={inputRef} value={search} onChange={handleSearchInput} placeholder="Search users"
                onKeyDown={e => { if (e.key === 'Escape') { clearTimeout(timerRef.current); setSearch(''); setResults([]); setSearching(false); inputRef.current?.blur(); } }}
                className="bg-transparent outline-none flex-1 min-w-0 text-sm text-white placeholder-zinc-500" />
              {searching
                ? <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin shrink-0" />
                : !search && <kbd className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-zinc-700/50 border-zinc-600 text-zinc-500 leading-none select-none">Space</kbd>}
            </div>
            {results.length > 0 && (
              <div className={`${panel} right-0 top-full w-80`}>
                {results.map(u => (
                  <button key={u.username} onClick={() => selectUser(u.username)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition hover:bg-zinc-800 ${focusRing}`}>
                    <span className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
                      {u.avatarBase64 ? <img src={u.avatarBase64} alt="" className="w-full h-full object-cover" /> : u.username[0].toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white">{u.username}</span>
                        {roleBadge[u.role] && <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${roleBadge[u.role]}`}>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>}
                      </span>
                      {u.bio && <span className="block text-xs truncate text-zinc-400">{u.bio}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {search.length >= 2 && !searching && results.length === 0 && (
              <div className={`${panel} right-0 top-full w-80 px-3 py-2.5 text-sm text-zinc-400`}>No users match "{search}"</div>
            )}
          </div>

          <button onClick={() => go('/friends')} title="Friends" aria-label="Friends" className={iconBtn(pathname === '/friends')}>
            {Icons.friends}
            {pendingCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
          <button onClick={() => go('/settings')} title="Settings" aria-label="Settings" className={iconBtn(pathname === '/settings')}>{Icons.cog}</button>

          {/* Avatar menu */}
          <div className="relative ml-1">
            <button onClick={() => toggle('avatar')} aria-label="Account menu" aria-haspopup="menu" aria-expanded={open === 'avatar'}
              className={`flex rounded-full ring-2 transition ${open === 'avatar' ? 'ring-zinc-500' : 'ring-transparent hover:ring-zinc-600'} ${focusRing}`}>
              {avatar('w-8 h-8')}
            </button>
            {open === 'avatar' && (
              <div role="menu" className={`${panel} right-0 top-full w-max min-w-48`}>
                <div className="flex items-center gap-3 px-3 py-2.5 mb-1 border-b border-zinc-800">
                  {avatar('w-9 h-9')}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{authUsername}</p>
                    <p className={`text-xs ${userRole === 'admin' ? 'text-red-400' : userRole === 'moderator' ? 'text-blue-400' : 'text-zinc-500'}`}>
                      {userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'User'}
                    </p>
                  </div>
                </div>
                <MenuItem item={{ label: 'View profile', path: `/user/${authUsername}`, icon: Icons.user }} active={false} onSelect={go} />
                <MenuItem item={{ label: 'Edit profile', path: `/user/${authUsername}/edit`, icon: Icons.pencil }} active={false} onSelect={go} />
                <div className="my-1 border-t border-zinc-800" />
                <button role="menuitem" onClick={() => { setOpen(null); onLogout(); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left text-red-400 hover:bg-red-500/10 transition ${focusRing}`}>
                  <span>{Icons.logout}</span>Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav panel */}
      {open === 'mobile' && (
        <nav aria-label="Main" className="lg:hidden absolute inset-x-0 top-full border-b border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 px-4 py-3 max-h-[calc(100vh-64px)] overflow-y-auto">
          {nav.map(item => item.menu ? (
            <div key={item.id} className="py-1">
              <p className="px-3 pt-2 pb-1 text-xs font-semibold text-zinc-500">{item.label}</p>
              {item.menu.map(m => <MenuItem key={m.path} item={m} active={pathname === m.path} onSelect={go} />)}
            </div>
          ) : (
            <MenuItem key={item.id} item={{ ...item, icon: item.id === 'feed' ? Icons.users : Icons.pulse }} active={item.match(pathname)} onSelect={go} />
          ))}
        </nav>
      )}
    </header>
  );
}
