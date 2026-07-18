import { useState, useEffect, useCallback, useRef } from 'react';
import apiCache from './apiCache';

export default function AdminPanel({ authUsername }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(() => apiCache.get('/api/admin/stats'));
  const [failures, setFailures] = useState([]);
  const [announcements, setAnnouncements] = useState(() => apiCache.get('/api/announcements') || []);
  const [loading, setLoading] = useState(!apiCache.has('/api/admin/stats'));
  const [actionMsg, setActionMsg] = useState('');
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [lastPriceSync, setLastPriceSync] = useState(null);
  const [syncingIndexes, setSyncingIndexes] = useState(false);
  const [indexSyncStatus, setIndexSyncStatus] = useState('');
  const [lastIndexSync, setLastIndexSync] = useState(null);

  // Modals
  const [resetModal, setResetModal] = useState(null); // { username }
  const [resetPw, setResetPw] = useState('');
  const [deleteModal, setDeleteModal] = useState(null); // username
  const [deletePw, setDeletePw] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [annForm, setAnnForm] = useState({ title: '', message: '', type: 'info' });
  const [settings, setSettings] = useState({ allowRegistration: true, userLimit: 0 });
  const [userLimitInput, setUserLimitInput] = useState('0');

  // Global overrides
  const [globalOverrides, setGlobalOverrides] = useState(() => apiCache.get('/api/admin/global-overrides') || []);
  const [goIsin, setGoIsin] = useState('');
  const [goTicker, setGoTicker] = useState('');
  const [goMsg, setGoMsg] = useState('');
  const [clearAllModal, setClearAllModal] = useState(false);
  const [clearAllPw, setClearAllPw] = useState('');
  const [clearAllError, setClearAllError] = useState('');
  const [removeModal, setRemoveModal] = useState(null); // isin being removed
  const [removePw, setRemovePw] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [goSearch, setGoSearch] = useState('');
  const [goLoading, setGoLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');

  // Diagnostics
  const [diagData, setDiagData] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Database browser
  const [dbTables, setDbTables] = useState([]);
  const [dbTablesLoading, setDbTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const tableScrollRef = useRef(null);

  const token = sessionStorage.getItem('auth_token');
  const h = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
  const card = `bg-zinc-800 border-zinc-700 border rounded-xl`;
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition bg-zinc-700 border-zinc-600 text-white placeholder-zinc-500`;
  const btnRed = 'px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition';
  const btnBlue = 'px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition';
  const btnGhost = `px-3 py-1.5 text-xs font-semibold rounded-lg transition bg-zinc-700 hover:bg-zinc-600 text-zinc-200`;

  const flash = (msg, ms = 3000) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), ms); };

  const fetchStats = useCallback(async () => {
    if (!apiCache.has('/api/admin/stats')) setLoading(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
      const [statsRes, annRes, settingsRes, syncRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }).then(r => r.json()),
        fetch('/api/announcements', { headers }).then(r => r.json()),
        fetch('/api/admin/settings', { headers }).then(r => r.json()),
        fetch('/api/cs/prices/last-sync', { headers }).then(r => r.json()).catch(() => ({})),
      ]);
      if (syncRes.lastSync) setLastPriceSync(syncRes.lastSync);
      if (statsRes.error) { flash('Stats error: ' + statsRes.error); }
      else { apiCache.set('/api/admin/stats', statsRes); setStats(statsRes); }
      if (Array.isArray(annRes)) { apiCache.set('/api/announcements', annRes); setAnnouncements(annRes); }
      if (settingsRes && !settingsRes.error) {
        const limit = parseInt(settingsRes.userLimit || '0', 10);
        setSettings({ allowRegistration: settingsRes.allowRegistration !== 'false', userLimit: limit });
        setUserLimitInput(String(limit));
      }
    } catch(e) { flash('Failed to load stats: ' + e.message); }
    setLoading(false);
  }, []);

  const fetchFailures = useCallback(async () => {
    try {
      const data = await fetch('/api/admin/ticker-failures', { headers: h }).then(r => r.json());
      setFailures(data);
    } catch(e) {}
  }, []);

  const fetchGlobalOverrides = useCallback(async (force = false) => {
    if (!force && apiCache.has('/api/admin/global-overrides')) return;
    setGoLoading(true);
    const res = await fetch('/api/admin/global-overrides', { headers: h });
    const data = await res.json();
    setGoLoading(false);
    if (!res.ok) { setGoMsg(`Error: ${data.error}`); return; }
    if (Array.isArray(data)) { setGlobalOverrides(data); apiCache.set('/api/admin/global-overrides', data); }
  }, []);

  const saveGlobalOverride = async () => {
    const isin = goIsin.trim().toUpperCase(), ticker = goTicker.trim().toUpperCase();
    if (!isin || !ticker) return;
    const res = await fetch('/api/admin/global-overrides', { method: 'POST', headers: h, body: JSON.stringify({ isin, ticker }) });
    const data = await res.json();
    if (!res.ok) { setGoMsg(`Error: ${data.error}`); return; }
    setGoIsin(''); setGoTicker('');
    setGoMsg(`Saved: ${isin} → ${ticker}`);
    setTimeout(() => setGoMsg(''), 3000);
    apiCache.del('/api/admin/global-overrides');
    fetchGlobalOverrides(true);
  };

  const deleteGlobalOverride = (isin) => {
    setRemoveModal(isin);
    setRemovePw('');
    setRemoveError('');
  };

  const confirmDeleteGlobalOverride = async () => {
    setRemoveError('');
    const res = await fetch(`/api/admin/global-overrides/${removeModal}`, { method: 'DELETE', headers: h, body: JSON.stringify({ password: removePw }) });
    const data = await res.json();
    if (!res.ok) { setRemoveError(data.error || 'Incorrect password'); return; }
    setRemoveModal(null); setRemovePw('');
    apiCache.del('/api/admin/global-overrides');
    fetchGlobalOverrides(true);
  };

  const toggleGlobalOverride = async (isin) => {
    await fetch(`/api/admin/global-overrides/${isin}/toggle`, { method: 'PATCH', headers: h });
    apiCache.del('/api/admin/global-overrides');
    fetchGlobalOverrides(true);
  };

  const clearAllGlobalOverrides = async () => {
    setClearAllError('');
    const res = await fetch('/api/admin/global-overrides', { method: 'DELETE', headers: h, body: JSON.stringify({ password: clearAllPw }) });
    const data = await res.json();
    if (!res.ok) { setClearAllError(data.error || 'Incorrect password'); return; }
    setClearAllModal(false); setClearAllPw('');
    apiCache.del('/api/admin/global-overrides');
    fetchGlobalOverrides(true);
  };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { if (tab === 'tickers') fetchFailures(); }, [tab]);
  useEffect(() => { if (tab === 'global-overrides') fetchGlobalOverrides(); }, [tab]);
  useEffect(() => { if (tab === 'database') fetchDbTables(); }, [tab]);
  useEffect(() => { if (tab === 'diagnostics') fetchDiag(); }, [tab]);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const handler = e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [tableData, selectedTable]);

  const deleteUser = (username) => {
    setDeleteModal(username);
    setDeletePw('');
    setDeleteError('');
  };

  const confirmDeleteUser = async () => {
    setDeleteError('');
    const res = await fetch(`/api/admin/users/${deleteModal}`, { method: 'DELETE', headers: h, body: JSON.stringify({ password: deletePw }) });
    const data = await res.json();
    if (!res.ok || !data.success) { setDeleteError(data.error || 'Incorrect password'); return; }
    setDeleteModal(null); setDeletePw('');
    flash(`✓ Deleted ${deleteModal}`); fetchStats();
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

  const syncIndexes = async () => {
    setSyncingIndexes(true);
    setIndexSyncStatus('Refreshing...');
    try {
      const res = await fetch('/api/admin/indexes/refresh', { method: 'POST', headers: h });
      const data = await res.json();
      if (!data.ok) { setIndexSyncStatus('Failed'); setSyncingIndexes(false); return; }
      setIndexSyncStatus(`✓ Updated ${data.count} index${data.count !== 1 ? 'es' : ''}`);
      setLastIndexSync(Date.now());
    } catch(e) { setIndexSyncStatus('Error: ' + e.message); }
    setSyncingIndexes(false);
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

  const toggleRegistration = async () => {
    const newVal = !settings.allowRegistration;
    setSettings(s => ({ ...s, allowRegistration: newVal }));
    await fetch('/api/admin/settings', { method: 'POST', headers: h, body: JSON.stringify({ key: 'allowRegistration', value: String(newVal) }) });
    flash(`✓ Registration ${newVal ? 'enabled' : 'disabled'}`);
  };

  const saveUserLimit = async () => {
    const limit = Math.max(0, parseInt(userLimitInput, 10) || 0);
    setUserLimitInput(String(limit));
    setSettings(s => ({ ...s, userLimit: limit }));
    await fetch('/api/admin/settings', { method: 'POST', headers: h, body: JSON.stringify({ key: 'userLimit', value: String(limit) }) });
    flash(`✓ User limit set to ${limit === 0 ? 'unlimited' : limit}`);
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
    { id: 'database', label: 'Database' },
    { id: 'users', label: 'Users' },
    { id: 'roles', label: 'Roles' },
    { id: 'tickers', label: 'Ticker Failures' },
    { id: 'global-overrides', label: 'Global Overrides' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'diagnostics', label: 'Diagnostics' },
  ];

  const fetchDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const res = await fetch('/api/diag/yf', { headers: h });
      const data = await res.json();
      setDiagData(data);
    } catch(e) { setDiagData({ error: e.message }); }
    setDiagLoading(false);
  }, []);

  const fetchDbTables = useCallback(async () => {
    setDbTablesLoading(true);
    const res = await fetch('/api/admin/db/tables', { headers: h });
    const data = await res.json();
    setDbTablesLoading(false);
    if (Array.isArray(data)) setDbTables(data);
  }, []);

  const fetchTableData = useCallback(async (name, page = 0) => {
    setTableLoading(true);
    const res = await fetch(`/api/admin/db/table/${name}?page=${page}`, { headers: h });
    const data = await res.json();
    setTableLoading(false);
    if (!data.error) setTableData(data);
  }, []);

  const typeColors = {
    info: 'bg-blue-900/40 text-blue-400 border-blue-800',
    warning: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    success: 'bg-green-900/40 text-green-400 border-green-800',
    error: 'bg-red-900/40 text-red-400 border-red-800',
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Delete user modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setDeleteModal(null)}>
          <div className={`bg-zinc-800 border-zinc-700 border rounded-2xl p-6 w-80 shadow-2xl`} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-1">Delete user</h3>
            <p className={`text-sm mb-1 text-zinc-400`}>This will permanently delete <span className="font-semibold text-white">{deleteModal}</span> and all their data.</p>
            <p className={`text-sm mb-4 text-zinc-300`}>Enter your password to confirm.</p>
            <input type="password" value={deletePw} onChange={e => setDeletePw(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmDeleteUser()} placeholder="Your password" className={`${inputCls} mb-2`} autoFocus />
            {deleteError && <p className="text-xs text-red-400 mb-2">{deleteError}</p>}
            <div className="flex gap-2 mt-1">
              <button onClick={confirmDeleteUser} className={btnRed + ' flex-1 py-2'}>Delete</button>
              <button onClick={() => setDeleteModal(null)} className={btnGhost + ' flex-1 py-2'}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setResetModal(null)}>
          <div className={`bg-zinc-800 border-zinc-700 border rounded-2xl p-6 w-80 shadow-2xl`} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-1">Reset password</h3>
            <p className={`text-sm mb-4 text-zinc-300`}>{resetModal.username}</p>
            <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} placeholder="New password (6+ chars)" className={`${inputCls} mb-3`} />
            <div className="flex gap-2">
              <button onClick={resetPassword} className={btnBlue + ' flex-1 py-2'}>Reset</button>
              <button onClick={() => { setResetModal(null); setResetPw(''); }} className={btnGhost + ' flex-1 py-2'}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className={`max-w-7xl mx-auto px-6 py-8`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className={`text-sm mt-1 text-zinc-400`}>Logged in as <span className="font-semibold text-red-400">{authUsername}</span></p>
          </div>
          {actionMsg && <div className={`px-4 py-2 rounded-lg text-sm font-semibold border ${actionMsg.startsWith('✓') ? 'bg-green-900/40 text-green-400 border-green-800' : actionMsg.includes('Error') ? 'bg-red-900/40 text-red-400 border-red-800' : 'bg-blue-900/40 text-blue-400 border-blue-800'}`}>{actionMsg}</div>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 transition ${tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50'}`}>{t.label}</button>
          ))}
        </div>

        {loading && tab === 'overview' ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"/>
            <p className={`text-sm text-zinc-400`}>Loading admin data...</p>
          </div>
        ) : !stats && tab === 'overview' ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className={`text-sm text-zinc-400`}>Failed to load stats.</p>
            <button onClick={fetchStats} className={btnGhost}>↺ Try again</button>
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {tab === 'overview' && stats && (
              <div className="flex flex-col gap-5">
                {/* System stats */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>System</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Uptime', value: formatUptime(stats.system.uptime) },
                      { label: 'Memory', value: `${stats.system.memoryMB} MB` },
                      { label: 'Heap Used', value: `${stats.system.heapUsedMB} MB` },
                      { label: 'Node', value: stats.system.nodeVersion },
                    ].map(({ label, value }) => (
                      <div key={label} className={`bg-zinc-700 rounded-lg p-3`}>
                        <p className={`text-xs text-zinc-400 mb-1`}>{label}</p>
                        <p className="font-bold text-sm">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Registration toggle */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Registration</h2>
                  <div className="flex flex-col gap-3">
                    <div className={`flex items-center justify-between gap-4 p-4 rounded-xl bg-zinc-700/50`}>
                      <div>
                        <p className="text-sm font-semibold">Allow new registrations</p>
                        <p className={`text-xs mt-0.5 text-zinc-400`}>When disabled, the sign up form is hidden and new accounts cannot be created.</p>
                      </div>
                      <button type="button" onClick={toggleRegistration}
                        className={`relative inline-flex items-center h-6 rounded-full transition-colors shrink-0 ${settings.allowRegistration ? 'bg-sky-500' : 'bg-zinc-700'}`}
                        style={{ width: '44px' }}>
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${settings.allowRegistration ? 'translate-x-5' : 'translate-x-0'}`}/>
                      </button>
                    </div>
                    <div className={`flex items-center justify-between gap-4 p-4 rounded-xl bg-zinc-700/50`}>
                      <div>
                        <p className="text-sm font-semibold">User limit</p>
                        <p className={`text-xs mt-0.5 text-zinc-400`}>Maximum number of accounts. Set to 0 for unlimited.</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number" min="0" value={userLimitInput}
                          onChange={e => setUserLimitInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveUserLimit()}
                          className={`w-20 px-2 py-1.5 rounded-lg border text-sm text-center outline-none bg-zinc-700 border-zinc-600 text-white`}
                        />
                        <button onClick={saveUserLimit} className={btnBlue}>Save</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Sync */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Data Sync</h2>
                  <div className="flex flex-col gap-3">
                    <div className={`flex items-center justify-between gap-4 p-4 rounded-xl bg-zinc-700/50`}>
                      <div>
                        <p className="text-sm font-semibold">CS Item Prices</p>
                        <p className={`text-xs mt-0.5 text-zinc-400`}>
                          Last sync: {fmtAgo(lastPriceSync)} — auto-syncs every 24h. Admin sync bypasses the 1-hour cooldown.
                        </p>
                        {syncStatus && (
                          <p className={`text-xs mt-1 ${syncStatus.startsWith('✓') ? 'text-green-400' : 'text-orange-400'}`}>{syncStatus}</p>
                        )}
                      </div>
                      <button onClick={syncPrices} disabled={syncingPrices} className={`${btnBlue} shrink-0 disabled:opacity-50`}>
                        {syncingPrices ? '⏳ Syncing...' : '↺ Sync Now'}
                      </button>
                    </div>
                    <div className={`flex items-center justify-between gap-4 p-4 rounded-xl bg-zinc-700/50`}>
                      <div>
                        <p className="text-sm font-semibold">Market Indexes</p>
                        <p className={`text-xs mt-0.5 text-zinc-400`}>
                          Last sync: {fmtAgo(lastIndexSync)} — force-fetches all index symbols, bypassing market-hours gate.
                        </p>
                        {indexSyncStatus && (
                          <p className={`text-xs mt-1 ${indexSyncStatus.startsWith('✓') ? 'text-green-400' : 'text-orange-400'}`}>{indexSyncStatus}</p>
                        )}
                      </div>
                      <button onClick={syncIndexes} disabled={syncingIndexes} className={`${btnBlue} shrink-0 disabled:opacity-50`}>
                        {syncingIndexes ? '⏳ Refreshing...' : '↺ Sync Now'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* User totals */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Totals</h2>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Users', value: stats.totals.userCount },
                      { label: 'Total Transactions', value: stats.totals.totalTx.toLocaleString() },
                      { label: 'Total Trades', value: (stats.totals.totalTrades ?? stats.totals.totalTx ?? 0).toLocaleString() },
                    ].map(({ label, value }) => (
                      <div key={label} className={`bg-zinc-700 rounded-lg p-3`}>
                        <p className={`text-xs text-zinc-400 mb-1`}>{label}</p>
                        <p className="font-bold text-2xl">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ticker cache stats */}
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-xs font-bold uppercase tracking-wider text-zinc-400`}>Ticker Cache</h2>
                    <button onClick={() => clearCache()} className={btnGhost}>Clear All Caches</button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Total Cached', value: stats.tickerCache.total },
                      { label: 'Resolved', value: stats.tickerCache.resolved, color: 'text-green-400' },
                      { label: 'Failed', value: stats.tickerCache.failed, color: 'text-red-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className={`bg-zinc-700 rounded-lg p-3`}>
                        <p className={`text-xs text-zinc-400 mb-1`}>{label}</p>
                        <p className={`font-bold text-2xl ${color || ''}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active announcements */}
                {announcements.length > 0 && (
                  <div className={`${card} p-5`}>
                    <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Active Announcements</h2>
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
                <div className="flex items-center gap-3">
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users…" className={`${inputCls} flex-1`} />
                  <p className={`text-sm shrink-0 text-zinc-400`}>{stats.users.length} user(s)</p>
                  <button onClick={fetchStats} className={`${btnGhost} shrink-0`}>↺ Refresh</button>
                </div>
                {[...stats.users]
                  .filter(u => !userSearch || u.username.toLowerCase().includes(userSearch.toLowerCase()))
                  .sort((a, b) => a.username.localeCompare(b.username))
                  .map(u => {
                  const roleBadge = { admin: 'bg-red-900/40 text-red-400 border border-red-800', moderator: 'bg-blue-900/40 text-blue-400 border border-blue-800' };
                  return (
                  <div key={u.username} className={`${card} overflow-hidden`}>
                    {/* Header */}
                    <div className="flex items-center gap-3 p-4 border-b border-zinc-700/50">
                      <div className="w-9 h-9 rounded-full bg-zinc-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
                        {u.avatarBase64 ? <img src={u.avatarBase64} className="w-full h-full object-cover" alt={u.username}/> : u.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">{u.username}</span>
                          {roleBadge[u.role] && <span className={`text-xs px-2 py-0.5 rounded-full border ${roleBadge[u.role]}`}>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>}
                          {u.hasSteam && <span className="text-xs text-orange-400 bg-orange-900/30 px-1.5 py-0.5 rounded-full border border-orange-800/50">Steam</span>}
                        </div>
                      </div>
                      <div className="flex items-start gap-4 shrink-0 text-right">
                        <div className="flex flex-col items-end">
                          <p className={`text-xs text-zinc-400`}>Transactions</p>
                          <p className="text-xs font-semibold mb-2">{u.transactionCount.toLocaleString()}</p>
                          {u.username !== 'admin' && (
                            <button onClick={() => deleteUser(u.username)} className={btnRed}>Delete User</button>
                          )}
                        </div>
                        <div>
                          <p className={`text-xs text-zinc-400`}>Joined</p>
                          <p className="text-xs font-semibold">{new Date(u.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
                      <button onClick={() => setResetModal({ username: u.username })} className={btnBlue}>Reset Password</button>
                      <button onClick={() => clearCache(u.username)} className={btnGhost}>Clear Cache</button>
                      <button onClick={() => resolveUser(u.username)} className={btnGhost}>Re-resolve Tickers</button>
                      <button onClick={() => clearBio(u.username)} className={btnGhost}>Clear Bio</button>
                      <button onClick={() => exportUser(u.username)} className={btnGhost}>Export Data</button>
                      {u.publicInventory && <button onClick={() => setPrivacy(u.username, 'publicInventory', false)} className={btnGhost}>Make CS Private</button>}
                      {u.publicHoldings && <button onClick={() => setPrivacy(u.username, 'publicHoldings', false)} className={btnGhost}>Make Stocks Private</button>}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* TICKER FAILURES */}
            {tab === 'tickers' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className={`text-sm text-zinc-400`}>{failures.length} unique unresolved tickers</p>
                  <button onClick={fetchFailures} className={btnGhost}>↺ Refresh</button>
                </div>
                {failures.length === 0 ? (
                  <div className={`${card} p-10 text-center`}>
                    <p className="text-3xl mb-3">✅</p>
                    <p className="font-semibold">No ticker failures</p>
                    <p className={`text-sm mt-1 text-zinc-400`}>All tickers resolved successfully.</p>
                  </div>
                ) : (
                  <div className={`${card} overflow-hidden`}>
                    <table className="w-full text-sm">
                      <thead className={`bg-zinc-900 border-zinc-700 border-b`}>
                        <tr>
                          {['Raw Ticker', 'ISIN', 'Name', 'Count', 'Users'].map(h => (
                            <th key={h} className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-400`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {failures.map((f, i) => (
                          <tr key={i} className={`border-t border-zinc-700 hover:bg-zinc-700/20`}>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-red-400">{f.key || '—'}</td>
                            <td className={`px-4 py-3 text-xs font-mono text-zinc-400`}>{f.isin || '—'}</td>
                            <td className={`px-4 py-3 text-xs text-zinc-300 max-w-xs truncate`}>{f.name || '—'}</td>
                            <td className="px-4 py-3 text-xs font-bold">{f.count}</td>
                            <td className={`px-4 py-3 text-xs text-zinc-400`}>{f.users.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* GLOBAL OVERRIDES */}
            {tab === 'global-overrides' && (
              <div className="flex flex-col gap-4">
                <div className={`${card} p-5`}>
                  <p className={`text-sm mb-4 text-zinc-300`}>
                    Global overrides apply to <strong>all users</strong> and take priority over per-user overrides. Use this to pin commonly misresolved ISINs to the correct Yahoo Finance ticker.
                  </p>
                  <div className="flex gap-2 mb-3">
                    <input value={goIsin} onChange={e => setGoIsin(e.target.value)} placeholder="ISIN (e.g. SE0025138357)" className={`${inputCls} flex-1`} />
                    <input value={goTicker} onChange={e => setGoTicker(e.target.value)} placeholder="YF ticker (e.g. HACK.ST)" className={`${inputCls} flex-1`} />
                    <button onClick={saveGlobalOverride} className={btnBlue}>Save</button>
                  </div>
                  {goMsg && <p className={`text-xs mb-3 ${goMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{goMsg}</p>}
                  {goLoading ? (
                    <div className="flex items-center gap-3 py-6 justify-center">
                      <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                      <span className={`text-sm text-zinc-400`}>Loading overrides…</span>
                    </div>
                  ) : globalOverrides.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      <input
                        value={goSearch}
                        onChange={e => setGoSearch(e.target.value)}
                        placeholder="Search ISIN, ticker or added by…"
                        className={inputCls}
                      />
                      <div className={`rounded-xl overflow-hidden border border-zinc-700`}>
                        <table className="w-full text-sm">
                          <thead className={`bg-zinc-900 border-zinc-700 border-b`}>
                            <tr>
                              {['ISIN', 'Ticker', 'Name', 'Added by', 'Status', ''].map(col => (
                                <th key={col} className={`px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-400`}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {globalOverrides.filter(o => {
                              const q = goSearch.toLowerCase();
                              return o.isin.toLowerCase().includes(q) ||
                                o.ticker.toLowerCase().includes(q) ||
                                (o.name||'').toLowerCase().includes(q) ||
                                (o.created_by||'').toLowerCase().includes(q);
                            }).map(o => (
                              <tr key={o.isin} className={`border-t border-zinc-700 hover:bg-zinc-700/20`}>
                                <td className={`px-4 py-2.5 font-mono text-xs text-white ${!o.active ? 'opacity-50' : ''}`}>{o.isin}</td>
                                <td className={`px-4 py-2.5 font-mono text-xs font-bold text-white ${!o.active ? 'opacity-50' : ''}`}>{o.ticker}</td>
                                <td className={`px-4 py-2.5 text-xs text-white ${!o.active ? 'opacity-50' : ''}`}>{o.name || <span className="text-zinc-400">—</span>}</td>
                                <td className={`px-4 py-2.5 text-xs text-white ${!o.active ? 'opacity-50' : ''}`}>{o.created_by}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${o.active ? 'bg-green-900/40 text-green-400' : 'bg-zinc-700/40 text-zinc-400'}`}>
                                    {o.active ? 'Active' : 'Disabled'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button onClick={() => toggleGlobalOverride(o.isin)} className={`text-xs font-medium transition ${o.active ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'}`}>
                                      {o.active ? 'Disable' : 'Enable'}
                                    </button>
                                    <button onClick={() => deleteGlobalOverride(o.isin)} className="text-red-400 hover:text-red-300 text-xs font-medium transition">Remove</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className={`text-sm text-zinc-400`}>No global overrides saved yet.</p>
                  )}
                  {globalOverrides.length > 0 && (
                    <button onClick={() => { setClearAllModal(true); setClearAllPw(''); setClearAllError(''); }} className={`mt-4 ${btnRed}`}>
                      Clear all global overrides
                    </button>
                  )}
                </div>

                {/* Password confirmation modal */}
                {clearAllModal && (
                  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className={`${card} p-6 w-full max-w-sm mx-4`}>
                      <h3 className="font-bold text-lg mb-2">Confirm deletion</h3>
                      <p className={`text-sm mb-4 text-zinc-300`}>
                        This will delete all global ticker overrides for every user. Enter your password to confirm.
                      </p>
                      <input type="password" value={clearAllPw} onChange={e => setClearAllPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && clearAllGlobalOverrides()} placeholder="Your password" className={`${inputCls} mb-3`} autoFocus />
                      {clearAllError && <p className="text-xs text-red-400 mb-3">{clearAllError}</p>}
                      <div className="flex gap-2">
                        <button onClick={clearAllGlobalOverrides} className={`flex-1 ${btnRed}`}>Delete all</button>
                        <button onClick={() => setClearAllModal(false)} className={`flex-1 ${btnGhost}`}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                {removeModal && (
                  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className={`${card} p-6 w-full max-w-sm mx-4`}>
                      <h3 className="font-bold text-lg mb-2">Confirm removal</h3>
                      <p className={`text-sm mb-1 text-zinc-400`}>
                        Remove global override for <span className="font-mono font-bold">{removeModal}</span>?
                      </p>
                      <p className={`text-sm mb-4 text-zinc-300`}>Enter your password to confirm.</p>
                      <input type="password" value={removePw} onChange={e => setRemovePw(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmDeleteGlobalOverride()} placeholder="Your password" className={`${inputCls} mb-3`} autoFocus />
                      {removeError && <p className="text-xs text-red-400 mb-3">{removeError}</p>}
                      <div className="flex gap-2">
                        <button onClick={confirmDeleteGlobalOverride} className={`flex-1 ${btnRed}`}>Remove</button>
                        <button onClick={() => setRemoveModal(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ROLES */}
            {tab === 'roles' && stats && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <input value={roleSearch} onChange={e => setRoleSearch(e.target.value)} placeholder="Search users…" className={`${inputCls} flex-1`} />
                </div>
                <p className={`text-sm text-zinc-400`}>
                  Promote users to moderator or demote them back.
                  {authUsername?.toLowerCase() === 'admin' && <span className="ml-1">As the root admin you can also grant or revoke admin access.</span>}
                </p>
                {[...stats.users]
                  .filter(u => !roleSearch || u.username.toLowerCase().includes(roleSearch.toLowerCase()))
                  .sort((a, b) => a.username.localeCompare(b.username))
                  .map(u => {
                  const role = u.role || 'user';
                  const roleBadge = { admin: 'bg-red-900/40 text-red-400 border border-red-800', moderator: 'bg-blue-900/40 text-blue-400 border border-blue-800', user: `bg-zinc-700 text-zinc-400` };
                  const isRootAdmin = u.username === 'admin';
                  const isSelf = u.username === authUsername;

                  const setAdminRole = async (newRole) => {
                    const res = await fetch(`/api/admin/users/${u.username}/set-role-admin`, { method: 'POST', headers: h, body: JSON.stringify({ role: newRole }) });
                    const data = await res.json();
                    if (data.success) { flash(`✓ ${u.username} is now ${newRole}`); fetchStats(); }
                    else flash('Error: ' + data.error);
                  };

                  return (
                    <div key={u.username} className={`${card} p-4 flex items-center gap-4`}>
                      <div className="w-10 h-10 rounded-full bg-zinc-600 flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
                        {u.avatarBase64 ? <img src={u.avatarBase64} className="w-full h-full object-cover" alt={u.username}/> : u.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold">{u.username}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${roleBadge[role]}`}>{role.charAt(0).toUpperCase() + role.slice(1)}</span>
                        </div>
                        <p className={`text-xs text-zinc-400`}>Joined {new Date(u.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {/* Mod promote/demote — visible to all admins, not for root admin account */}
                        {!isRootAdmin && role !== 'admin' && (
                          role !== 'moderator'
                            ? <button onClick={() => setRole(u.username, 'moderator')} className={btnBlue}>Promote to Mod</button>
                            : <button onClick={() => setRole(u.username, 'user')} className={btnGhost}>Demote to User</button>
                        )}
                        {/* Admin promote/demote — only visible to the root "admin" account */}
                        {authUsername?.toLowerCase() === 'admin' && !isRootAdmin && !isSelf && (
                          role !== 'admin'
                            ? <button onClick={() => setAdminRole('admin')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition bg-red-700 hover:bg-red-600 text-white`}>Promote to Admin</button>
                            : <button onClick={() => setAdminRole('user')} className={btnGhost}>Revoke Admin</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* DATABASE */}
            {tab === 'database' && (
              <div className="flex gap-4 items-start">
                {/* Sidebar — table list */}
                <div className="w-52 shrink-0">
                  <div className={`${card} overflow-hidden`}>
                    <div className="px-4 py-2.5 border-b border-zinc-700">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Tables</p>
                    </div>
                    {dbTablesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-700/40">
                        {dbTables.map(t => (
                          <button
                            key={t.table}
                            onClick={() => { setSelectedTable(t.table); setTablePage(0); setTableData(null); fetchTableData(t.table, 0); }}
                            className={`w-full flex items-center justify-between px-4 py-2 text-left transition ${selectedTable === t.table ? 'bg-zinc-700/70 text-white' : 'text-zinc-400 hover:bg-zinc-700/30 hover:text-zinc-200'}`}
                          >
                            <span className="font-mono text-xs truncate">{t.table}</span>
                            <span className={`text-xs ml-2 shrink-0 tabular-nums ${selectedTable === t.table ? 'text-zinc-300' : 'text-zinc-600'}`}>
                              {t.rows === null ? '—' : t.rows.toLocaleString()}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Content panel */}
                <div className="flex-1 min-w-0">
                  {!selectedTable ? (
                    <div className={`${card} flex items-center justify-center py-24`}>
                      <p className="text-sm text-zinc-600">Select a table</p>
                    </div>
                  ) : (
                    <div className={`${card} overflow-hidden`}>
                      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
                        <span className="font-mono text-sm font-bold">{selectedTable}</span>
                        <div className="flex items-center gap-3">
                          {tableData && (
                            <span className="text-xs text-zinc-400">
                              {tableData.page * tableData.limit + 1}–{Math.min((tableData.page + 1) * tableData.limit, tableData.total)} of {tableData.total.toLocaleString()} rows
                            </span>
                          )}
                          <button onClick={() => fetchTableData(selectedTable, tablePage)} className={btnGhost}>↺</button>
                        </div>
                      </div>
                      {tableLoading ? (
                        <div className="flex items-center gap-3 py-12 justify-center">
                          <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                        </div>
                      ) : tableData?.rows?.length > 0 ? (
                        <>
                          <div
                            ref={tableScrollRef}
                            className="overflow-x-auto pb-3"
                            style={{ overscrollBehaviorX: 'contain' }}
                          >
                            <table className="w-full text-xs">
                              <thead className="bg-zinc-900 border-b border-zinc-700 sticky top-0 z-10">
                                <tr>
                                  {Object.keys(tableData.rows[0]).map(col => (
                                    <th key={col} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap bg-zinc-900">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {tableData.rows.map((row, i) => (
                                  <tr key={i} className="border-t border-zinc-700/60 hover:bg-zinc-700/20">
                                    {Object.values(row).map((val, j) => (
                                      <td key={j} className="px-3 py-2 text-zinc-100 max-w-xs whitespace-nowrap overflow-hidden text-ellipsis font-mono">
                                        {val === null ? <span className="text-zinc-600">null</span> : val === true ? <span className="text-green-400">true</span> : val === false ? <span className="text-red-400">false</span> : String(val).length > 80 ? String(val).slice(0, 80) + '…' : String(val)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {tableData.total > tableData.limit && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-700">
                              <button disabled={tablePage === 0} onClick={() => { const p = tablePage - 1; setTablePage(p); fetchTableData(selectedTable, p); }} className={`${btnGhost} disabled:opacity-40`}>← Prev</button>
                              <span className="text-xs text-zinc-400">Page {tablePage + 1} of {Math.ceil(tableData.total / tableData.limit)}</span>
                              <button disabled={(tablePage + 1) * tableData.limit >= tableData.total} onClick={() => { const p = tablePage + 1; setTablePage(p); fetchTableData(selectedTable, p); }} className={`${btnGhost} disabled:opacity-40`}>Next →</button>
                            </div>
                          )}
                        </>
                      ) : tableData?.rows?.length === 0 ? (
                        <p className="px-4 py-8 text-sm text-zinc-500 text-center">Table is empty.</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DIAGNOSTICS */}
            {tab === 'diagnostics' && (
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <p className={`text-sm text-zinc-400`}>Live connectivity test against market data APIs.</p>
                  <button onClick={fetchDiag} disabled={diagLoading} className={`${btnGhost} disabled:opacity-50`}>
                    {diagLoading ? '⏳ Running...' : '↺ Run Test'}
                  </button>
                </div>

                {diagLoading && !diagData ? (
                  <div className="flex items-center gap-3 py-12 justify-center">
                    <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                    <span className={`text-sm text-zinc-400`}>Running diagnostics…</span>
                  </div>
                ) : diagData?.error ? (
                  <div className={`${card} p-5 text-sm text-red-400`}>{diagData.error}</div>
                ) : diagData ? (
                  <>
                    <div className={`${card} p-5`}>
                      <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>API Keys</h2>
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: 'Finnhub', ok: diagData.finnhubKeySet, statusText: diagData.finnhubKeySet ? 'Configured' : 'Missing' },
                          { label: 'Tiingo', ok: diagData.tiingoKeySet, statusText: diagData.tiingoKeySet ? 'Configured' : 'Missing' },
                          { label: 'Yahoo Finance', ok: diagData.yahooProbe?.status === 200, statusText: diagData.yahooProbe?.status === 200 ? 'Reachable' : diagData.yahooProbe ? 'Unreachable' : '—' },
                        ].map(({ label, ok, statusText }) => (
                          <div key={label} className="bg-zinc-700 rounded-lg p-3 flex items-center gap-3">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ok ? 'bg-green-400' : 'bg-red-400'}`}/>
                            <span className="text-sm font-semibold">{label}</span>
                            <span className={`text-xs ml-auto ${ok ? 'text-green-400' : 'text-red-400'}`}>{statusText}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`${card} p-5`}>
                      <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Connectivity</h2>
                      <div className="flex flex-col gap-3">
                        {[
                          { label: 'US Market', subtitle: 'Finnhub', results: diagData.us },
                          { label: 'Nordic Market', subtitle: 'Yahoo Finance', results: diagData.nordic },
                        ].map(({ label, subtitle, results }) => {
                          const okCount = results.filter(r => r.ok).length;
                          const allOk = okCount === results.length;
                          const anyOk = okCount > 0;
                          return (
                            <div key={label} className="bg-zinc-700/50 rounded-xl p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${allOk ? 'bg-green-400' : anyOk ? 'bg-yellow-400' : 'bg-red-400'}`}/>
                                <p className="text-sm font-semibold">{label}</p>
                                <span className={`text-xs text-zinc-400`}>{subtitle}</span>
                                <span className={`text-xs ml-auto font-semibold ${allOk ? 'text-green-400' : anyOk ? 'text-yellow-400' : 'text-red-400'}`}>
                                  {okCount}/{results.length} OK
                                </span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {results.map(r => (
                                  <div key={r.symbol} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/60">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.ok ? 'bg-green-400' : 'bg-red-400'}`}/>
                                    <span className="font-mono text-xs text-zinc-300">{r.symbol}</span>
                                    {r.ok
                                      ? <span className="text-xs text-green-400 ml-auto">${r.price?.toFixed(2)}</span>
                                      : <span className="text-xs text-red-400 ml-auto">{r.error || 'Failed'}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {[
                      { label: 'Finnhub Raw Probe', hint: 'AAPL', probe: diagData.finnhubProbe },
                      { label: 'Yahoo Finance Raw Probe', hint: 'VOLV-B.ST', probe: diagData.yahooProbe },
                    ].filter(p => p.probe).map(({ label, hint, probe }) => (
                      <div key={label} className={`${card} p-5`}>
                        <h2 className="text-xs font-bold uppercase tracking-wider mb-3 text-zinc-400">{label} <span className="text-zinc-600 normal-case font-normal">({hint})</span></h2>
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`text-xs font-mono font-bold ${probe.status === 200 ? 'text-green-400' : 'text-red-400'}`}>
                            HTTP {probe.status ?? 'error'}
                          </span>
                          {probe.error && <span className="text-xs text-red-400">{probe.error}</span>}
                        </div>
                        {probe.body && (
                          <pre className="text-xs font-mono text-zinc-400 bg-zinc-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{probe.body}</pre>
                        )}
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            )}

            {/* ANNOUNCEMENTS */}
            {tab === 'announcements' && (
              <div className="flex flex-col gap-5">
                {/* Post new */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Post Announcement</h2>
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
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Active Announcements ({announcements.length})</h2>
                  {announcements.length === 0 ? (
                    <p className={`text-sm text-zinc-400`}>No announcements posted.</p>
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