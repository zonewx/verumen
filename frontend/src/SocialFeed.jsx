import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiCache from './apiCache';
import { getToken } from './tokenStore';
import { flash } from './flash';

const skinIconCache = {};

function skinNameColor(name) {
  if (!name) return 'text-zinc-100';
  if (name.includes('★')) return 'text-violet-300';
  if (name.includes('StatTrak')) return 'text-orange-400';
  return 'text-zinc-100';
}

function useSkinIcon(iconUrl, skinName, exterior) {
  const [resolved, setResolved] = useState(iconUrl || null);
  const fetched = useRef(false);
  useEffect(() => {
    if (iconUrl) { setResolved(iconUrl); return; }
    if (!skinName || fetched.current) return;
    const cacheKey = `${skinName}|${exterior || ''}`;
    if (skinIconCache[cacheKey] !== undefined) { setResolved(skinIconCache[cacheKey]); return; }
    fetched.current = true;
    const token = getToken();
    if (!token) return;
    fetch(`/api/cs/skin-icon?name=${encodeURIComponent(skinName)}&exterior=${encodeURIComponent(exterior || '')}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { skinIconCache[cacheKey] = d.iconUrl || null; setResolved(d.iconUrl || null); })
      .catch(() => { skinIconCache[cacheKey] = null; });
  }, [iconUrl, skinName, exterior]);
  return resolved;
}

function SteamScreenshotPreview({ url, imgUrl }) {
  const [preview, setPreview] = useState(imgUrl || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (imgUrl) { setPreview(imgUrl); return; }
    if (!url) return;
    const match = url.match(/id=(\d+)/);
    if (!match) return;
    setLoading(true);
    const token = getToken();
    fetch(`/api/cs/steam/screenshot/${match[1]}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(r => r.json())
      .then(d => { if (d.previewUrl) setPreview(d.previewUrl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [url, imgUrl]);

  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-3 rounded-xl overflow-hidden group">
      {loading && (
        <div className="flex items-center gap-2 p-3 rounded-xl border bg-zinc-700/40 border-zinc-700">
          <div className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-500">Loading preview…</span>
        </div>
      )}
      {!loading && preview && (
        <div className="relative">
          <img src={preview} alt="Steam screenshot" className="w-full rounded-xl object-contain" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition rounded-xl flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition text-white text-xs font-semibold bg-black/70 px-3 py-1.5 rounded-full">View on Steam ↗</span>
          </div>
        </div>
      )}
      {!loading && !preview && (
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-zinc-700/30 border-zinc-700 hover:bg-zinc-700/60 transition">
          <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-zinc-300">Steam Screenshot</p>
            <p className="text-xs text-zinc-500 truncate">{url}</p>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">View ↗</span>
        </div>
      )}
    </a>
  );
}

const ROLE_BADGE = {
  admin: { label: 'Admin', cls: 'bg-red-900/40 text-red-400 border border-red-800' },
  moderator: { label: 'Mod', cls: 'bg-blue-900/40 text-blue-400 border border-blue-800' },
};

function Avatar({ src, username, size = 'w-8 h-8', text = 'text-xs' }) {
  return (
    <div className={`${size} rounded-full bg-zinc-700 flex items-center justify-center text-white font-bold ${text} overflow-hidden shrink-0`}>
      {src ? <img src={src} alt={username} className="w-full h-full object-cover" /> : username?.[0]?.toUpperCase()}
    </div>
  );
}

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const diff = (Date.now() - date) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const year = date.getFullYear() !== new Date().getFullYear() ? ' ' + date.getFullYear() : '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + year;
}

function PostHeader({ item, onDelete, isOwn }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <a href={`/user/${item.username}`} onClick={e => { e.preventDefault(); navigate(`/user/${item.username}`); }}>
        <Avatar src={item.avatarBase64} username={item.username} />
      </a>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <a href={`/user/${item.username}`} onClick={e => { e.preventDefault(); navigate(`/user/${item.username}`); }} className="font-semibold text-sm text-zinc-100 hover:underline">{item.username}</a>
          {item.isUpdate && <span className="text-xs text-zinc-100">updated a holding</span>}
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{timeAgo(item.createdAt)}</p>
      </div>
      {isOwn && (
        confirming ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-zinc-400">Delete?</span>
            <button onClick={onDelete} className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40 transition">Yes</button>
            <button onClick={() => setConfirming(false)} className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-zinc-600 hover:text-red-400 transition p-1 rounded-lg hover:bg-red-400/10">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )
      )}
    </div>
  );
}

function TradeCard({ item, onDelete, isOwn }) {
  const isBuy = item.action === 'buy';
  const skinIcon = useSkinIcon(item.iconUrl, item.skinName, item.exterior);

  return (
    <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-2xl p-4 hover:border-zinc-600/80 transition-colors">
      <PostHeader item={item} onDelete={() => onDelete(item.id)} isOwn={isOwn} />
      <div className={`pl-3 border-l-2 ${isBuy ? 'border-emerald-500/70' : 'border-red-500/70'}`}>
        <div className="flex items-center gap-3">
          {skinIcon && (
            <div className="w-14 h-14 shrink-0 flex items-center justify-center">
              <img src={skinIcon} alt={item.skinName} className="w-full h-full object-contain drop-shadow-md" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm truncate ${skinNameColor(item.skinName)}`}>{item.skinName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <p className="text-xs text-zinc-500">
                {isBuy
                  ? `${item.price} USD`
                  : `Sold for ${item.sellPrice} USD · bought ${item.buyPrice} USD`}
                {item.floatValue != null && <span className="ml-1.5 text-zinc-600">· {parseFloat(item.floatValue).toFixed(4)}</span>}
              </p>
              {item.stickers?.map((s, i) => (
                <div key={i} className="relative group">
                  <img src={s.url} alt={s.name} className="w-5 h-5 object-contain opacity-80 hover:opacity-100 transition" />
                  {s.name && (
                    <div className="absolute bottom-full left-0 mb-1.5 px-2 py-1 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                      <p className="text-xs text-white">{s.name}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenshotCard({ item, onDelete, isOwn }) {
  const skinIcon = useSkinIcon(item.iconUrl, item.skinName, item.exterior);
  const isBuy = item.action !== 'sell';
  const borderCls = isBuy ? 'border-emerald-500/70' : 'border-red-500/70';

  return (
    <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-2xl p-4">
      <PostHeader item={item} onDelete={() => onDelete(item.id)} isOwn={isOwn} />
      <div className={`pl-3 border-l-2 ${borderCls} mb-3`}>
        <div className="flex items-center gap-3">
          {skinIcon && (
            <div className="w-14 h-14 shrink-0 flex items-center justify-center">
              <img src={skinIcon} alt={item.skinName} className="w-full h-full object-contain drop-shadow-md" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm truncate ${skinNameColor(item.skinName)}`}>{item.skinName}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <p className="text-xs text-zinc-500">
                {item.price != null ? `${item.price} USD` : ''}
                {item.floatValue != null && <span className="ml-1.5 text-zinc-600">· {parseFloat(item.floatValue).toFixed(4)}</span>}
              </p>
              {item.stickers?.map((s, i) => (
                <div key={i} className="relative group">
                  <img src={s.url} alt={s.name} className="w-5 h-5 object-contain opacity-80 hover:opacity-100 transition" />
                  {s.name && (
                    <div className="absolute bottom-full left-0 mb-1.5 px-2 py-1 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                      <p className="text-xs text-white">{s.name}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <SteamScreenshotPreview url={item.screenshotUrl} imgUrl={item.screenshotImgUrl} />
    </div>
  );
}

function ActivityCard({ item, onDelete, isOwn }) {
  if (item.type === 'cs_trade') {
    return <TradeCard item={item} onDelete={onDelete} isOwn={isOwn} />;
  }

  if (item.type === 'cs_trade_screenshot') {
    return <ScreenshotCard item={item} onDelete={onDelete} isOwn={isOwn} />;
  }

  if (item.type === 'skin_screenshot') {
    return (
      <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-2xl p-4">
        <PostHeader item={item} onDelete={() => onDelete(item.id)} isOwn={isOwn} />
        <p className={`text-sm font-semibold ${skinNameColor(item.skinName)}`}>{item.skinName}</p>
        {item.caption && <p className="text-sm text-zinc-400 mt-1">{item.caption}</p>}
        {item.imageBase64 && (
          <div className="rounded-xl overflow-hidden mt-3">
            <img src={item.imageBase64} alt={item.skinName} className="w-full object-contain" />
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'friend_added') {
    return (
      <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-2xl p-4 hover:border-zinc-600/80 transition-colors">
        <PostHeader item={item} onDelete={() => onDelete(item.id)} isOwn={isOwn} />
        <p className="text-sm text-zinc-400">
          Became friends with <span className="font-semibold text-zinc-200">{item.targetUser}</span>
        </p>
      </div>
    );
  }

  return null;
}

export default function SocialFeed({ authUsername, onViewProfile }) {
  const [tab, setTab] = useState('feed');
  const [feed, setFeed] = useState(() => apiCache.get('/api/feed') || []);
  const [friends, setFriends] = useState(() => apiCache.get('/api/friends') || { friends: [], incoming: [], outgoing: [] });
  const [feedLoading, setFeedLoading] = useState(!apiCache.has('/api/feed'));
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [announcements, setAnnouncements] = useState(() => apiCache.get('/api/announcements') || []);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ skinName: '', caption: '', imageBase64: null });
  const [uploading, setUploading] = useState(false);

  const h = { 'Content-Type': 'application/json', ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) };

  const fetchFeed = useCallback(async () => {
    if (!apiCache.has('/api/feed')) setFeedLoading(true);
    try {
      const token = getToken();
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

  // Heartbeat — updates online presence while this tab is open
  useEffect(() => {
    const beat = () => {
      const token = getToken();
      if (!token) return;
      fetch('/api/users/heartbeat', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    };
    beat();
    const id = setInterval(() => { if (document.visibilityState === 'visible') beat(); }, 60 * 1000);
    const onVisibility = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisibility); };
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
    setFeed(f => f.filter(item => String(item.id) !== String(id)));
    try {
      const authHeader = getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {};
      await fetch(`/api/activity/${id}`, { method: 'DELETE', headers: authHeader });
    } catch(e) { console.error('Delete error:', e); }
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

  const FriendRow = ({ user, actions }) => (
    <div className="flex items-center gap-2.5 py-2 group/row">
      <button onClick={() => onViewProfile(user.username)} className="shrink-0 opacity-90 group-hover/row:opacity-100 transition">
        <Avatar src={user.avatarBase64} username={user.username} />
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={() => onViewProfile(user.username)} className="font-medium text-sm text-zinc-200 hover:underline truncate text-left block w-full">
          {user.username}
        </button>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
    </div>
  );

  const announcementStyles = {
    info:    'bg-blue-950/50 border-blue-800/60 text-blue-300',
    warning: 'bg-amber-950/50 border-amber-800/60 text-amber-300',
    success: 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300',
    error:   'bg-red-950/50 border-red-800/60 text-red-300',
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 py-6 flex gap-6">

        {/* Left spacer mirrors friends panel width so feed centers in content area */}
        <div className="w-64 shrink-0 hidden xl:block" />

        {/* Feed column */}
        <div className="flex-1 min-w-0">

          {/* Announcements */}
          {announcements.length > 0 && (
            <div className="flex flex-col gap-2 mb-5">
              {announcements.map(a => (
                <div key={a.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${announcementStyles[a.type] || announcementStyles.info}`}>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold">{a.title}</span>
                    {a.message && <span className="ml-2 opacity-75">{a.message}</span>}
                  </div>
                  <span className="text-xs opacity-40 shrink-0">by {a.posted_by}</span>
                </div>
              ))}
            </div>
          )}

            {/* Tab bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-0 border-b border-zinc-700/60">
                {[['feed', 'Feed'], ['mine', 'My Posts']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
                      tab === id ? 'border-zinc-300 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowUpload(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Post
                </button>
                <button
                  onClick={fetchFeed}
                  disabled={feedLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition disabled:opacity-40"
                >
                  {feedLoading
                    ? <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                  }
                  Refresh
                </button>
              </div>
            </div>

            {/* Post form */}
            {showUpload && (
              <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-2xl mb-4 overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-700/60 flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-zinc-200">New Post</h3>
                  <button onClick={() => { setShowUpload(false); setUploadForm({ skinName: '', caption: '', imageBase64: null }); }} className="text-zinc-500 hover:text-zinc-300 transition">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div className="p-5 flex flex-col gap-3">
                  <input
                    value={uploadForm.skinName}
                    onChange={e => setUploadForm(f => ({ ...f, skinName: e.target.value }))}
                    placeholder="Skin name"
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-zinc-900/60 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 transition"
                  />
                  <input
                    value={uploadForm.caption}
                    onChange={e => setUploadForm(f => ({ ...f, caption: e.target.value }))}
                    placeholder="Caption (optional)"
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none bg-zinc-900/60 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 transition"
                  />
                  <label className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition border-zinc-700 hover:border-zinc-500 hover:bg-zinc-700/10 text-zinc-500">
                    {uploadForm.imageBase64 ? (
                      <img src={uploadForm.imageBase64} className="max-h-48 rounded-lg object-contain" />
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span className="text-sm">Click to select image</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e.target.files[0])} />
                  </label>
                  {uploadForm.imageBase64 && (
                    <button onClick={() => setUploadForm(f => ({ ...f, imageBase64: null }))} className="text-xs text-zinc-500 hover:text-red-400 transition text-left">
                      Remove image
                    </button>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={postScreenshot} disabled={uploading || !uploadForm.skinName.trim()} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white text-sm font-semibold rounded-xl transition disabled:opacity-40">
                      {uploading ? 'Posting…' : 'Post'}
                    </button>
                    <button onClick={() => { setShowUpload(false); setUploadForm({ skinName: '', caption: '', imageBase64: null }); }} className="px-3 py-2 text-sm font-semibold rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Feed items */}
            {feedLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
              </div>
            ) : (() => {
              const items = (tab === 'mine'
                ? feed.filter(i => i.username === authUsername)
                : feed).filter(i => i.type !== 'holdings_update');

              if (items.length === 0) return (
                <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-2xl p-12 text-center">
                  <p className="font-semibold text-zinc-300 mb-1">{tab === 'mine' ? 'No posts yet' : 'Your feed is empty'}</p>
                  <p className="text-sm text-zinc-500">{tab === 'mine' ? 'Your CS trades and screenshots will appear here.' : 'Add friends to see their activity here.'}</p>
                </div>
              );

              return (
                <div className="flex flex-col gap-3">
                  {items.map(item => (
                    <ActivityCard key={item.id} item={item} onDelete={deleteActivity} isOwn={item.username === authUsername} />
                  ))}
                </div>
              );
            })()}
        </div>{/* end feed column */}

        {/* Friends panel */}
        <div className="w-64 shrink-0">
            <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-2xl p-4 sticky top-0">

              {/* Friends header */}
              <button onClick={() => window.location.href = '/friends'} className="w-full text-left mb-3 hover:opacity-75 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Friends</span>
                  {friends.friends?.length > 0 && (
                    <span className="text-xs text-zinc-500">{friends.friends.length}</span>
                  )}
                </div>
              </button>

              {/* Search */}
              <div className="relative mb-3">
                <input
                  value={searchQuery}
                  onChange={e => searchUsers(e.target.value)}
                  placeholder="Find users…"
                  className="w-full px-3 py-2 rounded-xl border text-xs outline-none bg-zinc-900/60 border-zinc-700 text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 transition"
                />
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-2xl overflow-hidden z-20 bg-zinc-800 border-zinc-700">
                    {searchResults.map(u => {
                      const isFriend = friends.friends?.some(f => f.username === u.username);
                      const isPending = friends.outgoing?.includes(u.username);
                      return (
                        <div key={u.username} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-zinc-700/60 last:border-0 hover:bg-zinc-700/30 transition">
                          <button onClick={() => { onViewProfile(u.username); setSearchQuery(''); setSearchResults([]); }} className="shrink-0">
                            <Avatar src={u.avatarBase64} username={u.username} size="w-6 h-6" text="text-[10px]" />
                          </button>
                          <span className="flex-1 text-xs font-semibold text-zinc-200 truncate">{u.username}</span>
                          {isFriend
                            ? <span className="text-[10px] text-zinc-500">Friends</span>
                            : isPending
                              ? <span className="text-[10px] text-blue-400">Sent</span>
                              : <button onClick={() => { sendRequest(u.username); setSearchQuery(''); setSearchResults([]); }} className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold transition">Add</button>
                          }
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Incoming requests */}
              {friends.incoming?.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Requests ({friends.incoming.length})</p>
                  <div className="flex flex-col">
                    {friends.incoming.map(u => (
                      <FriendRow key={u.username} user={u} actions={<>
                        <button onClick={() => acceptRequest(u.username)} className="text-[10px] px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition font-semibold">Accept</button>
                        <button onClick={() => declineRequest(u.username)} className="text-[10px] px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition">✕</button>
                      </>} />
                    ))}
                  </div>
                </div>
              )}

              {/* Outgoing */}
              {friends.outgoing?.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Sent</p>
                  <div className="flex flex-col">
                    {friends.outgoing.map(u => (
                      <div key={u} className="flex items-center gap-2 py-2">
                        <span className="text-xs font-medium text-zinc-300 flex-1 truncate">{u}</span>
                        <span className="text-[10px] text-blue-400">Pending</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friends list */}
              {friends.friends?.length === 0 && friends.incoming?.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-4">Search above to find users.</p>
              ) : friends.friends?.length > 0 && (
                <div>
                  {(friends.incoming?.length > 0 || friends.outgoing?.length > 0) && (
                    <div className="border-t border-zinc-700/40 mt-2 pt-2 mb-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Friends</p>
                    </div>
                  )}
                  <div className="flex flex-col divide-y divide-zinc-700/30">
                    {friends.friends.map(u => (
                      <FriendRow key={u.username} user={u} actions={
                        u.isOnline
                          ? <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Online" />
                          : null
                      } />
                    ))}
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}
