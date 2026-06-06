import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiCache from './apiCache';

const ROLE_BADGE = {
  admin: { label: 'Admin', cls: 'bg-red-900/40 text-red-400 border border-red-800' },
  moderator: { label: 'Moderator', cls: 'bg-blue-900/40 text-blue-400 border border-blue-800' },
};

function AvatarDisplay({ src, username, size = 'w-24 h-24', textSize = 'text-4xl' }) {
  if (src) return <img src={src} alt={username} className={`${size} rounded-full object-cover border-4 border-zinc-600`} />;
  const initial = username?.[0]?.toUpperCase() || '?';
  return <div className={`${size} rounded-full bg-zinc-600 flex items-center justify-center ${textSize} font-bold text-white border-4 border-zinc-600`}>{initial}</div>;
}

// Get Steam level badge colors based on level tier
function getSteamLevelColors(level) {
  // Calculate tier based on tens digit: level 550 = tier 5 (blue), level 15 = tier 1 (red)
  const tier = Math.floor(level / 10) % 10;
  
  const colorMap = {
    0: { from: '#5e5e5e', to: '#434343' },     // 0-9, 100s: Gray
    1: { from: '#c23030', to: '#8b2222' },     // 10s: Red
    2: { from: '#d97a2b', to: '#b85a1f' },     // 20s: Orange
    3: { from: '#d5b62b', to: '#a38d1f' },     // 30s: Yellow
    4: { from: '#5ea832', to: '#3d7a1f' },     // 40s: Green
    5: { from: '#3b82f6', to: '#2563eb' },     // 50s: Blue (brighter)
    6: { from: '#8b5fa8', to: '#65437a' },     // 60s: Purple
    7: { from: '#d65c9e', to: '#a34375' },     // 70s: Pink
    8: { from: '#8b2e3a', to: '#5c1f27' },     // 80s: Dark wine-red
    9: { from: '#a0826d', to: '#6b5744' },     // 90s: Brown
  };
  
  return colorMap[tier] || colorMap[0];
}

// Get country flag emoji based on exchange suffix
function getExchangeFlag(ticker) {
  const flags = {
    'ST': 'se',   // Sweden
    'OL': 'no',   // Norway
    'CO': 'dk',   // Denmark
    'HE': 'fi',   // Finland
    'AS': 'nl',   // Netherlands
    'PA': 'fr',   // France
    'DE': 'de',   // Germany
    'L': 'gb',    // London/UK
    'MI': 'it',   // Italy
    'MC': 'es',   // Spain
    'SW': 'ch',   // Switzerland
    'TO': 'ca',   // Canada
    'AX': 'au',   // Australia
    'HK': 'hk',   // Hong Kong
    'T': 'jp',    // Japan
  };
  
  const parts = ticker.split('.');
  if (parts.length > 1) {
    const suffix = parts[parts.length - 1];
    return flags[suffix] || 'us';
  }
  return 'us'; // Default to US for no suffix
}

function FlagIcon({ ticker, size = 'w-8 h-6' }) {
  const countryCode = getExchangeFlag(ticker);
  return (
    <img 
      src={`https://flagcdn.com/${countryCode}.svg`} 
      alt={countryCode.toUpperCase()} 
      className={`${size} object-cover rounded`}
    />
  );
}

