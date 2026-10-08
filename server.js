require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { Resend } = require('resend');
const { supabase, db, supabaseAnon } = require('./supabase');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const APP_URL = process.env.APP_URL || 'https://verumen.com';

function buildEmail({ title, heading, body, buttonText, buttonUrl, footerNote }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
  <tr><td align="center" style="padding:48px 24px 40px">

    <!-- Card -->
    <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)" cellpadding="0" cellspacing="0">
      <!-- Accent bar -->
      <tr><td style="background:#0284c7;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>

      <!-- Wordmark inside card -->
      <tr><td style="padding:32px 44px 0">
        <span style="font-size:18px;font-weight:800;color:#09090b;letter-spacing:-0.5px">Verumen</span>
      </td></tr>

      <!-- Content -->
      <tr><td style="padding:28px 44px 36px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding-bottom:12px">
            <p style="margin:0;font-size:24px;font-weight:700;color:#09090b;line-height:1.25">${heading}</p>
          </td></tr>
          <tr><td style="padding-bottom:36px">
            <p style="margin:0;font-size:15px;color:#71717a;line-height:1.7">${body}</p>
          </td></tr>
          <tr><td align="center" style="padding-bottom:36px">
            <a href="${buttonUrl}" style="display:inline-block;background:#0284c7;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:15px 40px;border-radius:10px;letter-spacing:0.1px">${buttonText}</a>
          </td></tr>
          <tr><td style="border-top:1px solid #f0f0f0;padding-top:24px">
            <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.7">${footerNote}<br/>Or copy this link:<br/><span style="color:#71717a;word-break:break-all">${buttonUrl}</span></p>
          </td></tr>
        </table>
      </td></tr>

      <!-- Card footer -->
      <tr><td style="background:#fafafa;border-top:1px solid #f0f0f0;padding:16px 44px">
        <p style="margin:0;font-size:11px;color:#a1a1aa">© ${year} Verumen &nbsp;·&nbsp; You received this email because of activity on your Verumen account.</p>
      </td></tr>
    </table>

  </td></tr>
</table>
</body></html>`;
}

// ── Email templates ─────────────────────────────────────────────────────────
// Single source for every email's wording. Real sends and the admin preview both render
// from here, so a preview always matches what users actually receive.
const escHtml = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strong = v => `<strong style="color:#09090b;font-weight:600">${escHtml(v)}</strong>`;
const EMAIL_TEMPLATES = {
  welcome: {
    label: 'Welcome (registration)',
    build: ({ username, url }) => ({
      subject: 'Verify your Verumen email address',
      title: 'Verify your email', heading: 'Welcome to Verumen!',
      body: `Your account (${strong(username)}) has been created. Click below to verify your email address and confirm it's yours.`,
      buttonText: 'Verify Email', buttonUrl: url,
      footerNote: "This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.",
    }),
  },
  'admin-verify': {
    label: 'Verify Email (admin)',
    build: ({ username, url }) => ({
      subject: 'Verify your Verumen email address',
      title: 'Verify your email', heading: 'Verify your email',
      body: `An administrator has linked this email address to your Verumen account (${strong(username)}). Click below to confirm it's yours.`,
      buttonText: 'Verify Email', buttonUrl: url,
      footerNote: "This link expires in 24 hours. If you weren't expecting this, you can safely ignore it.",
    }),
  },
  'change-email': {
    label: 'Confirm New Email (self)',
    build: ({ username, url }) => ({
      subject: 'Confirm your new Verumen email address',
      title: 'Confirm your new email', heading: 'Confirm your new email',
      body: `You asked to use this address for your Verumen account (${strong(username)}). Click below to confirm it.`,
      buttonText: 'Confirm Email', buttonUrl: url,
      footerNote: "This link expires in 24 hours. If you didn't request this, you can safely ignore it — your email won't change.",
    }),
  },
  'change-email-notice': {
    label: 'Email Change Notice (old address)',
    build: ({ username, newEmail }) => ({
      subject: 'Your Verumen email address is being changed',
      title: 'Email change requested', heading: 'Email change requested',
      body: `Someone signed in to your Verumen account (${strong(username)}) and asked to change its email to ${strong(newEmail)}. Nothing changes until that address is confirmed. If this wasn't you, change your password right away.`,
      buttonText: 'Go to Verumen', buttonUrl: APP_URL,
      footerNote: 'If you made this request, no action is needed.',
    }),
  },
  reset: {
    label: 'Password Reset (self)',
    build: ({ url }) => ({
      subject: 'Reset your Verumen password',
      title: 'Reset your password', heading: 'Reset your password',
      body: "Someone requested a password reset for the Verumen account associated with this email. If this wasn't you, you can safely ignore this email.",
      buttonText: 'Reset Password', buttonUrl: url,
      footerNote: 'This link expires in 10 minutes.',
    }),
  },
  'admin-reset': {
    label: 'Password Reset (admin)',
    build: ({ url }) => ({
      subject: 'Reset your Verumen password',
      title: 'Reset your password', heading: 'Reset your password',
      body: 'An administrator has sent you a password reset link for your Verumen account.',
      buttonText: 'Reset Password', buttonUrl: url,
      footerNote: 'This link expires in 10 minutes.',
    }),
  },
};
function renderEmail(type, vars) {
  const t = EMAIL_TEMPLATES[type].build(vars);
  return { subject: t.subject, html: buildEmail(t) };
}

// In-memory presence map — userId → last heartbeat timestamp
const _presence = new Map();
const isOnline = id => _presence.has(id) && Date.now() - _presence.get(id) < 2 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 1000;
  for (const [id, ts] of _presence) if (ts < cutoff) _presence.delete(id);
}, 60 * 1000).unref();

// Simple in-memory rate limiter for auth routes
const rateLimitMap = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of rateLimitMap) if (now > v.resetAt) rateLimitMap.delete(k); }, 5 * 60 * 1000).unref();
// Requests arrive via Vercel's rewrite proxy, so req.ip is Vercel's address for everyone.
// Vercel forwards the real client IP in its own headers; prefer those. They could be spoofed
// by calling the Railway URL directly, so per-IP limits are only a first line: anything that
// sends email or can lock an account is also limited by a key the caller can't fake
// (email address, username, account id, or a global cap).
function clientIp(req) {
  const fwd = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.ip || req.socket.remoteAddress;
}
// Counts a hit against `key`; returns true once more than `max` hits land within the window.
function hitLimit(key, max, windowMs) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  rateLimitMap.set(key, record);
  return record.count > max;
}
// True when `key` already has `max` hits in its current window (checks without counting)
function isLimited(key, max) {
  const record = rateLimitMap.get(key);
  return !!record && Date.now() <= record.resetAt && record.count >= max;
}
function rateLimit(maxRequests, windowMs, label) {
  return (req, res, next) => {
    if (hitLimit(`${label}:${clientIp(req)}`, maxRequests, windowMs)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
    }
    next();
  };
}
const authRateLimit = rateLimit(10, 60 * 1000, 'auth');          // 10 attempts per minute per IP
const publicRateLimit = rateLimit(30, 60 * 1000, 'public');      // unauthenticated data routes

const heavyRateLimitMap = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of heavyRateLimitMap) if (now > v) heavyRateLimitMap.delete(k); }, 5 * 60 * 1000).unref();
function heavyRateLimit(cooldownMs, label) {
  return (req, res, next) => {
    if (req.role === 'admin' || req.role === 'moderator') return next();
    const key = `${req.user?.id}:${label}`;
    const now = Date.now();
    const resetAt = heavyRateLimitMap.get(key);
    if (resetAt && now < resetAt) {
      const secsLeft = Math.ceil((resetAt - now) / 1000);
      return res.status(429).json({ error: `Please wait ${secsLeft}s before refreshing again.` });
    }
    heavyRateLimitMap.set(key, now + cooldownMs);
    next();
  };
}

// Per-account limit for logged-in routes that call external services (Steam, CSFloat).
// Keyed by user id rather than IP, so faking forwarding headers doesn't get around it.
function userRateLimit(max, windowMs, label) {
  return (req, res, next) => {
    if (hitLimit(`${label}:${req.user.id}`, max, windowMs)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
    }
    next();
  };
}

// Map with a size cap and per-entry TTL — the oldest entry is evicted once it's full,
// so caches keyed by user-supplied values can't grow without bound.
function boundedCache(maxEntries, ttlMs) {
  const m = new Map();
  return {
    get(k) {
      const e = m.get(k);
      if (!e) return undefined;
      if (Date.now() - e.ts > ttlMs) { m.delete(k); return undefined; }
      return e.v;
    },
    set(k, v) {
      m.delete(k);
      m.set(k, { v, ts: Date.now() });
      if (m.size > maxEntries) m.delete(m.keys().next().value);
    },
  };
}

// ilike treats % and _ as wildcards, so user input must be escaped to get an exact
// case-insensitive match (e.g. "a_b@x.com" must not match "a.b@x.com").
const escapeLike = v => String(v).replace(/[\\%_]/g, m => '\\' + m);

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, // served behind Vercel/Railway CDN which sets its own
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.APP_URL || 'https://verumen.com']
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(cookieParser());

// Default 100kb body limit, except routes that carry images — those parse
// with largeJson in the route itself. A global parser that ran first would reject their
// bodies with 413 before the route-level limit ever applied.
const LARGE_BODY_ROUTES = [
  ['PUT',  /^\/api\/users\/[^/]+\/profile$/],
  ['POST', /^\/api\/activity\/screenshot$/],
];
const smallJson = express.json({ limit: '100kb' });
const largeJson = express.json({ limit: '20mb' });
app.use((req, res, next) =>
  LARGE_BODY_ROUTES.some(([m, re]) => req.method === m && re.test(req.path)) ? next() : smallJson(req, res, next));

// ── Structured logging ──────────────────────────────────────────────────────
const log = {
  info:  (msg, data = {}) => console.log(JSON.stringify({ level: 'info',  ts: new Date().toISOString(), msg, ...data })),
  warn:  (msg, data = {}) => console.log(JSON.stringify({ level: 'warn',  ts: new Date().toISOString(), msg, ...data })),
  error: (msg, data = {}) => console.log(JSON.stringify({ level: 'error', ts: new Date().toISOString(), msg, ...data })),
};

// Request logger middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        log.warn('request', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
      }
    });
  }
  next();
});

const FRONTEND_DIST = process.env.STATERA_FRONTEND || null;
if (FRONTEND_DIST) {
  const fs = require('fs');
  if (fs.existsSync(FRONTEND_DIST)) app.use(express.static(FRONTEND_DIST));
}

// Cached registration state — injected into index.html so the frontend knows
// the value synchronously before any API call completes.
let _allowRegistrationCached = true;
db.from('app_settings').select('value').eq('key', 'allowRegistration').single()
  .then(({ data }) => { if (data) _allowRegistrationCached = data.value !== 'false'; })
  .catch(() => {});

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), ts: new Date().toISOString() });
});

// ── Session revocation ──────────────────────────────────────────────────────
// A password reset stamps profiles.password_changed_at. Any session that was signed into
// before that moment is rejected. Supabase's `amr` claim carries the original sign-in time
// and survives token refreshes, so a refreshed old session is still recognised as old.
function sessionStartedAt(accessToken) {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
    const times = (payload.amr || []).map(a => a.timestamp).filter(Number.isFinite);
    return (times.length ? Math.min(...times) : payload.iat) * 1000;
  } catch { return 0; }
}
const CLOCK_SKEW_MS = 10 * 1000;
function sessionRevoked(accessToken, passwordChangedAt) {
  if (!passwordChangedAt) return false;
  return sessionStartedAt(accessToken) < new Date(passwordChangedAt).getTime() - CLOCK_SKEW_MS;
}
const markPasswordChanged = userId =>
  db.from('profiles').update({ password_changed_at: new Date().toISOString() }).eq('id', userId);

// ── Root admin identity ─────────────────────────────────────────────────────
// The root admin and its recovery account are identified by their immutable auth user id,
// never by username — usernames can be changed, so a name-based check could be claimed just
// by renaming an account. If an id isn't configured, nobody matches (fails closed).
const ROOT_ADMIN_ID = process.env.ROOT_ADMIN_ID || null;
const RECOVERY_ADMIN_ID = process.env.RECOVERY_ADMIN_ID || null;
if (!ROOT_ADMIN_ID) log.warn('ROOT_ADMIN_ID not set — root-admin-only actions are disabled');
const isRootAdmin = id => !!ROOT_ADMIN_ID && id === ROOT_ADMIN_ID;
const isRecoveryAdmin = id => !!RECOVERY_ADMIN_ID && id === RECOVERY_ADMIN_ID;
// Display name reserved for the root admin, so no other account can pose as it
const RESERVED_USERNAME = 'admin';

// ── Auth middleware ─────────────────────────────────────────────────────────
async function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  // Verify via supabaseAnon.auth.getUser(token): calls Supabase's /auth/v1/user endpoint
  // which verifies the JWT signature and checks live session state (catches revocations).
  // Uses the anon client so the service-role clients (supabase, db) are never touched.
  if (!supabaseAnon) return res.status(500).json({ error: 'Auth not configured' });
  const { data: { user }, error } = await supabaseAnon.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired session' });
  req.user = user;
  const { data: profile } = await db.from('profiles').select('username, role, email, email_verified, password_changed_at').eq('id', user.id).single();
  if (!profile) return res.status(401).json({ error: 'Profile not found' });
  if (sessionRevoked(token, profile.password_changed_at)) return res.status(401).json({ error: 'Your password was reset. Please log in again.' });
  // Same rule as /api/auth/login — a token obtained some other way mustn't skip verification
  if (profile.email && !profile.email_verified) return res.status(403).json({ error: 'Please verify your email address before continuing.' });
  req.username = profile.username;
  req.role = profile.role;
  next();
}

async function requireModerator(req, res, next) {
  await requireUser(req, res, () => {
    if (req.role !== 'admin' && req.role !== 'moderator') {
      return res.status(403).json({ error: 'Moderator access required' });
    }
    next();
  });
}

