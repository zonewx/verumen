import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import GlobalBar from './GlobalBar';
import { TOPBAR_H, contentColumn } from './ui';
import apiCache from './apiCache';
import { getToken, setToken, clearToken } from './tokenStore';
import { IconAlert, IconSpinner, IconRefresh, IconSearch } from './icons';
import { flash } from './flash';
import { startPresence, stopPresence } from './presence';

const CSSkins = lazy(() => import('./CSSkins'));
const ProfilePageView = lazy(() => import('./ProfilePageView'));
const ProfileEditPage = lazy(() => import('./ProfileEditPage'));
const AdminPanel = lazy(() => import('./AdminPanel'));
const ModeratorPanel = lazy(() => import('./ModeratorPanel'));
const SocialFeed = lazy(() => import('./SocialFeed'));
const FriendsPage = lazy(() => import('./FriendsPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const TradeSharePage = lazy(() => import('./TradeSharePage'));

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

function ProfileRoute({ authUsername, authToken, shellProps }) {
  const { username } = useParams();
  const viewUser = username || null;
  return <PageShell {...shellProps}><ProfilePageView authUsername={authUsername} viewUsername={viewUser} authToken={authToken}/></PageShell>;
}

function PageShell({ title, children }) {
  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-white overflow-hidden" style={{ paddingTop: TOPBAR_H }}>
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
      <button onClick={onDone} className="w-full bg-zinc-600 hover:bg-zinc-500 text-white font-semibold py-3 rounded-xl transition text-sm">Sign In</button>
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

// Per-user data kept in localStorage. Wiped whenever a session ends or a different user's
// session is found, so the next person on a shared browser never starts from someone else's data.
// 'portfolio' / 'baseCurrency' / 'hidePortfolioValues' are left over from the removed stock portfolio
const USER_STORAGE_KEYS = ['auth_user', 'auth_role', 'portfolio', 'baseCurrency', 'hidePortfolioValues'];
const USER_STORAGE_PREFIXES = ['steam_inv_cache'];
function clearUserStorage() {
  try {
    USER_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage)
      .filter(k => USER_STORAGE_PREFIXES.some(p => k.startsWith(p)))
      .forEach(k => localStorage.removeItem(k));
  } catch {
    // Storage unavailable (e.g. blocked by the browser) — then there's nothing stored to clear
  }
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Aurora canvas (login page only) ────────────────────────────────────────
  const auroraCanvas = useRef(null);
  const auroraRaf    = useRef(null);

  // ── Auth ───────────────────────────────────────────────────────────────────
  // Start in 'loading' when a stored username exists so we can verify the
  // session via the HttpOnly refresh cookie before showing the app.
  const [authStatus, setAuthStatus] = useState(() =>
    localStorage.getItem('auth_user') ? 'loading' : 'logged-out'
  );
  const [authUsername, setAuthUsername] = useState(() => localStorage.getItem('auth_user') || '');
  const [authToken, setAuthToken] = useState(null);
  const [authMode, setAuthMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset_token')) return 'reset-password';
    if (params.get('email_token')) return 'verify-email';
    return 'login';
  });
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('reset_token') || '');
  const [emailVerifyToken] = useState(() => new URLSearchParams(window.location.search).get('email_token') || '');
  // The verify screen only renders when logged out. If the link is opened while already
  // logged in (typical for a self-service email change), verify in the background instead.
  // Online presence: live via Supabase Realtime when it's available, plus a heartbeat ping
  // (server treats <2 min as online) that keeps status working if realtime can't connect.
  useEffect(() => {
    if (authStatus === 'logged-in' && authToken && authUsername) startPresence(authUsername);
    else if (authStatus !== 'logged-in') stopPresence();
  }, [authStatus, authToken, authUsername]);
  useEffect(() => {
    if (authStatus !== 'logged-in') return;
    const beat = () => {
      const token = getToken();
      if (token && document.visibilityState === 'visible') fetch('/api/users/heartbeat', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 60 * 1000);
    document.addEventListener('visibilitychange', beat);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', beat); };
  }, [authStatus]);

  const emailVerifyHandled = useRef(false);
  useEffect(() => {
    if (authStatus !== 'logged-in' || !emailVerifyToken || emailVerifyHandled.current) return;
    emailVerifyHandled.current = true;
    window.history.replaceState({}, '', window.location.pathname);
    setAuthMode('login');
    fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: emailVerifyToken }) })
      .then(r => r.json())
      .then(d => {
        flash(d.success ? '✓ Email address confirmed' : `✗ ${d.error || 'Email verification failed'}`, 5000);
        if (d.success) window.dispatchEvent(new Event('email-verified'));
      })
      .catch(() => flash('✗ Email verification failed. Please try again.', 5000));
  }, [authStatus, emailVerifyToken]);
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '', confirmPassword: '', newPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [userRole, setUserRole] = useState(() => localStorage.getItem('auth_role') || 'user');
  const [allowRegistration, setAllowRegistration] = useState(() => {
    const early = window.__AUTH_STATUS_DATA;
    if (early) return early.allowRegistration !== false && !early.reachedLimit;
    const cfg = window.__VERUMEN_CONFIG;
    if (cfg) return cfg.allowRegistration;
    const ls = localStorage.getItem('verumen_allowRegistration');
    return ls !== null ? ls !== 'false' : true;
  });
  // True from login (or page-load while already logged in) until first fetchAllData completes
  const [isInitializing, setIsInitializing] = useState(() =>
    !!localStorage.getItem('auth_user')
  );

  // ── Global flash notification ───────────────────────────────────────────────
  const [globalFlash, setGlobalFlash] = useState(null); // { msg, ms }
  useEffect(() => {
    const handler = e => {
      const { msg, ms = 3000 } = e.detail;
      setGlobalFlash({ msg, ms });
      setTimeout(() => setGlobalFlash(f => f?.msg === msg ? null : f), ms);
    };
    window.addEventListener('app:flash', handler);
    return () => window.removeEventListener('app:flash', handler);
  }, []);

  const globalSearchRef = useRef(null);

  // ── API helper ─────────────────────────────────────────────────────────────
  const apiFetch = useCallback(async (url, opts = {}) => {
    const token = getToken();
    const res = await fetch(url, {
      ...opts,
      credentials: 'include',
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
    // Refresh access token every 45 minutes (tokens expire after 60 min)
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setToken(data.token);
        } else {
          handleLogout();
        }
      } catch(e) {}
    }, 45 * 60 * 1000);
    return () => clearInterval(interval);
  }, [authStatus]);


  // ── Bootstrap: single round-trip auth + data fetch ───────────────────────
  useEffect(() => {
    fetch('/api/init', { credentials: 'include' }).then(r => r.json()).then(d => {
      const val = d.allowRegistration !== false && !d.reachedLimit;
      setAllowRegistration(val);
      localStorage.setItem('verumen_allowRegistration', String(val));
      if (!d.hasUsers) { setAuthStatus('no-user'); setAuthMode('signup'); return; }
      if (!d.ok) {
        // Session gone (expired / revoked) — drop the previous user's cached data too,
        // including what was already loaded into state from localStorage at mount
        clearUserStorage();
        setAuthStatus('logged-out');
        return;
      }
      // Cookie belongs to a different user than the cached data (e.g. left over from before this fix)
      if (localStorage.getItem('auth_user') && localStorage.getItem('auth_user') !== d.username) {
        clearUserStorage();
      }
      setToken(d.token);
      setAuthToken(d.token);
      setAuthUsername(d.username);
      setUserRole(d.role || 'user');
      localStorage.setItem('auth_user', d.username);
      localStorage.setItem('auth_role', d.role || 'user');
      if (Array.isArray(d.feed)) apiCache.set('/api/feed', d.feed);
      if (d.friends) apiCache.set('/api/friends', d.friends);
      if (Array.isArray(d.announcements)) { apiCache.set('/api/announcements', d.announcements); setAnnouncements(d.announcements); }
      setAuthStatus('logged-in');
    }).catch(() => setAuthStatus('logged-out'));
  }, []);

  // Re-fetch registration status when returning to this tab while logged out
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (getToken()) return;
      fetch('/api/auth/status').then(r => r.json()).then(d => {
        const val = d.allowRegistration !== false && !d.reachedLimit;
        setAllowRegistration(val); localStorage.setItem('verumen_allowRegistration', String(val));
        if (!val) setAuthMode(m => m === 'signup' ? 'login' : m);
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Keep allowRegistration in sync when admin changes it (same session or other tabs)
  useEffect(() => {
    const handler = (e) => {
      const val = e.detail?.allowRegistration;
      if (typeof val === 'boolean') {
        setAllowRegistration(val); localStorage.setItem('verumen_allowRegistration', String(val));
        if (!val) setAuthMode(m => m === 'signup' ? 'login' : m);
      }
    };
    const storageHandler = (e) => {
      if (e.key !== 'verumen_allowRegistration') return;
      fetch('/api/auth/status').then(r => r.json()).then(d => {
        const val = d.allowRegistration !== false && !d.reachedLimit;
        setAllowRegistration(val); localStorage.setItem('verumen_allowRegistration', String(val));
        if (!val) setAuthMode(m => m === 'signup' ? 'login' : m);
      }).catch(() => {});
    };
    window.addEventListener('settings-changed', handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('settings-changed', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const handleAuth = async () => {
    setAuthError(''); setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        if (authForm.password !== authForm.confirmPassword) { setAuthError('Passwords do not match.'); setAuthLoading(false); return; }
        if (!authForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForm.email.trim())) { setAuthError('A valid email address is required.'); setAuthLoading(false); return; }
        const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authForm.username, password: authForm.password, email: authForm.email.trim() }) });
        const data = await res.json();
        if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
        setAuthMode('verify-pending');
      } else {
        const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: authForm.username, password: authForm.password }) });
        const data = await res.json();
        if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
        localStorage.setItem('auth_user', data.username);
        localStorage.setItem('auth_role', data.role || 'user');
        setToken(data.token);
        setAuthToken(data.token);
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
    clearToken();
    setAuthToken(null);
    clearUserStorage();
    setAuthStatus('logged-out'); setAuthUsername('');
    setAuthMode('login');
    setAuthForm({ username: '', password: '', confirmPassword: '', newPassword: '' });
    navigate('/');
    setUserRole('user');
    apiCache.bust('/api/cs/'); apiCache.bust('/api/users/'); apiCache.del('/api/announcements'); apiCache.del('/api/feed'); apiCache.del('/api/friends');
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    if (msg) setSessionExpiredMsg(msg);
    fetch('/api/auth/status').then(r => r.json()).then(d => {
      const val = d.allowRegistration !== false && !d.reachedLimit;
      setAllowRegistration(val); localStorage.setItem('verumen_allowRegistration', String(val));
      if (!val) setAuthMode('login');
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
    const map = { home:'/', skins:'/skins/overview', social:'/feed', friends:'/friends', profile:'/user', admin:'/adminpanel', moderator:'/moderatorpanel' };
    if (dest === 'view-profile' && param) navigate(`/user/${param}`);
    else navigate(map[dest] || '/');
  };

  // ── Data prefetch ──────────────────────────────────────────────────────────
  // After login, warm the caches the first pages read from, then reveal the app
  useEffect(() => {
    if (!authUsername || authStatus !== 'logged-in') return;
    const get = url => apiFetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const cached = url => (apiCache.has(url) ? Promise.resolve(null) : get(url));
    (async () => {
      const [feedRes, friendsRes, csInvRes, csPnlRes, csSetRes, annRes, profRes] = await Promise.all([
        cached('/api/feed'),
        cached('/api/friends'),
        cached('/api/cs/inventory'),
        cached('/api/cs/pnl'),
        cached('/api/cs/settings'),
        cached('/api/announcements'),
        cached(`/api/users/${authUsername}/profile`),
      ]);
      if (Array.isArray(feedRes)) apiCache.set('/api/feed', feedRes);
      if (friendsRes && typeof friendsRes === 'object') apiCache.set('/api/friends', friendsRes);
      if (Array.isArray(csInvRes)) apiCache.set('/api/cs/inventory', csInvRes);
      if (csPnlRes && typeof csPnlRes === 'object') apiCache.set('/api/cs/pnl', csPnlRes);
      if (csSetRes && typeof csSetRes === 'object') apiCache.set('/api/cs/settings', csSetRes);
      if (Array.isArray(annRes)) apiCache.set('/api/announcements', annRes);
      if (profRes && typeof profRes === 'object' && !profRes.error) apiCache.set(`/api/users/${authUsername}/profile`, profRes);
      setIsInitializing(false);

      // Preload friends' profile data in background
      (friendsRes?.friends || []).forEach(friend => {
        if (!apiCache.has(`/api/users/${friend.username}/profile`)) {
          get(`/api/users/${friend.username}/profile`).then(data => {
            if (data && typeof data === 'object' && !data.error) apiCache.set(`/api/users/${friend.username}/profile`, data);
          });
        }
      });
    })();
  }, [authUsername, authStatus, apiFetch]);


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
      if (e.key === 'Escape' && globalSearchRef.current) globalSearchRef.current.blur();
    };
    document.addEventListener('keydown', hkd);
    return () => document.removeEventListener('keydown', hkd);
  }, []);

  useEffect(() => { document.title = 'Verumen'; }, []);

  // ── Pages ─────────────────────────────────────────────────────────────
  // Build stable shell props so PageShell (defined at module scope) preserves child component state across App re-renders
  const shellProps = { authUsername, onNavigate: handleNavigate, onLogout: handleLogout, userRole, searchInputRef: globalSearchRef };

  // ── Public routes (accessible without login) ───────────────────────────────
  if (location.pathname.startsWith('/trade/')) return (
    <Routes>
      <Route path="/trade/:id" element={<TradeSharePage />} />
    </Routes>
  );

  // ── Auth screens ────────────────────────────────────────────────────────────
  if (authStatus === 'loading') return (
    <div className="fixed inset-0 bg-zinc-900">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-8 h-8 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
      </div>
    </div>
  );

  if (authStatus !== 'logged-in' && location.pathname.match(/^\/user\/[^/]+$/)) {
    const viewUsername = location.pathname.split('/').pop().replace('@', '');
    return (
      <div className="fixed inset-0 bg-zinc-950 text-white overflow-y-auto">
        <header className="fixed inset-x-0 top-0 bg-zinc-900 border-b border-zinc-800 z-50" style={{ height: TOPBAR_H }}>
          <div className={`${contentColumn} h-full px-6 flex items-center`}>
            <a href="/" className="text-[19px] font-bold text-white" style={{ fontFamily: "'Geist', sans-serif", letterSpacing: '-0.03em' }}>Verumen</a>
          </div>
        </header>
        <div style={{ paddingTop: TOPBAR_H }}>
          <ProfilePageView authUsername={authUsername} viewUsername={viewUsername} authToken={authToken} />
        </div>
      </div>
    );
  }

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
        <p className="fixed bottom-4 right-5 text-xs text-zinc-500 pointer-events-none select-none z-50">Issues? contact: <a href="mailto:w@verumen.com" className="text-zinc-400 hover:text-zinc-300 transition pointer-events-auto">w@verumen.com</a></p>
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
                  className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-zinc-500/60 focus:ring-2 focus:ring-zinc-500/15"/>
              </div>
              <button onClick={handleForgotPassword} disabled={authLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm">
                {authLoading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending...</span> : 'Send Reset Link'}
              </button>
              <button onClick={()=>{setAuthMode('login');setAuthError('');}} className="text-sm text-center text-zinc-400 hover:text-zinc-200 transition">Back to sign in</button>
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
            <button onClick={()=>{setAuthMode('login');setAuthError('');}} className="text-sm text-zinc-400 hover:text-zinc-200 transition">Back to sign in</button>
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
            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </div>
            <p className="font-bold text-white mb-2">Check your email</p>
            <p className="text-sm text-zinc-400 mb-6">If an account exists for <span className="text-zinc-300">{authForm.email}</span>, a reset link has been sent. It expires in 10 minutes.</p>
            <button onClick={()=>{setAuthMode('login');setAuthError('');}} className="text-sm text-zinc-400 hover:text-zinc-200 transition">Back to sign in</button>
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
                  className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-zinc-500/60 focus:ring-2 focus:ring-zinc-500/15"/>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M11 7V5a3 3 0 00-6 0v2H4a1 1 0 00-1 1v5a1 1 0 001 1h8a1 1 0 001-1V8a1 1 0 00-1-1h-1zM6 5a2 2 0 014 0v2H6V5zm2 6a1 1 0 110-2 1 1 0 010 2z"/></svg>
                </span>
                <input type="password" value={authForm.confirmPassword} onChange={e=>setAuthForm(f=>({...f,confirmPassword:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleResetPassword()} placeholder="Confirm new password"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-zinc-500/60 focus:ring-2 focus:ring-zinc-500/15"/>
              </div>
              <button onClick={handleResetPassword} disabled={authLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm">
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
            {/* Title */}
            <div className="flex items-center justify-center h-[104px] mb-7">
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
                    className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-zinc-500/60 focus:ring-2 focus:ring-zinc-500/15"/>
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
                      className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-zinc-500/60 focus:ring-2 focus:ring-zinc-500/15"/>
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
                    className="w-full pl-9 pr-10 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-zinc-500/60 focus:ring-2 focus:ring-zinc-500/15"/>
                  <button type="button" onClick={()=>setShowPassword(s=>!s)} className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${showPassword?'text-zinc-300':'text-zinc-500 hover:text-zinc-300'}`}>
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
                    <input type={showConfirmPassword?'text':'password'} value={authForm.confirmPassword} onChange={e=>setAuthForm(f=>({...f,confirmPassword:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} placeholder="Confirm password"
                      className="w-full pl-9 pr-10 py-3 rounded-xl border text-sm outline-none transition bg-zinc-800/60 border-zinc-700/60 text-white placeholder-zinc-600 focus:border-zinc-500/60 focus:ring-2 focus:ring-zinc-500/15"/>
                    <button type="button" onClick={()=>setShowConfirmPassword(s=>!s)} className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${showConfirmPassword?'text-zinc-300':'text-zinc-500 hover:text-zinc-300'}`}>
                      {showConfirmPassword
                        ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                    </button>
                  </div>
                </div>
              )}
              <button onClick={handleAuth} disabled={authLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm mt-1">
                {authLoading?<span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in...</span>:isSignup?'Create Account':'Sign In'}
              </button>
              <div className="flex flex-col items-center gap-1">
                {authStatus==='logged-out' && allowRegistration === true && isSignup && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm text-zinc-400">Already have an account?</span>
                    <button onClick={()=>{setAuthMode('login');setAuthError('');setAuthForm({username:'',email:'',password:'',confirmPassword:'',newPassword:''});}} className="text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition">Sign in</button>
                  </div>
                )}
                {authStatus==='logged-out' && allowRegistration === true && !isSignup && (
                  <button onClick={()=>{setAuthMode('signup');setAuthError('');setAuthForm({username:'',email:'',password:'',confirmPassword:'',newPassword:''});}} className="text-sm font-semibold text-center text-zinc-400 hover:text-zinc-200 transition">Create an account</button>
                )}
                {authStatus==='logged-out' && allowRegistration === false && authMode==='login' && <p className="text-xs text-center text-zinc-400">Registration is currently disabled.</p>}
                {!isSignup && <button onClick={()=>{setAuthMode('forgot-password');setAuthError('');setAuthForm(f=>({...f,email:''}));}} className="text-xs font-semibold text-center text-zinc-400 hover:text-zinc-200 transition">Forgot password?</button>}
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
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
        <div className="animate-spin" style={{ width: '32px', height: '32px', border: '3px solid #52525b', borderTopColor: '#a1a1aa', borderRadius: '50%' }}/>
      </div>
    </div>
  );

  // ── Main App Return with Routes ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex overflow-hidden">
      
      {/* GlobalBar rendered once here so it never remounts on navigation */}
      <GlobalBar authUsername={authUsername} onLogout={handleLogout} userRole={userRole} searchInputRef={globalSearchRef} />

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Navigate to="/feed" replace/>}/>
          <Route path="/home" element={<Navigate to="/feed" replace/>}/>
          <Route path="/feed" element={<PageShell {...shellProps}><SocialFeed authUsername={authUsername} onViewProfile={u=>navigate(`/user/${u}`)}/></PageShell>}/>
          <Route path="/friends" element={<PageShell {...shellProps}><FriendsPage authUsername={authUsername}/></PageShell>}/>
          {/* Skins routes */}
          <Route path="/skins/overview" element={<PageShell {...shellProps}><CSSkins authUsername={authUsername}/></PageShell>}/>
          <Route path="/skins/inventory" element={<PageShell {...shellProps}><CSSkins authUsername={authUsername}/></PageShell>}/>
          <Route path="/skins/traderegistry" element={<PageShell {...shellProps}><CSSkins authUsername={authUsername}/></PageShell>}/>
          <Route path="/settings" element={<PageShell {...shellProps}><SettingsPage authUsername={authUsername}/></PageShell>}/>
          {/* The Steam link callback returns here; forward to the user's own edit page, keeping
              the steam_success / steam_error params so the result is shown */}
          <Route path="/profile/edit" element={<Navigate to={`/user/${authUsername}/edit${location.search}`} replace/>}/>
          <Route path="/user/:username/edit" element={<PageShell {...shellProps}><ProfileEditPage authUsername={authUsername}/></PageShell>}/>
          <Route path="/user" element={<ProfileRoute authUsername={authUsername} authToken={authToken} shellProps={shellProps}/>}/>
          <Route path="/user/:username" element={<ProfileRoute authUsername={authUsername} authToken={authToken} shellProps={shellProps}/>}/>

          {/* Admin routes — single wildcard prevents remount on sub-nav */}
          <Route path="/adminpanel/*" element={<PageShell {...shellProps}><AdminPanel authUsername={authUsername}/></PageShell>}/>

          <Route path="/moderatorpanel" element={<PageShell {...shellProps}><ModeratorPanel authUsername={authUsername} userRole={userRole}/></PageShell>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
        </Suspense>
      </div>

      {/* Global flash notification — centered in content area */}
      {globalFlash && (
        <div className="fixed z-[9998] pointer-events-none flex justify-center" style={{ top: TOPBAR_H + 12, left: 0, right: 0 }}>
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
            style={{ animation: `flash-toast ${globalFlash.ms}ms ease forwards` }}
          >
            {globalFlash.msg.startsWith('✓') ? (
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            ) : globalFlash.msg.startsWith('✗') ? (
              <IconAlert size={16} className="text-red-400 shrink-0" />
            ) : (
              <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            )}
            <span className="text-sm font-medium text-zinc-100 whitespace-nowrap">
              {/^[✓✗] /.test(globalFlash.msg) ? globalFlash.msg.slice(2) : globalFlash.msg}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}


