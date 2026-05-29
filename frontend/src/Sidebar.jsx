import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Inline accordion content for portfolio actions
function ActionContent({ id, pa, isDark, selectedBroker, onBrokerChange }) {
  const btn = `w-full py-2 px-3 rounded-lg text-xs font-semibold transition text-center`;
  const sub = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputCls = `w-full px-2 py-1.5 rounded-lg border text-xs outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200'}`;

  const spinner = <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1 align-middle"/>;

  if (id === 'import') return (
    <div className="flex flex-col gap-2">
      {/* BROKER SELECTOR */}
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${sub}`}>Broker (optional)</p>
        <select 
          value={selectedBroker}
          onChange={(e) => onBrokerChange(e.target.value)}
          className={`w-full px-2 py-1.5 rounded-lg border text-xs outline-none ${
            isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200'
          }`}
        >
          <option value="auto">Auto-detect</option>
          <option value="montrose">Montrose</option>
          <option value="avanza">Avanza</option>
          <option value="nordnet">Nordnet</option>
        </select>
      </div>

      <label className={`${btn} cursor-pointer ${pa.uploadLoading ? 'opacity-50 cursor-not-allowed bg-gray-700 text-gray-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
        {pa.uploadLoading ? <>{spinner}Processing…</> : pa.uploadStatus ? '↺ Re-upload' : '↑ Upload CSV'}
        <input type="file" accept=".csv" multiple className="hidden" disabled={pa.uploadLoading} onChange={e => { const f = Array.from(e.target.files); e.target.value = ''; pa.onUpload(f); }} />
      </label>
      <p className={`text-[10px] ${sub}`}>Supports Avanza, Montrose, Nordnet.</p>
      {pa.uploadProgress && (
        <div className="rounded-lg px-3 py-2.5 text-sm border bg-blue-900/20 border-blue-800/40 text-blue-300">
          <div className="flex items-center gap-2">
            <div className="animate-spin">⏳</div>
            <span className="font-medium flex-1">{pa.uploadProgress.label}</span>
          </div>
        </div>
      )}
      
      {pa.uploadStatus?.error && <p className="text-[10px] text-red-400">✗ {pa.uploadStatus.error}</p>}
      {!pa.uploadProgress && pa.uploadStatus?.results && (
        <div className="flex flex-col gap-1">
          {pa.uploadStatus.results.map((r,i) => (
            <div key={i} className={`text-[10px] ${r.error ? 'text-red-400' : sub}`}>
              {r.error ? (
                <>
                  <p className="font-semibold">✗ {r.file}</p>
                  <p className="opacity-90">{r.error}</p>
                </>
              ) : (
              <p><span className="font-bold capitalize">{r.broker}</span> — {r.count} rows</p>
            )}
          </div>
        ))}
          <p className="text-[10px] text-green-400 font-semibold">+{pa.uploadStatus.newAdded} new</p>
        </div>
      )}
      {pa.txCount?.total > 0 && <p className="text-xs font-bold text-green-400">{pa.txCount.trades} trades · {pa.txCount.total} total</p>}
      {pa.txCount?.trades > 0 && (
        <>
          <button onClick={pa.onSync} disabled={pa.syncLoading} className={`${btn} ${pa.syncLoading ? 'bg-gray-700 text-gray-400' : 'bg-green-700 hover:bg-green-600 text-white'}`}>
            {pa.syncLoading ? <>{spinner}Syncing…</> : '⟳ Sync Portfolio'}
          </button>
          {pa.syncStatus && <p className={`text-[10px] ${pa.syncStatus.startsWith('✓') ? 'text-green-400' : sub}`}>{pa.syncStatus}</p>}
          <button onClick={pa.onResolve} disabled={pa.resolveLoading} className={`${btn} ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
            {pa.resolveLoading ? <>{spinner}Resolving…</> : '🔍 Resolve Tickers'}
          </button>
          {pa.resolveStatus && <p className={`text-[10px] ${pa.resolveStatus.startsWith('✓') ? 'text-green-400' : sub}`}>{pa.resolveStatus}</p>}
        </>
      )}
    </div>
  );

  if (id === 'manage') return (
    <div className="flex flex-col gap-2">
      {!pa.portfolio?.length ? (
        <p className={`text-xs ${sub}`}>No holdings yet.</p>
      ) : (
        <>
          <div className={`rounded-lg overflow-hidden max-h-40 overflow-y-auto ${isDark ? 'bg-gray-700/40' : 'bg-gray-100'}`}>
            {pa.portfolio.map(s => (
              <label key={s.ticker} className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'} border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200'} last:border-0`}>
                <input type="checkbox" checked={pa.selectedForRemoval?.includes(s.ticker)} onChange={() => pa.onToggleRemoval(s.ticker)} className="accent-blue-500" />
                <span className="text-xs font-medium">{s.ticker}</span>
                <span className={`text-[10px] ml-auto ${sub}`}>{s.quantity}</span>
              </label>
            ))}
          </div>
          {pa.selectedForRemoval?.length > 0 && (
            <button onClick={pa.onRemoveSelected} className={`${btn} bg-orange-600 hover:bg-orange-500 text-white`}>
              Remove {pa.selectedForRemoval.length} selected
            </button>
          )}
          <button onClick={pa.onForceResolve} disabled={pa.resolveLoading} className={`${btn} bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50`}>
            {pa.resolveLoading ? <>{spinner}Re-resolving…</> : '🔄 Force Re-Resolve'}
          </button>
        </>
      )}
    </div>
  );

  if (id === 'settings') return null;

  if (id === 'danger') return (
    <div className="flex flex-col gap-1.5">
      <button onClick={pa.onClearTickerCache} className={`${btn} border ${isDark ? 'border-orange-800/60 text-orange-400 hover:bg-orange-900/20' : 'border-orange-200 text-orange-600 hover:bg-orange-50'}`}>
        Clear ticker cache
      </button>
      <button onClick={pa.onClearAll} className={`${btn} border ${isDark ? 'border-red-800/60 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
        Clear all data
      </button>
    </div>
  );

  if (id === 'danger') return (
    <div className="flex flex-col gap-2">
      <p className={`text-[10px] ${sub}`}>Cannot be undone.</p>
      <button onClick={pa.onClearAll} className={`${btn} border ${isDark ? 'border-red-800/60 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
        Clear All Data
      </button>
      
      {/* BROKER DELETION BUTTONS */}
      {pa.txCount?.byBroker && Object.keys(pa.txCount.byBroker).length > 0 && (
        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-gray-700">
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${sub}`}>Delete by Broker</p>
          {Object.entries(pa.txCount.byBroker).map(([broker, count]) => (
            <button
              key={broker}
              onClick={() => pa.onClearBroker(broker)}
              className={`${btn} border ${
                isDark 
                  ? 'border-orange-800/60 text-orange-400 hover:bg-orange-900/20' 
                  : 'border-orange-200 text-orange-600 hover:bg-orange-50'
              }`}
            >
              Clear {broker.charAt(0).toUpperCase() + broker.slice(1)} ({count})
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return null;
}

const TrendingUp = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

const Package = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const Users = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const Shield = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const User = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const Menu = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

const Cog = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);

const ChevronLeft = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

export default function Sidebar({ currentUser, onLogout, isDark, selectedBroker, onBrokerChange, portfolioActions = {} }) {
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', isExpanded ? '240px' : '64px');
  }, [isExpanded]);
  const [expandedMenus, setExpandedMenus] = useState(new Set());
  const [expandedSection, setExpandedSection] = useState(null);
  const [avatarBase64, setAvatarBase64] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!currentUser?.username) return;
    const fetchAvatar = () => {
      const token = sessionStorage.getItem('auth_token');
      fetch(`/api/users/${currentUser.username}/profile`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
        .then(r => r.json())
        .then(d => { if (d?.avatarBase64) setAvatarBase64(d.avatarBase64); })
        .catch(() => {});
    };
    fetchAvatar();
    window.addEventListener('profile-updated', fetchAvatar);
    return () => window.removeEventListener('profile-updated', fetchAvatar);
  }, [currentUser?.username]);

  const toggleMenu = (id) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSection = (id) => setExpandedSection(prev => prev === id ? null : id);

  const menuItems = [
    {
      id: 'home',
      label: 'Home',
      icon: Users,
      path: '/social',
      subItems: null
    },
    {
      id: 'portfolio',
      label: 'Stock Portfolio',
      icon: TrendingUp,
      path: null,
      subItems: [
        { id: 'overview',     label: 'Overview',          path: '/portfolio',          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
        { id: 'holdings',     label: 'Holdings',          path: '/portfolio/holdings', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
        { id: 'transactions', label: 'Transactions',      path: '/portfolio/transactions', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> },
        { id: 'dividends',    label: 'Dividends',         path: '/portfolio/dividends',    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
        { id: 'ownership',    label: 'Ownership',         path: '/portfolio/ownership',    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
        { id: 'divider1', isDivider: true },
        { id: 'overrides',    label: 'Portfolio Settings', path: '/portfolio/overrides',   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg> },
        { id: 'divider2', isDivider: true },
        { id: 'danger', label: 'Data Management', isAction: true, isDanger: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
      ]
    },
    {
      id: 'cs-skins',
      label: 'Skins',
      icon: Package,
      path: null,
      subItems: [
        { id: 'cs-overview',   label: 'Overview',       path: '/cs-skins',          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
        { id: 'cs-inventory',  label: 'My Inventory',   path: '/cs-skins/inventory', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
        { id: 'cs-tracker',    label: 'Trade Registry',  path: '/cs-skins/tracker',   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> },
        { id: 'cs-settings',   label: 'Settings',        path: '/cs-skins/settings',  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg> },
      ]
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Cog,
      path: '/settings',
      subItems: null,
    },
    {
      id: 'moderator',
      label: 'Moderator Panel',
      icon: Shield,
      path: '/moderator',
      subItems: null,
      moderatorOnly: true
    },
    {
      id: 'admin',
      label: 'Admin Panel',
      icon: Shield,
      path: null,
      subItems: [
        { id: 'admin-overview',  label: 'Overview',        path: '/admin',                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
        { id: 'users',           label: 'Users',           path: '/admin/users',            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
        { id: 'roles',           label: 'Roles',           path: '/admin/roles',            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
        { id: 'ticker-failures', label: 'Ticker Failures', path: '/admin/ticker-failures',  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
        { id: 'announcements',   label: 'Announcements',   path: '/admin/announcements',    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg> },
      ],
      adminOnly: true
    }
  ];

  const isActive = (path) => {
    if (!path) return false;
    return location.pathname === path;
  };

  // Auto-expand parent when navigating directly to a child route
  useEffect(() => {
    menuItems.forEach(item => {
      if (item.subItems?.some(s => s.path && isActive(s.path))) {
        setExpandedMenus(prev => {
          if (prev.has(item.id)) return prev;
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
      }
    });
  }, [location.pathname]);

  const sidebarWidth = isExpanded ? 'w-60' : 'w-16';
  const bg = isDark ? 'bg-gray-900' : 'bg-white';
  const borderColor = isDark ? 'bg-gray-800' : 'bg-gray-200';
  const textPrimary = isDark ? 'text-gray-100' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';
  const hoverBg = isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100';
  const activeBg = isDark ? 'bg-gray-800' : 'bg-gray-100';

  const visibleMenuItems = menuItems.filter(item => {
    if (item.adminOnly) {
      return currentUser?.role === 'admin';
    }
    if (item.moderatorOnly) {
      return currentUser?.role === 'moderator';
    }
    return true;
  });

  return (
    <>
    {/* Fixed sidebar header — sits above GlobalBar in the sidebar lane */}
    <div className={`fixed top-0 left-0 ${sidebarWidth} h-12 z-[51] ${bg} flex items-center px-3 gap-2 transition-all duration-300`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`p-2 rounded-lg ${hoverBg} transition-colors shrink-0`}
        title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <Menu size={20} className={textPrimary} />
      </button>
      <h1 className={`text-lg font-bold ${textPrimary} flex-1 text-center overflow-hidden whitespace-nowrap transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>Verumen</h1>
      <div className={`w-9 shrink-0 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0'}`} />
    </div>

    <div className={`${sidebarWidth} ${bg} transition-all duration-300 flex flex-col h-screen sticky top-0 pt-12`}>
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-0.5">
          {visibleMenuItems.map(item => {
            const Icon = item.icon;
            const isOpen = expandedMenus.has(item.id);
            const hasActiveChild = item.subItems?.some(s => s.path && isActive(s.path));
            const active = item.path ? isActive(item.path) : hasActiveChild;

            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (item.subItems) {
                      if (!isExpanded) setIsExpanded(true);
                      toggleMenu(item.id);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className={`w-full flex items-center py-2 rounded-lg transition-colors ${active ? activeBg : hoverBg} ${textPrimary} ${isExpanded ? 'gap-3 px-3' : 'justify-center px-2'}`}
                  title={!isExpanded ? item.label : ''}
                >
                  <Icon size={20} className={`shrink-0 ${active ? 'text-blue-400' : textSecondary}`} />
                  <span className={`text-sm text-left whitespace-nowrap transition-all duration-200 ${isExpanded ? 'opacity-100 flex-1 overflow-hidden' : 'opacity-0 w-0 overflow-hidden'}`}>{item.label}</span>
                  {item.subItems && (
                    <ChevronLeft size={15} className={`${textSecondary} transition-transform duration-200 shrink-0 ${isOpen ? '-rotate-90' : 'rotate-180'} ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`} />
                  )}
                </button>

                {item.subItems && isOpen && isExpanded && (
                  <div className={`ml-4 mt-0.5 mb-1 pl-3 border-l ${isDark ? 'border-gray-700' : 'border-gray-200'} space-y-0.5`}>
                    {item.subItems.map(subItem => {
                      if (subItem.isDivider) {
                        return <div key={subItem.id} className={`my-1.5 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />;
                      }

                      if (subItem.isDirectButton) {
                        return (
                          <button
                            key={subItem.id}
                            onClick={() => portfolioActions?.[subItem.actionKey]?.()}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left text-red-400 ${isDark ? 'hover:bg-red-900/20' : 'hover:bg-red-50'}`}
                          >
                            {subItem.icon && <span className="shrink-0 opacity-70">{subItem.icon}</span>}
                            <span className="text-sm">{subItem.label}</span>
                          </button>
                        );
                      }

                      if (subItem.isAction) {
                        const isActionOpen = expandedSection === subItem.id;
                        return (
                          <div key={subItem.id}>
                            <button
                              onClick={() => toggleSection(subItem.id)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${hoverBg} ${subItem.isDanger ? 'text-red-400' : textSecondary}`}
                            >
                              {subItem.icon && <span className="shrink-0 opacity-70">{subItem.icon}</span>}
                              <span className="text-sm flex-1 text-left">{subItem.label}</span>
                              <ChevronLeft size={12} className={`transition-transform duration-200 ${isActionOpen ? '-rotate-90' : 'rotate-180'}`} />
                            </button>
                            {isActionOpen && (
                              <div className={`mt-1 mb-1 rounded-lg p-3 flex flex-col gap-2 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                                <ActionContent id={subItem.id} pa={portfolioActions} isDark={isDark} selectedBroker={selectedBroker} onBrokerChange={onBrokerChange} />
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <button
                          key={subItem.id}
                          onClick={() => navigate(subItem.path)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left ${
                            isActive(subItem.path) ? activeBg : hoverBg
                          } ${textPrimary}`}
                        >
                          {subItem.icon && <span className={`shrink-0 ${isActive(subItem.path) ? 'text-blue-400' : textSecondary}`}>{subItem.icon}</span>}
                          <span className="text-sm">{subItem.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-gray-800 p-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/profile/${currentUser?.username}`)}
            className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg ${hoverBg} transition-colors ${textPrimary}`}
            title={!isExpanded ? currentUser?.username : ''}
          >
            <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
              {avatarBase64
                ? <img src={avatarBase64} className="w-full h-full object-cover" alt="" />
                : <User size={16} className="text-white" />}
            </div>
            <div className={`flex-1 text-left min-w-0 overflow-hidden transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <p className="text-sm font-medium truncate">{currentUser?.username}</p>
              <p className="text-xs text-gray-500">{currentUser?.role ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1) : ''}</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/profile/edit')}
            className={`rounded-lg ${hoverBg} transition-all duration-200 shrink-0 text-xs font-semibold ${textSecondary} overflow-hidden ${isExpanded ? 'opacity-100 px-3 py-1.5 max-w-[60px]' : 'opacity-0 pointer-events-none px-0 max-w-0'}`}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
    <div className={`fixed top-0 bottom-0 w-px ${isExpanded ? 'left-60' : 'left-16'} ${borderColor} z-[51] pointer-events-none transition-all duration-300`} />
    </>
  );
}