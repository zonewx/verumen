import { useState, useEffect, useCallback } from 'react';
import apiCache from './apiCache';

export default function ModeratorPanel({ isDark, authUsername, userRole }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState(() => apiCache.get('/api/users') || []);
  const [modLog, setModLog] = useState(() => apiCache.get('/api/mod/log') || []);
  const [announcements, setAnnouncements] = useState(() => apiCache.get('/api/announcements') || []);
  const [loading, setLoading] = useState(!apiCache.has('/api/users'));
  const [actionMsg, setActionMsg] = useState('');
  const [resetModal, setResetModal] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [annForm, setAnnForm] = useState({ title: '', message: '', type: 'info' });
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [lastPriceSync, setLastPriceSync] = useState(null);

  const h = { 'Content-Type': 'application/json', ...(sessionStorage.getItem('auth_token') ? { 'Authorization': `Bearer ${sessionStorage.getItem('auth_token')}` } : {}) };
  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const btnBlue = 'px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition';
  const btnGhost = `px-3 py-1.5 text-xs font-semibold rounded-lg transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;

  const flash = (msg, ms = 3000) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), ms); };
  const base = userRole === 'admin' ? '/api/admin' : '/api/mod';

  const fetchAll = useCallback(async () => {
    if (!apiCache.has('/api/users')) setLoading(true);
    try {
      const [usersRes, logRes, annRes, syncRes] = await Promise.all([
        fetch('/api/users', { headers: h }).then(r => r.json()),
        fetch('/api/mod/log', { headers: h }).then(r => r.json()),
        fetch('/api/announcements', { headers: h }).then(r => r.json()),
        fetch('/api/cs/prices/last-sync', { headers: h }).then(r => r.json()).catch(() => ({})),
      ]);
      if (syncRes.lastSync) setLastPriceSync(syncRes.lastSync);
      const filtered = usersRes.filter(u => u.username !== authUsername);
      apiCache.set('/api/users', filtered);
      apiCache.set('/api/mod/log', logRes);
      apiCache.set('/api/announcements', annRes);
      setUsers(filtered);
      setModLog(logRes);
      setAnnouncements(annRes);
    } catch(e) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, []);

  const resetPassword = async () => {
    if (!resetPw || resetPw.length < 6) { flash('Password must be 6+ chars'); return; }
    const res = await fetch(`/api/mod/users/${resetModal.username}/reset-password`, { method: 'POST', headers: h, body: JSON.stringify({ newPassword: resetPw }) });
    const data = await res.json();
    if (data.success) { flash(`✓ Password reset for ${resetModal.username}`); setResetModal(null); setResetPw(''); }
    else flash('Error: ' + data.error);
  };

  const clearBio = async (username) => {
    await fetch(`/api/mod/users/${username}/clear-bio`, { method: 'POST', headers: h });
    flash(`✓ Bio cleared for ${username}`); fetchAll();
  };

  const setPrivacy = async (username, key, value) => {
    await fetch(`/api/mod/users/${username}/set-privacy`, { method: 'POST', headers: h, body: JSON.stringify({ [key]: value }) });
    flash(`✓ Privacy updated for ${username}`); fetchAll();
  };

  const resolveUser = async (username) => {
    flash(`Resolving tickers for ${username}...`, 30000);
    const res = await fetch(`/api/mod/users/${username}/resolve`, { method: 'POST', headers: h });
    const data = await res.json();
    flash(`✓ Resolved ${data.resolved}/${data.total} for ${username}`);
  };

  const postAnn = async () => {
    if (!annForm.title || !annForm.message) { flash('Title and message required'); return; }
    const res = await fetch('/api/mod/announcements', { method: 'POST', headers: h, body: JSON.stringify(annForm) });
    const data = await res.json();
    if (data.success) { setAnnForm({ title: '', message: '', type: 'info' }); flash('✓ Posted'); fetchAll(); }
    else flash('Error: ' + data.error);
  };

  const deleteAnn = async (id) => {
    await fetch(`/api/mod/announcements/${id}`, { method: 'DELETE', headers: h });
    setAnnouncements(a => a.filter(x => x.id !== id)); flash('✓ Removed');
  };

  const syncPrices = async () => {
    setSyncingPrices(true);
    setSyncStatus('Starting sync...');
    try {
      const res = await fetch('/api/cs/prices/sync', { method: 'POST', headers: h });
      const data = await res.json();
      if (!data.success) { setSyncStatus('Failed: ' + data.error); setSyncingPrices(false); return; }
      let secs = 35;
      setSyncStatus(`Syncing in background — ~${secs}s`);
      const tick = setInterval(() => {
        secs--;
        if (secs > 0) setSyncStatus(`Syncing in background — ~${secs}s`);
        else { clearInterval(tick); setSyncingPrices(false); setSyncStatus('✓ Sync complete'); setLastPriceSync(Date.now()); }
      }, 1000);
    } catch(e) { setSyncStatus('Error: ' + e.message); setSyncingPrices(false); }
  };

  const fmtAgo = (ts) => {
    if (!ts) return 'Never';
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  const typeColors = { info: 'bg-blue-900/40 text-blue-400 border-blue-800', warning: 'bg-yellow-900/40 text-yellow-400 border-yellow-800', success: 'bg-green-900/40 text-green-400 border-green-800', error: 'bg-red-900/40 text-red-400 border-red-800' };
  const roleBadge = { admin: 'bg-red-900/40 text-red-400 border border-red-800', moderator: 'bg-blue-900/40 text-blue-400 border border-blue-800', user: '' };

  const TABS = [{ id: 'users', label: 'Users' }, { id: 'announcements', label: 'Announcements' }, { id: 'log', label: 'Mod Log' }];

  return (
    <div className="flex-1 overflow-y-auto">
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setResetModal(null)}>
          <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl p-6 w-80 shadow-2xl`} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-1">Reset password</h3>
            <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{resetModal.username}</p>
            <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} placeholder="New password (6+ chars)" className={`${inputCls} mb-3`} />
            <div className="flex gap-2">
              <button onClick={resetPassword} className={btnBlue + ' flex-1 py-2'}>Reset</button>
              <button onClick={() => { setResetModal(null); setResetPw(''); }} className={btnGhost + ' flex-1 py-2'}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="px-10 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">🛡 Moderator Panel</h1>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Logged in as <span className="font-semibold text-blue-400">{authUsername}</span></p>
          </div>
          {actionMsg && <div className={`px-4 py-2 rounded-lg text-sm font-semibold border ${actionMsg.startsWith('✓') ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800'}`}>{actionMsg}</div>}
        </div>

        {/* CS Prices */}
        <div className={`${card} p-5 mb-6`}>
          <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>CS Item Prices</h2>
          <div className={`flex items-center justify-between gap-4 p-4 rounded-xl ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div>
              <p className="text-sm font-semibold">Manual price sync</p>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Last sync: {fmtAgo(lastPriceSync)} — auto-syncs every 24h. Moderator sync bypasses the 1-hour cooldown.
              </p>
              {syncStatus && (
                <p className={`text-xs mt-1 ${syncStatus.startsWith('✓') ? 'text-green-400' : 'text-orange-400'}`}>{syncStatus}</p>
              )}
            </div>
            <button onClick={syncPrices} disabled={syncingPrices} className={`${btnBlue} shrink-0 disabled:opacity-50`}>
              {syncingPrices ? '⏳ Syncing...' : '↺ Sync Now'}
            </button>
          </div>
        </div>

        <div className={`flex gap-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} mb-6`}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${tab === t.id ? 'border-blue-500 text-blue-400' : `border-transparent ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}`}>{t.label}</button>
          ))}
        </div>

        {loading ? <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div> : (
          <>
            {tab === 'users' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{users.length} user(s)</p>
                  <button onClick={fetchAll} className={btnGhost}>↺ Refresh</button>
                </div>
                {users.map(u => (
                  <div key={u.username} className={`${card} p-5`}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
                        {u.avatarBase64 ? <img src={u.avatarBase64} className="w-full h-full object-cover"/> : u.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-3">
                          <span className="font-bold">{u.username}</span>
                          {u.role && u.role !== 'user' && <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge[u.role]}`}>{u.role}</span>}
                          {u.publicInventory && <span className="text-xs text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded-full">Pub. CS</span>}
                          {u.publicHoldings && <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded-full">Pub. Portfolio</span>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {u.role !== 'admin' && u.role !== 'moderator' && <button onClick={() => setResetModal({ username: u.username })} className={btnBlue}>Reset Password</button>}
                          <button onClick={() => clearBio(u.username)} className={btnGhost}>Clear Bio</button>
                          {u.publicInventory && <button onClick={() => setPrivacy(u.username, 'publicInventory', false)} className={btnGhost}>Make CS Private</button>}
                          {u.publicHoldings && <button onClick={() => setPrivacy(u.username, 'publicHoldings', false)} className={btnGhost}>Make Portfolio Private</button>}
                          {u.role !== 'admin' && <button onClick={() => resolveUser(u.username)} className={btnGhost}>Re-resolve Tickers</button>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'announcements' && (
              <div className="flex flex-col gap-5">
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Post Announcement</h2>
                  <div className="flex flex-col gap-3">
                    <input value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder="Title..." className={inputCls} />
                    <textarea value={annForm.message} onChange={e => setAnnForm(f => ({ ...f, message: e.target.value }))} rows={3} placeholder="Message..." className={`${inputCls} resize-none`} />
                    <div className="flex gap-3 items-center">
                      <select value={annForm.type} onChange={e => setAnnForm(f => ({ ...f, type: e.target.value }))} className={`${inputCls} w-36`}>
                        <option value="info">Info</option>
                        <option value="success">Success</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                      </select>
                      {annForm.title && <div className={`flex-1 px-3 py-2 rounded-lg border text-sm ${typeColors[annForm.type]}`}><span className="font-semibold">{annForm.title}</span>{annForm.message && <span className="ml-2 opacity-80 text-xs">{annForm.message}</span>}</div>}
                    </div>
                    <button onClick={postAnn} className={btnBlue + ' self-start px-5 py-2'}>Post</button>
                  </div>
                </div>
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Active ({announcements.length})</h2>
                  {announcements.length === 0 ? <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>None.</p> : (
                    <div className="flex flex-col gap-3">
                      {announcements.map(a => (
                        <div key={a.id} className={`flex items-start gap-3 p-4 rounded-xl border ${typeColors[a.type]}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1"><p className="font-semibold text-sm">{a.title}</p><span className="text-xs opacity-60">by {a.posted_by || a.postedBy}</span></div>
                            <p className="text-xs opacity-80">{a.message}</p>
                          </div>
                          <button onClick={() => deleteAnn(a.id)} className="text-sm opacity-60 hover:opacity-100 hover:text-red-400 transition shrink-0">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'log' && (
              <div className={`${card} overflow-hidden`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                      <tr>{['Time', 'Moderator', 'Action', 'Target', 'Details'].map(h => <th key={h} className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {modLog.length === 0 ? (
                        <tr><td colSpan="5" className={`px-4 py-8 text-center text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No actions logged yet.</td></tr>
                      ) : modLog.map((entry, i) => (
                        <tr key={i} className={`border-t ${isDark ? 'border-gray-700 hover:bg-gray-700/20' : 'border-gray-100 hover:bg-gray-50'}`}>
                          <td className={`px-4 py-3 text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{new Date(entry.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs font-bold text-blue-400">{entry.moderator}</td>
                          <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{entry.action}</td>
                          <td className="px-4 py-3 text-xs font-mono">{entry.targetUser}</td>
                          <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{entry.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}