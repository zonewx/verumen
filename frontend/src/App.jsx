import { useState, useEffect, useCallback, useRef } from 'react';
import CSSkins from './CSSkins';
import ProfilePage from './ProfilePage';
import GlobalBar from './GlobalBar';
import AdminPanel from './AdminPanel';

export default function App() {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('loading');
  const [authUsername, setAuthUsername] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', confirmPassword: '', newPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [homeApp, setHomeApp] = useState(null);
  const [viewProfileUser, setViewProfileUser] = useState(null);
  const [announcements, setAnnouncements] = useState([]);

  // ── Core state ─────────────────────────────────────────────────────────────
  const [portfolio, setPortfolio] = useState(() => JSON.parse(localStorage.getItem('portfolio')) || []);
  const [baseCurrency, setBaseCurrency] = useState(() => localStorage.getItem('baseCurrency') || 'SEK');
  const [dashboardData, setDashboardData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedForRemoval, setSelectedForRemoval] = useState([]);
  const [txCount, setTxCount] = useState({ total: 0, trades: 0 });
  const [dividends, setDividends] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [overrideIsin, setOverrideIsin] = useState('');
  const [overrideTicker, setOverrideTicker] = useState('');
  const [overrideMsg, setOverrideMsg] = useState('');
  const [sortCol, setSortCol] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedYear, setExpandedYear] = useState(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveStatus, setResolveStatus] = useState('');
  const [todaySortMode, setTodaySortMode] = useState('pct');
  const [todayCogOpen, setTodayCogOpen] = useState(false);
  const [ownershipData, setOwnershipData] = useState({});
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState('');
  const [ownershipSort, setOwnershipSort] = useState('value');
  const [ownershipSearch, setOwnershipSearch] = useState('');
  const [ownershipSearchResults, setOwnershipSearchResults] = useState([]);
  const [ownershipExtra, setOwnershipExtra] = useState({});
  const [perfData, setPerfData] = useState([]);
  const [perfPeriod, setPerfPeriod] = useState('3M');
  const [perfLoading, setPerfLoading] = useState(false);
  const [txHistory, setTxHistory] = useState([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState({ import: false, manage: false, settings: false });

  // ── API helper ─────────────────────────────────────────────────────────────
  const apiFetch = useCallback((url, opts = {}) => {
    return fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'X-User': authUsername, ...(opts.headers || {}) }
    });
  }, [authUsername]);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('theme', isDark ? 'dark' : 'light'); }, [isDark]);

  // ── Fetch announcements ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/announcements').then(r => r.json()).then(setAnnouncements).catch(() => {});
  }, []);

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(d => {
      if (!d.hasUsers) { setAuthStatus('no-user'); setAuthMode('signup'); }
      else {
        const saved = sessionStorage.getItem('auth_user');
        if (saved) { setAuthStatus('logged-in'); setAuthUsername(saved); }
        else setAuthStatus('logged-out');
      }
    }).catch(() => setAuthStatus('logged-out'));
  }, []);

  const handleAuth = async () => {
    setAuthError(''); setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        if (authForm.password !== authForm.confirmPassword) { setAuthError('Passwords do not match.'); setAuthLoading(false); return; }
        const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authForm.username, password: authForm.password }) });
        const data = await res.json();
        if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
        sessionStorage.setItem('auth_user', data.username);
        setAuthUsername(data.username); setAuthStatus('logged-in');
      } else {
        const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authForm.username, password: authForm.password }) });
        const data = await res.json();
        if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
        sessionStorage.setItem('auth_user', data.username);
        setAuthUsername(data.username); setAuthStatus('logged-in');
      }
    } catch { setAuthError('Connection error.'); }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('auth_user');
    setAuthStatus('logged-out'); setAuthUsername('');
    setAuthForm({ username: '', password: '', confirmPassword: '', newPassword: '' });
    setHomeApp(null); setViewProfileUser(null); setPortfolio([]); setDashboardData(null);
  };

  const handleChangePassword = async () => {
    setAuthError(''); setAuthLoading(true);
    try {
      const res = await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: authForm.password, newPassword: authForm.newPassword }) });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
      setShowChangePassword(false); setAuthForm(f => ({ ...f, password: '', newPassword: '' }));
    } catch { setAuthError('Failed.'); }
    setAuthLoading(false);
  };

  // ── Navigation handler ────────────────────────────────────────────────────
  const handleNavigate = (dest, param = null) => {
    if (dest === 'home') { setHomeApp(null); setViewProfileUser(null); }
    else if (dest === 'profile') { setHomeApp('profile'); setViewProfileUser(null); }
    else if (dest === 'view-profile') { setHomeApp('profile'); setViewProfileUser(param); }
    else setHomeApp(dest);
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async (p, c) => {
    if (!authUsername) return;
    setIsAppLoading(true);
    try {
      const [dashRes, divRes, txRes, overRes] = await Promise.all([
        p.length > 0
          ? apiFetch('/api/portfolio', { method: 'POST', body: JSON.stringify({ portfolio: p, baseCurrency: c }) }).then(r => r.json())
          : Promise.resolve(null),
        apiFetch('/api/dividends').then(r => r.json()),
        apiFetch('/api/transactions/count').then(r => r.json()),
        apiFetch('/api/overrides').then(r => r.json()),
      ]);
      setDashboardData(dashRes); setDividends(divRes); setTxCount(txRes); setOverrides(overRes);
    } catch(e) { console.error(e); }
    setIsAppLoading(false);
  }, [authUsername, apiFetch]);

  useEffect(() => {
    if (!authUsername || !portfolio) return;
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
    localStorage.setItem('baseCurrency', baseCurrency);
    fetchAllData(portfolio, baseCurrency);
  }, [portfolio, baseCurrency, authUsername, fetchAllData]);

  useEffect(() => {
    if (!todayCogOpen) return;
    const close = () => setTodayCogOpen(false);
    document.addEventListener('click', close, { capture: true, once: true });
    return () => document.removeEventListener('click', close, { capture: true });
  }, [todayCogOpen]);

  useEffect(() => {
    const hkd = e => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); setIsSidebarOpen(p => !p); }
      if (e.key === '?' && document.activeElement.tagName !== 'INPUT') setShowShortcuts(p => !p);
      if (e.key === 'Escape') setShowShortcuts(false);
    };
    document.addEventListener('keydown', hkd);
    return () => document.removeEventListener('keydown', hkd);
  }, []);

  const fetchOwnership = useCallback((tickers) => {
    if (!tickers?.length || !authUsername) return;
    setOwnershipLoading(true);
    apiFetch('/api/ownership', { method: 'POST', body: JSON.stringify({ tickers: tickers.map(h => ({ ticker: h.ticker, name: h.name, isin: h.isin })) }) })
      .then(r => r.json()).then(rows => { const m = {}; rows.forEach(r => { m[r.ticker] = r; }); setOwnershipData(m); setOwnershipLoading(false); })
      .catch(() => setOwnershipLoading(false));
  }, [authUsername, apiFetch]);

  const fetchPerfData = useCallback(async (period) => {
    if (!portfolio.length || !authUsername) return;
    setPerfLoading(true);
    try {
      const res = await apiFetch('/api/history', { method: 'POST', body: JSON.stringify({ portfolio, baseCurrency, period }) });
      setPerfData(await res.json());
    } catch(e) {} finally { setPerfLoading(false); }
  }, [portfolio, baseCurrency, authUsername, apiFetch]);

  const fetchTxHistory = useCallback(async () => {
    if (!authUsername) return;
    setTxHistoryLoading(true);
    try { const res = await apiFetch('/api/transactions'); setTxHistory(await res.json()); }
    catch(e) {} finally { setTxHistoryLoading(false); }
  }, [authUsername, apiFetch]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const readFile = file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const buffer = ev.target.result;
      const bytes = new Uint8Array(buffer);
      const content = (bytes[0] === 0xFF && bytes[1] === 0xFE) ? new TextDecoder('utf-16le').decode(buffer) : new TextDecoder('utf-8').decode(buffer);
      resolve({ name: file.name, content });
    };
    reader.readAsArrayBuffer(file);
  });

  const handleSyncPortfolio = async () => {
    setSyncLoading(true); setSyncStatus('Reconstructing...');
    try {
      const res = await apiFetch('/api/transactions/reconstruct');
      const reconstructed = await res.json();
      if (!reconstructed.length) setSyncStatus('No current holdings found.');
      else { setPortfolio(reconstructed); setSyncStatus(`✓ ${reconstructed.length} holdings synced.`); }
    } catch { setSyncStatus('Sync failed.'); }
    setSyncLoading(false);
  };

  const handleUpload = async (files) => {
    if (!files.length) return;
    setUploadLoading(true); setUploadStatus(null); setSyncStatus('');
    try {
      const payloads = await Promise.all(Array.from(files).map(readFile));
      const res = await apiFetch('/api/transactions/upload', { method: 'POST', body: JSON.stringify({ files: payloads }) });
      const data = await res.json();
      setUploadStatus({ results: data.results, newAdded: data.newAdded ?? 0, total: data.total ?? 0 });
      await handleSyncPortfolio();
    } catch { setUploadStatus({ error: 'Upload failed.' }); }
    setUploadLoading(false);
  };

  const handleResolveTickers = async () => {
    setResolveLoading(true); setResolveStatus('Resolving tickers...');
    try {
      const res = await apiFetch('/api/transactions/resolve', { method: 'POST' });
      const data = await res.json();
      if (data.resolved > 0) { setResolveStatus(`✓ Resolved ${data.resolved}/${data.total}. Syncing...`); await handleSyncPortfolio(); }
      else if (data.total === 0) setResolveStatus('All tickers already resolved.');
      else setResolveStatus(`Could not resolve ${data.total} tickers.`);
    } catch { setResolveStatus('Resolve failed.'); }
    setResolveLoading(false);
  };

  const handleClearTransactions = async () => {
    await apiFetch('/api/transactions', { method: 'DELETE' });
    setTxCount({ total: 0, trades: 0 }); setPortfolio([]); setUploadStatus(null); setDividends(null); setSyncStatus('History cleared.');
  };

  const toggleRemoval = t => setSelectedForRemoval(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
  const handleRemoveSelected = () => { setPortfolio(p => p.filter(s => !selectedForRemoval.includes(s.ticker))); setSelectedForRemoval([]); };

  const handleAddOverride = async () => {
    const isin = overrideIsin.trim().toUpperCase(), ticker = overrideTicker.trim().toUpperCase();
    if (!isin || !ticker) return;
    await apiFetch('/api/overrides', { method: 'POST', body: JSON.stringify({ isin, ticker }) });
    setOverrideIsin(''); setOverrideTicker('');
    fetchAllData(portfolio, baseCurrency);
    setOverrideMsg(`Saved: ${isin} → ${ticker}`);
    setTimeout(() => setOverrideMsg(''), 4000);
  };

  const handleDeleteOverride = async isin => {
    await apiFetch(`/api/overrides/${isin}`, { method: 'DELETE' });
    fetchAllData(portfolio, baseCurrency);
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const sym = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'SEK': 'kr' }[baseCurrency] || baseCurrency;
  const totals = dashboardData?.totals;
  const plPositive = totals?.profit >= 0;
  const plColor = plPositive ? 'text-green-400' : 'text-red-400';
  const plSign = plPositive ? '+' : '';
  const todayTotal = dashboardData ? dashboardData.portfolio.reduce((s, x) => s + x.todayGainBase, 0) : null;
  const todayPositive = todayTotal >= 0;
  const todayPct = todayTotal !== null && totals && totals.value - todayTotal !== 0 ? (todayTotal / (totals.value - todayTotal)) * 100 : null;
  const fmt = n => n?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—';
  const fmtSym = n => n != null ? `${fmt(n)} ${sym}` : '—';
  const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
  const TABS = [{ id: 'overview', label: 'Overview' },{ id: 'holdings', label: 'Holdings' },{ id: 'performance', label: 'Performance' },{ id: 'ownership', label: 'Ownership' },{ id: 'insights', label: 'Insights' },{ id: 'history', label: 'History' }];

  // ── Auth screen ────────────────────────────────────────────────────────────
  if (authStatus === 'loading') {
    return <div className={`flex h-screen items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (authStatus === 'no-user' || authStatus === 'logged-out') {
    const isSignup = authMode === 'signup';
    return (
      <div className={`flex h-screen items-center justify-center ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <div className={`w-full max-w-sm mx-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl shadow-2xl overflow-hidden`}>
          <div className="bg-linear-to-br from-blue-600 to-blue-800 p-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <svg width="32" height="32" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="rgba(255,255,255,0.15)"/><path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 10l2.5-2.5M20.5 7.5l-2 0M20.5 7.5l0 2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="text-2xl font-bold text-white tracking-tight">Statera</span>
            </div>
            <p className="text-blue-200 text-sm">{isSignup ? 'Create your account' : 'Welcome back'}</p>
          </div>
          <div className="p-8">
            {authError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-5 text-sm text-red-400">{authError}</div>}
            <div className="flex flex-col gap-4">
              {['username','password', ...(isSignup ? ['confirmPassword'] : [])].map(field => (
                <div key={field}>
                  <label className={`text-xs font-semibold uppercase tracking-wider block mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{field === 'confirmPassword' ? 'Confirm Password' : field.charAt(0).toUpperCase() + field.slice(1)}</label>
                  <input type={field === 'username' ? 'text' : 'password'} value={authForm[field]} onChange={e => setAuthForm(f => ({ ...f, [field]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAuth()} autoFocus={field === 'username'} placeholder={field === 'password' && isSignup ? 'At least 6 characters' : field === 'username' ? '3-20 characters' : ''}
                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500'} focus:ring-2 focus:ring-blue-500/20`} />
                </div>
              ))}
              <button onClick={handleAuth} disabled={authLoading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm mt-1">
                {authLoading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>{isSignup ? 'Creating...' : 'Signing in...'}</span> : isSignup ? 'Create Account' : 'Sign In'}
              </button>
              {authStatus === 'logged-out' && (
                <button onClick={() => { setAuthMode(isSignup ? 'login' : 'signup'); setAuthError(''); setAuthForm({ username: '', password: '', confirmPassword: '', newPassword: '' }); }} className={`text-sm text-center ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition`}>
                  {isSignup ? 'Already have an account? Sign in' : 'Create an account'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── App routing ────────────────────────────────────────────────────────────
  if (homeApp === 'skins') return (
    <div className={`flex flex-col h-screen pt-12 ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <GlobalBar isDark={isDark} authUsername={authUsername} onNavigate={handleNavigate} onLogout={handleLogout} />
      <CSSkins isDark={isDark} onBack={() => setHomeApp(null)} authUsername={authUsername} />
    </div>
  );
  if (homeApp === 'profile') return (
    <div className={`flex flex-col h-screen pt-12 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <GlobalBar isDark={isDark} authUsername={authUsername} onNavigate={handleNavigate} onLogout={handleLogout} />
      <div className={`px-8 py-3 border-b flex items-center gap-3 shrink-0 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        {viewProfileUser && <button onClick={() => setViewProfileUser(null)} className={`text-sm ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition`}>← Back</button>}
        <h1 className="text-base font-bold">{viewProfileUser ? viewProfileUser : 'My Profile'}</h1>
      </div>
      <ProfilePage isDark={isDark} authUsername={authUsername} viewUsername={viewProfileUser} />
    </div>
  );

  if (homeApp === 'admin') return (
    <div className={`flex flex-col h-screen pt-12 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <GlobalBar isDark={isDark} authUsername={authUsername} onNavigate={handleNavigate} onLogout={handleLogout} />
      <div className={`px-8 py-3 border-b flex items-center gap-3 shrink-0 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <h1 className="text-base font-bold">🛡️ Admin Panel</h1>
      </div>
      <AdminPanel isDark={isDark} authUsername={authUsername} />
    </div>
  );

  // ── Home screen ────────────────────────────────────────────────────────────
  if (!homeApp) {
    const apps = [
      { id: 'statera', name: 'Statera', desc: 'Portfolio tracker & analytics', color: 'from-blue-600 to-blue-800', icon: <svg width="44" height="44" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="#1d4ed8"/><path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>, stats: [{ label: 'Holdings', value: portfolio.length || '—' },{ label: 'Transactions', value: txCount.total || '—' },{ label: 'Dividends YTD', value: dividends?.totalThisYear > 0 ? `${Math.round(dividends.totalThisYear)} kr` : '—' }] },
      { id: 'skins', name: 'CS Skins', desc: 'Track CS inventory, P&L & Steam value', color: 'from-orange-500 to-orange-700', icon: <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-xl">CS</div>, stats: [] },
      ...(authUsername === 'admin' ? [{ id: 'admin', name: 'Admin Panel', desc: 'Manage users, system & announcements', color: 'from-red-700 to-red-900', icon: <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-2xl">🛡️</div>, stats: [] }] : []),

    ];
    return (
      <div className={`min-h-screen pt-12 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <div className={`flex items-center justify-between px-8 py-4 border-b ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="#0f1e3c"/><path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="font-bold tracking-tight">Statera</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{authUsername}</span>
            <button onClick={() => setIsDark(p => !p)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} transition text-sm`}>{isDark ? '☀️' : '🌙'}</button>
            <button onClick={handleLogout} className={`p-1.5 rounded-lg ${isDark ? 'text-gray-400 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'} transition`} title="Sign out">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-8 py-16">
          {announcements.length > 0 && (
            <div className="flex flex-col gap-2 mb-6">
              {announcements.map(a => {
                const colors = { info: 'bg-blue-900/40 text-blue-300 border-blue-800', warning: 'bg-yellow-900/40 text-yellow-300 border-yellow-800', success: 'bg-green-900/40 text-green-300 border-green-800', error: 'bg-red-900/40 text-red-300 border-red-800' };
                return (
                  <div key={a.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${colors[a.type] || colors.info}`}>
                    <span className="shrink-0">{a.type === 'warning' ? '⚠️' : a.type === 'error' ? '🚨' : a.type === 'success' ? '✅' : 'ℹ️'}</span>
                    <div><span className="font-semibold">{a.title}</span>{a.message && <span className="ml-2 opacity-80">{a.message}</span>}</div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mb-12">
            <h1 className="text-3xl font-bold mb-2">Welcome back, {authUsername}</h1>
            <p className={`text-base ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Choose an app to open.</p>
          </div>
          <div className={`grid gap-6 ${authUsername === 'admin' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {apps.map(app => (
              <button key={app.id} onClick={() => handleNavigate(app.id)} className={`text-left rounded-2xl overflow-hidden border transition-all duration-200 group hover:shadow-lg hover:-translate-y-0.5 cursor-pointer ${isDark ? 'bg-gray-800 border-gray-700 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-400'}`}>
                <div className={`bg-linear-to-br ${app.color} p-6 flex items-start justify-between`}>
                  <div>{app.icon}</div>
                </div>
                <div className="p-5">
                  <h2 className="text-lg font-bold mb-1">{app.name}</h2>
                  <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{app.desc}</p>
                  {app.stats.length > 0 && (
                    <div className={`grid grid-cols-3 gap-3 pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                      {app.stats.map(s => (
                        <div key={s.label}>
                          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-0.5`}>{s.label}</p>
                          <p className="text-sm font-bold">{s.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={`mt-4 flex items-center gap-1 text-sm font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    Open <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-components ─────────────────────────────────────────────────────────
  const EmptyState = ({ icon, title, desc, action }) => (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-300 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-6">{desc}</p>
      {action && <button onClick={action.fn} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold transition">{action.label}</button>}
    </div>
  );

  const ShortcutsModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowShortcuts(false)}>
      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl p-6 w-80 shadow-2xl`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h3 className="text-base font-bold">Keyboard shortcuts</h3><button onClick={() => setShowShortcuts(false)} className="text-gray-500 hover:text-white text-lg">✕</button></div>
        {[['Space','Toggle sidebar'],['?','Show shortcuts'],['Esc','Close modals']].map(([key, desc]) => (
          <div key={key} className={`flex items-center justify-between py-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} last:border-0`}>
            <span className="text-sm text-gray-300">{desc}</span>
            <kbd className={`${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-600'} text-xs font-mono px-2 py-1 rounded`}>{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );

  const PieChart = ({ data }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (!total) return null;
    let ca = -Math.PI / 2;
    const cx = 120, cy = 120, r = 90, inner = 52;
    const slices = data.map((d, i) => {
      const angle = (d.value / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(ca), y1 = cy + r * Math.sin(ca);
      ca += angle;
      const x2 = cx + r * Math.cos(ca), y2 = cy + r * Math.sin(ca);
      const ix1 = cx + inner * Math.cos(ca - angle), iy1 = cy + inner * Math.sin(ca - angle);
      const ix2 = cx + inner * Math.cos(ca), iy2 = cy + inner * Math.sin(ca);
      const large = angle > Math.PI ? 1 : 0;
      return { path: `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1} Z`, color: COLORS[i % COLORS.length], pct: ((d.value / total) * 100).toFixed(1), name: d.name };
    });
    return (
      <div className="flex flex-col lg:flex-row items-center gap-8">
        <svg width="240" height="240" viewBox="0 0 240 240" className="shrink-0">{slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity="0.9" />)}</svg>
        <div className="flex flex-col gap-2 w-full">{slices.map((s, i) => <div key={i} className="flex items-center gap-3"><div className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} /><span className="text-sm text-gray-300 flex-1">{s.name}</span><span className="text-sm font-bold">{s.pct}%</span></div>)}</div>
      </div>
    );
  };

  const LineChart = ({ data, loading }) => {
    if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>;
    if (!data?.length) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">No data for this period.</div>;
    const W = 800, H = 260, PL = 52, PR = 16, PT = 16, PB = 32;
    const cw = W - PL - PR, ch = H - PT - PB;
    const vals = data.map(d => d.returnPct);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const range = maxV - minV || 1, pad = range * 0.1;
    const lo = minV - pad, hi = maxV + pad;
    const tx = i => PL + (i / (data.length - 1)) * cw;
    const ty = v => PT + ch - ((v - lo) / (hi - lo)) * ch;
    const pts = data.map((d, i) => `${tx(i)},${ty(d.returnPct)}`).join(' ');
    const fillPts = `${PL},${PT + ch} ` + data.map((d, i) => `${tx(i)},${ty(d.returnPct)}`).join(' ') + ` ${tx(data.length - 1)},${PT + ch}`;
    const lastVal = vals[vals.length - 1], positive = lastVal >= 0;
    const lineColor = positive ? '#10b981' : '#ef4444';
    const gridVals = Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * i / 4);
    const labelIdxs = Array.from({ length: Math.min(6, data.length) }, (_, i) => Math.round(i * (data.length - 1) / (Math.min(6, data.length) - 1)));
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 260 }}>
        <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity="0.25"/><stop offset="100%" stopColor={lineColor} stopOpacity="0"/></linearGradient></defs>
        {gridVals.map((v, i) => (<g key={i}><line x1={PL} y1={ty(v)} x2={W - PR} y2={ty(v)} stroke="#374151" strokeWidth="0.5"/><text x={PL - 4} y={ty(v) + 4} textAnchor="end" fontSize="10" fill="#6b7280">{v.toFixed(1)}%</text></g>))}
        {ty(0) > PT && ty(0) < PT + ch && <line x1={PL} y1={ty(0)} x2={W - PR} y2={ty(0)} stroke="#4b5563" strokeWidth="1" strokeDasharray="4,3"/>}
        <polygon points={fillPts} fill="url(#cg)"/>
        <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {labelIdxs.map(i => <text key={i} x={tx(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b7280">{data[i].date.slice(5)}</text>)}
        <circle cx={tx(data.length - 1)} cy={ty(lastVal)} r="4" fill={lineColor}/>
      </svg>
    );
  };

  const TodayCards = ({ data, sortMode }) => {
    const sorted = [...data].sort((a, b) => sortMode === 'currency' ? b.todayGainBase - a.todayGainBase : b.todayChangePct - a.todayChangePct);
    const best = sorted.slice(0, 3), worst = [...sorted].reverse().slice(0, 3);
    const Card = ({ s }) => {
      const pos = s.todayChangePct >= 0;
      return (
        <div className={`bg-gray-900 rounded-xl p-4 border ${pos ? 'border-green-800' : 'border-red-800'} flex flex-col gap-2`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400 font-bold uppercase truncate">{s.ticker}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pos ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>{pos ? '+' : ''}{s.todayChangePct.toFixed(2)}%</span>
          </div>
          <div className="text-sm font-bold text-white truncate">{s.flag} {s.name}</div>
          <div className="text-xs text-gray-400">{fmt(s.nativePrice)} {s.currency}</div>
          <div className={`text-xs font-bold ${s.todayGainBase >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.todayGainBase >= 0 ? '+' : ''}{fmtSym(s.todayGainBase)}</div>
        </div>
      );
    };
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div><div className="flex items-center gap-2 mb-4"><div className="w-1 h-5 bg-green-500 rounded"/><h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Best Today</h3></div><div className="grid grid-cols-3 gap-3">{best.map(s => <Card key={s.ticker} s={s}/>)}</div></div>
        <div><div className="flex items-center gap-2 mb-4"><div className="w-1 h-5 bg-red-500 rounded"/><h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Worst Today</h3></div><div className="grid grid-cols-3 gap-3">{worst.map(s => <Card key={s.ticker} s={s}/>)}</div></div>
      </div>
    );
  };

  const getSectorData = d => { const m = {}; d.forEach(s => { const sec = s.sector && s.sector !== 'Unknown' ? s.sector : 'Other'; m[sec] = (m[sec] || 0) + s.currentValue; }); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); };
  const getCurrencyData = () => { if (!dashboardData?.portfolio) return []; const m = {}; dashboardData.portfolio.forEach(s => { const cur = s.currency || baseCurrency; m[cur] = (m[cur] || 0) + s.currentValue; }); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); };

  // ── Main portfolio app ─────────────────────────────────────────────────────
  const toggleSidebarSection = key => setSidebarCollapsed(p => ({ ...p, [key]: !p[key] }));
  const cardCls = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;

  return (
    <div className={`flex h-screen overflow-hidden pt-12 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <GlobalBar isDark={isDark} authUsername={authUsername} onNavigate={handleNavigate} onLogout={handleLogout} />
      {showShortcuts && <ShortcutsModal />}

      {/* SIDEBAR */}
      <div className={`w-72 shrink-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r transition-all duration-300 z-10 overflow-y-auto flex flex-col ${isSidebarOpen ? '' : '-ml-72'}`}>
        <div className={`flex items-center gap-3 px-5 py-5 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} shrink-0`}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="#0f1e3c"/><path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 10l2.5-2.5M20.5 7.5l-2 0M20.5 7.5l0 2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div className="flex-1 min-w-0">
            <span className="text-base font-bold block">Statera</span>
            <span className={`text-xs truncate block ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{authUsername}</span>
          </div>
          <button onClick={() => setHomeApp(null)} title="Home" className={`shrink-0 p-1.5 rounded-lg ${isDark ? 'text-gray-500 hover:text-white hover:bg-gray-700' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
          <button onClick={handleLogout} title="Sign out" className={`shrink-0 p-1.5 rounded-lg ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-gray-700' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'} transition`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>

        <nav className={`flex flex-col gap-1 px-3 pt-4 pb-2 shrink-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          {[
            { key: 'import', label: 'Import CSV', icon: <><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 12l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/></> },
            { key: 'manage', label: 'Manage Portfolio', icon: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6" strokeLinecap="round"/></> },
            { key: 'settings', label: 'Settings', icon: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></> },
          ].map(({ key, label, icon }) => (
            <div key={key}>
              <button onClick={() => toggleSidebarSection(key)} className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition text-left ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">{icon}</svg>
                <span className="flex-1">{label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${sidebarCollapsed[key] ? '-rotate-90' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
              </button>
              <div className={`overflow-hidden transition-all duration-200 ${sidebarCollapsed[key] ? 'max-h-0' : 'max-h-screen'}`}>
                <div className="px-3 pb-3 pt-1">
                  {key === 'import' && (
                    <div className="flex flex-col gap-2.5">
                      <label className={`w-full flex items-center justify-center py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ring-1 ring-blue-700 ${uploadLoading ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-600 text-white'}`}>
                        {uploadLoading ? '⏳ Processing…' : uploadStatus ? '↺ Re-upload CSV' : '↑ Upload CSV files'}
                        <input type="file" accept=".csv" multiple className="hidden" disabled={uploadLoading} onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
                      </label>
                      <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Broker detected automatically.</p>
                      {uploadStatus?.error && <p className="text-xs text-red-400">✗ {uploadStatus.error}</p>}
                      {uploadStatus?.results && (
                        <div className="flex flex-col gap-1.5">
                          {uploadStatus.results.map((r, i) => (
                            <div key={i} className={`${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg px-3 py-2 text-xs`}>
                              {r.error ? <p className="text-red-400">✗ {r.file}: {r.error}</p> : <p className={isDark ? 'text-gray-300' : 'text-gray-600'}><span className="font-bold capitalize">{r.broker}</span> — {r.count} rows</p>}
                            </div>
                          ))}
                          <p className="text-xs text-green-400 font-semibold">+{uploadStatus.newAdded} new · {uploadStatus.total} total</p>
                        </div>
                      )}
                      {txCount.trades > 0 && <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg px-3 py-2`}><p className="text-sm font-bold text-green-400">{txCount.trades} trades</p><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{txCount.total} total in history</p></div>}
                      {txCount.trades > 0 && <button onClick={handleSyncPortfolio} disabled={syncLoading} className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 py-2 rounded-lg font-bold text-sm transition text-white">{syncLoading ? 'Syncing…' : 'Sync Portfolio'}</button>}
                      {syncStatus && <p className={`text-xs ${syncStatus.startsWith('✓') ? 'text-green-400' : 'text-gray-400'}`}>{syncStatus}</p>}
                      {txCount.trades > 0 && <button onClick={handleResolveTickers} disabled={resolveLoading} className={`w-full py-2 rounded-lg font-bold text-sm transition disabled:opacity-50 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>{resolveLoading ? '⏳ Resolving...' : '🔍 Resolve Tickers'}</button>}
                      {resolveStatus && <p className={`text-xs ${resolveStatus.startsWith('✓') ? 'text-green-400' : 'text-gray-400'}`}>{resolveStatus}</p>}
                      {txCount.total > 0 && <button onClick={handleClearTransactions} className={`w-full ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} py-2 rounded-lg font-bold text-sm transition`}>Clear History</button>}
                    </div>
                  )}
                  {key === 'manage' && (
                    <div>
                      <div className="flex flex-col gap-1 mb-3 max-h-48 overflow-y-auto">
                        {portfolio.length === 0 ? <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Portfolio is empty.</p>
                          : portfolio.map(s => (
                            <label key={s.ticker} className={`flex items-center p-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded cursor-pointer transition`}>
                              <input type="checkbox" checked={selectedForRemoval.includes(s.ticker)} onChange={() => toggleRemoval(s.ticker)} className="mr-3" />{s.ticker}
                            </label>
                          ))}
                      </div>
                      <button onClick={handleRemoveSelected} className="w-full bg-red-600 hover:bg-red-500 p-2 rounded font-bold text-sm text-white transition mb-1.5">Remove Selected</button>
                      <button onClick={() => setPortfolio([])} className={`w-full ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-100 hover:bg-gray-200'} p-2 rounded font-bold text-sm transition`}>Clear Portfolio</button>
                    </div>
                  )}
                  {key === 'settings' && (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider block mb-1.5`}>Currency</label>
                        <select value={baseCurrency} onChange={e => setBaseCurrency(e.target.value)} className={`w-full p-2 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded outline-none text-sm`}>
                          <option>EUR</option><option>GBP</option><option>SEK</option><option>USD</option>
                        </select>
                      </div>
                      <button onClick={() => setIsDark(p => !p)} className={`w-full py-2 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded text-sm font-medium transition flex items-center justify-center gap-2`}>
                        <span>{isDark ? '☀️' : '🌙'}</span>{isDark ? 'Light Mode' : 'Dark Mode'}
                      </button>
                      {!showChangePassword ? (
                        <button onClick={() => { setShowChangePassword(true); setAuthError(''); }} className={`w-full py-2 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded text-sm font-medium transition`}>🔑 Change Password</button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Change Password</p>
                          <input type="password" value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} placeholder="Current password" className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200'}`} />
                          <input type="password" value={authForm.newPassword} onChange={e => setAuthForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="New password (6+ chars)" className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200'}`} />
                          {authError && <p className="text-xs text-red-400">{authError}</p>}
                          <div className="flex gap-2">
                            <button onClick={handleChangePassword} disabled={authLoading} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition disabled:opacity-50">Save</button>
                            <button onClick={() => { setShowChangePassword(false); setAuthError(''); }} className={`flex-1 py-1.5 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded text-xs font-bold transition`}>Cancel</button>
                          </div>
                        </div>
                      )}
                      <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} pt-3`}>
                        <h3 className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-2`}>Ticker Overrides</h3>
                        <div className="flex gap-2 mb-2">
                          <input type="text" value={overrideIsin} onChange={e => setOverrideIsin(e.target.value)} placeholder="ISIN" className={`flex-1 p-2 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded text-xs outline-none`} />
                          <input type="text" value={overrideTicker} onChange={e => setOverrideTicker(e.target.value)} placeholder="Ticker" className={`flex-1 p-2 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded text-xs outline-none`} />
                        </div>
                        <button onClick={handleAddOverride} className="w-full bg-blue-600 hover:bg-blue-500 p-2 rounded font-bold text-sm text-white transition mb-2">Save Override</button>
                        {overrideMsg && <p className="text-xs text-green-400 mb-2">{overrideMsg}</p>}
                        {Object.entries(overrides).map(([isin, ticker]) => (
                          <div key={isin} className={`flex items-center justify-between ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded px-3 py-1.5 mb-1`}>
                            <span className="text-xs">{isin} → <span className="font-bold">{ticker}</span></span>
                            <button onClick={() => handleDeleteOverride(isin)} className="text-red-400 hover:text-red-300 text-xs ml-2">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* MAIN */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 pt-8 pb-0">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setIsSidebarOpen(p => !p)} className={`p-2 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} transition`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <h1 className="text-2xl font-bold tracking-tight flex-1">Portfolio Tracker</h1>
            <button onClick={() => setShowShortcuts(true)} className={`p-2 rounded-lg ${isDark ? 'text-gray-500 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} transition text-sm font-mono`}>?</button>
          </div>
          <div className={`flex gap-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-x-auto`}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'ownership' && dashboardData && Object.keys(ownershipData).length === 0 && !ownershipLoading) fetchOwnership(dashboardData.portfolio);
                if (tab.id === 'performance') fetchPerfData(perfPeriod);
                if (tab.id === 'history') fetchTxHistory();
              }} className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 -mb-px whitespace-nowrap ${activeTab === tab.id ? 'border-blue-500 text-white' : `border-transparent ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-8 py-8">
          {isAppLoading ? (
            <div className="flex flex-col items-center justify-center mt-32 space-y-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
              <p className={`font-bold tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading...</p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="flex flex-col gap-6">
                  {!dashboardData || portfolio.length === 0 ? (
                    <EmptyState icon="📊" title="No portfolio data" desc="Upload a CSV from your broker to get started." action={{ label: 'Upload CSV', fn: () => { setIsSidebarOpen(true); setSidebarCollapsed(p => ({ ...p, import: false })); } }} />
                  ) : (
                    <>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {[
                          { label: 'Total Value', value: fmtSym(totals?.value) },
                          { label: "Today's Gain", value: todayTotal !== null ? `${todayPositive ? '+' : ''}${fmtSym(todayTotal)}` : '—', color: todayPositive ? 'text-green-400' : 'text-red-400', sub: todayPct != null ? { label: "Today's Return", value: `${todayPositive ? '+' : ''}${todayPct.toFixed(2)}%`, color: todayPositive ? 'text-green-400' : 'text-red-400' } : null },
                          { label: 'Total Return', value: totals ? `${plSign}${totals.returnPct.toFixed(2)}%` : '—', color: plColor, sub: totals ? { label: 'Profit / Loss', value: `${plSign}${fmtSym(totals.profit)}`, color: plColor } : null },
                        ].map((card, i) => (
                          <div key={i} className={`${cardCls} p-5 flex flex-col gap-4`}>
                            <div><h4 className={`text-xs font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wider mb-2`}>{card.label}</h4><p className={`text-3xl font-bold ${card.color || ''}`}>{card.value}</p></div>
                            {card.sub && <div><h4 className={`text-xs font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wider mb-2`}>{card.sub.label}</h4><p className={`text-3xl font-bold ${card.sub.color}`}>{card.sub.value}</p></div>}
                          </div>
                        ))}
                      </div>
                      {dashboardData.portfolio.length > 0 && (
                        <div className={`${cardCls} p-6`}>
                          <div className="flex items-center justify-between mb-6">
                            <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>Best &amp; Worst Today</h3>
                            <div className="relative">
                              <button onClick={() => setTodayCogOpen(o => !o)} className={`p-1.5 rounded-lg border ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700 border-gray-700' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100 border-gray-200'} transition`}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
                              </button>
                              {todayCogOpen && (
                                <div className={`absolute right-0 top-8 z-50 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl overflow-hidden w-44`}>
                                  <div className={`px-3 py-2 text-xs font-semibold ${isDark ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-200'} uppercase tracking-wider border-b`}>Sort by</div>
                                  {[['pct','Percentage (%)'],['currency',`Amount (${sym})`]].map(([val, label]) => (
                                    <button key={val} onClick={() => { setTodaySortMode(val); setTodayCogOpen(false); }} className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center justify-between ${todaySortMode === val ? `${isDark ? 'text-white bg-gray-700' : 'text-gray-900 bg-gray-100'}` : `${isDark ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}`}>
                                      {label}{todaySortMode === val && <span className="text-blue-400 text-xs">✓</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <TodayCards data={dashboardData.portfolio} sortMode={todaySortMode} />
                        </div>
                      )}
                      {dividends && dividends.totalAllTime > 0 && (() => {
                        const maxYear = Math.max(...dividends.byYear.map(y => y.total));
                        const maxStock = dividends.byStock[0]?.total || 1;
                        return (
                          <div className={`${cardCls} p-6`}>
                            <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>Dividend Dashboard</h3>
                            <div className="grid grid-cols-2 gap-4 mb-8">
                              <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} rounded-xl p-4`}><p className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>All-Time</p><p className="text-3xl font-bold">{fmt(dividends.totalAllTime)} kr</p></div>
                              <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} rounded-xl p-4`}><p className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>This Year</p><p className="text-3xl font-bold">{fmt(dividends.totalThisYear)} kr</p></div>
                            </div>
                            <div className="flex flex-col gap-1 mb-8">
                              {dividends.byYear.map(({ year, total, stocks }) => {
                                const isOpen = expandedYear === year;
                                const maxStockInYear = stocks?.[0]?.total || 1;
                                return (
                                  <div key={year}>
                                    <div onClick={() => setExpandedYear(isOpen ? null : year)} className={`flex items-center gap-3 py-1 cursor-pointer rounded-lg px-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition`}>
                                      <span className={`text-sm font-bold w-12 shrink-0 text-right ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{year}</span>
                                      <div className={`flex-1 h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-slate-500 rounded" style={{ width: `${(total / maxYear) * 100}%` }} /></div>
                                      <span className={`text-sm font-bold w-28 text-right shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{fmt(total)} kr</span>
                                      <span className={`text-xs w-4 shrink-0 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{isOpen ? '▲' : '▼'}</span>
                                    </div>
                                    <div style={{ maxHeight: isOpen ? `${(stocks?.length || 0) * 28 + 16}px` : '0px', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                                      <div className={`ml-14 mt-1 mb-2 flex flex-col gap-1 border-l-2 ${isDark ? 'border-gray-700' : 'border-gray-200'} pl-3`}>
                                        {stocks?.map(({ name, total: sTotal }) => (
                                          <div key={name} className="flex items-center gap-3">
                                            <span className={`text-xs w-44 shrink-0 truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{name}</span>
                                            <div className={`flex-1 h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-slate-600 rounded" style={{ width: `${(sTotal / maxStockInYear) * 100}%` }} /></div>
                                            <span className={`text-xs w-24 text-right shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{fmt(sTotal)} kr</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex flex-col gap-2">
                              {dividends.byStock.slice(0, 12).map(({ name, total }) => (
                                <div key={name} className="flex items-center gap-3">
                                  <span className={`text-xs w-44 shrink-0 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{name}</span>
                                  <div className={`flex-1 h-5 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-slate-500 rounded" style={{ width: `${(total / maxStock) * 100}%` }} /></div>
                                  <span className={`text-xs font-bold w-28 text-right shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{fmt(total)} kr</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'holdings' && (() => {
                const COLS = [
                  { key: 'name', label: 'Name', sortFn: (a, b) => a.name.localeCompare(b.name) },
                  { key: 'ticker', label: 'Ticker', sortFn: (a, b) => a.ticker.localeCompare(b.ticker) },
                  { key: 'nativePrice', label: 'Price', sortFn: (a, b) => a.nativePrice - b.nativePrice },
                  { key: 'todayPct', label: 'Today %', sortFn: (a, b) => a.todayChangePct - b.todayChangePct },
                  { key: 'quantity', label: 'Qty', sortFn: (a, b) => a.quantity - b.quantity },
                  { key: 'profit', label: `Return (${sym})`, sortFn: (a, b) => a.profit - b.profit },
                  { key: 'returnPct', label: 'Return %', sortFn: (a, b) => a.returnPct - b.returnPct },
                  { key: 'value', label: `Value (${sym})`, sortFn: (a, b) => a.currentValue - b.currentValue },
                ];
                const handleSort = key => { if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir('desc'); } };
                const col = COLS.find(c => c.key === sortCol);
                const rows = dashboardData ? [...dashboardData.portfolio].sort((a, b) => { const v = col ? col.sortFn(a, b) : 0; return sortDir === 'asc' ? v : -v; }) : [];
                if (!dashboardData || portfolio.length === 0) return <EmptyState icon="📋" title="No holdings" desc="Upload a CSV and sync your portfolio." />;
                return (
                  <div className={`${cardCls} overflow-hidden`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                          <tr>{COLS.map(c => <th key={c.key} onClick={() => handleSort(c.key)} className={`p-4 font-bold ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'} uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition text-xs`}>{c.label}{sortCol === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</th>)}</tr>
                        </thead>
                        <tbody>
                          {rows.map(s => {
                            const tp = s.todayChangePct >= 0, rp = s.returnPct >= 0, pp = s.profit >= 0;
                            return (
                              <tr key={s.ticker} className={`border-t ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'} transition`}>
                                <td className="p-4 font-bold">{s.flag} {s.cleanName || s.name}</td>
                                <td className={`p-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{s.ticker}</td>
                                <td className="p-4 whitespace-nowrap">{fmt(s.nativePrice)} {s.currency}</td>
                                <td className={`p-4 font-bold whitespace-nowrap ${tp ? 'text-green-400' : 'text-red-400'}`}>{tp ? '+' : ''}{s.todayChangePct.toFixed(2)}%</td>
                                <td className="p-4">{s.quantity}</td>
                                <td className={`p-4 font-bold whitespace-nowrap ${pp ? 'text-green-400' : 'text-red-400'}`}>{pp ? '+' : ''}{fmtSym(s.profit)}</td>
                                <td className={`p-4 font-bold whitespace-nowrap ${rp ? 'text-green-400' : 'text-red-400'}`}>{rp ? '+' : ''}{s.returnPct.toFixed(2)}%</td>
                                <td className="p-4 whitespace-nowrap">{fmtSym(s.currentValue)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {activeTab === 'performance' && (
                <div className="flex flex-col gap-6">
                  {!portfolio.length ? <EmptyState icon="📈" title="No performance data" desc="Upload and sync a portfolio first." /> : (
                    <>
                      <div className={`${cardCls} p-6`}>
                        <div className="flex items-center justify-between mb-5">
                          <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>Portfolio Performance</h3>
                          <div className="flex gap-1">
                            {['1W','1M','3M','1Y','3Y'].map(p => (
                              <button key={p} onClick={() => { setPerfPeriod(p); fetchPerfData(p); }} className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${perfPeriod === p ? 'bg-blue-600 text-white' : `${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-900'}`}`}>{p}</button>
                            ))}
                          </div>
                        </div>
                        <LineChart data={perfData} loading={perfLoading} />
                      </div>
                      {dashboardData && (
                        <div className={`${cardCls} p-6`}>
                          <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>All-Time Return per Position</h3>
                          <div className="flex flex-col gap-3">
                            {[...dashboardData.portfolio].sort((a, b) => b.returnPct - a.returnPct).map(s => {
                              const maxAbs = Math.max(...dashboardData.portfolio.map(d => Math.abs(d.returnPct)), 1);
                              const pos = s.returnPct >= 0, bp = (Math.abs(s.returnPct) / maxAbs) * 50;
                              return (
                                <div key={s.ticker} className="flex items-center gap-3">
                                  <span className="text-sm font-bold w-24 shrink-0 text-right">{s.ticker}</span>
                                  <div className="flex-1 flex justify-end"><div className="w-full flex justify-end h-7 items-center">{!pos && <div className="h-full bg-red-500 rounded-l" style={{ width: `${bp * 2}%` }} />}</div></div>
                                  <div className="w-px h-7 bg-gray-500 shrink-0" />
                                  <div className="flex-1 flex justify-start"><div className="w-full flex justify-start h-7 items-center">{pos && <div className="h-full bg-green-500 rounded-r" style={{ width: `${bp * 2}%` }} />}</div></div>
                                  <span className={`text-sm font-bold w-20 shrink-0 ${pos ? 'text-green-400' : 'text-red-400'}`}>{pos ? '+' : ''}{s.returnPct.toFixed(2)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'insights' && (
                <div className="flex flex-col gap-8">
                  {!dashboardData || portfolio.length === 0 ? <EmptyState icon="💡" title="No insights" desc="Upload and sync a portfolio first." /> : (
                    <>
                      {[
                        { title: 'Portfolio Allocation', data: dashboardData.portfolio.map(s => ({ name: s.ticker, value: s.currentValue })) },
                        { title: 'Sector Exposure', data: getSectorData(dashboardData.portfolio) },
                      ].map(({ title, data }) => (
                        <div key={title} className={`${cardCls} p-6`}>
                          <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>{title}</h3>
                          <PieChart data={data} />
                        </div>
                      ))}
                      <div className={`${cardCls} p-6`}>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>Currency Exposure</h3>
                        <div className="flex flex-col gap-3">
                          {getCurrencyData().map((c, i) => {
                            const total = getCurrencyData().reduce((s, x) => s + x.value, 0);
                            const pct = (c.value / total) * 100;
                            return (
                              <div key={c.name} className="flex items-center gap-4">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                <span className="text-sm font-bold w-14 shrink-0">{c.name}</span>
                                <div className={`flex-1 h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full rounded" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} /></div>
                                <span className="text-sm font-bold w-14 text-right">{pct.toFixed(1)}%</span>
                                <span className={`text-sm w-36 text-right whitespace-nowrap ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{fmtSym(c.value)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'ownership' && (() => {
                const allHoldings = dashboardData ? dashboardData.portfolio.filter(h => !h.quoteType || h.quoteType === 'EQUITY') : [];
                const hasData = Object.keys(ownershipData).length > 0;
                const sortedHoldings = [...allHoldings].sort((a, b) => {
                  const da = ownershipData[a.ticker], db = ownershipData[b.ticker];
                  if (ownershipSort === 'inst') return (db?.institutionPct ?? -1) - (da?.institutionPct ?? -1);
                  if (ownershipSort === 'insider') return (db?.insiderPct ?? -1) - (da?.insiderPct ?? -1);
                  return (b.currentValue ?? 0) - (a.currentValue ?? 0);
                });
                const filteredHoldings = ownershipFilter ? sortedHoldings.filter(h => h.ticker.toLowerCase().includes(ownershipFilter.toLowerCase()) || h.name.toLowerCase().includes(ownershipFilter.toLowerCase())) : sortedHoldings;
                if (!dashboardData) return <EmptyState icon="🏛️" title="No portfolio" desc="Import and sync a portfolio first." />;
                const OwnershipCard = ({ ticker, name, isExtra = false }) => {
                  const data = isExtra ? ownershipExtra[ticker] : ownershipData[ticker];
                  const pct = v => v != null ? `${(v * 100).toFixed(1)}%` : '—';
                  const maxInst = data?.topInstitutional?.[0]?.pctHeld || 1;
                  return (
                    <div className={`${cardCls} p-5`}>
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`font-bold text-sm ${isDark ? 'bg-gray-700' : 'bg-gray-100'} px-2 py-1 rounded-lg`}>{ticker}</span>
                        <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{name}</span>
                        {isExtra && <span className="ml-auto text-xs text-blue-400 bg-blue-900 px-2 py-0.5 rounded-full">lookup</span>}
                      </div>
                      {!data ? <div className="flex items-center justify-center h-16"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
                        : data.error || data.noData ? <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No ownership data available</p>
                        : (
                          <>
                            <div className={`flex gap-6 mb-4 pb-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                              <div><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Institutional</p><p className="text-xl font-bold">{pct(data.institutionPct)}</p></div>
                              <div><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Insider</p><p className="text-xl font-bold">{pct(data.insiderPct)}</p></div>
                            </div>
                            {data.topInstitutional?.length > 0 && (
                              <div className="flex flex-col gap-2 mb-4">
                                {data.topInstitutional.map((h, i) => (
                                  <div key={i} className="flex items-center gap-3">
                                    <span className={`text-xs w-44 shrink-0 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{h.name}</span>
                                    <div className={`flex-1 h-5 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-blue-600 rounded" style={{ width: `${(h.pctHeld / maxInst) * 100}%` }} /></div>
                                    <span className={`text-xs font-bold w-12 text-right ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{pct(h.pctHeld)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                    </div>
                  );
                };
                return (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                      <input type="text" value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)} placeholder="Filter..." className={`flex-1 px-3 py-2 ${isDark ? 'bg-gray-700 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900'} rounded-lg text-sm outline-none`} />
                      <select value={ownershipSort} onChange={e => setOwnershipSort(e.target.value)} className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'} rounded-lg text-sm outline-none`}>
                        <option value="value">Portfolio value</option><option value="inst">Institutional %</option><option value="insider">Insider %</option>
                      </select>
                      {hasData && <button onClick={() => { setOwnershipData({}); fetchOwnership(allHoldings); }} className={`text-xs ${isDark ? 'text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'} px-3 py-2 rounded-lg shrink-0`}>↺ Refresh</button>}
                    </div>
                    <div className="relative">
                      <input type="text" value={ownershipSearch} onChange={e => { setOwnershipSearch(e.target.value); if (e.target.value.length >= 2) { clearTimeout(window._osTimer); window._osTimer = setTimeout(() => apiFetch(`/api/ownership/search/${encodeURIComponent(e.target.value)}`).then(r => r.json()).then(setOwnershipSearchResults), 300); } else setOwnershipSearchResults([]); }} placeholder="Look up any stock..." className={`w-full px-3 py-2 ${isDark ? 'bg-gray-700 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900'} rounded-lg text-sm outline-none`} />
                      {ownershipSearchResults.length > 0 && (
                        <div className={`absolute z-50 w-full ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'} border rounded-lg mt-1 shadow-xl overflow-hidden`}>
                          {ownershipSearchResults.map(r => (
                            <div key={r.ticker} onClick={() => { setOwnershipSearch(''); setOwnershipSearchResults([]); if (!ownershipExtra[r.ticker]) { setOwnershipExtra(p => ({ ...p, [r.ticker]: null })); apiFetch('/api/ownership', { method: 'POST', body: JSON.stringify({ tickers: [{ ticker: r.ticker, name: r.name }] }) }).then(res => res.json()).then(data => setOwnershipExtra(p => ({ ...p, [r.ticker]: data[0] || { error: true } }))); } }} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} last:border-0`}>
                              <span className="font-bold text-blue-400 text-sm w-24 shrink-0">{r.ticker}</span>
                              <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} truncate`}>{r.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {!hasData && !ownershipLoading && <button onClick={() => fetchOwnership(allHoldings)} className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl transition">Load Ownership Data</button>}
                    {Object.keys(ownershipExtra).length > 0 && <div className="flex flex-col gap-4">{Object.keys(ownershipExtra).map(ticker => <OwnershipCard key={ticker} ticker={ticker} name={ownershipExtra[ticker]?.name || ticker} isExtra />)}</div>}
                    {ownershipLoading && <div className="flex flex-col gap-4">{allHoldings.slice(0, 4).map(h => <div key={h.ticker} className={`${cardCls} p-5 animate-pulse`}><div className={`h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded w-32 mb-3`}/><div className={`h-3 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded w-48`}/></div>)}</div>}
                    {!ownershipLoading && hasData && <div className="flex flex-col gap-4">{filteredHoldings.map(h => <OwnershipCard key={h.ticker} ticker={h.ticker} name={h.name}/>)}</div>}
                  </div>
                );
              })()}

              {activeTab === 'history' && (() => {
                const filtered = txHistory.filter(tx => {
                  const matchSearch = !txSearch || tx.ticker?.toLowerCase().includes(txSearch.toLowerCase()) || tx.name?.toLowerCase().includes(txSearch.toLowerCase());
                  const matchType = txTypeFilter === 'all' || tx.type === txTypeFilter;
                  return matchSearch && matchType;
                });
                const typeBg = { buy: 'bg-green-900/40 text-green-400', sell: 'bg-red-900/40 text-red-400', dividend: 'bg-blue-900/40 text-blue-400', 'foreign-tax': 'bg-yellow-900/40 text-yellow-400' };
                return (
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-3">
                      <input type="text" value={txSearch} onChange={e => setTxSearch(e.target.value)} placeholder="Search ticker or name..." className={`flex-1 px-3 py-2 ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900'} border rounded-lg text-sm outline-none`} />
                      <select value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value)} className={`px-3 py-2 ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'} border rounded-lg text-sm outline-none`}>
                        <option value="all">All types</option><option value="buy">Buy</option><option value="sell">Sell</option><option value="dividend">Dividend</option><option value="foreign-tax">Foreign tax</option>
                      </select>
                      {txHistoryLoading && <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin self-center shrink-0"/>}
                    </div>
                    {txHistory.length === 0 && !txHistoryLoading ? <EmptyState icon="📝" title="No transactions" desc="Upload a CSV to populate history." />
                      : (
                        <div className={`${cardCls} overflow-hidden`}>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                                <tr>{['Date','Type','Ticker','Name','Qty','Price','Total (SEK)'].map(h => <th key={h} className={`p-3 font-bold text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'} uppercase tracking-wider whitespace-nowrap`}>{h}</th>)}</tr>
                              </thead>
                              <tbody>
                                {filtered.slice(0, 500).map((tx, i) => (
                                  <tr key={i} className={`border-t ${isDark ? 'border-gray-700/50 hover:bg-gray-700/20' : 'border-gray-100 hover:bg-gray-50'} transition`}>
                                    <td className={`p-3 text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{tx.date}</td>
                                    <td className="p-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeBg[tx.type] || `${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}`}>{tx.type}</span></td>
                                    <td className={`p-3 text-xs font-mono font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{tx.ticker || '—'}</td>
                                    <td className={`p-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'} max-w-xs truncate`}>{tx.name || '—'}</td>
                                    <td className={`p-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{tx.quantity != null ? tx.quantity : '—'}</td>
                                    <td className={`p-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'} whitespace-nowrap`}>{tx.price != null ? `${fmt(tx.price)} ${tx.currency || ''}` : '—'}</td>
                                    <td className={`p-3 text-xs font-bold whitespace-nowrap ${(tx.totalSEK || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{tx.totalSEK != null ? `${tx.totalSEK >= 0 ? '+' : ''}${fmt(tx.totalSEK)}` : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
