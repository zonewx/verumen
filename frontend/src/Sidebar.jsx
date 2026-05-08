import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Simple SVG icon components
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

const ChevronLeft = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

export default function Sidebar({ currentUser, onLogout }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeSubMenu, setActiveSubMenu] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = true; // Match your app's dark theme

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
        { id: 'overview', label: 'Overview', path: '/portfolio' },
        { id: 'holdings', label: 'Holdings', path: '/portfolio/holdings' },
        { id: 'transactions', label: 'Transactions', path: '/portfolio/transactions' },
        { id: 'dividends', label: 'Dividends', path: '/portfolio/dividends' },
        { id: 'ownership', label: 'Ownership', path: '/portfolio/ownership' },
        { id: 'divider1', isDivider: true },
        { id: 'import', label: 'Import CSV', path: '/portfolio/import' },
        { id: 'manage', label: 'Manage Holdings', path: '/portfolio/manage' },
        { id: 'settings', label: 'Settings', path: '/portfolio/settings' },
        { id: 'danger', label: 'Danger Zone', path: '/portfolio/danger' },
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
      return currentUser?.role === 'admin' || currentUser?.role === 'moderator';
    }
    return true;
  });

  return (
    <div className={`${sidebarWidth} ${bg} border-r transition-all duration-300 flex flex-col h-screen sticky top-0 pt-12`}>
      {/* Header with hamburger */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-2 rounded-lg ${hoverBg} transition-colors`}
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <Menu size={20} className={textPrimary} />
        </button>
        {isExpanded && (
          <h1 className={`text-lg font-bold ${textPrimary}`}>Verumen</h1>
        )}
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
              // Render divider
              if (subItem.isDivider) {
                return isExpanded ? (
                  <div key={subItem.id} className={`my-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-300'}`} />
                ) : null;
              }
              
              // Render regular item
              return (
                <button
                  key={subItem.id}
                  onClick={() => handleSubItemClick(subItem.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive(subItem.path) ? activeBg : hoverBg
                  } ${textPrimary}`}
                >
                  <div className="w-5" /> {/* Spacer for alignment */}
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
        <button
          onClick={() => navigate(`/profile/${currentUser?.username}`)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${hoverBg} transition-colors ${textPrimary}`}
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
      </div>
    </div>
  );
}