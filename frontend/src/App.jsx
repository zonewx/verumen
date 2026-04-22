import { useState, useEffect, useCallback, useRef } from 'react';
import CSSkins from './CSSkins';

export default function App() {
  // ── Core state ─────────────────────────────────────────────────────────────
  // ── Auth state ────────────────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('loading'); // 'loading' | 'no-user' | 'logged-out' | 'logged-in'
  const [authUsername, setAuthUsername] = useState('');
  const [homeApp, setHomeApp] = useState(null); // null = home screen, 'statera' | 'skins'
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [authForm, setAuthForm] = useState({ username: '', password: '', confirmPassword: '', newPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

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

  // ── Today card sort ────────────────────────────────────────────────────────
  const [todaySortMode, setTodaySortMode] = useState('pct');
  const [todayCogOpen, setTodayCogOpen] = useState(false);

  // ── Ownership ─────────────────────────────────────────────────────────────
  const [ownershipData, setOwnershipData] = useState({});
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [ownershipFilter, setOwnershipFilter] = useState('');
  const [ownershipSort, setOwnershipSort] = useState('value');
  const [ownershipSearch, setOwnershipSearch] = useState('');
  const [ownershipSearchResults, setOwnershipSearchResults] = useState([]);
  const [ownershipSearchLoading, setOwnershipSearchLoading] = useState(false);
  const [ownershipExtra, setOwnershipExtra] = useState({});

  // ── Performance chart ──────────────────────────────────────────────────────
  const [perfData, setPerfData] = useState([]);
  const [perfPeriod, setPerfPeriod] = useState('3M');
  const [perfLoading, setPerfLoading] = useState(false);

  // ── Transaction history ───────────────────────────────────────────────────
  const [txHistory, setTxHistory] = useState([]);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState({ import: false, manage: false, settings: false });
  const prevTotals = useRef(null);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async (p, c) => {
    setIsAppLoading(true);
    try {
      const [dashRes, divRes, txRes, overRes] = await Promise.all([
        p.length > 0
          ? fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portfolio: p, baseCurrency: c }) }).then(r => r.json())
          : Promise.resolve(null),
        fetch('/api/dividends').then(r => r.json()),
        fetch('/api/transactions/count').then(r => r.json()),
        fetch('/api/overrides').then(r => r.json()),
      ]);
      setDashboardData(dashRes);
      setDividends(divRes);
      setTxCount(txRes);
      setOverrides(overRes);
    } catch (e) { console.error('Failed to load app data:', e); }
    finally { setIsAppLoading(false); }
  }, []);

  const fetchOwnership = useCallback((tickers) => {
    if (!tickers?.length) return;
    setOwnershipLoading(true);
    fetch('/api/ownership', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickers: tickers.map(h => ({ ticker: h.ticker, name: h.name, isin: h.isin })) }) })
      .then(r => r.json())
      .then(rows => { const m = {}; rows.forEach(r => { m[r.ticker] = r; }); setOwnershipData(m); setOwnershipLoading(false); })
      .catch(() => setOwnershipLoading(false));
  }, []);

  const fetchPerfData = useCallback(async (period) => {
    if (!portfolio.length) return;
    setPerfLoading(true);
    try {
      const res = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portfolio, baseCurrency, period }) });
      setPerfData(await res.json());
    } catch (e) { console.error('Perf fetch failed:', e); }
    finally { setPerfLoading(false); }
  }, [portfolio, baseCurrency]);

  const fetchTxHistory = useCallback(async () => {
    setTxHistoryLoading(true);
    try {
      const res = await fetch('/api/transactions');
      setTxHistory(await res.json());
    } catch (e) { console.error('TX history failed:', e); }
    finally { setTxHistoryLoading(false); }
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────
  // ── Auth check on mount ───────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(d => {
        if (!d.hasUser) { setAuthStatus('no-user'); setAuthMode('signup'); }
        else {
          const saved = sessionStorage.getItem('auth_user');
          if (saved) { setAuthStatus('logged-in'); setAuthUsername(saved); }
          else setAuthStatus('logged-out');
        }
      })
      .catch(() => setAuthStatus('logged-out'));
  }, []);

  const handleAuth = async (e) => {
    e && e.preventDefault && e.preventDefault();
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
    } catch { setAuthError('Connection error. Is the server running?'); }
    setAuthLoading(false);
  };

  const handleChangePassword = async () => {
    setAuthError(''); setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: authForm.password, newPassword: authForm.newPassword }) });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
      setShowChangePassword(false); setAuthForm(f => ({ ...f, password: '', newPassword: '' }));
      setAuthError('');
    } catch { setAuthError('Failed to change password.'); }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('auth_user');
    setAuthStatus('logged-out'); setAuthUsername('');
    setAuthForm({ username: '', password: '', confirmPassword: '', newPassword: '' });
    setHomeApp(null);
  };

    useEffect(() => {
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
    localStorage.setItem('baseCurrency', baseCurrency);
    fetchAllData(portfolio, baseCurrency);
  }, [portfolio, baseCurrency, fetchAllData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (portfolio.length > 0) {
        fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portfolio, baseCurrency }) })
          .then(r => r.json()).then(setDashboardData).catch(console.error);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [portfolio, baseCurrency]);

  useEffect(() => {
    if (activeTab === 'performance' && portfolio.length > 0) fetchPerfData(perfPeriod);
  }, [activeTab, perfPeriod]);

  useEffect(() => {
    if (activeTab === 'history') fetchTxHistory();
  }, [activeTab]);

  useEffect(() => {
    if (!todayCogOpen) return;
    const close = () => setTodayCogOpen(false);
    document.addEventListener('click', close, { capture: true, once: true });
    return () => document.removeEventListener('click', close, { capture: true });
  }, [todayCogOpen]);

  useEffect(() => {
    let msg = 'STATERA Group - '; let pos = 0;
    const ti = setInterval(() => { document.title = msg.substring(pos) + msg.substring(0, pos); pos = (pos + 1) % msg.length; }, 200);
    const hcm = e => e.preventDefault();
    const hkd = e => {
      if ((e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) || (e.keyCode === 83 && (navigator.platform.match('Mac') ? e.metaKey : e.ctrlKey)) || (e.ctrlKey && e.keyCode === 85) || (e.keyCode === 123)) { e.preventDefault(); return false; }
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); setIsSidebarOpen(p => !p); }
      if (e.key === '?' && document.activeElement.tagName !== 'INPUT') setShowShortcuts(p => !p);
      if (e.key === 'Escape') setShowShortcuts(false);
    };
    document.addEventListener('contextmenu', hcm); document.addEventListener('keydown', hkd);
    return () => { clearInterval(ti); document.removeEventListener('contextmenu', hcm); document.removeEventListener('keydown', hkd); };
  }, []);

  // ── CSV import ─────────────────────────────────────────────────────────────
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
    setSyncLoading(true);
    setSyncStatus('Reconstructing portfolio from transactions...');
    try {
      const res = await fetch('/api/transactions/reconstruct');
      const reconstructed = await res.json();
      if (!reconstructed.length) { setSyncStatus('No current holdings found.'); }
      else { setPortfolio(reconstructed); setSyncStatus(`✓ Portfolio synced — ${reconstructed.length} holding${reconstructed.length !== 1 ? 's' : ''} imported.`); }
    } catch { setSyncStatus('Sync failed. Please try again.'); }
    setSyncLoading(false);
  };

  const handleResolveTickers = async () => {
    setResolveLoading(true);
    setResolveStatus('Resolving tickers via Yahoo Finance...');
    try {
      const res = await fetch('/api/transactions/resolve', { method: 'POST' });
      const data = await res.json();
      if (data.resolved > 0) {
        setResolveStatus(`✓ Resolved ${data.resolved} of ${data.total} tickers. Syncing...`);
        await handleSyncPortfolio();
      } else if (data.total === 0) {
        setResolveStatus('All tickers already resolved.');
      } else {
        setResolveStatus(`Could not resolve ${data.total} tickers. Try adding overrides in Settings.`);
      }
    } catch { setResolveStatus('Resolve failed. Please try again.'); }
    setResolveLoading(false);
  };

  const handleUpload = async (files) => {
    if (!files.length) return;
    setUploadLoading(true); setUploadStatus(null); setSyncStatus('');
    try {
      const payloads = await Promise.all(Array.from(files).map(readFile));
      const res = await fetch('/api/transactions/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: payloads }) });
      const data = await res.json();
      setUploadStatus({ results: data.results, newAdded: data.newAdded ?? 0, total: data.total ?? 0 });
      await handleSyncPortfolio();
    } catch { setUploadStatus({ error: 'Upload failed. Please try again.' }); }
    setUploadLoading(false);
  };

  const handleClearTransactions = async () => {
    await fetch('/api/transactions', { method: 'DELETE' });
    setTxCount({ total: 0, trades: 0 }); setPortfolio([]); setUploadStatus(null); setDividends(null);
    setSyncStatus('Transaction history cleared.');
  };

  const toggleRemoval = t => setSelectedForRemoval(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
  const handleRemoveSelected = () => { setPortfolio(p => p.filter(s => !selectedForRemoval.includes(s.ticker))); setSelectedForRemoval([]); };
  const handleClearPortfolio = () => setPortfolio([]);

  const handleAddOverride = async () => {
    const isin = overrideIsin.trim().toUpperCase(), ticker = overrideTicker.trim().toUpperCase();
    if (!isin || !ticker) return;
    await fetch('/api/overrides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isin, ticker }) });
    setOverrideIsin(''); setOverrideTicker('');
    fetchAllData(portfolio, baseCurrency);
    setOverrideMsg(`Saved: ${isin} → ${ticker}. Re-upload CSVs to apply.`);
    setTimeout(() => setOverrideMsg(''), 5000);
  };

  const handleDeleteOverride = async isin => {
    await fetch(`/api/overrides/${isin}`, { method: 'DELETE' });
    fetchAllData(portfolio, baseCurrency);
  };

  const toggleSidebarSection = key => setSidebarCollapsed(p => ({ ...p, [key]: !p[key] }));

  // ── Derived values ─────────────────────────────────────────────────────────
  const sym = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'SEK': 'kr' }[baseCurrency] || baseCurrency;
  const totals = dashboardData?.totals;
  const plPositive = totals?.profit >= 0;
  const plColor = plPositive ? 'text-green-400' : 'text-red-400';
  const plSign = plPositive ? '+' : '';
  const todayTotal = dashboardData ? dashboardData.portfolio.reduce((s, x) => s + x.todayGainBase, 0) : null;
  const todayPositive = todayTotal >= 0;
  const todayPct = todayTotal !== null && totals && totals.value - todayTotal !== 0 ? (todayTotal / (totals.value - todayTotal)) * 100 : null;

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'holdings', label: 'Holdings' },
    { id: 'performance', label: 'Performance' },
    { id: 'ownership', label: 'Ownership' },
    { id: 'insights', label: 'Insights' },
    { id: 'history', label: 'History' },
  ];
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

  const getCurrencyData = () => {
    if (!dashboardData?.portfolio) return [];
    const m = {};
    dashboardData.portfolio.forEach(s => {
      const cur = s.currency || baseCurrency;
      m[cur] = (m[cur] || 0) + s.currentValue;
    });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const fmt = n => n?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—';
  const fmtSym = n => n != null ? `${fmt(n)} ${sym}` : '—';

  // ── Sub-components ─────────────────────────────────────────────────────────

  const EmptyState = ({ icon, title, desc, action }) => (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-300 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-6">{desc}</p>
      {action && <button onClick={action.fn} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold transition">{action.label}</button>}
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

  const DivergingBars = ({ data }) => {
    const maxAbs = Math.max(...data.map(d => Math.abs(d.returnPct)), 1);
    return (
      <div className="flex flex-col gap-3">{data.map(s => {
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
      })}</div>
    );
  };

  const TodayCards = ({ data, sym, sortMode }) => {
    const sorted = [...data].sort((a, b) => sortMode === 'currency' ? b.todayGainBase - a.todayGainBase : b.todayChangePct - a.todayChangePct);
    const best = sorted.slice(0, 3);
    const worst = [...sorted].reverse().slice(0, 3);
    const Card = ({ s }) => {
      const pos = s.todayChangePct >= 0;
      return (
        <div className={`bg-gray-900 rounded-xl p-4 border ${pos ? 'border-green-800' : 'border-red-800'} flex flex-col gap-2 min-w-0 transition-all duration-200`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider truncate">{s.ticker}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pos ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>{pos ? '+' : ''}{s.todayChangePct.toFixed(2)}%</span>
          </div>
          <div className="text-sm font-bold text-white truncate">{s.flag || ''} {s.name}</div>
          <div className="text-xs text-gray-400">{fmt(s.nativePrice)} {s.currency}</div>
          <div className={`text-xs font-bold ${s.todayGainBase >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.todayGainBase >= 0 ? '+' : ''}{fmtSym(s.todayGainBase)}</div>
        </div>
      );
    };
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-4"><div className="w-1 h-5 bg-green-500 rounded" /><h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Best Today</h3></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{best.map(s => <Card key={s.ticker} s={s} />)}</div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-4"><div className="w-1 h-5 bg-red-500 rounded" /><h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Worst Today</h3></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{worst.map(s => <Card key={s.ticker} s={s} />)}</div>
        </div>
      </div>
    );
  };

  const LineChart = ({ data, loading }) => {
    if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (!data?.length) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">No performance data available for this period.</div>;
    const W = 800, H = 260, PL = 52, PR = 16, PT = 16, PB = 32;
    const cw = W - PL - PR, ch = H - PT - PB;
    const vals = data.map(d => d.returnPct);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const pad = range * 0.1;
    const lo = minV - pad, hi = maxV + pad;
    const tx = (i) => PL + (i / (data.length - 1)) * cw;
    const ty = (v) => PT + ch - ((v - lo) / (hi - lo)) * ch;
    const pts = data.map((d, i) => `${tx(i)},${ty(d.returnPct)}`).join(' ');
    const fillPts = `${PL},${PT + ch} ` + data.map((d, i) => `${tx(i)},${ty(d.returnPct)}`).join(' ') + ` ${tx(data.length - 1)},${PT + ch}`;
    const lastVal = vals[vals.length - 1];
    const positive = lastVal >= 0;
    const lineColor = positive ? '#10b981' : '#ef4444';
    const gridCount = 4;
    const gridVals = Array.from({ length: gridCount + 1 }, (_, i) => lo + (hi - lo) * i / gridCount);
    const labelCount = Math.min(6, data.length);
    const labelIdxs = Array.from({ length: labelCount }, (_, i) => Math.round(i * (data.length - 1) / (labelCount - 1)));
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 260 }}>
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={ty(v)} x2={W - PR} y2={ty(v)} stroke="#374151" strokeWidth="0.5" />
            <text x={PL - 4} y={ty(v) + 4} textAnchor="end" fontSize="10" fill="#6b7280">{v.toFixed(1)}%</text>
          </g>
        ))}
        {ty(0) > PT && ty(0) < PT + ch && <line x1={PL} y1={ty(0)} x2={W - PR} y2={ty(0)} stroke="#4b5563" strokeWidth="1" strokeDasharray="4,3" />}
        <polygon points={fillPts} fill="url(#chartGrad)" />
        <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {labelIdxs.map(i => <text key={i} x={tx(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b7280">{data[i].date.slice(5)}</text>)}
        <circle cx={tx(data.length - 1)} cy={ty(lastVal)} r="4" fill={lineColor} />
      </svg>
    );
  };

  const getSectorData = d => {
    const m = {};
    d.forEach(s => { const sec = s.sector && s.sector !== 'Unknown' ? s.sector : 'Other'; m[sec] = (m[sec] || 0) + s.currentValue; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const ShortcutsModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowShortcuts(false)}>
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">Keyboard shortcuts</h3>
          <button onClick={() => setShowShortcuts(false)} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        {[
          ['Space', 'Toggle sidebar'],
          ['?', 'Show this panel'],
          ['Esc', 'Close modals'],
        ].map(([key, desc]) => (
          <div key={key} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
            <span className="text-sm text-gray-300">{desc}</span>
            <kbd className="bg-gray-700 text-gray-200 text-xs font-mono px-2 py-1 rounded">{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  // ── Auth screen ───────────────────────────────────────────────────────────
  if (authStatus === 'loading') {
    return (
      <div className={`flex h-screen items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authStatus === 'no-user' || authStatus === 'logged-out') {
    const isSignup = authMode === 'signup';
    return (
      <div className={`flex h-screen items-center justify-center ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <div className={`w-full max-w-sm mx-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl shadow-2xl overflow-hidden`}>
          {/* Header */}
          <div className="bg-linear-to-br from-blue-600 to-blue-800 p-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="6" fill="rgba(255,255,255,0.15)"/>
                <path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18 10l2.5-2.5M20.5 7.5l-2 0M20.5 7.5l0 2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-2xl font-bold text-white tracking-tight">Statera</span>
            </div>
            <p className="text-blue-200 text-sm">{isSignup ? 'Create your account' : 'Welcome back'}</p>
          </div>

          {/* Form */}
          <div className="p-8">
            {authError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-5 text-sm text-red-400">
                {authError}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'} block mb-1.5`}>Username</label>
                <input
                  type="text"
                  value={authForm.username}
                  onChange={e => setAuthForm(f => ({ ...f, username: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  placeholder="Enter your username"
                  autoFocus
                  className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500'} focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'} block mb-1.5`}>Password</label>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  placeholder={isSignup ? 'At least 6 characters' : 'Enter your password'}
                  className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500'} focus:ring-2 focus:ring-blue-500/20`}
                />
              </div>
              {isSignup && (
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'} block mb-1.5`}>Confirm Password</label>
                  <input
                    type="password"
                    value={authForm.confirmPassword}
                    onChange={e => setAuthForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAuth()}
                    placeholder="Repeat your password"
                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-500'} focus:ring-2 focus:ring-blue-500/20`}
                  />
                </div>
              )}

              <button
                onClick={handleAuth}
                disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm mt-1"
              >
                {authLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {isSignup ? 'Creating account...' : 'Signing in...'}
                  </span>
                ) : isSignup ? 'Create Account' : 'Sign In'}
              </button>

              {authStatus === 'logged-out' && (
                <button
                  onClick={() => { setAuthMode(isSignup ? 'login' : 'signup'); setAuthError(''); setAuthForm({ username: '', password: '', confirmPassword: '', newPassword: '' }); }}
                  className={`text-sm text-center ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition`}
                >
                  {isSignup ? 'Already have an account? Sign in' : 'Create an account'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CS Skins app ──────────────────────────────────────────────────────────
  if (homeApp === 'skins') {
    return <CSSkins isDark={isDark} onBack={() => setHomeApp(null)} authUsername={authUsername} />;
  }

  // ── Home screen ───────────────────────────────────────────────────────────
  if (!homeApp) {
    const apps = [
      {
        id: 'statera',
        name: 'Statera',
        desc: 'Portfolio tracker & analytics',
        icon: (
          <svg width="44" height="44" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#1d4ed8"/>
            <path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18 10l2.5-2.5M20.5 7.5l-2 0M20.5 7.5l0 2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
        color: 'from-blue-600 to-blue-800',
        stats: [
          { label: 'Holdings', value: portfolio.length > 0 ? portfolio.length : '—' },
          { label: 'Transactions', value: txCount.total > 0 ? txCount.total : '—' },
          { label: 'Dividends', value: dividends?.totalThisYear > 0 ? `${Math.round(dividends.totalThisYear)} kr` : '—' },
        ],
        badge: null,
      },
      {
        id: 'skins',
        name: 'CS Skins',
        desc: 'Track CS inventory, P&L & Steam value',
        icon: (
          <svg width="44" height="44" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#f97316"/>
            <path d="M8 20l4-12 4 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 16h4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="20" cy="10" r="3" stroke="white" strokeWidth="1.8"/>
          </svg>
        ),
        color: 'from-orange-500 to-orange-700',
        stats: [],
        badge: null,
      },
    ];

    return (
      <div className={`min-h-screen ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        {/* Top bar */}
        <div className={`flex items-center justify-between px-8 py-4 border-b ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-3">
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="6" fill="#0f1e3c"/>
              <path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18 10l2.5-2.5M20.5 7.5l-2 0M20.5 7.5l0 2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-bold text-base tracking-tight">Statera</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{authUsername}</span>
            <button onClick={() => setIsDark(p => !p)} className={`p-1.5 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition text-sm`}>{isDark ? '☀️' : '🌙'}</button>
            <button onClick={handleLogout} className={`p-1.5 rounded-lg ${isDark ? 'text-gray-400 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'} transition`} title="Sign out">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="max-w-4xl mx-auto px-8 py-16">
          <div className="mb-12">
            <h1 className="text-3xl font-bold mb-2">Welcome back, {authUsername}</h1>
            <p className={`text-base ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Choose an app to open.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {apps.map(app => (
              <button
                key={app.id}
                onClick={() => setHomeApp(app.id)}
                className={`text-left rounded-2xl overflow-hidden border transition-all duration-200 group
                  ${isDark ? 'bg-gray-800 border-gray-700 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-400'}
                  hover:shadow-lg hover:-translate-y-0.5 cursor-pointer
                `}
              >
                {/* Card header */}
                <div className={`bg-linear-to-br ${app.color} p-6 flex items-start justify-between`}>
                  <div>{app.icon}</div>
                  {app.badge && (
                    <span className="text-xs font-semibold bg-white/20 text-white px-2.5 py-1 rounded-full">{app.badge}</span>
                  )}
                </div>

                {/* Card body */}
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
                  {app.id !== 'skins' && (
                    <div className={`mt-4 flex items-center gap-1 text-sm font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                      Open <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden font-sans ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {showShortcuts && <ShortcutsModal />}

      {/* SIDEBAR */}
      <div className={`w-72 shrink-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r transition-all duration-300 z-10 overflow-y-auto flex flex-col ${isSidebarOpen ? '' : '-ml-72'}`}>

        {/* Logo */}
        <div className={`flex items-center gap-3 px-5 py-5 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} shrink-0`}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#0f1e3c"/>
            <path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18 10l2.5-2.5M20.5 7.5l-2 0M20.5 7.5l0 2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="flex-1 min-w-0">
            <span className="text-lg font-bold tracking-tight block">Statera</span>
            <span className={`text-xs truncate block ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{authUsername}</span>
          </div>
          <button onClick={() => setHomeApp(null)} title="Back to home" className={`shrink-0 p-1.5 rounded-lg ${isDark ? 'text-gray-500 hover:text-white hover:bg-gray-700' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
          <button onClick={handleLogout} title="Sign out" className={`shrink-0 p-1.5 rounded-lg ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-gray-700' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'} transition`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className={`flex flex-col gap-1 px-3 pt-4 pb-2 shrink-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} mb-1`}>
          {[
            { key: 'import', label: 'Import CSV', icon: (<><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 12l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/></>) },
            { key: 'manage', label: 'Manage Portfolio', icon: (<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6" strokeLinecap="round"/></>) },
            { key: 'settings', label: 'Settings', icon: (<><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>) },
          ].map(({ key, label, icon }) => (
            <div key={key}>
              <button
                onClick={() => toggleSidebarSection(key)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition text-left ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">{icon}</svg>
                <span className="flex-1">{label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${sidebarCollapsed[key] ? '-rotate-90' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
              </button>

              {/* Section content */}
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
                      {txCount.trades > 0 && (
                        <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg px-3 py-2`}>
                          <p className="text-sm font-bold text-green-400">{txCount.trades} trades</p>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{txCount.total} total in history</p>
                        </div>
                      )}
                      {txCount.trades > 0 && (
                        <button onClick={handleSyncPortfolio} disabled={syncLoading} className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 py-2 rounded-lg font-bold text-sm transition text-white">
                          {syncLoading ? 'Syncing…' : 'Sync Portfolio'}
                        </button>
                      )}
                      {syncStatus && <p className={`text-xs ${syncStatus.startsWith('✓') ? 'text-green-400' : 'text-gray-400'}`}>{syncStatus}</p>}
                      {txCount.trades > 0 && (
                        <button onClick={handleResolveTickers} disabled={resolveLoading} className={`w-full py-2 rounded-lg font-bold text-sm transition disabled:opacity-50 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                          {resolveLoading ? '⏳ Resolving...' : '🔍 Resolve Tickers'}
                        </button>
                      )}
                      {resolveStatus && <p className={`text-xs ${resolveStatus.startsWith('✓') ? 'text-green-400' : 'text-gray-400'}`}>{resolveStatus}</p>}
                      {txCount.total > 0 && (
                        <button onClick={handleClearTransactions} className={`w-full ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} py-2 rounded-lg font-bold text-sm transition`}>
                          Clear History
                        </button>
                      )}
                    </div>
                  )}
                  {key === 'manage' && (
                    <div>
                      <div className="flex flex-col gap-1 mb-3 max-h-48 overflow-y-auto">
                        {portfolio.length === 0
                          ? <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Portfolio is empty.</p>
                          : portfolio.map(s => (
                            <label key={s.ticker} className={`flex items-center p-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} rounded cursor-pointer transition`}>
                              <input type="checkbox" checked={selectedForRemoval.includes(s.ticker)} onChange={() => toggleRemoval(s.ticker)} className="mr-3" />{s.ticker}
                            </label>
                          ))}
                      </div>
                      <button onClick={handleRemoveSelected} className="w-full bg-red-600 hover:bg-red-500 p-2 rounded font-bold text-sm text-white transition mb-1.5">Remove Selected</button>
                      <button onClick={handleClearPortfolio} className={`w-full ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-100 hover:bg-gray-200'} p-2 rounded font-bold text-sm transition`}>Clear Portfolio</button>
                    </div>
                  )}
                  {key === 'settings' && (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider block mb-1.5`}>Currency</label>
                        <select value={baseCurrency} onChange={e => setBaseCurrency(e.target.value)} className={`w-full p-2 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded outline-none focus:ring-2 focus:ring-blue-500 text-sm`}>
                          <option>EUR</option><option>GBP</option><option>SEK</option><option>USD</option>
                        </select>
                      </div>
                      <div>
                        <label className={`text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider block mb-1.5`}>Appearance</label>
                        <button onClick={() => setIsDark(p => !p)} className={`w-full py-2 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded text-sm font-medium transition flex items-center justify-center gap-2`}>
                          <span>{isDark ? '☀️' : '🌙'}</span>
                          {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        </button>
                      {!showChangePassword ? (
                        <button onClick={() => { setShowChangePassword(true); setAuthError(''); }} className={`w-full py-2 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded text-sm font-medium transition`}>
                          🔑 Change Password
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Change Password</p>
                          <input type="password" value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))} placeholder="Current password" className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900'} focus:ring-2 focus:ring-blue-500`} />
                          <input type="password" value={authForm.newPassword} onChange={e => setAuthForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="New password (6+ chars)" className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900'} focus:ring-2 focus:ring-blue-500`} />
                          {authError && <p className="text-xs text-red-400">{authError}</p>}
                          <div className="flex gap-2">
                            <button onClick={handleChangePassword} disabled={authLoading} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition disabled:opacity-50">Save</button>
                            <button onClick={() => { setShowChangePassword(false); setAuthError(''); }} className={`flex-1 py-1.5 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded text-xs font-bold transition`}>Cancel</button>
                          </div>
                        </div>
                      )}
                      </div>
                      <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} pt-3`}>
                        <h3 className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-2`}>Ticker Overrides</h3>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-3`}>Pin ISIN to correct Yahoo ticker. Takes effect on next upload.</p>
                        <div className="flex gap-2 mb-2">
                          <input type="text" value={overrideIsin} onChange={e => setOverrideIsin(e.target.value)} placeholder="ISIN" className={`flex-1 p-2 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded text-xs outline-none focus:ring-2 focus:ring-blue-500`} />
                          <input type="text" value={overrideTicker} onChange={e => setOverrideTicker(e.target.value)} placeholder="Ticker" className={`flex-1 p-2 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded text-xs outline-none focus:ring-2 focus:ring-blue-500`} />
                        </div>
                        <button onClick={handleAddOverride} className="w-full bg-blue-600 hover:bg-blue-500 p-2 rounded font-bold text-sm text-white transition mb-2">Save Override</button>
                        {overrideMsg && <p className="text-xs text-green-400 mb-2">{overrideMsg}</p>}
                        {Object.entries(overrides).length > 0 && (
                          <div className="flex flex-col gap-1">
                            {Object.entries(overrides).map(([isin, ticker]) => (
                              <div key={isin} className={`flex items-center justify-between ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded px-3 py-1.5`}>
                                <span className="text-xs text-gray-300">{isin} → <span className="font-bold text-white">{ticker}</span></span>
                                <button onClick={() => handleDeleteOverride(isin)} className="text-red-400 hover:text-red-300 text-xs ml-2">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 pt-8 pb-0">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setIsSidebarOpen(p => !p)} className={`p-2 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} transition`} title="Toggle sidebar (Space)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <h1 className="text-2xl font-bold tracking-tight flex-1">Portfolio Tracker</h1>
            <button onClick={() => setShowShortcuts(true)} className={`p-2 rounded-lg ${isDark ? 'text-gray-500 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} transition text-sm font-mono`} title="Keyboard shortcuts (?)">?</button>
          </div>
          <div className={`flex gap-0 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-x-auto`}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'ownership' && dashboardData && Object.keys(ownershipData).length === 0 && !ownershipLoading) fetchOwnership(dashboardData.portfolio);
                if (tab.id === 'performance' && portfolio.length > 0) fetchPerfData(perfPeriod);
                if (tab.id === 'history') fetchTxHistory();
              }}
                className={`px-5 py-2.5 text-sm font-semibold transition border-b-2 -mb-px whitespace-nowrap ${activeTab === tab.id ? 'border-blue-500 text-white' : `border-transparent ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-8 py-8">
          {isAppLoading ? (
            <div className="flex flex-col items-center justify-center mt-32 space-y-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className={`font-bold tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Synchronizing Portfolio...</p>
            </div>
          ) : (
            <>
              {/* OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="flex flex-col gap-6">
                  {!dashboardData || portfolio.length === 0 ? (
                    <EmptyState icon="📊" title="No portfolio data" desc="Upload a CSV from your broker to get started." action={{ label: 'Upload CSV', fn: () => { setIsSidebarOpen(true); setSidebarCollapsed(p => ({ ...p, import: false })); } }} />
                  ) : (
                    <>
                      {/* Stat cards */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {[
                          { label: 'Total Value', value: fmtSym(totals?.value), sub: null },
                          { label: "Today's Gain", value: todayTotal !== null ? `${todayPositive ? '+' : ''}${fmtSym(todayTotal)}` : '—', color: todayPositive ? 'text-green-400' : 'text-red-400', sub: todayPct != null ? { label: "Today's Return", value: `${todayPositive ? '+' : ''}${todayPct.toFixed(2)}%`, color: todayPositive ? 'text-green-400' : 'text-red-400' } : null },
                          { label: 'Total Return', value: totals ? `${plSign}${totals.returnPct.toFixed(2)}%` : '—', color: totals ? plColor : '', sub: totals ? { label: 'Profit / Loss', value: `${plSign}${fmtSym(totals.profit)}`, color: plColor } : null },
                        ].map((card, i) => (
                          <div key={i} className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-5 rounded-xl border flex flex-col gap-4`}>
                            <div>
                              <h4 className={`text-xs font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wider mb-2`}>{card.label}</h4>
                              <p className={`text-3xl font-bold transition-all duration-500 ${card.color || ''}`}>{card.value}</p>
                            </div>
                            {card.sub && <div>
                              <h4 className={`text-xs font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wider mb-2`}>{card.sub.label}</h4>
                              <p className={`text-3xl font-bold transition-all duration-500 ${card.sub.color}`}>{card.sub.value}</p>
                            </div>}
                          </div>
                        ))}
                      </div>

                      {/* Best & Worst Today */}
                      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                        <div className="flex items-center justify-between mb-6">
                          <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>Best &amp; Worst Today</h3>
                          <div className="relative">
                            <button onClick={() => setTodayCogOpen(o => !o)} className={`p-1.5 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700 border-gray-700' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100 border-gray-200'} transition border`} title="Sort options">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
                            </button>
                            {todayCogOpen && (
                              <div className={`absolute right-0 top-8 z-50 ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl overflow-hidden w-44`}>
                                <div className={`px-3 py-2 text-xs font-semibold ${isDark ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-200'} uppercase tracking-wider border-b`}>Sort by</div>
                                {[['pct', 'Percentage (%)'], ['currency', `Amount (${sym})`]].map(([val, label]) => (
                                  <button key={val} onClick={() => { setTodaySortMode(val); setTodayCogOpen(false); }} className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center justify-between ${todaySortMode === val ? `${isDark ? 'text-white bg-gray-700' : 'text-gray-900 bg-gray-100'}` : `${isDark ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}`}>
                                    {label}
                                    {todaySortMode === val && <span className="text-blue-400 text-xs">✓</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <TodayCards data={dashboardData.portfolio} sym={sym} sortMode={todaySortMode} />
                      </div>

                      {/* Dividend Dashboard */}
                      {dividends && dividends.totalAllTime > 0 && (() => {
                        const maxYear = Math.max(...dividends.byYear.map(y => y.total));
                        const maxStock = dividends.byStock[0]?.total || 1;
                        return (
                          <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                            <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>Dividend Dashboard</h3>
                            <div className="grid grid-cols-2 gap-4 mb-8">
                              <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} rounded-xl p-4`}>
                                <p className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-gray-100' : 'text-gray-500'}`}>All-Time Dividends</p>
                                <p className="text-3xl font-bold">{fmt(dividends.totalAllTime)} kr</p>
                              </div>
                              <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} rounded-xl p-4`}>
                                <p className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-gray-100' : 'text-gray-500'}`}>This Year</p>
                                <p className="text-3xl font-bold">{fmt(dividends.totalThisYear)} kr</p>
                                <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Includes declared but not yet settled</p>
                              </div>
                            </div>
                            <h4 className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-3`}>By Year</h4>
                            <div className="flex flex-col gap-1 mb-8">
                              {dividends.byYear.map(({ year, total, stocks }) => {
                                const isOpen = expandedYear === year;
                                const maxStockInYear = stocks?.[0]?.total || 1;
                                return (
                                  <div key={year}>
                                    <div onClick={() => setExpandedYear(isOpen ? null : year)} className={`flex items-center gap-3 py-1 cursor-pointer rounded-lg px-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition`}>
                                      <span className={`text-sm font-bold w-12 shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{year}</span>
                                      <div className={`flex-1 h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-slate-500 rounded transition-all" style={{ width: `${(total / maxYear) * 100}%` }} /></div>
                                      <span className={`text-sm font-bold w-28 text-right shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{fmt(total)} kr</span>
                                      <span className={`text-xs w-4 shrink-0 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{isOpen ? '▲' : '▼'}</span>
                                    </div>
                                    <div style={{ maxHeight: isOpen ? `${(stocks?.length || 0) * 28 + 16}px` : '0px', overflow: 'hidden', transition: 'max-height 0.3s ease-in-out' }}>
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
                            <h4 className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-3`}>By Stock</h4>
                            <div className="flex flex-col gap-2">
                              {dividends.byStock.slice(0, 12).map(({ name, total }) => (
                                <div key={name} className="flex items-center gap-3">
                                  <span className={`text-xs w-44 shrink-0 truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{name}</span>
                                  <div className={`flex-1 h-5 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-slate-500 rounded transition-all" style={{ width: `${(total / maxStock) * 100}%` }} /></div>
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

              {/* HOLDINGS */}
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
                const handleSort = key => { if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir(key === 'name' || key === 'ticker' ? 'asc' : 'desc'); } };
                const col = COLS.find(c => c.key === sortCol);
                const rows = dashboardData ? [...dashboardData.portfolio].sort((a, b) => { const v = col ? col.sortFn(a, b) : 0; return sortDir === 'asc' ? v : -v; }) : [];
                const Arrow = ({ k }) => sortCol !== k ? null : <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>;
                if (!dashboardData || portfolio.length === 0) return <EmptyState icon="📋" title="No holdings" desc="Upload a CSV and sync your portfolio to see your holdings." />;
                return (
                  <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl overflow-hidden border`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                          <tr>{COLS.map(c => <th key={c.key} onClick={() => handleSort(c.key)} className={`p-4 font-bold ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'} uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition`}>{c.label}<Arrow k={c.key} /></th>)}</tr>
                        </thead>
                        <tbody>
                          {rows.map(s => {
                            const tp = s.todayChangePct >= 0, rp = s.returnPct >= 0, pp = s.profit >= 0;
                            return (
                              <tr key={s.ticker} className={`border-t ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'} transition`}>
                                <td className="p-4 font-bold">{s.flag || ''} {s.cleanName || s.name}</td>
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

              {/* PERFORMANCE */}
              {activeTab === 'performance' && (
                <div className="flex flex-col gap-6">
                  {!portfolio.length ? <EmptyState icon="📈" title="No performance data" desc="Upload a CSV and sync your portfolio first." /> : (
                    <>
                      {/* Portfolio chart */}
                      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                        <div className="flex items-center justify-between mb-5">
                          <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>Portfolio Performance</h3>
                          <div className="flex gap-1">
                            {['1W','1M','3M','1Y','3Y'].map(p => (
                              <button key={p} onClick={() => { setPerfPeriod(p); fetchPerfData(p); }}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${perfPeriod === p ? 'bg-blue-600 text-white' : `${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-900'}`}`}>
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                        <LineChart data={perfData} loading={perfLoading} />
                        {perfData.length > 1 && (() => {
                          const first = perfData[0].returnPct, last = perfData[perfData.length - 1].returnPct;
                          const diff = last - first;
                          const pos = diff >= 0;
                          return (
                            <div className="flex gap-6 mt-4 pt-4 border-t border-gray-700">
                              <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Period return</p><p className={`text-xl font-bold ${pos ? 'text-green-400' : 'text-red-400'}`}>{pos ? '+' : ''}{last.toFixed(2)}%</p></div>
                              <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Change</p><p className={`text-xl font-bold ${pos ? 'text-green-400' : 'text-red-400'}`}>{pos ? '+' : ''}{diff.toFixed(2)}pp</p></div>
                            </div>
                          );
                        })()}
                      </div>
                      {/* Per-position bars */}
                      {dashboardData && (
                        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                          <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>All-Time Return per Position</h3>
                          <DivergingBars data={dashboardData.portfolio} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* OWNERSHIP */}
              {activeTab === 'ownership' && (() => {
                const allHoldings = dashboardData ? dashboardData.portfolio.filter(h => !h.quoteType || h.quoteType === 'EQUITY') : [];
                const hasData = Object.keys(ownershipData).length > 0;
                const sortedHoldings = [...allHoldings].sort((a, b) => {
                  const da = ownershipData[a.ticker], db = ownershipData[b.ticker];
                  if (ownershipSort === 'inst') return (db?.institutionPct ?? -1) - (da?.institutionPct ?? -1);
                  if (ownershipSort === 'insider') return (db?.insiderPct ?? -1) - (da?.insiderPct ?? -1);
                  if (ownershipSort === 'value') return (b.currentValue ?? 0) - (a.currentValue ?? 0);
                  return a.name.localeCompare(b.name);
                });
                const filteredHoldings = ownershipFilter ? sortedHoldings.filter(h => h.ticker.toLowerCase().includes(ownershipFilter.toLowerCase()) || h.name.toLowerCase().includes(ownershipFilter.toLowerCase())) : sortedHoldings;
                const extraTickers = Object.keys(ownershipExtra);

                if (!dashboardData) return <EmptyState icon="🏛️" title="No portfolio loaded" desc="Import and sync a portfolio first." />;

                const OwnershipCard = ({ ticker, name, isExtra = false }) => {
                  const data = isExtra ? ownershipExtra[ticker] : ownershipData[ticker];
                  const pct = v => v != null ? `${(v * 100).toFixed(1)}%` : '—';
                  const maxInst = data?.topInstitutional?.[0]?.pctHeld || 1;
                  const isNordic = ticker.endsWith('.ST') || ticker.endsWith('.OL') || ticker.endsWith('.CO') || ticker.endsWith('.HE');
                  const cleanNameForLink = name.split(' ')[0];
                  const fallbackLink = ticker.endsWith('.ST') ? `https://marknadssok.fi.se/Publiceringsklient/sv-SE/Search/Search?SearchFunctionType=Insyn&Utgivare=${encodeURIComponent(cleanNameForLink)}` : `https://www.google.com/search?q=${encodeURIComponent(name + ' insider ownership')}`;
                  return (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-5`}>
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`font-bold text-sm ${isDark ? 'bg-gray-700' : 'bg-gray-100'} px-2 py-1 rounded-lg`}>{ticker}</span>
                        <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{(isExtra ? ownershipExtra[ticker]?.flag : ownershipData[ticker]?.flag) || ''} {name}</span>
                        {isExtra && <span className="ml-auto text-xs text-blue-400 bg-blue-900 px-2 py-0.5 rounded-full">lookup</span>}
                      </div>
                      {!data ? (
                        <div className="flex items-center justify-center h-16"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                      ) : data.error ? (
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No ownership data available</p>
                      ) : data.noData ? (
                        <div className={`${isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'} rounded-lg p-5 text-center border border-dashed`}>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-3`}>Ownership data not available for this exchange.</p>
                          {isNordic && <a href={fallbackLink} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-bold text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800 px-4 py-2 rounded-lg transition">🔍 View Local Insider Register</a>}
                        </div>
                      ) : (
                        <>
                          <div className={`flex gap-6 mb-4 pb-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Institutional</p><p className="text-xl font-bold">{pct(data.institutionPct)}</p></div>
                            <div><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Insider</p><p className="text-xl font-bold">{pct(data.insiderPct)}</p></div>
                            {data.floatPct != null && <div><p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>Inst. of float</p><p className="text-xl font-bold">{pct(data.floatPct)}</p></div>}
                          </div>
                          {data.topInstitutional?.length > 0 && (<>
                            <p className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-3`}>Top institutional holders</p>
                            <div className="flex flex-col gap-2 mb-4">{data.topInstitutional.map((h, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} w-4 text-right shrink-0`}>{i + 1}</span>
                                <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'} w-44 shrink-0 truncate`}>{h.name}</span>
                                <div className={`flex-1 h-5 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full bg-blue-600 rounded" style={{ width: `${(h.pctHeld / maxInst) * 100}%` }} /></div>
                                <span className={`text-xs font-bold ${isDark ? 'text-gray-200' : 'text-gray-700'} w-12 text-right shrink-0`}>{pct(h.pctHeld)}</span>
                              </div>
                            ))}</div>
                          </>)}
                          {data.topInsiders?.length > 0 && (<>
                            <p className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-3`}>Insider holders</p>
                            <div className="flex flex-col gap-1.5">{data.topInsiders.map((h, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{h.name}</span>
                                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{h.relation}</span>
                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{h.shares > 0 ? h.shares.toLocaleString() + ' shares' : ''}</span>
                              </div>
                            ))}</div>
                          </>)}
                        </>
                      )}
                    </div>
                  );
                };

                return (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 flex gap-3">
                        <input type="text" value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)} placeholder="Filter holdings..." className={`flex-1 px-3 py-2 ${isDark ? 'bg-gray-700 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-400'} rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500`} />
                        <select value={ownershipSort} onChange={e => setOwnershipSort(e.target.value)} className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'} rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500`}>
                          <option value="value">Portfolio value ↓</option>
                          <option value="inst">Institutional % ↓</option>
                          <option value="insider">Insider % ↓</option>
                          <option value="name">Name A→Z</option>
                        </select>
                      </div>
                      {hasData && <button onClick={() => { setOwnershipData({}); fetchOwnership(allHoldings); }} className={`text-xs ${isDark ? 'text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600' : 'text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200'} transition px-3 py-2 rounded-lg shrink-0`}>↺ Refresh</button>}
                    </div>
                    <div className="relative">
                      <input type="text" value={ownershipSearch} onChange={e => {
                        setOwnershipSearch(e.target.value);
                        if (e.target.value.length >= 2) {
                          setOwnershipSearchLoading(true);
                          clearTimeout(window._ownershipSearchTimer);
                          window._ownershipSearchTimer = setTimeout(() => {
                            fetch(`/api/ownership/search/${encodeURIComponent(e.target.value)}`).then(r => r.json()).then(d => { setOwnershipSearchResults(d); setOwnershipSearchLoading(false); }).catch(() => setOwnershipSearchLoading(false));
                          }, 300);
                        } else { setOwnershipSearchResults([]); }
                      }} placeholder="Look up any stock... e.g. Apple, AAPL" className={`w-full px-3 py-2 ${isDark ? 'bg-gray-700 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-400'} rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500`} />
                      {ownershipSearchResults.length > 0 && (
                        <div className={`absolute z-50 w-full ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'} border rounded-lg mt-1 shadow-xl overflow-hidden`}>
                          {ownershipSearchResults.map(r => (
                            <div key={r.ticker} onClick={() => {
                              setOwnershipSearch(''); setOwnershipSearchResults([]);
                              if (!ownershipExtra[r.ticker]) {
                                setOwnershipExtra(prev => ({ ...prev, [r.ticker]: null }));
                                fetch('/api/ownership', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickers: [{ ticker: r.ticker, name: r.name }] }) }).then(res => res.json()).then(data => { setOwnershipExtra(prev => ({ ...prev, [r.ticker]: data[0] || { error: true } })); });
                              }
                            }} className={`flex items-center gap-3 px-4 py-3 ${isDark ? 'hover:bg-gray-700 border-gray-700' : 'hover:bg-gray-50 border-gray-100'} cursor-pointer border-b last:border-0`}>
                              <span className="font-bold text-blue-400 text-sm w-24 shrink-0">{r.ticker}</span>
                              <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} truncate`}>{r.name}</span>
                              <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'} ml-auto shrink-0`}>{r.exchange}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'} mt-1.5`}>Search any stock to add its ownership card</p>
                    </div>
                    {!hasData && !ownershipLoading && <button onClick={() => fetchOwnership(allHoldings)} className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl transition">Load Ownership Data</button>}
                    {extraTickers.length > 0 && (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>Looked up</p>
                          <button onClick={() => setOwnershipExtra({})} className={`text-xs ${isDark ? 'text-gray-600 hover:text-red-400' : 'text-gray-400 hover:text-red-400'} transition`}>Clear all</button>
                        </div>
                        {extraTickers.map(ticker => <OwnershipCard key={ticker} ticker={ticker} name={ownershipExtra[ticker]?.name || ticker} isExtra />)}
                      </div>
                    )}
                    {ownershipLoading && (
                      <div className="flex flex-col gap-4">
                        {allHoldings.slice(0, 4).map(h => (
                          <div key={h.ticker} className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-5 animate-pulse`}>
                            <div className={`h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded w-32 mb-3`} />
                            <div className={`h-3 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded w-48 mb-2`} />
                            <div className={`h-3 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded w-40`} />
                          </div>
                        ))}
                      </div>
                    )}
                    {!ownershipLoading && hasData && (
                      <div className="flex flex-col gap-4">
                        {filteredHoldings.length === 0 ? <p className={`${isDark ? 'text-gray-500' : 'text-gray-400'} text-sm`}>No holdings match your filter.</p> : filteredHoldings.map(h => <OwnershipCard key={h.ticker} ticker={h.ticker} name={h.name} />)}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* INSIGHTS */}
              {activeTab === 'insights' && (
                <div className="flex flex-col gap-8">
                  {!dashboardData || portfolio.length === 0 ? <EmptyState icon="💡" title="No insights yet" desc="Upload a CSV and sync your portfolio to see allocation and sector breakdowns." /> : (
                    <>
                      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>Portfolio Allocation</h3>
                        <PieChart data={dashboardData.portfolio.map(s => ({ name: s.ticker, value: s.currentValue }))} />
                      </div>
                      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>Sector Exposure</h3>
                        <PieChart data={getSectorData(dashboardData.portfolio)} />
                      </div>
                      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-6`}>Currency Exposure</h3>
                        <div className="flex flex-col gap-3">
                          {(() => {
                            const curData = getCurrencyData();
                            const total = curData.reduce((s, c) => s + c.value, 0);
                            return curData.map((c, i) => {
                              const pct = (c.value / total) * 100;
                              return (
                                <div key={c.name} className="flex items-center gap-4">
                                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                  <span className="text-sm font-bold w-14 shrink-0">{c.name}</span>
                                  <div className={`flex-1 h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} /></div>
                                  <span className="text-sm font-bold w-14 text-right">{pct.toFixed(1)}%</span>
                                  <span className={`text-sm w-36 text-right whitespace-nowrap ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{fmtSym(c.value)}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-4`}>Allocation Breakdown</h3>
                        <div className="flex flex-col gap-3">
                          {dashboardData.portfolio.slice().sort((a, b) => b.currentValue - a.currentValue).map((s, i) => {
                            const pct = (s.currentValue / totals.value) * 100;
                            return (
                              <div key={s.ticker} className="flex items-center gap-4">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                <div className="flex flex-col w-36 shrink-0">
                                  <span className="text-sm font-bold leading-tight">{s.ticker}</span>
                                  <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} truncate`}>{s.flag || ''} {s.name}</span>
                                </div>
                                <div className={`flex-1 h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full rounded" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} /></div>
                                <span className="text-sm font-bold w-16 text-right">{pct.toFixed(1)}%</span>
                                <span className={`text-sm w-36 text-right whitespace-nowrap ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{fmtSym(s.currentValue)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-4`}>Sector Breakdown</h3>
                        <div className="flex flex-col gap-3">
                          {getSectorData(dashboardData.portfolio).map((s, i) => {
                            const pct = (s.value / totals.value) * 100;
                            return (
                              <div key={s.name} className="flex items-center gap-4">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                <span className="text-sm font-bold flex-1">{s.name}</span>
                                <div className={`w-48 h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded overflow-hidden`}><div className="h-full rounded" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} /></div>
                                <span className="text-sm font-bold w-16 text-right">{pct.toFixed(1)}%</span>
                                <span className={`text-sm w-36 text-right whitespace-nowrap ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{fmtSym(s.value)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* HISTORY */}
              {activeTab === 'history' && (() => {
                const filtered = txHistory.filter(tx => {
                  const matchSearch = !txSearch || tx.ticker?.toLowerCase().includes(txSearch.toLowerCase()) || tx.name?.toLowerCase().includes(txSearch.toLowerCase());
                  const matchType = txTypeFilter === 'all' || tx.type === txTypeFilter;
                  return matchSearch && matchType;
                });
                const typeColor = { buy: 'text-green-400', sell: 'text-red-400', dividend: 'text-blue-400', 'foreign-tax': 'text-yellow-400' };
                const typeBg = { buy: 'bg-green-900/40 text-green-400', sell: 'bg-red-900/40 text-red-400', dividend: 'bg-blue-900/40 text-blue-400', 'foreign-tax': 'bg-yellow-900/40 text-yellow-400' };
                return (
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-3 items-center">
                      <input type="text" value={txSearch} onChange={e => setTxSearch(e.target.value)} placeholder="Search ticker or name..." className={`flex-1 px-3 py-2 ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500`} />
                      <select value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value)} className={`px-3 py-2 ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'} border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500`}>
                        <option value="all">All types</option>
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                        <option value="dividend">Dividend</option>
                        <option value="foreign-tax">Foreign tax</option>
                      </select>
                      {txHistoryLoading && <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />}
                    </div>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{filtered.length} transactions{txSearch || txTypeFilter !== 'all' ? ' (filtered)' : ''}</p>
                    {txHistory.length === 0 && !txHistoryLoading ? (
                      <EmptyState icon="📝" title="No transaction history" desc="Upload a CSV to populate your transaction history." />
                    ) : (
                      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl overflow-hidden border`}>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                              <tr>
                                {['Date', 'Type', 'Ticker', 'Name', 'Qty', 'Price', 'Total (SEK)'].map(h => (
                                  <th key={h} className={`p-3 font-bold text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'} uppercase tracking-wider whitespace-nowrap`}>{h}</th>
                                ))}
                              </tr>
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
                                  <td className={`p-3 text-xs font-bold whitespace-nowrap ${tx.totalSEK >= 0 ? 'text-green-400' : 'text-red-400'}`}>{tx.totalSEK != null ? `${tx.totalSEK >= 0 ? '+' : ''}${fmt(tx.totalSEK)}` : '—'}</td>
                                </tr>
                              ))}
                              {filtered.length > 500 && <tr><td colSpan="7" className={`p-3 text-center text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Showing first 500 of {filtered.length} — use search to filter</td></tr>}
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
