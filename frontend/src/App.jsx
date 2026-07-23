import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import CSSkins from './CSSkins';
import ProfilePageView from './ProfilePageView';
import ProfileEditPage from './ProfileEditPage';
import GlobalBar from './GlobalBar';
import AdminPanel from './AdminPanel';
import ModeratorPanel from './ModeratorPanel';
import SocialFeed from './SocialFeed';
import FriendsPage from './FriendsPage';
import Sidebar from './Sidebar';
import SettingsPage from './SettingsPage';
import apiCache from './apiCache';
import { EmptyState, ShortcutsModal, PieChart, LineChart, TodayCards } from './PortfolioComponents';
import TransactionHistoryTab from './TransactionHistoryTab';

function RetryCountdown({ onRetry }) {
  const [secs, setSecs] = useState(25);
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;
  useEffect(() => {
    let remaining = 25;
    const tick = setInterval(() => {
      remaining--;
      if (remaining <= 0) { clearInterval(tick); setSecs(0); onRetryRef.current(); }
      else setSecs(remaining);
    }, 1000);
    return () => clearInterval(tick);
  }, []);
  return <span className="shrink-0 font-semibold opacity-70">Retrying in {secs}s…</span>;
}

function ProfileRoute({ authUsername, shellProps }) {
  const { username } = useParams();
  const viewUser = username ? username.replace('@', '') : null;
  return <PageShell {...shellProps}><ProfilePageView authUsername={authUsername} viewUsername={viewUser}/></PageShell>;
}

function PageShell({ title, children }) {
  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-white overflow-hidden" style={{ paddingTop: '40px' }}>
      {title && <div className={`px-8 py-3 border-b shrink-0 border-zinc-700 bg-zinc-900`}><h1 className="text-base font-bold">{title}</h1></div>}
      {children}
    </div>
  );
}

function EmailVerifyView({ token, onDone }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(r => r.json()).then(d => { if (d.success) setStatus('success'); else { setStatus('error'); setError(d.error); } })
      .catch(() => { setStatus('error'); setError('Connection error.'); });
  }, []);
  if (status === 'loading') return <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/></div>;
  if (status === 'success') return (
    <>
      <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <p className="text-base font-semibold text-white mb-1">Email verified!</p>
      <p className="text-sm text-zinc-400 mb-6">Your email address has been confirmed.</p>
      <button onClick={onDone} className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-3 rounded-xl transition text-sm">Sign In</button>
    </>
  );
  return (
    <>
      <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </div>
      <p className="text-base font-semibold text-white mb-1">Verification failed</p>
      <p className="text-sm text-zinc-400 mb-6">{error}</p>
      <button onClick={onDone} className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-3 rounded-xl transition text-sm">Back to Sign In</button>
    </>
  );
}

