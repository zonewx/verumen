import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiCache from './apiCache';

const COUNTRIES = [
  { code: 'se', name: '🇸🇪 Sweden' }, { code: 'no', name: '🇳🇴 Norway' }, { code: 'dk', name: '🇩🇰 Denmark' },
  { code: 'fi', name: '🇫🇮 Finland' }, { code: 'de', name: '🇩🇪 Germany' }, { code: 'gb', name: '🇬🇧 United Kingdom' },
  { code: 'fr', name: '🇫🇷 France' }, { code: 'es', name: '🇪🇸 Spain' }, { code: 'it', name: '🇮🇹 Italy' },
  { code: 'nl', name: '🇳🇱 Netherlands' }, { code: 'pl', name: '🇵🇱 Poland' }, { code: 'ch', name: '🇨🇭 Switzerland' },
  { code: 'at', name: '🇦🇹 Austria' }, { code: 'be', name: '🇧🇪 Belgium' }, { code: 'pt', name: '🇵🇹 Portugal' },
  { code: 'us', name: '🇺🇸 United States' }, { code: 'ca', name: '🇨🇦 Canada' }, { code: 'au', name: '🇦🇺 Australia' },
  { code: 'nz', name: '🇳🇿 New Zealand' }, { code: 'jp', name: '🇯🇵 Japan' }, { code: 'cn', name: '🇨🇳 China' },
  { code: 'sg', name: '🇸🇬 Singapore' }, { code: 'in', name: '🇮🇳 India' }, { code: 'br', name: '🇧🇷 Brazil' },
  { code: 'za', name: '🇿🇦 South Africa' }, { code: 'ae', name: '🇦🇪 UAE' }, { code: 'ru', name: '🇷🇺 Russia' },
];

const ROLE_BADGE = {
  admin: { label: 'Admin', cls: 'bg-red-900/40 text-red-400 border border-red-800' },
  moderator: { label: 'Moderator', cls: 'bg-blue-900/40 text-blue-400 border border-blue-800' },
};

function AvatarDisplay({ src, username, size = 'w-24 h-24', textSize = 'text-4xl' }) {
  if (src) return <img src={src} alt={username} className={`${size} rounded-full object-cover border-4 border-gray-700`} />;
  const initial = username?.[0]?.toUpperCase() || '?';
  return <div className={`${size} rounded-full bg-linear-to-br from-blue-600 to-blue-800 flex items-center justify-center ${textSize} font-bold text-white border-4 border-gray-700`}>{initial}</div>;
}

