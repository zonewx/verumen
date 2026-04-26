import { useState, useEffect } from 'react';

export default function ProfilePage({ isDark, authUsername, onBack }) {
  const [tab, setTab] = useState('my-profile');
  const [profile, setProfile] = useState(null);
  const [editForm, setEditForm] = useState({ bio: '', steamId: '', publicInventory: false });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingUser, setViewingUser] = useState(null);
  const [viewingInventory, setViewingInventory] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');

  const h = { 'Content-Type': 'application/json', 'X-User': authUsername };
  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;
  const input = `w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const label = `text-xs font-semibold uppercase tracking-wider block mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`;
  const btnPrimary = `px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50`;
  const btnGhost = `px-4 py-2 text-sm font-semibold rounded-lg transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;

  useEffect(() => { fetchProfile(); fetchUsers(); }, []);

  async function fetchProfile() {
    const res = await fetch(`/api/users/${authUsername}/profile`, { headers: h });
    const data = await res.json();
    setProfile(data);
    setEditForm({ bio: data.bio || '', steamId: data.steamId || '', publicInventory: data.publicInventory || false });
  }

  async function fetchUsers() {
    const res = await fetch('/api/users', { headers: h });
    setUsers(await res.json());
  }

  async function saveProfile() {
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(`/api/users/${authUsername}/profile`, {
        method: 'PUT', headers: h, body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (data.success) { setProfile(data.profile); setSaveMsg('✓ Profile saved'); fetchUsers(); }
      else setSaveMsg('Failed to save');
    } catch(e) { setSaveMsg('Error: ' + e.message); }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
  }

  async function viewUserInventory(user) {
    setViewingUser(user);
    setViewingInventory(null);
    setInventoryError('');
    if (!user.publicInventory) return;
    setInventoryLoading(true);
    try {
      const res = await fetch(`/api/users/${user.username}/inventory`, { headers: h });
      const data = await res.json();
      if (!res.ok) setInventoryError(data.error || 'Failed to load inventory');
      else setViewingInventory(data);
    } catch(e) { setInventoryError(e.message); }
    setInventoryLoading(false);
  }

  const filtered = users.filter(u =>
    u.username !== authUsername &&
    (searchQuery === '' || u.username.toLowerCase().includes(searchQuery.toLowerCase()) || (u.bio || '').toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const Avatar = ({ username, size = 10 }) => (
    <div className={`w-${size} h-${size} rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0`}>
      {username[0].toUpperCase()}
    </div>
  );

  const formatDate = (str) => str ? new Date(str).toLocaleDateString('en-SE', { year: 'numeric', month: 'long' }) : '';

  return (
    <div className={`flex flex-col h-screen ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {/* Header */}
      <div className={`flex items-center gap-4 px-8 py-4 border-b ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} shrink-0`}>
        <button onClick={onBack} className={`p-1.5 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>
        <h1 className="text-lg font-bold">Profile & Community</h1>
        <div className="flex gap-0 ml-4">
          {[['my-profile','My Profile'],['community','Community']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-semibold transition border-b-2 ${tab === id ? 'border-blue-500 text-blue-400' : `border-transparent ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">

          {/* MY PROFILE */}
          {tab === 'my-profile' && (
            <div className="flex flex-col gap-6">
              {/* Profile header */}
              <div className={`${card} p-6`}>
                <div className="flex items-center gap-5 mb-6">
                  <div className="w-20 h-20 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl">
                    {authUsername[0].toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{authUsername}</h2>
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Member since {formatDate(profile?.createdAt)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${editForm.publicInventory ? 'bg-green-900/40 text-green-400' : `${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}`}>
                        {editForm.publicInventory ? '🔓 Public inventory' : '🔒 Private inventory'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className={label}>Bio</label>
                    <textarea
                      value={editForm.bio}
                      onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))}
                      rows={3}
                      maxLength={200}
                      placeholder="Tell the community about yourself..."
                      className={`${input} resize-none`}
                    />
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{editForm.bio.length}/200</p>
                  </div>

                  <div>
                    <label className={label}>Steam ID</label>
                    <input
                      value={editForm.steamId}
                      onChange={e => setEditForm(f => ({ ...f, steamId: e.target.value }))}
                      placeholder="76561198xxxxxxxxx"
                      className={input}
                    />
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Find your Steam ID at steamcommunity.com → your profile URL</p>
                  </div>

                  <div className={`flex items-center justify-between p-4 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <div>
                      <p className="text-sm font-semibold">Public CS Inventory</p>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Let other Statera users see your Steam inventory showcase</p>
                    </div>
                    <button
                      onClick={() => setEditForm(f => ({ ...f, publicInventory: !f.publicInventory }))}
                      className={`relative w-12 h-6 rounded-full transition-colors ${editForm.publicInventory ? 'bg-blue-600' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editForm.publicInventory ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button onClick={saveProfile} disabled={saving} className={btnPrimary}>
                      {saving ? 'Saving...' : 'Save Profile'}
                    </button>
                    {saveMsg && <span className={`text-sm ${saveMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{saveMsg}</span>}
                  </div>
                </div>
              </div>

              {/* Preview */}
              {profile && (
                <div className={`${card} p-5`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Profile preview — how others see you</p>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                      {authUsername[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold">{authUsername}</span>
                        {editForm.steamId && <span className="text-xs text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded-full">Steam linked</span>}
                      </div>
                      {editForm.bio && <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{editForm.bio}</p>}
                      {!editForm.bio && <p className={`text-sm italic ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No bio yet</p>}
                      <p className={`text-xs mt-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Joined {formatDate(profile.createdAt)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* COMMUNITY */}
          {tab === 'community' && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-xl font-bold mb-1">Community</h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{users.length} user{users.length !== 1 ? 's' : ''} on Statera</p>
              </div>

              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className={input}
              />

              {/* Viewing user profile modal */}
              {viewingUser && (
                <div className={`${card} p-5`}>
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-14 h-14 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shrink-0">
                      {viewingUser.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold">{viewingUser.username}</h3>
                        {viewingUser.steamId && <span className="text-xs text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded-full">Steam linked</span>}
                        {viewingUser.publicInventory && <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">Public inventory</span>}
                      </div>
                      {viewingUser.bio ? <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{viewingUser.bio}</p> : <p className={`text-sm italic ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No bio</p>}
                      <p className={`text-xs mt-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Joined {formatDate(viewingUser.createdAt)}</p>
                    </div>
                    <button onClick={() => { setViewingUser(null); setViewingInventory(null); }} className={`shrink-0 p-1.5 rounded-lg ${isDark ? 'text-gray-500 hover:text-white hover:bg-gray-700' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition`}>✕</button>
                  </div>

                  {/* Inventory showcase */}
                  {viewingUser.publicInventory ? (
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>CS Inventory Showcase</p>
                      {inventoryLoading && (
                        <div className="flex items-center gap-2 py-4">
                          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading inventory...</span>
                        </div>
                      )}
                      {inventoryError && <p className="text-sm text-red-400">{inventoryError}</p>}
                      {viewingInventory && (
                        <>
                          <div className="flex gap-4 mb-4">
                            <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-0.5`}>Items</p><p className="font-bold">{viewingInventory.count}</p></div>
                            <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-0.5`}>Est. Value</p><p className="font-bold text-green-400">{viewingInventory.totalValue.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr</p></div>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                            {viewingInventory.items.slice(0, 20).map((item, i) => (
                              <div key={i} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-2 text-center`}>
                                {item.iconUrl && <img src={item.iconUrl} alt={item.name} className="w-full h-14 object-contain mb-1" />}
                                <p className="text-xs font-medium truncate" title={item.name}>{item.name}</p>
                                {item.priceSEK > 0 && <p className="text-xs text-green-400 font-bold">{item.priceSEK.toLocaleString('sv-SE', { minimumFractionDigits: 0 })} kr</p>}
                              </div>
                            ))}
                          </div>
                          {viewingInventory.items.length > 20 && <p className={`text-xs mt-2 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>+{viewingInventory.items.length - 20} more items</p>}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={`rounded-lg p-4 text-center ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>🔒 This user's inventory is private</p>
                    </div>
                  )}
                </div>
              )}

              {/* User list */}
              <div className="flex flex-col gap-3">
                {filtered.length === 0 && (
                  <div className={`${card} p-8 text-center`}>
                    <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {searchQuery ? 'No users match your search.' : 'No other users yet.'}
                    </p>
                  </div>
                )}
                {filtered.map(user => (
                  <div key={user.username} className={`${card} p-4 flex items-center gap-4 cursor-pointer hover:border-blue-500/50 transition`} onClick={() => viewUserInventory(user)}>
                    <div className="w-11 h-11 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                      {user.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold">{user.username}</span>
                        {user.steamId && <span className="text-xs text-orange-400 bg-orange-900/30 px-1.5 py-0.5 rounded-full">Steam</span>}
                        {user.publicInventory && <span className="text-xs text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded-full">Public inv.</span>}
                      </div>
                      {user.bio ? <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{user.bio}</p> : <p className={`text-xs italic ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No bio</p>}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isDark ? 'text-gray-600' : 'text-gray-300'}><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
