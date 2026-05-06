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
    <div className={`${size} rounded-full flex items-center justify-center text-2xl shrink-0 bg-gray-700 border-2 border-gray-600`}>
      {flag}
    </div>
  );
}

export default function ProfilePageView({ isDark, authUsername, viewUsername = null }) {
  const navigate = useNavigate();
  const isOwnProfile = !viewUsername || viewUsername === authUsername;
  const targetUser = viewUsername || authUsername;

  const [profile, setProfile] = useState(null);
  const [viewingInventory, setViewingInventory] = useState(null);
  const [viewingHoldings, setViewingHoldings] = useState(null);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [showAllHoldings, setShowAllHoldings] = useState(false);

  const h = { 'Content-Type': 'application/json', ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };
  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;

  useEffect(() => {
    fetchProfile();
  }, [targetUser]);

  useEffect(() => {
    if (profile?.publicInventory) loadPublicInventory();
    if (profile?.publicHoldings) loadPublicHoldings();
  }, [profile]);

  async function fetchProfile() {
    try {
      const res = await fetch(`/api/users/${targetUser}/profile`, { headers: h });
      const data = await res.json();
      setProfile(data);
    } catch(e) {}
  }

  async function loadPublicInventory() {
    setLoadingInventory(true); setInventoryError('');
    try {
      const res = await fetch(`/api/users/${targetUser}/inventory`, { headers: h });
      const data = await res.json();
      if (data.error) { setInventoryError(data.error); } else { setViewingInventory(data); }
    } catch { setInventoryError('Failed to load inventory.'); }
    setLoadingInventory(false);
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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left: Profile card */}
          <div className="flex flex-col gap-4">
            <div className={`${card} p-6 flex flex-col items-center text-center`}>
              <AvatarDisplay src={profile.avatarBase64} username={targetUser} size="w-28 h-28" textSize="text-5xl" />
              <h2 className="text-xl font-bold mt-4">{targetUser}</h2>
              {profile.role && ROLE_BADGE[profile.role] && (
                <span className={`text-xs px-2.5 py-1 rounded-full mt-1 ${ROLE_BADGE[profile.role].cls}`}>{ROLE_BADGE[profile.role].label}</span>
              )}
              <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Member since {formatDate(profile.createdAt)}</p>
              
              {/* Bio */}
              {profile.bio && (
                <div className={`w-full mt-4 p-3 rounded-lg text-left text-sm ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <p className={isDark ? 'text-gray-300' : 'text-gray-700'}>{profile.bio}</p>
                </div>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {profile.steamId && (
                  <a href={`https://steamcommunity.com/profiles/${profile.steamId}`} target="_blank" rel="noopener noreferrer"
                    className={`text-xs px-2 py-0.5 rounded-full hover:opacity-80 transition ${profile.steamVerified ? 'text-green-400 bg-green-900/30' : 'text-orange-400 bg-orange-900/30'}`}>
                    {profile.steamVerified ? '✓ Steam verified ↗' : 'Steam linked ↗'}
                  </a>
                )}
                {profile.publicInventory && <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">Public CS inv.</span>}
                {profile.publicHoldings && <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">Public portfolio</span>}
              </div>

              {/* Edit button (only on own profile) */}
              {isOwnProfile && (
                <button
                  onClick={() => navigate('/profile/edit')}
                  className="w-full mt-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>

          {/* Right: Public content */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* CS Inventory */}
            <div className={`${card} p-5`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>CS Inventory</h3>
              {!profile.publicInventory ? (
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>🔒 Private</p>
              ) : loadingInventory ? (
                <div className="flex items-center gap-2 py-2"><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/><span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading...</span></div>
              ) : inventoryError ? (
                <p className="text-sm text-red-400">{inventoryError}</p>
              ) : viewingInventory ? (
                <>
                  <div className="flex gap-6 mb-4">
                    <div><p className={`text-xs mb-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Items</p><p className="font-bold text-lg">{viewingInventory.count}</p></div>
                    <div><p className={`text-xs mb-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Est. Value</p><p className="font-bold text-lg text-green-400">{viewingInventory.totalValue.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</p></div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-72 overflow-y-auto">
                    {viewingInventory.items.slice(0, 24).map((item, i) => (
                      <div key={i} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-2 text-center`}>
                        {item.iconUrl && <img src={item.iconUrl} alt={item.name} className="w-full h-12 object-contain mb-1"/>}
                        <p className="text-xs truncate" title={item.name}>{item.name}</p>
                        {item.priceSEK > 0 && <p className="text-xs text-green-400 font-bold">{item.priceSEK.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</p>}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            {/* Stock holdings */}
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Portfolio</h3>
                {profile.publicHoldings && viewingHoldings?.length > 0 && (
                  <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{viewingHoldings.length} holdings</span>
                )}
              </div>
              {!profile.publicHoldings ? (
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>🔒 Private</p>
              ) : loadingHoldings ? (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
              ) : viewingHoldings?.length > 0 ? (
                <>
                  <div className="flex flex-col gap-2">
                    {viewingHoldings.slice(0, showAllHoldings ? undefined : 10).map((h, i) => {
                      // Clean company name by removing common suffixes (including variants with periods/parentheses)
                      const cleanCompanyName = (h.name || h.ticker)
                        .replace(/\s*\(publ\.?\)/gi, '')  // (publ) or (publ.)
                        .replace(/\s*\(AB\)/gi, '')       // (AB)
                        .replace(/\bAB\b(?!\w)/gi, '')    // AB at end of name
                        .replace(/\bpubl\.?\b/gi, '')     // publ or publ.
                        .replace(/\b(ASA|AS|A\/S|SE|Inc\.|Inc|Corp\.|Corporation|Ltd\.|Limited|PLC|N\.V\.|S\.A\.|GmbH|AG)\b/gi, '')
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
                  {viewingHoldings.length > 10 && (
                    <button
                      onClick={() => setShowAllHoldings(!showAllHoldings)}
                      className={`w-full mt-3 py-2 rounded-lg text-sm font-medium transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                    >
                      {showAllHoldings ? 'Show Less' : `View All (${viewingHoldings.length})`}
                    </button>
                  )}
                </>
              ) : (
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No public holdings</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}