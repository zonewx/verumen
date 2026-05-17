import { useState, useEffect, useCallback } from 'react';
import apiCache from './apiCache';

function SteamScreenshotPreview({ url, isDark }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    const match = url.match(/id=(\d+)/);
    if (!match) return;
    setLoading(true);
    fetch(`/api/cs/steam/screenshot/${match[1]}`)
      .then(r => r.json())
      .then(d => { if (d.previewUrl) setPreview(d.previewUrl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [url]);

  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-2 rounded-xl overflow-hidden group">
      {loading && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-orange-400">Loading preview...</span>
        </div>
      )}
      {!loading && preview && (
        <div className="relative">
          <img src={preview} alt="Steam screenshot" className="w-full rounded-xl object-cover max-h-72" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-xl flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition text-white text-xs font-semibold bg-black/60 px-3 py-1.5 rounded-full">View on Steam ↗</span>
          </div>
        </div>
      )}
      {!loading && !preview && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
          <span className="text-xl">📷</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Steam Screenshot</p>
            <p className="text-xs text-orange-400 truncate">{url}</p>
          </div>
          <span className="text-xs text-orange-400 shrink-0">View ↗</span>
        </div>
      )}
    </a>
  );
}

const ROLE_BADGE = {
  admin: { label: 'admin', cls: 'bg-red-900/40 text-red-400 border border-red-800' },
  moderator: { label: 'mod', cls: 'bg-blue-900/40 text-blue-400 border border-blue-800' },
};

