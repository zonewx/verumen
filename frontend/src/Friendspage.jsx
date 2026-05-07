import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function FriendsPage({ isDark, authUsername }) {
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const h = { ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };

  useEffect(() => {
    loadFriends();
  }, []);

  async function loadFriends() {
    setLoading(true);
    try {
      const [friendsRes, pendingRes, sentRes] = await Promise.all([
        fetch('/api/friends', { headers: h }),
        fetch('/api/friends/pending', { headers: h }),
        fetch('/api/friends/sent', { headers: h })
      ]);

      if (friendsRes.ok) setFriends(await friendsRes.json());
      if (pendingRes.ok) setPendingRequests(await pendingRes.json());
      if (sentRes.ok) setSentRequests(await sentRes.json());
    } catch (e) {
      console.error('Failed to load friends:', e);
    }
    setLoading(false);
  }

  async function handleAccept(username) {
    try {
      const res = await fetch(`/api/friends/accept/${username}`, { method: 'POST', headers: h });
      if (res.ok) {
        loadFriends();
        window.dispatchEvent(new Event('friends-updated'));
      }
    } catch (e) {
      console.error('Failed to accept friend:', e);
    }
  }

  async function handleReject(username) {
    try {
      const res = await fetch(`/api/friends/reject/${username}`, { method: 'POST', headers: h });
      if (res.ok) {
        loadFriends();
        window.dispatchEvent(new Event('friends-updated'));
      }
    } catch (e) {
      console.error('Failed to reject friend:', e);
    }
  }

  async function handleRemoveFriend(username) {
    if (!confirm(`Remove ${username} from friends?`)) return;
    try {
      const res = await fetch(`/api/friends/remove/${username}`, { method: 'DELETE', headers: h });
      if (res.ok) {
        loadFriends();
        window.dispatchEvent(new Event('friends-updated'));
      }
    } catch (e) {
      console.error('Failed to remove friend:', e);
    }
  }

  async function handleCancelRequest(username) {
    try {
      const res = await fetch(`/api/friends/cancel/${username}`, { method: 'DELETE', headers: h });
      if (res.ok) {
        loadFriends();
      }
    } catch (e) {
      console.error('Failed to cancel request:', e);
    }
  }

  const card = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const hoverBg = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

  const filteredFriends = friends.filter(f => 
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`flex-1 overflow-y-auto ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Friends</h1>
          <p className={textSecondary}>Manage your friend connections</p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search friends..."
            className={`w-full px-4 py-2 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide mb-3 text-red-400">
                  Pending Requests ({pendingRequests.length})
                </h2>
                <div className={`${card} border rounded-xl divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {pendingRequests.map(req => (
                    <div key={req.username} className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold overflow-hidden">
                        {req.avatarBase64 ? (
                          <img src={req.avatarBase64} alt="" className="w-full h-full object-cover"/>
                        ) : (
                          req.username[0].toUpperCase()
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{req.username}</p>
                        {req.bio && <p className={`text-sm ${textSecondary}`}>{req.bio}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(req.username)}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleReject(req.username)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sent Requests */}
            {sentRequests.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide mb-3 text-blue-400">
                  Sent Requests ({sentRequests.length})
                </h2>
                <div className={`${card} border rounded-xl divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {sentRequests.map(req => (
                    <div key={req.username} className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold overflow-hidden">
                        {req.avatarBase64 ? (
                          <img src={req.avatarBase64} alt="" className="w-full h-full object-cover"/>
                        ) : (
                          req.username[0].toUpperCase()
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{req.username}</p>
                        {req.bio && <p className={`text-sm ${textSecondary}`}>{req.bio}</p>}
                      </div>
                      <button
                        onClick={() => handleCancelRequest(req.username)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends List */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-3 text-green-400">
                Friends ({filteredFriends.length})
              </h2>
              {filteredFriends.length > 0 ? (
                <div className={`${card} border rounded-xl divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {filteredFriends.map(friend => (
                    <div key={friend.username} className={`p-4 flex items-center gap-4 transition ${hoverBg}`}>
                      <button
                        onClick={() => navigate(`/profile/@${friend.username}`)}
                        className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold overflow-hidden hover:opacity-80 transition"
                      >
                        {friend.avatarBase64 ? (
                          <img src={friend.avatarBase64} alt="" className="w-full h-full object-cover"/>
                        ) : (
                          friend.username[0].toUpperCase()
                        )}
                      </button>
                      <div className="flex-1">
                        <button
                          onClick={() => navigate(`/profile/@${friend.username}`)}
                          className="font-semibold hover:underline text-left"
                        >
                          {friend.username}
                        </button>
                        {friend.bio && <p className={`text-sm ${textSecondary}`}>{friend.bio}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/profile/@${friend.username}`)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                        >
                          View Profile
                        </button>
                        <button
                          onClick={() => handleRemoveFriend(friend.username)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isDark ? 'bg-gray-700 hover:bg-red-900/40 hover:text-red-400' : 'bg-gray-200 hover:bg-red-100 hover:text-red-600'}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${card} border rounded-xl p-12 text-center`}>
                  <p className={textSecondary}>
                    {searchQuery ? 'No friends found matching your search' : 'No friends yet'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}