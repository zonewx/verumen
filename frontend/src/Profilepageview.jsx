import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ROLE_BADGE = {
  admin: { label: '🛡️ Admin', cls: 'bg-red-900/40 text-red-400 border border-red-800' },
  moderator: { label: '🛡 Moderator', cls: 'bg-blue-900/40 text-blue-400 border border-blue-800' },
};

function AvatarDisplay({ src, username, size = 'w-24 h-24', textSize = 'text-4xl' }) {
  if (src) return <img src={src} alt={username} className={`${size} rounded-full object-cover border-4 border-gray-700`} />;
  const initial = username?.[0]?.toUpperCase() || '?';
  return <div className={`${size} rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center ${textSize} font-bold text-white border-4 border-gray-700`}>{initial}</div>;
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

  const h = { 'Content-Type': 'application/json', ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };
  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;

  useEffect(() => {
    fetchProfile();
    if (profile?.publicInventory) loadPublicInventory();
    if (profile?.publicHoldings) loadPublicHoldings();
  }, [targetUser]);

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
      const res = await fetch(`/api/users/${targetUser}/holdings`, { headers: h });
      const data = await res.json();
      setViewingHoldings(data.holdings || []);
    } catch {}
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
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Portfolio</h3>
              {!profile.publicHoldings ? (
                <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>🔒 Private</p>
              ) : loadingHoldings ? (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
              ) : viewingHoldings?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {viewingHoldings.map(h => (
                    <div key={h.ticker} className={`${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg px-3 py-1.5`}>
                      <span className="text-sm font-bold">{h.ticker}</span>
                      <span className={`ml-1.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{h.quantity} shares</span>
                    </div>
                  ))}
                </div>
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