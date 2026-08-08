import { useState, useEffect, Fragment } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiCache from './apiCache';
import { getToken } from './tokenStore';

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

export default function ProfilePageView({ authUsername, viewUsername = null, authToken = null }) {
  const navigate = useNavigate();
  const isOwnProfile = !viewUsername || viewUsername === authUsername;
  const targetUser = viewUsername || authUsername;

  const [profile, setProfile] = useState(() => apiCache.get(`/api/users/${targetUser}/profile`));
  const [loadingProfile, setLoadingProfile] = useState(!apiCache.has(`/api/users/${targetUser}/profile`));
  const [viewingHoldings, setViewingHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [userActivity, setUserActivity] = useState(() => apiCache.get(`/api/users/${targetUser}/activity`) || []);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [dividends, setDividends] = useState(null);
  const [loadingDividends, setLoadingDividends] = useState(false);
  const [csTrades, setCsTrades] = useState(null);
  const [loadingCsTrades, setLoadingCsTrades] = useState(false);
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [activeTab, setActiveTab] = useState('activity');
  const [expandedTradeIds, setExpandedTradeIds] = useState(new Set());

  const h = { 'Content-Type': 'application/json', ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) };

  useEffect(() => {
    const cached = apiCache.get(`/api/users/${targetUser}/profile`);
    setProfile(cached || null);
    setLoadingProfile(!cached);
    setUserActivity(apiCache.get(`/api/users/${targetUser}/activity`) || []);
    setViewingHoldings(null);
    setDividends(null);
    setCsTrades(null);
    setFriends([]);
    setActiveTab('activity');
    fetchProfile();
  }, [targetUser]);

  useEffect(() => {
    if (profile?.publicHoldings) {
      loadPublicHoldings();
    }
    if (profile?.publicDividends) {
      loadPublicDividends();
    }
    if (profile?.publicCsTrades || isOwnProfile) {
      loadPublicCsTrades();
    }
    loadUserActivity();
    loadFriends();
  }, [profile]);

  async function toggleHideFromProfile(id, currentlyHidden) {
    const token = getToken();
    if (!token) return;
    setCsTrades(prev => prev.map(t => t.id === id ? { ...t, hiddenFromProfile: !currentlyHidden } : t));
    await fetch(`/api/cs/inventory/${id}/profile-visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hidden: !currentlyHidden }),
    });
  }

  // Re-fetch cs-trades when the auth token arrives (token may not be ready on first profile load)
  useEffect(() => {
    if (!authToken || !profile) return;
    if (profile.publicCsTrades || isOwnProfile) {
      loadPublicCsTrades();
    }
  }, [authToken]);

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
      const token = getToken();
      if (isOwnProfile && token) {
        const res = await fetch('/api/cs/profile-holdings', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { setCsTrades(await res.json()); setLoadingCsTrades(false); return; }
      }
      // Fallback: public endpoint for other users
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/users/${targetUser}/cs-trades`, { headers });
      if (res.ok) setCsTrades(await res.json());
    } catch(e) {}
    setLoadingCsTrades(false);
  }

  async function loadFriends() {
    setLoadingFriends(true);
    try {
      const res = await fetch(`/api/users/${targetUser}/friends`, { headers: h });
      if (res.ok) setFriends(await res.json());
    } catch(e) {}
    setLoadingFriends(false);
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

  if (profile.error) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-5xl font-bold text-zinc-600 mb-3">404</p>
          <p className="text-zinc-400 text-sm">This user doesn't exist.</p>
        </div>
      </div>
    );
  }

  if (profile.isPrivate) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-8 flex items-center gap-6 max-w-lg w-full mx-6 shadow-2xl">
          <div className="shrink-0">
            {profile.avatarBase64
              ? <img src={profile.avatarBase64} alt={profile.username} className="w-24 h-24 rounded-full object-cover border-4 border-zinc-600" />
              : <div className="w-24 h-24 rounded-full bg-zinc-700 border-4 border-zinc-600 flex items-center justify-center text-4xl font-bold text-zinc-400">{profile.username?.[0]?.toUpperCase() || '?'}</div>
            }
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{profile.username}</h2>
            <p className="text-zinc-400 text-sm">This profile is private.</p>
          </div>
        </div>
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

        {/* Two-column layout: tab content (left) + right sidebar (tabs + friends) */}
        <div className="flex gap-4 items-start">

          {/* Left: Tab Content only */}
          <div className="flex-1 min-w-0">

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

            {/* Portfolio Tab — holdings only */}
            {activeTab === 'portfolio' && (
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
            )}

            {/* Dividends Tab */}
            {activeTab === 'dividends' && (
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
            )}

            {/* Current Holdings Tab */}
            {activeTab === 'cs-trades' && (
              <div className={`${card} overflow-hidden`}>
                {!profile.publicCsTrades && !isOwnProfile ? (
                  <p className="text-center py-10 text-sm text-zinc-400">CS holdings are private</p>
                ) : loadingCsTrades ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                  </div>
                ) : csTrades && csTrades.filter(t => !t.sold && !t.hiddenFromProfile).length > 0 ? (
                  <div className="divide-y divide-zinc-700/40">
                    {csTrades.filter(t => !t.sold && !t.hiddenFromProfile).map(t => {
                      const hasScreenshot = !!t.screenshotUrl;
                      const isExpanded = expandedTradeIds.has(t.id);
                      return (
                        <Fragment key={t.id}>
                          <div
                            onClick={() => hasScreenshot && setExpandedTradeIds(prev => { const next = new Set(prev); isExpanded ? next.delete(t.id) : next.add(t.id); return next; })}
                            className={`flex items-center gap-3 px-4 py-3 transition ${hasScreenshot ? 'cursor-pointer hover:bg-zinc-700/20' : ''}`}
                          >
                            {/* Chevron */}
                            <svg className={`w-3 h-3 shrink-0 text-zinc-500 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''} ${!hasScreenshot ? 'opacity-0 pointer-events-none' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                            </svg>

                            {/* Item icon */}
                            {t.iconUrl
                              ? <img src={t.iconUrl} alt="" className="w-10 h-10 object-contain shrink-0"/>
                              : <div className="w-10 h-10 shrink-0 rounded bg-zinc-700/50 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>
                                </div>
                            }

                            {/* Name + exterior */}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${t.hasStar ? 'text-violet-300' : t.skinName?.includes('StatTrak') ? 'text-orange-400' : 'text-white'}`}>
                                {t.hasStar && <span className="mr-1">★</span>}{t.skinName}
                              </p>
                              <p className="text-xs text-zinc-400 mt-0.5">{t.exterior || '—'}{t.purchaseDate ? ` · ${t.purchaseDate}` : ''}</p>
                            </div>

                            {/* Hide toggle — own profile only */}
                            {isOwnProfile && (
                              <button
                                onClick={e => { e.stopPropagation(); toggleHideFromProfile(t.id, false); }}
                                title="Hide from profile"
                                className="shrink-0 p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                                </svg>
                              </button>
                            )}

                            {/* Share */}
                            {t.shareToken && (
                              <a href={`/trade/${t.shareToken}`} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition shrink-0">
                                Share
                              </a>
                            )}
                          </div>

                          {/* Expanded screenshot */}
                          {isExpanded && hasScreenshot && (
                            <div className="px-4 pb-4 pt-1 bg-zinc-800/30">
                              <TradeScreenshot url={t.screenshotUrl} />
                            </div>
                          )}
                        </Fragment>
                      );
                    })}
                    {/* Hidden items row — own profile only */}
                    {isOwnProfile && csTrades.filter(t => !t.sold && t.hiddenFromProfile).length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs text-zinc-500">{csTrades.filter(t => !t.sold && t.hiddenFromProfile).length} hidden from profile —{' '}
                          {csTrades.filter(t => !t.sold && t.hiddenFromProfile).map(t => (
                            <button key={t.id} onClick={() => toggleHideFromProfile(t.id, true)} className="text-zinc-400 hover:text-zinc-200 transition mr-2 underline text-xs">{t.skinName}</button>
                          ))}
                        </p>
                      </div>
                    )}
                  </div>
                ) : isOwnProfile && csTrades && csTrades.filter(t => !t.sold && t.hiddenFromProfile).length > 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-zinc-400 mb-2">All holdings are hidden from profile.</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {csTrades.filter(t => !t.sold && t.hiddenFromProfile).map(t => (
                        <button key={t.id} onClick={() => toggleHideFromProfile(t.id, true)} className="text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition">{t.skinName}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-center py-10 text-sm text-zinc-400">No current holdings</p>
                )}
              </div>
            )}


          </div>{/* end left column */}

          {/* Right: Vertical Tab Nav + Friends Sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-4">

            {/* Vertical Tab Navigation */}
            <div className={`${card} p-2`}>
              {[
                { id: 'activity', label: 'Recent Activity' },
                { id: 'cs-trades', label: 'Current Holdings' },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`w-full text-left px-3 py-2.5 text-sm font-semibold rounded-lg transition ${
                    activeTab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50'
                  }`}
                >{t.label}</button>
              ))}
            </div>

            {/* Friends Card */}
            <div className={`${card} p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                Friends {friends.length > 0 && <span className="normal-case font-normal">({friends.length})</span>}
              </p>
              {loadingFriends ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : friends.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {friends.map(friend => (
                    <a
                      key={friend.username}
                      href={`/user/${friend.username}`}
                      onClick={e => { e.preventDefault(); navigate(`/user/${friend.username}`); }}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-700/50 transition"
                    >
                      <AvatarDisplay src={friend.avatarBase64} username={friend.username} size="w-8 h-8" textSize="text-sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{friend.username}</p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-center py-6 text-sm text-zinc-400">No friends yet</p>
              )}
            </div>
          </div>

        </div>{/* end two-column layout */}

      </div>
    </div>
  );
}

const _screenshotCache = {};

function TradeScreenshot({ url }) {
  const match = url?.match(/id=(\d+)/);
  const cacheKey = match?.[1];
  const [preview, setPreview] = useState(() => cacheKey ? _screenshotCache[cacheKey] ?? null : null);
  const [loading, setLoading] = useState(!preview && !!cacheKey);

  useEffect(() => {
    if (!cacheKey || _screenshotCache[cacheKey]) return;
    setLoading(true);
    const token = getToken();
    fetch(`/api/cs/steam/screenshot/${cacheKey}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(d => { if (d.previewUrl) { _screenshotCache[cacheKey] = d.previewUrl; setPreview(d.previewUrl); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cacheKey]);

  if (loading) return (
    <div className="flex items-center justify-center py-6">
      <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  );
  if (!preview) return null;
  return <img src={preview} alt="Trade screenshot" className="w-full rounded-lg object-contain max-h-80" />;
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

  if (activity.type === 'cs_trade' || activity.type === 'skin_trade') {
    const isBuy = (activity.action || activity.tradeType) === 'buy';
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
            className="w-full rounded-md object-contain"
          />
        )}
      </div>
    );
  }

  return null;
}