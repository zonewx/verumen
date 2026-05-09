import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Inline accordion content for portfolio actions
function ActionContent({ id, pa, isDark }) {
  const btn = `w-full py-2 px-3 rounded-lg text-xs font-semibold transition text-center`;
  const sub = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputCls = `w-full px-2 py-1.5 rounded-lg border text-xs outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200'}`;

  const spinner = <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1 align-middle"/>;

  if (id === 'import') return (
    <div className="flex flex-col gap-2">
      <label className={`${btn} cursor-pointer ${pa.uploadLoading ? 'opacity-50 cursor-not-allowed bg-gray-700 text-gray-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
        {pa.uploadLoading ? <>{spinner}Processing…</> : pa.uploadStatus ? '↺ Re-upload' : '↑ Upload CSV'}
        <input type="file" accept=".csv" multiple className="hidden" disabled={pa.uploadLoading} onChange={e => { pa.onUpload(e.target.files); e.target.value=''; }} />
      </label>
      <p className={`text-[10px] ${sub}`}>Supports Montrose, Avanza, Nordnet.</p>
      {pa.uploadProgress && <p className="text-xs text-blue-400 font-medium flex items-center gap-1">{spinner}{pa.uploadProgress.label}</p>}
      {pa.uploadStatus?.error && <p className="text-[10px] text-red-400">✗ {pa.uploadStatus.error}</p>}
      {!pa.uploadProgress && pa.uploadStatus?.results && (
        <div className="flex flex-col gap-1">
          {pa.uploadStatus.results.map((r,i) => (
            <p key={i} className={`text-[10px] ${r.error ? 'text-red-400' : sub}`}>{r.error ? `✗ ${r.file}` : `${r.broker} — ${r.count} rows`}</p>
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

  if (id === 'settings') return (
    <div className="flex flex-col gap-3">
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${sub}`}>Base Currency</p>
        <select value={pa.baseCurrency} onChange={e => pa.onSetBaseCurrency(e.target.value)}
          className={`${inputCls}`}>
          <option>EUR</option><option>GBP</option><option>SEK</option><option>USD</option>
        </select>
      </div>
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${sub}`}>Change Password</p>
        <input type="password" value={pa.authForm?.password||''} onChange={e => pa.onAuthFormChange('password', e.target.value)} placeholder="Current password" className={`${inputCls} mb-1`} />
        <input type="password" value={pa.authForm?.newPassword||''} onChange={e => pa.onAuthFormChange('newPassword', e.target.value)} placeholder="New password" className={`${inputCls} mb-1`} />
        {pa.authError && <p className="text-[10px] text-red-400 mb-1">{pa.authError}</p>}
        <button onClick={pa.onChangePassword} disabled={pa.authLoading} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50`}>
          {pa.authLoading ? 'Saving…' : 'Update Password'}
        </button>
      </div>
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${sub}`}>Ticker Overrides</p>
        <input value={pa.overrideIsin||''} onChange={e => pa.onOverrideIsinChange(e.target.value)} placeholder="ISIN" className={`${inputCls} mb-1`} />
        <input value={pa.overrideTicker||''} onChange={e => pa.onOverrideTickerChange(e.target.value)} placeholder="Ticker" className={`${inputCls} mb-1`} />
        <button onClick={pa.onAddOverride} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white mb-1`}>Save Override</button>
        {pa.overrideMsg && <p className="text-[10px] text-green-400">{pa.overrideMsg}</p>}
        {Object.entries(pa.overrides||{}).map(([isin, ticker]) => (
          <div key={isin} className={`flex items-center justify-between rounded px-2 py-1 mt-1 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
            <span className="text-[10px]">{isin} → <b>{ticker}</b></span>
            <button onClick={() => pa.onDeleteOverride(isin)} className="text-red-400 text-xs ml-1">✕</button>
          </div>
        ))}
      </div>
    </div>
  );

  if (id === 'danger') return (
    <div className="flex flex-col gap-2">
      <p className={`text-[10px] ${sub}`}>Cannot be undone.</p>
      <button onClick={pa.onClearPortfolio} className={`${btn} border ${isDark ? 'border-red-800/60 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
        Clear Portfolio
      </button>
      {pa.txCount?.total > 0 && (
        <button onClick={pa.onClearTransactions} className={`${btn} border ${isDark ? 'border-red-800/60 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
          Clear Transactions
        </button>
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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
  

export default function Sidebar({ currentUser, onLogout, isDark, portfolioActions = {} }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeSubMenu, setActiveSubMenu] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

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
      label: 'Portfolio',
      icon: TrendingUp,
      path: null,
      subItems: [
        { id: 'overview',      label: 'Overview',      path: '/portfolio' },
        { id: 'holdings',      label: 'Holdings',      path: '/portfolio/holdings' },
        { id: 'transactions',  label: 'Transactions',  path: '/portfolio/transactions' },
        { id: 'dividends',     label: 'Dividends',     path: '/portfolio/dividends' },
        { id: 'ownership',     label: 'Ownership',     path: '/portfolio/ownership' },
        { id: 'divider1', isDivider: true },
        { id: 'import',   label: 'Import CSV',      isAction: true },
        { id: 'manage',   label: 'Manage Holdings', isAction: true },
        { id: 'settings', label: 'Settings',        isAction: true },
        { id: 'danger',   label: 'Danger Zone',     isAction: true, isDanger: true },
      ]
    },
    {
      id: 'cs-skins',
      label: 'CS Skins',
      icon: Package,
      path: '/cs-skins',
      subItems: null
    },
    {
      id: 'moderator',
      label: 'Moderator',
      icon: Shield,
      path: '/moderator',
      subItems: null,
      moderatorOnly: true
    },
    {
      id: 'admin',
      label: 'Admin',
      icon: Shield,
      path: null,
      subItems: [
        { id: 'admin-overview', label: 'Overview', path: '/admin' },
        { id: 'users', label: 'Users', path: '/admin/users' },
        { id: 'roles', label: 'Roles', path: '/admin/roles' },
        { id: 'ticker-failures', label: 'Ticker Failures', path: '/admin/ticker-failures' },
        { id: 'announcements', label: 'Announcements', path: '/admin/announcements' },
      ],
      adminOnly: true
    }
  ];

  const handleItemClick = (item) => {
    if (item.subItems) {
      // Has sub-menu, expand it
      setActiveSubMenu(item.id);
      if (!isExpanded) setIsExpanded(true); // Auto-expand when opening sub-menu
    } else {
      // Direct navigation
      navigate(item.path);
      setActiveSubMenu(null);
    }
  };

  const handleSubItemClick = (path) => {
    navigate(path);
  };

  const handleBack = () => {
    setActiveSubMenu(null);
  };

  const isActive = (path) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const sidebarWidth = isExpanded ? 'w-60' : 'w-16';
  const bg = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const textPrimary = isDark ? 'text-gray-100' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';
  const hoverBg = isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100';
  const activeBg = isDark ? 'bg-gray-800' : 'bg-gray-100';

  // Filter menu items based on user role
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
    <div className={`${sidebarWidth} ${bg} border-r transition-all duration-300 flex flex-col h-screen sticky top-0 pt-12`}>
      {/* Header with hamburger */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-2 rounded-lg ${hoverBg} transition-colors shrink-0`}
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <Menu size={20} className={textPrimary} />
        </button>
        {isExpanded && (
          <h1 className={`text-lg font-bold ${textPrimary} flex-1 text-center`}>Verumen</h1>
        )}
        {/* Spacer to keep text centered when expanded */}
        {isExpanded && <div className="w-9 shrink-0" />}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {activeSubMenu ? (
          // Sub-menu view
          <div className="space-y-1">
            {/* Back button */}
            <button
              onClick={handleBack}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${hoverBg} transition-colors ${textSecondary}`}
            >
              <ChevronLeft size={20} />
              {isExpanded && <span className="text-sm font-medium">Back</span>}
            </button>

            {/* Sub-menu title */}
            {isExpanded && (
              <div className={`px-3 py-2 ${textPrimary} font-semibold text-sm uppercase tracking-wide`}>
                {menuItems.find(m => m.id === activeSubMenu)?.label}
              </div>
            )}

            {/* Sub-menu items */}
            {menuItems.find(m => m.id === activeSubMenu)?.subItems.map(subItem => {
              if (subItem.isDivider) {
                return isExpanded ? (
                  <div key={subItem.id} className={`my-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-300'}`} />
                ) : null;
              }

              // Action items — accordion toggle
              if (subItem.isAction) {
                const isOpen = expandedSection === subItem.id;
                return (
                  <div key={subItem.id}>
                    <button
                      onClick={() => toggleSection(subItem.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${hoverBg} ${subItem.isDanger ? 'text-red-400' : textPrimary}`}
                    >
                      <div className="w-5 shrink-0"/>
                      {isExpanded && (
                        <>
                          <span className="text-sm flex-1 text-left">{subItem.label}</span>
                          <ChevronLeft size={14} className={`transition-transform duration-200 ${isOpen ? '-rotate-90' : 'rotate-180'}`} />
                        </>
                      )}
                    </button>
                    {isOpen && isExpanded && (
                      <div className={`mx-2 mt-1 mb-2 rounded-lg p-3 flex flex-col gap-2 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                        <ActionContent id={subItem.id} pa={portfolioActions} isDark={isDark} />
                      </div>
                    )}
                  </div>
                );
              }

              // Regular nav items
              return (
                <button
                  key={subItem.id}
                  onClick={() => navigate(subItem.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    location.pathname === subItem.path ? activeBg : hoverBg
                  } ${textPrimary}`}
                >
                  <div className="w-5" />
                  {isExpanded && <span className="text-sm">{subItem.label}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          // Main menu view
          <div className="space-y-1">
            {visibleMenuItems.map(item => {
              const Icon = item.icon;
              const active = item.path ? isActive(item.path) : false;
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    active ? activeBg : hoverBg
                  } ${textPrimary} group`}
                  title={!isExpanded ? item.label : ''}
                >
                  <Icon size={20} className={active ? 'text-blue-400' : textSecondary} />
                  {isExpanded && (
                    <span className="text-sm flex-1 text-left">{item.label}</span>
                  )}
                  {isExpanded && item.subItems && (
                    <ChevronLeft size={16} className={`${textSecondary} -rotate-180`} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer - User profile */}
      <div className="border-t border-gray-800 p-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/profile/${currentUser?.username}`)}
            className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg ${hoverBg} transition-colors ${textPrimary}`}
            title={!isExpanded ? currentUser?.username : ''}
          >
            <User size={20} className={textSecondary} />
            {isExpanded && (
              <div className="flex-1 text-left">
                <p className="text-sm font-medium truncate">{currentUser?.username}</p>
                <p className="text-xs text-gray-500">{currentUser?.role}</p>
              </div>
            )}
          </button>
          {isExpanded && (
            <button
              onClick={() => navigate('/profile/edit')}
              title="Edit Profile"
              className={`p-2 rounded-lg ${hoverBg} transition-colors shrink-0`}
            >
              <Cog size={16} className={textSecondary} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}