async function requireAdmin(req, res, next) {
  await requireUser(req, res, () => {
    if (req.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ── Auth routes ─────────────────────────────────────────────────────────────
app.get('/api/auth/status', async (req, res) => {
  const [{ count, error: countErr }, { data: settings }] = await Promise.all([
    db.from('profiles').select('*', { count: 'exact', head: true }),
    db.from('app_settings').select('key, value'),
  ]);
  const s = {};
  (settings || []).forEach(r => { s[r.key] = r.value; });
  const allowRegistration = s.allowRegistration !== 'false';
  const userLimit = parseInt(s.userLimit || '0', 10);
  const userCount = count || 0;
  const reachedLimit = userLimit > 0 && userCount >= userLimit;
  // If the count query failed, assume users exist so the frontend stays on login
  const hasUsers = countErr ? true : userCount > 0;
  res.json({ hasUsers, allowRegistration, userLimit, reachedLimit });
});

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { username, password, country, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const { data: regSetting } = await db.from('app_settings').select('value').eq('key', 'allowRegistration').single();
  if (regSetting && regSetting.value === 'false') return res.status(403).json({ error: 'Registration is currently disabled.' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) return res.status(400).json({ error: 'Username must be 3-20 characters, letters/numbers/underscore only.' });
  if (username.trim().toLowerCase() === RESERVED_USERNAME) return res.status(400).json({ error: 'Username already taken.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'A valid email address is required.' });
  const { data: existing } = await db.from('profiles').select('id').ilike('username', escapeLike(username.trim())).single();
  if (existing) return res.status(400).json({ error: 'Username already taken.' });
  const { data: existingEmail } = await db.from('profiles').select('id').ilike('email', escapeLike(email.trim())).single();
  if (existingEmail) return res.status(400).json({ error: 'Unable to complete registration. Please check your details and try again.' });
  const [{ count }, { data: limitSetting }] = await Promise.all([
    db.from('profiles').select('*', { count: 'exact', head: true }),
    db.from('app_settings').select('value').eq('key', 'userLimit').single(),
  ]);
  const userLimit = parseInt(limitSetting?.value || '0', 10);
  if (userLimit > 0 && count >= userLimit) return res.status(400).json({ error: `User limit of ${userLimit} reached.` });
  const fakeEmail = `${username.trim().toLowerCase()}@statera.local`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email: fakeEmail, password, email_confirm: true });
  if (authError) return res.status(400).json({ error: authError.message });
  // Registration never grants staff roles — the admin account is created by `npm run setup`
  const { error: profileError } = await db.from('profiles').insert({ id: authData.user.id, username: username.trim(), role: 'user', bio: '', steam_id: '', public_inventory: false, public_holdings: false, country: country || 'se', email: email.trim().toLowerCase(), email_verified: false });
  if (profileError) return res.status(500).json({ error: profileError.message });
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
  if (signInError) return res.status(500).json({ error: signInError.message });
  // Send verification email — 24h expiry since new users may not check immediately
  if (resend) {
    const vToken = crypto.randomBytes(32).toString('hex');
    const vExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.from('email_verification_tokens').insert({ username: username.trim(), email: email.trim().toLowerCase(), token: vToken, expires_at: vExpiry });
    const verifyUrl = `${APP_URL}/?email_token=${vToken}`;
    resend.emails.send({
      from: 'Verumen <noreply@verumen.com>',
      to: email.trim(),
      ...renderEmail('welcome', { username: username.trim(), url: verifyUrl }),
    }).catch(e => log.error('registration verify email failed', { error: e.message }));
  }
  // Don't log the user in — require email verification first
  res.json({ success: true, needsVerification: true, username: username.trim() });
});

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 6 * 60 * 60 * 1000,
  path: '/',
};

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  // Failed logins are counted per username+IP (tight) and per username across all IPs (looser).
  // A single source gets locked out after 10 misses without locking the real owner out; it
  // takes 50 misses from anywhere — i.e. a deliberate attack — before the account itself pauses.
  const name = username.trim().toLowerCase();
  const pairKey = `login-pair:${name}:${clientIp(req)}`;
  const userKey = `login-user:${name}`;
  const LOGIN_WINDOW = 15 * 60 * 1000;
  if (isLimited(pairKey, 10) || isLimited(userKey, 50)) {
    return res.status(429).json({ error: 'Too many failed attempts for this account. Please wait 15 minutes and try again.' });
  }
  const email = `${name}@statera.local`;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    hitLimit(pairKey, 10, LOGIN_WINDOW);
    hitLimit(userKey, 50, LOGIN_WINDOW);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  rateLimitMap.delete(pairKey);
  rateLimitMap.delete(userKey);
  const { data: profile } = await db.from('profiles').select('username, role, email, email_verified').eq('id', data.user.id).single();
  if (profile.email && !profile.email_verified) {
    return res.status(403).json({ error: 'Please verify your email address before signing in. Check your inbox for the verification link.' });
  }
  res.cookie('refresh_token', data.session.refresh_token, REFRESH_COOKIE_OPTS);
  res.json({ success: true, username: profile.username, role: profile.role, token: data.session.access_token });
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  const { data: p } = await db.from('profiles').select('password_changed_at').eq('id', data.user.id).single();
  if (sessionRevoked(data.session.access_token, p?.password_changed_at)) {
    res.clearCookie('refresh_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    return res.status(401).json({ error: 'Your password was reset. Please log in again.' });
  }
  res.cookie('refresh_token', data.session.refresh_token, REFRESH_COOKIE_OPTS);
  res.json({ token: data.session.access_token });
});

// Single round-trip bootstrap: refresh session + fetch critical data in parallel
app.get('/api/init', async (req, res) => {
  // Run app-status queries + session refresh in parallel
  const [statusResult, refreshResult] = await Promise.allSettled([
    Promise.all([
      db.from('profiles').select('*', { count: 'exact', head: true }),
      db.from('app_settings').select('key, value'),
    ]),
    req.cookies.refresh_token
      ? supabase.auth.refreshSession({ refresh_token: req.cookies.refresh_token })
      : Promise.resolve(null),
  ]);

  const [{ count, error: countErr } = {}, { data: settings } = {}] =
    statusResult.status === 'fulfilled' ? statusResult.value : [{}, {}];
  const s = {};
  (settings || []).forEach(r => { s[r.key] = r.value; });
  const allowRegistration = s.allowRegistration !== 'false';
  const userLimit = parseInt(s.userLimit || '0', 10);
  const reachedLimit = userLimit > 0 && (count || 0) >= userLimit;
  const hasUsers = countErr ? true : (count || 0) > 0;
  const baseStatus = { hasUsers, allowRegistration, userLimit, reachedLimit };

  const session = refreshResult.status === 'fulfilled' ? refreshResult.value?.data?.session : null;
  if (!session) return res.json({ ...baseStatus, ok: false });
  const userId = refreshResult.value.data.user.id;
  const { data: pwRow } = await db.from('profiles').select('password_changed_at').eq('id', userId).single();
  if (sessionRevoked(session.access_token, pwRow?.password_changed_at)) {
    res.clearCookie('refresh_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    return res.json({ ...baseStatus, ok: false });
  }

  res.cookie('refresh_token', session.refresh_token, REFRESH_COOKIE_OPTS);

  // Fetch profile + friendships + announcements in parallel
  const [profileRes, friendshipsRes, announcementsRes] = await Promise.allSettled([
    db.from('profiles').select('username, role').eq('id', userId).single(),
    db.from('friendships').select('requester_id, addressee_id, status').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    db.from('announcements').select('*').order('created_at', { ascending: false }).limit(10),
  ]);

  const profile = profileRes.value?.data;
  if (!profile) return res.json({ ...baseStatus, ok: false });

  const friendships = friendshipsRes.value?.data || [];
  const announcements = announcementsRes.value?.data || [];

  const accepted = friendships.filter(f => f.status === 'accepted');
  const incoming = friendships.filter(f => f.status === 'pending' && f.addressee_id === userId);
  const outgoing = friendships.filter(f => f.status === 'pending' && f.requester_id === userId);
  const friendIds = accepted.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
  const feedIds = [...new Set([...friendIds, userId])];
  const allProfileIds = [...new Set([...feedIds, ...incoming.map(f => f.requester_id), ...outgoing.map(f => f.addressee_id)])];

  // Fetch activity + all needed profiles in parallel
  const [activityRes, profilesRes] = await Promise.allSettled([
    db.from('activity').select('id, user_id, type, payload, created_at').in('user_id', feedIds).order('created_at', { ascending: false }).limit(FEED_FETCH),
    db.from('profiles').select('id, username, avatar_base64, bio, role').in('id', allProfileIds),
  ]);

  const activity = activityRes.value?.data || [];
  const profiles = profilesRes.value?.data || [];
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));

  // Same visibility and formatting as /api/feed, so the first load shows exactly what a refresh would
  const visibleActivity = (await visibleToViewer(activity, userId).catch(() => [])).slice(0, FEED_SIZE);
  const feed = visibleActivity.map(a => formatFeedItem(a, profileMap[a.user_id]));

  const fmt = p => ({ username: p.username, avatarBase64: p.avatar_base64, bio: p.bio, role: p.role, isOnline: isOnline(p.id) });
  const friends = {
    friends: friendIds.map(id => profileMap[id]).filter(Boolean).map(fmt),
    incoming: incoming.map(f => profileMap[f.requester_id]).filter(Boolean).map(fmt),
    outgoing: outgoing.map(f => profileMap[f.addressee_id]?.username).filter(Boolean),
  };

  res.json({
    ...baseStatus,
    ok: true,
    token: session.access_token,
    username: profile.username,
    role: profile.role,
    feed,
    friends,
    announcements,
  });
});

app.post('/api/auth/logout', async (req, res) => {
  res.clearCookie('refresh_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
  res.json({ success: true });
});

app.post('/api/auth/change-password', requireUser, authRateLimit, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const email = `${req.username.toLowerCase()}@statera.local`;
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) return res.status(401).json({ error: 'Current password is incorrect.' });
  const { error } = await supabase.auth.admin.updateUserById(req.user.id, { password: newPassword });
  if (error) return res.status(500).json({ error: error.message });
  // Revoke every other session so a stolen session doesn't survive the password change
  const jwt = req.headers.authorization?.replace('Bearer ', '');
  await supabase.auth.admin.signOut(jwt, 'others').catch(e => log.warn('signOut others failed', { error: e.message }));
  res.json({ success: true });
});

// Own account details for the Settings page
app.get('/api/auth/me', requireUser, async (req, res) => {
  const [{ data: profile }, { data: pending }] = await Promise.all([
    db.from('profiles').select('username, email, email_verified').eq('id', req.user.id).single(),
    db.from('email_verification_tokens').select('email, expires_at').eq('username', req.username).eq('used', false)
      .gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1),
  ]);
  res.json({
    username: profile?.username,
    isRootAdmin: isRootAdmin(req.user.id),
    email: profile?.email || null,
    emailVerified: !!profile?.email_verified,
    pendingEmail: pending?.[0]?.email || null,
  });
});

// Self-service email change. Requires the current password (so a hijacked session can't
// redirect the account's email and then take it over via password reset), and only takes
// effect once the link sent to the NEW address is clicked (/api/auth/verify-email).
app.post('/api/auth/change-email', requireUser, authRateLimit, async (req, res) => {
  const { email, password } = req.body || {};
  const newEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!password) return res.status(400).json({ error: 'Enter your current password.' });
  if (!resend) return res.status(500).json({ error: 'Email service is not configured.' });
  const { error: pwErr } = await supabase.auth.signInWithPassword({ email: `${req.username.toLowerCase()}@statera.local`, password });
  if (pwErr) return res.status(401).json({ error: 'Current password is incorrect.' });
  const { data: me } = await db.from('profiles').select('email').eq('id', req.user.id).single();
  if (me?.email && me.email.toLowerCase() === newEmail) return res.status(400).json({ error: 'That is already your email address.' });
  const { data: taken } = await db.from('profiles').select('id').ilike('email', escapeLike(newEmail)).neq('id', req.user.id).limit(1);
  if (taken?.length) return res.status(400).json({ error: 'That email address is already in use.' });

  // Only one pending change at a time
  await db.from('email_verification_tokens').update({ used: true }).eq('username', req.username).eq('used', false);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: insErr } = await db.from('email_verification_tokens').insert({ username: req.username, email: newEmail, token, expires_at: expiresAt });
  if (insErr) return res.status(500).json({ error: 'Could not start the email change. Please try again.' });
  try {
    await resend.emails.send({
      from: 'Verumen <noreply@verumen.com>',
      to: newEmail,
      ...renderEmail('change-email', { username: req.username, url: `${APP_URL}/?email_token=${token}` }),
    });
  } catch (e) {
    log.error('change-email send failed', { error: e.message });
    return res.status(500).json({ error: 'Could not send the confirmation email. Please try again.' });
  }
  // Heads-up to the current address so an unexpected request is noticed before it's confirmed
  if (me?.email) {
    resend.emails.send({
      from: 'Verumen <noreply@verumen.com>',
      to: me.email,
      ...renderEmail('change-email-notice', { username: req.username, newEmail }),
    }).catch(e => log.error('change-email notice to old address failed', { error: e.message }));
  }
  res.json({ success: true, pendingEmail: newEmail });
});

app.post('/api/auth/forgot-password', authRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });
  // At most 3 reset emails per address per hour, however many IPs ask. Over the limit we still
  // answer "success" so the response doesn't reveal whether the address has an account.
  if (hitLimit(`reset-email:${String(email).trim().toLowerCase()}`, 3, 60 * 60 * 1000)) {
    await new Promise(r => setTimeout(r, 400));
    return res.json({ success: true });
  }
  // Always respond with success to prevent email enumeration; add delay for non-existing emails to match timing of the full send path
  const { data: profile } = await db.from('profiles').select('username, email').ilike('email', escapeLike(email.trim())).single();
  if (!profile?.email) { await new Promise(r => setTimeout(r, 400)); return res.json({ success: true }); }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
  await db.from('password_reset_tokens').insert({ username: profile.username, token, expires_at: expiresAt });
  if (resend) {
    const resetUrl = `${APP_URL}/?reset_token=${token}`;
    await resend.emails.send({
      from: 'Verumen <noreply@verumen.com>',
      to: profile.email,
      ...renderEmail('reset', { url: resetUrl }),
    }).catch(e => log.error('resend failed', { error: e.message }));
  }
  res.json({ success: true });
});

app.post('/api/auth/reset-password', authRateLimit, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const { data: resetEntry } = await db.from('password_reset_tokens').select('*').eq('token', token).eq('used', false).single();
  if (!resetEntry || new Date(resetEntry.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }
  // Mark token used atomically before changing password to prevent TOCTOU race.
  // .select() is required — without it Supabase JS v2 returns count:null (no body), so
  // count===0 never fires. With .select() an empty array means 0 rows were updated (already used).
  const { data: updated } = await db.from('password_reset_tokens').update({ used: true }).eq('token', token).eq('used', false).select('token');
  if (!updated || updated.length === 0) return res.status(400).json({ error: 'This reset link has already been used.' });
  const { data: profile } = await db.from('profiles').select('id').eq('username', resetEntry.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found.' });
  const { error } = await supabase.auth.admin.updateUserById(profile.id, { password });
  if (error) return res.status(500).json({ error: error.message });
  await markPasswordChanged(profile.id);
  res.json({ success: true });
});

app.post('/api/auth/verify-password', requireUser, authRateLimit, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required.' });
  const email = `${req.username.toLowerCase()}@statera.local`;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Incorrect password.' });
  res.json({ success: true });
});

