import { useState, useEffect, useCallback, useRef } from 'react';
import { getToken } from './tokenStore';
import { useLocation } from 'react-router-dom';
import apiCache from './apiCache';
import { flash } from './flash';
import { card, input, btnPrimarySm, btnSecondarySm, btnDangerSm, btnConfirmSm, contentColumn } from './ui';
import { IconX, IconRefresh } from './icons';
import ModLog from './ModLog';

const TAB_MAP = {
  '': 'overview', 'overview': 'overview', 'database': 'database',
  'users': 'users',
  'announcements': 'announcements',
  'log': 'log',
};

export default function AdminPanel({ authUsername }) {
  const { pathname } = useLocation();
  const tab = TAB_MAP[pathname.replace(/^\/adminpanel\/?/, '')] ?? 'overview';
  const [stats, setStats] = useState(() => apiCache.get('/api/admin/stats'));
  const [announcements, setAnnouncements] = useState(() => apiCache.get('/api/announcements') || []);
  const [loading, setLoading] = useState(!apiCache.has('/api/admin/stats'));
  const [emailTemplates, setEmailTemplates] = useState([]);
  useEffect(() => {
    const tok = getToken();
    fetch('/api/admin/email-templates', { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : []).then(list => Array.isArray(list) && setEmailTemplates(list)).catch(() => {});
  }, []);
  const previewEmail = async (type) => {
    const res = await fetch(`/api/admin/preview-email?type=${encodeURIComponent(type)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) { flash(`✗ Email preview failed (${res.status})`); return; }
    const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // User accordion + inline editing
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [editingEmailFor, setEditingEmailFor] = useState(null);
  const [inlineEmailVal, setInlineEmailVal] = useState('');
  const [inlineEmailStatus, setInlineEmailStatus] = useState('');
  const [settingPasswordFor, setSettingPasswordFor] = useState(null);
  const [inlinePasswordVal, setInlinePasswordVal] = useState('');
  const [showInlinePassword, setShowInlinePassword] = useState(false);
  const [inlinePasswordStatus, setInlinePasswordStatus] = useState('');
  const [sendingResetFor, setSendingResetFor] = useState({});
  const [deleteModal, setDeleteModal] = useState(null); // username
  const [deletePw, setDeletePw] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [annForm, setAnnForm] = useState({ title: '', message: '', type: 'info' });
  const [settings, setSettings] = useState({ allowRegistration: true, userLimit: 0 });
  const [userLimitInput, setUserLimitInput] = useState('0');

  const [userSearch, setUserSearch] = useState('');

  // Database storage
  const [dbSize, setDbSize] = useState(null);
  const [dbSizeLoading, setDbSizeLoading] = useState(false);

  // Database browser
  const [dbTables, setDbTables] = useState([]);
  const [dbTablesLoading, setDbTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const [tableUserFilter, setTableUserFilter] = useState('');
  const [tableProfiles, setTableProfiles] = useState(null);
  const tableScrollRef = useRef(null);

  const token = getToken();
  const h = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };

  const fetchStats = useCallback(async () => {
    if (!apiCache.has('/api/admin/stats')) setLoading(true);
    try {
      const token = getToken();
      const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
      const [statsRes, annRes, settingsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }).then(r => r.json()),
        fetch('/api/announcements', { headers }).then(r => r.json()),
        fetch('/api/admin/settings', { headers }).then(r => r.json()),
      ]);
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

  useEffect(() => { fetchStats(); fetchDbSize(); }, []);
  useEffect(() => { if (tab === 'database') { fetchDbTables(); fetchDbSize(); } }, [tab]);

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

  const setPasswordInline = async (username) => {
    if (!inlinePasswordVal || inlinePasswordVal.length < 6) { setInlinePasswordStatus('Must be 6+ characters.'); return; }
    setInlinePasswordStatus('Saving...');
    const res = await fetch(`/api/admin/users/${username}/reset-password`, { method: 'POST', headers: h, body: JSON.stringify({ newPassword: inlinePasswordVal }) });
    const data = await res.json();
    if (data.success) { setSettingPasswordFor(null); setInlinePasswordVal(''); setInlinePasswordStatus(''); flash(`✓ Password updated for ${username}`); }
    else setInlinePasswordStatus(`Error: ${data.error}`);
  };

  const sendResetLinkInline = async (username) => {
    setSendingResetFor(s => ({ ...s, [username]: 'sending' }));
    const res = await fetch(`/api/admin/users/${username}/send-reset-email`, { method: 'POST', headers: h });
    const data = await res.json();
    setSendingResetFor(s => ({ ...s, [username]: data.success ? 'sent' : 'error' }));
  };

  const saveInlineEmail = async (username) => {
    const trimmed = inlineEmailVal.trim().toLowerCase();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setInlineEmailStatus('Invalid email format.'); return; }
    setInlineEmailStatus('Saving...');
    const res = await fetch(`/api/admin/users/${username}/set-email`, { method: 'POST', headers: h, body: JSON.stringify({ email: trimmed }) });
    const data = await res.json();
    if (data.success) {
      if (stats) setStats(s => ({ ...s, users: s.users.map(u => u.username === username
        ? trimmed
          ? { ...u, pendingEmail: { email: trimmed } }
          : { ...u, email: null, emailVerified: false, pendingEmail: null }
        : u) }));
      setEditingEmailFor(null);
      setInlineEmailStatus('');
      flash(data.emailSent ? `✓ Email set — verification link sent to ${trimmed}` : `✓ Email updated for ${username}`);
    } else {
      setInlineEmailStatus(`Error: ${data.error}`);
    }
  };

  const clearBio = async (username) => {
    await fetch(`/api/admin/users/${username}/clear-bio`, { method: 'POST', headers: h });
    flash(`✓ Bio cleared for ${username}`);
    fetchStats();
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
    const tok = getToken();
    const authH = { 'Content-Type': 'application/json', ...(tok ? { 'Authorization': `Bearer ${tok}` } : {}) };
    const res = await fetch('/api/admin/settings', { method: 'POST', headers: authH, body: JSON.stringify({ key: 'allowRegistration', value: String(newVal) }) });
    const data = await res.json();
    if (!res.ok) {
      setSettings(s => ({ ...s, allowRegistration: !newVal })); // revert
      flash(`Error: ${data.error}`);
    } else {
      window.dispatchEvent(new CustomEvent('settings-changed', { detail: { allowRegistration: newVal } }));
      localStorage.setItem('verumen_allowRegistration', String(newVal));
      flash(`✓ Registration ${newVal ? 'enabled' : 'disabled'}`);
    }
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

  const setAdminRole = async (username, role) => {
    const res = await fetch(`/api/admin/users/${username}/set-role-admin`, { method: 'POST', headers: h, body: JSON.stringify({ role }) });
    const data = await res.json();
    if (data.success) { flash(`✓ ${username} is now ${role}`); fetchStats(); }
    else flash('Error: ' + data.error);
  };

  const formatUptime = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
  };


  const fetchDbSize = useCallback(async () => {
    setDbSizeLoading(true);
    try {
      const tok = getToken();
      const headers = { 'Content-Type': 'application/json', ...(tok ? { 'Authorization': `Bearer ${tok}` } : {}) };
      const res = await fetch('/api/admin/db/size', { headers });
      const data = await res.json();
      if (!data.error) setDbSize(data);
    } catch(e) {}
    setDbSizeLoading(false);
  }, []);

  const fetchDbTables = useCallback(async () => {
    setDbTablesLoading(true);
    const res = await fetch('/api/admin/db/tables', { headers: h });
    const data = await res.json();
    setDbTablesLoading(false);
    if (Array.isArray(data)) setDbTables(data);
  }, []);

  const fetchTableData = useCallback(async (name, page = 0, userId = '') => {
    setTableLoading(true);
    const tok = getToken();
    const headers = { 'Content-Type': 'application/json', ...(tok ? { 'Authorization': `Bearer ${tok}` } : {}) };
    const params = new URLSearchParams({ page: String(page) });
    if (userId) { params.set('filter_col', 'user_id'); params.set('filter_val', userId); }
    const res = await fetch(`/api/admin/db/table/${name}?${params}`, { headers });
    const data = await res.json();
    setTableLoading(false);
    if (!data.error) {
      setTableData(data);
      // Auto-load profiles for user filter dropdown when table has user_id column
      if (data.rows?.length && Object.keys(data.rows[0]).includes('user_id')) {
        setTableProfiles(p => {
          if (p) return p;
          const tok2 = getToken();
          const h2 = { 'Content-Type': 'application/json', ...(tok2 ? { 'Authorization': `Bearer ${tok2}` } : {}) };
          fetch('/api/admin/db/table/profiles?page=0', { headers: h2 }).then(r => r.json()).then(d => {
            if (d.rows) setTableProfiles(d.rows.map(r => ({ id: r.id, username: r.username })).filter(r => r.username));
          }).catch(() => {});
          return p; // keep null until fetch resolves
        });
      }
    }
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
            <input type="password" value={deletePw} onChange={e => setDeletePw(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmDeleteUser()} placeholder="Your password" className={`${input} mb-2`} autoFocus />
            {deleteError && <p className="text-xs text-red-400 mb-2">{deleteError}</p>}
            <div className="flex gap-2 mt-1">
              <button onClick={confirmDeleteUser} className={btnDangerSm + ' flex-1 py-2'}>Delete</button>
              <button onClick={() => setDeleteModal(null)} className={btnSecondarySm + ' flex-1 py-2'}>Cancel</button>
            </div>
          </div>
        </div>
      )}


      <div className={`${contentColumn} px-6 py-8`}>


        {loading && tab === 'overview' ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"/>
            <p className={`text-sm text-zinc-400`}>Loading admin data...</p>
          </div>
        ) : !stats && tab === 'overview' ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className={`text-sm text-zinc-400`}>Failed to load stats.</p>
            <button onClick={fetchStats} className={`${btnSecondarySm} inline-flex items-center gap-1.5`}><IconRefresh size={12} />Try again</button>
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {tab === 'overview' && stats && (
              <div className="flex flex-col gap-5">
                {/* System stats */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>System</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
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
                  {dbSize && (() => {
                    const FREE_TIER_BYTES = 500 * 1024 * 1024;
                    const usedPct = Math.min(100, (dbSize.dbSizeBytes / FREE_TIER_BYTES) * 100);
                    const barColor = usedPct > 80 ? 'bg-red-500' : usedPct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs text-zinc-400">Database Storage</p>
                          <span className="text-xs text-zinc-400"><span className="text-white font-semibold">{dbSize.dbSizePretty}</span> of 500 MB</span>
                        </div>
                        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${usedPct}%` }}/>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Registration toggle */}
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-xs font-bold uppercase tracking-wider text-zinc-400`}>Registration</h2>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className={`flex items-center justify-between gap-4 p-4 rounded-xl bg-zinc-700/50`}>
                      <div>
                        <p className="text-sm font-semibold">Allow new registrations</p>
                        <p className={`text-xs mt-0.5 text-zinc-400`}>When disabled, the sign up form is hidden and new accounts cannot be created.</p>
                      </div>
                      <button type="button" onClick={toggleRegistration}
                        className={`relative inline-flex items-center h-6 rounded-full transition-colors shrink-0 ${settings.allowRegistration ? 'bg-emerald-500' : 'bg-zinc-700'}`}
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
                        <button onClick={saveUserLimit} className={btnConfirmSm}>Save</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* User totals */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Totals</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Users', value: stats.totals.userCount },
                      { label: 'Registered Trades', value: (stats.totals.totalTrades ?? 0).toLocaleString() },
                    ].map(({ label, value }) => (
                      <div key={label} className={`bg-zinc-700 rounded-lg p-3`}>
                        <p className={`text-xs text-zinc-400 mb-1`}>{label}</p>
                        <p className="font-bold text-2xl">{value}</p>
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
                          <button onClick={() => deleteAnnouncement(a.id)} className="opacity-60 hover:opacity-100 shrink-0 transition" aria-label="Remove"><IconX size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email previews — rendered from the same templates the server sends */}
                <div className={`${card} p-5`}>
                  <h2 className="text-xs font-bold uppercase tracking-wider mb-1 text-zinc-400">Email Previews</h2>
                  <p className="text-xs text-zinc-500 mb-4">Opens each email exactly as users receive it, filled with sample values.</p>
                  <div className="flex gap-2 flex-wrap">
                    {emailTemplates.map(({ type, label }) => (
                      <button key={type} className={btnSecondarySm} onClick={() => previewEmail(type)}>{label}</button>
                    ))}
                    {emailTemplates.length === 0 && <p className="text-xs text-zinc-500">Loading…</p>}
                  </div>
                </div>
              </div>
            )}

            {/* USERS */}
            {tab === 'users' && stats && (
              <div className="flex flex-col gap-3 max-w-2xl mx-auto">
                <div className="flex items-center gap-3">
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users…" className={`${input} flex-1`} />
                  <p className={`text-sm shrink-0 text-zinc-400`}>{stats.users.length} user(s)</p>
                  <button onClick={fetchStats} className={`${btnSecondarySm} shrink-0 inline-flex items-center gap-1.5`}><IconRefresh size={12} />Refresh</button>
                </div>
                {[...stats.users]
                  .filter(u => !userSearch || u.username.toLowerCase().includes(userSearch.toLowerCase()))
                  .sort((a, b) => a.username.localeCompare(b.username))
                  .map(u => {
                  const roleBadgeCls = { admin: 'bg-red-900/40 text-red-400 border border-red-800', moderator: 'bg-blue-900/40 text-blue-400 border border-blue-800' };
                  const isExpanded = expandedUsers.has(u.username);
                  // Mirrors the server rule: staff can't change each other's credentials; only the
                  // recovery account may reset the root admin's password (email stays locked).
                  const targetIsRoot = !!u.isRoot;
                  const targetIsStaff = u.role === 'admin' || u.role === 'moderator';
                  const canResetPassword = targetIsRoot ? !!stats.viewer?.isRecovery : !targetIsStaff;
                  const canEditEmail = !targetIsRoot && !targetIsStaff;
                  const protectedTag = <span className="text-xs text-zinc-500 shrink-0 px-1">You do not have permission</span>;
                  const isEditingEmail = editingEmailFor === u.username;
                  const isSettingPassword = settingPasswordFor === u.username;
                  const resetStatus = sendingResetFor[u.username];
                  const fieldBox = 'w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm';
                  const fieldLabel = 'text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5 block';
                  return (
                  <div key={u.username} className={`${card} overflow-hidden`}>
                    {/* Collapsed header row — click to toggle */}
                    <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-700/20 transition cursor-pointer" onClick={() => { setExpandedUsers(prev => { const next = new Set(prev); isExpanded ? next.delete(u.username) : next.add(u.username); return next; }); setEditingEmailFor(null); setSettingPasswordFor(null); setInlinePasswordStatus(''); setInlineEmailStatus(''); }}>
                      <div className="w-8 h-8 rounded-full bg-zinc-600 flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
                        {u.avatarBase64 ? <img src={u.avatarBase64} className="w-full h-full object-cover" alt={u.username}/> : u.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{u.username}</span>
                          {roleBadgeCls[u.role] && <span className={`text-xs px-2 py-0.5 rounded-full border ${roleBadgeCls[u.role]}`}>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>}
                          {u.hasSteam && <span className="text-xs text-orange-400 bg-orange-900/30 px-1.5 py-0.5 rounded-full border border-orange-800/50">Steam</span>}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">Joined {new Date(u.createdAt).toLocaleDateString()}</p>
                      </div>
                      <a href={`/user/${u.username}`} onClick={e => e.stopPropagation()} className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 px-2.5 py-1 rounded-lg transition shrink-0">View profile</a>
                      <svg className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-zinc-700/50 px-4 py-4 flex flex-col gap-5">

                        {/* Email field */}
                        <div>
                          <label className={fieldLabel}>Email</label>
                          {isEditingEmail ? (
                            <div className="flex gap-2">
                              <input type="email" value={inlineEmailVal} onChange={e => { setInlineEmailVal(e.target.value); setInlineEmailStatus(''); }} onKeyDown={e => { if (e.key === 'Enter') saveInlineEmail(u.username); if (e.key === 'Escape') setEditingEmailFor(null); }} placeholder="email@example.com" autoFocus className={`${fieldBox} flex-1 focus:border-zinc-500/60 focus:outline-none`}/>
                              <button onClick={() => saveInlineEmail(u.username)} disabled={inlineEmailStatus === 'Saving...'} className={`${btnConfirmSm} disabled:opacity-50`}>Send</button>
                              <button onClick={() => setEditingEmailFor(null)} className={btnSecondarySm}>Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 flex flex-col gap-2">
                                {/* Current verified email */}
                                {(!u.pendingEmail || u.email) && (
                                  <div className={`${fieldBox} flex items-center gap-2 text-zinc-300`}>
                                    {u.email ? (
                                      <>
                                        <span className="flex-1 truncate">{u.email}</span>
                                        <span className="text-emerald-400 text-xs font-semibold shrink-0">Verified</span>
                                      </>
                                    ) : (
                                      <span className="text-zinc-500 italic">No email set</span>
                                    )}
                                  </div>
                                )}
                                {/* Pending new email (only shown while verification is in-flight) */}
                                {u.pendingEmail && (
                                  <div className={`${fieldBox} flex items-center gap-2 border-amber-700/50`}>
                                    <span className="flex-1 truncate text-zinc-400">{u.pendingEmail.email}</span>
                                    <span className="text-amber-400 text-xs font-semibold shrink-0 whitespace-nowrap">Pending verification</span>
                                  </div>
                                )}
                              </div>
                              {canEditEmail
                                ? <button onClick={() => { setEditingEmailFor(u.username); setInlineEmailVal(u.email || u.pendingEmail?.email || ''); setInlineEmailStatus(''); }} className={`${btnSecondarySm} shrink-0`}>Edit</button>
                                : protectedTag}
                            </div>
                          )}
                          {inlineEmailStatus && isEditingEmail && <p className={`text-xs mt-1.5 ${inlineEmailStatus.startsWith('Error') ? 'text-red-400' : 'text-zinc-400'}`}>{inlineEmailStatus}</p>}
                        </div>

                        {/* Password field */}
                        <div>
                          <label className={fieldLabel}>Password</label>
                          {isSettingPassword ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <input type={showInlinePassword ? 'text' : 'password'} value={inlinePasswordVal} onChange={e => { setInlinePasswordVal(e.target.value); setInlinePasswordStatus(''); }} onKeyDown={e => { if (e.key === 'Enter') setPasswordInline(u.username); if (e.key === 'Escape') { setSettingPasswordFor(null); setInlinePasswordVal(''); setInlinePasswordStatus(''); }}} placeholder="New password (6+ chars)" autoFocus className={`${fieldBox} pr-10 focus:border-zinc-500/60 focus:outline-none`}/>
                                  <button type="button" onClick={() => setShowInlinePassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition">
                                    {showInlinePassword
                                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                                  </button>
                                </div>
                                <button onClick={() => setPasswordInline(u.username)} disabled={inlinePasswordStatus === 'Saving...'} className={`${btnConfirmSm} disabled:opacity-50`}>Set</button>
                                <button onClick={() => { setSettingPasswordFor(null); setInlinePasswordVal(''); setInlinePasswordStatus(''); }} className={btnSecondarySm}>Cancel</button>
                              </div>
                              {inlinePasswordStatus && <p className={`text-xs ${inlinePasswordStatus.startsWith('Error') ? 'text-red-400' : 'text-zinc-400'}`}>{inlinePasswordStatus}</p>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className={`${fieldBox} flex-1 flex items-center text-zinc-500`}>
                                <span className="tracking-widest">••••••••••••</span>
                              </div>
                              {canResetPassword ? (<>
                                <button onClick={() => { setSettingPasswordFor(u.username); setInlinePasswordVal(''); setInlinePasswordStatus(''); setShowInlinePassword(false); }} className={btnConfirmSm}>Set Password</button>
                                <button onClick={() => sendResetLinkInline(u.username)} disabled={!u.email || resetStatus === 'sending' || resetStatus === 'sent'} className={`${btnSecondarySm} disabled:opacity-40`} title={!u.email ? 'No email on file' : ''}>
                                  {resetStatus === 'sending' ? 'Sending…' : resetStatus === 'sent' ? 'Sent' : resetStatus === 'error' ? 'Error' : 'Send Reset Link'}
                                </button>
                              </>) : protectedTag}
                            </div>
                          )}
                        </div>

                        {/* Role (left) + Actions (right) */}
                        {(() => {
                          const role = u.role || 'user';
                          const isRootAdmin = !!u.isRoot;
                          const isSelf = u.username === authUsername;
                          const viewerIsRoot = !!stats.viewer?.isRoot;
                          const isStaff = role === 'admin' || role === 'moderator';
                          const badgeCls = roleBadgeCls[role] || 'bg-zinc-700/50 text-zinc-300 border border-zinc-600';
                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                              <div>
                                <label className={fieldLabel}>Role</label>
                                <div className="flex gap-2 flex-wrap items-center">
                                  <span className={`text-xs px-2.5 py-1 rounded-full ${badgeCls}`}>{role.charAt(0).toUpperCase() + role.slice(1)}</span>
                                  {!isRootAdmin && role !== 'admin' && (
                                    role !== 'moderator'
                                      ? <button onClick={() => setRole(u.username, 'moderator')} className={btnPrimarySm}>Promote to Mod</button>
                                      : <button onClick={() => setRole(u.username, 'user')} className={btnSecondarySm}>Demote to User</button>
                                  )}
                                  {viewerIsRoot && !isRootAdmin && !isSelf && (
                                    role !== 'admin'
                                      ? <button onClick={() => setAdminRole(u.username, 'admin')} className={btnDangerSm}>Promote to Admin</button>
                                      : <button onClick={() => setAdminRole(u.username, 'user')} className={btnSecondarySm}>Revoke Admin</button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className={fieldLabel}>Actions</label>
                                <div className="flex gap-2 flex-wrap">
                                  <button onClick={() => clearBio(u.username)} className={btnSecondarySm}>Clear Bio</button>
                                  {!isRootAdmin && !isSelf && (viewerIsRoot || !isStaff) && <button onClick={() => deleteUser(u.username)} className={btnDangerSm}>Delete User</button>}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* DATABASE */}
            {tab === 'database' && (
              <div className="flex flex-col gap-4">

              <div className="flex gap-4 items-start">
                {/* Sidebar — table list + storage summary */}
                <div className="w-64 shrink-0 flex flex-col gap-4">

                  {/* Compact storage summary — clickable */}
                  <button
                    onClick={() => { setSelectedTable('__storage__'); setTableData(null); }}
                    className={`${card} w-full text-left transition ${selectedTable === '__storage__' ? 'ring-1 ring-zinc-500/50' : 'hover:border-zinc-600'}`}
                  >
                    <div className="px-4 py-2.5 border-b border-zinc-700 flex items-center justify-between">
                      <p className={`text-xs font-bold uppercase tracking-wider ${selectedTable === '__storage__' ? 'text-zinc-200' : 'text-zinc-400'}`}>Storage</p>
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); fetchDbSize(); }}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                      >Refresh</span>
                    </div>
                    {dbSizeLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                      </div>
                    ) : dbSize ? (() => {
                      const FREE_TIER_BYTES = 500 * 1024 * 1024;
                      const usedPct = Math.min(100, (dbSize.dbSizeBytes / FREE_TIER_BYTES) * 100);
                      const barColor = usedPct > 80 ? 'bg-red-500' : usedPct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
                      return (
                        <div className="px-4 py-3">
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-lg font-bold text-white">{dbSize.dbSizePretty}</span>
                            <span className="text-xs text-zinc-500">/ 500 MB</span>
                          </div>
                          <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${usedPct}%` }}/>
                          </div>
                        </div>
                      );
                    })() : (
                      <p className="px-4 py-3 text-xs text-zinc-500">Storage stats unavailable.</p>
                    )}
                  </button>

                  {/* Table list */}
                  <div className={`${card} overflow-hidden`}>
                    <div className="px-4 py-2.5 border-b border-zinc-700">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Tables</p>
                    </div>
                    {dbTablesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                      </div>
                    ) : (() => {
                      const sizeMap = {};
                      (dbSize?.tables || []).forEach(t => { sizeMap[t.name] = t.size; });
                      return (
                        <div className="divide-y divide-zinc-700/40">
                          {dbTables.map(t => (
                            <button
                              key={t.table}
                              onClick={() => { setSelectedTable(t.table); setTablePage(0); setTableData(null); setTableUserFilter(''); fetchTableData(t.table, 0, ''); }}
                              className={`w-full flex items-center justify-between px-4 py-2 text-left transition ${selectedTable === t.table ? 'bg-zinc-700/70 text-white' : 'text-zinc-300 hover:bg-zinc-700/30 hover:text-white'}`}
                            >
                              <span className="font-mono text-xs truncate">{t.table}</span>
                              <div className="flex flex-col items-end ml-2 shrink-0">
                                <span className={`text-xs tabular-nums ${selectedTable === t.table ? 'text-zinc-200' : 'text-zinc-400'}`}>
                                  {t.rows === null ? '—' : t.rows.toLocaleString()} rows
                                </span>
                                {sizeMap[t.table] && (
                                  <span className="text-xs text-zinc-400 tabular-nums">{sizeMap[t.table]}</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Content panel */}
                <div className="flex-1 min-w-0">
                  {!selectedTable ? (
                    <div className={`${card} flex items-center justify-center py-24`}>
                      <p className="text-sm text-zinc-500">Select a table</p>
                    </div>
                  ) : selectedTable === '__storage__' ? (
                    <div className={`${card} overflow-hidden`}>
                      <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
                        <span className="text-sm font-bold text-white">Storage breakdown</span>
                        {dbSize && (() => {
                          const FREE_TIER_BYTES = 500 * 1024 * 1024;
                          const usedPct = Math.min(100, (dbSize.dbSizeBytes / FREE_TIER_BYTES) * 100);
                          const barColor = usedPct > 80 ? 'bg-red-500' : usedPct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
                          return (
                            <div className="flex items-center gap-3">
                              <div className="w-32 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                <div className={`h-full ${barColor} rounded-full`} style={{ width: `${usedPct}%` }}/>
                              </div>
                              <span className="text-xs text-zinc-300"><span className="text-white font-semibold">{dbSize.dbSizePretty}</span> / 500 MB</span>
                            </div>
                          );
                        })()}
                      </div>
                      {dbSize?.tables?.length > 0 ? (() => {
                        const parseBytes = s => {
                          if (!s) return 0;
                          const [n, u] = s.trim().split(' ');
                          const v = parseFloat(n);
                          if (u === 'kB') return v * 1024;
                          if (u === 'MB') return v * 1024 * 1024;
                          if (u === 'GB') return v * 1024 * 1024 * 1024;
                          return v;
                        };
                        const maxBytes = Math.max(...dbSize.tables.map(t => parseBytes(t.size)), 1);
                        return (
                          <div className="divide-y divide-zinc-700/40">
                            {dbSize.tables.map(t => {
                              const pct = Math.min(100, (parseBytes(t.size) / maxBytes) * 100);
                              return (
                                <div key={t.name} className="flex items-center gap-4 px-4 py-2.5 hover:bg-zinc-700/20 transition">
                                  <span className="font-mono text-xs text-zinc-200 w-48 shrink-0 truncate">{t.name}</span>
                                  <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-zinc-400/60 rounded-full" style={{ width: `${pct}%` }}/>
                                  </div>
                                  <span className="text-xs text-zinc-300 tabular-nums w-16 text-right shrink-0">{t.size}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })() : (
                        <p className="px-4 py-8 text-sm text-zinc-500 text-center">No table data available.</p>
                      )}
                    </div>
                  ) : (
                    <div className={`${card} overflow-hidden`}>
                      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Table:</span>
                          <span className="font-mono text-sm font-bold">{selectedTable}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {tableProfiles && tableData?.rows?.length > 0 && Object.keys(tableData.rows[0]).includes('user_id') && (
                            <select
                              value={tableUserFilter}
                              onChange={e => { const v = e.target.value; setTableUserFilter(v); setTablePage(0); setTableData(null); fetchTableData(selectedTable, 0, v); }}
                              className="text-xs bg-zinc-700 border border-zinc-600 text-zinc-200 rounded-lg px-2 py-1 outline-none"
                            >
                              <option value="">All users</option>
                              {tableProfiles.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                            </select>
                          )}
                          {tableData && (
                            <span className="text-xs text-zinc-400">
                              {tableData.page * tableData.limit + 1}–{Math.min((tableData.page + 1) * tableData.limit, tableData.total)} of {tableData.total.toLocaleString()} rows
                            </span>
                          )}
                          <button onClick={() => fetchTableData(selectedTable, tablePage, tableUserFilter)} className={`${btnSecondarySm} inline-flex items-center`} aria-label="Refresh"><IconRefresh size={12} /></button>
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
                              <button disabled={tablePage === 0} onClick={() => { const p = tablePage - 1; setTablePage(p); fetchTableData(selectedTable, p, tableUserFilter); }} className={`${btnSecondarySm} disabled:opacity-40`}>← Prev</button>
                              <span className="text-xs text-zinc-400">Page {tablePage + 1} of {Math.ceil(tableData.total / tableData.limit)}</span>
                              <button disabled={(tablePage + 1) * tableData.limit >= tableData.total} onClick={() => { const p = tablePage + 1; setTablePage(p); fetchTableData(selectedTable, p, tableUserFilter); }} className={`${btnSecondarySm} disabled:opacity-40`}>Next →</button>
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
              </div>
            )}

            {/* LOG */}
            {tab === 'log' && (
              <div className="flex flex-col gap-5">
                <p className="text-sm text-zinc-400">Every action taken by admins and moderators — who did it, to whom, and when.</p>
                <ModLog />
              </div>
            )}
            {/* ANNOUNCEMENTS */}
            {tab === 'announcements' && (
              <div className="flex flex-col gap-5">
                {/* Post new */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 text-zinc-400`}>Post Announcement</h2>
                  <div className="flex flex-col gap-3">
                    <input value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder="Title..." className={input} />
                    <textarea value={annForm.message} onChange={e => setAnnForm(f => ({ ...f, message: e.target.value }))} rows={3} placeholder="Message..." className={`${input} resize-none`} />
                    <div className="flex gap-3 items-center">
                      <select value={annForm.type} onChange={e => setAnnForm(f => ({ ...f, type: e.target.value }))} className={`${input} w-36`}>
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
                    <button onClick={postAnnouncement} className={btnConfirmSm + ' self-start px-5 py-2'}>Post Announcement</button>
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
                          <button onClick={() => deleteAnnouncement(a.id)} className="opacity-60 hover:opacity-100 shrink-0 hover:text-red-400 transition" aria-label="Remove"><IconX size={14} /></button>
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