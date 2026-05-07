import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ROLE_BADGE = {
  admin: { label: '🛡️ Admin', cls: 'bg-red-900/40 text-red-400 border border-red-800' },
  moderator: { label: '🛡 Moderator', cls: 'bg-blue-900/40 text-blue-400 border border-blue-800' },
};

function AvatarDisplay({ src, username, size = 'w-24 h-24', textSize = 'text-4xl' }) {
  if (src) return <img src={src} alt={username} className={`${size} rounded-full object-cover border-4 border-gray-700`} />;
  const initial = username?.[0]?.toUpperCase() || '?';
  return <div className={`${size} rounded-full bg-linear-to-br from-blue-600 to-blue-800 flex items-center justify-center ${textSize} font-bold text-white border-4 border-gray-700`}>{initial}</div>;
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

export default function ProfilePageView({ isDark, authUsername, viewUsername = null }) {
  const navigate = useNavigate();
  const isOwnProfile = !viewUsername || viewUsername === authUsername;
  const targetUser = viewUsername || authUsername;

  const [profile, setProfile] = useState(null);
  const [showcaseItems, setShowcaseItems] = useState([]);
  const [viewingHoldings, setViewingHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [showAllHoldings, setShowAllHoldings] = useState(false);

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
    }
  }, [profile]);

  async function fetchProfile() {
    try {
      const res = await fetch(`/api/users/${targetUser}/profile`, { headers: h });
      const data = await res.json();
      setProfile(data);
    } catch(e) {
      console.error('Failed to fetch profile:', e);
    }
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

  function formatDate(d) {
    if (!d) return 'Unknown';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
      </div>
    );
  }

  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        
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
                <img src="https://flagcdn.com/se.svg" alt="Sweden" className="w-8 h-6" />
                <h2 className="text-4xl font-bold">{targetUser}</h2>
                {profile.role && ROLE_BADGE[profile.role] && (
                  <span className={`text-xs px-2.5 py-1 rounded-full ${ROLE_BADGE[profile.role].cls}`}>
                    {ROLE_BADGE[profile.role].label}
                  </span>
                )}
              </div>
              
              <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Member since {formatDate(profile.createdAt)}
              </p>

              {profile.bio && (
                <p className={`text-base mb-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{profile.bio}</p>
              )}

              {/* Steam Verified Badge */}
              {profile.steamVerified && (
                <a 
                  href={`https://steamcommunity.com/profiles/${profile.steamId}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition ${isDark ? 'bg-green-900/30 text-green-400 hover:bg-green-900/40 border border-green-800' : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'}`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  <span>Steam verified</span>
                  <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
              )}
            </div>

            {/* Right Side: Level Badge + Edit Button */}
            <div className="flex flex-col items-end gap-6 shrink-0">
              {/* Steam Level Badge - Dynamic colors based on level tier */}
              {profile.steamLevel > 0 && (() => {
                const colors = getSteamLevelColors(profile.steamLevel);
                return (
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-normal ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Level</span>
                    <div className="relative">
                      {/* Simple shadow for depth */}
                      <div className="absolute inset-0 rounded-full bg-black/20 blur-sm translate-y-0.5"></div>
                      {/* Badge with dynamic colors */}
                      <div 
                        className="relative w-[60px] h-[60px] rounded-full flex items-center justify-center shadow-md"
                        style={{
                          background: `linear-gradient(to bottom, ${colors.from}, ${colors.to})`
                        }}
                      >
                        <span className="text-white font-bold text-[22px] drop-shadow-md">{profile.steamLevel}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Edit Profile Button */}
              {isOwnProfile && (
                <button
                  onClick={() => navigate('/profile/edit')}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md font-medium transition shadow-sm"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Item Showcase Section */}
        {showcaseItems && showcaseItems.length > 0 && (
          <div className={`${card} p-3 mb-2`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Item Showcase
              </h3>
              <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {showcaseItems.length} {showcaseItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {showcaseItems.map(item => (
                <div key={item.assetId} className={`${isDark ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'} rounded p-1.5 transition cursor-pointer border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                  <img 
                    src={item.iconUrl} 
                    alt={item.name}
                    className="w-full aspect-square object-contain mb-1"
                  />
                  <p className="text-[10px] text-center truncate">{item.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio Section */}
        {profile.publicHoldings && (
          <div className={`${card} p-3`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Portfolio
              </h3>
              {viewingHoldings && (
                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {viewingHoldings.length} holdings
                </span>
              )}
            </div>

            {loadingHoldings ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
              </div>
            ) : viewingHoldings && viewingHoldings.length > 0 ? (
              <>
                <div className="flex flex-col gap-2">
                  {viewingHoldings.slice(0, showAllHoldings ? undefined : 10).map((h, i) => {
                    // Clean company name by removing common suffixes (keep 'Corporation' spelled out)
                    const cleanCompanyName = (h.name || h.ticker)
                      .replace(/\s*\(publ\.?\)/gi, '')  // (publ) or (publ.)
                      .replace(/\s*\(AB\)/gi, '')       // (AB)
                      .replace(/\bAB\b(?!\w)/gi, '')    // AB at end of name
                      .replace(/\bpubl\.?\b/gi, '')     // publ or publ.
                      .replace(/\b(ASA|AS|A\/S|SE|Inc\.?|Inc|Corp\.?|Ltd\.?|Limited|PLC|N\.V\.|S\.A\.|GmbH|AG)\b/gi, '')
                      .replace(/\s*[.,;]\s*$/g, '')     // Remove trailing punctuation
                      .replace(/\s+/g, ' ')             // Normalize whitespace
                      .trim();
                    
                    // Calculate relative bar width (largest holding = 100% width)
                    const maxWeight = Math.max(...viewingHoldings.map(holding => holding.weight || 0));
                    const relativeWidth = maxWeight > 0 ? ((h.weight || 0) / maxWeight) * 100 : 0;
                    
                    return (
                      <div key={h.ticker} className={`flex flex-col gap-1.5 p-3 rounded-lg ${isDark ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'} transition`}>
                        <div className="flex items-center gap-3">
                          <FlagIcon ticker={h.ticker} />
                          {/* Name & Ticker */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{cleanCompanyName}</p>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{h.ticker}</p>
                          </div>
                          {/* Weight & Value */}
                          <div className="text-right">
                            <p className="font-bold text-sm">{h.weight?.toFixed(2) || '0.00'}%</p>
                            {profile.showPortfolioValue && h.value && (
                              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{h.value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</p>
                            )}
                          </div>
                        </div>
                        {/* Weight visualization bar - scaled relative to largest holding */}
                        <div className={`h-0.5 rounded-full ${isDark ? 'bg-gray-600' : 'bg-gray-200'} overflow-hidden`}>
                          <div 
                            className="h-full bg-linear-to-r from-red-500 to-pink-500"
                            style={{ width: `${relativeWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* View All Button */}
                {viewingHoldings.length > 10 && (
                  <button
                    onClick={() => setShowAllHoldings(!showAllHoldings)}
                    className={`w-full mt-3 py-2.5 rounded-lg font-semibold transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                  >
                    {showAllHoldings ? 'Show Less' : `View All (${viewingHoldings.length})`}
                  </button>
                )}
              </>
            ) : (
              <p className={`text-center py-8 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                No holdings to display
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}