// ── Profile routes ──────────────────────────────────────────────────────────
app.get('/api/users', requireUser, async (req, res) => {
  const { data, error } = await db.from('profiles').select('username, role, bio, public_inventory, avatar_base64, created_at, steam_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(p => ({ username: p.username, role: p.role, bio: p.bio, publicInventory: p.public_inventory, steamId: p.public_inventory ? p.steam_id : null, steamLevel: p.public_inventory ? (p.steam_level || 0) : null, showcaseItems: p.public_inventory ? (p.showcase_items || []) : [], avatarBase64: p.avatar_base64 || null, createdAt: p.created_at })));
});

app.get('/api/users/:username/profile', async (req, res) => {
  const { data, error } = await db.from('profiles').select('*').ilike('username', escapeLike(req.params.username)).single();
  if (error || !data) return res.status(404).json({ error: 'User not found' });
  if (data.is_public === false) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    let authenticated = false;
    if (token && supabaseAnon) { const { data: { user } } = await supabaseAnon.auth.getUser(token); if (user) authenticated = true; }
    if (!authenticated) return res.json({ username: data.username, avatarBase64: data.avatar_base64, isPrivate: true });
  }
  res.json({ username: data.username, role: data.role, bio: data.bio, country: data.country || 'se', isPublic: data.is_public !== false, publicInventory: data.public_inventory, publicCsTrades: data.public_cs_trades || false, steamId: data.steam_verified ? (data.steam_id || null) : null, steamVerified: data.steam_verified || false, steamLevel: data.steam_verified ? (data.steam_level || 0) : 0, showcaseItems: data.showcase_items || [], avatarBase64: data.avatar_base64, createdAt: data.created_at });
});

app.put('/api/users/:username/profile', requireUser, largeJson, async (req, res) => {
  if (req.username !== req.params.username) return res.status(403).json({ error: "Cannot edit another user's profile." });
  const { bio, steamId, publicInventory, publicCsTrades, avatarBase64, showcaseItems, country, isPublic } = req.body;
  const update = {};
  if (bio !== undefined) { if (typeof bio === 'string' && bio.length > 500) return res.status(400).json({ error: 'Bio must be 500 characters or fewer.' }); update.bio = bio; }
  if (country !== undefined) { if (!/^[a-z]{2}$/.test(country)) return res.status(400).json({ error: 'Invalid country code.' }); update.country = country; }
  if (steamId !== undefined) { update.steam_id = steamId; if (steamId !== (await db.from('profiles').select('steam_id').eq('id', req.user.id).single()).data?.steam_id) update.steam_verified = false; }
  if (publicInventory !== undefined) update.public_inventory = publicInventory;
  if (publicCsTrades !== undefined) update.public_cs_trades = publicCsTrades;
  if (isPublic !== undefined) update.is_public = !!isPublic;
  if (avatarBase64 !== undefined) {
    if (avatarBase64 && avatarBase64.length > 1.5 * 1024 * 1024) return res.status(400).json({ error: 'Avatar too large. Maximum 1.5 MB.' });
    const ALLOWED_IMG = ['data:image/jpeg;', 'data:image/jpg;', 'data:image/png;', 'data:image/webp;', 'data:image/gif;'];
    if (avatarBase64 && !ALLOWED_IMG.some(p => avatarBase64.startsWith(p))) return res.status(400).json({ error: 'Invalid image format. JPEG, PNG, WebP or GIF only.' });
    update.avatar_base64 = avatarBase64;
  }
  if (showcaseItems !== undefined) {
    const items = Array.isArray(showcaseItems) ? showcaseItems.slice(0, 10) : [];
    update.showcase_items = items;
  }
  const { data, error } = await db.from('profiles').update(update).eq('id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, profile: { username: data.username, bio: data.bio, country: data.country, steamId: data.steam_id, publicInventory: data.public_inventory, publicCsTrades: data.public_cs_trades || false, avatarBase64: data.avatar_base64, showcaseItems: data.showcase_items, steamLevel: data.steam_level } });
});

// Change username
app.put('/api/users/:username/username', requireUser, async (req, res) => {
  if (req.username !== req.params.username) return res.status(403).json({ error: "Cannot edit another user's profile." });
  const { newUsername } = req.body;
  if (!newUsername) return res.status(400).json({ error: 'Username is required.' });
  // Validate format: 3-20 chars, letters/numbers/underscores only
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) return res.status(400).json({ error: 'Username must be 3-20 characters and contain only letters, numbers, and underscores.' });
  // Check uniqueness (case-insensitive)
  // The root admin keeps its name, and nobody else may take the reserved one
  if (isRootAdmin(req.user.id)) return res.status(403).json({ error: 'This username cannot be changed.' });
  if (newUsername.toLowerCase() === RESERVED_USERNAME) return res.status(409).json({ error: 'Username is already taken.' });
  const { data: existing } = await db.from('profiles').select('id').ilike('username', escapeLike(newUsername)).single();
  if (existing && existing.id !== req.user.id) return res.status(409).json({ error: 'Username is already taken.' });
  // Login derives the auth email from the username, so it must change in step or the user is
  // locked out of signing in with their new name. Update auth first; only then the profile.
  const oldUsername = req.username;
  const { error: authErr } = await supabase.auth.admin.updateUserById(req.user.id, { email: `${newUsername.toLowerCase()}@statera.local`, email_confirm: true });
  if (authErr) return res.status(500).json({ error: 'Could not update login: ' + authErr.message });
  const { data, error } = await db.from('profiles').update({ username: newUsername }).eq('id', req.user.id).select().single();
  if (error) {
    await supabase.auth.admin.updateUserById(req.user.id, { email: `${oldUsername.toLowerCase()}@statera.local`, email_confirm: true });
    return res.status(500).json({ error: error.message });
  }
  // Pending reset / verification links are keyed by username — carry them over
  await Promise.all([
    db.from('password_reset_tokens').update({ username: newUsername }).eq('username', oldUsername),
    db.from('email_verification_tokens').update({ username: newUsername }).eq('username', oldUsername),
  ]);
  res.json({ success: true, username: data.username });
});

// "Public profile" off means the profile needs a logged-in viewer. The profile route enforces
// it; every per-profile data endpoint must too, or logged-out visitors can read around it.
async function viewerMayAccess(req, profile) {
  if (profile.is_public !== false) return true;
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !supabaseAnon) return false;
  const { data } = await supabaseAnon.auth.getUser(token);
  return !!data?.user;
}
const PRIVATE_PROFILE_ERROR = { error: 'This profile is private. Log in to view it.' };