function Avatar({ src, username, size = 'w-9 h-9', text = 'text-sm' }) {
  return (
    <div className={`${size} rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold ${text} overflow-hidden shrink-0`}>
      {src ? <img src={src} alt={username} className="w-full h-full object-cover" /> : username?.[0]?.toUpperCase()}
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ActivityCard({ item, isDark, onDelete, isOwn }) {
  const [expanded, setExpanded] = useState(false);
  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-4`;

  const badge = ROLE_BADGE[item.role];

  const Header = () => (
    <div className="flex items-start gap-3 mb-3">
      <Avatar src={item.avatarBase64} username={item.username} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{item.username}</span>
          {badge && <span className={`text-xs px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
        </div>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{timeAgo(item.createdAt)}</p>
      </div>
      {isOwn && (
        <button onClick={() => onDelete(item.id)} className={`text-xs ${isDark ? 'text-gray-600 hover:text-red-400' : 'text-gray-300 hover:text-red-400'} transition shrink-0`}>✕</button>
      )}
    </div>
  );

  if (item.type === 'cs_trade') {
    const isBuy = item.action === 'buy';
    return (
      <div className={card}>
        <Header />
        <div className={`flex items-center gap-3 p-3 rounded-lg ${isBuy ? 'bg-green-900/20 border border-green-800/40' : 'bg-red-900/20 border border-red-800/40'}`}>
          <span className={`text-lg font-bold ${isBuy ? 'text-green-400' : 'text-red-400'}`}>{isBuy ? '↓' : '↑'}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{item.skinName}</p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {isBuy ? `Bought for ${item.price} ${item.currency}` : `Sold for ${item.sellPrice} ${item.currency} (bought ${item.buyPrice} ${item.currency})`}
              {item.exterior && <span className="ml-1 opacity-70">· {item.exterior}</span>}
            </p>
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${isBuy ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
            {isBuy ? 'Bought' : 'Sold'}
          </span>
        </div>
      </div>
    );
  }

  if (item.type === 'cs_trade_screenshot') {
    return (
      <div className={card}>
        <Header />
        <p className="text-sm font-semibold mb-2">{item.skinName}</p>
        <SteamScreenshotPreview url={item.screenshotUrl} isDark={isDark} />
      </div>
    );
  }

  if (item.type === 'holdings_update') {
    return (
      <div className={card}>
        <Header />
        <div className={`flex items-center gap-3 p-3 rounded-lg ${isDark ? 'bg-blue-900/20 border border-blue-800/40' : 'bg-blue-50 border border-blue-200'}`}>
          <span className="text-xl">📊</span>
          <div>
            <p className="font-semibold text-sm">Portfolio updated</p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {item.holdingCount} holding{item.holdingCount !== 1 ? 's' : ''}
              {item.tickers?.length > 0 && <span className="ml-1 opacity-70">· {item.tickers.join(', ')}{item.holdingCount > 5 ? '...' : ''}</span>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'skin_screenshot') {
    return (
      <div className={card}>
        <Header />
        <p className="text-sm font-semibold mb-2">{item.skinName}</p>
        {item.caption && <p className={`text-sm mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{item.caption}</p>}
        {item.imageBase64 && (
          <div className="rounded-xl overflow-hidden cursor-pointer" onClick={() => setExpanded(!expanded)}>
            <img src={item.imageBase64} alt={item.skinName} className={`w-full object-cover transition-all ${expanded ? 'max-h-none' : 'max-h-64'}`} />
          </div>
        )}
        {!expanded && item.imageBase64 && <button onClick={() => setExpanded(true)} className={`text-xs mt-1 ${isDark ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-gray-900'} transition`}>View full</button>}
      </div>
    );
  }

  if (item.type === 'friend_added') {
    return (
      <div className={card}>
        <Header />
        <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
          Became friends with <span className="font-semibold">{item.targetUser}</span> 🤝
        </p>
      </div>
    );
  }

  return null;
}

export default function SocialFeed({ isDark, authUsername, onViewProfile }) {
  const [tab, setTab] = useState('feed');
  const [feed, setFeed] = useState(() => apiCache.get('/api/feed') || []);
  const [friends, setFriends] = useState(() => apiCache.get('/api/friends') || { friends: [], incoming: [], outgoing: [] });
  const [feedLoading, setFeedLoading] = useState(!apiCache.has('/api/feed'));
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [actionMsg, setActionMsg] = useState('');
  const [announcements, setAnnouncements] = useState(() => apiCache.get('/api/announcements') || []);
  // Screenshot upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ skinName: '', caption: '', imageBase64: null });
  const [uploading, setUploading] = useState(false);

  const h = { 'Content-Type': 'application/json', ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };
  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const btnPrimary = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50';
  const btnGhost = `px-3 py-1.5 text-sm font-semibold rounded-lg transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;

  const flash = (msg, ms = 3000) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), ms); };

  const fetchFeed = useCallback(async () => {
    if (!apiCache.has('/api/feed')) setFeedLoading(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/feed', { headers });
      if (res.status === 401) { window.dispatchEvent(new Event('session-expired')); setFeedLoading(false); return; }
      if (!res.ok) { setFeedLoading(false); return; }
      const data = await res.json();
      if (Array.isArray(data)) { apiCache.set('/api/feed', data); setFeed(data); }
    } catch(e) { console.error('Feed fetch error:', e); }
    setFeedLoading(false);
  }, [authUsername]);

  const fetchFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const data = await fetch('/api/friends', { headers: h }).then(r => r.json());
      apiCache.set('/api/friends', data);
      setFriends(data);
    } catch(e) {}
    setFriendsLoading(false);
  }, [authUsername]);

  useEffect(() => {
    fetchFeed();
    fetchFriends();
    fetch('/api/announcements').then(r => r.json()).then(data => {
      if (Array.isArray(data)) { apiCache.set('/api/announcements', data); setAnnouncements(data); }
    }).catch(() => {});
  }, []);

  const searchUsers = async (q) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const users = await fetch('/api/users', { headers: h }).then(r => r.json());
      setSearchResults(users.filter(u =>
        u.username !== authUsername &&
        u.username.toLowerCase().includes(q.toLowerCase())
      ));
    } catch(e) {}
  };

  const sendRequest = async (username) => {
    const res = await fetch(`/api/friends/request/${username}`, { method: 'POST', headers: h });
    const data = await res.json();
    if (data.success) { flash(data.status === 'accepted' ? `✓ Now friends with ${username}!` : `✓ Request sent to ${username}`); fetchFriends(); }
    else flash('Error: ' + data.error);
  };

  const acceptRequest = async (username) => {
    await fetch(`/api/friends/accept/${username}`, { method: 'POST', headers: h });
    flash(`✓ Now friends with ${username}!`); fetchFriends(); fetchFeed();
  };

  const declineRequest = async (username) => {
    await fetch(`/api/friends/decline/${username}`, { method: 'POST', headers: h });
    flash('Request declined.'); fetchFriends();
  };

  const removeFriend = async (username) => {
    if (!confirm(`Remove ${username} from friends?`)) return;
    await fetch(`/api/friends/remove/${username}`, { method: 'POST', headers: h });
    flash(`Removed ${username}.`); fetchFriends(); fetchFeed();
  };

  const deleteActivity = async (id) => {
    // Optimistic update — remove immediately
    setFeed(f => f.filter(item => String(item.id) !== String(id)));
    try {
      const authHeader = sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {};
      await fetch(`/api/activity/${id}`, { method: 'DELETE', headers: authHeader });
    } catch(e) {
      console.error('Delete error:', e);
    }
  };

  const handleImageUpload = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1200;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setUploadForm(f => ({ ...f, imageBase64: canvas.toDataURL('image/jpeg', 0.85) }));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const postScreenshot = async () => {
    if (!uploadForm.skinName.trim()) { flash('Enter a skin name first'); return; }
    setUploading(true);
    try {
      const res = await fetch('/api/activity/screenshot', { method: 'POST', headers: h, body: JSON.stringify(uploadForm) });
      const data = await res.json();
      if (data.success) { setShowUpload(false); setUploadForm({ skinName: '', caption: '', imageBase64: null }); flash('✓ Posted!'); fetchFeed(); }
      else flash('Error: ' + data.error);
    } catch(e) { flash('Failed to post'); }
    setUploading(false);
  };

  const ROLE_BADGE = {
    admin: { cls: 'bg-red-900/40 text-red-400 border border-red-800' },
    moderator: { cls: 'bg-blue-900/40 text-blue-400 border border-blue-800' },
  };

  const FriendRow = ({ user, actions }) => (
    <div className={`flex items-center gap-3 p-3 rounded-xl ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
      <button onClick={() => onViewProfile(user.username)} className="shrink-0">
        <Avatar src={user.avatarBase64} username={user.username} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <button onClick={() => onViewProfile(user.username)} className={`font-semibold text-sm hover:underline`}>{user.username}</button>
          {user.role && ROLE_BADGE[user.role] && <span className={`text-xs px-1.5 py-0.5 rounded-full ${ROLE_BADGE[user.role].cls}`}>{user.role}</span>}
        </div>
        {user.bio && <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{user.bio}</p>}
      </div>
      <div className="flex gap-2 shrink-0">{actions}</div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-10 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Social</h1>
          {actionMsg && <div className={`px-4 py-2 rounded-lg text-sm font-semibold border ${actionMsg.startsWith('✓') ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-blue-900/40 text-blue-400 border-blue-800'}`}>{actionMsg}</div>}
        </div>

        <div className="flex gap-6">
          {/* Left: Feed */}
          <div className="flex-1 min-w-0">

            {/* Announcements */}
            {announcements.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                {announcements.map(a => {
                  const styles = {
                    info:    'bg-blue-900/30 border-blue-800 text-blue-300',
                    warning: 'bg-yellow-900/30 border-yellow-800 text-yellow-300',
                    success: 'bg-green-900/30 border-green-800 text-green-300',
                    error:   'bg-red-900/30 border-red-800 text-red-300',
                  };
                  const icons = { info: 'ℹ️', warning: '⚠️', success: '✅', error: '🚨' };
                  return (
                    <div key={a.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${styles[a.type] || styles.info}`}>
                      <span className="shrink-0 mt-0.5">{icons[a.type] || 'ℹ️'}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold">{a.title}</span>
                        {a.message && <span className="ml-2 opacity-80">{a.message}</span>}
                      </div>
                      <span className="text-xs opacity-50 shrink-0">by {a.posted_by}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div className={`flex gap-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                {[['feed','Feed'],['mine','My Posts']].map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === id ? 'border-blue-500 text-blue-400' : `border-transparent ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}`}>{label}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowUpload(v => !v)} className={btnGhost}>Post</button>
                <button onClick={tab === 'feed' ? fetchFeed : fetchFeed} disabled={feedLoading} className={btnGhost}>
                  {feedLoading ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block"/> : '↺ Refresh'}
                </button>
              </div>
            </div>

            {/* Post form */}
            {showUpload && (
              <div className={`${card} mb-4 overflow-hidden`}>
                <div className={`px-5 py-3 border-b ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'} flex items-center justify-between`}>
                  <h3 className="font-semibold text-sm">New Post</h3>
                  <button onClick={() => { setShowUpload(false); setUploadForm({ skinName: '', caption: '', imageBase64: null }); }} className={`text-xs ${isDark ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-gray-900'} transition`}>✕</button>
                </div>
                <div className="p-5 flex flex-col gap-3">
                  <input
                    value={uploadForm.skinName}
                    onChange={e => setUploadForm(f => ({ ...f, skinName: e.target.value }))}
                    placeholder="Title"
                    className={inputCls}
                  />
                  <input
                    value={uploadForm.caption}
                    onChange={e => setUploadForm(f => ({ ...f, caption: e.target.value }))}
                    placeholder="Information"
                    className={inputCls}
                  />
                  <label className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed cursor-pointer transition ${isDark ? 'border-gray-700 hover:border-blue-500 hover:bg-blue-900/10 text-gray-500' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-400'}`}>
                    {uploadForm.imageBase64 ? (
                      <img src={uploadForm.imageBase64} className="max-h-48 rounded-lg object-contain" />
                    ) : (
                      <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span className="text-sm">Click to select image</span>
                        <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Optional</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e.target.files[0])} />
                  </label>
                  {uploadForm.imageBase64 && (
                    <button onClick={() => setUploadForm(f => ({ ...f, imageBase64: null }))} className={`text-xs ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'} transition text-left`}>
                      Remove image
                    </button>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={postScreenshot} disabled={uploading || !uploadForm.skinName.trim()} className={btnPrimary}>{uploading ? 'Posting...' : 'Post'}</button>
                    <button onClick={() => { setShowUpload(false); setUploadForm({ skinName: '', caption: '', imageBase64: null }); }} className={btnGhost}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Feed */}
            {feedLoading ? (
              <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
            ) : (
              <div className="flex flex-col gap-3">
                {(() => {
                  const items = tab === 'mine'
                    ? feed.filter(i => i.username === authUsername)
                    : feed;
                  if (items.length === 0) return (
                    <div className={`${card} p-10 text-center`}>
                      <p className="text-3xl mb-3">{tab === 'mine' ? '📝' : '👥'}</p>
                      <p className="font-semibold mb-1">{tab === 'mine' ? 'No activity yet' : 'Your feed is empty'}</p>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{tab === 'mine' ? 'Your CS trades, portfolio updates and screenshots will appear here.' : 'Add friends to see their activity here.'}</p>
                    </div>
                  );
                  return items.map(item => (
                    <ActivityCard key={item.id} item={item} isDark={isDark} onDelete={deleteActivity} isOwn={item.username === authUsername} />
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Right: Friends sidebar */}
          <div className="w-72 shrink-0">
            <div className={`${card} p-4 sticky top-0`}>
              <button 
                onClick={() => window.location.href = '/friends'}
                className="w-full text-left mb-3 hover:opacity-80 transition"
              >
                <h3 className="font-bold text-sm">
                  Friends {friends.friends?.length > 0 && <span className={`ml-1 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>({friends.friends.length})</span>}
                </h3>
              </button>

              {/* Search to add */}
              <div className="relative mb-4">
                <input value={searchQuery} onChange={e => searchUsers(e.target.value)} placeholder="Find users..." className={`${inputCls} pr-3`} />
                {searchResults.length > 0 && (
                  <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl overflow-hidden z-20 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    {searchResults.map(u => {
                      const isFriend = friends.friends?.some(f => f.username === u.username);
                      const isPending = friends.outgoing?.includes(u.username);
                      return (
                        <div key={u.username} className={`flex items-center gap-3 px-3 py-2.5 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} last:border-0`}>
                          <button onClick={() => { onViewProfile(u.username); setSearchQuery(''); setSearchResults([]); }} className="shrink-0">
                            <Avatar src={u.avatarBase64} username={u.username} size="w-7 h-7" text="text-xs" />
                          </button>
                          <span className="flex-1 text-sm font-semibold truncate">{u.username}</span>
                          {isFriend ? <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Friends</span>
                            : isPending ? <span className="text-xs text-blue-400">Sent</span>
                            : <button onClick={() => { sendRequest(u.username); setSearchQuery(''); setSearchResults([]); }} className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition">Add</button>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Incoming requests */}
              {friends.incoming?.length > 0 && (
                <div className="mb-4">
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Requests ({friends.incoming.length})</p>
                  <div className="flex flex-col gap-2">
                    {friends.incoming.map(u => (
                      <FriendRow key={u.username} user={u} actions={<>
                        <button onClick={() => acceptRequest(u.username)} className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg transition">Accept</button>
                        <button onClick={() => declineRequest(u.username)} className={`text-xs px-2 py-1 ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg transition`}>✕</button>
                      </>} />
                    ))}
                  </div>
                </div>
              )}

              {/* Outgoing */}
              {friends.outgoing?.length > 0 && (
                <div className="mb-4">
                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Sent</p>
                  <div className="flex flex-col gap-2">
                    {friends.outgoing.map(u => (
                      <div key={u} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                        <span className="text-sm font-semibold flex-1">{u}</span>
                        <span className="text-xs text-blue-400">Pending</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friends list */}
              {friends.friends?.length === 0 && friends.incoming?.length === 0 ? (
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} text-center py-4`}>Search for users above to add friends.</p>
              ) : (
                <div>
                  {friends.friends?.length > 0 && (
                    <>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Friends</p>
                      <div className="flex flex-col gap-2">
                        {friends.friends.map(u => (
                          <FriendRow key={u.username} user={u} actions={
                            <button onClick={() => onViewProfile(u.username)} className={`text-xs ${isDark ? 'text-gray-500 hover:text-white' : 'text-gray-400 hover:text-gray-900'} transition`}>View →</button>
                          } />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}