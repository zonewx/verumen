import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import CSSkins from './CSSkins';
import PortfolioSidebar from './PortfolioSidebar';
import ProfilePage from './ProfilePage';
import GlobalBar from './GlobalBar';
import AdminPanel from './AdminPanel';
import ModeratorPanel from './ModeratorPanel';
import SocialFeed from './SocialFeed';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Auth ───────────────────────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('loading');
  const [authUsername, setAuthUsername] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', confirmPassword: '', newPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [userRole, setUserRole] = useState('user');
  const [allowRegistration, setAllowRegistration] = useState(true);

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
  const [uploadProgress, setUploadProgress] = useState(null); // { phase, pct, label }
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
  const globalSearchRef = useRef(null);

  // ── API helper ─────────────────────────────────────────────────────────────
  const apiFetch = useCallback((url, opts = {}) => {
    const token = sessionStorage.getItem('auth_token');
    return fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...(opts.headers || {}) }
    });
  }, []);

  // ── Token refresh ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus !== 'logged-in') return;
    // Refresh token every 45 minutes (tokens expire after 60 min)
    const interval = setInterval(async () => {
      const refreshToken = sessionStorage.getItem('auth_refresh');
      if (!refreshToken) return;
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          sessionStorage.setItem('auth_token', data.token);
          if (data.refreshToken) sessionStorage.setItem('auth_refresh', data.refreshToken);
        } else {
          // Refresh failed — log out
          handleLogout();
        }
      } catch(e) {}
    }, 45 * 60 * 1000);
    return () => clearInterval(interval);
  }, [authStatus]);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('theme', isDark ? 'dark' : 'light'); }, [isDark]);

  // ── Fetch announcements ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/announcements').then(r => r.json()).then(setAnnouncements).catch(() => {});
  }, []);

  // ── Auth Logic ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(d => {
      setAllowRegistration(d.allowRegistration !== false);
      if (!d.hasUsers) { setAuthStatus('no-user'); setAuthMode('signup'); }
      else {
        const saved = sessionStorage.getItem('auth_user');
        const savedToken = sessionStorage.getItem('auth_token');
        if (saved && savedToken) { setAuthStatus('logged-in'); setAuthUsername(saved); setUserRole(sessionStorage.getItem('auth_role') || 'user'); }
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
        sessionStorage.setItem('auth_role', data.role || 'user');
        sessionStorage.setItem('auth_token', data.token);
        if (data.refreshToken) sessionStorage.setItem('auth_refresh', data.refreshToken);
        setAuthUsername(data.username); setAuthStatus('logged-in');
        setUserRole(data.role || 'user');
      }
    } catch { setAuthError('Connection error.'); }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('auth_user');
    setAuthStatus('logged-out'); setAuthUsername('');
    setAuthForm({ username: '', password: '', confirmPassword: '', newPassword: '' });
    navigate('/');
    setPortfolio([]); setDashboardData(null); setUserRole('user');
    sessionStorage.removeItem('auth_role'); sessionStorage.removeItem('auth_token'); sessionStorage.removeItem('auth_refresh');
  };

  const handleChangePassword = async () => {
    setAuthError(''); setAuthLoading(true);
    try {
      const res = await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: authForm.password, newPassword: authForm.newPassword }) });
      if (!res.ok) { const data = await res.json(); setAuthError(data.error); setAuthLoading(false); return; }
      setShowChangePassword(false); setAuthForm(f => ({ ...f, password: '', newPassword: '' }));
    } catch { setAuthError('Failed.'); }
    setAuthLoading(false);
  };

  const handleNavigate = (dest, param = null) => {
    const map = { home:'/', portfolio:'/portfolio', skins:'/skins', social:'/social', profile:'/profile', admin:'/admin', moderator:'/moderator' };
    if (dest === 'view-profile' && param) navigate(`/profile/@${param}`);
    else navigate(map[dest] || '/');
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

  // Click away for cog
  useEffect(() => {
    if (!todayCogOpen) return;
    const close = () => setTodayCogOpen(false);
    document.addEventListener('click', close, { capture: true, once: true });
    return () => document.removeEventListener('click', close, { capture: true });
  }, [todayCogOpen]);

  // Shortcuts
  useEffect(() => {
    const hkd = e => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT' && document.activeElement.tagName !== 'BUTTON') {
        e.preventDefault();
        if (globalSearchRef.current) { globalSearchRef.current.focus(); globalSearchRef.current.select(); }
      }
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (globalSearchRef.current) { globalSearchRef.current.focus(); }
      }
      if (e.key === 'Escape') { setShowShortcuts(false); if (globalSearchRef.current) globalSearchRef.current.blur(); }
      if (e.key === '?' && document.activeElement.tagName !== 'INPUT') setShowShortcuts(p => !p);
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
    setUploadLoading(true); setUploadStatus(null); setSyncStatus(''); setUploadProgress(null);
    
    const updateProgress = (phase, pct, label) => setUploadProgress({ phase, pct, label });
    
    try {
      updateProgress('parsing', 10, 'Reading CSV files...');
      const payloads = await Promise.all(Array.from(files).map(readFile));
      
      // Count total transactions in CSV
      let totalTxCount = 0;
      payloads.forEach(p => {
        const lines = p.content.split('\n').filter(l => l.trim());
        totalTxCount += Math.max(0, lines.length - 1); // Exclude header
      });
      
      updateProgress('uploading', 30, `Detecting broker format...`);
      await new Promise(r => setTimeout(r, 300));
      
      updateProgress('processing', 50, `Processing ${totalTxCount} transactions...`);
      const res = await apiFetch('/api/transactions/upload', { method: 'POST', body: JSON.stringify({ files: payloads }) });
      const data = await res.json();
      
      updateProgress('resolving', 70, `Resolved ${data.newAdded || 0} new transactions`);
      await new Promise(r => setTimeout(r, 200));
      
      setUploadStatus({ results: data.results, newAdded: data.newAdded ?? 0, total: data.total ?? 0 });
      
      updateProgress('syncing', 85, 'Building portfolio...');
      await handleSyncPortfolio();
      
      updateProgress('done', 100, `✓ Imported ${data.newAdded ?? 0} transactions`);
      setTimeout(() => setUploadProgress(null), 3000);
    } catch { 
      setUploadStatus({ error: 'Upload failed.' }); 
      setUploadProgress(null);
    }
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

  const handleForceResolve = async () => {
    setResolveLoading(true); setResolveStatus('Clearing cache and re-resolving all tickers...');
    try {
      const res = await apiFetch('/api/transactions/resolve', { method: 'POST', body: JSON.stringify({ force: true }) });
      const data = await res.json();
      setResolveStatus(`✓ Re-resolved ${data.resolved}/${data.total} tickers. Syncing...`);
      await handleSyncPortfolio();
      setTimeout(() => setResolveStatus(''), 4000);
    } catch { setResolveStatus('Force re-resolve failed.'); }
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
  const todayPct = todayTotal !== null && totals && (totals.value - todayTotal) !== 0 ? (todayTotal / (totals.value - todayTotal)) * 100 : null;
  const fmt = n => n?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—';
  const fmtSym = n => n != null ? `${fmt(n)} ${sym}` : '—';
  const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
  const TABS = [{ id: 'overview', label: 'Overview' },{ id: 'holdings', label: 'Holdings' },{ id: 'performance', label: 'Performance' },{ id: 'ownership', label: 'Ownership' },{ id: 'insights', label: 'Insights' },{ id: 'history', label: 'History' }];

  // ── Helpers ─────────────────────────────────────────────────────────────
  const getSectorData = d => { const m = {}; d.forEach(s => { const sec = s.sector && s.sector !== 'Unknown' ? s.sector : 'Other'; m[sec] = (m[sec] || 0) + s.currentValue; }); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); };
  const getCurrencyData = () => { if (!dashboardData?.portfolio) return []; const m = {}; dashboardData.portfolio.forEach(s => { const cur = s.currency || baseCurrency; m[cur] = (m[cur] || 0) + s.currentValue; }); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); };

  // ── Page Title useEffect ────────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus !== 'logged-in') { document.title = 'Verumen'; return; }
    const p = location.pathname;
    if (p === '/') document.title = `Verumen — ${authUsername}`;
    else if (p === '/portfolio') document.title = 'Verumen — Portfolio';
    else if (p === '/skins') document.title = 'Verumen — Skins';
    else if (p === '/social') document.title = 'Verumen — Social';
    else if (p === '/profile') document.title = `Verumen — @${authUsername}`;
    else if (p.startsWith('/profile/@')) document.title = `Verumen — ${p.slice('/profile/'.length)}`;
    else if (p === '/admin') document.title = 'Verumen — Admin';
    else if (p === '/moderator') document.title = 'Verumen — Moderator';
    else document.title = 'Verumen';
  }, [location.pathname, authStatus, authUsername]);

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
        {[['Space / /','Focus search'],['?','Show shortcuts'],['Esc','Close / unfocus']].map(([key, desc]) => (
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
      const showPct = sortMode !== 'currency';
      const pos = showPct ? s.todayChangePct >= 0 : s.todayGainBase >= 0;
      return (
        <div className={`bg-gray-900 rounded-xl p-4 border ${pos ? 'border-green-800' : 'border-red-800'} flex flex-col gap-2`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400 font-bold uppercase truncate">{s.ticker}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pos ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
              {showPct ? `${s.todayChangePct >= 0 ? '+' : ''}${s.todayChangePct.toFixed(2)}%` : `${s.todayGainBase >= 0 ? '+' : ''}${fmtSym(s.todayGainBase)}`}
            </span>
          </div>
          <div className="text-sm font-bold text-white truncate">{s.flag} {s.name}</div>
          <div className="text-xs text-gray-400">{fmt(s.nativePrice)} {s.currency}</div>
          <div className={`text-xs text-gray-500`}>
            {showPct ? `${s.todayGainBase >= 0 ? '+' : ''}${fmtSym(s.todayGainBase)}` : `${s.todayChangePct >= 0 ? '+' : ''}${s.todayChangePct.toFixed(2)}%`}
          </div>
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

  // ── Pages ─────────────────────────────────────────────────────────────
  const GB = () => <GlobalBar isDark={isDark} authUsername={authUsername} onNavigate={handleNavigate} onLogout={handleLogout} userRole={userRole} searchInputRef={globalSearchRef}/>;

  const PageShell = ({ children, title }) => (
    <div className={`flex flex-col h-screen pt-12 ${isDark?'bg-gray-900 text-white':'bg-gray-100 text-gray-900'}`}>
      <GB/>
      {title&&<div className={`px-8 py-3 border-b shrink-0 ${isDark?'border-gray-800 bg-gray-900':'border-gray-200 bg-white'}`}><h1 className="text-base font-bold">{title}</h1></div>}
      {children}
    </div>
  );

  const ProfileRoute = () => {
    const { username } = useParams();
    const viewUser = username ? username.replace('@','') : null;
    return <PageShell><ProfilePage isDark={isDark} authUsername={authUsername} viewUsername={viewUser}/></PageShell>;
  };

  const HomeScreen = () => {
    const apps = [
      { id: 'statera', name: 'Portfolio', desc: 'Portfolio tracker & analytics', color: 'from-blue-600 to-blue-800', icon: <svg width="44" height="44" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="#1d4ed8"/><path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>, stats: [{ label: 'Holdings', value: portfolio.length || '—' },{ label: 'Transactions', value: txCount.total || '—' },{ label: 'Dividends YTD', value: dividends?.totalThisYear > 0 ? `${Math.round(dividends.totalThisYear)} kr` : '—' }] },
      { id: 'skins', name: 'CS Skins', desc: 'Track CS inventory, P&L & Steam value', color: 'from-orange-500 to-orange-700', icon: <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-xl">CS</div>, stats: [] },
      { id: 'social', name: 'Social', desc: 'Feed, friends & skin screenshots', color: 'from-purple-600 to-purple-800', icon: <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-2xl">👥</div>, stats: [] },
      ...(authUsername === 'admin' ? [{ id: 'admin', name: 'Admin Panel', desc: 'Manage users, system & announcements', color: 'from-red-700 to-red-900', icon: <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-2xl">🛡️</div>, stats: [] }] : []),
      ...(userRole === 'moderator' ? [{ id: 'moderator', name: 'Mod Panel', desc: 'Manage users & announcements', color: 'from-blue-700 to-blue-900', icon: <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-2xl">🛡</div>, stats: [] }] : []),
    ];

    return (
      <div className={`min-h-screen pt-12 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <GB />
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
          <div className={`grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`}>
            {apps.map(app => (
              <button key={app.id} onClick={() => { const map={statera:'/portfolio',skins:'/skins',social:'/social',admin:'/admin',moderator:'/moderator'}; navigate(map[app.id]||'/'); }} className={`text-left rounded-2xl overflow-hidden border transition-all duration-200 group hover:shadow-lg hover:-translate-y-0.5 cursor-pointer ${isDark ? 'bg-gray-800 border-gray-700 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-400'}`}>
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
  };

  const PortfolioView = () => {
    const cardCls = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;
    
    return (
      <div className={`flex h-screen overflow-hidden pt-12 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <GlobalBar isDark={isDark} authUsername={authUsername} onNavigate={handleNavigate} onLogout={handleLogout} userRole={userRole} searchInputRef={globalSearchRef} />
        {showShortcuts && <ShortcutsModal />}
        
        <PortfolioSidebar
          isDark={isDark}
          isSidebarOpen={isSidebarOpen}
          authUsername={authUsername}
          portfolio={portfolio}
          txCount={txCount}
          uploadStatus={uploadStatus}
          uploadLoading={uploadLoading}
          uploadProgress={uploadProgress}
          syncStatus={syncStatus}
          syncLoading={syncLoading}
          resolveLoading={resolveLoading}
          resolveStatus={resolveStatus}
          selectedForRemoval={selectedForRemoval}
          baseCurrency={baseCurrency}
          overrides={overrides}
          overrideMsg={overrideMsg}
          overrideIsin={overrideIsin}
          overrideTicker={overrideTicker}
          showChangePassword={showChangePassword}
          authForm={authForm}
          authError={authError}
          authLoading={authLoading}
          onUpload={handleUpload}
          onSync={handleSyncPortfolio}
          onResolve={handleResolveTickers}
          onForceResolve={handleForceResolve}
          onClearTransactions={handleClearTransactions}
          onToggleRemoval={toggleRemoval}
          onRemoveSelected={handleRemoveSelected}
          onClearPortfolio={() => setPortfolio([])}
          onSetBaseCurrency={setBaseCurrency}
          onToggleDark={() => setIsDark(p => !p)}
          onShowChangePassword={() => { setShowChangePassword(true); setAuthError(''); }}
          onHideChangePassword={() => { setShowChangePassword(false); setAuthError(''); }}
          onChangePassword={handleChangePassword}
          onAuthFormChange={(field, val) => setAuthForm(f => ({ ...f, [field]: val }))}
          onAddOverride={handleAddOverride}
          onDeleteOverride={handleDeleteOverride}
          onNavigateHome={() => navigate('/')}
          onOverrideIsinChange={setOverrideIsin}
          onOverrideTicerChange={setOverrideTicker}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 pt-6 pb-0">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setIsSidebarOpen(p => !p)} title="Toggle sidebar"
                className={`p-2 rounded-lg ${isDark ? 'text-gray-500 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              <h1 className="text-xl font-bold tracking-tight flex-1">Portfolio Tracker</h1>
              <button onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (?)"
                className={`px-2 py-1 rounded-lg text-xs font-mono font-bold border ${isDark ? 'text-gray-600 border-gray-700 hover:text-white hover:border-gray-500' : 'text-gray-300 border-gray-200 hover:text-gray-900 hover:border-gray-400'} transition`}>?</button>
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

          <div className="max-w-7xl mx-auto px-6 py-6">
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
                      <EmptyState icon="📊" title="No portfolio data" desc="Upload a CSV from your broker to get started." action={{ label: 'Upload CSV', fn: () => { setIsSidebarOpen(true); } }} />
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
                        {dividends && dividends.totalAllTime > 0 && (
                          <div className={`${cardCls} p-6`}>
                            <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>Dividend Dashboard</h3>
                            <div className="grid grid-cols-2 gap-4 mb-8">
                              <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} rounded-xl p-4`}><p className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>All-Time</p><p className="text-3xl font-bold">{fmt(dividends.totalAllTime)} kr</p></div>
                              <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} rounded-xl p-4`}><p className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>This Year</p><p className="text-3xl font-bold">{fmt(dividends.totalThisYear)} kr</p></div>
                            </div>
                            <div className="flex flex-col gap-1 mb-8">
                              {dividends.byYear.map(({ year, total, stocks }) => (
                                <div key={year}>
                                  <div onClick={() => setExpandedYear(expandedYear === year ? null : year)} className={`flex items-center gap-3 py-1 cursor-pointer rounded-lg px-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition`}>
                                    <span className={`text-sm font-bold w-12 shrink-0 text-right ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{year}</span>
                                    <div className={`flex-1 h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-slate-500 rounded" style={{ width: `${(total / Math.max(...dividends.byYear.map(y=>y.total))) * 100}%` }} /></div>
                                    <span className={`text-sm font-bold w-28 text-right shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{fmt(total)} kr</span>
                                    <span className={`text-xs w-4 shrink-0 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{expandedYear === year ? '▲' : '▼'}</span>
                                  </div>
                                  <div style={{ maxHeight: expandedYear === year ? `${(stocks?.length || 0) * 28 + 16}px` : '0px', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                                    <div className={`ml-14 mt-1 mb-2 flex flex-col gap-1 border-l-2 ${isDark ? 'border-gray-700' : 'border-gray-200'} pl-3`}>
                                      {stocks?.map(({ name, total: sTotal }) => (
                                        <div key={name} className="flex items-center gap-3">
                                          <span className={`text-xs w-44 shrink-0 truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{name}</span>
                                          <div className={`flex-1 h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-slate-600 rounded" style={{ width: `${(sTotal / (stocks[0]?.total || 1)) * 100}%` }} /></div>
                                          <span className={`text-xs w-24 text-right shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{fmt(sTotal)} kr</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
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
                            {rows.map(s => (
                              <tr key={s.ticker} className={`border-t ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'} transition`}>
                                <td className="p-4 font-bold">{s.flag} {s.cleanName || s.name}</td>
                                <td className={`p-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{s.ticker}</td>
                                <td className="p-4 whitespace-nowrap">{fmt(s.nativePrice)} {s.currency}</td>
                                <td className={`p-4 font-bold whitespace-nowrap ${s.todayChangePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.todayChangePct >= 0 ? '+' : ''}{s.todayChangePct.toFixed(2)}%</td>
                                <td className="p-4">{s.quantity}</td>
                                <td className={`p-4 font-bold whitespace-nowrap ${s.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.profit >= 0 ? '+' : ''}{fmtSym(s.profit)}</td>
                                <td className={`p-4 font-bold whitespace-nowrap ${s.returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(2)}%</td>
                                <td className="p-4 whitespace-nowrap">{fmtSym(s.currentValue)}</td>
                              </tr>
                            ))}
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
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'ownership' && (() => {
                  const allHoldings = dashboardData ? dashboardData.portfolio.filter(h => !h.quoteType || h.quoteType === 'EQUITY') : [];
                  const OwnershipCard = ({ ticker, name, isExtra = false }) => {
                    const data = isExtra ? ownershipExtra[ticker] : ownershipData[ticker];
                    return (
                      <div className={`${cardCls} p-5`}>
                        <div className="flex items-center gap-3 mb-4">
                          <span className={`font-bold text-sm ${isDark ? 'bg-gray-700' : 'bg-gray-100'} px-2 py-1 rounded-lg`}>{ticker}</span>
                          <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{name}</span>
                        </div>
                        {!data ? <div className="flex items-center justify-center h-16"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div> : (
                          <div className={`flex gap-6`}>
                            <div><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Institutional</p><p className="text-xl font-bold">{data.institutionPct ? `${(data.institutionPct * 100).toFixed(1)}%` : '—'}</p></div>
                            <div><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Insider</p><p className="text-xl font-bold">{data.insiderPct ? `${(data.insiderPct * 100).toFixed(1)}%` : '—'}</p></div>
                          </div>
                        )}
                      </div>
                    );
                  };
                  return (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center gap-3">
                        <input type="text" value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)} placeholder="Filter..." className={`flex-1 px-3 py-2 ${isDark ? 'bg-gray-700 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900'} rounded-lg text-sm outline-none`} />
                      </div>
                      {!Object.keys(ownershipData).length && !ownershipLoading && <button onClick={() => fetchOwnership(allHoldings)} className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl transition">Load Ownership Data</button>}
                      <div className="flex flex-col gap-4">{allHoldings.map(h => <OwnershipCard key={h.ticker} ticker={h.ticker} name={h.name}/>)}</div>
                    </div>
                  );
                })()}

                {activeTab === 'history' && (
                  <div className="flex flex-col gap-4">
                    {txHistory.length === 0 && !txHistoryLoading ? <EmptyState icon="📝" title="No transactions" desc="Upload a CSV to populate history." /> : (
                      <div className={`${cardCls} overflow-hidden`}>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                              <tr>{['Date','Type','Ticker','Name','Qty','Price','Total (SEK)'].map(h => <th key={h} className={`p-3 font-bold text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'} uppercase tracking-wider`}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {txHistory.slice(0, 500).map((tx, i) => (
                                <tr key={i} className={`border-t ${isDark ? 'border-gray-700/50 hover:bg-gray-700/20' : 'border-gray-100 hover:bg-gray-50'} transition`}>
                                  <td className="p-3 text-xs font-mono">{tx.date}</td>
                                  <td className="p-3">{tx.type}</td>
                                  <td className="p-3 font-bold">{tx.ticker}</td>
                                  <td className="p-3 truncate max-w-xs">{tx.name}</td>
                                  <td className="p-3">{tx.quantity}</td>
                                  <td className="p-3">{fmt(tx.price)}</td>
                                  <td className={`p-3 font-bold ${tx.totalSEK >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(tx.totalSEK)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Auth screens ────────────────────────────────────────────────────────────
  if (authStatus === 'loading') return (
    <div className={`flex h-screen items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  if (authStatus !== 'logged-in') {
    const isSignup = authMode === 'signup';
    return (
      <div className={`flex h-screen items-center justify-center ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <div className={`w-full max-w-sm mx-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl shadow-2xl overflow-hidden`}>
          <div className="bg-linear-to-br from-blue-600 to-blue-800 p-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <svg width="32" height="32" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="rgba(255,255,255,0.15)"/><path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="text-2xl font-bold text-white tracking-tight">Verumen</span>
            </div>
            <p className="text-blue-200 text-sm">{isSignup ? 'Create your account' : 'Welcome back'}</p>
          </div>
          <div className="p-8">
            {authError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-5 text-sm text-red-400">{authError}</div>}
            <div className="flex flex-col gap-4">
              {['username','password',...(isSignup?['confirmPassword']:[])].map(field => (
                <div key={field}>
                  <label className={`text-xs font-semibold uppercase tracking-wider block mb-1.5 ${isDark?'text-gray-400':'text-gray-500'}`}>{field==='confirmPassword'?'Confirm Password':field.charAt(0).toUpperCase()+field.slice(1)}</label>
                  <input type={field==='username'?'text':'password'} value={authForm[field]} onChange={e=>setAuthForm(f=>({...f,[field]:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} autoFocus={field==='username'}
                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition ${isDark?'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500':'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500'} focus:ring-2 focus:ring-blue-500/20`}/>
                </div>
              ))}
              <button onClick={handleAuth} disabled={authLoading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm">
                {authLoading?<span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in...</span>:isSignup?'Create Account':'Sign In'}
              </button>
              {authStatus==='logged-out' && allowRegistration && <button onClick={()=>{setAuthMode(isSignup?'login':'signup');setAuthError('');setAuthForm({username:'',password:'',confirmPassword:'',newPassword:''});}} className={`text-sm text-center ${isDark?'text-gray-400 hover:text-white':'text-gray-500 hover:text-gray-900'} transition`}>{isSignup?'Already have an account? Sign in':'Create an account'}</button>}
              {authStatus==='logged-out' && !allowRegistration && authMode==='login' && <p className={`text-xs text-center ${isDark?'text-gray-500':'text-gray-400'}`}>Registration is currently closed.</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main App Return with Routes ─────────────────────────────────────────────
  return (
    <Routes>
      <Route path="/" element={<HomeScreen/>}/>
      <Route path="/portfolio" element={<PortfolioView/>}/>
      <Route path="/skins" element={<PageShell><CSSkins isDark={isDark} onBack={()=>navigate('/')} authUsername={authUsername}/></PageShell>}/>
      <Route path="/social" element={<PageShell><SocialFeed isDark={isDark} authUsername={authUsername} onViewProfile={u=>navigate(`/profile/@${u}`)}/></PageShell>}/>
      <Route path="/profile" element={<ProfileRoute/>}/>
      <Route path="/profile/:username" element={<ProfileRoute/>}/>
      <Route path="/admin" element={<PageShell title="🛡️ Admin Panel"><AdminPanel isDark={isDark} authUsername={authUsername}/></PageShell>}/>
      <Route path="/moderator" element={<PageShell title="🛡 Moderator Panel"><ModeratorPanel isDark={isDark} authUsername={authUsername} userRole={userRole}/></PageShell>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  );
}