export default function ProfilePageView({ authUsername, viewUsername = null }) {
  const navigate = useNavigate();
  const isOwnProfile = !viewUsername || viewUsername === authUsername;
  const targetUser = viewUsername || authUsername;

  const [profile, setProfile] = useState(() => apiCache.get(`/api/users/${targetUser}/profile`));
  const [showcaseItems, setShowcaseItems] = useState([]);
  const [viewingHoldings, setViewingHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [userActivity, setUserActivity] = useState(() => apiCache.get(`/api/users/${targetUser}/activity`) || []);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const h = { 'Content-Type': 'application/json', ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };

  useEffect(() => {
    fetchProfile();
  }, [targetUser]);

  useEffect(() => {
    if (profile?.publicInventory && profile?.showcaseItems?.length > 0) {
      loadShowcaseItems();
    }
    if (profile?.publicHoldings) {
      loadPublicHoldings();
      loadUserActivity(); // Load activity when portfolio is visible
    }
  }, [profile]);

  async function fetchProfile() {
    try {
      const res = await fetch(`/api/users/${targetUser}/profile`, { headers: h });
      const data = await res.json();
      apiCache.set(`/api/users/${targetUser}/profile`, data);
      setProfile(data);
    } catch(e) {}
  }

  async function loadShowcaseItems() {
    if (!profile.steamId || !profile.showcaseItems || profile.showcaseItems.length === 0) return;
    
    try {
      const res = await fetch(`/api/cs/steam/inventory/${profile.steamId}`, { headers: h });
      const data = await res.json();
      
      // Filter inventory to only include showcase items
      const showcase = data.items
        ?.filter(item => profile.showcaseItems.includes(item.assetId))
        .slice(0, 10); // Safety limit
      
      setShowcaseItems(showcase || []);
    } catch(e) {
      console.error('Failed to load showcase items:', e);
    }
  }

  async function loadPublicHoldings() {
    setLoadingHoldings(true);
    try {
      if (isOwnProfile) {
        // Step 1: Get holdings from reconstruct endpoint
        const reconstructRes = await fetch('/api/transactions/reconstruct', { headers: h });
        if (!reconstructRes.ok) {
          console.error('Reconstruct API failed:', reconstructRes.status);
          setLoadingHoldings(false);
          return;
        }
        const holdings = await reconstructRes.json();
        
        if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
          setViewingHoldings([]);
          setLoadingHoldings(false);
          return;
        }
        
        // Step 2: Get current values from portfolio endpoint
        const portfolioRes = await fetch('/api/portfolio', { 
          method: 'POST',
          headers: h, 
          body: JSON.stringify({ portfolio: holdings, baseCurrency: 'SEK' })
        });
        
        if (!portfolioRes.ok) {
          console.error('Portfolio API failed:', portfolioRes.status);
          setLoadingHoldings(false);
          return;
        }
        
        const portfolioData = await portfolioRes.json();
        
        // Defensive check - ensure we have valid data
        if (!portfolioData || typeof portfolioData !== 'object') {
          console.error('Invalid portfolio response:', portfolioData);
          setViewingHoldings([]);
          setLoadingHoldings(false);
          return;
        }
        
        const portfolio = Array.isArray(portfolioData.portfolio) ? portfolioData.portfolio : [];
        
        if (portfolio.length === 0) {
          setViewingHoldings([]);
          setLoadingHoldings(false);
          return;
        }
        
        // Calculate weights
        const totalValue = portfolio.reduce((sum, h) => sum + (h.currentValue || 0), 0);
        const holdingsWithWeights = portfolio
          .filter(h => h.quantity > 0)
          .map(h => ({
            ticker: h.ticker,
            name: h.name || h.cleanName,
            quantity: h.quantity,
            value: Math.round(h.currentValue || 0),
            weight: totalValue > 0 ? ((h.currentValue || 0) / totalValue) * 100 : 0
          }))
          .sort((a, b) => b.weight - a.weight);
        
        setViewingHoldings(holdingsWithWeights);
      } else {
        // For other users, use the public holdings endpoint
        const res = await fetch(`/api/users/${targetUser}/holdings`, { headers: h });
        const data = await res.json();
        setViewingHoldings(data.holdings || []);
      }
    } catch(e) {
      console.error('Failed to load holdings:', e);
    }
    setLoadingHoldings(false);
  }

  async function loadUserActivity() {
    if (!apiCache.has(`/api/users/${targetUser}/activity`)) setLoadingActivity(true);
    try {
      const res = await fetch(`/api/users/${targetUser}/activity`, { headers: h });
      if (res.ok) {
        const data = await res.json();
        apiCache.set(`/api/users/${targetUser}/activity`, data);
        setUserActivity(data);
      }
    } catch(e) {
      console.error('Failed to load user activity:', e);
    }
    setLoadingActivity(false);
  }

  function formatDate(d) {
    if (!d) return 'Unknown';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
      </div>
    );
  }

  const card = `bg-zinc-800 border-zinc-700 border rounded-xl`;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        
        {/* Profile Header - Horizontal Steam-Style Layout */}
        <div className={`${card} p-8 mb-4`}>
          <div className="flex items-start gap-8">
            {/* Avatar */}
            <div className="shrink-0">
              <AvatarDisplay src={profile.avatarBase64} username={targetUser} size="w-40 h-40" textSize="text-6xl" />
            </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <img src={`https://flagcdn.com/${profile.country || 'se'}.svg`} alt={profile.country || 'se'} className="w-8 h-6" />
                <h2 className="text-4xl font-bold">{targetUser}</h2>
                {profile.role && ROLE_BADGE[profile.role] && (
                  <span className={`text-xs px-2.5 py-1 rounded-full ${ROLE_BADGE[profile.role].cls}`}>
                    {ROLE_BADGE[profile.role].label}
                  </span>
                )}
              </div>
              
              <p className={`text-sm mb-4 text-zinc-400`}>
                Member since {formatDate(profile.createdAt)}
              </p>

              {profile.bio && (
                <p className={`text-base mb-4 text-zinc-300`}>{profile.bio}</p>
              )}

              {/* Steam Verified Badge */}
              {profile.steamVerified && (
                <a 
                  href={`https://steamcommunity.com/profiles/${profile.steamId}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition bg-green-900/30 text-green-400 hover:bg-green-900/40 border border-green-800`}
                >
                  <span>Steam profile</span>
                  <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
              )}
            </div>

            {/* Right Side: Level Badge */}
            <div className="flex flex-col items-end gap-6 shrink-0">
              {profile.steamLevel > 0 && (() => {
                const colors = getSteamLevelColors(profile.steamLevel);
                return (
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-bold">Level</span>
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-black/20 blur-sm translate-y-0.5"></div>
                      <div
                        className="relative w-11 h-11 rounded-full flex items-center justify-center shadow-md"
                        style={{ background: `linear-gradient(to bottom, ${colors.from}, ${colors.to})` }}
                      >
                        <span className="text-white font-bold text-lg drop-shadow-md">{profile.steamLevel}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Item Showcase Section */}
        {showcaseItems && showcaseItems.length > 0 && (
          <div className={`${card} p-2 mb-2`}>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className={`text-[10px] font-semibold uppercase tracking-wide text-zinc-400`}>
                Item Showcase
              </h3>
              <span className={`text-[10px] text-zinc-400`}>
                {showcaseItems.length} {showcaseItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
              {showcaseItems.map(item => (
                <div key={item.assetId} className={`bg-zinc-700/50 hover:bg-zinc-700 rounded p-1 transition cursor-pointer border border-zinc-600`}>
                  <img
                    src={item.iconUrl}
                    alt={item.name}
                    className="w-full aspect-square object-contain mb-0.5"
                  />
                  {item.stickers?.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap">
                      {item.stickers.map((s, i) => (
                        <div key={i} className="relative group">
                          <img src={s.url} alt={s.name} className="w-6 h-6 object-contain opacity-85 hover:opacity-100 transition" />
                          {s.name && (
                            <div className="absolute bottom-full left-0 mb-1.5 px-2 py-1 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                              <p className="text-xs font-semibold text-white">{s.name}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] text-center truncate mt-0.5">{item.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio & Dividends - Two Column Layout */}
        {profile.publicHoldings && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            
            {/* Portfolio - Left Column */}
            <div className={`${card} p-2.5`}>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className={`text-[10px] font-semibold uppercase tracking-wide text-zinc-400`}>
                  Portfolio
                </h3>
                {viewingHoldings && (
                  <span className={`text-[10px] text-zinc-400`}>
                    {viewingHoldings.length} holdings
                  </span>
                )}
              </div>

              {loadingHoldings ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : viewingHoldings && viewingHoldings.length > 0 ? (
                <>
                  <div className="flex flex-col gap-2">
                    {viewingHoldings.slice(0, showAllHoldings ? undefined : 10).map((h, i) => {
                      // Clean company name
                      const cleanCompanyName = (h.name || h.ticker)
                        .replace(/\s*\(publ\.?\)/gi, '')
                        .replace(/\s*\(AB\)/gi, '')
                        .replace(/\bAB\b(?!\w)/gi, '')
                        .replace(/\bpubl\.?\b/gi, '')
                        .replace(/\b(ASA|AS|A\/S|SE|Inc\.?|Inc|Corp\.?|Ltd\.?|Limited|PLC|N\.V\.|S\.A\.|GmbH|AG)\b/gi, '')
                        .replace(/\s*[.,;]\s*$/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                      
                      const maxWeight = Math.max(...viewingHoldings.map(holding => holding.weight || 0));
                      const relativeWidth = maxWeight > 0 ? ((h.weight || 0) / maxWeight) * 100 : 0;
                      
                      return (
                        <div key={h.ticker} className={`flex flex-col gap-1 p-2 rounded bg-zinc-700/50 hover:bg-zinc-700 transition`}>
                          <div className="flex items-center gap-2">
                            <FlagIcon ticker={h.ticker} size="w-6 h-4.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-xs truncate">{cleanCompanyName}</p>
                              <p className={`text-[10px] text-zinc-400`}>{h.ticker}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-xs">{h.weight?.toFixed(2) || '0.00'}%</p>
                              {profile.showPortfolioValue && h.value && (
                                <p className={`text-[10px] text-zinc-400`}>{h.value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</p>
                              )}
                            </div>
                          </div>
                          <div className={`h-0.5 rounded-full bg-zinc-600 overflow-hidden`}>
                            <div className="h-full bg-linear-to-r from-red-500 to-pink-500" style={{ width: `${relativeWidth}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {viewingHoldings.length > 10 && (
                    <button
                      onClick={() => setShowAllHoldings(!showAllHoldings)}
                      className={`w-full mt-3 py-2.5 rounded-lg font-semibold transition bg-zinc-700 hover:bg-zinc-600 text-zinc-300`}
                    >
                      {showAllHoldings ? 'Show Less' : `View All (${viewingHoldings.length})`}
                    </button>
                  )}
                </>
              ) : (
                <p className={`text-center py-8 text-zinc-400`}>
                  No holdings to display
                </p>
              )}
            </div>

            {/* Recent Activity - Right Column */}
            <div className={`${card} p-2.5`}>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className={`text-[10px] font-semibold uppercase tracking-wide text-zinc-400`}>
                  Recent Activity
                </h3>
              </div>

              {loadingActivity ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : userActivity.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {userActivity.map(activity => (
                    <ActivityItem key={activity.id} activity={activity} />
                  ))}
                </div>
              ) : (
                <p className={`text-center py-8 text-sm text-zinc-400`}>
                  No recent activity
                </p>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

// Activity item component for profile page
function ActivityItem({ activity }) {
  const formatTime = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('sv-SE');
  };

  const itemBg = 'bg-zinc-700/30';
  const textSecondary = 'text-zinc-400';

  if (activity.type === 'skin_trade') {
    const isBuy = activity.tradeType === 'buy';
    return (
      <div className={`${itemBg} rounded-lg p-2`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
            {isBuy ? '↓' : '↑'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{activity.skinName}</p>
            <p className={`text-[10px] ${textSecondary}`}>
              {formatTime(activity.created_at)}
            </p>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isBuy ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
            {isBuy ? 'Buy' : 'Sell'}
          </span>
        </div>
      </div>
    );
  }

  if (activity.type === 'holdings_update') {
    return (
      <div className={`${itemBg} rounded-lg p-2`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">📊</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">Portfolio updated</p>
            <p className={`text-[10px] ${textSecondary}`}>
              {formatTime(activity.created_at)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (activity.type === 'skin_screenshot') {
    return (
      <div className={`${itemBg} rounded-lg p-2`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">📸</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{activity.skinName}</p>
            <p className={`text-[10px] ${textSecondary}`}>
              {formatTime(activity.created_at)}
            </p>
          </div>
        </div>
        {activity.imageBase64 && (
          <img 
            src={activity.imageBase64} 
            alt={activity.skinName} 
            className="w-full rounded-md object-cover max-h-32"
          />
        )}
      </div>
    );
  }

  return null;
}