// Stable fingerprint of the current portfolio + currency — used as cache key discriminator
const portfolioFingerprint = (p, c) =>
  (c || '') + ':' + (p || []).map(h => `${h.ticker}:${h.quantity}`).sort().join('|');

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Aurora canvas (login page only) ────────────────────────────────────────
  const auroraCanvas = useRef(null);
  const auroraRaf    = useRef(null);

  // ── Auth ───────────────────────────────────────────────────────────────────
  // Initialise synchronously from sessionStorage — no loading spinner on page load
  const [authStatus, setAuthStatus] = useState(() => {
    const u = sessionStorage.getItem('auth_user');
    const t = sessionStorage.getItem('auth_token');
    return (u && t) ? 'logged-in' : 'logged-out';
  });
  const [authUsername, setAuthUsername] = useState(() => sessionStorage.getItem('auth_user') || '');
  const [authMode, setAuthMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset_token')) return 'reset-password';
    if (params.get('email_token')) return 'verify-email';
    return 'login';
  });
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('reset_token') || '');
  const [emailVerifyToken] = useState(() => new URLSearchParams(window.location.search).get('email_token') || '');
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '', confirmPassword: '', newPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem('auth_role') || 'user');
  const [allowRegistration, setAllowRegistration] = useState(null);
  // True from login (or page-load while already logged in) until first fetchAllData completes
  const [isInitializing, setIsInitializing] = useState(() => {
    return !!(sessionStorage.getItem('auth_user') && sessionStorage.getItem('auth_token'));
  });

  // ── Core state ─────────────────────────────────────────────────────────────
  const [portfolio, setPortfolio] = useState(() => JSON.parse(localStorage.getItem('portfolio')) || []);
  const [baseCurrency, setBaseCurrency] = useState(() => localStorage.getItem('baseCurrency') || 'SEK');
  const [dashboardData, setDashboardData] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('portfolio')) || [];
    const cur = localStorage.getItem('baseCurrency') || 'SEK';
    const fp = portfolioFingerprint(saved, cur);
    return apiCache.get('/api/portfolio-fingerprint') === fp ? apiCache.get('/api/portfolio-dashboard') : null;
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedForRemoval, setSelectedForRemoval] = useState([]);
  const [dividends, setDividends] = useState(() => apiCache.get(`/api/dividends?currency=${baseCurrency}`));
  const [overrides, setOverrides] = useState(() => apiCache.get('/api/overrides') || { global: [], user: [] });
  const overrideIsinRef = useRef(null);
  const overrideTickerRef = useRef(null);
  const [overrideMsg, setOverrideMsg] = useState('');
  const [sortCol, setSortCol] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedYear, setExpandedYear] = useState(null);
  const [appLoadingLabel, setAppLoadingLabel] = useState('Loading your data...');
  const [isAppLoading, setIsAppLoading] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('portfolio')) || [];
    const cur = localStorage.getItem('baseCurrency') || 'SEK';
    const fp = portfolioFingerprint(saved, cur);
    return !(apiCache.get('/api/portfolio-fingerprint') === fp && apiCache.has('/api/portfolio-dashboard'));
  });
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { phase, pct, label }
  const [syncStatus, setSyncStatus] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [clearAllModal, setClearAllModal] = useState(false);
  const [clearAllPw, setClearAllPw] = useState('');
  const [clearAllError, setClearAllError] = useState('');
  const [clearAllLoading, setClearAllLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveStatus, setResolveStatus] = useState('');
  const [todaySortMode, setTodaySortMode] = useState('currency');
  const [perfData, setPerfData] = useState([]);
  const [perfPeriod, setPerfPeriod] = useState('3M');
  const [perfLoading, setPerfLoading] = useState(false);
  const [txHistory, setTxHistory] = useState(() => apiCache.get('/api/transactions') || []);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [hideValues, setHideValues] = useState(() => localStorage.getItem('hidePortfolioValues') === 'true');
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);
  const toggleHideValues = () => setHideValues(v => { const next = !v; localStorage.setItem('hidePortfolioValues', String(next)); return next; });
  const [txTypeFilter, setTxTypeFilter] = useState([]);
  const [txFilterOpen, setTxFilterOpen] = useState(false);
  const [txDateFrom, setTxDateFrom] = useState('');
  const [txDateTo, setTxDateTo] = useState('');
  const [txDateOpen, setTxDateOpen] = useState(false);
  const [txCalView, setTxCalView] = useState('from');
  const [txCalFromMonth, setTxCalFromMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [txCalToMonth, setTxCalToMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const globalSearchRef = useRef(null);
  const [selectedBroker, setSelectedBroker] = useState('auto');
  const [txCount, setTxCount] = useState(() => { const c = apiCache.get('/api/txCount'); return { total: 0, trades: 0, byBroker: {}, ...c }; });
  const uploadAbortRef = useRef(false);
  const uploadAbortControllerRef = useRef(null);
  const globalFileInputRef = useRef(null);
  const forceRefreshRef = useRef(false);
  const portfolioScrollRef = useRef(null);
  const suppressNextFetch = useRef(false);
  const priceRetryDoneRef = useRef(false);
  const backgroundRefreshRef = useRef(false);
  const [showRetryCountdown, setShowRetryCountdown] = useState(false);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [isClearingSnapshot, setIsClearingSnapshot] = useState(false); // prevents re-fetch loop when cache restores portfolio
  const [dividendFilterOpen, setDividendFilterOpen] = useState(false);
  const [dividendBrokerFilter, setDividendBrokerFilter] = useState(new Set());
  const [isFixingDividendNames, setIsFixingDividendNames] = useState(false);

  // ── API helper ─────────────────────────────────────────────────────────────
  const apiFetch = useCallback(async (url, opts = {}) => {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...(opts.headers || {}) }
    });
    if (res.status === 401) {
      handleLogout('Your session has expired. Please sign in again.');
    }
    return res;
  }, []);

  // ── Aurora canvas animation ────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus === 'logged-in') return;
    const canvas = auroraCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    // Orbs: normalized base pos, lissajous coefficients, color, opacity
    const orbs = [
      { bx: 0.18, by: 0.25, ax: 0.22, ay: 0.18, fx: 0.00028, fy: 0.00019, ph: 0.0, r: 0.42, rgb: [14, 165, 233],  a: 0.55 },
      { bx: 0.80, by: 0.70, ax: 0.20, ay: 0.22, fx: 0.00020, fy: 0.00031, ph: 2.1, r: 0.45, rgb: [2,  132, 199],  a: 0.50 },
      { bx: 0.50, by: 0.10, ax: 0.28, ay: 0.15, fx: 0.00033, fy: 0.00024, ph: 1.3, r: 0.35, rgb: [56, 189, 248],  a: 0.45 },
      { bx: 0.15, by: 0.80, ax: 0.18, ay: 0.20, fx: 0.00025, fy: 0.00037, ph: 4.2, r: 0.32, rgb: [3,  105, 161],  a: 0.40 },
      { bx: 0.78, by: 0.18, ax: 0.24, ay: 0.26, fx: 0.00022, fy: 0.00028, ph: 3.0, r: 0.36, rgb: [125,211, 252],  a: 0.35 },
    ];

    const draw = (ts) => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';

      for (const o of orbs) {
        const x = (o.bx + Math.sin(ts * o.fx + o.ph) * o.ax) * W;
        const y = (o.by + Math.cos(ts * o.fy + o.ph) * o.ay) * H;
        const r = o.r * Math.min(W, H);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const [rr, gg, bb] = o.rgb;
        g.addColorStop(0,   `rgba(${rr},${gg},${bb},${o.a})`);
        g.addColorStop(0.4, `rgba(${rr},${gg},${bb},${o.a * 0.4})`);
        g.addColorStop(1,   `rgba(${rr},${gg},${bb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      auroraRaf.current = requestAnimationFrame(draw);
    };
    auroraRaf.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(auroraRaf.current); window.removeEventListener('resize', resize); };
  }, [authStatus, authMode]);

  // ── Token refresh ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => handleLogout('Your session has expired. Please sign in again.');
    window.addEventListener('session-expired', handler);
    return () => window.removeEventListener('session-expired', handler);
  }, []);

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


  // ── Fetch announcements ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/announcements').then(r => r.json()).then(setAnnouncements).catch(() => {});
  }, []);

  // ── Auth Logic ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(d => {
      const val = d.allowRegistration !== false && !d.reachedLimit;
      setAllowRegistration(val);
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
        if (!authForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForm.email.trim())) { setAuthError('A valid email address is required.'); setAuthLoading(false); return; }
        const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authForm.username, password: authForm.password, country: authForm.country || 'se', email: authForm.email.trim() }) });
        const data = await res.json();
        if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
        setAuthMode('verify-pending');
      } else {
        const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authForm.username, password: authForm.password }) });
        const data = await res.json();
        if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
        sessionStorage.setItem('auth_user', data.username);
        sessionStorage.setItem('auth_role', data.role || 'user');
        sessionStorage.setItem('auth_token', data.token);
        if (data.refreshToken) sessionStorage.setItem('auth_refresh', data.refreshToken);
        setAuthUsername(data.username); setUserRole(data.role || 'user'); setIsInitializing(true); setAuthStatus('logged-in');
        setUserRole(data.role || 'user');
      }
    } catch { setAuthError('Connection error.'); }
    setAuthLoading(false);
  };

  const handleForgotPassword = async () => {
    setAuthError(''); setAuthLoading(true);
    try {
      await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: authForm.email }) });
      setAuthMode('forgot-sent');
    } catch { setAuthError('Connection error.'); }
    setAuthLoading(false);
  };

  const handleResetPassword = async () => {
    setAuthError(''); setAuthLoading(true);
    try {
      if (authForm.password !== authForm.confirmPassword) { setAuthError('Passwords do not match.'); setAuthLoading(false); return; }
      if (authForm.password.length < 6) { setAuthError('Password must be at least 6 characters.'); setAuthLoading(false); return; }
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, password: authForm.password }) });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || 'Reset failed.'); setAuthLoading(false); return; }
      window.history.replaceState({}, '', '/');
      setAuthMode('login');
      setAuthForm(f => ({ ...f, password: '', confirmPassword: '' }));
      setSessionExpiredMsg('Password updated — please sign in.');
    } catch { setAuthError('Connection error.'); }
    setAuthLoading(false);
  };

  const handleLogout = (msg = '') => {
    sessionStorage.removeItem('auth_user');
    setAuthStatus('logged-out'); setAuthUsername('');
    setAuthForm({ username: '', password: '', confirmPassword: '', newPassword: '' });
    navigate('/');
    setPortfolio([]); setDashboardData(null); setUserRole('user');
    apiCache.bust('/api/portfolio'); apiCache.bust('/api/cs/'); apiCache.bust('/api/users/'); apiCache.del('/api/dividends'); apiCache.del('/api/txCount'); apiCache.del('/api/overrides'); apiCache.del('/api/transactions'); apiCache.del('/api/announcements'); apiCache.del('/api/feed'); apiCache.del('/api/friends');
    sessionStorage.removeItem('auth_role'); sessionStorage.removeItem('auth_token'); sessionStorage.removeItem('auth_refresh');
    if (msg) setSessionExpiredMsg(msg);
    fetch('/api/auth/status').then(r => r.json()).then(d => {
      const val = d.allowRegistration !== false && !d.reachedLimit;
      setAllowRegistration(val);
    }).catch(() => {});
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
    const map = { home:'/', portfolio:'/portfolio/overview', skins:'/skins/overview', social:'/home', friends:'/friends', profile:'/profile', admin:'/adminpanel', moderator:'/moderatorpanel' };
    if (dest === 'view-profile' && param) navigate(`/profile/@${param}`);
    else navigate(map[dest] || '/');
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async (p, c) => {
    if (!authUsername) return;
    const isForceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;
    const isBackgroundRefresh = backgroundRefreshRef.current;
    backgroundRefreshRef.current = false;
    let fp = portfolioFingerprint(p, c);
    const hasCached = !isForceRefresh && apiCache.get('/api/portfolio-fingerprint') === fp && apiCache.has('/api/portfolio-dashboard');
    if (!hasCached && p.length > 0 && !isBackgroundRefresh) setIsAppLoading(true);

    // Supabase portfolio cache — serves the last saved state instantly with no YF calls.
    // Skipped when force-refreshing or when in-memory cache is already warm.
    if (!isForceRefresh && !hasCached) {
      try {
        const dbCached = await apiFetch(`/api/portfolio/cached?currency=${c}`).then(r => r.json());
        const cachedFp = portfolioFingerprint(dbCached?.holdings, c);
        // Fingerprint mismatch: if the server snapshot covers all local tickers (possibly more),
        // local state is stale (e.g. another device uploaded a newer CSV). Adopt server holdings.
        if (dbCached?.holdings?.length > 0 && cachedFp !== fp && p.length > 0) {
          const dbTickers = new Set(dbCached.holdings.map(h => h.ticker));
          const localHasUnknown = p.some(h => !dbTickers.has(h.ticker));
          if (!localHasUnknown) {
            suppressNextFetch.current = true;
            setPortfolio(dbCached.holdings);
            p = dbCached.holdings;
            fp = cachedFp;
          }
        }
        if (dbCached?.portfolio?.length > 0 && cachedFp === fp) {
          const snapshotAgeMs = Date.now() - new Date(dbCached.builtAt).getTime();
          const snapshotStale = snapshotAgeMs > 6 * 60 * 60 * 1000; // only warn if >6 h old
          setDashboardData({ portfolio: dbCached.portfolio, totals: dbCached.totals, hasStalePrices: snapshotStale, fromCache: true, builtAt: dbCached.builtAt });
          setIsAppLoading(false);
          // Restore holdings into state if we have none (new device / cleared localStorage)
          if (p.length === 0 && dbCached.holdings?.length > 0) {
            suppressNextFetch.current = true;
            setPortfolio(dbCached.holdings);
          }
          const [divRes, txRes, overRes, feedRes, friendsRes, txHistRes, csInvRes, csPnlRes, csSetRes, annRes, profRes, reconstructRes] = await Promise.all([
            apiFetch(`/api/dividends?currency=${c}`).then(r => r.json()).catch(() => null),
            apiFetch('/api/transactions/count').then(r => r.json()).catch(() => null),
            apiFetch('/api/overrides').then(r => r.json()).catch(() => null),
            !apiCache.has('/api/feed') ? apiFetch('/api/feed').then(r => r.json()).catch(() => null) : Promise.resolve(null),
            !apiCache.has('/api/friends') ? apiFetch('/api/friends').then(r => r.json()).catch(() => null) : Promise.resolve(null),
            !apiCache.has('/api/transactions') ? apiFetch('/api/transactions').then(r => r.json()).catch(() => null) : Promise.resolve(null),
            !apiCache.has(`/api/cs/inventory?currency=${c}`) ? apiFetch(`/api/cs/inventory?currency=${c}`).then(r => r.json()).catch(() => null) : Promise.resolve(null),
            !apiCache.has(`/api/cs/pnl?currency=${c}`) ? apiFetch(`/api/cs/pnl?currency=${c}`).then(r => r.json()).catch(() => null) : Promise.resolve(null),
            !apiCache.has('/api/cs/settings') ? apiFetch('/api/cs/settings').then(r => r.json()).catch(() => null) : Promise.resolve(null),
            !apiCache.has('/api/announcements') ? apiFetch('/api/announcements').then(r => r.json()).catch(() => null) : Promise.resolve(null),
            !apiCache.has(`/api/users/${authUsername}/profile`) ? apiFetch(`/api/users/${authUsername}/profile`).then(r => r.json()).catch(() => null) : Promise.resolve(null),
            !apiCache.has('/api/transactions/reconstruct') ? apiFetch('/api/transactions/reconstruct').then(r => r.json()).catch(() => null) : Promise.resolve(null),
          ]);
          if (divRes) { setDividends(divRes); apiCache.set(`/api/dividends?currency=${c}`, divRes); }
          if (txRes) { setTxCount(txRes); apiCache.set('/api/txCount', txRes); }
          if (overRes) { setOverrides(overRes); apiCache.set('/api/overrides', overRes); }
          if (Array.isArray(feedRes)) apiCache.set('/api/feed', feedRes);
          if (friendsRes && typeof friendsRes === 'object') apiCache.set('/api/friends', friendsRes);
          if (Array.isArray(txHistRes)) { setTxHistory(txHistRes); apiCache.set('/api/transactions', txHistRes); }
          if (Array.isArray(csInvRes)) apiCache.set(`/api/cs/inventory?currency=${c}`, csInvRes);
          if (csPnlRes && typeof csPnlRes === 'object') apiCache.set(`/api/cs/pnl?currency=${c}`, csPnlRes);
          if (csSetRes && typeof csSetRes === 'object') apiCache.set('/api/cs/settings', csSetRes);
          if (Array.isArray(annRes)) apiCache.set('/api/announcements', annRes);
          if (profRes && typeof profRes === 'object' && !profRes.error) apiCache.set(`/api/users/${authUsername}/profile`, profRes);
          if (Array.isArray(reconstructRes)) apiCache.set('/api/transactions/reconstruct', reconstructRes);
          setIsInitializing(false);
          return;
        }
      } catch(e) {}
    }

    try {
      const [dashRes, divRes, txRes, overRes, feedRes, friendsRes, txHistRes, csInvRes, csPnlRes, csSetRes, annRes, profRes, reconstructRes] = await Promise.all([
        p.length > 0
          ? apiFetch('/api/portfolio', { method: 'POST', body: JSON.stringify({ portfolio: p, baseCurrency: c, forceRefresh: isForceRefresh }) }).then(r => r.json())
          : Promise.resolve(null),
        apiFetch(`/api/dividends?currency=${c}`).then(r => r.json()),
        apiFetch('/api/transactions/count').then(r => r.json()),
        apiFetch('/api/overrides').then(r => r.json()),
        !apiCache.has('/api/feed') ? apiFetch('/api/feed').then(r => r.json()).catch(() => null) : Promise.resolve(null),
        !apiCache.has('/api/friends') ? apiFetch('/api/friends').then(r => r.json()).catch(() => null) : Promise.resolve(null),
        !apiCache.has('/api/transactions') ? apiFetch('/api/transactions').then(r => r.json()).catch(() => null) : Promise.resolve(null),
        !apiCache.has(`/api/cs/inventory?currency=${c}`) ? apiFetch(`/api/cs/inventory?currency=${c}`).then(r => r.json()).catch(() => null) : Promise.resolve(null),
        !apiCache.has(`/api/cs/pnl?currency=${c}`) ? apiFetch(`/api/cs/pnl?currency=${c}`).then(r => r.json()).catch(() => null) : Promise.resolve(null),
        !apiCache.has('/api/cs/settings') ? apiFetch('/api/cs/settings').then(r => r.json()).catch(() => null) : Promise.resolve(null),
        !apiCache.has('/api/announcements') ? apiFetch('/api/announcements').then(r => r.json()).catch(() => null) : Promise.resolve(null),
        !apiCache.has(`/api/users/${authUsername}/profile`) ? apiFetch(`/api/users/${authUsername}/profile`).then(r => r.json()).catch(() => null) : Promise.resolve(null),
        !apiCache.has('/api/transactions/reconstruct') ? apiFetch('/api/transactions/reconstruct').then(r => r.json()).catch(() => null) : Promise.resolve(null),
      ]);
      // Don't replace valid dashboard data with an all-noData result (YF rate-limit burst after upload).
      // BUT: if holdings composition changed (new sell/buy added), always accept the new dashRes so
      // quantities update immediately even when prices are temporarily unavailable.
      // Functional update lets us inspect previous state without adding dashboardData to useCallback deps.
      setDashboardData(prev => {
        if (!dashRes) return prev;
        const allNoData = dashRes.portfolio?.length > 0 && dashRes.portfolio.every(h => h.noData);
        if (allNoData && prev?.portfolio?.some(h => !h.noData)) {
          const sameHoldings = dashRes.portfolio?.length === prev.portfolio?.length &&
            dashRes.portfolio?.every(h => {
              const p = prev.portfolio?.find(p => p.ticker === h.ticker);
              return p && p.quantity === h.quantity;
            });
          if (sameHoldings) return { ...prev, hasStalePrices: true };
        }
        return dashRes;
      });
      setDividends(divRes); setTxCount(txRes); setOverrides(overRes);
      if (dashRes) { apiCache.set('/api/portfolio-dashboard', dashRes); apiCache.set('/api/portfolio-fingerprint', fp); }
      apiCache.set(`/api/dividends?currency=${c}`, divRes);
      apiCache.set('/api/txCount', txRes);
      apiCache.set('/api/overrides', overRes);
      if (Array.isArray(feedRes)) apiCache.set('/api/feed', feedRes);
      if (friendsRes && typeof friendsRes === 'object') apiCache.set('/api/friends', friendsRes);
      if (Array.isArray(txHistRes)) { setTxHistory(txHistRes); apiCache.set('/api/transactions', txHistRes); }
      if (Array.isArray(csInvRes)) apiCache.set(`/api/cs/inventory?currency=${c}`, csInvRes);
      if (csPnlRes && typeof csPnlRes === 'object') apiCache.set(`/api/cs/pnl?currency=${c}`, csPnlRes);
      if (csSetRes && typeof csSetRes === 'object') apiCache.set('/api/cs/settings', csSetRes);
      if (Array.isArray(annRes)) apiCache.set('/api/announcements', annRes);
      if (profRes && typeof profRes === 'object' && !profRes.error) apiCache.set(`/api/users/${authUsername}/profile`, profRes);
      if (Array.isArray(reconstructRes)) apiCache.set('/api/transactions/reconstruct', reconstructRes);

      // Preload friends' profile data in background
      if (friendsRes?.friends && Array.isArray(friendsRes.friends)) {
        friendsRes.friends.forEach(friend => {
          if (!apiCache.has(`/api/users/${friend.username}/profile`)) {
            apiFetch(`/api/users/${friend.username}/profile`).then(r => r.json()).then(data => {
              if (data && typeof data === 'object' && !data.error) {
                apiCache.set(`/api/users/${friend.username}/profile`, data);
              }
            }).catch(() => {});
          }
        });
      }

      // Auto-sync: portfolio is empty but trades exist in DB (e.g. fresh login from new device/session)
      if (p.length === 0 && txRes?.trades > 0) {
        try {
          const reconstructed = await apiFetch('/api/transactions/reconstruct').then(r => r.json());
          if (reconstructed.length > 0) setPortfolio(reconstructed);
        } catch(e) {}
      }
    } catch(e) { console.error(e); }
    setIsAppLoading(false);
    setIsInitializing(false);
    setIsRefreshingPrices(false);
  }, [authUsername, apiFetch]);

  useEffect(() => {
    if (!authUsername || !portfolio) return;
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
    localStorage.setItem('baseCurrency', baseCurrency);
    if (suppressNextFetch.current) { suppressNextFetch.current = false; return; }
    fetchAllData(portfolio, baseCurrency);
  }, [portfolio, baseCurrency, authUsername, fetchAllData]);


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
    try { const res = await apiFetch(`/api/transactions?currency=${baseCurrency}`); const data = await res.json(); setTxHistory(data); apiCache.set('/api/transactions', data); }
    catch(e) {} finally { setTxHistoryLoading(false); }
  }, [authUsername, baseCurrency, apiFetch]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const readFile = file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const buffer = ev.target.result;
      const bytes = new Uint8Array(buffer);
      let content;
      if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        content = new TextDecoder('utf-16le').decode(buffer);
      } else {
        content = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
        if (content.includes('�')) {
          content = new TextDecoder('windows-1252').decode(buffer);
        }
      }
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

  const handleRefreshPrices = () => {
    apiCache.del('/api/portfolio-dashboard');
    apiCache.del('/api/portfolio-fingerprint');
    forceRefreshRef.current = true;
    backgroundRefreshRef.current = true;
    setIsRefreshingPrices(true);
    fetchAllData(portfolio, baseCurrency);
  };

  // Auto-refresh prices every 20 minutes while the user is on the page
  useEffect(() => {
    if (!authUsername || portfolio.length === 0) return;
    const id = setInterval(() => {
      if (!isAppLoading) handleRefreshPrices();
    }, 20 * 60 * 1000);
    return () => clearInterval(id);
  }, [authUsername, portfolio, baseCurrency, isAppLoading]);

  const [retryingFailed, setRetryingFailed]= useState(false);
  const handleRetryFailed = async () => {
    if (!failedHoldings.length || retryingFailed) return;
    setRetryingFailed(true);
    try {
      const failedTickers = failedHoldings.map(h => h.ticker);
      await apiFetch('/api/transactions/resolve-failed', {
        method: 'POST',
        body: JSON.stringify({ failedTickers }),
      });
      // Rebuild portfolio with fresh tickers
      const syncRes = await apiFetch('/api/transactions/reconstruct');
      const reconstructed = await syncRes.json();
      if (reconstructed.length > 0) setPortfolio(reconstructed);
      apiCache.del('/api/portfolio-dashboard');
      apiCache.del('/api/portfolio-fingerprint');
      forceRefreshRef.current = true;
      await fetchAllData(reconstructed.length > 0 ? reconstructed : portfolio, baseCurrency);
    } catch (e) {
      console.error('Retry failed:', e);
    }
    setRetryingFailed(false);
  };

const handleUpload = async (files) => {
  const fileList = Array.from(files);
  if (!fileList.length) return;
  const dividendsOnly = location.pathname === '/portfolio/import-dividends';
  uploadAbortRef.current = false;
  uploadAbortControllerRef.current = new AbortController();
  setUploadLoading(true); setUploadStatus(null); setSyncStatus(''); setUploadProgress(null);

  const updateProgress = (phase, pct, label, txEstimate, resolvedCount, totalCount) =>
    setUploadProgress(prev => ({
      ...(prev || {}), phase, pct, label,
      ...(txEstimate   !== undefined && { txEstimate }),
      ...(resolvedCount !== undefined && { resolvedCount, totalCount }),
    }));

  try {
    // Auto-clear existing data before uploading new CSV (skipped in dividends-only mode)
    if (!dividendsOnly && txCount.total > 0) {
      updateProgress('clearing', 5, 'Clearing previous data...');
      await apiFetch('/api/transactions', { method: 'DELETE' });
      setTxCount({ total: 0, trades: 0 });
      apiCache.bust('/api/portfolio'); apiCache.bust('/api/cs/'); apiCache.bust('/api/users/'); apiCache.del('/api/dividends'); apiCache.del('/api/txCount'); apiCache.del('/api/overrides'); apiCache.del('/api/transactions'); apiCache.del('/api/announcements'); apiCache.del('/api/feed'); apiCache.del('/api/friends');
    }

    const allResults = [];
    let totalNewAdded = 0;
    let totalRowEstimate = 0;

    for (let i = 0; i < fileList.length; i++) {
      if (uploadAbortRef.current) {
        uploadAbortRef.current = false;
        updateProgress('cancelled', 10, '✗ Upload cancelled');
        setTimeout(() => setUploadProgress(null), 2000);
        setUploadLoading(false);
        return;
      }

      updateProgress('parsing', 10, `Reading file ${i + 1} of ${fileList.length}...`);
      const payload = await readFile(fileList[i]);
      totalRowEstimate += Math.max(0, payload.content.split('\n').filter(l => l.trim()).length - 1);

      updateProgress('uploading', 15 + Math.floor((i / fileList.length) * 20), `Uploading file ${i + 1} of ${fileList.length}...`, totalRowEstimate);
      const res = await apiFetch('/api/transactions/upload', {
        method: 'POST',
        body: JSON.stringify({
          files: [payload],
          forceBroker: selectedBroker !== 'auto' ? selectedBroker : null,
          dividendsOnly,
        })
      });
      const data = await res.json();
      if (data.results) allResults.push(...data.results);
      totalNewAdded += data.newAdded ?? 0;
    }

    setUploadStatus({ results: allResults, newAdded: totalNewAdded, total: allResults.reduce((s, r) => s + (r.count || 0), 0) });

    if (totalNewAdded === 0) {
      updateProgress('done', 100, '✓ No new transactions (all duplicates)');
      setTimeout(() => setUploadProgress(null), 3000);
      setUploadLoading(false);
      return;
    }

    // Dividends-only: skip ticker resolution and portfolio sync — fetch fresh dividends and redirect
    if (dividendsOnly) {
      apiCache.bust('/api/dividends');
      apiCache.del('/api/txCount');
      updateProgress('done', 100, `✓ Imported ${totalNewAdded} dividend transaction${totalNewAdded !== 1 ? 's' : ''}`);
      setTimeout(async () => {
        setUploadProgress(null);
        navigate('/portfolio/dividends');
        try {
          const [divRes, txRes] = await Promise.all([
            apiFetch(`/api/dividends?currency=${baseCurrency}`).then(r => r.json()),
            apiFetch('/api/transactions/count').then(r => r.json()),
          ]);
          if (divRes) { setDividends(divRes); apiCache.set(`/api/dividends?currency=${baseCurrency}`, divRes); }
          if (txRes) { setTxCount(txRes); apiCache.set('/api/txCount', txRes); }
        } catch(e) {}
      }, 3000);
      setUploadLoading(false);
      return;
    }

    const data = { newAdded: totalNewAdded };

    // Resolve tickers — no chunk limit so the server deduplicates all transactions to unique
    // stocks in one pass. With caching, each subsequent call is instant (all cache hits).
    updateProgress('resolving', 40, 'Resolving tickers...');
    let totalResolved = 0;
    let remaining = data.newAdded;
    const startTime = Date.now();
    let failures = 0;
    let noProgressChunks = 0;
    let lastRemaining = remaining;
    let iteration = 0;

    while (remaining > 0 && failures < 3) {
      if (uploadAbortRef.current) {
        uploadAbortRef.current = false;
        updateProgress('cancelled', 40 + Math.floor((totalResolved / data.newAdded) * 40), '✗ Upload cancelled');
        setTimeout(() => setUploadProgress(null), 2000);
        setUploadLoading(false);
        return;
      }

      try {
        const chunkRes = await apiFetch('/api/transactions/resolve', {
          method: 'POST',
          body: JSON.stringify({}),
          signal: uploadAbortControllerRef.current?.signal,
        });

        const chunkData = await chunkRes.json();
        iteration++;

        totalResolved += chunkData.resolved || 0;
        remaining = chunkData.remaining || 0;
        failures = 0;

        // Detect no-progress (remaining didn't decrease) — bail out to avoid infinite loop
        if (remaining >= lastRemaining && remaining > 0) {
          noProgressChunks++;
          if (noProgressChunks >= 3) {
            remaining = 0; // force loop exit
          }
        } else {
          noProgressChunks = 0;
        }
        lastRemaining = remaining;

        const progress = 40 + Math.floor(((totalResolved / data.newAdded) * 40));

        // Only show ETA after the first iteration — the first pass resolves all unique
        // stocks (slow), subsequent passes are cache hits (fast), so early estimates are useless.
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = totalResolved / elapsed;
        const etaSeconds = iteration > 1 && remaining > 0 && rate > 0 ? Math.ceil(remaining / rate) : 0;
        const etaText = etaSeconds > 60
          ? `~${Math.ceil(etaSeconds / 60)}m remaining`
          : etaSeconds > 0
            ? `~${etaSeconds}s remaining`
            : '';

        updateProgress('resolving', progress, `Resolved ${totalResolved}/${data.newAdded} tickers... ${etaText}`, undefined, totalResolved, data.newAdded);

        if (remaining === 0) break;
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        if (err.name === 'AbortError') {
          updateProgress('cancelled', 40 + Math.floor((totalResolved / data.newAdded) * 40), '✗ Upload cancelled');
          setTimeout(() => setUploadProgress(null), 2000);
          setUploadLoading(false);
          return;
        }
        failures++;
        console.error(`Chunk failed (attempt ${failures}/3):`, err);
        if (failures >= 3) {
          updateProgress('error', progress, `Resolved ${totalResolved}/${data.newAdded} (some failed - click Resolve Tickers to retry)`);
          break;
        }
        await new Promise(r => setTimeout(r, 2000)); // Wait before retry
      }
    }
    
    // Auto-sync portfolio
    updateProgress('syncing', 85, 'Building portfolio...');
    const syncRes = await apiFetch('/api/transactions/reconstruct');
    const reconstructed = await syncRes.json();
    
    if (reconstructed.length > 0) {
      setPortfolio(reconstructed);
      updateProgress('done', 100, `✓ Imported ${data.newAdded} transactions, ${reconstructed.length} holdings`);
    } else {
      updateProgress('done', 100, `✓ Imported ${data.newAdded} transactions`);
    }
    
    setAppLoadingLabel('Loading your portfolio...');
    setTimeout(() => { setUploadProgress(null); navigate('/portfolio/overview'); }, 4000);
  } catch (err) {
    setUploadStatus({ error: 'Upload failed: ' + err.message });
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
      // Bust in-memory caches; forceRefreshRef=true bypasses the Supabase portfolio_cache
      // for this session. The Supabase cache is intentionally kept as a per-ticker price
      // fallback in case YF is temporarily unavailable during the sync.
      apiCache.del('/api/portfolio-dashboard');
      apiCache.del('/api/portfolio-fingerprint');
      forceRefreshRef.current = true;
      await handleSyncPortfolio();
      setTimeout(() => setResolveStatus(''), 4000);
    } catch { setResolveStatus('Force re-resolve failed.'); }
    setResolveLoading(false);
  };

  const handleClearTransactions = async () => {
    await Promise.all([
      apiFetch('/api/transactions', { method: 'DELETE' }),
      apiFetch('/api/portfolio/cached', { method: 'DELETE' }),
    ]);
    setTxCount({ total: 0, trades: 0 }); setPortfolio([]); setDashboardData(null); setUploadStatus(null); setDividends(null); setSyncStatus('History cleared.');
    apiCache.bust('/api/portfolio'); apiCache.bust('/api/cs/'); apiCache.bust('/api/users/'); apiCache.del('/api/dividends'); apiCache.del('/api/txCount'); apiCache.del('/api/overrides'); apiCache.del('/api/transactions'); apiCache.del('/api/announcements'); apiCache.del('/api/feed'); apiCache.del('/api/friends');
  };

  const handleClearBroker = async (broker) => {
    if (!confirm(`Delete all ${broker} transactions? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/transactions?broker=${broker}`, { method: 'DELETE' });
      // Keep the portfolio snapshot — the server uses it as a price fallback when YF is
      // rate-limited right after a re-upload. It gets overwritten once fresh prices arrive.
      const res = await apiFetch('/api/transactions/count');
      setTxCount(await res.json());
      setPortfolio([]); setDashboardData(null);
      setSyncStatus(`${broker} transactions cleared. Upload new CSV or sync remaining data.`);
      setTimeout(() => setSyncStatus(''), 5000);
    } catch (err) {
      setSyncStatus('Error clearing transactions: ' + err.message);
    }
  };

  const handleClearAll = () => {
    setClearAllPw('');
    setClearAllError('');
    setClearAllModal(true);
  };

  const confirmClearAll = async () => {
    if (!clearAllPw) { setClearAllError('Password required.'); return; }
    setClearAllLoading(true);
    setClearAllError('');
    try {
      const verifyRes = await apiFetch('/api/auth/verify-password', { method: 'POST', body: JSON.stringify({ password: clearAllPw }) });
      if (!verifyRes.ok) { const d = await verifyRes.json(); setClearAllError(d.error || 'Incorrect password.'); setClearAllLoading(false); return; }
      await Promise.all([
        apiFetch('/api/transactions', { method: 'DELETE' }),
        apiFetch('/api/portfolio/cached', { method: 'DELETE' }),
      ]);
      setPortfolio([]); setDashboardData(null);
      setTxCount({ total: 0, trades: 0 });
      setUploadStatus(null);
      setDividends(null);
      apiCache.bust('/api/portfolio'); apiCache.bust('/api/cs/'); apiCache.bust('/api/users/'); apiCache.del('/api/dividends'); apiCache.del('/api/txCount'); apiCache.del('/api/overrides'); apiCache.del('/api/transactions'); apiCache.del('/api/announcements'); apiCache.del('/api/feed'); apiCache.del('/api/friends');
      setClearAllModal(false);
      setSyncStatus('All data cleared successfully.');
      setTimeout(() => setSyncStatus(''), 4000);
    } catch (err) {
      setClearAllError('Error: ' + err.message);
    }
    setClearAllLoading(false);
  };

  const handleClearHoldings = async () => {
    if (!confirm('This will clear your current portfolio holdings. Transaction history and ticker cache are kept — you can re-upload a CSV without re-resolving tickers. Continue?')) return;
    try {
      await apiFetch('/api/portfolio/cached', { method: 'DELETE' });
      suppressNextFetch.current = true; // prevent useEffect from auto-reconstructing from transactions
      setPortfolio([]);
      setDashboardData(null);
      setIsAppLoading(false);
      setUploadStatus(null);
      apiCache.del('/api/portfolio-dashboard');
      apiCache.del('/api/portfolio-fingerprint');
      navigate('/portfolio/import');
      setSyncStatus('Holdings cleared. Transaction history and ticker cache kept.');
      setTimeout(() => setSyncStatus(''), 4000);
    } catch (err) {
      setSyncStatus('Error clearing holdings: ' + err.message);
    }
  };

  const handleClearTickerCache = async () => {
    if (!confirm('This will clear all cached ticker resolutions. Your transaction data is kept, but tickers will be re-resolved on next upload. Continue?')) return;
    try {
      await apiFetch('/api/ticker-cache', { method: 'DELETE' });
      setSyncStatus('Ticker cache cleared. Re-upload a CSV to re-resolve tickers.');
      setTimeout(() => setSyncStatus(''), 4000);
    } catch (err) {
      setSyncStatus('Error clearing ticker cache: ' + err.message);
    }
  };

  const handleClearPortfolioCache = async () => {
    setIsClearingSnapshot(true);
    try {
      await apiFetch('/api/portfolio/cached', { method: 'DELETE' });
      setDashboardData(null);
      apiCache.del('/api/portfolio-dashboard');
      apiCache.del('/api/portfolio-fingerprint');
      setSyncStatus('Portfolio snapshot cleared. Prices will be fetched fresh on next Refresh.');
      setTimeout(() => setSyncStatus(''), 4000);
    } catch (err) {
      setSyncStatus('Error clearing portfolio snapshot: ' + err.message);
    }
    setIsClearingSnapshot(false);
  };

  const toggleRemoval = t => setSelectedForRemoval(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
  const handleRemoveSelected = () => { setPortfolio(p => p.filter(s => !selectedForRemoval.includes(s.ticker))); setSelectedForRemoval([]); };

  const handleAddOverride = async () => {
    const isin = (overrideIsinRef.current?.value || '').trim().toUpperCase();
    const ticker = (overrideTickerRef.current?.value || '').trim().toUpperCase();
    if (!isin || !ticker) return;
    const hasGlobalOverride = overrides.global?.some(o => o.isin === isin);
    if (hasGlobalOverride) { setOverrideMsg('✗ A global override already exists for this ISIN'); setTimeout(() => setOverrideMsg(''), 4000); return; }
    await apiFetch('/api/overrides', { method: 'POST', body: JSON.stringify({ isin, ticker }) });
    if (overrideIsinRef.current) overrideIsinRef.current.value = '';
    if (overrideTickerRef.current) overrideTickerRef.current.value = '';
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
  const hasStalePrices = dashboardData?.hasStalePrices === true && !staleBannerDismissed;
  const failedHoldings = dashboardData?.portfolio?.filter(h => h.noData) ?? [];
  const hasFailedHoldings = failedHoldings.length > 0;

  // Reset auto-retry guard when all prices load successfully (e.g. after re-upload).
  useEffect(() => {
    if (!hasFailedHoldings && !isAppLoading) {
      priceRetryDoneRef.current = false;
      setShowRetryCountdown(false);
    }
  }, [hasFailedHoldings, isAppLoading]);

  // Trigger the 25-second countdown once when holdings fail to load.
  useEffect(() => {
    if (!hasFailedHoldings || isAppLoading || priceRetryDoneRef.current) return;
    priceRetryDoneRef.current = true;
    setShowRetryCountdown(true);
  }, [hasFailedHoldings, isAppLoading]);

  // When the snapshot path serves cached data, the live YF fetch is skipped entirely.
  // If the snapshot is more than 20 minutes old, silently fetch fresh prices in the
  // background a few seconds later so the user doesn't have to manually refresh.
  useEffect(() => {
    if (!dashboardData?.fromCache || !portfolio?.length) return;
    const ageMs = dashboardData.builtAt ? Date.now() - new Date(dashboardData.builtAt).getTime() : Infinity;
    if (ageMs < 20 * 60 * 1000) return; // fresh enough — let the 20-min interval handle it
    const timer = setTimeout(() => {
      backgroundRefreshRef.current = true;
      forceRefreshRef.current = true;
      apiCache.del('/api/portfolio-dashboard');
      apiCache.del('/api/portfolio-fingerprint');
      fetchAllData(portfolio, baseCurrency);
    }, 4000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardData?.fromCache, dashboardData?.builtAt]);

  const plPositive = totals?.profit >= 0;
  const plColor = plPositive ? 'text-green-400' : 'text-red-400';
  const plSign = plPositive ? '+' : '';
  const todayTotal = dashboardData ? dashboardData.portfolio.reduce((s, x) => s + (x.todayGainBase ?? 0), 0) : null;
  const todayPositive = todayTotal >= 0;
  const todayPct = todayTotal !== null && totals && (totals.value - todayTotal) !== 0 ? (todayTotal / (totals.value - todayTotal)) * 100 : null;
  const fmt = n => n?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—';
  const fmtSym = n => n != null ? `${fmt(n)} ${sym}` : '—';
  const fmtH = n => hideValues ? '•••••' : fmtSym(n);
  const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
  const TABS = [{ id: 'overview', label: 'Overview' },{ id: 'holdings', label: 'Holdings' },{ id: 'performance', label: 'Performance' },{ id: 'insights', label: 'Insights' },{ id: 'history', label: 'History' }];

  // ── Helpers ─────────────────────────────────────────────────────────────
  const getSectorData = d => { const m = {}; d.forEach(s => { if (s.currentValue == null) return; const sec = s.sector && s.sector !== 'Unknown' ? s.sector : 'Other'; m[sec] = (m[sec] || 0) + s.currentValue; }); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); };
  const getCurrencyData = () => { if (!dashboardData?.portfolio) return []; const m = {}; dashboardData.portfolio.forEach(s => { if (s.currentValue == null) return; const cur = s.currency || baseCurrency; m[cur] = (m[cur] || 0) + s.currentValue; }); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); };

  useEffect(() => { document.title = 'Verumen'; }, []);

  // ── Sub-components (EmptyState, ShortcutsModal, PieChart, LineChart, TodayCards)
  // defined in PortfolioComponents.jsx

  // ── Pages ─────────────────────────────────────────────────────────────
  // Build stable shell props so PageShell (defined at module scope) preserves child component state across App re-renders
  const shellProps = { authUsername, onNavigate: handleNavigate, onLogout: handleLogout, userRole, searchInputRef: globalSearchRef };

  // Display the resolved count directly — no JS animation interval so App doesn't
  // re-render every 10-30ms, which was causing PortfolioView to remount and
  // resetting the CSS spinner animation on every tick.
  const displayedResolved = uploadProgress?.resolvedCount ?? 0;

  // Derived outside the render function so the useEffect can depend on it
  const _portfolioPathToTab = {
    '/portfolio/overview':         'overview',
    '/portfolio/holdings':         'holdings',
    '/portfolio/transactions':     'history',
    '/portfolio/dividends':        'dividends',
    '/portfolio/import':           'import',
    '/portfolio/import-dividends': 'importDividends',
    '/portfolio/settings':         'overrides',
  };
  const currentTab = _portfolioPathToTab[location.pathname] || 'overview';

  useEffect(() => {
    if (currentTab === 'performance') fetchPerfData(perfPeriod);
    if (currentTab === 'history') fetchTxHistory();
    if (currentTab === 'overview' && txHistory.length === 0 && !txHistoryLoading) fetchTxHistory();
  }, [currentTab]);

  useEffect(() => {
    if (portfolioScrollRef.current) portfolioScrollRef.current.scrollTop = 0;
  }, [currentTab]);

  useEffect(() => {
    if (dividends?.brokers && dividendBrokerFilter.size === 0) {
      setDividendBrokerFilter(new Set(dividends.brokers));
    }
  }, [dividends?.brokers]);

  // Plain render function — no hooks, so React never unmounts/remounts it on re-renders.
  // This preserves scroll position across state updates.
  const renderPortfolioView = () => {
    const cardCls = `bg-zinc-800 border-zinc-700 border rounded-xl`;
    const dividendsOnly = currentTab === 'importDividends';

    return (
      <>
      <div className="flex flex-col h-screen overflow-hidden bg-zinc-900 text-white" style={{ paddingTop: '40px' }}>
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

        <div ref={portfolioScrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {isAppLoading ? (
              <div className="flex flex-col items-center justify-center mt-32 space-y-4">
                <div className="w-10 h-10 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                <p className={`font-bold tracking-wider text-zinc-400`}>{appLoadingLabel}</p>
              </div>
            ) : (
              <>
                {currentTab === 'import' && (
                  <div className="flex flex-col gap-5 items-center">
                    <h2 className="text-xl font-bold w-full max-w-lg">Import CSV</h2>
                    <div className={`${cardCls} p-5 flex flex-col gap-4 w-full max-w-lg`}>
                      <div className="flex flex-col gap-1.5">
                        <label className={`text-xs font-semibold uppercase tracking-wide text-zinc-400`}>Broker</label>
                        <select
                          value={selectedBroker}
                          onChange={e => setSelectedBroker(e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border text-sm outline-none bg-zinc-700 border-zinc-600 text-white`}
                        >
                          <option value="auto">Auto-detect</option>
                          <option value="montrose">Montrose</option>
                          <option value="avanza">Avanza</option>
                          <option value="nordnet">Nordnet</option>
                        </select>
                      </div>
                      <button disabled={uploadLoading} onClick={() => globalFileInputRef.current?.click()} className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition ${uploadLoading ? 'opacity-50 cursor-not-allowed bg-zinc-700 text-zinc-400' : 'bg-sky-600 hover:bg-sky-500 text-white'}`}>
                        {uploadLoading
                          ? <><span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />Processing…</>
                          : uploadStatus
                          ? <><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>Re-upload CSV</>
                          : <><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload CSV files</>
                        }
                      </button>
                      <p className={`text-xs text-zinc-400`}>Supports Montrose, Avanza and Nordnet.</p>
                      {uploadProgress && (
                        <div className={`rounded-lg px-3 py-2.5 text-sm border bg-zinc-700/40 border-zinc-600/40 text-zinc-300`}>
                          <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin shrink-0" /><span className="font-medium">{uploadProgress.label}</span></div>
                        </div>
                      )}
                      {uploadStatus?.error && <div className="rounded-lg px-3 py-2 text-xs bg-red-900/20 border border-red-800/40 text-red-400">✗ {uploadStatus.error}</div>}
                      {!uploadProgress && uploadStatus?.results && (
                        <div className="flex flex-col gap-1.5">
                          {uploadStatus.results.map((r, i) => (
                            <div key={i} className={`bg-zinc-700/50 rounded-lg px-3 py-2 text-xs`}>
                              {r.error ? <p className="text-red-400">✗ {r.file}: {r.error}</p> : <p><span className="font-bold capitalize">{r.broker}</span> — {r.count} rows</p>}
                            </div>
                          ))}
                          <p className="text-xs text-green-400 font-semibold">+{uploadStatus.newAdded} new · {uploadStatus.total} total</p>
                        </div>
                      )}
                      {txCount.total > 0 && (
                        <div className={`bg-zinc-700/50 rounded-xl px-3 py-2.5 flex items-center justify-between`}>
                          <div><p className="text-sm font-bold text-green-400">{txCount.trades} trades</p><p className={`text-xs text-zinc-400`}>{txCount.total} total in history</p></div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-400"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                      {txCount.byBroker && Object.keys(txCount.byBroker).length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className={`text-[10px] font-semibold uppercase tracking-wider text-zinc-400 px-1`}>Data sources</p>
                          <div className="flex flex-col divide-y divide-zinc-700 rounded-xl overflow-hidden border border-zinc-700">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 bg-zinc-700/40">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Broker</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 text-right">Rows</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 w-12"></span>
                            </div>
                            {Object.entries(txCount.byBroker).map(([broker, info]) => {
                              const typeList = Object.keys(info.types).filter(t => t !== 'foreign-tax');
                              const hasTrades = info.types.buy || info.types.sell;
                              const hasDivs = info.types.dividend;
                              return (
                                <div key={broker} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 bg-zinc-800 hover:bg-zinc-750 transition">
                                  <div>
                                    <p className="text-sm font-semibold capitalize">{broker}</p>
                                    <p className={`text-[10px] text-zinc-400`}>
                                      {[hasTrades && 'Transactions', hasDivs && 'Dividends'].filter(Boolean).join(' · ')}
                                    </p>
                                  </div>
                                  <span className={`text-xs font-bold text-right text-zinc-300`}>{info.total}</span>
                                  <button
                                    onClick={() => handleClearBroker(broker)}
                                    className="text-[11px] font-semibold text-red-400 hover:text-red-300 transition w-12 text-right"
                                  >Remove</button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {currentTab === 'importDividends' && (
                  <div className="flex flex-col gap-5 items-center">
                    <h2 className="text-xl font-bold w-full max-w-lg">Import Dividends</h2>
                    <div className={`${cardCls} p-5 flex flex-col gap-4 w-full max-w-lg`}>
                      <p className="text-xs text-zinc-400">Import dividend history without affecting existing holdings or trade data. Only dividend and foreign-tax rows will be added.</p>
                      <div className="flex flex-col gap-1.5">
                        <label className={`text-xs font-semibold uppercase tracking-wide text-zinc-400`}>Broker</label>
                        <select
                          value={selectedBroker}
                          onChange={e => setSelectedBroker(e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border text-sm outline-none bg-zinc-700 border-zinc-600 text-white`}
                        >
                          <option value="auto">Auto-detect</option>
                          <option value="montrose">Montrose</option>
                          <option value="avanza">Avanza</option>
                          <option value="nordnet">Nordnet</option>
                        </select>
                      </div>
                      <button disabled={uploadLoading} onClick={() => globalFileInputRef.current?.click()} className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition ${uploadLoading ? 'opacity-50 cursor-not-allowed bg-zinc-700 text-zinc-400' : 'bg-pink-600 hover:bg-pink-500 text-white'}`}>
                        {uploadLoading
                          ? <><span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />Processing…</>
                          : <><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload CSV files</>
                        }
                      </button>
                      <p className={`text-xs text-zinc-400`}>Supports Montrose, Avanza and Nordnet.</p>
                      {uploadProgress && (
                        <div className={`rounded-lg px-3 py-2.5 text-sm border bg-zinc-700/40 border-zinc-600/40 text-zinc-300`}>
                          <div className="flex items-center gap-2"><div className="animate-spin">⏳</div><span className="font-medium">{uploadProgress.label}</span></div>
                        </div>
                      )}
                      {uploadStatus?.error && <div className="rounded-lg px-3 py-2 text-xs bg-red-900/20 border border-red-800/40 text-red-400">✗ {uploadStatus.error}</div>}
                      {!uploadProgress && uploadStatus?.results && (
                        <div className="flex flex-col gap-1.5">
                          {uploadStatus.results.map((r, i) => (
                            <div key={i} className={`bg-zinc-700/50 rounded-lg px-3 py-2 text-xs`}>
                              {r.error ? <p className="text-red-400">✗ {r.file}: {r.error}</p> : <p><span className="font-bold capitalize">{r.broker}</span> — {r.count} rows</p>}
                            </div>
                          ))}
                          <p className="text-xs text-green-400 font-semibold">+{uploadStatus.newAdded} new · {uploadStatus.total} total</p>
                        </div>
                      )}
                      {txCount.total > 0 && (
                        <div className={`bg-zinc-700/50 rounded-xl px-3 py-2.5 flex items-center justify-between`}>
                          <div><p className="text-sm font-bold text-green-400">{txCount.trades} trades</p><p className={`text-xs text-zinc-400`}>{txCount.total} total in history</p></div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-400"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                      {txCount.byBroker && Object.keys(txCount.byBroker).length > 0 && (
                        <div className="flex flex-col gap-1">
                          <p className={`text-[10px] font-semibold uppercase tracking-wider text-zinc-400 px-1`}>Data sources</p>
                          <div className="flex flex-col divide-y divide-zinc-700 rounded-xl overflow-hidden border border-zinc-700">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 bg-zinc-700/40">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Broker</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 text-right">Rows</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 w-12"></span>
                            </div>
                            {Object.entries(txCount.byBroker).map(([broker, info]) => {
                              const hasTrades = info.types.buy || info.types.sell;
                              const hasDivs = info.types.dividend;
                              return (
                                <div key={broker} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 bg-zinc-800 hover:bg-zinc-750 transition">
                                  <div>
                                    <p className="text-sm font-semibold capitalize">{broker}</p>
                                    <p className={`text-[10px] text-zinc-400`}>
                                      {[hasTrades && 'Transactions', hasDivs && 'Dividends'].filter(Boolean).join(' · ')}
                                    </p>
                                  </div>
                                  <span className={`text-xs font-bold text-right text-zinc-300`}>{info.total}</span>
                                  <button onClick={() => handleClearBroker(broker)} className="text-[11px] font-semibold text-red-400 hover:text-red-300 transition w-12 text-right">Remove</button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {currentTab === 'overrides' && (
                  <div className="flex flex-col gap-5">
                    <h2 className="text-xl font-bold">Portfolio Settings</h2>
                    <div className={`${cardCls} p-6 flex items-center justify-between gap-4`}>
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">Hide portfolio values</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Masks all currency amounts across the portfolio. Percentages remain visible.</p>
                      </div>
                      <button onClick={toggleHideValues}
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${hideValues ? 'bg-sky-600' : 'bg-zinc-600'}`}>
                        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${hideValues ? 'translate-x-5' : 'translate-x-0'}`}/>
                      </button>
                    </div>
                    <div className={`${cardCls} p-6`}>
                      <p className={`text-sm mb-4 text-zinc-300`}>
                        Pin an ISIN to a specific Yahoo Finance ticker. The override takes priority over automatic resolution on every upload.
                      </p>
                      <div className="flex gap-3 mb-6">
                        <input ref={overrideIsinRef} placeholder="ISIN" className={`w-32 px-3 py-2.5 rounded-xl border text-sm outline-none bg-zinc-700 border-zinc-600 text-white`} />
                        <input ref={overrideTickerRef} placeholder="Yahoo Finance ticker" className={`w-44 px-3 py-2.5 rounded-xl border text-sm outline-none bg-zinc-700 border-zinc-600 text-white`} />
                        <button onClick={handleAddOverride} className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition whitespace-nowrap">Save Override</button>
                      </div>
                      {overrideMsg && <p className={`text-xs mb-4 ${overrideMsg.startsWith('✗') ? 'text-red-400' : 'text-green-400'}`}>{overrideMsg}</p>}
                      {(() => {
                        const globalIsins = new Set(overrides.global?.map(o => o.isin) || []);
                        const userOverridesFiltered = overrides.user?.filter(o => !globalIsins.has(o.isin)) || [];
                        return (overrides.global?.length > 0 || userOverridesFiltered.length > 0) ? (
                          <div className="flex flex-col gap-6">
                            {overrides.global?.length > 0 && (
                              <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 text-zinc-400`}>Global overrides</p>
                                <div className="flex flex-col gap-2">
                                  {overrides.global.map(o => (
                                    <div key={o.isin} className={`flex items-center justify-between bg-zinc-700/30 border border-zinc-600/30 rounded-xl px-4 py-3`}>
                                      <div className="flex items-center gap-3 flex-1">
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded bg-zinc-600/60 text-zinc-300`}>Global</span>
                                        <span className="text-sm font-mono">{o.isin} <span className="text-zinc-400">→</span> <span className="font-bold">{o.ticker}</span></span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {userOverridesFiltered.length > 0 && (
                              <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 text-zinc-400`}>Your overrides</p>
                                <div className="flex flex-col gap-2">
                                  {userOverridesFiltered.map(o => (
                                    <div key={o.isin} className={`flex items-center justify-between bg-zinc-700/50 rounded-xl px-4 py-3`}>
                                      <span className="text-sm font-mono">{o.isin} <span className="text-zinc-400">→</span> <span className="font-bold">{o.ticker}</span></span>
                                      <button onClick={() => handleDeleteOverride(o.isin)} className="text-red-400 hover:text-red-300 text-xs ml-4 transition font-medium">Remove</button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className={`text-sm text-zinc-400`}>No overrides saved yet.</p>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div className={`${cardCls} p-6`}>
                        <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 text-zinc-400`}>Re-Resolve Tickers</h3>
                        <p className={`text-sm mb-4 text-zinc-300`}>
                          Re-runs ticker resolution for all holdings using cached results where available. Use this if holdings are showing incorrect or missing data after an upload.
                        </p>
                        <button onClick={handleForceResolve} disabled={resolveLoading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">
                          {resolveLoading && <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M21 3v5h-5"/></svg>}
                          {resolveLoading ? 'Re-resolving…' : 'Force Re-Resolve All Tickers'}
                        </button>
                        {resolveStatus && <p className={`text-xs mt-3 ${resolveStatus.startsWith('✓') ? 'text-green-400' : 'text-zinc-400'}`}>{resolveStatus}</p>}
                      </div>
                      <div className={`${cardCls} p-6 flex flex-col`}>
                        <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 text-zinc-400`}>Refresh Prices</h3>
                        <p className={`text-sm mb-4 text-zinc-300 flex-1`}>
                          Update all stock prices from Yahoo Finance to reflect current market values.
                        </p>
                        <button
                          onClick={handleRefreshPrices}
                          disabled={isRefreshingPrices}
                          title="Refresh prices from Yahoo Finance"
                          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${isRefreshingPrices ? 'opacity-50 cursor-not-allowed bg-zinc-700 text-zinc-400' : 'bg-sky-600 hover:bg-sky-500 text-white'}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isRefreshingPrices ? 'animate-spin' : ''}><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M21 3v5h-5"/></svg>
                          {isRefreshingPrices ? 'Refreshing…' : 'Refresh Prices'}
                        </button>
                      </div>
                      <div className={`${cardCls} p-6`}>
                        <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 text-zinc-400`}>Portfolio Snapshot</h3>
                        {dashboardData?.builtAt ? (
                          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-green-900/20 border border-green-800/40 text-green-400 text-xs font-medium">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Snapshot stored — {dashboardData.portfolio?.length ?? 0} holdings · saved {new Date(dashboardData.builtAt).toLocaleString()}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-zinc-700/40 border border-zinc-600/40 text-zinc-400 text-xs font-medium">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            No snapshot — prices fetched live on each load
                          </div>
                        )}
                        <p className={`text-sm mb-4 text-zinc-300`}>
                          {dashboardData?.builtAt
                            ? 'Safe to re-upload CSV — snapshot will serve as fallback while new prices load.'
                            : 'Your portfolio is saved to the cloud after each price refresh and loads instantly on any device.'}
                        </p>
                        <button
                          onClick={handleClearPortfolioCache}
                          disabled={isClearingSnapshot}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${isClearingSnapshot ? 'opacity-50 cursor-not-allowed bg-zinc-700 text-zinc-400' : 'bg-sky-600 hover:bg-sky-500 text-white'}`}
                        >
                          {isClearingSnapshot && <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M21 3v5h-5"/></svg>}
                          {isClearingSnapshot ? 'Clearing…' : 'Clear Snapshot'}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <h3 className={`text-sm font-bold uppercase tracking-wider text-zinc-400`}>Data Management</h3>
                      {txCount.byBroker && Object.keys(txCount.byBroker).length > 0 && (
                        <div className={`${cardCls} p-5 flex flex-col gap-3`}>
                          <h4 className="text-sm font-bold">Imported CSVs</h4>
                          <div className="flex flex-col divide-y divide-zinc-700 rounded-xl overflow-hidden border border-zinc-700">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 bg-zinc-700/40">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Broker</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 text-right">Rows</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 w-14"></span>
                            </div>
                            {Object.entries(txCount.byBroker).map(([broker, info]) => {
                              const hasTrades = info.types.buy || info.types.sell;
                              const hasDivs = info.types.dividend;
                              return (
                                <div key={broker} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2.5 bg-zinc-800 hover:bg-zinc-750 transition">
                                  <div>
                                    <p className="text-sm font-semibold capitalize">{broker}</p>
                                    <p className={`text-[10px] text-zinc-400`}>{[hasTrades && 'Transactions', hasDivs && 'Dividends'].filter(Boolean).join(' · ')}</p>
                                  </div>
                                  <span className="text-xs font-bold text-right text-zinc-300">{info.total}</span>
                                  <button onClick={() => handleClearBroker(broker)} className="text-[11px] font-semibold text-red-400 hover:text-red-300 transition w-14 text-right">Remove</button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-5">
                        <div className={`${cardCls} p-6 flex flex-col`}>
                          <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 text-zinc-400`}>Clear Ticker Cache</h3>
                          <p className={`text-sm flex-1 text-zinc-300`}>
                            Removes saved ticker-to-symbol mappings. Holdings and transaction history are untouched — tickers will be re-resolved on the next CSV upload.
                          </p>
                          <button onClick={handleClearTickerCache} className="mt-4 w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition">
                            Clear Ticker Cache
                          </button>
                        </div>
                        <div className={`${cardCls} p-6 flex flex-col`}>
                          <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 text-amber-400`}>Clear Holdings</h3>
                          <p className={`text-sm flex-1 text-zinc-300`}>
                            Resets your portfolio to empty. Transaction history and ticker mappings are preserved — re-uploading the same CSV will skip ticker resolution entirely.
                          </p>
                          <button onClick={handleClearHoldings} className="mt-4 w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-semibold transition">
                            Clear Holdings
                          </button>
                        </div>
                        <div className={`${cardCls} p-6 flex flex-col`}>
                          <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 text-red-400`}>Clear All Data</h3>
                          <p className={`text-sm flex-1 text-zinc-300`}>
                            Wipes everything: holdings, all imported transactions, and ticker resolutions. Nothing can be recovered after this.
                          </p>
                          <button onClick={handleClearAll} className="mt-4 w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition">
                            Clear All Data
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentTab === 'settings' && (
                  <div className="flex flex-col gap-5">
                    <h2 className="text-xl font-bold">Settings</h2>
                  </div>
                )}

{currentTab === 'overview' && (
                  <div className="flex flex-col gap-6">
                    {uploadLoading && (!dashboardData || portfolio.length === 0) ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-8">
                        {/* Circular progress ring */}
                        <div className="relative w-24 h-24">
                          {/* Track ring */}
                          <svg className="w-24 h-24" viewBox="0 0 96 96">
                            <circle cx="48" cy="48" r="40" fill="none" stroke="#1f2937" strokeWidth="7"/>
                          </svg>
                          {/* Spinning blue arc - continuous CSS animation */}
                          <svg className="absolute inset-0 w-24 h-24" viewBox="0 0 96 96" style={{ animation: 'spin 2s linear infinite' }}>
                            <circle cx="48" cy="48" r="40" fill="none" stroke="#71717a" strokeWidth="7"
                              strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 40}`}
                              strokeDashoffset={`${2 * Math.PI * 40 * 0.75}`}
                            />
                            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                          </svg>
                        </div>

                        {/* Status label */}
                        <div className="flex flex-col items-center gap-1 text-center max-w-xs">
                          {uploadProgress?.phase === 'resolving' && uploadProgress?.totalCount > 0 ? (
                            <>
                              <p className={`text-sm font-semibold text-zinc-200`}>
                                Resolved {displayedResolved}/{uploadProgress.totalCount} tickers…
                              </p>
                              <p className={`text-xs text-zinc-400`}>
                                {uploadProgress.label.replace(/^Resolved \d+\/\d+ tickers\.\.\.?\s*/, '')}
                              </p>
                            </>
                          ) : (
                            <p className={`text-sm font-semibold text-zinc-200`}>
                              {uploadProgress?.label || 'Processing…'}
                            </p>
                          )}
                          {uploadProgress?.txEstimate > 0 && (
                            <p className={`text-xs text-zinc-400`}>
                              approx. {uploadProgress.txEstimate.toLocaleString()} transactions
                            </p>
                          )}
                        </div>

                        {/* Step indicators */}
                        <div className="flex items-center gap-2">
                          {[
                            { label: 'Upload',  phases: ['clearing','parsing','uploading'] },
                            { label: 'Resolve', phases: ['resolving'] },
                            { label: 'Build',   phases: ['syncing','done'] },
                          ].map((step, i) => {
                            const order = ['clearing','parsing','uploading','resolving','syncing','done'];
                            const cur = order.indexOf(uploadProgress?.phase || 'parsing');
                            const start = order.indexOf(step.phases[0]);
                            const end   = order.indexOf(step.phases[step.phases.length - 1]);
                            const done  = cur > end;
                            const active = cur >= start && cur <= end;
                            return (
                              <div key={step.label} className="flex items-center gap-2">
                                {i > 0 && <div className={`w-10 h-px transition-colors ${done ? 'bg-sky-500' : 'bg-zinc-700'}`}/>}
                                <div className="flex flex-col items-center gap-1.5">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                    done   ? 'bg-zinc-600 text-white' :
                                    active ? 'bg-zinc-600/30 border-2 border-zinc-600 text-zinc-300' :
                                    'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                  }`}>
                                    {done ? '✓' : i + 1}
                                  </div>
                                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>{step.label}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-medium">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Do not log out or close this tab during import
                        </div>

                        <button
                          onClick={() => { uploadAbortRef.current = true; uploadAbortControllerRef.current?.abort(); }}
                          className="text-xs text-red-400 hover:text-red-300 font-semibold transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : !dashboardData || portfolio.length === 0 ? (
                      <div className="max-w-lg mx-auto w-full flex flex-col gap-5 py-8">
                        <div>
                          <h2 className="text-xl font-bold mb-1">Import CSV</h2>
                          <p className={`text-sm text-zinc-400`}>Upload a CSV from your broker to get started.</p>
                        </div>
                        <div className={`${cardCls} p-5 flex flex-col gap-4`}>
                          <div>
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 text-zinc-400`}>Broker</p>
                            <select
                              value={selectedBroker}
                              onChange={e => setSelectedBroker(e.target.value)}
                              className={`w-full px-3 py-2 rounded-lg border text-sm outline-none bg-zinc-700 border-zinc-600 text-white`}
                            >
                              <option value="auto">Auto-detect</option>
                              <option value="montrose">Montrose</option>
                              <option value="avanza">Avanza</option>
                              <option value="nordnet">Nordnet</option>
                            </select>
                          </div>
                          <button disabled={uploadLoading} onClick={() => globalFileInputRef.current?.click()} className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition ${uploadLoading ? 'opacity-50 cursor-not-allowed bg-zinc-700 text-zinc-400' : 'bg-sky-600 hover:bg-sky-500 text-white'}`}>
                            {uploadLoading
                              ? <><span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />Processing…</>
                              : uploadStatus
                              ? <><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>Re-upload CSV</>
                              : <><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload CSV files</>
                            }
                          </button>
                          <p className={`text-xs text-zinc-400`}>Supports Montrose, Avanza and Nordnet. Select a broker manually or use auto-detect.</p>
                          {uploadProgress && (
                            <div className={`rounded-lg px-3 py-2.5 text-sm border bg-zinc-700/40 border-zinc-600/40 text-zinc-300`}>
                              <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin shrink-0" /><span className="font-medium">{uploadProgress.label}</span></div>
                            </div>
                          )}
                          {uploadStatus?.error && <div className="rounded-lg px-3 py-2 text-xs bg-red-900/20 border border-red-800/40 text-red-400">✗ {uploadStatus.error}</div>}
                          {!uploadProgress && uploadStatus?.results && (
                            <div className="flex flex-col gap-1.5">
                              {uploadStatus.results.map((r, i) => (
                                <div key={i} className={`bg-zinc-700/50 rounded-lg px-3 py-2 text-xs`}>
                                  {r.error ? <p className="text-red-400">✗ {r.file}: {r.error}</p> : <p><span className="font-bold capitalize">{r.broker}</span> — {r.count} rows</p>}
                                </div>
                              ))}
                              <p className="text-xs text-green-400 font-semibold">+{uploadStatus.newAdded} new · {uploadStatus.total} total</p>
                            </div>
                          )}
                          {txCount.total > 0 && (
                            <div className={`bg-zinc-700/50 rounded-xl px-3 py-2.5 flex items-center justify-between`}>
                              <div><p className="text-sm font-bold text-green-400">{txCount.trades} trades</p><p className={`text-xs text-zinc-400`}>{txCount.total} total in history</p></div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-400"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                          {txCount.trades > 0 && (
                            <>
                              <button onClick={handleSyncPortfolio} disabled={syncLoading} className={`py-2.5 rounded-xl font-semibold text-sm transition ${syncLoading ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' : 'bg-green-700 hover:bg-green-600 text-white'}`}>
                                {syncLoading ? '⏳ Syncing…' : '⟳ Sync Portfolio'}
                              </button>
                              {syncStatus && <p className={`text-xs ${syncStatus.startsWith('✓') ? 'text-green-400' : 'text-zinc-400'}`}>{syncStatus}</p>}
                              <button onClick={handleResolveTickers} disabled={resolveLoading} className={`py-2.5 rounded-xl font-semibold text-sm transition bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-50`}>
                                {resolveLoading ? '⏳ Resolving...' : '🔍 Resolve Tickers'}
                              </button>
                              {resolveStatus && <p className={`text-xs ${resolveStatus.startsWith('✓') ? 'text-green-400' : 'text-zinc-400'}`}>{resolveStatus}</p>}
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-col gap-2 flex-1 min-w-0">
                            {hasStalePrices && (
                              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-yellow-900/20 border border-yellow-800/40 text-yellow-400`}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                <span className="flex-1">
                                  {dashboardData?.fromCache
                                    ? <>Showing saved snapshot from {new Date(dashboardData.builtAt).toLocaleString()} — <button onClick={handleRefreshPrices} className="underline font-semibold hover:opacity-75 transition">Refresh prices</button> to update.</>
                                    : 'Prices may be delayed — price data could not be fetched, showing last known values.'}
                                </span>
                                <button onClick={() => setStaleBannerDismissed(true)} className="shrink-0 opacity-60 hover:opacity-100 transition ml-1" title="Dismiss">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </div>
                            )}
                            {hasFailedHoldings && (
                              <div className={`px-3 py-2.5 rounded-lg text-xs bg-red-900/20 border border-red-800/40 text-red-400`}>
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-1.5 font-medium">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                    {failedHoldings.length} holding{failedHoldings.length > 1 ? 's' : ''} not found on Yahoo Finance
                                  </div>
                                  {showRetryCountdown ? (
                                    <RetryCountdown onRetry={() => { setShowRetryCountdown(false); handleRefreshPrices(); }} />
                                  ) : failedHoldings.length <= 5 ? (
                                    <button onClick={handleRetryFailed} disabled={retryingFailed} className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50">
                                      {retryingFailed ? 'Retrying…' : 'Retry'}
                                    </button>
                                  ) : (
                                    <button onClick={() => navigate('/portfolio/settings')} className="shrink-0 font-semibold underline underline-offset-2">
                                      Force re-resolve →
                                    </button>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1">
                                  {failedHoldings.map(h => (
                                    <div key={h.ticker} className="flex items-center justify-between gap-2 pl-3">
                                      <span className="font-mono">{h.ticker}{h.isin ? <span className={`ml-1.5 font-sans text-red-500/70`}>{h.isin}</span> : ''}</span>
                                      {h.isin && (
                                        <button onClick={() => { navigate('/portfolio/settings'); setTimeout(() => { if (overrideIsinRef.current) overrideIsinRef.current.value = h.isin; }, 50); }} className="shrink-0 font-semibold underline underline-offset-2">
                                          Set ticker →
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <p className={`mt-1.5 pl-3 text-red-500/60`}>Use "Set ticker" to pin ISIN to a Yahoo Finance ticker, then re-upload.</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          {(() => {
                            const statCard = `bg-zinc-800 border-zinc-700 border rounded-2xl p-6 relative overflow-hidden`;
                            const statLabel = `text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400`;
                            return (<>
                              <div className={statCard}>
                                <div className="absolute inset-x-0 top-0 h-[3px] bg-zinc-600" />
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    <p className={statLabel}>Total Value</p>
                                    <button onClick={toggleHideValues} title={hideValues ? 'Show values' : 'Hide values'} className="text-zinc-500 hover:text-zinc-300 transition">
                                      {hideValues
                                        ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                      }
                                    </button>
                                  </div>
                                  <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                                </div>
                                <p className="text-4xl font-bold tracking-tight">{fmtH(totals?.value)}</p>
                              </div>
                              <div className={statCard}>
                                <div className={`absolute inset-x-0 top-0 h-[3px] ${todayPositive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <div className="flex items-center justify-between mb-4">
                                  <p className={statLabel}>Today's Gain</p>
                                  {todayPositive
                                    ? <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                                    : <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                                  }
                                </div>
                                <p className={`text-4xl font-bold tracking-tight ${todayPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {todayTotal !== null ? `${todayPositive ? '+' : ''}${fmtH(todayTotal)}` : '—'}
                                </p>
                                {todayPct != null && (
                                  <p className={`text-sm font-medium mt-2.5 ${todayPositive ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                                    {`${todayPositive ? '+' : ''}${todayPct.toFixed(2)}% today`}
                                  </p>
                                )}
                              </div>
                              <div className={statCard}>
                                <div className={`absolute inset-x-0 top-0 h-[3px] ${plPositive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <div className="flex items-center justify-between mb-4">
                                  <p className={statLabel}>Total Return</p>
                                  <svg className={`w-4 h-4 ${plPositive ? 'text-emerald-500' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                </div>
                                <p className={`text-4xl font-bold tracking-tight ${plColor}`}>
                                  {totals ? `${plSign}${totals.returnPct.toFixed(2)}%` : '—'}
                                </p>
                                {totals && (
                                  <p className={`text-sm font-medium mt-2.5 ${plPositive ? 'text-green-400/60' : 'text-red-400/60'}`}>
                                    {`${plSign}${fmtH(totals.profit)} profit / loss`}
                                  </p>
                                )}
                              </div>
                            </>);
                          })()}
                        </div>
                        {dashboardData.portfolio.length > 0 && (
                          <div className={`${cardCls} p-6`}>
                            <div className="flex items-center justify-between mb-6">
                              <h3 className={`text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400`}>Best &amp; Worst Today</h3>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-400 font-medium">Sort by:</span>
                                <select
                                  value={todaySortMode}
                                  onChange={e => setTodaySortMode(e.target.value)}
                                  className="px-2 py-1.5 rounded-lg border text-xs outline-none bg-zinc-700 border-zinc-600 text-white"
                                >
                                  <option value="currency">Amount ({sym})</option>
                                  <option value="pct">Percentage (%)</option>
                                </select>
                              </div>
                            </div>
                            <TodayCards data={dashboardData.portfolio} sortMode={todaySortMode} fmt={fmt} fmtSym={fmtH} hideValues={hideValues} />
                          </div>
                        )}

                        {dashboardData.portfolio.filter(h => !h.noData && h.currentValue != null).length > 0 && (() => {
                          const validHoldings = dashboardData.portfolio
                            .filter(h => !h.noData && h.currentValue != null && h.quantity > 0)
                            .sort((a, b) => b.currentValue - a.currentValue);
                          const holdingsTotal = validHoldings.reduce((s, h) => s + h.currentValue, 0);
                          const maxHoldingValue = validHoldings[0]?.currentValue || 1;

                          const countryNames = { se:'Sweden', us:'United States', no:'Norway', dk:'Denmark', fi:'Finland', nl:'Netherlands', fr:'France', de:'Germany', gb:'United Kingdom', it:'Italy', es:'Spain', ch:'Switzerland', ca:'Canada', au:'Australia', hk:'Hong Kong', jp:'Japan', sg:'Singapore' };
                          const byCountry = {};
                          validHoldings.forEach(h => { const cc = h.flag || 'us'; byCountry[cc] = (byCountry[cc] || 0) + h.currentValue; });
                          const geoTotal = Object.values(byCountry).reduce((s, v) => s + v, 0);
                          const geoCountries = Object.entries(byCountry).map(([cc, value]) => ({ cc, value, weight: geoTotal > 0 ? (value / geoTotal) * 100 : 0 })).sort((a, b) => b.value - a.value);
                          const maxGeoValue = geoCountries[0]?.value || 1;

                          return (
                            <>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className={`${cardCls} p-6`}>
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className={`text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400`}>Largest Holdings</h3>
                                    <span className={`text-[10px] text-zinc-400`}>{dashboardData.portfolio.length} total</span>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {validHoldings.slice(0, 10).map(h => {
                                      const weight = holdingsTotal > 0 ? (h.currentValue / holdingsTotal) * 100 : 0;
                                      const relW = (h.currentValue / maxHoldingValue) * 100;
                                      return (
                                        <div key={h.ticker} className={`flex flex-col gap-1 p-2 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 transition`}>
                                          <div className="flex items-center gap-2">
                                            <img src={`https://flagcdn.com/${h.flag || 'us'}.svg`} alt={h.flag || 'us'} className="w-6 h-4 object-cover rounded shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="font-semibold text-xs truncate">{h.cleanName}</p>
                                              <p className={`text-[10px] text-zinc-400`}>{h.ticker}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                              <p className="font-bold text-xs">{weight.toFixed(2)}%</p>
                                              <p className={`text-[10px] text-zinc-400`}>{fmtH(h.currentValue)}</p>
                                            </div>
                                          </div>
                                          <div className={`h-0.5 rounded-full bg-zinc-600 overflow-hidden`}>
                                            <div className="h-full bg-linear-to-r from-red-500 to-pink-500" style={{ width: `${relW}%` }} />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className={`${cardCls} p-6`}>
                                  <h3 className={`text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400 mb-4`}>Recent Transactions</h3>
                                  {txHistoryLoading ? (
                                    <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"/></div>
                                  ) : txHistory.length === 0 ? (
                                    <p className={`text-center py-12 text-sm text-zinc-400`}>No transactions yet.</p>
                                  ) : (
                                    <div className="flex flex-col gap-2">
                                      {(() => {
                                        const flagByTicker = Object.fromEntries((dashboardData?.portfolio || []).map(s => [s.ticker, s.flag]));
                                        return txHistory.filter(tx => ['buy','sell','dividend'].includes(tx.type)).slice(0, 10).map((tx, i) => {
                                          const isBuy = tx.type === 'buy';
                                          const isSell = tx.type === 'sell';
                                          const pillCls = isBuy ? 'bg-emerald-900/40 text-emerald-400' : isSell ? 'bg-red-900/40 text-red-400' : 'bg-blue-900/40 text-blue-400';
                                          const typeLabel = isBuy ? 'Buy' : isSell ? 'Sell' : 'Dividend';
                                          const totalPositive = tx.total >= 0;
                                          const flag = flagByTicker[tx.ticker] || flagByTicker[tx.raw_ticker];
                                          return (
                                            <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg bg-zinc-700/50`}>
                                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 w-16 text-center ${pillCls}`}>{typeLabel}</span>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold truncate flex items-center gap-1.5">
                                                  {flag && <img src={`https://flagcdn.com/${flag}.svg`} alt={flag} className="w-4 h-3 object-cover rounded-sm shrink-0" />}
                                                  {tx.name || tx.ticker || tx.raw_ticker || '—'}
                                                </p>
                                                <p className={`text-[10px] text-zinc-400`}>{tx.date ? tx.date.slice(0, 10) : '—'}</p>
                                              </div>
                                              {tx.total != null && <p className={`text-xs font-semibold shrink-0 tabular-nums ${totalPositive ? 'text-emerald-400' : 'text-red-400'}`}>{totalPositive ? '+' : ''}{fmtH(tx.total)}</p>}
                                            </div>
                                          );
                                        });
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {dividends?.byYear?.length > 0 && (() => {
                                  const maxDiv = Math.max(...dividends.byYear.map(y => y.total));
                                  return (
                                    <div className={`${cardCls} p-6`}>
                                      <div className="flex items-center justify-between mb-4">
                                        <h3 className={`text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400`}>Dividend Income</h3>
                                        <span className={`text-[10px] text-zinc-400`}>All time: {fmtH(dividends.totalAllTime)}</span>
                                      </div>
                                      <div className="flex flex-col gap-3">
                                        {dividends.byYear.map(y => (
                                          <div key={y.year} className="flex items-center gap-3">
                                            <span className={`text-xs font-bold w-10 shrink-0 text-zinc-300`}>{y.year}</span>
                                            <div className={`flex-1 h-5 rounded-full bg-zinc-700 overflow-hidden`}>
                                              <div className="h-full rounded-full bg-linear-to-r from-red-500 to-pink-500" style={{ width: `${maxDiv > 0 ? (y.total / maxDiv) * 100 : 0}%`, transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)' }} />
                                            </div>
                                            <span className={`text-xs font-bold w-24 text-right shrink-0 text-zinc-300`}>{fmtH(y.total)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {geoCountries.length > 0 && (
                                  <div className={`${cardCls} p-6`}>
                                    <h3 className={`text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400 mb-4`}>Geographic Exposure</h3>
                                    <div className="flex flex-col gap-2">
                                      {geoCountries.map(({ cc, value, weight }) => (
                                        <div key={cc} className="flex items-center gap-3">
                                          <img src={`https://flagcdn.com/${cc}.svg`} alt={cc} className="w-6 h-4 object-cover rounded shrink-0" />
                                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className={`text-xs font-semibold truncate text-zinc-200`}>{countryNames[cc] || cc.toUpperCase()}</span>
                                              <span className="text-xs font-bold shrink-0">{weight.toFixed(1)}%</span>
                                            </div>
                                            <div className={`h-1 rounded-full bg-zinc-700 overflow-hidden`}>
                                              <div className="h-full rounded-full bg-linear-to-r from-red-500 to-pink-500" style={{ width: `${(value / maxGeoValue) * 100}%` }} />
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}

                {currentTab === 'holdings' && (() => {
                  const COLS = [
                    { key: 'name', label: 'Name', sortFn: (a, b) => a.name.localeCompare(b.name) },
                    { key: 'ticker', label: 'Ticker', sortFn: (a, b) => a.ticker.localeCompare(b.ticker) },
                    { key: 'nativePrice', label: 'Price', sortFn: (a, b) => a.nativePrice - b.nativePrice },
                    { key: 'priceTime', label: 'Time', title: 'Most recent price fetch', sortFn: (a, b) => (a.priceDate || '').localeCompare(b.priceDate || '') },
                    { key: 'todayPct', label: 'Today %', sortFn: (a, b) => a.todayChangePct - b.todayChangePct },
                    { key: 'quantity', label: 'Qty', sortFn: (a, b) => a.quantity - b.quantity },
                    { key: 'profit', label: `Return (${sym})`, sortFn: (a, b) => a.profit - b.profit },
                    { key: 'returnPct', label: 'Return %', sortFn: (a, b) => a.returnPct - b.returnPct },
                    { key: 'value', label: `Value (${sym})`, sortFn: (a, b) => a.currentValue - b.currentValue },
                  ];
                  const handleSort = key => { if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir('desc'); } };
                  const col = COLS.find(c => c.key === sortCol);
                  const rows = dashboardData ? [...dashboardData.portfolio].sort((a, b) => { const v = col ? col.sortFn(a, b) : 0; return sortDir === 'asc' ? v : -v; }) : [];
                  if (!dashboardData || portfolio.length === 0) return <EmptyState title="No holdings" desc="Upload a CSV and sync your portfolio." />;
                  return (
                    <div className={`${cardCls} overflow-hidden`}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className={`bg-zinc-900 border-zinc-700 border-b`}>
                            <tr>{COLS.map(c => <th key={c.key} onClick={() => handleSort(c.key)} title={c.title} className={`p-4 font-bold text-zinc-400 hover:text-white uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition text-xs`}>{c.label}{sortCol === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</th>)}</tr>
                          </thead>
                          <tbody>
                            {rows.map(s => (
                              <tr key={s.ticker} className={`border-t ${s.noData ? 'border-red-900/40 bg-red-900/10' : 'border-zinc-700/60 hover:bg-zinc-700/50 cursor-pointer'} transition-colors`}>
                                <td className="p-4 font-bold"><span className="flex items-center gap-2"><img src={`https://flagcdn.com/${s.flag}.svg`} alt={s.flag} className="w-4 h-3 object-cover rounded-sm shrink-0" /><span>{s.cleanName || s.name}</span>{s.noData && <span className={`text-xs font-normal text-red-500`}>no data</span>}</span></td>
                                <td className={`p-4 text-zinc-300`}>{s.ticker}</td>
                                <td className="p-4 whitespace-nowrap">
                                  <span>{fmt(s.nativePrice)} {s.currency}</span>
                                </td>
                                <td className="p-4 whitespace-nowrap text-xs" title="Most recent price fetch">
                                  {s.priceDate ? (() => { const d = new Date(s.priceDate); const now = new Date(); const isToday = d.toDateString() === now.toDateString(); const label = isToday ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); return <span className={isToday ? 'text-zinc-400' : 'text-amber-500/70'}>{label}</span>; })() : <span className="text-zinc-400">—</span>}
                                </td>
                                <td className={`p-4 font-bold whitespace-nowrap ${s.todayChangePct == null ? '' : s.todayChangePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.todayChangePct == null ? '—' : `${s.todayChangePct >= 0 ? '+' : ''}${s.todayChangePct.toFixed(2)}%`}</td>
                                <td className="p-4">{s.quantity}</td>
                                <td className={`p-4 font-bold whitespace-nowrap ${s.profit == null ? '' : s.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.profit == null ? '—' : `${s.profit >= 0 ? '+' : ''}${fmtH(s.profit)}`}</td>
                                <td className={`p-4 font-bold whitespace-nowrap ${s.returnPct == null ? '' : s.returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.returnPct == null ? '—' : `${s.returnPct >= 0 ? '+' : ''}${s.returnPct.toFixed(2)}%`}</td>
                                <td className="p-4 whitespace-nowrap">{fmtH(s.currentValue)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            {(() => {
                              const totalProfit = rows.reduce((s, r) => r.profit != null ? s + r.profit : s, 0);
                              const totalValue = rows.reduce((s, r) => r.currentValue != null ? s + r.currentValue : s, 0);
                              const totalCost = rows.reduce((s, r) => r.currentValue != null && r.profit != null ? s + (r.currentValue - r.profit) : s, 0);
                              const totalReturnPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : null;
                              const profitPos = totalProfit >= 0;
                              const pctPos = totalReturnPct == null || totalReturnPct >= 0;
                              return (
                                <tr className="border-t-2 border-zinc-600 bg-zinc-900/60">
                                  <td className="p-4 text-xs font-bold uppercase tracking-wider text-zinc-400" colSpan={6}>Total</td>
                                  <td className={`p-4 font-bold whitespace-nowrap ${profitPos ? 'text-green-400' : 'text-red-400'}`}>{profitPos ? '+' : ''}{fmtH(totalProfit)}</td>
                                  <td className={`p-4 font-bold whitespace-nowrap ${pctPos ? 'text-green-400' : 'text-red-400'}`}>{totalReturnPct == null ? '—' : `${pctPos ? '+' : ''}${totalReturnPct.toFixed(2)}%`}</td>
                                  <td className="p-4 font-bold whitespace-nowrap">{fmtH(totalValue)}</td>
                                </tr>
                              );
                            })()}
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {currentTab === 'performance' && (
                  <div className="flex flex-col gap-6">
                    {!portfolio.length ? <EmptyState title="No performance data" desc="Upload and sync a portfolio first." /> : (
                      <>
                        <div className={`${cardCls} p-6`}>
                          <div className="flex items-center justify-between mb-5">
                            <h3 className={`text-sm font-bold text-zinc-400 uppercase tracking-wider`}>Portfolio Performance</h3>
                            <div className="flex gap-1">
                              {['1W','1M','3M','1Y','3Y'].map(p => (
                                <button key={p} onClick={() => { setPerfPeriod(p); fetchPerfData(p); }} className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${perfPeriod === p ? 'bg-zinc-600 text-white' : `bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-white`}`}>{p}</button>
                              ))}
                            </div>
                          </div>
                          <LineChart data={perfData} loading={perfLoading} />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {currentTab === 'insights' && (
                  <div className="flex flex-col gap-8">
                    {!dashboardData || portfolio.length === 0 ? <EmptyState title="No insights" desc="Upload and sync a portfolio first." /> : (
                      <>
                        {[
                          { title: 'Portfolio Allocation', data: dashboardData.portfolio.filter(s => s.currentValue != null).map(s => ({ name: s.ticker, value: s.currentValue })) },
                          { title: 'Sector Exposure', data: getSectorData(dashboardData.portfolio) },
                        ].map(({ title, data }) => (
                          <div key={title} className={`${cardCls} p-6`}>
                            <h3 className={`text-sm font-bold text-zinc-400 uppercase tracking-wider mb-6`}>{title}</h3>
                            <PieChart data={data} />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {currentTab === 'dividends' && (
                  <div className="flex flex-col gap-4">
                    {!dividends || dividends.totalAllTime === 0 ? <EmptyState title="No dividends" desc="Upload and sync your portfolio to see dividend history." /> : (() => {
                      const statCard = `bg-zinc-800 border-zinc-700 border rounded-2xl p-6`;
                      const statLabel = `text-[10px] font-semibold tracking-[0.14em] uppercase mb-4 text-zinc-400`;
                      const filteredDivs = (dividends.dividends || []).filter(d => dividendBrokerFilter.has(d.broker));
                      const displayByYear = (() => {
                        const byYear = {};
                        filteredDivs.forEach(d => {
                          const y = d.date?.substring(0,4) || '';
                          if(!y) return;
                          if(!byYear[y]) byYear[y] = {year: y, total: 0, stocks: {}};
                          byYear[y].total += d.total;
                          byYear[y].stocks[d.name] = (byYear[y].stocks[d.name] || 0) + d.total;
                        });
                        return Object.values(byYear).sort((a,b) => b.year.localeCompare(a.year)).map(y => ({...y, stocks: Object.entries(y.stocks).map(([name, total]) => ({name, total})).sort((a,b) => b.total - a.total)}));
                      })();
                      const displayByStock = (() => {
                        const byStock = {};
                        filteredDivs.forEach(d => {
                          byStock[d.name] = (byStock[d.name] || 0) + d.total;
                        });
                        return Object.entries(byStock).map(([name, total]) => ({name, total})).sort((a,b) => b.total - a.total);
                      })();
                      const filterTotal = filteredDivs.reduce((sum, d) => sum + d.total, 0);
                      const maxDiv = Math.max(...displayByYear.map(y => y.total), 1);
                      const avgPerYear = displayByYear.length > 0 ? filterTotal / displayByYear.length : 0;
                      return (
                        <>
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className={statCard}>
                              <p className={statLabel}>All-Time {dividendBrokerFilter.size > 0 && dividendBrokerFilter.size < dividends.brokers.length && '(Filtered)'}</p>
                              <p className="text-4xl font-bold tracking-tight">{fmtH(filterTotal)}</p>
                              <p className={`text-sm font-medium mt-2.5 text-zinc-300`}>{displayByYear.length} year{displayByYear.length !== 1 ? 's' : ''} of data</p>
                            </div>
                            <div className={statCard}>
                              <p className={statLabel}>This Year {dividendBrokerFilter.size > 0 && dividendBrokerFilter.size < dividends.brokers.length && '(Filtered)'}</p>
                              <p className="text-4xl font-bold tracking-tight text-pink-400">{fmtH(filteredDivs.filter(d => d.date?.startsWith(new Date().getFullYear().toString())).reduce((s,d) => s+d.total, 0))}</p>
                              {filterTotal > 0 && <p className={`text-sm font-medium mt-2.5 text-zinc-300`}>{((filteredDivs.filter(d => d.date?.startsWith(new Date().getFullYear().toString())).reduce((s,d) => s+d.total, 0) / filterTotal) * 100).toFixed(1)}% of filtered</p>}
                            </div>
                            <div className={statCard}>
                              <p className={statLabel}>Avg per Year {dividendBrokerFilter.size > 0 && dividendBrokerFilter.size < dividends.brokers.length && '(Filtered)'}</p>
                              <p className="text-4xl font-bold tracking-tight">{fmtH(avgPerYear)}</p>
                              {displayByStock.length > 0 && <p className={`text-sm font-medium mt-2.5 text-zinc-300`}>from {displayByStock.length} stock{displayByStock.length !== 1 ? 's' : ''}</p>}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className={`${cardCls} p-6`}>
                              <div className="flex items-center justify-between mb-5">
                                <h3 className={`text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400`}>By Year</h3>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => navigate('/portfolio/import-dividends')} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 transition">+ Import Dividends</button>
                                  <button disabled={isFixingDividendNames} onClick={async () => {
                                    setIsFixingDividendNames(true);
                                    try {
                                      // Fire-and-forget: server responds immediately, resolves in background
                                      apiFetch('/api/dividends/fix-names', { method: 'POST' }).catch(() => {});
                                      // Wait for background resolution to finish (~5–10s), then refresh
                                      await new Promise(r => setTimeout(r, 9000));
                                      apiCache.bust('/api/dividends');
                                      const res = await apiFetch(`/api/dividends?currency=${baseCurrency}`);
                                      const d = await res.json();
                                      if (d) { setDividends(d); apiCache.set(`/api/dividends?currency=${baseCurrency}`, d); }
                                    } catch {}
                                    setIsFixingDividendNames(false);
                                  }} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition disabled:opacity-50">
                                    {isFixingDividendNames ? 'Fixing… ' : 'Fix Names'}
                                  </button>
                                  <div className="relative">
                                    <button onClick={() => setDividendFilterOpen(!dividendFilterOpen)} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition">
                                      Filter {dividendBrokerFilter.size < (dividends?.brokers?.length ?? dividendBrokerFilter.size) ? `(${dividendBrokerFilter.size})` : ''}
                                    </button>
                                    {dividendFilterOpen && (
                                      <>
                                        <div className="fixed inset-0 z-40" onClick={() => setDividendFilterOpen(false)} />
                                        {dividends?.brokers && (
                                          <div className="absolute right-0 top-full mt-2 bg-zinc-800 border border-zinc-700 rounded-lg p-3 z-50 min-w-48 shadow-xl">
                                            <div className="flex flex-col gap-2">
                                              {[...dividends.brokers].sort().map(broker => (
                                                <label key={broker} className="flex items-center gap-2 cursor-pointer text-sm text-zinc-200 hover:text-white">
                                                  <input
                                                    type="checkbox"
                                                    checked={dividendBrokerFilter.has(broker)}
                                                    onChange={e => {
                                                      const newFilter = new Set(dividendBrokerFilter);
                                                      if (e.target.checked) {
                                                        newFilter.add(broker);
                                                      } else {
                                                        newFilter.delete(broker);
                                                      }
                                                      setDividendBrokerFilter(newFilter);
                                                    }}
                                                    className="w-4 h-4 rounded"
                                                  />
                                                  {broker.charAt(0).toUpperCase() + broker.slice(1)}
                                                </label>
                                              ))}
                                            </div>
                                            <button onClick={() => setDividendFilterOpen(false)} className="mt-3 w-full text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition">Close</button>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                {displayByYear.map(({ year, total, stocks }) => (
                                  <div key={year}>
                                    <div onClick={() => setExpandedYear(expandedYear === year ? null : year)} className={`flex items-center gap-3 py-1.5 px-2 cursor-pointer rounded-lg hover:bg-zinc-700/50 transition`}>
                                      <span className={`text-sm font-bold w-12 shrink-0 text-zinc-200`}>{year}</span>
                                      <div className={`flex-1 h-5 bg-zinc-700 rounded-full overflow-hidden`}>
                                        <div className="h-full rounded-full bg-linear-to-r from-red-500 to-pink-500" style={{ width: `${maxDiv > 0 ? (total / maxDiv) * 100 : 0}%`, transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)' }} />
                                      </div>
                                      <span className={`text-sm font-bold w-24 text-right shrink-0 text-zinc-200`}>{fmtH(total)}</span>
                                      <span className={`text-xs w-4 shrink-0 text-center text-zinc-400`}>{expandedYear === year ? '▲' : '▼'}</span>
                                    </div>
                                    <div style={{ maxHeight: expandedYear === year ? `${(stocks?.length || 0) * 28 + 16}px` : '0px', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                                      <div className={`ml-14 mt-1 mb-2 flex flex-col gap-1 border-l-2 border-zinc-700 pl-3`}>
                                        {stocks?.map(({ name, total: sTotal }) => (
                                          <div key={name} className="flex items-center gap-3">
                                            <span className={`text-xs w-44 shrink-0 truncate text-zinc-300`}>{name}</span>
                                            <div className={`flex-1 h-3 bg-zinc-700 rounded-full overflow-hidden`}>
                                              <div className="h-full rounded-full bg-linear-to-r from-red-500/60 to-pink-500/60" style={{ width: `${(sTotal / (stocks[0]?.total || 1)) * 100}%` }} />
                                            </div>
                                            <span className={`text-xs w-20 text-right shrink-0 text-zinc-200`}>{fmtH(sTotal)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className={`${cardCls} p-6`}>
                              <div className="flex items-center justify-between mb-5">
                                <h3 className={`text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-400`}>Top Payers</h3>
                                <span className={`text-[10px] text-zinc-400`}>{dividends.byStock.length} stocks</span>
                              </div>
                              <div className="flex flex-col gap-2">
                                {displayByStock.slice(0, 10).map(({ name, total }, idx) => {
                                  const maxPayer = displayByStock[0]?.total || 1;
                                  const pct = dividends.totalAllTime > 0 ? (total / dividends.totalAllTime) * 100 : 0;
                                  return (
                                    <div key={name} className={`flex flex-col gap-1 p-2 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 transition`}>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold w-4 shrink-0 text-center text-zinc-400`}>{idx + 1}</span>
                                        <p className="flex-1 font-semibold text-xs truncate min-w-0">{name}</p>
                                        <div className="text-right shrink-0">
                                          <p className="font-bold text-xs">{pct.toFixed(1)}%</p>
                                          <p className={`text-[10px] text-zinc-300`}>{fmtH(total)}</p>
                                        </div>
                                      </div>
                                      <div className={`h-0.5 rounded-full bg-zinc-600 overflow-hidden`}>
                                        <div className="h-full bg-linear-to-r from-red-500 to-pink-500" style={{ width: `${(total / maxPayer) * 100}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {currentTab === 'history' && (
                  <TransactionHistoryTab
                    txHistory={txHistory} txHistoryLoading={txHistoryLoading}
                    txSearch={txSearch} setTxSearch={setTxSearch}
                    txTypeFilter={txTypeFilter} setTxTypeFilter={setTxTypeFilter}
                    txFilterOpen={txFilterOpen} setTxFilterOpen={setTxFilterOpen}
                    txDateFrom={txDateFrom} setTxDateFrom={setTxDateFrom}
                    txDateTo={txDateTo} setTxDateTo={setTxDateTo}
                    txDateOpen={txDateOpen} setTxDateOpen={setTxDateOpen}
                    txCalView={txCalView} setTxCalView={setTxCalView}
                    txCalFromMonth={txCalFromMonth} setTxCalFromMonth={setTxCalFromMonth}
                    txCalToMonth={txCalToMonth} setTxCalToMonth={setTxCalToMonth}
                    sym={sym} fmt={fmt} cardCls={cardCls}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
      </>
    );
  };

  // ── Auth screens ────────────────────────────────────────────────────────────
  if (authStatus === 'loading') return (
    <div className="fixed inset-0 bg-zinc-900">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-8 h-8 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
      </div>
    </div>
  );

  if (authStatus !== 'logged-in') {
    const isSignup = authMode === 'signup';
    const isForgot = authMode === 'forgot-password';
    const isForgotSent = authMode === 'forgot-sent';
    const isReset = authMode === 'reset-password';
    const isVerifyEmail = authMode === 'verify-email';

    const authBackground = (
      <div className="relative flex h-screen items-center justify-center bg-zinc-950 text-white overflow-hidden">
        <canvas ref={auroraCanvas} className="absolute inset-0 w-full h-full pointer-events-none" style={{filter:'blur(48px)'}}/>
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{opacity:0.045}}>
          <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
          <rect width="100%" height="100%" filter="url(#grain)"/>
        </svg>
        <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.75) 100%)'}} />
      </div>
    );

    const AuthLogo = () => (
      <div className="text-center mb-7">
        <div className="inline-flex items-center justify-center w-14 h-14 mb-4">
          <img src="/logo.png" alt="Verumen" className="w-14 h-14 object-contain"/>
        </div>
        <h1 className="text-2xl font-bold text-white" style={{letterSpacing:'-0.02em'}}>Verumen</h1>
      </div>
    );

    if (isForgot) return (
      <div className="relative flex h-screen items-center justify-center bg-zinc-950 text-white overflow-hidden">
        {authBackground}
        <div className="relative w-full max-w-xs mx-4 flex flex-col items-center">
          <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
            <AuthLogo/>
            <p className="text-sm text-zinc-400 text-center mb-5 -mt-2">Enter your email and we'll send a reset link.</p>
            {authError && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5 text-sm text-red-400">{authError}</div>}
            <div className="flex flex-col gap-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M0 4a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H2a2 2 0 01-2-2V4zm2-1a1 1 0 00-1 1v.217l7 4.2 7-4.2V4a1 1 0 00-1-1H2zm13 2.383l-4.758 2.855L15 11.114V5.383zm-.034 6.878L9.271 8.82 8 9.583 6.728 8.82l-5.694 3.44A1 1 0 002 13h12a1 1 0 00.966-.739zM1 11.114l4.758-2.876L1 5.383v5.731z"/></svg>
                </span>
                <input type="email" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleForgotPassword()} autoFocus placeholder="Enter your email"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15"/>
              </div>
              <button onClick={handleForgotPassword} disabled={authLoading} className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm">
                {authLoading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending...</span> : 'Send Reset Link'}
              </button>
              <button onClick={()=>{setAuthMode('login');setAuthError('');}} className="text-sm text-center text-zinc-500 hover:text-zinc-300 transition">Back to sign in</button>
            </div>
          </div>
          <p className="mt-6 text-xs text-zinc-700">© {new Date().getFullYear()}</p>
        </div>
      </div>
    );

    if (authMode === 'verify-pending') return (
      <div className="relative flex h-screen items-center justify-center bg-zinc-950 text-white overflow-hidden">
        {authBackground}
        <div className="relative w-full max-w-xs mx-4 flex flex-col items-center">
          <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center">
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </div>
            <p className="font-bold text-white mb-2">Verify your email</p>
            <p className="text-sm text-zinc-400 mb-2">Account created! A verification link has been sent to <span className="text-zinc-300">{authForm.email}</span>.</p>
            <p className="text-sm text-zinc-500 mb-6">Click the link in that email to activate your account. It expires in 24 hours.</p>
            <button onClick={()=>{setAuthMode('login');setAuthError('');}} className="text-sm text-zinc-500 hover:text-zinc-300 transition">Back to sign in</button>
          </div>
          <p className="mt-6 text-xs text-zinc-700">© {new Date().getFullYear()}</p>
        </div>
      </div>
    );

    if (isForgotSent) return (
      <div className="relative flex h-screen items-center justify-center bg-zinc-950 text-white overflow-hidden">
        {authBackground}
        <div className="relative w-full max-w-xs mx-4 flex flex-col items-center">
          <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center">
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
            <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </div>
            <p className="font-bold text-white mb-2">Check your email</p>
            <p className="text-sm text-zinc-400 mb-6">If an account exists for <span className="text-zinc-300">{authForm.email}</span>, a reset link has been sent. It expires in 10 minutes.</p>
            <button onClick={()=>{setAuthMode('login');setAuthError('');}} className="text-sm text-zinc-500 hover:text-zinc-300 transition">Back to sign in</button>
          </div>
          <p className="mt-6 text-xs text-zinc-700">© {new Date().getFullYear()}</p>
        </div>
      </div>
    );

    if (isReset) return (
      <div className="relative flex h-screen items-center justify-center bg-zinc-950 text-white overflow-hidden">
        {authBackground}
        <div className="relative w-full max-w-xs mx-4 flex flex-col items-center">
          <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
            <AuthLogo/>
            <p className="text-sm text-zinc-400 text-center mb-5 -mt-2">Enter your new password.</p>
            {authError && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5 text-sm text-red-400">{authError}</div>}
            <div className="flex flex-col gap-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M11 7V5a3 3 0 00-6 0v2H4a1 1 0 00-1 1v5a1 1 0 001 1h8a1 1 0 001-1V8a1 1 0 00-1-1h-1zM6 5a2 2 0 014 0v2H6V5zm2 6a1 1 0 110-2 1 1 0 010 2z"/></svg>
                </span>
                <input type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleResetPassword()} autoFocus placeholder="New password (6+ chars)"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15"/>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M11 7V5a3 3 0 00-6 0v2H4a1 1 0 00-1 1v5a1 1 0 001 1h8a1 1 0 001-1V8a1 1 0 00-1-1h-1zM6 5a2 2 0 014 0v2H6V5zm2 6a1 1 0 110-2 1 1 0 010 2z"/></svg>
                </span>
                <input type="password" value={authForm.confirmPassword} onChange={e=>setAuthForm(f=>({...f,confirmPassword:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleResetPassword()} placeholder="Confirm new password"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15"/>
              </div>
              <button onClick={handleResetPassword} disabled={authLoading} className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm">
                {authLoading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Updating...</span> : 'Set New Password'}
              </button>
            </div>
          </div>
          <p className="mt-6 text-xs text-zinc-700">© {new Date().getFullYear()}</p>
        </div>
      </div>
    );

    if (isVerifyEmail) return (
      <div className="relative flex h-screen items-center justify-center bg-zinc-950 text-white overflow-hidden">
        {authBackground}
        <div className="relative w-full max-w-xs mx-4 flex flex-col items-center">
          <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center">
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
            <AuthLogo/>
            <EmailVerifyView token={emailVerifyToken} onDone={() => { window.history.replaceState({}, '', '/'); setAuthMode('login'); setSessionExpiredMsg('Email verified — please sign in.'); }}/>
          </div>
          <p className="mt-6 text-xs text-zinc-700">© {new Date().getFullYear()}</p>
        </div>
      </div>
    );

    return (
      <div className="relative flex h-screen items-center justify-center bg-zinc-950 text-white overflow-hidden">
        {authBackground}

        <div className="relative w-full max-w-xs mx-4 flex flex-col items-center">
          {/* Form card */}
          <div className="relative w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
            {/* Glass top-edge highlight */}
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
            {/* Logo */}
            <div className="text-center mb-7">
              <div className="inline-flex items-center justify-center w-14 h-14 mb-4">
                <img src="/logo.png" alt="Verumen" className="w-14 h-14 object-contain"/>
              </div>
              <h1 className="text-2xl font-bold text-white" style={{letterSpacing:'-0.02em'}}>Verumen</h1>
            </div>
            {sessionExpiredMsg && (
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3.5 mb-5">
                <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                <div>
                  <p className="text-sm font-semibold text-amber-300">Your session has expired.</p>
                  <p className="text-xs text-amber-400/80 mt-0.5">Please sign in again.</p>
                </div>
              </div>
            )}
            {authError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5 text-sm text-red-400">{authError}</div>
            )}
            <div className="flex flex-col gap-4">
              {/* Username */}
              <div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-4.5 5c0-2 2-3.5 4.5-3.5s4.5 1.5 4.5 3.5H3.5z"/></svg>
                  </span>
                  <input type="text" value={authForm.username} onChange={e=>setAuthForm(f=>({...f,username:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} autoFocus placeholder="Enter username"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15"/>
                </div>
              </div>
              {/* Email (signup only) */}
              {isSignup && (
                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M0 4a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H2a2 2 0 01-2-2V4zm2-1a1 1 0 00-1 1v.217l7 4.2 7-4.2V4a1 1 0 00-1-1H2zm13 2.383l-4.758 2.855L15 11.114V5.383zm-.034 6.878L9.271 8.82 8 9.583 6.728 8.82l-5.694 3.44A1 1 0 002 13h12a1 1 0 00.966-.739zM1 11.114l4.758-2.876L1 5.383v5.731z"/></svg>
                    </span>
                    <input type="email" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} placeholder="Enter email address"
                      className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15"/>
                  </div>
                </div>
              )}
              {/* Password */}
              <div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M11 7V5a3 3 0 00-6 0v2H4a1 1 0 00-1 1v5a1 1 0 001 1h8a1 1 0 001-1V8a1 1 0 00-1-1h-1zM6 5a2 2 0 014 0v2H6V5zm2 6a1 1 0 110-2 1 1 0 010 2z"/></svg>
                  </span>
                  <input type={showPassword?'text':'password'} value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} placeholder="Enter password"
                    className="w-full pl-9 pr-10 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15"/>
                  <button type="button" onClick={()=>setShowPassword(s=>!s)} className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${showPassword?'text-sky-400':'text-zinc-500 hover:text-zinc-300'}`}>
                    {showPassword
                      ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>
              {/* Confirm password (signup) */}
              {isSignup && (
                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M11 7V5a3 3 0 00-6 0v2H4a1 1 0 00-1 1v5a1 1 0 001 1h8a1 1 0 001-1V8a1 1 0 00-1-1h-1zM6 5a2 2 0 014 0v2H6V5zm2 6a1 1 0 110-2 1 1 0 010 2z"/></svg>
                    </span>
                    <input type="password" value={authForm.confirmPassword} onChange={e=>setAuthForm(f=>({...f,confirmPassword:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()}
                      className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15"/>
                  </div>
                </div>
              )}
              {/* Country (signup) */}
              {isSignup && (
                <div>
                  <div className="flex items-center gap-2">
                    <img src={`https://flagcdn.com/${authForm.country||'se'}.svg`} alt="" className="w-8 h-6 rounded-sm shrink-0"/>
                    <select value={authForm.country||'se'} onChange={e=>setAuthForm(f=>({...f,country:e.target.value}))}
                      className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white">
                      {[
                        {code:'se',name:'🇸🇪 Sweden'},{code:'no',name:'🇳🇴 Norway'},{code:'dk',name:'🇩🇰 Denmark'},
                        {code:'fi',name:'🇫🇮 Finland'},{code:'de',name:'🇩🇪 Germany'},{code:'gb',name:'🇬🇧 United Kingdom'},
                        {code:'fr',name:'🇫🇷 France'},{code:'es',name:'🇪🇸 Spain'},{code:'it',name:'🇮🇹 Italy'},
                        {code:'nl',name:'🇳🇱 Netherlands'},{code:'pl',name:'🇵🇱 Poland'},{code:'ch',name:'🇨🇭 Switzerland'},
                        {code:'at',name:'🇦🇹 Austria'},{code:'be',name:'🇧🇪 Belgium'},{code:'pt',name:'🇵🇹 Portugal'},
                        {code:'us',name:'🇺🇸 United States'},{code:'ca',name:'🇨🇦 Canada'},{code:'au',name:'🇦🇺 Australia'},
                        {code:'nz',name:'🇳🇿 New Zealand'},{code:'jp',name:'🇯🇵 Japan'},{code:'cn',name:'🇨🇳 China'},
                        {code:'sg',name:'🇸🇬 Singapore'},{code:'in',name:'🇮🇳 India'},{code:'br',name:'🇧🇷 Brazil'},
                        {code:'za',name:'🇿🇦 South Africa'},{code:'ae',name:'🇦🇪 UAE'},{code:'ru',name:'🇷🇺 Russia'},
                      ].map(c=><option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <button onClick={handleAuth} disabled={authLoading}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm mt-1">
                {authLoading?<span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in...</span>:isSignup?'Create Account':'Sign In'}
              </button>
              <div className="flex flex-col items-center gap-2">
                {authStatus==='logged-out' && allowRegistration === true && <button onClick={()=>{setAuthMode(isSignup?'login':'signup');setAuthError('');setAuthForm({username:'',email:'',password:'',confirmPassword:'',newPassword:''});}} className="text-sm text-center text-zinc-500 hover:text-zinc-300 transition">{isSignup?'Already have an account? Sign in':'Create an account'}</button>}
                {authStatus==='logged-out' && allowRegistration === false && authMode==='login' && <p className="text-xs text-center text-zinc-600">Registration is currently closed.</p>}
                {!isSignup && <button onClick={()=>{setAuthMode('forgot-password');setAuthError('');setAuthForm(f=>({...f,email:''}));}} className="text-xs text-center text-zinc-600 hover:text-zinc-400 transition">Forgot password?</button>}
              </div>
            </div>
          </div>
          <p className="mt-6 text-xs text-zinc-700">© {new Date().getFullYear()}</p>
        </div>
      </div>
    );
  }

  // ── Initializing screen (shown once after login until first data fetch completes) ──
  if (isInitializing) return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#18181b', zIndex: 9999 }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <img src="/logo.png" alt="Verumen" style={{ width: '28px', height: '28px', objectFit: 'contain' }}/>
          <span style={{ fontSize: '20px', fontWeight: 700, color: 'white', fontFamily: "'Geist', sans-serif", letterSpacing: '-0.02em' }}>Verumen</span>
        </div>
        <div className="animate-spin" style={{ width: '32px', height: '32px', border: '4px solid #a1a1aa', borderTopColor: 'transparent', borderRadius: '50%' }}/>
      </div>
    </div>
  );

  // ── Main App Return with Routes ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar 
      currentUser={{ username: authUsername, role: userRole }}
      onLogout={handleLogout}
      selectedBroker={selectedBroker}
      onBrokerChange={setSelectedBroker}
      portfolioActions={{
        txCount, uploadLoading, uploadStatus, uploadProgress,
        syncLoading, syncStatus, resolveLoading, resolveStatus,
        onUpload: handleUpload,
        onSync: handleSyncPortfolio,
        onResolve: handleResolveTickers,
        portfolio, selectedForRemoval,
        onToggleRemoval: toggleRemoval,
        onRemoveSelected: handleRemoveSelected,
        onForceResolve: handleForceResolve,
        baseCurrency, onSetBaseCurrency: setBaseCurrency,
        overrides, overrideMsg,
        onAddOverride: handleAddOverride,
        onDeleteOverride: handleDeleteOverride,
        authForm, authError, authLoading,
        onAuthFormChange: (field, val) => setAuthForm(f => ({ ...f, [field]: val })),
        onChangePassword: handleChangePassword,
        onClearPortfolio: () => { apiFetch('/api/portfolio/cached', { method: 'DELETE' }); setPortfolio([]); setDashboardData(null); apiCache.del('/api/portfolio-dashboard'); apiCache.del('/api/portfolio-fingerprint'); },
        onClearTransactions: handleClearTransactions,
        onClearAll: handleClearAll,
        onClearTickerCache: handleClearTickerCache,
        onClearBroker: handleClearBroker,
        onCancelUpload: () => { uploadAbortRef.current = true; uploadAbortControllerRef.current?.abort(); },
      }}
    />
      
      {/* GlobalBar rendered once here so it never remounts on navigation */}
      <GlobalBar authUsername={authUsername} onNavigate={handleNavigate} onLogout={handleLogout} userRole={userRole} searchInputRef={globalSearchRef} />

      {/* Stable file input — lives outside PortfolioView so it's never destroyed by re-renders */}
      <input
        ref={globalFileInputRef}
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={e => { const f = Array.from(e.target.files); e.target.value = ''; handleUpload(f); }}
      />

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace/>}/>
          <Route path="/home" element={<PageShell {...shellProps}><SocialFeed authUsername={authUsername} onViewProfile={u=>navigate(`/profile/@${u}`)}/></PageShell>}/>
          <Route path="/friends" element={<PageShell {...shellProps}><FriendsPage authUsername={authUsername}/></PageShell>}/>
          
          {/* Portfolio routes — single wildcard so React reconciles in place (no remount = scroll preserved) */}
          <Route path="/portfolio/*" element={renderPortfolioView()}/>

          {/* Skins routes */}
          <Route path="/skins/overview" element={<PageShell {...shellProps}><CSSkins authUsername={authUsername} baseCurrency={baseCurrency}/></PageShell>}/>
          <Route path="/skins/inventory" element={<PageShell {...shellProps}><CSSkins authUsername={authUsername} baseCurrency={baseCurrency}/></PageShell>}/>
          <Route path="/skins/traderegistry" element={<PageShell {...shellProps}><CSSkins authUsername={authUsername} baseCurrency={baseCurrency}/></PageShell>}/>
          <Route path="/settings" element={<PageShell {...shellProps}><SettingsPage baseCurrency={baseCurrency} onSetBaseCurrency={setBaseCurrency}/></PageShell>}/>
          <Route path="/profile/:username/edit" element={<PageShell {...shellProps}><ProfileEditPage authUsername={authUsername}/></PageShell>}/>
          <Route path="/profile" element={<ProfileRoute authUsername={authUsername} shellProps={shellProps}/>}/>
          <Route path="/profile/:username" element={<ProfileRoute authUsername={authUsername} shellProps={shellProps}/>}/>

          {/* Admin routes — single wildcard prevents remount on sub-nav */}
          <Route path="/adminpanel/*" element={<PageShell {...shellProps}><AdminPanel authUsername={authUsername}/></PageShell>}/>

          <Route path="/moderatorpanel" element={<PageShell {...shellProps}><ModeratorPanel authUsername={authUsername} userRole={userRole}/></PageShell>}/>
          <Route path="*" element={<Navigate to="/home" replace/>}/>
        </Routes>
      </div>

      {/* Clear All Data password modal */}
      {clearAllModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setClearAllModal(false)}>
          <div className={`bg-zinc-800 border-zinc-700 border rounded-2xl p-6 w-80 shadow-2xl`} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-1">Clear All Data</h3>
            <p className={`text-sm mb-4 text-zinc-300`}>
              This will permanently delete all portfolio holdings and transaction history. Enter your password to confirm.
            </p>
            <input
              type="password"
              value={clearAllPw}
              onChange={e => setClearAllPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmClearAll()}
              placeholder="Your password"
              autoFocus
              className={`w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2 bg-zinc-700 border-zinc-600 text-white placeholder-zinc-500`}
            />
            {clearAllError && <p className="text-xs text-red-400 mb-2">{clearAllError}</p>}
            <div className="flex gap-2 mt-1">
              <button
                onClick={confirmClearAll}
                disabled={clearAllLoading}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition"
              >
                {clearAllLoading ? 'Verifying…' : 'Clear All Data'}
              </button>
              <button
                onClick={() => setClearAllModal(false)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition bg-zinc-700 hover:bg-zinc-600 text-zinc-200`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