const Toggle = ({ value, onChange }) => (
  <button type="button" onClick={() => onChange(!value)}
    className={`relative w-11 h-6 rounded-full transition ${value ? 'bg-blue-600' : 'bg-gray-600'}`}>
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition transform ${value ? 'translate-x-5' : ''}`} />
  </button>
);

export default function ProfileEditPage({ isDark, authUsername }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [editForm, setEditForm] = useState({ bio: '', steamId: '', publicInventory: false, publicHoldings: false, publicDividends: false, showPortfolioValue: false, avatarBase64: null, showcaseItems: [], country: 'se' });
  const [steamVerified, setSteamVerified] = useState(false);
  const [steamLookupError, setSteamLookupError] = useState('');
  const [steamLookupLoading, setSteamLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernameMsg, setUsernameMsg] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  
  // Showcase items state
  const [inventory, setInventory] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [selectedShowcaseItems, setSelectedShowcaseItems] = useState([]);

  const h = { 'Content-Type': 'application/json', ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };
  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider block mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`;

  useEffect(() => {
    fetchProfile();
    // Handle Steam callback redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('steam_success')) {
      setSteamVerified(true);
      const steamName = params.get('steam_name');
      if (steamName) setSaveMsg(`✓ Steam verified as ${steamName}!`);
      window.history.replaceState({}, '', window.location.pathname);
      fetchProfile();
    } else if (params.get('steam_error')) {
      setSteamLookupError('Steam verification failed. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function fetchProfile() {
    try {
      const cached = apiCache.get(`/api/users/${authUsername}/profile`);
      const data = cached || await fetch(`/api/users/${authUsername}/profile`, { headers: h }).then(r => r.json());
      if (!cached) apiCache.set(`/api/users/${authUsername}/profile`, data);
      setProfile(data);
      setEditForm({
        bio: data.bio || '',
        steamId: data.steamId || '',
        publicInventory: data.publicInventory || false,
        publicHoldings: data.publicHoldings || false,
        publicDividends: data.publicDividends || false,
        showPortfolioValue: data.showPortfolioValue || false,
        avatarBase64: data.avatarBase64 || null,
        showcaseItems: data.showcaseItems || [],
        country: data.country || 'se'
      });
      setSelectedShowcaseItems(data.showcaseItems || []);
      setSteamVerified(data.steamVerified || false);
      if (data.steamId) loadInventory(data.steamId);
      // Refresh in background if we served from cache
      if (cached) fetch(`/api/users/${authUsername}/profile`, { headers: h }).then(r => r.json())
        .then(d => { apiCache.set(`/api/users/${authUsername}/profile`, d); setProfile(d); }).catch(() => {});
    } catch(e) {}
  }

  async function loadInventory(steamId) {
    setLoadingInventory(true);
    try {
      const res = await fetch(`/api/cs/steam/inventory/${steamId}`, { headers: h });
      const data = await res.json();
      setInventory(data.items || []);
    } catch(e) {
      console.error('Failed to load inventory:', e);
    }
    setLoadingInventory(false);
  }

  function toggleShowcaseItem(assetId) {
    setSelectedShowcaseItems(prev => {
      if (prev.includes(assetId)) {
        // Remove from selection
        return prev.filter(id => id !== assetId);
      } else if (prev.length < 10) {
        // Add to selection (max 10)
        return [...prev, assetId];
      }
      return prev; // Already at max
    });
  }

  async function handleSteamLogin() {
    setSteamLookupLoading(true); setSteamLookupError('');
    try {
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch('/api/steam/auth', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setSteamLookupError('Failed to start Steam login');
    } catch(e) { setSteamLookupError('Failed to start Steam login'); }
    setSteamLookupLoading(false);
  }

  async function unlinkSteam() {
    await fetch('/api/steam/unlink', { method: 'DELETE', headers: h });
    setSteamVerified(false);
    setEditForm(f => ({ ...f, steamId: '' }));
    window.dispatchEvent(new Event('profile-updated'));
  }

  async function saveProfile() {
    setSaving(true); setSaveMsg('');
    try {
      const payload = { ...editForm, showcaseItems: selectedShowcaseItems };
      const res = await fetch(`/api/users/${authUsername}/profile`, { method: 'PUT', headers: h, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
        setSaveMsg('✓ Saved');
        window.dispatchEvent(new Event('profile-updated'));
        // Navigate back to profile after save
        setTimeout(() => navigate('/profile'), 1500);
      } else {
        setSaveMsg('Failed to save');
      }
    } catch(e) { setSaveMsg('Error'); }
    setSaving(false);
  }

  async function handleUsernameChange() {
    if (!newUsername.trim()) return;
    if (newUsername.trim() === authUsername) { setUsernameMsg('That is already your username.'); return; }
    setUsernameLoading(true); setUsernameMsg('');
    try {
      const res = await fetch(`/api/users/${authUsername}/username`, {
        method: 'PUT',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUsername: newUsername.trim() })
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('auth_username', data.username);
        setUsernameMsg('✓ Username changed! Redirecting...');
        window.dispatchEvent(new Event('profile-updated'));
        setTimeout(() => { window.location.href = '/profile'; }, 1500);
      } else {
        setUsernameMsg(data.error || 'Failed to change username.');
      }
    } catch(e) { setUsernameMsg('Error changing username.'); }
    setUsernameLoading(false);
  }

  function handleAvatarUpload(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB'); return; }
    setAvatarUploading(true);
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height);
        canvas.width = 200; canvas.height = 200;
        canvas.getContext('2d').drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 200, 200);
        setEditForm(f => ({ ...f, avatarBase64: canvas.toDataURL('image/jpeg', 0.85) }));
        setAvatarUploading(false);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
      <div className="px-10 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Edit Profile</h1>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Manage your profile settings and privacy</p>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
          >
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Avatar + Privacy */}
          <div className="flex flex-col gap-4">
            {/* Avatar */}
            <div className={`${card} p-6`}>
              <label className={`${labelCls} mb-3`}>Profile Photo</label>
              <div className="flex flex-col items-center">
                <div className="relative mb-4">
                  <AvatarDisplay src={editForm.avatarBase64} username={authUsername} size="w-32 h-32" textSize="text-5xl" />
                  <label className="absolute bottom-0 right-0 w-10 h-10 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center cursor-pointer transition shadow-lg" title="Upload photo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleAvatarUpload(e.target.files[0])} />
                  </label>
                  {avatarUploading && <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center"><div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"/></div>}
                </div>
                {editForm.avatarBase64 && (
                  <button onClick={() => setEditForm(f => ({ ...f, avatarBase64: null }))} className={`text-xs ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'} transition`}>Remove photo</button>
                )}
              </div>
            </div>

            {/* Privacy Settings */}
            <div className={`${card} p-6`}>
              <label className={`${labelCls} mb-3`}>Privacy</label>
              <div className="flex flex-col gap-3">
                {[
                  { key: 'publicInventory', title: 'Public CS Inventory', desc: 'Show Steam CS inventory on profile' },
                  { key: 'publicHoldings', title: 'Public Portfolio', desc: 'Show stock holdings on profile' },
                  { key: 'publicDividends', title: 'Public Dividends', desc: 'Show dividend data on profile' },
                  { key: 'showPortfolioValue', title: 'Show Portfolio Value', desc: 'Display currency values of holdings' },
                ].map(({ key, title, desc }) => (
                  <div key={key} className={`flex items-center justify-between gap-3 p-3 rounded-xl ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{title}</p>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{desc}</p>
                    </div>
                    <Toggle value={editForm[key]} onChange={v => setEditForm(f => ({ ...f, [key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Edit Fields */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Username */}
            <div className={`${card} p-6`}>
              <label className={labelCls}>Username</label>
              <p className={`text-xs mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Current: <span className="font-semibold text-white">{authUsername}</span>
              </p>
              <div className="flex gap-2">
                <input
                  value={newUsername}
                  onChange={e => { setNewUsername(e.target.value); setUsernameMsg(''); }}
                  placeholder="New username..."
                  maxLength={20}
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={handleUsernameChange}
                  disabled={usernameLoading || !newUsername.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition shrink-0"
                >
                  {usernameLoading ? 'Saving...' : 'Change'}
                </button>
              </div>
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>3–20 characters, letters, numbers and underscores only.</p>
              {usernameMsg && (
                <p className={`text-xs mt-2 font-medium ${usernameMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                  {usernameMsg}
                </p>
              )}
            </div>

            {/* Bio */}
            <div className={`${card} p-6`}>
              <label className={labelCls}>Bio</label>
              <textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={4} maxLength={200} placeholder="Tell the community about yourself..." className={`${inputCls} resize-none`} />
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{editForm.bio.length}/200</p>
            </div>

            {/* Country */}
            <div className={`${card} p-6`}>
              <label className={labelCls}>Country</label>
              <div className="flex items-center gap-3 mt-2">
                <img src={`https://flagcdn.com/${editForm.country}.svg`} alt={editForm.country} className="w-8 h-6 rounded-sm" />
                <select
                  value={editForm.country}
                  onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))}
                  className={`${inputCls} flex-1`}
                >
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Steam Account */}
            <div className={`${card} p-6`}>
              <label className={labelCls}>Steam Account</label>
              {steamVerified && editForm.steamId ? (
                <div className={`flex items-center gap-3 p-4 rounded-xl ${isDark ? 'bg-green-900/20 border border-green-800/40' : 'bg-green-50 border border-green-200'}`}>
                  <img src="https://store.steampowered.com/favicon.ico" alt="Steam" className="w-6 h-6 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-400">✓ Steam linked & verified</p>
                    <a href={`https://steamcommunity.com/profiles/${editForm.steamId}`} target="_blank" rel="noopener noreferrer" className={`text-xs hover:underline ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{editForm.steamId} ↗</a>
                  </div>
                  <button onClick={unlinkSteam} className={`text-xs px-3 py-1.5 rounded-lg transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>Unlink</button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button onClick={handleSteamLogin} disabled={steamLookupLoading} className="self-start hover:opacity-90 transition disabled:opacity-50">
                    <img src="https://community.cloudflare.steamstatic.com/public/images/signinthroughsteam/sits_01.png" alt="Sign in through Steam" className="h-10" />
                  </button>
                  <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>You'll be redirected to Steam to verify your account.</p>
                  {steamLookupError && <p className="text-xs text-red-400">{steamLookupError}</p>}
                </div>
              )}
            </div>

            {/* Item Showcase Selector */}
            {steamVerified && editForm.steamId && (
              <div className={`${card} p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <label className={labelCls}>Item Showcase</label>
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Select up to 10 items from your CS inventory to display on your profile
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${selectedShowcaseItems.length >= 10 ? 'text-red-400' : 'text-blue-400'}`}>
                    {selectedShowcaseItems.length}/10
                  </span>
                </div>

                {loadingInventory ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                  </div>
                ) : inventory.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 max-h-96 overflow-y-auto p-2 rounded-lg" style={{ scrollbarWidth: 'thin' }}>
                    {inventory.map(item => {
                      const isSelected = selectedShowcaseItems.includes(item.assetId);
                      return (
                        <button
                          key={item.assetId}
                          onClick={() => toggleShowcaseItem(item.assetId)}
                          className={`relative p-2 rounded-lg transition border-2 ${
                            isSelected 
                              ? 'border-blue-500 bg-blue-500/20' 
                              : isDark 
                                ? 'border-gray-600 bg-gray-700/50 hover:bg-gray-700 hover:border-gray-500' 
                                : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'
                          }`}
                          disabled={!isSelected && selectedShowcaseItems.length >= 10}
                        >
                          <img 
                            src={item.iconUrl} 
                            alt={item.name}
                            className="w-full aspect-square object-contain mb-1"
                          />
                          <p className={`text-xs text-center truncate ${isSelected ? 'font-semibold text-blue-400' : isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {item.name}
                          </p>
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              ✓
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className={`text-center py-8 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    No CS items found in your inventory
                  </p>
                )}

                {selectedShowcaseItems.length > 0 && (
                  <button
                    onClick={() => setSelectedShowcaseItems([])}
                    className={`mt-3 text-xs px-3 py-1.5 rounded-lg transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                  >
                    Clear Selection
                  </button>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Save Button (sticky at bottom) */}
        <div className={`sticky bottom-0 mt-6 p-6 ${isDark ? 'bg-gray-900/95 border-gray-700' : 'bg-white/95 border-gray-200'} border-t backdrop-blur-sm`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={saveProfile} disabled={saving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              {saveMsg && <span className={`text-sm ${saveMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{saveMsg}</span>}
            </div>
            <button onClick={() => navigate('/profile')} className={`text-sm ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition`}>
              Discard changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}