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
  const [loadingProfile, setLoadingProfile] = useState(!apiCache.has(`/api/users/${targetUser}/profile`));
  const [showcaseItems, setShowcaseItems] = useState([]);
  const [loadingShowcase, setLoadingShowcase] = useState(false);
  const [viewingHoldings, setViewingHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [userActivity, setUserActivity] = useState(() => apiCache.get(`/api/users/${targetUser}/activity`) || []);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [dividends, setDividends] = useState(null);
  const [loadingDividends, setLoadingDividends] = useState(false);
  const [csTrades, setCsTrades] = useState(null);
  const [loadingCsTrades, setLoadingCsTrades] = useState(false);
  const [activeTab, setActiveTab] = useState('activity');

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
    if (profile?.publicDividends) {
      loadPublicDividends();
    }
    if (profile?.publicCsTrades) {
      loadPublicCsTrades();
    }
    loadUserActivity();
  }, [profile]);

  async function fetchProfile() {
    setLoadingProfile(true);
    try {
      const res = await fetch(`/api/users/${targetUser}/profile`, { headers: h });
      const data = await res.json();
      apiCache.set(`/api/users/${targetUser}/profile`, data);
      setProfile(data);
    } catch(e) {}
    setLoadingProfile(false);
  }

  async function loadShowcaseItems() {
    if (!profile.steamId || !profile.showcaseItems || profile.showcaseItems.length === 0) return;

    setLoadingShowcase(true);
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
    setLoadingShowcase(false);
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

  async function loadPublicDividends() {
    setLoadingDividends(true);
    try {
      const res = await fetch(`/api/users/${targetUser}/dividends`, { headers: h });
      if (res.ok) setDividends(await res.json());
    } catch(e) {}
    setLoadingDividends(false);
  }

  async function loadPublicCsTrades() {
    setLoadingCsTrades(true);
    try {
      const res = await fetch(`/api/users/${targetUser}/cs-trades`, { headers: h });
      if (res.ok) setCsTrades(await res.json());
    } catch(e) {}
    setLoadingCsTrades(false);
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
    <div className="flex-1 min-h-0 overflow-y-auto">
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
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-zinc-300 hover:text-white"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.718L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/>
                  </svg>
                  Steam Profile
                  <svg className="w-3 h-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4">
          {[
            { id: 'activity', label: 'Recent Activity' },
            { id: 'portfolio', label: 'Portfolio' },
            { id: 'showcase', label: 'Item Showcase' },
            { id: 'cs-trades', label: 'CS Trades' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
                activeTab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {/* Recent Activity Tab */}
        {activeTab === 'activity' && (
          <div className={`${card} p-4`}>
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
              <p className="text-center py-10 text-sm text-zinc-400">No recent activity</p>
            )}
          </div>
        )}

        {/* Portfolio Tab — two columns */}
        {activeTab === 'portfolio' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Holdings */}
            <div className={`${card} p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Holdings</p>
              {!profile.publicHoldings ? (
                <p className="text-center py-10 text-sm text-zinc-400">Portfolio is private</p>
              ) : loadingHoldings ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : viewingHoldings && viewingHoldings.length > 0 ? (
                <>
                  <div className="flex flex-col gap-2">
                    {viewingHoldings.slice(0, showAllHoldings ? undefined : 10).map((holding) => {
                      const cleanCompanyName = (holding.name || holding.ticker)
                        .replace(/\s*\(publ\.?\)/gi, '')
                        .replace(/\s*\(AB\)/gi, '')
                        .replace(/\bAB\b(?!\w)/gi, '')
                        .replace(/\bpubl\.?\b/gi, '')
                        .replace(/\b(ASA|AS|A\/S|SE|Inc\.?|Inc|Corp\.?|Ltd\.?|Limited|PLC|N\.V\.|S\.A\.|GmbH|AG)\b/gi, '')
                        .replace(/\s*[.,;]\s*$/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                      const maxWeight = Math.max(...viewingHoldings.map(hh => hh.weight || 0));
                      const relativeWidth = maxWeight > 0 ? ((holding.weight || 0) / maxWeight) * 100 : 0;
                      return (
                        <div key={holding.ticker} className="flex flex-col gap-1 p-2.5 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 transition">
                          <div className="flex items-center gap-2.5">
                            <FlagIcon ticker={holding.ticker} size="w-6 h-4.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{cleanCompanyName}</p>
                              <p className="text-xs text-zinc-400">{holding.ticker}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-sm">{holding.weight?.toFixed(2) || '0.00'}%</p>
                              {profile.showPortfolioValue && holding.value && (
                                <p className="text-xs text-zinc-400">{holding.value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</p>
                              )}
                            </div>
                          </div>
                          <div className="h-0.5 rounded-full bg-zinc-600 overflow-hidden">
                            <div className="h-full bg-linear-to-r from-red-500 to-pink-500" style={{ width: `${relativeWidth}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {viewingHoldings.length > 10 && (
                    <button onClick={() => setShowAllHoldings(!showAllHoldings)} className="w-full mt-3 py-2.5 rounded-lg text-sm font-semibold transition bg-zinc-700 hover:bg-zinc-600 text-zinc-300">
                      {showAllHoldings ? 'Show Less' : `View All (${viewingHoldings.length})`}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-center py-10 text-sm text-zinc-400">No holdings to display</p>
              )}
            </div>

            {/* Right: Dividends */}
            <div className={`${card} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Dividends</p>
                {dividends && <p className="text-xs text-zinc-400">{dividends.totalAllTime.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr all time</p>}
              </div>
              {!profile.publicDividends ? (
                <p className="text-center py-10 text-sm text-zinc-400">Dividends are private</p>
              ) : loadingDividends ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : dividends && dividends.byYear?.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {(() => {
                    const maxDiv = Math.max(...dividends.byYear.map(y => y.total));
                    return dividends.byYear.map(y => (
                      <div key={y.year} className="flex items-center gap-3">
                        <span className="text-xs font-bold w-10 shrink-0 text-zinc-300">{y.year}</span>
                        <div className="flex-1 h-4 rounded-full bg-zinc-700 overflow-hidden">
                          <div className="h-full rounded-full bg-linear-to-r from-pink-600 to-pink-400" style={{ width: `${maxDiv > 0 ? (y.total / maxDiv) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs font-semibold w-24 text-right shrink-0">{y.total.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</span>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <p className="text-center py-10 text-sm text-zinc-400">No dividend data</p>
              )}
            </div>
          </div>
        )}

        {/* CS Trades Tab */}
        {activeTab === 'cs-trades' && (
          <div className={`${card} overflow-hidden`}>
            {!profile.publicCsTrades ? (
              <p className="text-center py-10 text-sm text-zinc-400">CS trade registry is private</p>
            ) : loadingCsTrades ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
              </div>
            ) : csTrades && csTrades.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 border-b border-zinc-700">
                  <tr>
                    {['Skin', 'Exterior', 'Bought', 'Sold', 'Status'].map(col => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csTrades.map(t => {
                    const pnl = t.sold && t.salePrice != null && t.purchasePrice != null ? t.salePrice - t.purchasePrice : null;
                    return (
                      <tr key={t.id} className="border-t border-zinc-700/50 hover:bg-zinc-700/20 transition">
                        <td className="px-4 py-3 font-semibold text-sm">{t.skinName}</td>
                        <td className="px-4 py-3 text-xs text-zinc-400">{t.exterior || '—'}</td>
                        <td className="px-4 py-3 text-xs text-zinc-300">
                          <div>{t.purchaseDate}</div>
                          <div className="text-zinc-400">{t.purchasePrice != null ? `${t.purchasePrice.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} ${t.purchaseCurrency || ''}` : '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-300">
                          {t.sold ? (
                            <>
                              <div>{t.saleDate}</div>
                              <div className="text-zinc-400">{t.salePrice != null ? `${t.salePrice.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} ${t.saleCurrency || ''}` : '—'}</div>
                            </>
                          ) : <span className="text-zinc-500">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {t.sold ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pnl != null && pnl >= 0 ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                              {pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}` : 'Sold'}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Held</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-center py-10 text-sm text-zinc-400">No trades recorded</p>
            )}
          </div>
        )}

        {/* Item Showcase Tab */}
        {activeTab === 'showcase' && (
          <div className={`${card} p-4`}>
            {loadingShowcase ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
              </div>
            ) : showcaseItems.length > 0 ? (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
                {showcaseItems.map(item => (
                  <div key={item.assetId} className="bg-zinc-700/50 hover:bg-zinc-700 rounded p-1 transition cursor-pointer border border-zinc-600">
                    <img src={item.iconUrl} alt={item.name} className="w-full aspect-square object-contain mb-0.5" />
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
            ) : !profile.steamVerified ? (
              <p className="text-center py-10 text-sm text-zinc-400">No Steam account linked</p>
            ) : (
              <p className="text-center py-10 text-sm text-zinc-400">No items in showcase</p>
            )}
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