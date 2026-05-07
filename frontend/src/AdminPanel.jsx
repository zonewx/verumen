import { useState, useEffect, useCallback } from 'react';

export default function AdminPanel({ isDark, authUsername }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [failures, setFailures] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  // Modals
  const [resetModal, setResetModal] = useState(null); // { username }
  const [resetPw, setResetPw] = useState('');
  const [annForm, setAnnForm] = useState({ title: '', message: '', type: 'info' });
  const [settings, setSettings] = useState({ allowRegistration: true });

  const token = sessionStorage.getItem('auth_token');
  const h = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const btnRed = 'px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition';
  const btnBlue = 'px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition';
  const btnGhost = `px-3 py-1.5 text-xs font-semibold rounded-lg transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;

  const flash = (msg, ms = 3000) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), ms); };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
      const [statsRes, annRes, settingsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }).then(r => r.json()),
        fetch('/api/announcements', { headers }).then(r => r.json()),
        fetch('/api/admin/settings', { headers }).then(r => r.json()),
      ]);
      if (statsRes.error) { flash('Stats error: ' + statsRes.error); }
      else { setStats(statsRes); }
      if (Array.isArray(annRes)) setAnnouncements(annRes);
      if (settingsRes && !settingsRes.error) setSettings({ allowRegistration: settingsRes.allowRegistration !== 'false' });
    } catch(e) { flash('Failed to load stats: ' + e.message); }
    setLoading(false);
  }, []);

  const fetchFailures = useCallback(async () => {
    try {
      const data = await fetch('/api/admin/ticker-failures', { headers: h }).then(r => r.json());
      setFailures(data);
    } catch(e) {}
  }, []);

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { if (tab === 'tickers') fetchFailures(); }, [tab]);

  const deleteUser = async (username) => {
    if (!confirm(`Delete user "${username}" and ALL their data? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${username}`, { method: 'DELETE', headers: h });
    const data = await res.json();
    if (data.success) { flash(`✓ Deleted ${username}`); fetchStats(); }
    else flash('Error: ' + data.error);
  };

  const resetPassword = async () => {
    if (!resetPw || resetPw.length < 6) { flash('Password must be 6+ chars'); return; }
    const res = await fetch(`/api/admin/users/${resetModal.username}/reset-password`, { method: 'POST', headers: h, body: JSON.stringify({ newPassword: resetPw }) });
    const data = await res.json();
    if (data.success) { flash(`✓ Password reset for ${resetModal.username}`); setResetModal(null); setResetPw(''); }
    else flash('Error: ' + data.error);
  };

  const clearBio = async (username) => {
    await fetch(`/api/admin/users/${username}/clear-bio`, { method: 'POST', headers: h });
    flash(`✓ Bio cleared for ${username}`);
    fetchStats();
  };

  const setPrivacy = async (username, key, value) => {
    await fetch(`/api/admin/users/${username}/set-privacy`, { method: 'POST', headers: h, body: JSON.stringify({ [key]: value }) });
    flash(`✓ Updated privacy for ${username}`);
    fetchStats();
  };

  const clearCache = async (username = null) => {
    const res = await fetch('/api/admin/cache/clear', { method: 'POST', headers: h, body: JSON.stringify(username ? { username } : {}) });
    const data = await res.json();
    flash(`✓ Cleared ${data.cleared} cache file(s)`);
    fetchStats();
  };

  const resolveUser = async (username) => {
    flash(`Resolving tickers for ${username}...`, 30000);
    const res = await fetch(`/api/admin/users/${username}/resolve`, { method: 'POST', headers: h });
    const data = await res.json();
    flash(`✓ Resolved ${data.resolved}/${data.total} tickers for ${username}`);
  };

  const exportUser = async (username) => {
    const data = await fetch(`/api/admin/users/${username}/export`, { headers: h }).then(r => r.json());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${username}-export.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const postAnnouncement = async () => {
    if (!annForm.title || !annForm.message) { flash('Title and message required'); return; }
    const res = await fetch('/api/admin/announcements', { method: 'POST', headers: h, body: JSON.stringify(annForm) });
    const data = await res.json();
    if (data.success) { setAnnForm({ title: '', message: '', type: 'info' }); flash('✓ Announcement posted'); fetchStats(); }
    else flash('Error: ' + data.error);
  };

  const deleteAnnouncement = async (id) => {
    await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE', headers: h });
    setAnnouncements(a => a.filter(x => x.id !== id));
    flash('✓ Announcement removed');
  };

  const toggleRegistration = async () => {
    const newVal = !settings.allowRegistration;
    setSettings(s => ({ ...s, allowRegistration: newVal }));
    await fetch('/api/admin/settings', { method: 'POST', headers: h, body: JSON.stringify({ key: 'allowRegistration', value: String(newVal) }) });
    flash(`✓ Registration ${newVal ? 'enabled' : 'disabled'}`);
  };

  const setRole = async (username, role) => {
    const res = await fetch(`/api/admin/users/${username}/set-role`, { method: 'POST', headers: h, body: JSON.stringify({ role }) });
    const data = await res.json();
    if (data.success) { flash(`✓ ${username} is now ${role}`); fetchStats(); }
    else flash('Error: ' + data.error);
  };

  const formatUptime = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
  };

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'roles', label: 'Roles' },
    { id: 'tickers', label: 'Ticker Failures' },
    { id: 'announcements', label: 'Announcements' },
  ];

  const typeColors = {
    info: 'bg-blue-900/40 text-blue-400 border-blue-800',
    warning: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    success: 'bg-green-900/40 text-green-400 border-green-800',
    error: 'bg-red-900/40 text-red-400 border-red-800',
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Reset password modal */}
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

      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">🛡️ Admin Panel</h1>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Logged in as <span className="font-semibold text-red-400">admin</span></p>
          </div>
          {actionMsg && <div className={`px-4 py-2 rounded-lg text-sm font-semibold border ${actionMsg.startsWith('✓') ? 'bg-green-900/40 text-green-400 border-green-800' : actionMsg.includes('Error') ? 'bg-red-900/40 text-red-400 border-red-800' : 'bg-blue-900/40 text-blue-400 border-blue-800'}`}>{actionMsg}</div>}
        </div>

        {/* Tabs */}
        <div className={`flex gap-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} mb-6`}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${tab === t.id ? 'border-red-500 text-red-400' : `border-transparent ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}`}>{t.label}</button>
          ))}
        </div>

        {loading && tab === 'overview' ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"/>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading admin data...</p>
          </div>
        ) : !stats && tab === 'overview' ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Failed to load stats.</p>
            <button onClick={fetchStats} className={btnGhost}>↺ Try again</button>
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {tab === 'overview' && stats && (
              <div className="flex flex-col gap-5">
                {/* System stats */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>System</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Uptime', value: formatUptime(stats.system.uptime) },
                      { label: 'Memory', value: `${stats.system.memoryMB} MB` },
                      { label: 'Heap Used', value: `${stats.system.heapUsedMB} MB` },
                      { label: 'Node', value: stats.system.nodeVersion },
                    ].map(({ label, value }) => (
                      <div key={label} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-3`}>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>{label}</p>
                        <p className="font-bold text-sm">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Registration toggle */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Registration</h2>
                  <div className={`flex items-center justify-between gap-4 p-4 rounded-xl ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <div>
                      <p className="text-sm font-semibold">Allow new registrations</p>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>When disabled, the sign up form is hidden and new accounts cannot be created.</p>
                    </div>
                    <button type="button" onClick={toggleRegistration}
                      className={`relative inline-flex items-center h-6 rounded-full transition-colors shrink-0 ${settings.allowRegistration ? 'bg-blue-600' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}
                      style={{ width: '44px' }}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${settings.allowRegistration ? 'translate-x-5' : 'translate-x-0'}`}/>
                    </button>
                  </div>
                </div>

                {/* User totals */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Totals</h2>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Users', value: stats.totals.userCount },
                      { label: 'Total Transactions', value: stats.totals.totalTx.toLocaleString() },
                      { label: 'Total Trades', value: (stats.totals.totalTrades ?? stats.totals.totalTx ?? 0).toLocaleString() },
                    ].map(({ label, value }) => (
                      <div key={label} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-3`}>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>{label}</p>
                        <p className="font-bold text-2xl">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ticker cache stats */}
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Ticker Cache</h2>
                    <button onClick={() => clearCache()} className={btnGhost}>Clear All Caches</button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Total Cached', value: stats.tickerCache.total },
                      { label: 'Resolved', value: stats.tickerCache.resolved, color: 'text-green-400' },
                      { label: 'Failed', value: stats.tickerCache.failed, color: 'text-red-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-3`}>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>{label}</p>
                        <p className={`font-bold text-2xl ${color || ''}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active announcements */}
                {announcements.length > 0 && (
                  <div className={`${card} p-5`}>
                    <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Active Announcements</h2>
                    <div className="flex flex-col gap-2">
                      {announcements.map(a => (
                        <div key={a.id} className={`flex items-start gap-3 p-3 rounded-lg border ${typeColors[a.type] || typeColors.info}`}>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{a.title}</p>
                            <p className="text-xs mt-0.5 opacity-80">{a.message}</p>
                          </div>
                          <button onClick={() => deleteAnnouncement(a.id)} className="text-xs opacity-60 hover:opacity-100 shrink-0">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* USERS */}
            {tab === 'users' && stats && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{stats.users.length} registered user(s)</p>
                  <button onClick={fetchStats} className={btnGhost}>↺ Refresh</button>
                </div>
                {stats.users.map(u => (
                  <div key={u.username} className={`${card} p-5`}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
                        {u.avatarBase64 ? <img src={u.avatarBase64} className="w-full h-full object-cover" alt={u.username}/> : u.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className="font-bold">{u.username}</span>
                          {u.username === 'admin' && <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">admin</span>}
                          {u.hasSteam && <span className="text-xs text-orange-400 bg-orange-900/30 px-1.5 py-0.5 rounded-full">Steam</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3 mt-2">
                          {[
                            { label: 'Joined', value: new Date(u.createdAt).toLocaleDateString() },
                            { label: 'Transactions', value: u.transactionCount.toLocaleString() },
  
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
                              <p className="text-sm font-semibold">{value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setResetModal({ username: u.username })} className={btnBlue}>Reset Password</button>
                          <button onClick={() => clearCache(u.username)} className={btnGhost}>Clear Cache</button>
                          <button onClick={() => resolveUser(u.username)} className={btnGhost}>Re-resolve Tickers</button>
                          <button onClick={() => clearBio(u.username)} className={btnGhost}>Clear Bio</button>
                          <button onClick={() => exportUser(u.username)} className={btnGhost}>Export Data</button>
                          {u.publicInventory && <button onClick={() => setPrivacy(u.username, 'publicInventory', false)} className={btnGhost}>Make CS Private</button>}
                          {u.publicHoldings && <button onClick={() => setPrivacy(u.username, 'publicHoldings', false)} className={btnGhost}>Make Stocks Private</button>}
                          {u.username !== 'admin' && <button onClick={() => deleteUser(u.username)} className={btnRed}>Delete User</button>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TICKER FAILURES */}
            {tab === 'tickers' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{failures.length} unique unresolved tickers</p>
                  <button onClick={fetchFailures} className={btnGhost}>↺ Refresh</button>
                </div>
                {failures.length === 0 ? (
                  <div className={`${card} p-10 text-center`}>
                    <p className="text-3xl mb-3">✅</p>
                    <p className="font-semibold">No ticker failures</p>
                    <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>All tickers resolved successfully.</p>
                  </div>
                ) : (
                  <div className={`${card} overflow-hidden`}>
                    <table className="w-full text-sm">
                      <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                        <tr>
                          {['Raw Ticker', 'ISIN', 'Name', 'Count', 'Users'].map(h => (
                            <th key={h} className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {failures.map((f, i) => (
                          <tr key={i} className={`border-t ${isDark ? 'border-gray-700 hover:bg-gray-700/20' : 'border-gray-100 hover:bg-gray-50'}`}>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-red-400">{f.key || '—'}</td>
                            <td className={`px-4 py-3 text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{f.isin || '—'}</td>
                            <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'} max-w-xs truncate`}>{f.name || '—'}</td>
                            <td className="px-4 py-3 text-xs font-bold">{f.count}</td>
                            <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{f.users.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ROLES */}
            {tab === 'roles' && stats && (
              <div className="flex flex-col gap-4">
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Promote users to moderator or demote them back. Admin role is permanent.</p>
                {stats.users.map(u => {
                  const roleBadge = { admin: 'bg-red-900/40 text-red-400 border border-red-800', moderator: 'bg-blue-900/40 text-blue-400 border border-blue-800', user: `${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}` };
                  return (
                    <div key={u.username} className={`${card} p-4 flex items-center gap-4`}>
                      <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
                        {u.avatarBase64 ? <img src={u.avatarBase64} className="w-full h-full object-cover" alt={u.username}/> : u.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold">{u.username}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${roleBadge[u.role || 'user']}`}>{u.role || 'user'}</span>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Joined {new Date(u.createdAt).toLocaleDateString()}</p>
                      </div>
                      {u.username !== 'admin' && (
                        <div className="flex gap-2 shrink-0">
                          {(u.role || 'user') !== 'moderator'
                            ? <button onClick={() => setRole(u.username, 'moderator')} className={btnBlue}>Promote to Mod</button>
                            : <button onClick={() => setRole(u.username, 'user')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Demote to User</button>
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ANNOUNCEMENTS */}
            {tab === 'announcements' && (
              <div className="flex flex-col gap-5">
                {/* Post new */}
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
                      {/* Preview */}
                      {annForm.title && (
                        <div className={`flex-1 px-3 py-2 rounded-lg border text-sm ${typeColors[annForm.type] || typeColors.info}`}>
                          <span className="font-semibold">{annForm.title}</span>
                          {annForm.message && <span className="ml-2 opacity-80 text-xs">{annForm.message}</span>}
                        </div>
                      )}
                    </div>
                    <button onClick={postAnnouncement} className={btnBlue + ' self-start px-5 py-2'}>Post Announcement</button>
                  </div>
                </div>

                {/* Existing */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Active Announcements ({announcements.length})</h2>
                  {announcements.length === 0 ? (
                    <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No announcements posted.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {announcements.map(a => (
                        <div key={a.id} className={`flex items-start gap-3 p-4 rounded-xl border ${typeColors[a.type] || typeColors.info}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-sm">{a.title}</p>
                              <span className="text-xs opacity-60">{new Date(a.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-xs opacity-80">{a.message}</p>
                          </div>
                          <button onClick={() => deleteAnnouncement(a.id)} className="text-sm opacity-60 hover:opacity-100 shrink-0 hover:text-red-400 transition">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}