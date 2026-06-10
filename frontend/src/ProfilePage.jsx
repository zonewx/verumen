import { useState, useEffect } from 'react';

const ROLE_BADGE = {
  admin: { label: 'Admin', cls: 'bg-red-900/40 text-red-400 border border-red-800' },
  moderator: { label: 'Moderator', cls: 'bg-blue-900/40 text-blue-400 border border-blue-800' },
};

export default function ProfilePage({ authUsername, viewUsername = null }) {
  const isViewing = viewUsername && viewUsername !== authUsername;
  const targetUser = isViewing ? viewUsername : authUsername;

  const [profile, setProfile] = useState(null);
  const [editForm, setEditForm] = useState({ bio: '', steamId: '', publicInventory: false, publicHoldings: false, avatarBase64: null });
  const [steamLookup, setSteamLookup] = useState(null);
  const [steamLookupLoading, setSteamLookupLoading] = useState(false);
  const [steamLookupError, setSteamLookupError] = useState('');
  const [steamVerified, setSteamVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [viewingInventory, setViewingInventory] = useState(null);
  const [viewingHoldings, setViewingHoldings] = useState(null);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  const h = { 'Content-Type': 'application/json', ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };
  const card = `bg-zinc-800 border-zinc-700 border rounded-xl`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500 bg-zinc-700 border-zinc-600 text-white placeholder-zinc-500`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider block mb-1.5 text-zinc-400`;

  useEffect(() => {
    fetchProfile();
    if (isViewing) { loadPublicInventory(); loadPublicHoldings(); }
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
  }, [targetUser]);

  async function fetchProfile() {
    try {
      const res = await fetch(`/api/users/${targetUser}/profile`, { headers: h });
      const data = await res.json();
      setProfile(data);
      if (!isViewing) { setEditForm({ bio: data.bio || '', steamId: data.steamId || '', publicInventory: data.publicInventory || false, publicHoldings: data.publicHoldings || false, avatarBase64: data.avatarBase64 || null }); setSteamVerified(data.steamVerified || false); }
    } catch(e) {}
  }

  async function loadPublicInventory() {
    setLoadingInventory(true); setInventoryError('');
    try {
      const res = await fetch(`/api/users/${targetUser}/inventory`, { headers: h });
      const data = await res.json();
      if (!res.ok) setInventoryError(data.error || 'Private or unavailable');
      else setViewingInventory(data);
    } catch(e) { setInventoryError(e.message); }
    setLoadingInventory(false);
  }

  async function loadPublicHoldings() {
    setLoadingHoldings(true);
    try {
      const res = await fetch(`/api/users/${targetUser}/holdings`, { headers: h });
      const data = await res.json();
      if (res.ok) setViewingHoldings(data);
    } catch(e) {}
    setLoadingHoldings(false);
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

  async function lookupSteam() {
    if (!editForm.steamId.trim()) return;
    setSteamLookupLoading(true); setSteamLookupError(''); setSteamLookup(null);
    try {
      const res = await fetch(`/api/steam/lookup/${encodeURIComponent(editForm.steamId.trim())}`, { headers: h });
      const data = await res.json();
      if (!res.ok) setSteamLookupError(data.error || 'Not found');
      else setSteamLookup(data);
    } catch(e) { setSteamLookupError('Lookup failed'); }
    setSteamLookupLoading(false);
  }

  async function verifySteam() {
    if (!steamLookup) return;
    setSteamLookupLoading(true);
    try {
      const res = await fetch('/api/steam/verify', { method: 'POST', headers: h, body: JSON.stringify({ steamId: steamLookup.steamId }) });
      const data = await res.json();
      if (data.success) {
        setSteamVerified(true);
        setEditForm(f => ({ ...f, steamId: steamLookup.steamId }));
        setSteamLookup(null);
        window.dispatchEvent(new Event('profile-updated'));
      }
    } catch(e) {}
    setSteamLookupLoading(false);
  }

  async function unlinkSteam() {
    await fetch('/api/steam/unlink', { method: 'DELETE', headers: h });
    setSteamVerified(false);
    setEditForm(f => ({ ...f, steamId: '' }));
    setSteamLookup(null);
    window.dispatchEvent(new Event('profile-updated'));
  }

  async function saveProfile() {
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(`/api/users/${authUsername}/profile`, { method: 'PUT', headers: h, body: JSON.stringify(editForm) });
      const data = await res.json();
      if (data.success) { setProfile(data.profile); setSaveMsg('✓ Saved'); window.dispatchEvent(new Event('profile-updated')); }
      else setSaveMsg('Failed to save');
    } catch(e) { setSaveMsg('Error'); }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
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

  const Toggle = ({ value, onChange }) => (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative inline-flex items-center h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-violet-500' : 'bg-zinc-700'}`}
      style={{ width: '44px' }}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? 'translate-x5' : 'translate-x-0'}`} />
    </button>
  );

  const AvatarDisplay = ({ src, username, size = 'w-24 h-24', textSize = 'text-4xl' }) => (
    <div className={`${size} rounded-full bg-zinc-600 flex items-center justify-center text-white font-bold ${textSize} overflow-hidden shrink-0`}>
      {src ? <img src={src} alt={username} className="w-full h-full object-cover" /> : username?.[0]?.toUpperCase()}
    </div>
  );

  const formatDate = str => str ? new Date(str).toLocaleDateString('en-SE', { year: 'numeric', month: 'long' }) : '';

  // ── View another user ──────────────────────────────────────────────────────
  if (isViewing) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {!profile ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin"/></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Profile info */}
              <div className="flex flex-col gap-4">
                <div className={`${card} p-6 flex flex-col items-center text-center`}>
                  <AvatarDisplay src={profile.avatarBase64} username={profile.username} size="w-28 h-28" textSize="text-5xl" />
                  <h2 className="text-xl font-bold mt-4 mb-1">{profile.username}</h2>
                  {profile.role && ROLE_BADGE[profile.role] && (
                    <span className={`text-xs px-2.5 py-1 rounded-full mb-2 ${ROLE_BADGE[profile.role].cls}`}>{ROLE_BADGE[profile.role].label}</span>
                  )}
                  <p className={`text-sm text-zinc-400`}>Member since {formatDate(profile.createdAt)}</p>
                  {profile.bio && <p className={`text-sm mt-3 leading-relaxed text-zinc-300`}>{profile.bio}</p>}
                  <div className="flex flex-wrap gap-2 mt-3 justify-center">
                    {profile.steamId && (
                      <a href={`https://steamcommunity.com/profiles/${profile.steamId}`} target="_blank" rel="noopener noreferrer"
                        className={`text-xs px-2 py-0.5 rounded-full hover:opacity-80 transition ${profile.steamVerified ? 'text-green-400 bg-green-900/30' : 'text-orange-400 bg-orange-900/30'}`}>
                        {profile.steamVerified ? '✓ Steam verified ↗' : 'Steam linked ↗'}
                      </a>
                    )}
                    {profile.publicInventory && <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">Public CS inv.</span>}
                    {profile.publicHoldings && <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">Public portfolio</span>}
                  </div>
                </div>
              </div>

              {/* Right: Public content */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {/* CS Inventory */}
                <div className={`${card} p-5`}>
                  <h3 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>CS Inventory</h3>
                  {!profile.publicInventory ? (
                    <p className={`text-sm text-zinc-400`}>🔒 Private</p>
                  ) : loadingInventory ? (
                    <div className="flex items-center gap-2 py-2"><div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/><span className={`text-sm text-zinc-400`}>Loading...</span></div>
                  ) : inventoryError ? (
                    <p className="text-sm text-red-400">{inventoryError}</p>
                  ) : viewingInventory ? (
                    <>
                      <div className="flex gap-6 mb-4">
                        <div><p className={`text-xs mb-0.5 text-zinc-400`}>Items</p><p className="font-bold text-lg">{viewingInventory.count}</p></div>
                        <div><p className={`text-xs mb-0.5 text-zinc-400`}>Est. Value</p><p className="font-bold text-lg text-green-400">{viewingInventory.totalValue.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr</p></div>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-72 overflow-y-auto">
                        {viewingInventory.items.slice(0, 24).map((item, i) => (
                          <div key={i} className={`bg-zinc-700 rounded-lg p-2 text-center`}>
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
                  <h3 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Portfolio</h3>
                  {!profile.publicHoldings ? (
                    <p className={`text-sm text-zinc-400`}>🔒 Private</p>
                  ) : loadingHoldings ? (
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                  ) : viewingHoldings?.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {viewingHoldings.map(h => (
                        <div key={h.ticker} className={`bg-zinc-700 rounded-lg px-3 py-1.5`}>
                          <span className="text-sm font-bold">{h.ticker}</span>
                          <span className={`ml-1.5 text-xs text-zinc-400`}>{h.quantity} shares</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className={`text-sm text-zinc-400`}>No holdings.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Own profile ────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left col: Avatar + identity */}
          <div className="flex flex-col gap-4">
            <div className={`${card} p-6 flex flex-col items-center text-center`}>
              {/* Avatar with upload button */}
              <div className="relative mb-4">
                <AvatarDisplay src={editForm.avatarBase64} username={authUsername} size="w-28 h-28" textSize="text-5xl" />
                <label className="absolute bottom-1 right-1 w-8 h-8 bg-zinc-600 hover:bg-zinc-500 rounded-full flex items-center justify-center cursor-pointer transition shadow-lg" title="Upload photo">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleAvatarUpload(e.target.files[0])} />
                </label>
                {avatarUploading && <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/></div>}
              </div>
              <h2 className="text-xl font-bold">{authUsername}</h2>
              {profile?.role && ROLE_BADGE[profile.role] && (
                <span className={`text-xs px-2.5 py-1 rounded-full mt-1 mb-1 ${ROLE_BADGE[profile.role].cls}`}>{ROLE_BADGE[profile.role].label}</span>
              )}
              <p className={`text-sm mt-1 text-zinc-400`}>Member since {formatDate(profile?.createdAt)}</p>
              {editForm.avatarBase64 && (
                <button onClick={() => setEditForm(f => ({ ...f, avatarBase64: null }))} className={`text-xs mt-2 text-zinc-400 hover:text-red-400 transition`}>Remove photo</button>
              )}
            </div>

            {/* Privacy settings */}
            <div className={`${card} p-5`}>
              <h3 className={`${labelCls} mb-3`}>Privacy</h3>
              <div className="flex flex-col gap-3">
                {[
                  { key: 'publicInventory', title: 'Public CS Inventory', desc: 'Show Steam CS inventory on profile' },
                  { key: 'publicHoldings', title: 'Public Portfolio', desc: 'Show stock holdings on profile' },
                ].map(({ key, title, desc }) => (
                  <div key={key} className={`flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-700/50`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{title}</p>
                      <p className={`text-xs mt-0.5 text-zinc-400`}>{desc}</p>
                    </div>
                    <Toggle value={editForm[key]} onChange={v => setEditForm(f => ({ ...f, [key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right col: Edit form + preview */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Edit form */}
            <div className={`${card} p-6`}>
              <h3 className="font-bold text-base mb-4">Edit Profile</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Bio</label>
                  <textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={3} maxLength={200} placeholder="Tell the community about yourself..." className={`${inputCls} resize-none`} />
                  <p className={`text-xs mt-1 text-zinc-400`}>{editForm.bio.length}/200</p>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Steam Account</label>
                  {steamVerified && editForm.steamId ? (
                    <div className={`flex items-center gap-3 p-3 rounded-xl bg-green-900/20 border border-green-800/40`}>
                      <img src="https://store.steampowered.com/favicon.ico" alt="Steam" className="w-5 h-5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-400">✓ Steam linked & verified</p>
                        <a href={`https://steamcommunity.com/profiles/${editForm.steamId}`} target="_blank" rel="noopener noreferrer" className={`text-xs hover:underline text-zinc-400`}>{editForm.steamId} ↗</a>
                      </div>
                      <button onClick={unlinkSteam} className={`text-xs px-2 py-1 rounded-lg transition bg-zinc-700 hover:bg-zinc-600 text-zinc-300`}>Unlink</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button onClick={handleSteamLogin} disabled={steamLookupLoading} className="self-start hover:opacity-90 transition disabled:opacity-50">
                        <img src="https://community.cloudflare.steamstatic.com/public/images/signinthroughsteam/sits_01.png" alt="Sign in through Steam" className="h-10" />
                      </button>
                      <p className={`text-xs text-zinc-400`}>You'll be redirected to Steam to verify your account.</p>
                      {steamLookupError && <p className="text-xs text-red-400">{steamLookupError}</p>}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={saveProfile} disabled={saving} className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
                {saveMsg && <span className={`text-sm ${saveMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{saveMsg}</span>}
              </div>
            </div>

            {/* Live preview */}
            <div className={`${card} p-5`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-4 text-zinc-400`}>How others see you</p>
              <div className="flex items-start gap-5">
                <AvatarDisplay src={editForm.avatarBase64} username={authUsername} size="w-16 h-16" textSize="text-2xl" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className="font-bold text-lg">{authUsername}</span>
                    {profile?.role && ROLE_BADGE[profile.role] && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_BADGE[profile.role].cls}`}>{ROLE_BADGE[profile.role].label}</span>
                    )}
                  </div>
                  <p className={`text-xs mb-2 text-zinc-400`}>Joined {formatDate(profile?.createdAt)}</p>
                  {editForm.bio ? (
                    <p className={`text-sm leading-relaxed mb-3 text-zinc-300`}>{editForm.bio}</p>
                  ) : (
                    <p className={`text-sm italic mb-3 text-zinc-400`}>No bio yet</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {editForm.steamId && <span className={`text-xs px-2 py-0.5 rounded-full ${steamVerified ? 'text-green-400 bg-green-900/30' : 'text-orange-400 bg-orange-900/30'}`}>{steamVerified ? '✓ Steam verified' : 'Steam (unverified)'}</span>}
                    {editForm.publicInventory && <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">Public CS inv.</span>}
                    {editForm.publicHoldings && <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">Public portfolio</span>}
                    {!editForm.steamId && !editForm.publicInventory && !editForm.publicHoldings && (
                      <span className={`text-xs text-zinc-400`}>No badges yet</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}