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

// Get country flag emoji based on exchange suffix
function getExchangeFlag(ticker) {
  const flags = {
    'ST': '🇸🇪',   // Sweden
    'OL': '🇳🇴',   // Norway
    'CO': '🇩🇰',   // Denmark
    'HE': '🇫🇮',   // Finland
    'AS': '🇳🇱',   // Netherlands
    'PA': '🇫🇷',   // France
    'DE': '🇩🇪',   // Germany
    'L': '🇬🇧',    // London
    'MI': '🇮🇹',   // Italy
    'MC': '🇪🇸',   // Spain
    'SW': '🇨🇭',   // Switzerland
    'TO': '🇨🇦',   // Canada
    'AX': '🇦🇺',   // Australia
    'HK': '🇭🇰',   // Hong Kong
    'T': '🇯🇵',    // Japan
  };
  
  const parts = ticker.split('.');
  if (parts.length > 1) {
    const suffix = parts[parts.length - 1];
    return flags[suffix] || '🇺🇸';
  }
  return '🇺🇸'; // Default to US for no suffix
}

function FlagIcon({ ticker, size = 'w-10 h-10' }) {
  const flag = getExchangeFlag(ticker);
  return (
    <div className={`${size} flex items-center justify-center shrink-0`} style={{ fontSize: '2.5rem' }}>
      {flag}
    </div>
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
        ?.filter(item => profile.showcaseItems.includes(item.assetid))
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
        const portfolio = portfolioData.portfolio || [];
        
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
        <div className={`${card} p-6 mb-6`}>
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="shrink-0">
              <AvatarDisplay src={profile.avatarBase64} username={targetUser} size="w-32 h-32" textSize="text-5xl" />
            </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-bold">{targetUser}</h2>
                <span className="text-2xl">🇸🇪</span>
                {profile.role && ROLE_BADGE[profile.role] && (
                  <span className={`text-xs px-2.5 py-1 rounded-full ${ROLE_BADGE[profile.role].cls}`}>
                    {ROLE_BADGE[profile.role].label}
                  </span>
                )}
              </div>
              
              <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Member since {formatDate(profile.createdAt)}
              </p>

              {profile.bio && (
                <p className={`text-sm mb-4 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{profile.bio}</p>
              )}

              {/* Verification Badges */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {profile.steamVerified && (
                  <a href={`https://steamcommunity.com/profiles/${profile.steamId}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-green-400 hover:text-green-300 transition">
                    <span>✓</span>
                    <span>Steam verified</span>
                    <span>↗</span>
                  </a>
                )}
                {profile.publicInventory && (
                  <div className={`flex items-center gap-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <span>✓</span>
                    <span>Public CS inv.</span>
                  </div>
                )}
                {profile.publicHoldings && (
                  <div className={`flex items-center gap-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <span>✓</span>
                    <span>Public portfolio</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Level Badge + Edit Button */}
            <div className="flex flex-col items-end gap-4 shrink-0">
              {/* Steam Level Badge */}
              {profile.steamLevel > 0 && (
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Level</span>
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-linear-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xl border-4 border-blue-400 shadow-lg">
                      {profile.steamLevel}
                    </div>
                  </div>
                </div>
              )}

              {/* Edit Profile Button */}
              {isOwnProfile && (
                <button
                  onClick={() => navigate('/profile/edit')}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition shadow-md"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Item Showcase Section */}
        {showcaseItems && showcaseItems.length > 0 && (
          <div className={`${card} p-5 mb-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Item Showcase
              </h3>
              <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {showcaseItems.length} {showcaseItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {showcaseItems.map(item => (
                <div key={item.assetid} className={`${isDark ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg p-3 transition cursor-pointer border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                  <img 
                    src={`https://community.cloudflare.steamstatic.com/economy/image/${item.icon_url}`} 
                    alt={item.market_hash_name}
                    className="w-full aspect-square object-contain mb-2"
                  />
                  <p className="text-xs text-center truncate font-medium">{item.market_hash_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio Section */}
        {profile.publicHoldings && (
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
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
                          <FlagIcon ticker={h.ticker} size="w-10 h-10" />
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