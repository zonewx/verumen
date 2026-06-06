import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiCache from './apiCache';

export default function FriendsPage({ authUsername }) {
  const [friends, setFriends] = useState(() => apiCache.get('/api/friends')?.friends || []);
  const [incoming, setIncoming] = useState(() => apiCache.get('/api/friends')?.incoming || []);
  const [outgoing, setOutgoing] = useState(() => apiCache.get('/api/friends')?.outgoing || []);
  const [loading, setLoading] = useState(!apiCache.has('/api/friends'));
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const h = { ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };

  useEffect(() => { loadFriends(); }, []);

  async function loadFriends() {
    if (!apiCache.has('/api/friends')) setLoading(true);
    try {
      const res = await fetch('/api/friends', { headers: h });
      if (res.ok) {
        const data = await res.json();
        apiCache.set('/api/friends', data);
        setFriends(Array.isArray(data.friends) ? data.friends : []);
        setIncoming(Array.isArray(data.incoming) ? data.incoming : []);
        setOutgoing(Array.isArray(data.outgoing) ? data.outgoing : []);
      }
    } catch (e) {}
    setLoading(false);
  }

  async function handleAccept(username) {
    await fetch(`/api/friends/accept/${username}`, { method: 'POST', headers: h });
    loadFriends();
    window.dispatchEvent(new Event('friends-updated'));
  }

  async function handleDecline(username) {
    await fetch(`/api/friends/decline/${username}`, { method: 'POST', headers: h });
    loadFriends();
    window.dispatchEvent(new Event('friends-updated'));
  }

  async function handleRemove(username) {
    if (!confirm(`Remove ${username} from friends?`)) return;
    await fetch(`/api/friends/remove/${username}`, { method: 'POST', headers: h });
    loadFriends();
    window.dispatchEvent(new Event('friends-updated'));
  }

  const card = 'bg-zinc-800 border-zinc-700';
  const textSecondary = 'text-zinc-400';
  const divider = 'divide-zinc-700';

  const filteredFriends = friends.filter(f =>
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const Avatar = ({ user }) => (
    <div className="w-12 h-12 rounded-full bg-zinc-600 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
      {user.avatarBase64
        ? <img src={user.avatarBase64} alt="" className="w-full h-full object-cover"/>
        : user.username[0].toUpperCase()}
    </div>
  );

  return (
    <div className={`flex-1 overflow-y-auto bg-zinc-900`}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Friends</h1>
          <p className={`text-sm ${textSecondary}`}>Manage your friend connections</p>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search friends..."
          className={`w-full px-4 py-2 rounded-lg border mb-6 text-sm bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500`}
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Incoming requests */}
            {incoming.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-3 text-red-400">
                  Pending Requests ({incoming.length})
                </h2>
                <div className={`${card} border rounded-xl divide-y ${divider}`}>
                  {incoming.map(req => (
                    <div key={req.username} className="p-4 flex items-center gap-4">
                      <Avatar user={req} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{req.username}</p>
                        {req.bio && <p className={`text-sm truncate ${textSecondary}`}>{req.bio}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleAccept(req.username)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">Accept</button>
                        <button onClick={() => handleDecline(req.username)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition bg-zinc-700 hover:bg-zinc-600`}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sent requests */}
            {outgoing.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-3 text-blue-400">
                  Sent Requests ({outgoing.length})
                </h2>
                <div className={`${card} border rounded-xl divide-y ${divider}`}>
                  {outgoing.map(username => (
                    <div key={username} className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-zinc-600 flex items-center justify-center text-white font-bold shrink-0">
                        {username[0].toUpperCase()}
                      </div>
                      <p className="flex-1 font-semibold">{username}</p>
                      <span className={`text-sm ${textSecondary}`}>Pending...</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends list */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide mb-3 text-green-400">
                Friends ({filteredFriends.length})
              </h2>
              {filteredFriends.length > 0 ? (
                <div className={`${card} border rounded-xl divide-y ${divider}`}>
                  {filteredFriends.map(friend => (
                    <div key={friend.username} className="p-4 flex items-center gap-4">
                      <button onClick={() => navigate(`/profile/@${friend.username}`)}>
                        <Avatar user={friend} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <button onClick={() => navigate(`/profile/@${friend.username}`)} className="font-semibold hover:underline text-left truncate block">
                          {friend.username}
                        </button>
                        {friend.bio && <p className={`text-sm truncate ${textSecondary}`}>{friend.bio}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => navigate(`/profile/@${friend.username}`)} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition">View</button>
                        <button onClick={() => handleRemove(friend.username)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition bg-zinc-700 hover:bg-red-900/40 hover:text-red-400`}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${card} border rounded-xl p-12 text-center`}>
                  <p className={textSecondary}>{searchQuery ? 'No friends match your search' : 'No friends yet'}</p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}