app.get('/api/users/:username/inventory', publicRateLimit, async (req, res) => {
  const { data: profile } = await db.from('profiles').select('id, public_inventory, steam_id, steam_verified, is_public').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  if (!(await viewerMayAccess(req, profile))) return res.status(403).json(PRIVATE_PROFILE_ERROR);
  if (!profile.public_inventory || !profile.steam_id || !profile.steam_verified) return res.status(403).json({ error: "This user's inventory is private." });
  try {
    const data = await fetchSteamInventory(profile.steam_id);
    if (!data?.assets) return res.status(404).json({ error: 'Inventory not found or private on Steam' });
    const descMap = {};
    (data.descriptions || []).forEach(d => { descMap[`${d.classid}_${d.instanceid}`] = d; });
    const items = (data.assets || []).map(asset => {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`];
      const name = desc?.market_hash_name || desc?.name || 'Unknown';
      const actionLink = desc?.actions?.[0]?.link;
      const inspectLink = actionLink
        ? actionLink.replace('%owner_steamid%', profile.steam_id).replace('%assetid%', asset.assetid).replace('%d%', '0')
        : null;
      return { name, iconUrl: desc?.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/128x128` : null, type: desc?.type || '', assetId: asset.assetid, inspectLink };
    }).filter(i => i.name !== 'Unknown');
    res.json({ items, count: items.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CS float lookup (proxy to CSFloat API) ──────────────────────────────────
app.get('/api/cs/float', requireUser, userRateLimit(20, 60 * 1000, 'cs-float'), async (req, res) => {
  const { link } = req.query;
  if (!link) return res.status(400).json({ error: 'Missing link' });
  try {
    const r = await fetchJSON(`https://api.csfloat.com/?url=${encodeURIComponent(link)}`);
    if (r.error) return res.status(400).json({ error: r.error });
    const info = r.iteminfo;
    res.json({ float: info.floatvalue, paintSeed: info.paintseed, paintIndex: info.paintindex });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Public single-trade endpoint — UUID acts as the access token (not guessable)
app.get('/api/cs/trades/:id/public', async (req, res) => {
  const { data: item, error } = await db
    .from('cs_inventory')
    .select('id, skin_name, exterior, float_value, pattern, purchase_price, purchase_date, sold, notes, screenshot_url, user_id, cs_sales(sale_price, sale_date, screenshot_url)')
    .eq('share_token', req.params.id)
    .single();
  if (error || !item) return res.status(404).json({ error: 'Trade not found' });
  const { data: profile } = await db.from('profiles').select('username').eq('id', item.user_id).single();
  const sale = item.cs_sales?.[0] ?? null;
  res.json({
    id: item.id,
    skinName: item.skin_name,
    exterior: item.exterior,
    floatValue: item.float_value,
    pattern: item.pattern,
    purchasePrice: item.purchase_price,
    purchaseDate: item.purchase_date,
    sold: item.sold,
    salePrice: sale?.sale_price ?? null,
    saleDate: sale?.sale_date ?? null,
    screenshotUrl: item.screenshot_url || sale?.screenshot_url || null,
    username: profile?.username ?? null,
  });
});

// Server-rendered trade share page — handles og: meta tags for link previews (Discord, etc.)
function buildTradePageHtml(opts) {
  if (opts.error) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Trade not found — Verumen</title><link rel="icon" type="image/png" href="${process.env.APP_URL||'https://verumen.com'}/logo.png">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#09090b;color:#f4f4f5;font-family:-apple-system,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}</style>
</head><body>
<a href="${process.env.APP_URL||'https://verumen.com'}" style="display:flex;align-items:center;gap:8px;text-decoration:none;opacity:.7;margin-bottom:8px;">
  <img src="${process.env.APP_URL||'https://verumen.com'}/logo.png" style="width:28px;height:28px;object-fit:contain;" alt=""><span style="color:#d4d4d8;font-size:14px;font-weight:600;">Verumen</span></a>
<div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;text-align:center;"><p style="color:#a1a1aa;font-size:14px;">${opts.error}</p></div>
</body></html>`;
  }
  const { displayName, hasStar, isST, exterior, floatValue, pattern, purchaseDate, purchasePrice, sold, salePrice, saleDate, notes, screenshotImgUrl, screenshotPageUrl, ogImageUrl, iconUrl, stickers, username, avatarBase64 } = opts;
  const BASE = process.env.APP_URL || 'https://verumen.com';
  const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // All prices are USD
  const fmt = n => n != null ? `$${Number(n).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
  const nameColor = hasStar ? '#c4b5fd' : isST ? '#fb923c' : '#f4f4f5';
  const avatarEl = avatarBase64
    ? `<img src="${e(avatarBase64)}" alt="${e(username)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #3f3f46;flex-shrink:0;">`
    : `<div style="width:36px;height:36px;border-radius:50%;background:#3f3f46;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;border:2px solid #52525b;flex-shrink:0;">${e((username?.[0]||'?').toUpperCase())}</div>`;
  const stats = [
    floatValue ? ['Float', parseFloat(floatValue).toFixed(4)] : null,
    pattern ? ['Pattern', String(pattern)] : null,
    ['Buy date', purchaseDate || '—'],
    ['Buy price', fmt(purchasePrice)],
    ['Status', sold ? 'Sold' : 'Holding'],
    ['Sale price', sold ? fmt(salePrice) : '—'],
    sold && saleDate ? ['Sale date', saleDate] : null,
  ].filter(Boolean);
  const fullTitle = `${hasStar?'★ ':''}${displayName}${exterior?' | '+exterior:''}`;
  const infoHtml = `
    <div style="margin-bottom:22px;">
      <p style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px;">Owned by</p>
      <a href="${e(BASE)}/user/${e(username)}" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
        ${avatarEl}
        <strong style="color:#38bdf8;font-size:14px;">${e(username||'unknown')}</strong>
      </a>
    </div>
    <p style="color:#71717a;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">Trade</p>
    <h1 style="color:${nameColor};font-size:20px;font-weight:700;line-height:1.25;margin-bottom:${exterior?'4px':'18px'};">${hasStar?'<span style="margin-right:3px;">★</span>':''}${e(displayName)}</h1>
    ${exterior?`<p style="color:#a1a1aa;font-size:13px;margin-bottom:18px;">${e(exterior)}</p>`:''}
    ${floatValue && !/vanilla\s*$/i.test(opts.skinName||'') ? `
    <div style="margin-bottom:18px;">
      <p style="color:#71717a;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Float</p>
      <div style="position:relative;height:6px;border-radius:999px;overflow:hidden;background:linear-gradient(to right,#22c55e,#84cc16,#eab308,#f97316,#ef4444);">
        <div style="position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.3);left:7%"></div>
        <div style="position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.3);left:15%"></div>
        <div style="position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.3);left:38%"></div>
        <div style="position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.3);left:45%"></div>
        <div style="position:absolute;top:50%;width:10px;height:10px;background:#fff;border-radius:50%;border:2px solid #18181b;box-shadow:0 1px 3px rgba(0,0,0,.5);transform:translate(-50%,-50%);left:${Math.min(parseFloat(floatValue)*100,99.5)}%;"></div>
      </div>
      <p style="color:#71717a;font-size:11px;font-family:ui-monospace,monospace;margin-top:6px;">${e(parseFloat(floatValue).toFixed(4))}</p>
    </div>` : ''}
    ${stickers && stickers.length > 0 ? `
    <div style="margin-bottom:18px;">
      <p style="color:#71717a;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Stickers</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        ${stickers.map(s => `<div class="stk"><img src="${e(s.url)}" alt="${e(s.name||'')}" style="width:40px;height:40px;object-fit:contain;">${s.name?`<span class="stk-tip">${e(s.name)}</span>`:''}</div>`).join('')}
      </div>
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#27272a;border-radius:10px;overflow:hidden;margin-bottom:18px;">
      ${stats.map(([lbl,val])=>`<div style="background:#111113;padding:12px 14px;"><p style="color:#71717a;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 3px;">${e(lbl)}</p><p style="color:${lbl==='Status'?(val==='Holding'?'#4ade80':'#f87171'):'#f4f4f5'};font-size:13px;font-family:ui-monospace,monospace;margin:0;">${e(val)}</p></div>`).join('')}
    </div>
    ${notes?`<p style="color:#71717a;font-size:13px;margin-top:4px;font-style:italic;">${e(notes)}</p>`:''}`;
  const bodyHtml = screenshotImgUrl
    ? `<div style="max-width:1200px;margin:0 auto;padding:24px;display:flex;gap:20px;align-items:flex-start;"><div style="width:320px;flex-shrink:0;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:24px;">${infoHtml}</div><div style="flex:1;min-width:0;"><a href="${e(screenshotPageUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;"><img src="${e(screenshotImgUrl)}" alt="Steam screenshot" style="width:100%;border-radius:12px;display:block;border:1px solid #27272a;"></a></div></div>`
    : `<div style="max-width:480px;margin:0 auto;padding:24px;"><div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:24px;">${infoHtml}</div></div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${e(fullTitle)}</title>
  <link rel="icon" type="image/png" href="${e(BASE)}/logo.png">
  <meta property="og:title" content="${e(fullTitle)}">
  <meta property="og:description" content="${sold?'Sold':'Holding'} · Owned by ${e(username||'Verumen')}, shared via Verumen">
  <meta property="og:site_name" content="Verumen">
  ${ogImageUrl?`<meta property="og:image" content="${e(ogImageUrl)}">`:''}
  <meta name="twitter:card" content="${screenshotImgUrl||ogImageUrl?'summary_large_image':'summary'}">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh}.stk{position:relative;display:inline-flex}.stk-tip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#18181b;border:1px solid #3f3f46;color:#f4f4f5;font-size:11px;white-space:nowrap;padding:4px 8px;border-radius:6px;pointer-events:none;opacity:0;transition:opacity .15s;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,.5)}.stk:hover .stk-tip{opacity:1}</style>
</head>
<body>
  <header style="height:48px;background:#18181b;border-bottom:1px solid #27272a;display:flex;align-items:center;padding:0 24px;">
    <a href="${e(BASE)}" style="display:flex;align-items:center;gap:8px;text-decoration:none;">
      <img src="${e(BASE)}/logo.png" style="width:24px;height:24px;object-fit:contain;" alt=""><span style="color:#d4d4d8;font-size:14px;font-weight:600;letter-spacing:.02em;">Verumen</span>
    </a>
  </header>
  <main style="padding-top:24px;">${bodyHtml}</main>
</body>
</html>`;
}

app.get('/trade/:token', async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.token))
    return res.status(404).send(buildTradePageHtml({ error: 'Trade not found' }));
  const { data: item, error } = await db.from('cs_inventory')
    .select('skin_name, exterior, float_value, pattern, purchase_price, purchase_date, sold, notes, screenshot_url, user_id, icon_url, stickers, cs_sales(sale_price, sale_date, screenshot_url)')
    .eq('share_token', req.params.token).single();
  if (error || !item) return res.status(404).send(buildTradePageHtml({ error: 'Trade not found' }));
  const { data: profile } = await db.from('profiles').select('username, avatar_base64').eq('id', item.user_id).single();
  const screenshotPageUrl = item.screenshot_url || item.cs_sales?.[0]?.screenshot_url || null;
  let screenshotImgUrl = null;
  if (screenshotPageUrl) {
    const idMatch = screenshotPageUrl.match(/id=(\d+)/);
    // Full-resolution image (the page's og:image is only a 512px preview)
    if (idMatch) screenshotImgUrl = await fetchSteamScreenshotPreview(idMatch[1]);
  }
  const sale = item.cs_sales?.[0] ?? null;
  const cleaned = (item.skin_name || '').replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '');
  const hasStar = cleaned.startsWith('★');
  const isST = cleaned.startsWith('StatTrak');
  const displayName = hasStar ? cleaned.slice(1).trim() : cleaned;
  const ogImageUrl = item.icon_url || screenshotImgUrl || null;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildTradePageHtml({ skinName: item.skin_name, displayName, hasStar, isST, exterior: item.exterior, floatValue: item.float_value, pattern: item.pattern, purchaseDate: item.purchase_date, purchasePrice: item.purchase_price, sold: item.sold, salePrice: sale?.sale_price, saleDate: sale?.sale_date, notes: item.notes, screenshotImgUrl, screenshotPageUrl, ogImageUrl, iconUrl: item.icon_url, stickers: item.stickers || [], username: profile?.username, avatarBase64: profile?.avatar_base64 }));
});

// A skin's market icon never changes, so found icons are shared across users and requests.
// Misses aren't cached — they're usually Steam rate limits, not a missing item.
const steamIconCache = boundedCache(5000, 24 * 60 * 60 * 1000);
async function fetchSteamIcon(skinName, exterior) {
  // Vanilla items (e.g. "★ Butterfly Knife | Vanilla") have no exterior in their market hash name
  const isVanilla = /\|\s*Vanilla\s*$/i.test(skinName);
  const name = skinName.replace(/\s*\|\s*Vanilla\s*$/i, '');
  const marketHashName = (!isVanilla && exterior && exterior !== 'Vanilla') ? `${name} (${exterior})` : name;
  const cached = steamIconCache.get(marketHashName);
  if (cached) return cached;
  // Use market_hash_name for exact matching instead of fuzzy query=
  const r = await fetch(
    `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=1&market_hash_name=${encodeURIComponent(marketHashName)}`,
    { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!r.ok) return null;
  const data = await r.json();
  const iconPath = data?.results?.[0]?.asset_description?.icon_url;
  const iconUrl = iconPath ? `https://community.cloudflare.steamstatic.com/economy/image/${iconPath}` : null;
  if (iconUrl) steamIconCache.set(marketHashName, iconUrl);
  return iconUrl;
}

// Look up a single skin icon by name — checks user's inventory first, falls back to Steam Market.
// The feed calls this once per post, so the limit leaves room for a full page of posts.
app.get('/api/cs/skin-icon', requireUser, userRateLimit(120, 60 * 1000, 'skin-icon'), async (req, res) => {
  const { name, exterior } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });
  // Check if user already has this skin in their inventory with an icon
  const { data: existing } = await db
    .from('cs_inventory')
    .select('icon_url')
    .eq('user_id', req.user.id)
    .ilike('skin_name', name)
    .not('icon_url', 'is', null)
    .limit(1)
    .single();
  if (existing?.icon_url) return res.json({ iconUrl: existing.icon_url });
  try {
    const iconUrl = await fetchSteamIcon(name, exterior);
    res.json({ iconUrl: iconUrl || null });
  } catch(e) {
    res.json({ iconUrl: null });
  }
});

// Auto-fetch missing Steam market icons for user's CS inventory. Runs at most every 2 minutes
// per user and handles up to 25 items per run (paced), so a large registry can't turn one
// request into hundreds of back-to-back Steam calls; the rest fill in on later visits.
const SYNC_ICONS_PER_RUN = 25;
// Items whose icon wasn't found are skipped for a day, so a few unresolvable items can't
// occupy every run and keep the rest of a large registry from ever getting icons
const iconMissCache = boundedCache(20000, 24 * 60 * 60 * 1000);
app.post('/api/cs/sync-icons', requireUser, heavyRateLimit(2 * 60 * 1000, 'sync-icons'), async (req, res) => {
  const { data: items } = await db
    .from('cs_inventory')
    .select('id, skin_name, exterior, icon_url')
    .eq('user_id', req.user.id);
  const needsIcon = (items || []).filter(i => !i.icon_url && !iconMissCache.get(String(i.id))).slice(0, SYNC_ICONS_PER_RUN);
  if (!needsIcon.length) return res.json({ updated: 0 });
  let updated = 0;
  for (const [i, item] of needsIcon.entries()) {
    if (i > 0) await sleep(300);
    try {
      const iconUrl = await fetchSteamIcon(item.skin_name, item.exterior);
      if (!iconUrl) { iconMissCache.set(String(item.id), true); continue; }
      // .is('icon_url', null) prevents overwriting an icon the user manually set
      // while this background loop was still running (race condition guard)
      const { data: upd } = await db.from('cs_inventory')
        .update({ icon_url: iconUrl })
        .eq('id', item.id)
        .eq('user_id', req.user.id)
        .is('icon_url', null)
        .select('id');
      if (upd?.length) updated++;
    } catch(e) {}
  }
  res.json({ updated });
});

// Reset and re-fetch icon for a single inventory item
app.post('/api/cs/inventory/:id/reset-icon', requireUser, userRateLimit(10, 60 * 1000, 'reset-icon'), async (req, res) => {
  const { data: item } = await db.from('cs_inventory')
    .select('id, skin_name, exterior, steam_asset_id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!item) return res.status(404).json({ error: 'Item not found' });

  let iconUrl = null;

  // Prefer: pull icon directly from Steam inventory (same source as the grid images)
  if (item.steam_asset_id) {
    try {
      const { data: profile } = await db.from('profiles').select('steam_id').eq('id', req.user.id).single();
      if (/^\d{17}$/.test(profile?.steam_id || '')) { // unverified IDs are free text — only fetch real SteamID64s
        const invData = await fetchSteamInventory(profile.steam_id);
        if (invData?.assets && invData?.descriptions) {
          const descMap = {};
          (invData.descriptions || []).forEach(d => { descMap[`${d.classid}_${d.instanceid}`] = d; });
          const asset = (invData.assets || []).find(a => a.assetid === item.steam_asset_id);
          if (asset) {
            const desc = descMap[`${asset.classid}_${asset.instanceid}`];
            if (desc?.icon_url) {
              iconUrl = `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/360x360`;
            }
          }
        }
      }
    } catch(e) {}
  }

  // Fallback: Steam Market exact-name search
  if (!iconUrl) {
    try { iconUrl = await fetchSteamIcon(item.skin_name, item.exterior); } catch(e) {}
  }

  if (iconUrl) {
    await db.from('cs_inventory').update({ icon_url: iconUrl }).eq('id', item.id).eq('user_id', req.user.id);
  }
  res.json({ iconUrl: iconUrl || null });
});

// Authenticated profile holdings — own profile only, no public_cs_trades check needed
// Requires: ALTER TABLE cs_inventory ADD COLUMN IF NOT EXISTS hidden_from_profile BOOLEAN DEFAULT FALSE;
app.get('/api/cs/profile-holdings', requireUser, async (req, res) => {
  const { data, error } = await db.from('cs_inventory')
    .select('id, skin_name, exterior, icon_url, share_token, purchase_date, sold, screenshot_url, hidden_from_profile')
    .eq('user_id', req.user.id)
    .not('sold', 'is', true)
    .order('purchase_date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(item => ({
    id: item.id,
    skinName: item.skin_name,
    exterior: item.exterior,
    hasStar: (item.skin_name || '').includes('★'),
    iconUrl: item.icon_url,
    shareToken: item.share_token,
    purchaseDate: item.purchase_date,
    sold: item.sold,
    screenshotUrl: item.screenshot_url,
    hiddenFromProfile: item.hidden_from_profile || false,
  })));
});

app.patch('/api/cs/inventory/:id/profile-visibility', requireUser, async (req, res) => {
  const { hidden } = req.body;
  const { error } = await db.from('cs_inventory')
    .update({ hidden_from_profile: !!hidden })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Public CS trades endpoint — requires public_cs_trades column: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_cs_trades BOOLEAN DEFAULT FALSE;
app.get('/api/users/:username/cs-trades', async (req, res) => {
  const { data: profile } = await db.from('profiles').select('id, public_cs_trades, is_public').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  if (!(await viewerMayAccess(req, profile))) return res.status(403).json(PRIVATE_PROFILE_ERROR);
  // Allow owner to always see their own trades regardless of public setting
  const token = req.headers.authorization?.replace('Bearer ', '');
  let isOwner = false;
  if (token && supabaseAnon) {
    const { data: { user } } = await supabaseAnon.auth.getUser(token);
    if (user?.id === profile.id) isOwner = true;
  }
  if (!isOwner && !profile.public_cs_trades) return res.status(403).json({ error: "This user's CS trades are private." });
  let query = db.from('cs_inventory')
    .select('id, skin_name, exterior, float_value, pattern, notes, icon_url, share_token, purchase_price, purchase_date, sold, screenshot_url, hidden_from_profile, cs_sales(sale_price, sale_date, screenshot_url)')
    .eq('user_id', profile.id)
    .order('purchase_date', { ascending: false });
  if (!isOwner) query = query.eq('hidden_from_profile', false);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(item => ({
    id: item.id,
    skinName: item.skin_name,
    exterior: item.exterior,
    floatValue: item.float_value,
    pattern: item.pattern,
    hasStar: (item.skin_name || '').includes('★'),
    notes: item.notes,
    iconUrl: item.icon_url,
    shareToken: item.share_token,
    purchasePrice: item.purchase_price,
    purchaseDate: item.purchase_date,
    sold: item.sold,
    salePrice: item.cs_sales?.[0]?.sale_price ?? null,
    saleDate: item.cs_sales?.[0]?.sale_date ?? null,
    screenshotUrl: item.screenshot_url || item.cs_sales?.[0]?.screenshot_url || null,
  })));
});

app.get('/api/users/:username/friends', publicRateLimit, async (req, res) => {
  const { data: profile } = await db.from('profiles').select('id, is_public').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  if (!(await viewerMayAccess(req, profile))) return res.status(403).json(PRIVATE_PROFILE_ERROR);
  const { data: friendships } = await db
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
    .eq('status', 'accepted');
  const friendIds = (friendships || []).map(f => f.requester_id === profile.id ? f.addressee_id : f.requester_id);
  if (!friendIds.length) return res.json([]);
  const { data: friends } = await db.from('profiles').select('id, username, avatar_base64, role').in('id', friendIds);
  // Online status is only shared with logged-in viewers
  const token = req.headers.authorization?.replace('Bearer ', '');
  const viewerLoggedIn = !!(token && supabaseAnon && (await supabaseAnon.auth.getUser(token)).data?.user);
  res.json((friends || []).map(p => ({ username: p.username, avatarBase64: p.avatar_base64, role: p.role, ...(viewerLoggedIn ? { isOnline: isOnline(p.id) } : {}) })));
});

// ── Admin DB browser ────────────────────────────────────────────────────────
const DB_TABLES = [
  'profiles', 'cs_inventory', 'cs_sales', 'cs_price_cache', 'activity', 'friendships',
  'moderation_log', 'app_settings', 'announcements',
];

app.get('/api/admin/db/size', requireAdmin, async (req, res) => {
  const { data, error } = await db.rpc('get_db_size_stats');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/admin/db/tables', requireAdmin, async (req, res) => {
  const counts = await Promise.all(DB_TABLES.map(async t => {
    const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
    return { table: t, rows: error ? null : count };
  }));
  res.json(counts);
});

app.get('/api/admin/db/table/:name', requireAdmin, async (req, res) => {
  const { name } = req.params;
  if (!DB_TABLES.includes(name)) return res.status(400).json({ error: 'Unknown table' });
  const page = Math.max(0, parseInt(req.query.page || '0', 10));
  const limit = 50;
  const filterCol = req.query.filter_col;
  const filterVal = req.query.filter_val;
  let query = db.from(name).select('*', { count: 'exact' });
  if (filterCol && filterVal && /^[a-z_]+$/.test(filterCol)) query = query.eq(filterCol, filterVal);
  const { data, error, count } = await query.range(page * limit, page * limit + limit - 1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rows: data, total: count, page, limit });
});

// ── Activity helpers ────────────────────────────────────────────────────────
async function appendActivity(userId, type, payload={}) {
  const { error } = await db.from('activity').insert({ user_id:userId, type, payload });
  if (error) log.error('appendActivity failed', { userId, type, error: error.message });
}
async function appendModLog(moderator, action, targetUser, details='') { await db.from('moderation_log').insert({ moderator, action, target_user:targetUser, details }); }

// ── Friends ─────────────────────────────────────────────────────────────────
app.post('/api/users/heartbeat', requireUser, (req, res) => {
  _presence.set(req.user.id, Date.now());
  res.json({ ok: true });
});

app.get('/api/friends', requireUser, async (req, res) => {
  const userId = req.user.id;
  const { data: all } = await db.from('friendships').select('requester_id, addressee_id, status').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  const accepted=(all||[]).filter(f=>f.status==='accepted'), incoming=(all||[]).filter(f=>f.status==='pending'&&f.addressee_id===userId), outgoing=(all||[]).filter(f=>f.status==='pending'&&f.requester_id===userId);
  const getProfiles = async (ids) => { if(!ids.length) return []; const { data } = await db.from('profiles').select('id, username, avatar_base64, bio, role').in('id', ids); return data||[]; };
  const friendIds=accepted.map(f=>f.requester_id===userId?f.addressee_id:f.requester_id);
  const [fp, ip, op] = await Promise.all([getProfiles(friendIds), getProfiles(incoming.map(f=>f.requester_id)), getProfiles(outgoing.map(f=>f.addressee_id))]);
  const fmt = p => ({ username: p.username, avatarBase64: p.avatar_base64, role: p.role, isOnline: isOnline(p.id) });
  res.json({ friends: fp.map(fmt), incoming: ip.map(fmt), outgoing: op.map(p => p.username) });
});

app.get('/api/friends/pending-count', requireUser, async (req, res) => {
  const { count } = await db.from('friendships').select('*', { count:'exact', head:true }).eq('addressee_id', req.user.id).eq('status', 'pending');
  res.json({ count:count||0 });
});

app.post('/api/friends/request/:username', requireUser, async (req, res) => {
  const { data: target } = await db.from('profiles').select('id, username').eq('username', req.params.username).single();
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot friend yourself.' });
  const { data: reverse } = await db.from('friendships').select('id').eq('requester_id', target.id).eq('addressee_id', req.user.id).eq('status', 'pending').single();
  if (reverse) { await db.from('friendships').update({ status:'accepted' }).eq('id', reverse.id); const pair = { requester: target.username, addressee: req.username }; await Promise.all([appendActivity(req.user.id,'friend_added',{ targetUser:target.username, ...pair }),appendActivity(target.id,'friend_added',{ targetUser:req.username, ...pair })]); return res.json({ success:true, status:'accepted' }); }
  const { error } = await db.from('friendships').insert({ requester_id:req.user.id, addressee_id:target.id, status:'pending' });
  if (error) return res.status(400).json({ error:error.message });
  res.json({ success:true, status:'requested' });
});

app.post('/api/friends/accept/:username', requireUser, async (req, res) => {
  const { data: sender } = await db.from('profiles').select('id, username').eq('username', req.params.username).single();
  if (!sender) return res.status(404).json({ error: 'User not found.' });
  const { data: accepted } = await db.from('friendships').update({ status:'accepted' }).eq('requester_id', sender.id).eq('addressee_id', req.user.id).eq('status', 'pending').select('id');
  if (!accepted?.length) return res.status(404).json({ error: 'No pending friend request from this user.' });
  // Both sides get a row so each person's friends see it; the feed merges the pair into one post
  const pair = { requester: sender.username, addressee: req.username };
  await Promise.all([appendActivity(req.user.id,'friend_added',{ targetUser:sender.username, ...pair }),appendActivity(sender.id,'friend_added',{ targetUser:req.username, ...pair })]);
  res.json({ success:true });
});

app.post('/api/friends/decline/:username', requireUser, async (req, res) => {
  const { data: sender } = await db.from('profiles').select('id').eq('username', req.params.username).single();
  if (!sender) return res.status(404).json({ error: 'User not found.' });
  await db.from('friendships').delete().eq('requester_id', sender.id).eq('addressee_id', req.user.id);
  res.json({ success:true });
});

app.post('/api/friends/remove/:username', requireUser, async (req, res) => {
  const { data: target } = await db.from('profiles').select('id').eq('username', req.params.username).single();
  if (!target) return res.status(404).json({ error: 'User not found.' });
  await db.from('friendships').delete().or(`and(requester_id.eq.${req.user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${req.user.id})`);
  res.json({ success:true });
});

// ── Activity feed ───────────────────────────────────────────────────────────
// ── Feed visibility ─────────────────────────────────────────────────────────
// Trade posts reveal the same data as the CS trades tab, so other viewers only see them when
// the owner has made that tab public — and never for a trade the owner has hidden from their
// profile. Owners always see their own posts. Every feed (home
// feed, initial load, profile activity tab) goes through this one rule. Share links
// (/trade/...) are deliberately separate and keep working regardless.
const TRADE_POST_TYPES = new Set(['cs_trade', 'cs_trade_screenshot']);
const FEED_SIZE = 50;
const FEED_FETCH = 100; // over-fetch so hidden posts don't leave the feed short
async function visibleToViewer(activity, viewerId) {
  // Posts from the removed stock portfolio are no longer shown to anyone
  activity = activity.filter(a => a.type !== 'holdings_update');
  const foreign = activity.filter(a => a.user_id !== viewerId);
  if (!foreign.length) return activity;
  const ownerIds = [...new Set(foreign.map(a => a.user_id))];
  const itemIds = [...new Set(foreign
    .filter(a => TRADE_POST_TYPES.has(a.type) && a.payload?.inventoryId != null)
    .map(a => a.payload.inventoryId))];
  const [{ data: owners }, { data: hiddenItems }] = await Promise.all([
    db.from('profiles').select('id, public_cs_trades').in('id', ownerIds),
    itemIds.length
      ? db.from('cs_inventory').select('id').in('id', itemIds).eq('hidden_from_profile', true)
      : Promise.resolve({ data: [] }),
  ]);
  const ownerMap = Object.fromEntries((owners || []).map(p => [p.id, p]));
  const hiddenIds = new Set((hiddenItems || []).map(i => String(i.id)));
  return activity.filter(a => {
    if (a.user_id === viewerId) return true;
    const owner = ownerMap[a.user_id];
    if (!owner) return false; // lookup failed — fail closed
    if (TRADE_POST_TYPES.has(a.type)) return !!owner.public_cs_trades && !hiddenIds.has(String(a.payload?.inventoryId));
    return true;
  });
}
// Shapes a feed row for the client. All prices are USD; a stray non-USD price is dropped
// rather than shown with a dollar sign.
function formatFeedItem(a, profile = {}) {
  const payload = { ...(a.payload || {}) };
  if (payload.currency && payload.currency !== 'USD') {
    delete payload.price;
    delete payload.sellPrice;
    delete payload.buyPrice;
  }
  return { ...payload, id: a.id, type: a.type, createdAt: a.created_at, username: profile.username, avatarBase64: profile.avatar_base64, role: profile.role };
}

app.get('/api/feed', requireUser, async (req, res) => {
  try {
    // Fetch all friendships involving this user, filter accepted in JS
    // (chaining .or() + .eq() in Supabase can produce unexpected results)
    const { data: friendships } = await db
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`);

    const friendIds = (friendships||[])
      .filter(f => f.status === 'accepted')
      .map(f => f.requester_id === req.user.id ? f.addressee_id : f.requester_id);

    const allIds = [...new Set([...friendIds, req.user.id])];
    const [{ data: activity }, { data: profiles }] = await Promise.all([
      db.from('activity').select('id, user_id, type, payload, created_at').in('user_id', allIds).order('created_at', { ascending:false }).limit(FEED_FETCH),
      db.from('profiles').select('id, username, avatar_base64, role').in('id', allIds),
    ]);
    const profileMap = {};
    (profiles||[]).forEach(p => { profileMap[p.id] = p; });

    const visible = (await visibleToViewer(activity || [], req.user.id)).slice(0, FEED_SIZE);
    res.json(visible.map(a => formatFeedItem(a, profileMap[a.user_id])));
  } catch(e) {
    log.error('feed failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/activity/mine', requireUser, async (req, res) => {
  const { data } = await db.from('activity').select('*').eq('user_id', req.user.id).order('created_at', { ascending:false }).limit(50);
  res.json(data||[]);
});

// Get a specific user's public activity
app.get('/api/users/:username/activity', requireUser, async (req, res) => {
  const { data: profile } = await db.from('profiles').select('id, username').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  // Privacy toggles and hidden trades are applied by the shared feed rule (visibleToViewer)
  const { data: rows } = await db.from('activity').select('*').eq('user_id', profile.id).order('created_at', { ascending:false }).limit(FEED_FETCH);
  const activities = (await visibleToViewer(rows || [], req.user.id)).slice(0, 25);
  res.json(activities.map(a => {
    const payload = a.payload || {};
    return { ...payload, id: a.id, type: a.type, created_at: a.created_at, username: profile.username };
  }));
});

app.post('/api/activity/screenshot', requireUser, largeJson, async (req, res) => {
  const { skinName, caption, imageBase64 } = req.body;
  if (!skinName) return res.status(400).json({ error: 'Skin name required.' });
  if (caption && caption.length > 500) return res.status(400).json({ error: 'Caption too long.' });
  if (imageBase64 && imageBase64.length > 1.5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large. Maximum 1.5 MB.' });
  const ALLOWED_IMG_TYPES = ['data:image/jpeg;', 'data:image/jpg;', 'data:image/png;', 'data:image/webp;', 'data:image/gif;'];
  if (imageBase64 && !ALLOWED_IMG_TYPES.some(p => imageBase64.startsWith(p))) return res.status(400).json({ error: 'Invalid image format. JPEG, PNG, WebP or GIF only.' });
  await appendActivity(req.user.id, 'skin_screenshot', { skinName: skinName||'Unknown skin', caption: caption||'', imageBase64: imageBase64||null });
  res.json({ success:true });
});

app.delete('/api/activity/:id', requireUser, async (req, res) => {
  await db.from('activity').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ success:true });
});

app.patch('/api/activity/:id', requireUser, async (req, res) => {
  const caption = req.body.caption ?? '';
  if (typeof caption !== 'string') return res.status(400).json({ error: 'Invalid caption.' });
  if (caption.length > 500) return res.status(400).json({ error: 'Caption too long.' });
  const { data } = await db.from('activity').select('id, payload').eq('id', req.params.id).eq('user_id', req.user.id).single();
  if (!data) return res.status(404).json({ error: 'Not found' });
  await db.from('activity').update({ payload: { ...data.payload, caption } }).eq('id', req.params.id);
  res.json({ success: true });
});

// ── Announcements ───────────────────────────────────────────────────────────
app.get('/api/announcements', async (req, res) => {
  const { data } = await db.from('announcements').select('*').order('created_at', { ascending:false }).limit(10);
  res.json(data||[]);
});

// ── CS helpers ──────────────────────────────────────────────────────────────
function parseSteamTags(tags) {
  const r = {};
  for (const t of tags || []) {
    if (t.category === 'Exterior') r.exterior = t.localized_tag_name;
    else if (t.category === 'Quality') r.quality = t.localized_tag_name;
    else if (t.category === 'Rarity') { r.rarity = t.localized_tag_name; r.rarityColor = t.color ? `#${t.color}` : null; }
    else if (t.category === 'Weapon') r.weapon = t.localized_tag_name;
  }
  return r;
}

function parseSteamStickers(descriptions) {
  if (!descriptions?.length) return [];
  // Collect icon URLs from sticker_info / charm_info entries
  const stickerEntries = descriptions.filter(d =>
    d.value?.includes('sticker_info') || d.value?.includes('charm_info')
  );
  if (!stickerEntries.length) return [];
  const icons = [];
  for (const entry of stickerEntries) {
    for (const m of entry.value.matchAll(/src=["']([^"']+)["']/g)) icons.push(m[1]);
  }
  if (!icons.length) return [];

  // Find names from ANY description entry — agent patches put the "Accessories:" label
  // in a separate entry from the sticker_info icons, so we must scan all entries.
  const decodePlain = html => html
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();

  let names = [];
  for (const entry of descriptions) {
    const plain = decodePlain(entry.value || '');
    const m = plain.match(/(?:Stickers?|Patches?|Autograph|Charm|Keychain|Accessories):\s*(.+)/i);
    if (m) {
      names = m[1].split(/,\s*/).map(n => n.replace(/\s*\*>.*$/, '').trim()).filter(Boolean);
      break;
    }
  }

  return icons.map((url, i) => ({ url, name: names[i] || '' }));
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers:{ 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } }, (res) => {
      // Follow redirects (Steam sometimes 302s to login page)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return reject(new Error(`Steam redirected (${res.statusCode}) — inventory may be private or rate-limited`));
      }
      if (res.statusCode === 429) return reject(new Error('Steam rate limit — try again in a few minutes'));
      if (res.statusCode === 403) return reject(new Error('Steam returned 403 — inventory is private or access denied'));
      if (res.statusCode !== 200) return reject(new Error(`Steam returned HTTP ${res.statusCode}`));
      let data=''; res.on('data',d=>data+=d); res.on('end',()=>{ try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Steam returned an unexpected response — may be rate-limited, try again shortly')); } });
    }).on('error', reject);
  });
}

// Raw Steam inventory JSON, shared for 10 minutes. Public profile views and icon resets would
// otherwise download the full inventory from Steam on every request.
const steamInvRawCache = boundedCache(500, 10 * 60 * 1000);
async function fetchSteamInventory(steamId) {
  const cached = steamInvRawCache.get(steamId);
  if (cached) return cached;
  const data = await fetchJSON(`https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=500`);
  if (data?.assets) steamInvRawCache.set(steamId, data);
  return data;
}

// ── CS routes ───────────────────────────────────────────────────────────────
app.get('/api/cs/settings', requireUser, async (req, res) => {
  const { data: profile } = await db.from('profiles').select('steam_id').eq('id', req.user.id).single();
  res.json({ steam_id:profile?.steam_id||'' });
});


// Daily automatic Steam level re-sync for linked accounts — runs 90s after boot, then every
// 24 hours. steam_level is otherwise only fetched once, at link time (see /api/steam/callback),
// so without this it goes stale forever even as the user's real Steam level keeps climbing.
// Resolve a Steam account's level. Tries the Web API first, then the public profile page
// (works without a key and when the API returns an empty response), retrying a few times.
// Returns a number (0 is a real level for brand-new accounts) or null if it couldn't be read.
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchSteamLevel(steamId, attempts = 3) {
  const KEY = process.env.STEAM_API_KEY;
  for (let i = 0; i < attempts; i++) {
    if (KEY) {
      try {
        const r = await fetch(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${KEY}&steamid=${steamId}`, { signal: AbortSignal.timeout(8000) });
        const lvl = (await r.json())?.response?.player_level;
        if (Number.isFinite(lvl)) return lvl;
      } catch {}
    }
    try {
      const r = await fetch(`https://steamcommunity.com/profiles/${steamId}`, { headers: { 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(8000) });
      const m = (await r.text()).match(/friendPlayerLevelNum">\s*(\d+)\s*</);
      if (m) return parseInt(m[1], 10);
    } catch {}
    if (i < attempts - 1) await sleep(i === 0 ? 1000 : 3000);
  }
  return null;
}

// After linking, if the level couldn't be read yet (Steam hiccup, privacy just changed),
// try again a couple of times in the background instead of waiting for the daily sync.
function retrySteamLevelLater(userId, steamId) {
  for (const delay of [2 * 60 * 1000, 10 * 60 * 1000]) {
    setTimeout(async () => {
      const { data: p } = await db.from('profiles').select('steam_id, steam_level').eq('id', userId).single();
      if (!p || p.steam_id !== steamId || p.steam_level > 0) return; // relinked, or already resolved
      const lvl = await fetchSteamLevel(steamId);
      if (lvl != null) await db.from('profiles').update({ steam_level: lvl }).eq('id', userId);
      else log.warn('steam level still unavailable after link', { userId });
    }, delay).unref();
  }
}

async function runSteamLevelSync() {
  try {
    const { data: profiles } = await db.from('profiles').select('id, steam_id').eq('steam_verified', true).not('steam_id', 'is', null);
    if (!profiles || profiles.length === 0) return;
    let updated = 0, failed = 0;
    for (const p of profiles) {
      if (!/^\d{17}$/.test(p.steam_id || '')) continue;
      const lvl = await fetchSteamLevel(p.steam_id);
      // Never overwrite a known level with 0 just because a lookup failed
      if (lvl == null) { failed++; continue; }
      await db.from('profiles').update({ steam_level: lvl }).eq('id', p.id);
      updated++;
    }
    log.info('steam level sync completed', { checked: profiles.length, updated, failed });
  } catch(e) {
    log.error('steam level sync failed', { error: e.message });
  }
}
setTimeout(runSteamLevelSync, 90 * 1000);
setInterval(runSteamLevelSync, 24 * 60 * 60 * 1000).unref();

// cs_price_cache is used only as the skin-name catalog behind item search — prices are no
// longer read anywhere. Refresh names weekly so newly released items become searchable.
// Checked daily; the last-sync time lives in app_settings so frequent redeploys don't re-sync.
const CATALOG_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
async function runSkinCatalogSync() {
  try {
    const { data: last } = await db.from('app_settings').select('value').eq('key', 'skinCatalogSyncedAt').maybeSingle();
    if (last?.value && Date.now() - new Date(last.value).getTime() < CATALOG_SYNC_INTERVAL_MS) return;

    const r = await fetch('https://api.skinport.com/v1/items?app_id=730&currency=USD');
    if (!r.ok) { log.error('skin catalog sync: skinport error', { status: r.status }); return; }
    const items = await r.json();
    if (!Array.isArray(items)) { log.error('skin catalog sync: unexpected skinport response'); return; }

    const now = new Date().toISOString();
    const names = [...new Set(items.map(i => i.market_hash_name).filter(Boolean))];
    // price columns are legacy and unused; zeroed so the rows stay valid if they're NOT NULL
    const rows = names.map(skin_name => ({ skin_name, price_sek: 0, price_usd: 0, last_updated: now }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db.from('cs_price_cache').upsert(rows.slice(i, i + CHUNK), { onConflict: 'skin_name' });
      if (error) { log.error('skin catalog sync: upsert failed', { error: error.message }); return; }
    }
    await db.from('app_settings').upsert({ key: 'skinCatalogSyncedAt', value: now }, { onConflict: 'key' });
    log.info('skin catalog sync completed', { count: rows.length });
  } catch(e) {
    log.error('skin catalog sync failed', { error: e.message });
  }
}
setTimeout(runSkinCatalogSync, 2 * 60 * 1000);
setInterval(runSkinCatalogSync, 24 * 60 * 60 * 1000).unref();

app.get('/api/cs/skins/search/:query', requireUser, async (req, res) => {
  // Normalize query: strip CS special chars, split into words for flexible matching
  const rawWords = req.params.query.replace(/[|★™®]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0);
  // "Vanilla" is a frontend-only label (no skin_name in the DB contains it) — treat it as a
  // filter for pattern-less knives/gloves instead of a literal search term. Match on any
  // prefix of "vanilla" (down to a single "v") so it activates as the user is still typing it.
  const isVanillaPrefix = w => 'vanilla'.startsWith(w.toLowerCase());
  const vanillaOnly = rawWords.some(isVanillaPrefix);
  const words = rawWords.filter(w => !isVanillaPrefix(w) && w.length > 0);
  if (words.length === 0 && !vanillaOnly) return res.json([]);
  let q = db.from('cs_price_cache').select('skin_name').limit(200);
  if (vanillaOnly) q = q.ilike('skin_name', '%★%');
  for (const word of words) q = q.ilike('skin_name', `%${word}%`);
  const { data: rawData } = await q;
  if (!rawData) return res.json([]);
  const EXTS_PRE = ['Factory New','Minimal Wear','Field-Tested','Well-Worn','Battle-Scarred'];
  let data = vanillaOnly
    ? rawData.filter(r => !r.skin_name.includes('|') && !EXTS_PRE.some(e => r.skin_name.includes(`(${e})`)))
    : rawData;
  // The ilike filters above just narrow the DB round-trip (word can appear anywhere, even
  // mid-word). Require each search word to actually prefix a whole token in the name — so
  // "a" no longer matches "Ye-a-r" or "Birthd-a-y", but "scor" still matches "Scorched" since
  // that IS a real word start.
  if (words.length > 0) {
    const wordStartsToken = (name, w) => name.toLowerCase().split(/[^a-z0-9]+/i).some(t => t.startsWith(w.toLowerCase()));
    data = data.filter(r => words.every(w => wordStartsToken(r.skin_name, w)));
  }
  // cs_price_cache has no tradable flag (it's a raw Skinport name list), so drop known
  // non-tradable entries by pattern: a bare default weapon (no skin applied, no "|") can
  // never exist as a real inventory item, and tournament coins/service medals/badges are
  // always account-bound. Leave "★"-only names alone — that's the legitimate vanilla
  // knife/glove case, not a bare default weapon.
  const BASE_WEAPONS = new Set(['AK-47','M4A4','M4A1-S','AUG','SG 553','FAMAS','Galil AR','MAC-10','MP9','MP7','MP5-SD','UMP-45','P90','PP-Bizon','Desert Eagle','Glock-18','USP-S','P250','Five-SeveN','Tec-9','CZ75-Auto','Dual Berettas','P2000','R8 Revolver','Nova','XM1014','Sawed-Off','MAG-7','Negev','M249','SSG 08','AWP','SCAR-20','G3SG1']);
  data = data.filter(r => {
    const n = r.skin_name;
    if (!n.includes('|') && !n.includes('★')) {
      const base = n.replace(/^StatTrak™\s*/i, '').replace(/^Souvenir\s*/i, '').trim();
      if (BASE_WEAPONS.has(base)) return false;
    }
    if (/\b(Coin|Medal|Badge)\b/i.test(n)) return false;
    return true;
  });
  // Deduplicate: strip exterior only → unique base names. StatTrak and Souvenir stay
  // distinct rows (like each other) so the search results themselves cover that choice.
  const EXTS = ['Factory New','Minimal Wear','Field-Tested','Well-Worn','Battle-Scarred'];
  const stripExt = n => { let r = n; for (const e of EXTS) r = r.replace(` (${e})`, ''); return r.trim(); };
  const getBase  = n => stripExt(n);
  const baseMap = {};
  for (const r of data) {
    const base = getBase(r.skin_name);
    const hadExt = EXTS.some(e => r.skin_name.includes(`(${e})`));
    if (!baseMap[base]) baseMap[base] = { skin_name: base, hasExterior: hadExt };
  }
  // Sort by the underlying item name, not the raw skin_name string: a leading "★" (knives/
  // gloves) sorts before regular letters under locale comparison and would otherwise cluster
  // all star items ahead of everything else. Strip ★/StatTrak™/Souvenir prefixes for ordering
  // purposes only. Vanilla knives/gloves are stored without a " | Vanilla" suffix (that's a
  // display-only label), so append it here too — otherwise the bare name sorts before every
  // patterned sibling as a string prefix instead of falling alphabetically among them.
  const sortName = n => {
    const isVanilla = n.includes('★') && !n.includes('|');
    const stripped = n.replace(/^★\s*/, '').replace(/^StatTrak™\s*/i, '').replace(/^Souvenir\s*/i, '').trim();
    return isVanilla ? `${stripped} | Vanilla` : stripped;
  };
  res.json(Object.values(baseMap).sort((a, b) => sortName(a.skin_name).localeCompare(sortName(b.skin_name))).slice(0, 15));
});

const steamInvCache = new Map(); // steamId → { payload, ts }
const STEAM_INV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

app.get('/api/cs/steam/inventory/:steamId', requireUser, heavyRateLimit(60000, 'steam-inv'), async (req, res) => {
  if (!/^\d{17}$/.test(req.params.steamId)) return res.status(400).json({ error: 'Invalid Steam ID' });
  const cacheKey = `v3:${req.params.steamId}`;
  const cached = steamInvCache.get(cacheKey);

  // Serve from server-side cache if fresh (avoids hammering Steam on every tab visit)
  if (cached && Date.now() - cached.ts < STEAM_INV_CACHE_TTL_MS) {
    return res.json({ ...cached.payload, fromCache: true });
  }

  try {
    const data = await fetchJSON(`https://steamcommunity.com/inventory/${req.params.steamId}/730/2?l=english&count=500`);
    if (!data?.assets) return res.status(404).json({ error:'Inventory not found or private' });
    const descMap = {};
    (data.descriptions||[]).forEach(d=>{ descMap[`${d.classid}_${d.instanceid}`]=d; });

    const items = (data.assets||[]).map(asset => {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`];
      const name = desc?.market_hash_name || desc?.name || 'Unknown';
      const tags = parseSteamTags(desc?.tags);
      const stickers = parseSteamStickers(desc?.descriptions);
      const actionLink = desc?.actions?.[0]?.link;
      const inspectLink = actionLink
        ? actionLink.replace('%owner_steamid%', req.params.steamId).replace('%assetid%', asset.assetid).replace('%d%', '0')
        : null;
      return {
        assetId: asset.assetid, name,
        iconUrl: desc?.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/360x360` : null,
        tradable: desc?.tradable === 1, type: desc?.type || '',
        exterior: tags.exterior || null, quality: tags.quality || null,
        rarity: tags.rarity || null, rarityColor: tags.rarityColor || null, stickers,
        inspectLink,
      };
    }).filter(i => i.name !== 'Unknown');

    const payload = { items, count: items.length };
    steamInvCache.delete(cacheKey);
    steamInvCache.set(cacheKey, { payload, ts: Date.now() });
    // Keep stale entries for the Steam-outage fallback below, but cap how many are held
    if (steamInvCache.size > 1000) steamInvCache.delete(steamInvCache.keys().next().value);
    res.json(payload);
  } catch(e) {
    // On Steam error (rate-limit, private, etc.) serve stale cache rather than a hard failure
    if (cached) {
      log.warn('steam inventory fetch failed — serving stale cache', { error: e.message, steamId: req.params.steamId });
      return res.json({ ...cached.payload, stale: true, staleReason: e.message });
    }
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cs/inventory', requireUser, async (req, res) => {
  const { data, error } = await db.from('cs_inventory').select('*, cs_sales(*)').eq('user_id', req.user.id).order('purchase_date', { ascending:false });
  if (error) { log.error('cs_inventory GET failed', { error: error.message, userId: req.user.id }); return res.status(500).json({ error: error.message }); }
  // Prices are stored exactly as entered, in USD — nothing to convert
  res.json((data || []).map(({ cs_sales, purchase_currency, purchase_price_sek, ...item }) => ({
    ...item,
    sale_price: cs_sales?.[0]?.sale_price ?? null,
    sale_date: cs_sales?.[0]?.sale_date ?? null,
  })));
});

// Every price is a USD amount the user typed in: a finite, non-negative number, kept to cents.
// Returns null for anything else.
function parseUsd(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : null;
}

const STEAM_SCREENSHOT_RE = /^https:\/\/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=\d+$/;
function validateScreenshotUrl(url) {
  if (!url) return null;
  if (!STEAM_SCREENSHOT_RE.test(url)) return false;
  return url;
}

// Sticker images must be served by Steam. The host is checked on the parsed URL — a regex on
// the raw string can be fooled (e.g. "https://evil.com?.steamstatic.com/" has host evil.com).
// akamaihd.net is shared by every Akamai customer, so only Steam's own host there is allowed.
const STICKER_HOST_SUFFIXES = ['.steamstatic.com', '.steamcommunity.com'];
const STICKER_HOSTS_EXACT = ['steamcdn-a.akamaihd.net'];
function isSteamImageUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return STICKER_HOSTS_EXACT.includes(host) || STICKER_HOST_SUFFIXES.some(s => host.endsWith(s));
}
function safeStickerList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(s => s && typeof s.url === 'string' && isSteamImageUrl(s.url))
            .map(s => ({ url: s.url, name: typeof s.name === 'string' ? s.name.slice(0, 100) : '' }))
            .slice(0, 8);
}

app.post('/api/cs/inventory', requireUser, async (req, res) => {
  const { skin_name, exterior, float_value, pattern, purchase_price, purchase_date, notes, screenshot_url, steam_asset_id, icon_url, stickers } = req.body;
  if (!skin_name||!purchase_date) return res.status(400).json({ error:'skin_name and purchase_date required' });
  const price = parseUsd(purchase_price);
  if (price == null) return res.status(400).json({ error: 'Enter a valid buy price in USD.' });
  if (screenshot_url && validateScreenshotUrl(screenshot_url) === false) return res.status(400).json({ error: 'Invalid screenshot URL.' });
  const safeScreenshotUrl = validateScreenshotUrl(screenshot_url);
  if (notes && notes.length > 2000) return res.status(400).json({ error: 'Notes too long.' });
  const safeIconUrl = icon_url && /^https:\/\/community\.cloudflare\.steamstatic\.com\//.test(icon_url) ? icon_url : null;
  const safeFloat = float_value !== '' && float_value != null ? parseFloat(float_value) : null;
  const safePattern = pattern !== '' && pattern != null ? parseInt(pattern) : null;
  const { data, error } = await db.from('cs_inventory').insert({ user_id:req.user.id, skin_name, exterior, float_value:safeFloat, pattern:safePattern, purchase_price:price, purchase_currency:'USD', purchase_date, notes, screenshot_url:safeScreenshotUrl, steam_asset_id:steam_asset_id||null, icon_url:safeIconUrl||null, share_token:crypto.randomUUID(), stickers:safeStickerList(stickers) }).select().single();
  if (error) return res.status(500).json({ error:error.message });
  const safeStickers = safeStickerList(stickers);
  // One post per new trade: the screenshot version when there's a screenshot, otherwise the plain one
  if (!safeScreenshotUrl) {
    await appendActivity(req.user.id, 'cs_trade', { action:'buy', inventoryId: data.id, skinName:skin_name, price, currency:'USD', exterior, floatValue: safeFloat, iconUrl: safeIconUrl || null, stickers: safeStickers });
  } else {
    const idMatch = safeScreenshotUrl.match(/id=(\d+)/);
    let screenshotImgUrl = null;
    if (idMatch) {
      try { screenshotImgUrl = await fetchSteamScreenshotPreview(idMatch[1]); } catch(e) {}
    }
    await appendActivity(req.user.id, 'cs_trade_screenshot', {
      inventoryId: data.id,
      skinName: skin_name, exterior, floatValue: safeFloat,
      screenshotUrl: safeScreenshotUrl, screenshotImgUrl,
      iconUrl: safeIconUrl || null,
      action: 'buy',
      price, currency: 'USD',
      stickers: safeStickers,
    });
  }
  res.json({ id:data.id, success:true });
});

app.put('/api/cs/inventory/:id', requireUser, async (req, res) => {
  const { skin_name, exterior, float_value, pattern, purchase_price, purchase_date, notes, screenshot_url, steam_asset_id, icon_url, stickers } = req.body;
  if (!skin_name || !purchase_date) return res.status(400).json({ error: 'skin_name and purchase_date required' });
  const price = parseUsd(purchase_price);
  if (price == null) return res.status(400).json({ error: 'Enter a valid buy price in USD.' });
  if (screenshot_url && validateScreenshotUrl(screenshot_url) === false) return res.status(400).json({ error: 'Invalid screenshot URL.' });
  const safeScreenshotUrl = validateScreenshotUrl(screenshot_url);
  if (notes && notes.length > 2000) return res.status(400).json({ error: 'Notes too long.' });
  const { data: existing } = await db.from('cs_inventory').select('skin_name, screenshot_url, sold, stickers, icon_url').eq('id', req.params.id).eq('user_id', req.user.id).single();
  if (!existing) return res.status(404).json({ error: 'Item not found.' });
  const safeIconUrl = icon_url && /^https:\/\/community\.cloudflare\.steamstatic\.com\//.test(icon_url) ? icon_url : null;
  const safeFloat = float_value !== '' && float_value != null ? parseFloat(float_value) : null;
  const safePattern = pattern !== '' && pattern != null ? parseInt(pattern) : null;
  const updateFields = { skin_name, exterior, float_value: safeFloat, pattern: safePattern, purchase_price: price, purchase_currency: 'USD', purchase_date, notes, screenshot_url: safeScreenshotUrl };
  // Only touch fields the client actually sent — leaving one out must keep the stored value,
  // not wipe it (an omitted icon_url used to erase the item's icon)
  if (steam_asset_id !== undefined) updateFields.steam_asset_id = steam_asset_id || null;
  if (icon_url !== undefined) updateFields.icon_url = safeIconUrl;
  if (stickers !== undefined) updateFields.stickers = safeStickerList(stickers);
  const { error } = await db.from('cs_inventory')
    .update(updateFields)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  if (safeScreenshotUrl && !existing?.screenshot_url) {
    const idMatch = safeScreenshotUrl.match(/id=(\d+)/);
    let screenshotImgUrl = null;
    if (idMatch) {
      try { screenshotImgUrl = await fetchSteamScreenshotPreview(idMatch[1]); } catch(e) {}
    }
    const isSold = existing?.sold ?? false;
    await appendActivity(req.user.id, 'cs_trade_screenshot', {
      inventoryId: req.params.id,
      skinName: skin_name, exterior, floatValue: safeFloat,
      screenshotUrl: safeScreenshotUrl, screenshotImgUrl,
      iconUrl: (icon_url !== undefined ? safeIconUrl : existing.icon_url) || null,
      action: isSold ? 'sell' : 'buy',
      price,
      currency: 'USD',
      stickers: stickers !== undefined ? safeStickerList(stickers) : (existing.stickers || []),
      isUpdate: true,
    });
  }
  res.json({ success: true });
});

app.delete('/api/cs/inventory/:id', requireUser, async (req, res) => {
  const { data: deleted, error } = await db.from('cs_inventory').delete().eq('id', req.params.id).eq('user_id', req.user.id).select('id');
  if (error) { log.error('cs_inventory delete failed', { error: error.message, userId: req.user.id }); return res.status(500).json({ error: 'Could not delete the trade. Please try again.' }); }
  if (!deleted?.length) return res.status(404).json({ error: 'Item not found.' });
  // Remove the trade's feed posts too. Posts store inventoryId as a number or a string,
  // and ->> compares as text, so one filter catches both
  const { error: actErr } = await db.from('activity').delete()
    .eq('user_id', req.user.id)
    .in('type', [...TRADE_POST_TYPES])
    .eq('payload->>inventoryId', String(req.params.id));
  if (actErr) log.warn('trade post cleanup failed', { error: actErr.message, userId: req.user.id });
  res.json({ success:true });
});

app.post('/api/cs/inventory/:id/sell', requireUser, async (req, res) => {
  const { sale_price, sale_date, notes, screenshot_url } = req.body;
  const salePrice = parseUsd(sale_price);
  if (salePrice == null || !sale_date) return res.status(400).json({ error: 'Enter a valid sale price in USD and a sale date.' });
  if (screenshot_url && validateScreenshotUrl(screenshot_url) === false) return res.status(400).json({ error: 'Invalid screenshot URL.' });
  const safeScreenshotUrl = validateScreenshotUrl(screenshot_url);
  if (notes && notes.length > 2000) return res.status(400).json({ error: 'Notes too long.' });
  const { data: item } = await db.from('cs_inventory').select('skin_name, exterior, float_value, purchase_price, sold, icon_url, stickers').eq('id', req.params.id).eq('user_id', req.user.id).single();
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (item.sold) return res.status(409).json({ error: 'Item already marked as sold.' });
  // Claim the item in one conditional update: only a request that flips it from unsold to sold
  // proceeds, so two quick "Confirm Sale" clicks can't both record a sale
  const { data: claimed, error: claimErr } = await db.from('cs_inventory')
    .update({ sold: true })
    .eq('id', req.params.id).eq('user_id', req.user.id).not('sold', 'is', true)
    .select('id');
  if (claimErr) return res.status(500).json({ error: claimErr.message });
  if (!claimed?.length) return res.status(409).json({ error: 'Item already marked as sold.' });
  const { data, error: saleErr } = await db.from('cs_sales').insert({ inventory_id:req.params.id, user_id:req.user.id, sale_price:salePrice, sale_currency:'USD', sale_date, notes, screenshot_url:safeScreenshotUrl }).select().single();
  if (saleErr) {
    // Undo the claim so the item isn't left "sold" with no sale recorded
    await db.from('cs_inventory').update({ sold: false }).eq('id', req.params.id).eq('user_id', req.user.id);
    return res.status(500).json({ error: 'Could not save the sale. Please try again.' });
  }
  await appendActivity(req.user.id, 'cs_trade', { action:'sell', inventoryId: req.params.id, skinName:item.skin_name, exterior: item.exterior, floatValue: item.float_value, buyPrice:item.purchase_price, sellPrice:salePrice, currency:'USD', iconUrl: item.icon_url || null, stickers: item.stickers || [] });
  res.json({ id:data?.id, success:true });
});

// Full-resolution image for a Steam screenshot. Only `file_url` is the real image —
// `preview_url` is a ~200px thumbnail that looks blurry at post size, so it's never used.
// Returns { url, notPublic }: notPublic is true only when Steam answered but exposes no image
// (screenshot private, friends-only or deleted — result 9), never on a network failure.
async function steamScreenshotInfo(id) {
  const STEAM_KEY = process.env.STEAM_API_KEY;
  let answered = false;
  if (STEAM_KEY) {
    try {
      const r = await fetch(
        `https://api.steampowered.com/IPublishedFileService/GetDetails/v1/?key=${STEAM_KEY}&publishedfileids[0]=${id}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const detail = (await r.json())?.response?.publishedfiledetails?.[0];
      if (detail?.file_url) return { url: detail.file_url, notPublic: false };
      if (detail) answered = true;
    } catch {}
  }
  try {
    const r = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `itemcount=1&publishedfileids[0]=${id}`,
      signal: AbortSignal.timeout(8000),
    });
    const detail = (await r.json())?.response?.publishedfiledetails?.[0];
    if (detail?.file_url) return { url: detail.file_url, notPublic: false };
    if (detail) answered = true;
  } catch {}
  return { url: null, notPublic: answered };
}
// Every feed post and every public /trade page view asks for its screenshot, so answers are
// cached. Only definite answers (an image, or "not public") — network failures are retried.
const screenshotCache = boundedCache(5000, 6 * 60 * 60 * 1000);
async function cachedScreenshotInfo(id) {
  const cached = screenshotCache.get(id);
  if (cached) return cached;
  const info = await steamScreenshotInfo(id);
  if (info.url || info.notPublic) screenshotCache.set(id, info);
  return info;
}
const fetchSteamScreenshotPreview = async id => (await cachedScreenshotInfo(id)).url;

app.get('/api/cs/steam/screenshot/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid screenshot ID' });
  try {
    const { url, notPublic } = await cachedScreenshotInfo(id);
    if (url) return res.json({ previewUrl: url });
    if (notPublic) return res.json({ previewUrl: null, notPublic: true });
    res.status(502).json({ error: 'Steam is unavailable right now' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cs/pnl', requireUser, async (req, res) => {
  const [{ data: sold }, { data: holding }] = await Promise.all([
    db.from('cs_inventory').select('purchase_price, cs_sales(sale_price)').eq('user_id', req.user.id).eq('sold', true),
    db.from('cs_inventory').select('purchase_price').eq('user_id', req.user.id).eq('sold', false),
  ]);
  const usd = n => Number(n) || 0;
  const realised = (sold || []).reduce((s, r) => s + usd(r.cs_sales?.[0]?.sale_price) - usd(r.purchase_price), 0);
  const invested = (holding || []).reduce((s, r) => s + usd(r.purchase_price), 0);
  res.json({
    realised: parseFloat(realised.toFixed(2)),
    totalInvested: parseFloat(invested.toFixed(2)),
    soldCount: (sold || []).length, holdingCount: (holding || []).length,
  });
});

// ── Admin routes ─────────────────────────────────────────────────────────────

// Email preview — open in browser; accepts token as query param for convenience
app.get('/api/admin/email-templates', requireAdmin, (req, res) => {
  res.json(Object.entries(EMAIL_TEMPLATES).map(([type, t]) => ({ type, label: t.label })));
});

// Renders a template exactly as it's sent, filled with sample values
app.get('/api/admin/preview-email', requireAdmin, (req, res) => {
  const type = EMAIL_TEMPLATES[req.query.type] ? req.query.type : 'welcome';
  const { html } = renderEmail(type, {
    username: req.username,
    newEmail: 'new.address@example.com',
    url: `${APP_URL}/?${type.includes('reset') ? 'reset_token' : 'email_token'}=preview`,
  });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [{ data: profiles }, { count: totalTrades }, { data: pendingTokens }] = await Promise.all([
      db.from('profiles').select('id, username, role, created_at, public_inventory, avatar_base64, email, email_verified'),
      db.from('cs_inventory').select('*', { count:'exact', head:true }),
      db.from('email_verification_tokens').select('username, email, expires_at').eq('used', false).gt('expires_at', new Date().toISOString()),
    ]);

    // Latest active pending verification token per user
    const pendingEmailMap = {};
    (pendingTokens || []).forEach(t => { pendingEmailMap[t.username] = { email: t.email, expiresAt: t.expires_at }; });

    const usersStats = (profiles || []).map(p => ({
      username: p.username, role: p.role, createdAt: p.created_at,
      isRoot: isRootAdmin(p.id),
      publicInventory: p.public_inventory,
      avatarBase64: p.avatar_base64 || null,
      email: p.email || null,
      emailVerified: p.email_verified || false,
      pendingEmail: pendingEmailMap[p.username] || null,
    }));

    const mem = process.memoryUsage();
    res.json({
      system: { uptime: Math.floor(process.uptime()), nodeVersion: process.version, memoryMB: Math.round(mem.rss/1024/1024), heapUsedMB: Math.round(mem.heapUsed/1024/1024), platform: process.platform },
      users: usersStats,
      // Lets the admin panel show only the actions the server will actually allow
      viewer: { isRoot: isRootAdmin(req.user.id), isRecovery: isRecoveryAdmin(req.user.id) },
      totals: { userCount: (profiles||[]).length, totalTrades: totalTrades||0 },
    });
  } catch(e) {
    log.error('admin/stats failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Staff (admins/mods) may only change credentials of regular users — never of each other.
// Sole exception: the recovery account may reset the root admin's password.
// `target` must include its `id`.
function credentialChangeBlocked(actorId, target, { passwordReset = false } = {}) {
  if (isRootAdmin(target.id)) {
    return passwordReset && isRecoveryAdmin(actorId)
      ? null
      : "You don't have permission to change the root admin account's credentials.";
  }
  if (target.role === 'admin' || target.role === 'moderator') return "Staff accounts' credentials can't be changed by other staff.";
  return null;
}

app.delete('/api/admin/users/:username', requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });
  const email = `${req.username.toLowerCase()}@statera.local`;
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) return res.status(401).json({ error: 'Incorrect password' });
  const { data: profile } = await db.from('profiles').select('id, role').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error:'User not found.' });
  if (isRootAdmin(profile.id)) return res.status(400).json({ error:'Cannot delete admin account.' });
  if (profile.id === req.user.id) return res.status(400).json({ error:'You cannot delete your own account.' });
  // Same rule as credential changes: staff can't remove each other — only the root admin can
  if ((profile.role === 'admin' || profile.role === 'moderator') && !isRootAdmin(req.user.id))
    return res.status(403).json({ error: 'Only the root admin can delete staff accounts.' });
  const { error: delError } = await supabase.auth.admin.deleteUser(profile.id);
  if (delError) return res.status(500).json({ error: 'Failed to delete user: ' + delError.message });
  await appendModLog(req.username, 'delete-user', req.params.username);
  res.json({ success:true });
});

app.post('/api/admin/users/:username/reset-password', requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword||newPassword.length<6) return res.status(400).json({ error:'Password must be at least 6 characters.' });
  const { data: profile } = await db.from('profiles').select('id, username, role').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error:'User not found.' });
  const blocked = credentialChangeBlocked(req.user.id, profile, { passwordReset: true });
  if (blocked) return res.status(403).json({ error: blocked });
  await supabase.auth.admin.updateUserById(profile.id, { password:newPassword });
  await markPasswordChanged(profile.id);
  await appendModLog(req.username, 'reset-password', req.params.username);
  res.json({ success:true });
});

app.post('/api/admin/users/:username/set-email', requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { email } = req.body;
  const { data: profile } = await db.from('profiles').select('id, username, role').eq('username', username).single();
  if (!profile) return res.status(404).json({ error: 'User not found.' });
  const blocked = credentialChangeBlocked(req.user.id, profile);
  if (blocked) return res.status(403).json({ error: blocked });
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format.' });
    const { data: existing } = await db.from('profiles').select('username').ilike('email', escapeLike(email)).single();
    if (existing && existing.username !== username) return res.status(400).json({ error: 'Email already in use by another user.' });
  }
  // If clearing email, update profiles immediately. Otherwise, don't commit until user verifies —
  // so if the link expires unused, profiles.email stays unchanged.
  if (!email) {
    await db.from('profiles').update({ email: null, email_verified: false }).eq('username', username);
    await appendModLog(req.username, 'set-email', username, 'cleared');
    return res.json({ success: true, emailSent: false });
  }
  // Invalidate any prior pending tokens for this user
  await db.from('email_verification_tokens').update({ used: true }).eq('username', username).eq('used', false);
  let emailSent = false;
  if (resend) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    const { error: insertErr } = await db.from('email_verification_tokens').insert({ username, email, token, expires_at: expiresAt });
    if (insertErr) {
      log.error('Failed to insert verification token', { error: insertErr.message, username, email });
      return res.status(500).json({ error: 'Failed to create verification token: ' + insertErr.message });
    }
    const verifyUrl = `${APP_URL}/?email_token=${token}`;
    await resend.emails.send({
      from: 'Verumen <noreply@verumen.com>',
      to: email,
      ...renderEmail('admin-verify', { username, url: verifyUrl }),
    }).then(() => { emailSent = true; }).catch(e => log.error('verify email send failed', { error: e.message }));
  }
  // The address itself isn't logged — moderators can read this log but not users' emails
  await appendModLog(req.username, 'set-email', username, emailSent ? 'verification link sent' : 'verification email not sent');
  res.json({ success: true, emailSent });
});

app.post('/api/auth/verify-email', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required.' });
  const { data: record } = await db.from('email_verification_tokens').select('*').eq('token', token).single();
  if (!record) return res.status(400).json({ error: 'Invalid or expired verification link.' });
  if (record.used) return res.status(400).json({ error: 'This link has already been used.' });
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'Verification link has expired.' });
  // Commit the email to profiles now that the user confirmed ownership
  const { data: updatedRows, error: updateErr } = await db
    .from('profiles')
    .update({ email: record.email, email_verified: true })
    .eq('username', record.username)
    .select('id');
  if (updateErr) {
    log.error('Failed to commit verified email to profile', { error: updateErr.message, username: record.username, email: record.email });
    return res.status(500).json({ error: 'Failed to save email: ' + updateErr.message });
  }
  if (!updatedRows || updatedRows.length === 0) {
    log.error('verify-email: update matched 0 rows', { username: record.username, email: record.email });
    return res.status(500).json({ error: `No profile found for username "${record.username}" — email not saved.` });
  }
  await db.from('email_verification_tokens').update({ used: true }).eq('token', token);
  res.json({ success: true, username: record.username });
});

app.post('/api/admin/users/:username/send-reset-email', requireAdmin, async (req, res) => {
  const { data: profile } = await db.from('profiles').select('id, email, username, role').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found.' });
  const blocked = credentialChangeBlocked(req.user.id, profile, { passwordReset: true });
  if (blocked) return res.status(403).json({ error: blocked });
  if (!profile.email) return res.status(400).json({ error: 'This user has no email address on file.' });
  if (!resend) return res.status(500).json({ error: 'Email service not configured.' });
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
  await db.from('password_reset_tokens').insert({ username: req.params.username, token, expires_at: expiresAt });
  const resetUrl = `${APP_URL}/?reset_token=${token}`;
  await resend.emails.send({
    from: 'Verumen <noreply@verumen.com>',
    to: profile.email,
    ...renderEmail('admin-reset', { url: resetUrl }),
  }).catch(e => log.error('resend admin reset failed', { error: e.message }));
  await appendModLog(req.username, 'send-reset-email', req.params.username);
  res.json({ success: true });
});

app.post('/api/admin/users/:username/set-role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['user','moderator'].includes(role)) return res.status(400).json({ error:'Invalid role.' });
  // Admin roles are only changed via set-role-admin (root admin only), so this route can't demote an admin
  const { data: target } = await db.from('profiles').select('id, role').eq('username', req.params.username).single();
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (isRootAdmin(target.id)) return res.status(400).json({ error: 'Cannot change the root admin role.' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Only the root admin account can manage admin roles.' });
  await db.from('profiles').update({ role }).eq('username', req.params.username);
  await appendModLog(req.username, `set-role:${role}`, req.params.username);
  res.json({ success:true });
});

app.post('/api/admin/users/:username/set-role-admin', requireAdmin, async (req, res) => {
  // Only the root admin account can grant or revoke admin role
  if (!isRootAdmin(req.user.id)) return res.status(403).json({ error: 'Only the root admin account can manage admin roles.' });
  const { role } = req.body;
  if (!['user','moderator','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const { data: target } = await db.from('profiles').select('id').eq('username', req.params.username).single();
  if (!target) return res.status(404).json({ error: 'User not found.' });
  // Protect the root admin account from being demoted
  if (isRootAdmin(target.id)) return res.status(400).json({ error: 'Cannot change the root admin role.' });
  await db.from('profiles').update({ role }).eq('id', target.id);
  await appendModLog(req.username, `set-role-admin:${role}`, req.params.username);
  res.json({ success: true });
});

app.post('/api/admin/users/:username/clear-bio', requireAdmin, async (req, res) => {
  await db.from('profiles').update({ bio:'' }).eq('username', req.params.username);
  await appendModLog(req.username, 'clear-bio', req.params.username);
  res.json({ success:true });
});

app.post('/api/admin/announcements', requireAdmin, async (req, res) => {
  const { title, message, type } = req.body;
  if (!title||!message) return res.status(400).json({ error:'title and message required.' });
  const { data, error } = await db.from('announcements').insert({ title, message, type:type||'info', posted_by:req.username }).select().single();
  if (error) return res.status(500).json({ error:error.message });
  await appendModLog(req.username, 'post-announcement', '-', title);
  res.json({ success:true, announcement:data });
});

app.delete('/api/admin/announcements/:id', requireAdmin, async (req, res) => {
  await db.from('announcements').delete().eq('id', req.params.id);
  await appendModLog(req.username, 'delete-announcement', '-', req.params.id);
  res.json({ success:true });
});

// ── Moderator routes ─────────────────────────────────────────────────────────
// Staff action log for the admin and moderator panels, newest first
app.get('/api/mod/log', requireModerator, async (req, res) => {
  const { data, error } = await db.from('moderation_log').select('*').order('created_at', { ascending:false }).limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(r => ({
    id: r.id ?? null,
    createdAt: r.created_at,
    moderator: r.moderator,
    action: r.action,
    targetUser: r.target_user,
    details: r.details || '',
  })));
});

app.post('/api/mod/users/:username/reset-password', requireModerator, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const { data: profile } = await db.from('profiles').select('id, username, role').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error:'User not found.' });
  const blocked = credentialChangeBlocked(req.user.id, profile);
  if (blocked) return res.status(403).json({ error: blocked });
  await supabase.auth.admin.updateUserById(profile.id, { password:newPassword });
  await markPasswordChanged(profile.id);
  await appendModLog(req.username, 'reset-password', req.params.username);
  res.json({ success:true });
});

app.post('/api/mod/users/:username/clear-bio', requireModerator, async (req, res) => {
  await db.from('profiles').update({ bio:'' }).eq('username', req.params.username);
  await appendModLog(req.username, 'clear-bio', req.params.username);
  res.json({ success:true });
});

app.post('/api/mod/announcements', requireModerator, async (req, res) => {
  const { title, message, type } = req.body;
  if (!title||!message) return res.status(400).json({ error:'title and message required.' });
  const { data } = await db.from('announcements').insert({ title, message, type:type||'info', posted_by:req.username }).select().single();
  await appendModLog(req.username, 'post-announcement', '-', title);
  res.json({ success:true, announcement:data });
});

app.delete('/api/mod/announcements/:id', requireModerator, async (req, res) => {
  await db.from('announcements').delete().eq('id', req.params.id);
  await appendModLog(req.username, 'delete-announcement', '-', req.params.id);
  res.json({ success:true });
});

// ── Steam OpenID verification ───────────────────────────────────────────────
const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const BASE_URL = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://verumen.com' : 'http://localhost:5173');

// Short-lived opaque state tokens: code → { userId, expiresAt }
const steamLinkTokens = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of steamLinkTokens) if (now > v.expiresAt) steamLinkTokens.delete(k); }, 60 * 1000).unref();

// Step 1: Redirect user to Steam login
app.get('/api/steam/auth', requireUser, (req, res) => {
  const state = crypto.randomBytes(24).toString('hex');
  steamLinkTokens.set(state, { userId: req.user.id, expiresAt: Date.now() + 5 * 60 * 1000 });
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${BASE_URL}/api/steam/callback?state=${state}`,
    'openid.realm': BASE_URL,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  res.json({ url: `${STEAM_OPENID_URL}?${params.toString()}` });
});

// Step 2: Steam redirects back here after login
app.get('/api/steam/callback', async (req, res) => {
  const { state, ...openidParams } = req.query;

  // Consume the state token — single use, reject if missing/expired
  const pending = steamLinkTokens.get(state);
  steamLinkTokens.delete(state);
  if (!pending || Date.now() > pending.expiresAt) {
    return res.redirect(`${BASE_URL}/profile/edit?steam_error=session`);
  }
  const userId = pending.userId;

  // Before asking Steam, make sure this response was issued for *this* login: by Steam, back
  // to this exact callback + state, with those fields covered by the signature. Steam's
  // signature check alone only proves the response is genuine — a login made on another site
  // that uses Steam sign-in is genuine too, and could otherwise be replayed here to link
  // someone else's Steam account.
  const signedFields = typeof openidParams['openid.signed'] === 'string' ? openidParams['openid.signed'].split(',') : [];
  const responseIsForUs =
    Object.values(openidParams).every(v => typeof v === 'string') &&
    openidParams['openid.mode'] === 'id_res' &&
    openidParams['openid.op_endpoint'] === STEAM_OPENID_URL &&
    openidParams['openid.return_to'] === `${BASE_URL}/api/steam/callback?state=${state}` &&
    openidParams['openid.claimed_id'] === openidParams['openid.identity'] &&
    ['op_endpoint', 'return_to', 'claimed_id', 'identity', 'response_nonce'].every(f => signedFields.includes(f));
  if (!responseIsForUs) return res.redirect(`${BASE_URL}/profile/edit?steam_error=invalid`);

  // Verify the OpenID response with Steam
  try {
    const verifyParams = new URLSearchParams({ ...openidParams, 'openid.mode': 'check_authentication' });
    const verifyRes = await fetch(`${STEAM_OPENID_URL}?${verifyParams.toString()}`, { signal: AbortSignal.timeout(10000) });
    const verifyText = await verifyRes.text();
    if (!verifyText.includes('is_valid:true')) {
      return res.redirect(`${BASE_URL}/profile/edit?steam_error=invalid`);
    }

    // Extract SteamID from claimed_id (format: https://steamcommunity.com/openid/id/STEAMID64)
    const claimedId = openidParams['openid.claimed_id'] || '';
    const steamIdMatch = claimedId.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
    if (!steamIdMatch) return res.redirect(`${BASE_URL}/profile/edit?steam_error=invalid`);
    const steamId = steamIdMatch[1];

    // Get Steam profile info and level
    const STEAM_KEY = process.env.STEAM_API_KEY;
    let steamName = '', steamAvatar = '', steamLevel = 0;
    if (STEAM_KEY) {
      try {
        // Fetch player summary
        const data = await fetchJSON(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_KEY}&steamids=${steamId}`);
        const player = data?.response?.players?.[0];
        if (player) { steamName = player.personaname; steamAvatar = player.avatarmedium; }

      } catch(e) {
        log.error('Steam player summary fetch failed', { error: e.message });
      }
    }
    // Level is looked up separately (with retries + a public-page fallback) so a failed
    // name lookup can't leave the account stuck at level 0
    const resolvedLevel = await fetchSteamLevel(steamId);
    if (resolvedLevel != null) steamLevel = resolvedLevel;
    else { log.warn('steam level unavailable at link time', { userId }); retrySteamLevelLater(userId, steamId); }

    // Save verified Steam ID and level
    await db.from('profiles').update({
      steam_id: steamId,
      steam_verified: true,
      steam_level: steamLevel
    }).eq('id', userId);

    // Redirect back to profile with success
    res.redirect(`${BASE_URL}/profile/edit?steam_success=1&steam_name=${encodeURIComponent(steamName)}`);
  } catch(e) {
    log.error('steam/callback failed', { error: e.message });
    res.redirect(`${BASE_URL}/profile/edit?steam_error=failed`);
  }
});

// Step 3: Unlink Steam
app.delete('/api/steam/unlink', requireUser, async (req, res) => {
  await db.from('profiles').update({ steam_id: '', steam_verified: false }).eq('id', req.user.id);
  res.json({ success: true });
});

// Keep lookup for profile display
app.get('/api/steam/lookup/:steamId', requireUser, userRateLimit(10, 60 * 1000, 'steam-lookup'), async (req, res) => {
  const STEAM_KEY = process.env.STEAM_API_KEY;
  if (!STEAM_KEY) return res.status(500).json({ error: 'Steam API not configured.' });
  const { steamId } = req.params;

  // Support both SteamID64 and vanity URLs
  let resolvedId = steamId;

  // If not a 17-digit number, try resolving as vanity URL
  if (!/^\d{17}$/.test(steamId)) {
    try {
      const vanityRes = await fetchJSON(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_KEY}&vanityurl=${encodeURIComponent(steamId)}`);
      if (vanityRes?.response?.success === 1) {
        resolvedId = vanityRes.response.steamid;
      } else {
        return res.status(404).json({ error: 'Steam profile not found. Try using your SteamID64 instead.' });
      }
    } catch(e) { return res.status(500).json({ error: 'Steam API error.' }); }
  }

  try {
    const data = await fetchJSON(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_KEY}&steamids=${resolvedId}`);
    const player = data?.response?.players?.[0];
    if (!player) return res.status(404).json({ error: 'Steam profile not found.' });
    res.json({
      steamId: resolvedId,
      name: player.personaname,
      avatar: player.avatarmedium,
      profileUrl: player.profileurl,
      visibility: player.communityvisibilitystate === 3 ? 'public' : 'private',
    });
  } catch(e) { res.status(500).json({ error: 'Steam API error: ' + e.message }); }
});



// ── App settings ────────────────────────────────────────────────────────────
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  const { data } = await db.from('app_settings').select('key, value');
  const settings = {};
  (data || []).forEach(s => { settings[s.key] = s.value; });
  res.setHeader('Cache-Control', 'no-store');
  res.json(settings);
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  const { data: existing, error: selError } = await db.from('app_settings').select('key').eq('key', key).single();
  if (selError && selError.code !== 'PGRST116') {
    return res.status(500).json({ error: 'Settings table not found. Run: CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);' });
  }
  if (existing) {
    const { error } = await db.from('app_settings').update({ value: String(value) }).eq('key', key);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await db.from('app_settings').insert({ key, value: String(value) });
    if (error) return res.status(500).json({ error: error.message });
  }
  if (key === 'allowRegistration') _allowRegistrationCached = String(value) !== 'false';
  await appendModLog(req.username, 'update-setting', '-', `${key} = ${String(value)}`);
  res.json({ success: true });
});

// ── Catch-all ────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const fs = require('fs');
  const indexPath = FRONTEND_DIST ? require('path').join(FRONTEND_DIST,'index.html') : require('path').join(__dirname,'frontend','dist','index.html');
  if (!fs.existsSync(indexPath)) return next();
  const html = fs.readFileSync(indexPath, 'utf8');
  const injected = html.replace('<head>', `<head><script>window.__VERUMEN_CONFIG=${JSON.stringify({ allowRegistration: _allowRegistrationCached })}</script>`);
  res.setHeader('Content-Type', 'text/html');
  res.send(injected);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Statera server running on http://localhost:${PORT}`));