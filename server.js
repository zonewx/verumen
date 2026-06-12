require('dotenv').config();
const express = require('express');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const brotliDecompress = promisify(zlib.brotliDecompress);
const { supabase } = require('./supabase');

// In-memory price cache — populated from Supabase on startup so restarts don't force a YF burst
const _priceCache = new Map(); // ticker -> { q: quoteObject, cachedAt: timestamp }
const _fxRateCache = {};       // 'USDSEK=X' -> { rate, cachedAt }
const PRICE_CACHE_TTL      = 6  * 60 * 60 * 1000; // 6h — stale threshold for live display
const PRICE_CACHE_WARM_TTL = 24 * 60 * 60 * 1000; // 24h — how far back to load from Supabase on cold start

// ── Market close times ────────────────────────────────────────────────────────
// Used to skip YF fetches when we already hold a post-close price for a market
// that hasn't re-opened yet (price cannot have changed).
const MARKET_HOURS = {
  // Exchange suffix (uppercase after last '.') → { tz, h: closeHour, m: closeMinute }
  ST:  { tz: 'Europe/Stockholm',  h: 17, m: 30 },
  OL:  { tz: 'Europe/Oslo',       h: 16, m: 25 },
  HE:  { tz: 'Europe/Helsinki',   h: 18, m: 30 },
  CO:  { tz: 'Europe/Copenhagen', h: 17, m:  0 },
  L:   { tz: 'Europe/London',     h: 16, m: 30 },
  DE:  { tz: 'Europe/Berlin',     h: 17, m: 30 },
  F:   { tz: 'Europe/Berlin',     h: 17, m: 30 },
  PA:  { tz: 'Europe/Paris',      h: 17, m: 35 },
  AS:  { tz: 'Europe/Amsterdam',  h: 17, m: 35 },
  MI:  { tz: 'Europe/Rome',       h: 17, m: 35 },
  MC:  { tz: 'Europe/Madrid',     h: 17, m: 35 },
  SW:  { tz: 'Europe/Zurich',     h: 17, m: 30 },
  TO:  { tz: 'America/Toronto',   h: 16, m:  0 },
  AX:  { tz: 'Australia/Sydney',  h: 16, m:  0 },
  T:   { tz: 'Asia/Tokyo',        h: 15, m: 30 },
  HK:  { tz: 'Asia/Hong_Kong',    h: 16, m:  0 },
  US:  { tz: 'America/New_York',  h: 16, m:  0 }, // default for bare tickers
};

// Returns UTC ms of the most recent regular-session close for this ticker's exchange.
// Returns 0 if the market is currently inside its regular session (→ always fetch).
function lastMarketCloseUTC(ticker) {
  const dot = ticker.lastIndexOf('.');
  const suffix = dot >= 0 ? ticker.substring(dot + 1).toUpperCase() : null;
  const sched = (suffix && MARKET_HOURS[suffix]) || MARKET_HOURS.US;
  const { tz, h: ch, m: cm } = sched;
  const now = Date.now();

  for (let back = 0; back <= 4; back++) {
    const probe = new Date(now - back * 86400000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric', hour12: false,
    }).formatToParts(probe);
    const p = {};
    parts.forEach(({ type, value }) => { p[type] = value; });
    if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;

    const y = +p.year, mo = +p.month - 1, d = +p.day;
    // Find UTC ms of ch:cm on this local date via the formatToParts offset trick
    const guessUTC = Date.UTC(y, mo, d, ch, cm, 0);
    const fmtParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(new Date(guessUTC));
    const fp = {};
    fmtParts.forEach(({ type, value }) => { fp[type] = +value || 0; });
    const offsetMs = (fp.hour * 60 + fp.minute - ch * 60 - cm) * 60000;
    const closeUTC = guessUTC - offsetMs;

    if (closeUTC <= now) return closeUTC;
  }
  return 0;
}

// Returns true when the cached price is already from after the last market close —
// meaning the price cannot have changed and a YF fetch would return identical data.
function priceIsFresh(ticker, cached) {
  if (!cached?.q?.regularMarketTime) return false;
  const mktTimeMs = cached.q.regularMarketTime instanceof Date
    ? cached.q.regularMarketTime.getTime()
    : typeof cached.q.regularMarketTime === 'number'
      ? cached.q.regularMarketTime * 1000
      : new Date(cached.q.regularMarketTime).getTime();
  const lastClose = lastMarketCloseUTC(ticker);
  return lastClose > 0 && mktTimeMs >= lastClose;
}

// ── Scheduled price fetch windows ──────────────────────────────────────────
// Prices are only fetched from the API during 4 windows per trading day.
// Between windows the stale cache is served, keeping API usage minimal.

const PRICE_SCHEDULES = {
  NORDIC: { tz: 'Europe/Stockholm', hours: [9,  12, 15, 17] },
  US:     { tz: 'America/New_York',  hours: [10, 12, 14, 15] },
  LONDON: { tz: 'Europe/London',     hours: [8,  10, 13, 16] },
  EUROPE: { tz: 'Europe/Paris',      hours: [9,  12, 14, 17] },
  TOKYO:  { tz: 'Asia/Tokyo',        hours: [9,  11, 13, 15] },
  HK:     { tz: 'Asia/Hong_Kong',    hours: [10, 12, 14, 15] },
  AUS:    { tz: 'Australia/Sydney',  hours: [10, 12, 14, 15] },
};

function getPriceSchedule(yfTicker) {
  if (['.ST','.OL','.CO','.HE'].some(s => yfTicker.endsWith(s))) return PRICE_SCHEDULES.NORDIC;
  if (['.L','.IL'].some(s => yfTicker.endsWith(s))) return PRICE_SCHEDULES.LONDON;
  if (['.PA','.DE','.F','.MI','.AS','.MC','.SW','.VX'].some(s => yfTicker.endsWith(s))) return PRICE_SCHEDULES.EUROPE;
  if (yfTicker.endsWith('.T'))  return PRICE_SCHEDULES.TOKYO;
  if (yfTicker.endsWith('.HK')) return PRICE_SCHEDULES.HK;
  if (yfTicker.endsWith('.AX')) return PRICE_SCHEDULES.AUS;
  return PRICE_SCHEDULES.US;
}

// Returns the UTC timestamp when the most recent scheduled fetch window opened.
// Steps backwards one hour at a time (max 48h) until it finds a matching local hour.
function lastWindowOpenedAt(tz, hours) {
  const now = Date.now();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  for (let minsBack = 0; minsBack <= 48 * 60; minsBack += 60) {
    const t = new Date(now - minsBack * 60000);
    const parts = fmt.formatToParts(t);
    const localHour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const localMin  = parseInt(parts.find(p => p.type === 'minute').value, 10);
    if (hours.includes(localHour)) {
      // Snap to the exact start of this local hour (remove sub-hour offset)
      return t.getTime() - localMin * 60000 - (t.getSeconds() * 1000) - t.getMilliseconds();
    }
  }
  return 0; // fallback: always allow refetch
}

// Returns true when the ticker's cached price predates the current scheduled window —
// meaning a fresh fetch is warranted. Returns false to serve stale cache instead.
function shouldRefetch(yfTicker) {
  const cached = _priceCache.get(yfTicker);
  if (!cached) return true; // cold cache → always fetch
  const { tz, hours } = getPriceSchedule(yfTicker);
  return cached.cachedAt < lastWindowOpenedAt(tz, hours);
}

// Write-through helper: keeps _priceCache and Supabase price_cache in sync
function setPriceCache(ticker, data) {
  _priceCache.set(ticker, data);
  supabase.from('price_cache').upsert(
    { ticker, quote: data.q, cached_at: new Date(data.cachedAt).toISOString() },
    { onConflict: 'ticker' }
  ).then(() => {}).catch(() => {});
}

const FX_PAIRS = ['USDSEK=X','EURSEK=X','GBPSEK=X','NOKSEK=X','DKKSEK=X'];

// Load persisted prices from Supabase on startup — avoids a cold-cache YF burst after restart
;(async () => {
  try {
    const cutoff = new Date(Date.now() - PRICE_CACHE_WARM_TTL).toISOString();
    const { data } = await supabase.from('price_cache').select('ticker, quote, cached_at').gt('cached_at', cutoff);
    if (data?.length) {
      const fxSet = new Set(FX_PAIRS);
      data.forEach(({ ticker, quote, cached_at }) => {
        const cachedAt = new Date(cached_at).getTime();
        _priceCache.set(ticker, { q: quote, cachedAt });
        // Also restore FX rates into _fxRateCache so they survive restarts
        if (fxSet.has(ticker) && quote?.regularMarketPrice)
          _fxRateCache[ticker] = { rate: quote.regularMarketPrice, cachedAt };
      });
      console.log(`[price_cache] Loaded ${data.length} entries from Supabase`);
    }
  } catch(e) { console.warn('[price_cache] Failed to load from Supabase:', e.message); }

  // Bootstrap FX rates via Frankfurter on startup if not already cached.
  const missingFx = FX_PAIRS.filter(s => !_fxRateCache[s]);
  if (missingFx.length > 0) {
    try {
      const rates = await frankfurterFxRates();
      Object.entries(rates).forEach(([sym, rate]) => {
        _fxRateCache[sym] = { rate, cachedAt: Date.now() };
        setPriceCache(sym, { q: { symbol: sym, regularMarketPrice: rate }, cachedAt: Date.now() });
      });
      console.log(`[fx_rates] Bootstrapped ${Object.keys(rates).length} FX rates at startup`);
    } catch(e) { console.warn('[fx_rates] Startup FX bootstrap failed — will retry on first request:', e.message); }
  }
})();

// Simple in-memory rate limiter for auth routes
const rateLimitMap = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of rateLimitMap) if (now > v.resetAt) rateLimitMap.delete(k); }, 5 * 60 * 1000).unref();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
    record.count++;
    rateLimitMap.set(key, record);
    if (record.count > maxRequests) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
    }
    next();
  };
}
const authRateLimit = rateLimit(10, 60 * 1000); // 10 attempts per minute

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20mb' }));

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

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const cacheSnapshot = {};
  _marketIndexCache.forEach((v, k) => { cacheSnapshot[k] = { price: v.price, ageMs: Date.now() - v.ts }; });
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), ts: new Date().toISOString(), indexCache: cacheSnapshot });
});

// Connectivity diagnostic — tests US (Finnhub) + Nordic (Twelve Data fallback)
app.get('/api/diag/yf', async (req, res) => {
  const [usResult, nordicResult] = await Promise.all([
    finnhubQuote('AAPL').then(q => ({ ok: !!q?.regularMarketPrice, price: q?.regularMarketPrice, source: 'finnhub' })).catch(e => ({ ok: false, error: e?.message })),
    finnhubQuote('VOLV-B.ST').then(q => ({ ok: !!q?.regularMarketPrice, price: q?.regularMarketPrice, source: 'tiingo' })).catch(e => ({ ok: false, error: e?.message })),
  ]);
  res.json({ finnhubKeySet: !!FINNHUB_KEY, tiingoKeySet: !!TIINGO_KEY, us: usResult, nordic: nordicResult });
});

// ── Auth middleware ─────────────────────────────────────────────────────────
async function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired session' });
  req.user = user;
  const { data: profile } = await supabase.from('profiles').select('username, role').eq('id', user.id).single();
  if (!profile) return res.status(401).json({ error: 'Profile not found' });
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
  const [{ count }, { data: settings }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('app_settings').select('key, value'),
  ]);
  const s = {};
  (settings || []).forEach(r => { s[r.key] = r.value; });
  const allowRegistration = s.allowRegistration !== 'false';
  const userLimit = parseInt(s.userLimit || '0', 10);
  const reachedLimit = userLimit > 0 && (count || 0) >= userLimit;
  res.json({ hasUsers: (count || 0) > 0, allowRegistration, userLimit, reachedLimit });
});

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { username, password, country } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const { data: regSetting } = await supabase.from('app_settings').select('value').eq('key', 'allowRegistration').single();
  if (regSetting && regSetting.value === 'false') return res.status(403).json({ error: 'Registration is currently disabled.' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) return res.status(400).json({ error: 'Username must be 3-20 characters, letters/numbers/underscore only.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const { data: existing } = await supabase.from('profiles').select('id').eq('username', username.trim()).single();
  if (existing) return res.status(400).json({ error: 'Username already taken.' });
  const [{ count }, { data: limitSetting }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('app_settings').select('value').eq('key', 'userLimit').single(),
  ]);
  const userLimit = parseInt(limitSetting?.value || '0', 10);
  if (userLimit > 0 && count >= userLimit) return res.status(400).json({ error: `User limit of ${userLimit} reached.` });
  const email = `${username.trim().toLowerCase()}@statera.local`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError) return res.status(400).json({ error: authError.message });
  const role = username.trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  const { error: profileError } = await supabase.from('profiles').insert({ id: authData.user.id, username: username.trim(), role, bio: '', steam_id: '', public_inventory: false, public_holdings: false, country: country || 'se' });
  if (profileError) return res.status(500).json({ error: profileError.message });
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return res.status(500).json({ error: signInError.message });
  res.json({ success: true, username: username.trim(), role, token: signInData.session.access_token, refreshToken: signInData.session.refresh_token });
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const email = `${username.trim().toLowerCase()}@statera.local`;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid username or password.' });
  const { data: profile } = await supabase.from('profiles').select('username, role').eq('id', data.user.id).single();
  res.json({ success: true, username: profile.username, role: profile.role, token: data.session.access_token, refreshToken: data.session.refresh_token });
});

app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  res.json({ token: data.session.access_token, refreshToken: data.session.refresh_token });
});

app.post('/api/auth/change-password', requireUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const email = `${req.username.toLowerCase()}@statera.local`;
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) return res.status(401).json({ error: 'Current password is incorrect.' });
  const { error } = await supabase.auth.admin.updateUserById(req.user.id, { password: newPassword });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/auth/verify-password', requireUser, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required.' });
  const email = `${req.username.toLowerCase()}@statera.local`;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Incorrect password.' });
  res.json({ success: true });
});

// ── Profile routes ──────────────────────────────────────────────────────────
app.get('/api/users', requireUser, async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('username, role, bio, public_inventory, public_holdings, public_dividends, avatar_base64, created_at, steam_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(p => ({ username: p.username, role: p.role, bio: p.bio, publicInventory: p.public_inventory, publicHoldings: p.public_holdings, publicDividends: p.public_dividends, steamId: p.public_inventory ? p.steam_id : null, steamLevel: p.public_inventory ? (p.steam_level || 0) : null, showcaseItems: p.public_inventory ? (p.showcase_items || []) : [], avatarBase64: p.avatar_base64 || null, createdAt: p.created_at })));
});

app.get('/api/users/:username/profile', async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('*').eq('username', req.params.username).single();
  if (error || !data) return res.status(404).json({ error: 'User not found' });
  res.json({ username: data.username, role: data.role, bio: data.bio, country: data.country || 'se', publicInventory: data.public_inventory, publicHoldings: data.public_holdings, publicDividends: data.public_dividends, publicCsTrades: data.public_cs_trades || false, showPortfolioValue: data.show_portfolio_value, steamId: data.steam_verified ? (data.steam_id || null) : null, steamVerified: data.steam_verified || false, steamLevel: data.steam_verified ? (data.steam_level || 0) : 0, showcaseItems: data.showcase_items || [], avatarBase64: data.avatar_base64, createdAt: data.created_at });
});

app.put('/api/users/:username/profile', requireUser, async (req, res) => {
  if (req.username !== req.params.username) return res.status(403).json({ error: "Cannot edit another user's profile." });
  const { bio, steamId, publicInventory, publicHoldings, publicDividends, publicCsTrades, showPortfolioValue, avatarBase64, showcaseItems, country } = req.body;
  const update = {};
  if (bio !== undefined) { if (typeof bio === 'string' && bio.length > 500) return res.status(400).json({ error: 'Bio must be 500 characters or fewer.' }); update.bio = bio; }
  if (country !== undefined) update.country = country;
  if (steamId !== undefined) { update.steam_id = steamId; if (steamId !== (await supabase.from('profiles').select('steam_id').eq('id', req.user.id).single()).data?.steam_id) update.steam_verified = false; }
  if (publicInventory !== undefined) update.public_inventory = publicInventory;
  if (publicHoldings !== undefined) update.public_holdings = publicHoldings;
  if (publicDividends !== undefined) update.public_dividends = publicDividends;
  if (publicCsTrades !== undefined) update.public_cs_trades = publicCsTrades;
  if (showPortfolioValue !== undefined) update.show_portfolio_value = showPortfolioValue;
  if (avatarBase64 !== undefined) {
    if (avatarBase64 && avatarBase64.length > 1.5 * 1024 * 1024) return res.status(400).json({ error: 'Avatar too large. Maximum 1.5 MB.' });
    update.avatar_base64 = avatarBase64;
  }
  if (showcaseItems !== undefined) {
    const items = Array.isArray(showcaseItems) ? showcaseItems.slice(0, 10) : [];
    update.showcase_items = items;
  }
  const { data, error } = await supabase.from('profiles').update(update).eq('id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, profile: { username: data.username, bio: data.bio, country: data.country, steamId: data.steam_id, publicInventory: data.public_inventory, publicHoldings: data.public_holdings, publicDividends: data.public_dividends, showPortfolioValue: data.show_portfolio_value, avatarBase64: data.avatar_base64, showcaseItems: data.showcase_items, steamLevel: data.steam_level } });
});

// Change username
app.put('/api/users/:username/username', requireUser, async (req, res) => {
  if (req.username !== req.params.username) return res.status(403).json({ error: "Cannot edit another user's profile." });
  const { newUsername } = req.body;
  if (!newUsername) return res.status(400).json({ error: 'Username is required.' });
  // Validate format: 3-20 chars, letters/numbers/underscores only
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) return res.status(400).json({ error: 'Username must be 3-20 characters and contain only letters, numbers, and underscores.' });
  // Check uniqueness (case-insensitive)
  const { data: existing } = await supabase.from('profiles').select('id').ilike('username', newUsername).single();
  if (existing && existing.id !== req.user.id) return res.status(409).json({ error: 'Username is already taken.' });
  const { data, error } = await supabase.from('profiles').update({ username: newUsername }).eq('id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, username: data.username });
});

app.get('/api/users/:username/holdings', async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('id, public_holdings').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  if (!profile.public_holdings) return res.status(403).json({ error: "This user's holdings are private." });
  const { data: txs } = await supabase.from('transactions').select('ticker, raw_ticker, quantity, price, type, name, currency').eq('user_id', profile.id).in('type', ['buy', 'sell', 'other', 'withdrawal']);
  const trades = (txs || []).map(t => ({ ...t, ticker: (t.ticker || t.raw_ticker || '').trim(), quantity: Math.abs(t.quantity || 0) })).filter(t => t.ticker && t.quantity > 0);
  
  const holdings = {};
  for (const tx of trades) {
    if (!holdings[tx.ticker]) holdings[tx.ticker] = { ticker: tx.ticker, name: tx.name, currency: tx.currency, quantity: 0, totalCost: 0 };
    const h = holdings[tx.ticker];
    if (tx.type === 'buy') { h.totalCost += tx.quantity * (tx.price || 0); h.quantity += tx.quantity; }
    else if (tx.type === 'sell') { const avg = h.quantity > 0 ? h.totalCost / h.quantity : 0; h.totalCost = Math.max(0, h.totalCost - tx.quantity * avg); h.quantity -= tx.quantity; }
    else if ((tx.type === 'other' || tx.type === 'withdrawal') && tx.price === 0) { h.quantity += (tx.type === 'other' ? tx.quantity : -tx.quantity); }
  }
  
  const validHoldings = Object.values(holdings).filter(h => h.quantity > 0.001).map(h => ({ ...h, quantity: Math.floor(h.quantity) }));
  
  // Fetch current prices for all holdings
  const tickers = validHoldings.map(h => h.ticker);
  let pricesMap = {};
  if (tickers.length > 0) {
    await Promise.allSettled(tickers.map(async t => {
      try {
        const q = await finnhubQuote(t);
        if (q?.regularMarketPrice) pricesMap[t] = q.regularMarketPrice;
      } catch {}
    }));
  }
  
  // Calculate values and weights
  let totalValue = 0;
  validHoldings.forEach(h => {
    const price = pricesMap[h.ticker] || 0;
    h.value = price > 0 ? Math.round(price * h.quantity) : null;
    if (h.value) totalValue += h.value;
  });
  
  validHoldings.forEach(h => {
    h.weight = totalValue > 0 && h.value ? (h.value / totalValue) * 100 : 0;
  });
  
  // Sort by weight descending
  validHoldings.sort((a, b) => b.weight - a.weight);
  
  res.json({ holdings: validHoldings });
});

app.get('/api/users/:username/inventory', async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('id, public_inventory, steam_id').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  if (!profile.public_inventory || !profile.steam_id) return res.status(403).json({ error: "This user's inventory is private." });
  try {
    const data = await fetchJSON(`https://steamcommunity.com/inventory/${profile.steam_id}/730/2?l=english&count=500`);
    if (!data?.assets) return res.status(404).json({ error: 'Inventory not found or private on Steam' });
    const descMap = {};
    (data.descriptions || []).forEach(d => { descMap[`${d.classid}_${d.instanceid}`] = d; });
    const names = (data.assets || []).map(a => { const d = descMap[`${a.classid}_${a.instanceid}`]; return d?.market_hash_name || d?.name || 'Unknown'; }).filter(n => n !== 'Unknown');
    const { data: prices } = await supabase.from('cs_price_cache').select('skin_name, price_sek').in('skin_name', names);
    const priceMap = {};
    (prices || []).forEach(p => { priceMap[p.skin_name] = p.price_sek; });
    const items = (data.assets || []).map(asset => {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`];
      const name = desc?.market_hash_name || desc?.name || 'Unknown';
      return { name, iconUrl: desc?.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/128x128` : null, type: desc?.type || '', priceSEK: priceMap[name] || 0 };
    }).filter(i => i.name !== 'Unknown');
    res.json({ items, totalValue: items.reduce((s, i) => s + i.priceSEK, 0), count: items.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Global ISIN cache ────────────────────────────────────────────────────────
// Shared across all users. Any successful ISIN→ticker resolution is stored here
// so future imports by any user skip Yahoo Finance entirely for that ISIN.
//
// One-time Supabase SQL (run in the SQL editor):
//   CREATE TABLE IF NOT EXISTS global_isin_cache (
//     isin TEXT PRIMARY KEY,
//     ticker TEXT NOT NULL,
//     updated_at TIMESTAMPTZ DEFAULT NOW()
//   );
async function loadGlobalIsinCache(isins) {
  if (!isins?.length) return {};
  try {
    const { data } = await supabase.from('global_isin_cache').select('isin, ticker').in('isin', isins);
    const map = {};
    (data || []).forEach(r => { if (r.ticker) map[r.isin] = r.ticker; });
    return map;
  } catch { return {}; }
}
async function saveGlobalIsinCache(isin, ticker) {
  if (!isin || !ticker) return;
  try {
    await supabase.from('global_isin_cache')
      .upsert({ isin, ticker, updated_at: new Date().toISOString() }, { onConflict: 'isin' });
  } catch {}
}

// ── Ticker cache/overrides helpers ──────────────────────────────────────────
async function loadTickerCache(userId) {
  const { data } = await supabase.from('ticker_cache').select('cache_key, ticker').eq('user_id', userId);
  const cache = {};
  (data || []).forEach(r => { cache[r.cache_key] = r.ticker; });
  return cache;
}
async function saveTickerCacheEntry(userId, key, ticker) {
  if (!ticker) return;
  await supabase.from('ticker_cache').upsert({ user_id: userId, cache_key: key, ticker, updated_at: new Date().toISOString() });
}
async function loadOverrides(userId) {
  const [{ data: global }, { data: user }] = await Promise.all([
    supabase.from('global_ticker_overrides').select('isin, ticker').eq('active', true),
    supabase.from('ticker_overrides').select('isin, ticker').eq('user_id', userId),
  ]);
  const overrides = {};
  // Per-user loaded first, then global overwrites — global always wins
  (user || []).forEach(r => { overrides[r.isin] = r.ticker; });
  (global || []).forEach(r => { overrides[r.isin] = r.ticker; });
  return overrides;
}

// ── Shared name cleaner (used by portfolio builder and dividend resolver) ────
const cleanYFName = (name) => {
  if (!name) return name;
  return name
    .replace(/\s*\(publ\.?\)/gi, '')
    .replace(/\s*\(AB\)/gi, '')
    .replace(/\bAB\b(?!\w)/gi, '')
    .replace(/\bpubl\.?\b/gi, '')
    .replace(/\b(ASA|AS|A\/S|SE|Inc\.?|Corp\.?|Ltd\.?|Limited|PLC|N\.V\.|S\.A\.|GmbH|AG)\b/gi, '')
    .replace(/\s*[.,;]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// ── Ticker resolution ───────────────────────────────────────────────────────

// Currency suffix priority lists for Yahoo Finance
const CURRENCY_SUFFIX_MAP = {
  SEK: ['.ST', '-B.ST', '-A.ST', '-C.ST', '-D.ST', '-PREF.ST', '-BTF.ST'],
  NOK: ['.OL'],
  DKK: ['.CO'],
  EUR: ['.HE', '.AS', '.PA', '.DE', '.F', '.MI', '.MC', '.BR', '.LS', '.VI', '.WA'],
  GBP: ['.L', '.IL'],
  CHF: ['.SW', '.VX'],
  CAD: ['.TO', '.V', '.CN'],
  AUD: ['.AX'],
  HKD: ['.HK'],
  JPY: ['.T'],
  SGD: ['.SI'],
};

// ISIN country prefix → currency (expanded)
const ISIN_CURRENCY_MAP = {
  SE: 'SEK', NO: 'NOK', DK: 'DKK', FI: 'EUR', IS: 'EUR',
  DE: 'EUR', FR: 'EUR', NL: 'EUR', BE: 'EUR', IT: 'EUR',
  ES: 'EUR', PT: 'EUR', AT: 'EUR', IE: 'EUR', LU: 'EUR',
  GB: 'GBP', CH: 'CHF', US: 'USD', CA: 'CAD', AU: 'AUD',
  HK: 'HKD', JP: 'JPY', SG: 'SGD', CN: 'CNY',
};

// ── Finnhub (US prices) + Tiingo (international EOD) + Frankfurter (FX) ──
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
if (!FINNHUB_KEY) log.warn('FINNHUB_API_KEY not set — live price fetching will fail');
const TIINGO_KEY = process.env.TIINGO_API_KEY || '';
if (!TIINGO_KEY) log.warn('TIINGO_API_KEY not set — Nordic/international price fetching will fail');

// Yahoo Finance exchange suffix → Finnhub MIC exchange code
const YF_TO_FH_EXCHANGE = {
  '.ST':':XSTO', '.OL':':XOSL', '.CO':':XCSE', '.HE':':XHEL',
  '.L':':XLON',  '.IL':':XLON', '.PA':':XPAR', '.DE':':XETR',
  '.F':':XFRA',  '.MI':':XMIL', '.AS':':XAMS', '.MC':':XMAD',
  '.SW':':XSWX', '.VX':':XSWX', '.TO':':XTSE', '.V':':XTSE',
  '.AX':':XASX', '.HK':':XHKG', '.T':':XTKS',  '.SI':':XSES',
};
const FH_TO_YF_EXCHANGE = Object.fromEntries(
  Object.entries(YF_TO_FH_EXCHANGE).map(([yf, fh]) => [fh, yf])
);

function toFinnhubSymbol(yfTicker) {
  if (!yfTicker) return yfTicker;
  if (yfTicker.startsWith('^')) return yfTicker; // index symbols pass through
  for (const [yfSfx, fhSfx] of Object.entries(YF_TO_FH_EXCHANGE)) {
    if (yfTicker.endsWith(yfSfx)) return yfTicker.slice(0, -yfSfx.length) + fhSfx;
  }
  return yfTicker;
}

function toYFSymbol(fhSymbol) {
  if (!fhSymbol) return fhSymbol;
  for (const [fhSfx, yfSfx] of Object.entries(FH_TO_YF_EXCHANGE)) {
    if (fhSymbol.endsWith(fhSfx)) return fhSymbol.slice(0, -fhSfx.length) + yfSfx;
  }
  return fhSymbol;
}

function currencyFromTicker(ticker) {
  if (!ticker) return 'USD';
  for (const [currency, suffixes] of Object.entries(CURRENCY_SUFFIX_MAP)) {
    if (suffixes.some(s => ticker.endsWith(s))) return currency;
  }
  return 'USD';
}

async function finnhubFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://finnhub.io/api/v1${path}${sep}token=${FINNHUB_KEY}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw Object.assign(new Error(`Finnhub HTTP ${r.status}`), { status: r.status });
  return r.json();
}

// Fallback for exchanges Finnhub free tier doesn't cover (Nordic, European, etc.)
// Tiingo EOD daily prices — free tier covers international stocks, works from cloud.
// Uses lowercase Yahoo Finance-format tickers: volv-b.st, equinor.ol
async function tiingoQuote(yfTicker) {
  if (!TIINGO_KEY) return null;
  const d1 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const r = await fetch(
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(yfTicker.toLowerCase())}/prices?startDate=${d1}&token=${TIINGO_KEY}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (r.status === 429) { log.warn('Tiingo rate limit hit', { ticker: yfTicker }); return null; }
  if (!r.ok) throw new Error(`Tiingo HTTP ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const latest = data[data.length - 1];
  const price = latest?.close ?? latest?.adjClose;
  if (!price) return null;
  const prevClose = data.length > 1 ? (data[data.length - 2]?.close ?? null) : null;
  const cached = _priceCache.get(yfTicker);
  return {
    symbol: yfTicker,
    regularMarketPrice: price,
    regularMarketPreviousClose: prevClose,
    regularMarketTime: Math.floor(new Date(latest.date).getTime() / 1000),
    regularMarketChangePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
    regularMarketChange: prevClose ? price - prevClose : null,
    currency: currencyFromTicker(yfTicker),
    longName:  cached?.q?.longName  || null,
    shortName: cached?.q?.shortName || null,
    sector:    cached?.q?.sector    || null,
    quoteType: cached?.q?.quoteType || 'EQUITY',
  };
}

// Returns a YF-compatible quote object. Preserves name/sector from existing cache
// so repeated fetches don't lose metadata that Finnhub's /quote doesn't return.
// Falls back to Tiingo when Finnhub returns no data (free tier covers US only).
async function finnhubQuote(yfTicker) {
  const fhSymbol = toFinnhubSymbol(yfTicker);
  const data = await finnhubFetch(`/quote?symbol=${encodeURIComponent(fhSymbol)}`);
  if (!data?.c) return tiingoQuote(yfTicker); // Finnhub no-data → try Tiingo
  const cached = _priceCache.get(yfTicker);
  return {
    symbol: yfTicker,
    regularMarketPrice: data.c,
    regularMarketPreviousClose: data.pc,
    regularMarketTime: data.t,
    regularMarketChangePercent: data.dp,
    regularMarketChange: data.d,
    currency: currencyFromTicker(yfTicker),
    longName:  cached?.q?.longName  || null,
    shortName: cached?.q?.shortName || null,
    sector:    cached?.q?.sector    || null,
    quoteType: cached?.q?.quoteType || 'EQUITY',
  };
}

// Returns company name for a YF-format ticker.
// Tries Finnhub profile2 first; falls back to Tiingo metadata (covers European stocks
// that Finnhub free tier doesn't serve via profile2).
async function finnhubName(yfTicker) {
  try {
    const fhSymbol = toFinnhubSymbol(yfTicker);
    const p = await finnhubFetch(`/stock/profile2?symbol=${encodeURIComponent(fhSymbol)}`);
    if (p?.name) return cleanYFName(p.name);
  } catch {}
  // Tiingo fallback — free tier covers international stocks
  if (TIINGO_KEY) {
    try {
      const r = await fetch(
        `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(yfTicker.toLowerCase())}?token=${TIINGO_KEY}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const d = await r.json();
        if (d?.name) return cleanYFName(d.name);
      }
    } catch {}
  }
  return null;
}

// Batch ISIN → company name via OpenFIGI (free, no key required, global coverage).
// Returns map of { isin: displayName }.
async function openFigiNames(isins) {
  if (!isins.length) return {};
  try {
    const r = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isins.map(isin => ({ idType: 'ID_ISIN', idValue: isin }))),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return {};
    const results = await r.json();
    const map = {};
    results.forEach((result, i) => {
      const raw = result?.data?.[0]?.name;
      if (!raw) return;
      // OpenFIGI returns all-caps; title-case multi-char words for readability
      const cased = raw.split(' ').map(w =>
        w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w
      ).join(' ');
      map[isins[i]] = cleanYFName(cased);
    });
    return map;
  } catch { return {}; }
}

// Returns { 'USDSEK=X': 10.93, 'EURSEK=X': 11.52, ... }
async function frankfurterFxRates() {
  const r = await fetch('https://api.frankfurter.app/latest?base=SEK&symbols=USD,EUR,GBP,NOK,DKK', {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Frankfurter HTTP ${r.status}`);
  const data = await r.json();
  const result = {};
  for (const [cur, rate] of Object.entries(data.rates || {})) {
    if (rate) result[`${cur}SEK=X`] = parseFloat((1 / rate).toFixed(6));
  }
  return result;
}

async function finnhubSearch(query) {
  const data = await finnhubFetch(`/search?q=${encodeURIComponent(query)}`);
  return (data?.result || []);
}

function getEffectiveCurrency(currency, isin, broker) {
  // For Avanza/Nordnet, the currency column IS the instrument currency — trust it
  if (broker === 'avanza' || broker === 'nordnet') return currency || (isin ? ISIN_CURRENCY_MAP[isin.substring(0, 2)] : null) || 'USD';
  
  // For Montrose: kursvaluta is the trading currency
  // Swedish stocks have SEK, US stocks have USD, etc.
  // Only fall back to ISIN if currency is missing
  if (broker === 'montrose') {
    if (currency && currency !== 'SEK') return currency; // USD, EUR, etc. → use it
    return 'SEK'; // Default to SEK for Swedish trading
  }
  
  // Generic fallback
  if (currency && currency !== '-') return currency;
  if (isin) {
    const prefix = isin.substring(0, 2).toUpperCase();
    if (ISIN_CURRENCY_MAP[prefix]) return ISIN_CURRENCY_MAP[prefix];
  }
  return currency || 'SEK';
}

// Wraps an async factory fn with timeout + one retry for transient failures.
// Never retries 429s — those need a full cooldown pause at the batch level.
async function withYFRetry(fn, ms = 8000, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let timer;
      return await Promise.race([
        Promise.resolve().then(fn),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('YF timeout')), ms); }),
      ]).finally(() => clearTimeout(timer));
    } catch(e) {
      const isRateLimit = e?.status === 429 || /429|Too Many Requests/i.test(e?.message || '');
      if (isRateLimit || attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
  }
}

function cleanRawTicker(raw) {
  if (!raw) return null;
  let cleaned = raw.trim().toUpperCase();
  // Strip Reuters exchange codes (.N=NYSE, .O/.OQ=NASDAQ, .K=AMEX) and Nordnet-style .US
  // These don't exist on Yahoo Finance; valid YF suffixes (.ST, .OL, .L, .HE etc.) are kept
  cleaned = cleaned.replace(/\.(?:N|O|OQ|NQ|NY|K|US)$/, '');
  cleaned = cleaned.replace(/\s+/g, '-').replace(/[^A-Z0-9\-\.]/g, '');
  return cleaned || null;
}

// Batch resolver — loads cache/overrides once, resolves many tickers
async function resolveSymbolBatch(transactions, userId) {
  const [cache, overrides] = await Promise.all([
    loadTickerCache(userId),
    loadOverrides(userId),
  ]);

  const results = {};
  // Deduplicate: group by cache key so each unique stock makes YF calls only once.
  const pending = new Map(); // cacheKey → { tx, ids[] }

  // Pre-load global ISIN cache for all ISINs in this batch in a single round-trip
  const allIsins = [...new Set(transactions.map(t => t.isin).filter(Boolean))];
  const globalIsins = await loadGlobalIsinCache(allIsins);

  for (const tx of transactions) {
    const overrideKey = tx.isin || tx.raw_ticker;
    if (overrideKey && overrides[overrideKey]) { results[tx.id] = overrides[overrideKey]; continue; }
    const cacheKey = `${tx.broker || ''}|${tx.currency || ''}|${tx.isin || tx.raw_ticker || tx.name}`;
    if (cache[cacheKey] !== undefined) { results[tx.id] = cache[cacheKey]; continue; }
    // Global ISIN cache hit — no YF call needed; backfill per-user cache for next import
    if (tx.isin && globalIsins[tx.isin]) {
      results[tx.id] = globalIsins[tx.isin];
      cache[cacheKey] = globalIsins[tx.isin];
      saveTickerCacheEntry(userId, cacheKey, globalIsins[tx.isin]).catch(() => {});
      continue;
    }
    if (!pending.has(cacheKey)) pending.set(cacheKey, { tx, ids: [] });
    pending.get(cacheKey).ids.push(tx.id);
  }

  console.log(`[resolveSymbolBatch] ${transactions.length} txs → ${pending.size} need YF (${transactions.length - pending.size} pre-resolved)`);

  let delayMs = 350;
  let yfBackoff = 0; // extra ms added after rate-limited tickers; compounds on bursts, recovers on success
  let resolved = 0;
  const pendingList = Array.from(pending.entries());

  for (const [, { tx, ids }] of pendingList) {
    const ctx = { apiCalls: 0, rateLimited: false };
    const ticker = await resolveSymbolWithContext(
      tx.raw_ticker || null, tx.isin, tx.name, tx.currency, tx.broker,
      userId, cache, overrides, ctx, globalIsins
    );
    for (const id of ids) results[id] = ticker;
    resolved++;

    if (ctx.rateLimited) {
      // Compound backoff: 5s → 10s → 20s → 30s cap. Applies as extra delay after the current
      // ticker so the next request waits longer — avoids stacking a fixed 30s per-ticker pause.
      yfBackoff = Math.min(30000, Math.max(yfBackoff * 2, 5000));
      delayMs = Math.min(2000, delayMs * 3);
      console.log(`[resolveSymbolBatch] Rate limited — backoff=${yfBackoff}ms, delay=${delayMs}ms`);
    } else if (ctx.apiCalls > 0 && yfBackoff > 0) {
      yfBackoff = Math.max(0, yfBackoff - 2000); // slowly recover after successful calls
    }

    if (resolved % 10 === 0 || resolved === pendingList.length) {
      console.log(`[resolveSymbolBatch] Progress: ${resolved}/${pendingList.length}`);
    }

    // Only pace when we actually called Yahoo Finance; instant cache hits need no delay
    if (ctx.apiCalls > 0) {
      await new Promise(r => setTimeout(r, delayMs + yfBackoff));
    }
  }

  return results;
}

async function resolveSymbol(rawTicker, isin, name, currency, broker, userId) {
  const [cache, overrides] = await Promise.all([loadTickerCache(userId), loadOverrides(userId)]);
  const globalIsins = await loadGlobalIsinCache(isin ? [isin] : []);
  return resolveSymbolWithContext(rawTicker, isin, name, currency, broker, userId, cache, overrides, null, globalIsins);
}

// ctx = { apiCalls: number, rateLimited: boolean } — tracks YF calls made so the batch
// loop knows whether to insert a pacing delay. globalIsins is the pre-loaded shared cache.
async function resolveSymbolWithContext(rawTicker, isin, name, currency, broker, userId, cache, overrides, ctx = null, globalIsins = {}) {
  // 1. Manual override wins always
  const overrideKey = isin || rawTicker;
  if (overrideKey && overrides[overrideKey]) return overrides[overrideKey];

  // 2. Per-user cache hit
  const cacheKey = `${broker || ''}|${currency || ''}|${isin || rawTicker || name}`;
  if (cache[cacheKey] !== undefined) return cache[cacheKey];

  const save = async (symbol) => {
    if (symbol) {
      await saveTickerCacheEntry(userId, cacheKey, symbol);
      cache[cacheKey] = symbol;
      // Propagate to global ISIN cache so future users skip YF entirely for this ISIN
      if (isin) {
        globalIsins[isin] = symbol;
        saveGlobalIsinCache(isin, symbol).catch(() => {});
      }
    }
    return symbol;
  };

  // 3. Global ISIN cache — resolved by any user previously, zero YF calls needed
  if (isin && globalIsins[isin]) return save(globalIsins[isin]);

  const effectiveCurrency = getEffectiveCurrency(currency, isin, broker);
  const isinPrefix = isin ? isin.substring(0, 2).toUpperCase() : null;

  // Dual-listing detection: CA companies often dual-list on TSX and NYSE
  const rawCurrency = (currency || '').toUpperCase();
  const isCanadianInUS = isinPrefix === 'CA' && (rawCurrency === 'USD' || effectiveCurrency === 'USD');
  const preferUSListing = effectiveCurrency === 'USD' || isinPrefix === 'US' || isCanadianInUS;
  const preferredSuffixes = preferUSListing ? [] : (CURRENCY_SUFFIX_MAP[effectiveCurrency] || []);

  // For Avanza/Nordnet: probe .ST first for cross-listed internationals (e.g. AZN, BRK)
  const nordicNativeIsin = ['SE', 'NO', 'DK', 'FI'].includes(isinPrefix);
  const nordicProbe = (broker === 'avanza' || broker === 'nordnet')
    && !isCanadianInUS && isinPrefix !== 'US' && !nordicNativeIsin
    && !preferredSuffixes.includes('.ST');

  const cleaned = cleanRawTicker(rawTicker);
  const rawFirstWord = rawTicker ? rawTicker.trim().split(/\s+/)[0] : null;
  const firstWord = rawFirstWord ? cleanRawTicker(rawFirstWord) : null;
  const variants = [...new Set([cleaned, firstWord].filter(Boolean))];

  const verifyQuote = async (symbol) => {
    if (ctx) ctx.apiCalls++;
    try {
      const q = await finnhubQuote(symbol);
      if (q?.regularMarketPrice != null) {
        setPriceCache(symbol, { q, cachedAt: Date.now() });
        return symbol;
      }
    } catch(e) {
      if (e?.status === 429 || e?.status === 403) { if (ctx) ctx.rateLimited = true; return null; }
    }
    return null;
  };

  // 4a. Avanza/Nordnet: probe .ST before trusting the CSV currency
  if (nordicProbe && variants.length) {
    for (const v of variants) {
      const result = await verifyQuote(`${v}.ST`);
      if (result) return save(result);
    }
  }

  // 4b. Fast path: ticker + preferred suffixes.
  // When an ISIN is available, only try the primary suffix — if it doesn't match exactly
  // (e.g. "VOLVO B" vs "VOLV-B.ST") the ISIN search below is more reliable.
  if (!preferUSListing && variants.length && preferredSuffixes.length) {
    const suffixesToTry = isin ? preferredSuffixes.slice(0, 1) : preferredSuffixes;
    for (const suffix of suffixesToTry) {
      for (const v of variants) {
        const result = await verifyQuote(`${v}${suffix}`);
        if (result) return save(result);
      }
    }
  }

  // 4c. US direct ticker
  if (preferUSListing && variants.length) {
    for (const v of variants) {
      const result = await verifyQuote(v);
      if (result) return save(result);
    }
  }

  // 5. ISIN search — unambiguous, scores candidates by preferred exchange
  if (isin && !ctx?.rateLimited) {
    try {
      if (ctx) ctx.apiCalls++;
      const fhResults = await finnhubSearch(isin);
      const quotes = fhResults.filter(r => r.symbol).map(r => ({ symbol: toYFSymbol(r.symbol) }));
      if (quotes.length) {
        const scored = quotes.map(q => {
          let score = 0;
          if (preferredSuffixes.some(s => q.symbol.endsWith(s))) score += 100;
          if (nordicProbe && q.symbol.endsWith('.ST')) score += 200;
          if (preferUSListing && !q.symbol.includes('.')) score += 50;
          if (isCanadianInUS && !q.symbol.includes('.')) score += 200;
          if (isCanadianInUS && q.symbol.endsWith('.TO')) score -= 100;
          if (preferUSListing && q.symbol.includes('.') && !(nordicProbe && q.symbol.endsWith('.ST'))) score -= 100;
          return { symbol: q.symbol, score };
        }).sort((a, b) => b.score - a.score);
        const best = scored[0];
        const hasPreference = preferredSuffixes.length > 0 || preferUSListing;
        if (!hasPreference || best.score > 0) return save(best.symbol);

        // 5b. ISIN search found listings on other exchanges but not the preferred one.
        // Derive the base ticker from what was found (e.g. AZN from AZN.L) and probe
        // with the preferred suffix (e.g. AZN.ST). Handles stocks like AstraZeneca where
        // the Swedish SDR has a different ISIN from the underlying share.
        if (preferredSuffixes.length > 0 && !ctx?.rateLimited) {
          for (const hit of quotes.slice(0, 3)) {
            const base = hit.symbol.replace(/\.[A-Z0-9]{1,4}$/, '');
            if (!base || base.length < 2) continue;
            for (const suffix of preferredSuffixes.slice(0, 1)) {
              const probed = await verifyQuote(`${base}${suffix}`);
              if (probed) return save(probed);
            }
          }
        }
      }
    } catch(e) {
      if (e?.status === 429 || e?.status === 403) { if (ctx) ctx.rateLimited = true; }
    }
  }

  // 6. Ticker-string search (e.g. Nordnet exports "HACKSAW" but Finnhub symbol is "HACK:XSTO")
  if (cleaned?.length >= 3 && !ctx?.rateLimited) {
    try {
      if (ctx) ctx.apiCalls++;
      const fhResults = await finnhubSearch(cleaned);
      const quotes = fhResults.filter(r => r.symbol).map(r => ({ symbol: toYFSymbol(r.symbol) }));
      if (quotes.length) {
        const preferred = quotes.find(q => preferredSuffixes.some(s => q.symbol.endsWith(s)));
        if (preferred) return save(preferred.symbol);
        if (preferUSListing) {
          const first = quotes[0];
          if (!first.symbol.includes('.')) return save(first.symbol);
        }
      }
    } catch(e) {
      if (e?.status === 429 || e?.status === 403) { if (ctx) ctx.rateLimited = true; }
    }
  }

  // 7. Name-based search as last resort
  if (name?.length > 2 && !ctx?.rateLimited) {
    try {
      if (ctx) ctx.apiCalls++;
      const searchName = name.split(/\s+/).slice(0, 3).join(' ');
      const fhResults = await finnhubSearch(searchName);
      const quotes = fhResults.filter(r => r.symbol).map(r => ({ symbol: toYFSymbol(r.symbol) }));
      if (quotes.length) {
        const preferred = quotes.find(q => preferredSuffixes.some(s => q.symbol.endsWith(s)));
        if (preferred) return save(preferred.symbol);
        const first = quotes[0];
        if (preferUSListing && !first.symbol.includes('.')) return save(first.symbol);
        if (!preferUSListing && preferredSuffixes.some(s => first.symbol.endsWith(s))) return save(first.symbol);
      }
    } catch(e) {
      if (e?.status === 429 || e?.status === 403) { if (ctx) ctx.rateLimited = true; }
    }
  }

  // 8. Last resort for US/CA listings: if cleaned ticker is a bare alphanumeric symbol
  // (e.g. "BN" from "BN.N" after Reuters-suffix strip), store it without YF verification.
  // fetchQuote in /api/portfolio will confirm the price; better than returning null which
  // leaves ticker='' and forces the client to fall back to the raw Reuters-suffixed form.
  if (preferUSListing && cleaned && /^[A-Z][A-Z0-9]{0,6}$/.test(cleaned)) {
    return save(cleaned);
  }

  return save(null);
}

// ── CSV parsers ─────────────────────────────────────────────────────────────
function parseMontrose(content) {
  // Fix common encoding issues: Latin-1 interpreted as UTF-8
  const fixEncoding = (str) => {
    if (!str) return str;
    return str
      .replace(/Ã¤/g, 'ä').replace(/Ã¶/g, 'ö').replace(/Ã©/g, 'é')
      .replace(/Ã /g, 'à').replace(/Ã¡/g, 'á').replace(/Ã¥/g, 'å')
      .replace(/Ã½/g, 'ý').replace(/Ã£/g, 'ã').replace(/Ã§/g, 'ç')
      .replace(/Â»/g, '»').replace(/ð¼/g, 'æ');
  };

  const lines = content.replace(/^﻿/, '').split('\n').filter(l => l.trim()).map(fixEncoding);
  if (lines.length < 2) return [];

  // Proper quoted-field CSV split — handles company names containing commas
  const splitCSV = (line) => {
    const fields = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = splitCSV(lines[0]);
  const idx = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const iDatum=idx('datum'), iTyp=idx('typ'), iNamn=idx('rdepapper')!==-1?idx('rdepapper'):idx('eskr');
  const iIsin=idx('isin'), iTicker=idx('ticker'), iAntal=idx('antal'), iKurs=idx('kurs'), iKursvaluta=idx('kursvaluta'), iTotalt=idx('totalt'), iKonto=idx('konto');
  const parseNum = (s) => parseFloat((s||'').replace(/\s/g,'').replace(',','.')) || 0;
  const TYPE_MAP = {
    'köp':'buy','kop':'buy','sälj':'sell','salj':'sell',
    'utdelning':'dividend',
    'utländsk skatt':'foreign-tax','utlandsk skatt':'foreign-tax',
    'insättning':'deposit','insattning':'deposit',
    'uttag':'withdrawal',
    'vp-överföring in':'buy','vp-overforing in':'buy',
    'vp-överföring ut':'sell','vp-overforing ut':'sell',
    'övrigt':'other','ovrigt':'other',
    'ränta':'other','ranta':'other',
  };
  console.log('[parseMontrose] headers:', headers);
  console.log('[parseMontrose] col indices:', { iDatum, iTyp, iNamn, iIsin, iTicker, iAntal });
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = splitCSV(line);
    if (!cols[iDatum]) return null;
    const rawType = (cols[iTyp]||'').trim().toLowerCase();
    const txType = TYPE_MAP[rawType] ||
      (Object.entries(TYPE_MAP).find(([k]) => rawType.includes(k))?.[1]) ||
      'other';
    const qty = Math.abs(parseNum(cols[iAntal]));
    if (txType === 'other' && !cols[iIsin]?.trim()) return null; // skip empty rows
    const name = cols[iNamn]?.trim() || '';
    const isin = cols[iIsin]?.trim() || '';
    let rawTicker = cols[iTicker]?.trim() || '';
    // Montrose omits Ticker/ISIN for some dividend and foreign-tax rows, embedding the
    // ticker in the name instead (e.g. "Utdelning ADDT B 3.2 SEK/aktie" → rawTicker "ADDT B").
    if (!rawTicker && !isin && (txType === 'dividend' || txType === 'foreign-tax')) {
      const stripped = name.replace(/^Utdelning\s+/i, '').replace(/^Källskatt\s+/i, '');
      // Match ticker patterns: can be ticker alone, ticker + share class, or ticker with dots/dashes
      // Examples: "ADDT B 3.2", "SAGA D", "VIT B", "NOVOB.CO", "LVMH.PA", "Evotec"
      let m = stripped.match(/^([A-ZÅÄÖ][A-ZÅÄÖ0-9]*(?:[.\-][A-ZÅÄÖ0-9]+)*(?:\s+[A-Z])?)\s+[\d,.]/);
      // Fallback: if no amount follows, just grab the ticker/share class at the start
      if (!m) {
        m = stripped.match(/^([A-ZÅÄÖ][A-ZÅÄÖ0-9]*(?:[.\-][A-ZÅÄÖ0-9]+)*(?:\s+[A-Z])?)(?:\s|$)/);
      }
      if (m) rawTicker = m[1].trim();
    }
    return { broker:'montrose', date:cols[iDatum]?.trim()||'', type:txType, name, isin, rawTicker, ticker:'', quantity:qty, price:parseNum(cols[iKurs]), currency:cols[iKursvaluta]?.trim()||'SEK', totalSEK:parseNum(cols[iTotalt]), account:cols[iKonto]?.trim()||'' };
  }).filter(Boolean);
  const typeCounts = rows.reduce((acc, r) => { acc[r.type] = (acc[r.type]||0)+1; return acc; }, {});
  console.log('[parseMontrose] parsed', rows.length, 'rows, types:', typeCounts);
  if (rows.length > 0) console.log('[parseMontrose] sample row[0] rawType was from col', iTyp, ':', rows[0]);
  return rows;
}
function parseAvanza(content) {
  // Fix common encoding issues: Latin-1 interpreted as UTF-8
  const fixEncoding = (str) => {
    if (!str) return str;
    return str
      .replace(/\u00C3\u00A4/g, '\u00E4').replace(/\u00C3\u00B6/g, '\u00F6').replace(/\u00C3\u00A9/g, '\u00E9')
      .replace(/\u00C3 /g, '\u00E0').replace(/\u00C3\u00A1/g, '\u00E1').replace(/\u00C3\u00A5/g, '\u00E5')
      .replace(/\u00C3\u00BD/g, '\u00FD').replace(/\u00C3\u00A3/g, '\u00E3').replace(/\u00C3\u00A7/g, '\u00E7')
      .replace(/\u00C2\u00BB/g, '\u00BB').replace(/\u00F0\u00BC/g, '\u00E6');
  };

  const lines = content.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim()).map(fixEncoding);
  if (lines.length < 2) return [];
  // Auto-detect delimiter: old Avanza uses ';', new export format uses ','
  const firstLine = lines[0];
  const delimiter = (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ',';

  const splitLine = (line) => {
    if (delimiter === ';') return line.split(';').map(c => c.trim().replace(/"/g,''));
    // Comma delimiter: handle quoted fields (Avanza may quote numbers containing commas)
    const fields = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = splitLine(lines[0]);
  // Prefer exact column match to avoid Kurs vs Kursvaluta, Totalt vs Totalvaluta collisions
  const col = (row, name) => {
    const nl = name.toLowerCase();
    let i = headers.findIndex(h => h.toLowerCase() === nl);
    if (i < 0) i = headers.findIndex(h => h.toLowerCase().includes(nl));
    return i >= 0 ? (row[i]||'').trim().replace(/"/g,'') : '';
  };
  const parseNum = (s) => parseFloat((s||'').replace(/\s/g,'').replace(',','.')) || 0;

  const TYPE_MAP = {
    'koopt':'buy','köpt':'buy','köp':'buy','kop':'buy',
    'salt':'sell','sålt':'sell','sälj':'sell','salj':'sell',
    'utdelning':'dividend',
    'utlandsk kallskatt':'foreign-tax','utländsk källskatt':'foreign-tax',
    'utlandsk skatt':'foreign-tax','utländsk skatt':'foreign-tax',
    'insattning':'deposit','insättning':'deposit',
    'uttag':'withdrawal',
    'vp-overforing in':'buy','vp-överföring in':'buy',
    'vp-overforing ut':'sell','vp-överföring ut':'sell',
    'ovrigt':'other','övrigt':'other',
  };

  return lines.slice(1).map(line => {
    const cols = splitLine(line);
    if (cols.length < 4) return null;
    const typRaw = col(cols,'typ').toLowerCase().trim();
    if (!typRaw) return null;
    const txType = TYPE_MAP[typRaw] || 'other';
    const qty = Math.abs(parseNum(col(cols,'antal')));
    const currency = col(cols,'instrumentvaluta') || col(cols,'kursvaluta') || col(cols,'valuta') || 'SEK';
    const totalRaw = col(cols,'totalt') || col(cols,'belopp');
    return {
      broker: 'avanza',
      date: col(cols,'datum'),
      type: txType,
      name: col(cols,'värdepapper') || col(cols,'beskrivning') || col(cols,'beskr'),
      isin: col(cols,'isin'),
      rawTicker: '',
      ticker: '',
      quantity: qty,
      price: parseNum(col(cols,'kurs')),
      currency,
      totalSEK: parseNum(totalRaw),
      account: col(cols,'konto'),
    };
  }).filter(r => r && r.date);
}

function parseNordnet(content) {
  // Fix common encoding issues: Latin-1 interpreted as UTF-8
  const fixEncoding = (str) => {
    if (!str) return str;
    return str
      .replace(/Ã¤/g, 'ä').replace(/Ã¶/g, 'ö').replace(/Ã©/g, 'é')
      .replace(/Ã /g, 'à').replace(/Ã¡/g, 'á').replace(/Ã¥/g, 'å')
      .replace(/Ã½/g, 'ý').replace(/Ã£/g, 'ã').replace(/Ã§/g, 'ç')
      .replace(/Â»/g, '»').replace(/ð¼/g, 'æ');
  };

  const bom = content.charCodeAt(0) === 0xFEFF;
  const lines = (bom ? content.slice(1) : content).split('\n').filter(l => l.trim()).map(fixEncoding);
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map(h => h.trim().replace(/"/g,''));
  const col = (row, name) => { const i = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase())); return i >= 0 ? (row[i]||'').trim().replace(/"/g,'') : ''; };

  // Nordnet exports two 'Valuta' columns: the first is the account/transaction currency (SEK),
  // the second (after 'Inköpsvärde') is the instrument currency (USD, GBP, etc.).
  // We want the instrument currency so the resolver picks the right exchange.
  const inkopsvardeIdx = headers.findIndex(h => /ink.p/i.test(h));
  const allValutaIdxs = headers.reduce((acc, h, i) => h.toLowerCase().includes('valuta') ? [...acc, i] : acc, []);
  const instrumentValutaIdx = inkopsvardeIdx >= 0
    ? (allValutaIdxs.find(i => i > inkopsvardeIdx) ?? allValutaIdxs[0] ?? -1)
    : (allValutaIdxs[0] ?? -1);

  const TYPE_MAP = { 'købt':'buy','köpt':'buy','solgt':'sell','sålt':'sell','udbytte':'dividend','utdelning':'dividend','udenlandsk skat':'foreign-tax','utenlandsk kildeskatt':'foreign-tax' };
  return lines.slice(1).map(line => {
    const cols = line.split('\t');
    if (cols.length < 4) return null;
    const txType = TYPE_MAP[(col(cols,'transaktionstyp')||col(cols,'transaktionstype')).toLowerCase()] || 'other';
    const rawQty = parseFloat(col(cols,'antal').replace(',','.').replace(/\s/g,''));
    const qty = isNaN(rawQty) ? 0 : Math.abs(rawQty);
    const currency = (instrumentValutaIdx >= 0 ? (cols[instrumentValutaIdx]||'').trim().replace(/"/g,'') : '') || col(cols,'valuta') || 'SEK';
    return { broker:'nordnet', date:col(cols,'afviklingsdato')||col(cols,'bokföringsdag'), type:txType, name:col(cols,'värdepapper')||col(cols,'verdipapir'), isin:col(cols,'isin'), rawTicker:col(cols,'värdepappersbeteckning')||'', ticker:'', quantity:qty, price:parseFloat(col(cols,'kurs').replace(',','.').replace(/\s/g,''))||0, currency, totalSEK:parseFloat((col(cols,'belopp')||col(cols,'totalt')).replace(',','.').replace(/\s/g,''))||0, account:col(cols,'depå')||col(cols,'depot') };
  }).filter(Boolean);
}

function detectBrokerAndParse(filename, content, forcedBroker = null) {
  console.log('[detect] filename:', filename, 'contentLen:', content?.length, 'forcedBroker:', forcedBroker);
  if (forcedBroker && forcedBroker !== 'auto') {
    if (forcedBroker === 'montrose') return { broker:'montrose', rows:parseMontrose(content) };
    if (forcedBroker === 'avanza')   return { broker:'avanza',   rows:parseAvanza(content) };
    if (forcedBroker === 'nordnet')  return { broker:'nordnet',  rows:parseNordnet(content) };
  }
  const lower = filename.toLowerCase();

  // Step 1: Encoding check — Nordnet uses UTF-16 LE with BOM
  const hasBOM = content.charCodeAt(0) === 0xFEFF;

  // Step 2: Detect separator from first line
  const firstLine = content.replace(/^﻿/, '').split('\n')[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;

  // Step 3: Header-based detection (most reliable)
  const headerLower = firstLine.toLowerCase();

  // Nordnet: tab-separated with unique headers. hasBOM alone is NOT sufficient —
  // Montrose also exports UTF-8 with BOM, so both produce charCode 0xFEFF at pos 0.
  const isNordnet = tabCount > 3 ||
    headerLower.includes('transaktionstype') ||
    headerLower.includes('afviklingsdato') ||
    headerLower.includes('bokföringsdag') ||
    lower.includes('nordnet');

  // Avanza: 'typ av transaktion' is unique to Avanza (Montrose uses just 'Typ')
  const isAvanza = !isNordnet && (
    headerLower.includes('typ av transaktion') ||
    lower.includes('avanza')
  );

  // Montrose: has 'ticker' column (unique to Montrose) — checked after Avanza
  const isMontrose = !isNordnet && !isAvanza && (
    headerLower.includes('ticker') ||
    headerLower.includes('kursvaluta') ||
    lower.includes('montrose')
  );

  if (isNordnet) return { broker:'nordnet', rows:parseNordnet(content) };
  if (isMontrose) return { broker:'montrose', rows:parseMontrose(content) };
  if (isAvanza) return { broker:'avanza', rows:parseAvanza(content) };

  // Last resort: try each parser and return the one that produces the most valid rows
  const attempts = [
    { broker:'montrose', rows:parseMontrose(content) },
    { broker:'avanza', rows:parseAvanza(content) },
    { broker:'nordnet', rows:parseNordnet(content) },
  ];
  const best = attempts.reduce((a, b) => a.rows.length >= b.rows.length ? a : b);
  return best.rows.length > 0 ? best : { broker:'unknown', rows:[] };
}

// ── Transactions ────────────────────────────────────────────────────────────
app.get('/api/transactions', requireUser, async (req, res) => {
  const BC = (req.query.currency || 'SEK').toUpperCase();
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', req.user.id).order('date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  let bcRate = 1;
  if (BC !== 'SEK') {
    try {
      const fx = await fetch(`https://api.frankfurter.app/latest?from=SEK&to=${BC}`);
      const fxd = await fx.json();
      if (fxd?.rates?.[BC]) bcRate = fxd.rates[BC];
    } catch(e) {}
  }
  const rows = data || [];
  // Backfill tickers onto dividend/foreign-tax rows by matching ISIN from buy/sell rows.
  // Dividends are excluded from the resolve step so they never get a ticker written to the DB.
  const isinToTicker = {};
  rows.forEach(t => { if (t.ticker && t.isin) isinToTicker[t.isin] = t.ticker; });
  res.json(rows.map(t => ({
    ...t,
    ticker: t.ticker || (t.isin ? isinToTicker[t.isin] : null) || null,
    total: parseFloat(((t.total_sek || 0) * bcRate).toFixed(2)),
  })));
});

app.get('/api/transactions/count', requireUser, async (req, res) => {
  const { data } = await supabase.from('transactions').select('broker, type').eq('user_id', req.user.id);
  const rows = data || [];
  const total = rows.length;
  const trades = rows.filter(r => r.type === 'buy' || r.type === 'sell').length;
  const byBroker = {};
  rows.forEach(r => {
    const b = r.broker || 'unknown';
    if (!byBroker[b]) byBroker[b] = { total: 0, types: {} };
    byBroker[b].total++;
    byBroker[b].types[r.type] = (byBroker[b].types[r.type] || 0) + 1;
  });
  res.json({ total, trades, byBroker });
});

app.delete('/api/transactions', requireUser, async (req, res) => {
  const { broker } = req.query;
  let query = supabase.from('transactions').delete().eq('user_id', req.user.id);
  if (broker) query = query.eq('broker', broker);
  await query;
  res.json({ success: true });
});

app.delete('/api/ticker-cache', requireUser, async (req, res) => {
  await supabase.from('ticker_cache').delete().eq('user_id', req.user.id);
  res.json({ success: true });
});

app.post('/api/transactions/upload', requireUser, async (req, res) => {
  const { files, broker: brokerKey, forceBroker, dividendsOnly } = req.body;
  console.log('[upload] received files:', files?.length, 'forceBroker:', forceBroker, 'brokerKey:', brokerKey, 'dividendsOnly:', dividendsOnly);
  if (files?.length) console.log('[upload] file[0] name:', files[0]?.name, 'content length:', files[0]?.content?.length, 'content start:', (files[0]?.content||'').substring(0,80));
  const forcedBroker = brokerKey || forceBroker || null;
  if (!files?.length) return res.status(400).json({ error: 'No files provided' });
  const results = [];
  let allNew = [];
  for (const { name, content } of files) {
    try {
      const { broker, rows: allRows } = detectBrokerAndParse(name, content, forcedBroker);
      const rows = dividendsOnly ? allRows.filter(r => r.type === 'dividend' || r.type === 'foreign-tax') : allRows;
      const typeCounts = rows.reduce((a, r) => { a[r.type]=(a[r.type]||0)+1; return a; }, {});
      const sampleTypes = rows.slice(0,5).map(r => r.type+'('+r.name.slice(0,15)+')');
      results.push({ file:name, broker, count:rows.length, typeCounts, sampleTypes });
      allNew = allNew.concat(rows);
    }
    catch(e) { results.push({ file:name, error:e.message }); }
  }
  const { data: existing } = await supabase.from('transactions').select('broker, date, type, isin, quantity, price').eq('user_id', req.user.id);
  const dedupKey = t => `${t.broker||''}|${t.date||''}|${t.type||''}|${t.isin||''}|${Math.round((t.quantity||0)*10000)}|${Math.round((t.price||0)*10000)}`;
  const existingIds = new Set((existing||[]).map(dedupKey));
  const newUnique = allNew.filter(t => !existingIds.has(dedupKey(t)));
  if (newUnique.length > 0) {
    const rows = newUnique.map(t => ({ user_id:req.user.id, broker:t.broker, date:t.date, type:t.type, name:t.name, isin:t.isin, raw_ticker:t.rawTicker, ticker:t.ticker, quantity:t.quantity, price:t.price, currency:t.currency, total_sek:t.totalSEK, account:t.account }));
    await supabase.from('transactions').insert(rows);

    // If any dividend rows were inserted, resolve their names in the background
    const hasDividends = newUnique.some(t => t.type === 'dividend' || t.type === 'foreign-tax');
    if (hasDividends) {
      resolveDividendNames(req.user.id).catch(() => {});
    }

    // Log activity only when new transactions are added
    const { data: holdingsData } = await supabase.from('transactions').select('ticker').eq('user_id', req.user.id).not('ticker', 'is', null);
    const uniqueTickers = [...new Set((holdingsData || []).map(h => h.ticker))];
    await appendActivity(req.user.id, 'holdings_update', { holdingCount: uniqueTickers.length, tickers: uniqueTickers.slice(0, 5) });
  }
  const { count: total } = await supabase.from('transactions').select('*', { count:'exact', head:true }).eq('user_id', req.user.id);
  res.json({ results, newAdded:newUnique.length, total:total||0 });
});

app.post('/api/transactions/resolve', requireUser, async (req, res) => {
  const { force, limit } = req.body;
  const batchSize = (limit && Number.isFinite(+limit)) ? Math.min(+limit, 100) : null;

  if (force) {
    // Do NOT clear the entire ticker_cache — that forces all stocks to hit YF simultaneously
    // and triggers rate-limiting. Cache hits for already-correct tickers are free; only
    // genuinely unresolved tickers (cache miss) will make fresh YF calls.
    const { data: allTxs } = await supabase.from('transactions').select('id, raw_ticker, isin, name, currency, broker, ticker').eq('user_id', req.user.id).in('type', ['buy','sell','other','withdrawal']);
    const txList = allTxs || [];
    // resolveSymbolBatch loads the (now-empty) cache once and skips the rate-limit
    // sleep for repeated tickers — huge speedup when one stock has many transactions
    const tickerMap = await resolveSymbolBatch(txList, req.user.id);
    let resolved = 0;
    await Promise.all(txList.map(async tx => {
      const ticker = tickerMap[tx.id];
      if (ticker && ticker !== tx.ticker) {
        await supabase.from('transactions').update({ ticker }).eq('id', tx.id);
        resolved++;
      }
    }));
    return res.json({ resolved, total: txList.length, remaining: 0, forced: true });
  }

  // Normal mode: resolve up to `limit` unresolved transactions per call
  let q = supabase.from('transactions').select('id, raw_ticker, isin, name, currency, broker').eq('user_id', req.user.id).in('type', ['buy','sell']).or('ticker.is.null,ticker.eq.');
  if (batchSize) q = q.limit(batchSize);
  const { data: unresolved } = await q;
  await supabase.from('ticker_cache').delete().eq('user_id', req.user.id).is('ticker', null);
  const txList = unresolved || [];
  const tickerMap = await resolveSymbolBatch(txList, req.user.id);
  let resolved = 0;
  await Promise.all(txList.map(async tx => {
    const ticker = tickerMap[tx.id];
    if (ticker) {
      await supabase.from('transactions').update({ ticker }).eq('id', tx.id);
      resolved++;
    }
    // Unresolved transactions stay with ticker = '' — the client's no-progress counter
    // handles the infinite-loop case. Committing raw_ticker would set a wrong exchange.
  }));
  const { count: remaining } = await supabase.from('transactions').select('*', { count:'exact', head:true }).eq('user_id', req.user.id).in('type', ['buy','sell']).or('ticker.is.null,ticker.eq.');
  res.json({ resolved, total: txList.length, remaining: remaining || 0 });
});

// Re-resolve specific tickers that failed price fetch — called by client after portfolio load
app.post('/api/transactions/resolve-failed', requireUser, async (req, res) => {
  const { failedTickers } = req.body;
  if (!Array.isArray(failedTickers) || !failedTickers.length) return res.json({ resolved: 0 });
  // Safety cap: if many holdings are failing it's a systemic issue — mass-reset would wipe all
  // resolved tickers and trigger YF rate-limiting. Use force-resolve instead.
  if (failedTickers.length > 5) return res.status(400).json({ error: 'too_many', count: failedTickers.length });

  // Two separate safe queries: by resolved ticker and by raw_ticker (for unresolved rows where ticker='')
  const [byTicker, byRaw] = await Promise.all([
    supabase.from('transactions').select('id, raw_ticker, isin, name, currency, broker, ticker')
      .eq('user_id', req.user.id).in('ticker', failedTickers).in('type', ['buy', 'sell']),
    supabase.from('transactions').select('id, raw_ticker, isin, name, currency, broker, ticker')
      .eq('user_id', req.user.id).in('raw_ticker', failedTickers).in('type', ['buy', 'sell']),
  ]);
  const seen = new Set();
  const txs = [...(byTicker.data || []), ...(byRaw.data || [])].filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  if (!txs?.length) return res.json({ resolved: 0 });

  // Delete ticker_cache entries for these so resolver tries YF fresh
  const cacheKeys = txs.map(tx => `${tx.broker||''}|${tx.currency||''}|${tx.isin||tx.raw_ticker||tx.name}`);
  await Promise.all(cacheKeys.map(k =>
    supabase.from('ticker_cache').delete().eq('user_id', req.user.id).eq('cache_key', k)
  ));

  // Reset tickers to '' so they're treated as unresolved (update by id to avoid mis-matching on raw_ticker)
  const txIds = txs.map(t => t.id);
  await supabase.from('transactions').update({ ticker: '' }).eq('user_id', req.user.id).in('id', txIds);

  // Re-resolve
  const tickerMap = await resolveSymbolBatch(txs.map(tx => ({ ...tx, ticker: '' })), req.user.id);
  let resolved = 0;
  await Promise.all(txs.map(async tx => {
    const ticker = tickerMap[tx.id];
    if (ticker) {
      await supabase.from('transactions').update({ ticker }).eq('id', tx.id);
      resolved++;
    }
  }));
  res.json({ resolved, total: txs.length });
});

app.get('/api/transactions/reconstruct', requireUser, async (req, res) => {
  const { data: txs } = await supabase.from('transactions')
    .select('ticker, raw_ticker, quantity, price, isin, type, date, name')
    .eq('user_id', req.user.id)
    .in('type', ['buy', 'sell', 'other', 'withdrawal'])
    .order('date', { ascending: true });

  // Normalise: use ticker if resolved, else raw_ticker
  // Group by ISIN when available (avoids duplicate holdings from re-resolves)
  const normalised = (txs||[])
    .map(t => ({ 
      ...t, 
      ticker: (t.ticker||t.raw_ticker||'').trim(),
      // Handle old data with negative sell quantities - normalize to positive
      quantity: Math.abs(t.quantity || 0)
    }))
    .filter(t => t.ticker && t.quantity > 0); // skip zero-quantity rows
  
  // Sort same-day transactions: BUYS before SELLS
  // Montrose CSV exports same-day transactions in reverse chronological order
  // Example: April 8 in CSV shows Sell then Buy, but actual order was Buy then Sell
  normalised.sort((a, b) => {
    if (a.date === b.date) {
      const typeOrder = { buy: 1, other: 2, withdrawal: 3, sell: 4 };
      return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
    }
    return 0; // Already sorted by date from query
  });

  // Build ISIN → best ticker mapping; overrides always win over stored tickers
  const overrides = await loadOverrides(req.user.id);
  const isinToTicker = {};
  normalised.forEach(t => {
    if (!t.isin) return;
    if (overrides[t.isin]) {
      isinToTicker[t.isin] = overrides[t.isin];
    } else if (t.ticker) {
      const existing = isinToTicker[t.isin];
      // Prefer proper YF exchange-suffixed tickers (e.g. EVO.ST) over bare or Reuters tickers.
      // Reuters suffixes (.N .O .OQ .K .US) are NOT valid YF tickers — don't let them
      // overwrite already-resolved clean tickers like BN → BN.N would wrongly win otherwise.
      const isReutersTicker = /\.(N|O|OQ|NQ|NY|K|US)$/i.test(t.ticker);
      const isProperSuffix = t.ticker.includes('.') && !isReutersTicker;
      if (!existing || (isProperSuffix && !existing.includes('.'))) {
        isinToTicker[t.isin] = t.ticker;
      }
    }
  });

  const holdings = {};
  for (const tx of normalised) {
    // Use ISIN-canonical ticker when available to avoid splits
    const canonicalTicker = (tx.isin && isinToTicker[tx.isin]) ? isinToTicker[tx.isin] : tx.ticker;

    if (!holdings[canonicalTicker]) {
      holdings[canonicalTicker] = { ticker: canonicalTicker, isin: tx.isin||null, quantity: 0, totalCost: 0, name: tx.name||'' };
    }
    const h = holdings[canonicalTicker];
    if (tx.isin && !h.isin) h.isin = tx.isin;

    if (tx.type === 'buy') {
      h.totalCost += tx.quantity * (tx.price || 0);
      h.quantity += tx.quantity;
    } else if (tx.type === 'sell') {
      const avg = h.quantity > 0 ? h.totalCost / h.quantity : 0;
      h.totalCost = Math.max(0, h.totalCost - tx.quantity * avg);
      h.quantity -= tx.quantity;
      // Clamp to zero if we sold more than we have (pre-history sells)
      if (h.quantity < 0) { h.quantity = 0; h.totalCost = 0; }
    } else if ((tx.type === 'other' || tx.type === 'withdrawal') && tx.isin && tx.price === 0) {
      // Split adjustments: Övrigt/Uttag with ISIN and zero price
      // Övrigt (other) = add shares, Uttag (withdrawal) = remove shares
      // Zero price means we don't adjust cost basis (split doesn't change total value)
      if (tx.type === 'withdrawal') {
        h.quantity -= tx.quantity;
      } else {
        h.quantity += tx.quantity;
      }
    }
  }

  const result = Object.values(holdings)
    .filter(h => h.quantity > 0.001)
    .map(h => ({
      ticker: h.ticker,
      isin: h.isin || null,
      name: h.name || '',
      quantity: Math.floor(Math.round(h.quantity * 1e6) / 1e6),
      avgPrice: h.quantity > 0 ? parseFloat((h.totalCost / h.quantity).toFixed(4)) : 0,
    }));

  res.json(result);
});

// ── Market index quotes ──────────────────────────────────────────────────────
const _marketIndexCache = new Map(); // symbol → { symbol, price, changePct, change, ts }
const MARKET_INDEX_CACHE_TTL = 10 * 60 * 1000;
const ALL_INDEX_SYMBOLS = ['^GDAXI','^NDX','^OMXC25','^GSPC','^OMX','^OMXH25','^OSEAX','^GSPTSE'];

// Stooq provides free global index data without an API key.
// Finnhub free tier only covers US equities; European/Nordic indices return {c:0}.
const YF_TO_STOOQ = {
  '^GSPC':   '^spx',    // S&P 500
  '^NDX':    '^ndx',    // NASDAQ 100
  '^DJI':    '^dji',    // Dow Jones
  '^FTSE':   '^ukx',    // FTSE 100
  '^GDAXI':  '^dax',    // DAX
  '^OMX':    '^omx',    // OMXS30
  '^OMXC25': '^omxc25', // OMX Copenhagen 25
  '^OMXH25': '^omxh25', // OMX Helsinki 25
  '^OSEAX':  '^oseax',  // Oslo All-Share
  '^GSPTSE': '^tsx',    // S&P/TSX Composite
};

async function stooqIndexQuote(yfSymbol) {
  const stooqSym = YF_TO_STOOQ[yfSymbol];
  if (!stooqSym) return null;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; verumen-market/1.0)' },
  });
  if (!r.ok) return null;
  const text = await r.text();
  const lines = text.trim().split('\n');
  // Parse all data rows (skip header), sort newest-first by date string
  const rows = lines.slice(1)
    .filter(l => l && l.includes(','))
    .map(l => { const p = l.split(','); return { date: p[0], close: parseFloat(p[4]) }; })
    .filter(r => r.close && !isNaN(r.close))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) return null;
  const close = rows[0].close;
  const prevClose = rows[1]?.close ?? null;
  const change = prevClose != null ? close - prevClose : 0;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  return {
    symbol: yfSymbol,
    regularMarketPrice: close,
    regularMarketPreviousClose: prevClose ?? close,
    regularMarketChange: change,
    regularMarketChangePercent: changePct,
    regularMarketTime: Math.floor(Date.now() / 1000),
    currency: currencyFromTicker(yfSymbol),
    longName: null, shortName: null, sector: null, quoteType: 'INDEX',
  };
}

function cacheEntry(q, fallbackSymbol) {
  if (!q?.regularMarketPrice) return;
  const price  = Number(q.regularMarketPrice);
  const rawChg = q.regularMarketChange;
  const change = Number(typeof rawChg === 'object' ? rawChg?.raw : rawChg) || 0;
  // Calculate % from price/change directly — regularMarketChangePercent returns
  // inconsistent formats (decimal vs percent, daily vs YTD) for some index symbols.
  const prevClose = price - change;
  const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  _marketIndexCache.set(q.symbol || fallbackSymbol, {
    symbol: q.symbol || fallbackSymbol,
    price, change, changePct,
    ts: Date.now(),
  });
}

// Background refresh — runs on startup and every 60s so the HTTP endpoint
// always serves instantly from cache with no per-request Finnhub latency.
async function refreshMarketIndexes() {
  let count = 0;
  for (const s of ALL_INDEX_SYMBOLS) {
    try {
      // Stooq is the primary source for ^ index symbols — Finnhub free tier
      // returns {c:0} for European/Nordic indices, making the fallback useless.
      let q = s.startsWith('^') ? await stooqIndexQuote(s) : null;
      if (!q) q = await finnhubQuote(s);
      if (q) { cacheEntry(q, s); count++; }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (count > 0) log.info('market-index cache refreshed', { count });
}

refreshMarketIndexes();
setInterval(refreshMarketIndexes, 60 * 1000).unref();

// Probe for global_isin_cache table on startup — log a clear message if it hasn't been created yet
supabase.from('global_isin_cache').select('isin').limit(1).then(({ error }) => {
  if (error) log.warn('global_isin_cache table missing — cross-user ISIN caching disabled. Create it with:\n  CREATE TABLE global_isin_cache (isin TEXT PRIMARY KEY, ticker TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());');
  else log.info('global_isin_cache ready');
}).catch(() => {});

app.get('/api/market-indexes', requireUser, (req, res) => {
  const symbols = (req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 15);
  if (!symbols.length) return res.json([]);
  // Serve instantly from the background-populated cache
  const results = symbols.map(s => _marketIndexCache.get(s)).filter(Boolean)
    .map(c => ({ symbol: c.symbol, price: c.price, changePct: c.changePct, change: c.change }));
  res.json(results);
});

// ── Portfolio valuation ─────────────────────────────────────────────────────
app.post('/api/portfolio', requireUser, async (req, res) => {
  const { portfolio, baseCurrency, forceRefresh } = req.body;
  if (!portfolio?.length) return res.json({ portfolio:[], totals:null });
  const BC = baseCurrency || 'SEK';
  let fxRates = {};
  try {
    const rates = await frankfurterFxRates();
    Object.entries(rates).forEach(([sym, rate]) => {
      fxRates[sym] = rate;
      _fxRateCache[sym] = { rate, cachedAt: Date.now() };
      setPriceCache(sym, { q: { symbol: sym, regularMarketPrice: rate }, cachedAt: Date.now() });
    });
  } catch(e) {
    // Fall back to in-memory cache first, then Supabase-persisted _priceCache.
    Object.entries(_fxRateCache).forEach(([sym, { rate }]) => { if (rate) fxRates[sym] = rate; });
    FX_PAIRS.forEach(sym => {
      if (!fxRates[sym]) {
        const cached = _priceCache.get(sym);
        if (cached?.q?.regularMarketPrice) fxRates[sym] = cached.q.regularMarketPrice;
      }
    });
  }
  const toSEK=(amount,currency)=>{ if(!currency||currency==='SEK') return amount; return fxRates[`${currency}SEK=X`]?amount*fxRates[`${currency}SEK=X`]:amount; };
  const fromSEK=(amount)=>{ if(BC==='SEK') return amount; return fxRates[`${BC}SEK=X`]?amount/fxRates[`${BC}SEK=X`]:amount; };
  const FLAGS={ST:'se',OL:'no',CO:'dk',HE:'fi',AS:'nl',PA:'fr',DE:'de',F:'de',L:'gb',IL:'gb',MI:'it',MC:'es',SW:'ch',VX:'ch',TO:'ca',V:'ca',CN:'ca',AX:'au',HK:'hk',T:'jp',SI:'sg'};
  // ISIN country → flag emoji for when the ticker has no exchange suffix
  // Only non-US/CA countries: CA and US companies commonly list on US exchanges without a suffix,
  // so a no-dot ticker for them is still a US listing and should keep 🇺🇸.
  const ISIN_FLAG={SE:'se',NO:'no',DK:'dk',FI:'fi',NL:'nl',FR:'fr',DE:'de',GB:'gb',IT:'it',ES:'es',CH:'ch',AU:'au',HK:'hk',JP:'jp',SG:'sg'};
  const getFlag=(t,isin)=>{ const p=t.split('.'); if(p.length>1) return FLAGS[p[p.length-1]]||'us'; if(isin){const cc=isin.substring(0,2).toUpperCase(); if(ISIN_FLAG[cc]) return ISIN_FLAG[cc];} return 'us'; };
  const getShareClass=(ticker)=>{ const m=ticker.match(/^[^-]+-([A-Ca-c])(?:\.|$)/); return m?m[1].toUpperCase():null; };
  const cleanName=(name,ticker)=>{
    if (!name) return name;
    let cleaned = name
      .replace(/\s*\(publ\.?\)/gi, '')
      .replace(/\s*\(AB\)/gi, '')
      .replace(/\bAB\b(?!\w)/gi, '')
      .replace(/\bpubl\.?\b/gi, '')
      .replace(/\b(ASA|AS|A\/S|SE|Inc\.?|Inc|Corp\.?|Ltd\.?|Limited|PLC|N\.V\.|S\.A\.|GmbH|AG)\b/gi, '')
      .replace(/\s*[.,;]\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const shareClass = ticker ? getShareClass(ticker) : null;
    if (shareClass && !new RegExp(`\\b${shareClass}$`).test(cleaned)) cleaned += ` ${shareClass}`;
    return cleaned;
  };
  // Resolve a ticker to a live quote, with fallback to ISIN-based suffix variants, then to price cache
  const fetchQuote = async (ticker, isin, skipCache = false) => {
    // Fast path: return very recent _priceCache entry (populated by bulk pre-fetch above).
    // Entries < 60s old are from this request and should be treated as live, not stale.
    if (!skipCache) {
      const cached = _priceCache.get(ticker);
      if (cached) {
        const age = Date.now() - cached.cachedAt;
        if (age < 60000) return { ...cached.q, _resolvedTicker: ticker };
        // Not in a scheduled fetch window — serve stale cache
        if (!shouldRefetch(ticker)) return { ...cached.q, _resolvedTicker: ticker, _fromCache: true, _cachedAt: cached.cachedAt };
        if (age < PRICE_CACHE_TTL) return { ...cached.q, _fromCache: true, _resolvedTicker: ticker, _cachedAt: cached.cachedAt };
      }
    }
    // Live Finnhub fetch — toFinnhubSymbol() converts .ST→:XSTO etc. internally
    try {
      const q = await finnhubQuote(ticker);
      if (q?.regularMarketPrice != null) {
        setPriceCache(ticker, { q, cachedAt: Date.now() });
        return { ...q, _resolvedTicker: ticker };
      }
    } catch(e) {
      log.warn('finnhub quote failed', { ticker, error: e?.message?.slice(0, 80) });
    }
    // Fall back to cache (24h warm TTL — stale price beats no price)
    const cached2 = _priceCache.get(ticker);
    if (cached2 && (Date.now() - cached2.cachedAt) < PRICE_CACHE_WARM_TTL) {
      return { ...cached2.q, _fromCache: true, _resolvedTicker: ticker, _cachedAt: cached2.cachedAt };
    }
    return null;
  };

  // Fetch quotes with a concurrency limit to avoid tripping YF rate limits.
  // Workers are staggered so they don't all fire simultaneously at t=0.
  // After a failed fetch (null) the worker pauses longer — a null result usually
  // means rate-limiting, so backing off reduces cascading failures.
  const fetchWithLimit = async (items, limit, fn) => {
    const results = new Array(items.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async (_, wi) => {
      if (wi > 0) await new Promise(r => setTimeout(r, wi * 400)); // stagger starts
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i]);
        if (idx < items.length) {
          const delay = results[i] == null ? 1500 : 250; // back off after a miss
          await new Promise(r => setTimeout(r, delay));
        }
      }
    });
    await Promise.all(workers);
    return results;
  };

  // Warm _priceCache from Supabase for any tickers not already in memory.
  // This handles server restarts and race conditions where the startup load hasn't
  // finished yet. A single batch query covers all cold tickers before any YF calls,
  // so if the bulk pre-fetch below fails (rate-limit), individual fetchQuote calls
  // still have cached data to fall back on instead of making 19 separate YF requests.
  if (!forceRefresh && portfolio.length > 0) {
    const coldTickers = portfolio.map(h => h.ticker).filter(t => t && !_priceCache.has(t));
    if (coldTickers.length > 0) {
      const cutoff = new Date(Date.now() - PRICE_CACHE_WARM_TTL).toISOString();
      const { data: dbPrices } = await supabase.from('price_cache')
        .select('ticker, quote, cached_at').in('ticker', coldTickers).gt('cached_at', cutoff);
      (dbPrices || []).forEach(({ ticker, quote, cached_at }) => {
        if (!_priceCache.has(ticker))
          _priceCache.set(ticker, { q: quote, cachedAt: new Date(cached_at).getTime() });
      });
    }
  }

  // Bulk pre-fetch: one YF call for all tickers → fills _priceCache before the per-ticker loop.
  // This collapses N individual YF calls into 1, dramatically reducing rate-limit exposure on
  // initial loads when _priceCache is cold. Only on normal loads (not force-refresh).
  if (!forceRefresh && portfolio.length > 0) {
    const allTickers = portfolio.map(h => h.ticker).filter(Boolean);
    // Skip tickers that are within their current scheduled fetch window
    const tickersToFetch = allTickers.filter(t => shouldRefetch(t));
    if (tickersToFetch.length > 0) {
      await Promise.allSettled(tickersToFetch.map(async t => {
        try {
          const q = await finnhubQuote(t);
          if (q?.regularMarketPrice != null) setPriceCache(t, { q, cachedAt: Date.now() });
        } catch {}
      }));
    }
  }

  // Load last-good Supabase snapshot — used as per-ticker fallback when YF is temporarily down
  const { data: snapForFallback } = await supabase.from('portfolio_cache')
    .select('dashboard, built_at').eq('user_id', req.user.id).eq('currency', BC).single();
  const snapshotBuiltAt = snapForFallback?.built_at || null;
  const cachedRowMap = {};        // keyed by ticker
  const cachedRowByIsin = {};     // keyed by ISIN — fallback when ticker has drifted
  (snapForFallback?.dashboard?.portfolio || []).forEach(r => {
    if (!r.nativePrice) return;
    if (r.ticker) cachedRowMap[r.ticker] = r;
    if (r.isin)   cachedRowByIsin[r.isin] = r;
  });

  let hasStalePrices = false;
  const settled = await fetchWithLimit(portfolio, 3, async h => {
    try {
      const q = await fetchQuote(h.ticker, h.isin, !!forceRefresh);
      if (!q) {
        const cr = cachedRowMap[h.ticker] || (h.isin && cachedRowByIsin[h.isin]);
        if (cr) {
          hasStalePrices = true;
          const qty = h.quantity;
          const qtyRatio = cr.quantity > 0 ? qty / cr.quantity : 1;
          // Prefer FX-rate-based calculation when rates are available; otherwise scale
          // cached per-unit values directly to avoid the 1:1 USD=SEK silent fallback.
          const hasFx = !cr.currency || cr.currency === 'SEK' || !!fxRates[`${cr.currency}SEK=X`];
          let currentValueBase, costBase;
          if (hasFx) {
            currentValueBase = fromSEK(toSEK(cr.nativePrice * qty, cr.currency));
            costBase = fromSEK(toSEK((h.avgPrice||0) * qty, cr.currency));
          } else {
            const valuePerUnit = cr.quantity > 0 ? cr.currentValue / cr.quantity : 0;
            const cachedCostPerUnit = cr.quantity > 0 ? (cr.currentValue - (cr.profit || 0)) / cr.quantity : 0;
            currentValueBase = valuePerUnit * qty;
            costBase = cachedCostPerUnit * qty;
          }
          const profitBase = currentValueBase - costBase;
          return { ...cr, quantity: qty, avgPrice: h.avgPrice||0, currentValue: currentValueBase, profit: profitBase, returnPct: costBase > 0 ? (profitBase / costBase) * 100 : 0, todayGainBase: cr.todayGainBase != null ? cr.todayGainBase * qtyRatio : 0, stale: true, priceDate: snapshotBuiltAt };
        }
        const fallbackName = h.name || h.ticker;
        return { ticker:h.ticker, name:fallbackName, cleanName:cleanName(fallbackName,h.ticker), flag:getFlag(h.ticker,h.isin), currency:h.currency||'SEK', isin:h.isin||null, quantity:h.quantity, nativePrice:null, avgPrice:h.avgPrice||0, currentValue:null, profit:null, returnPct:null, todayChangePct:null, todayGainBase:null, sector:'Unknown', quoteType:null, noData:true };
      }
      const resolvedTicker = q._resolvedTicker || h.ticker;
      if (resolvedTicker !== h.ticker) {
        supabase.from('transactions').update({ ticker: resolvedTicker })
          .eq('user_id', req.user.id).eq('raw_ticker', h.ticker).then(() => {});
      }
      const nativePrice=q.regularMarketPrice||0, prevClose=q.regularMarketPreviousClose||nativePrice;
      const _isinCcy=h.isin?ISIN_CURRENCY_MAP[h.isin.substring(0,2).toUpperCase()]:null;
      const currency=q.currency||_isinCcy||'SEK';
      const currentValueBase=fromSEK(toSEK(nativePrice*h.quantity,currency)), costBase=fromSEK(toSEK((h.avgPrice||0)*h.quantity,currency)), profitBase=currentValueBase-costBase;
      const mktTime = q.regularMarketTime;
      const priceDate = mktTime
        ? new Date(typeof mktTime === 'number' ? mktTime * 1000 : mktTime).toISOString()
        : (q._fromCache && q._cachedAt ? new Date(q._cachedAt).toISOString() : null);
      return { ticker:resolvedTicker, name:q.longName||q.shortName||h.ticker, cleanName:cleanName(q.longName||q.shortName||h.ticker,resolvedTicker), flag:getFlag(resolvedTicker,h.isin), currency, isin:h.isin||null, quantity:h.quantity, nativePrice, avgPrice:h.avgPrice||0, currentValue:currentValueBase, profit:profitBase, returnPct:costBase>0?(profitBase/costBase)*100:0, todayChangePct:prevClose>0?((nativePrice-prevClose)/prevClose)*100:0, todayGainBase:fromSEK(toSEK((nativePrice-prevClose)*h.quantity,currency)), sector:q.sector||'Unknown', quoteType:q.quoteType, stale:!!q._fromCache, priceDate };
    } catch(e) { log.warn('portfolio quote failed', { ticker: h.ticker, error: e.message }); return null; }
  });
  const results = settled.filter(Boolean);
  const totalValue=results.reduce((s,r)=>s+(r.currentValue??0),0), totalCost=results.reduce((s,r)=>s+fromSEK(toSEK((r.avgPrice||0)*r.quantity,r.currency)),0), totalProfit=totalValue-totalCost;
  const totals = { value:totalValue, cost:totalCost, profit:totalProfit, returnPct:totalCost>0?(totalProfit/totalCost)*100:0 };
  const builtAt = new Date().toISOString();
  res.json({ portfolio:results, totals, hasStalePrices, builtAt });
  // Persist to Supabase so the next login loads instantly with no YF calls
  supabase.from('portfolio_cache').upsert({
    user_id: req.user.id, currency: BC,
    holdings: portfolio,
    dashboard: { portfolio: results, totals, hasStalePrices },
    built_at: builtAt,
  }, { onConflict: 'user_id,currency' }).then(() => {}).catch(() => {});
});

app.get('/api/portfolio/cached', requireUser, async (req, res) => {
  const BC = (req.query.currency || 'SEK').toUpperCase();
  const { data } = await supabase.from('portfolio_cache')
    .select('holdings, dashboard, built_at')
    .eq('user_id', req.user.id).eq('currency', BC).single();
  if (!data) return res.json(null);
  res.json({ ...data.dashboard, holdings: data.holdings, builtAt: data.built_at });
});

app.delete('/api/portfolio/cached', requireUser, async (req, res) => {
  await supabase.from('portfolio_cache').delete().eq('user_id', req.user.id);
  res.json({ success: true });
});

// ── Dividend name resolution ────────────────────────────────────────────────
// Resolves ticker-like dividend names (e.g. "Utdelning EVO 547 SEK/aktie" → stored as "Evolution")
// and writes the resolved company name back to transactions.name so future queries are instant.
async function resolveDividendNames(userId) {
  const { data: divRows } = await supabase.from('transactions')
    .select('id, name, raw_ticker, isin, currency, broker, ticker')
    .eq('user_id', userId)
    .in('type', ['dividend', 'foreign-tax']);
  if (!divRows?.length) return 0;

  const stripDivName = (name) => {
    if (!name) return '';
    let n = name.replace(/^Utdelning\s+/i, '').replace(/^Källskatt\s+/i, '');
    n = n.replace(/\s+[\d,.]+\s+[A-Z]{3}\/aktie.*$/i, '').replace(/\s+-\s+.*$/, '');
    return n.trim();
  };
  const needsResolution = divRows.filter(r => {
    const stripped = stripDivName(r.name || '');
    return /^Utdelning\s+/i.test(r.name || '') || /^Källskatt\s+/i.test(r.name || '') || !/[a-z]/.test(stripped);
  });
  if (!needsResolution.length) return 0;

  // nameMap is shared mutable state; resolveRow reads it at call-time so re-evaluates after each phase
  const nameMap = {};

  // Phase 1: portfolio_cache + buy/sell transactions (instant, no API calls)
  const { data: snap } = await supabase.from('portfolio_cache')
    .select('dashboard').eq('user_id', userId).limit(1).single();
  (snap?.dashboard?.portfolio || []).forEach(h => {
    if (!h.name || !h.ticker) return;
    const n = cleanYFName(h.name);
    if (!/[a-z]/.test(n)) return;
    const base = h.ticker.split('.')[0].toUpperCase();
    if (!nameMap[base]) nameMap[base] = n;
    if (h.isin && !nameMap[h.isin]) nameMap[h.isin] = n;
  });
  const { data: buyTxs } = await supabase.from('transactions')
    .select('isin, raw_ticker, name, ticker')
    .eq('user_id', userId).in('type', ['buy', 'sell']).not('name', 'is', null);
  (buyTxs || []).forEach(t => {
    if (!t.name || !/[a-z]/.test(t.name)) return;
    const n = cleanYFName(t.name);
    if (t.isin && !nameMap[t.isin]) nameMap[t.isin] = n;
    if (t.ticker) { const base = t.ticker.split('.')[0].toUpperCase(); if (!nameMap[base]) nameMap[base] = n; }
    if (t.raw_ticker && !nameMap[t.raw_ticker]) nameMap[t.raw_ticker] = n;
  });

  const resolveRow = (row) => {
    const stripped = stripDivName(row.name);
    const m = stripped.match(/^([A-Z0-9][A-Z0-9.\-]+)\s+([A-Z])$/);
    const base = m ? m[1] : stripped;
    const shareClass = m ? m[2] : null;
    const name = (row.isin && nameMap[row.isin]) || nameMap[base] || (row.raw_ticker && nameMap[row.raw_ticker]) || null;
    return { base, shareClass, name };
  };

  // Phase 2: OpenFIGI batch by ISIN for rows still unresolved
  const p2rows = needsResolution.filter(r => !resolveRow(r).name);
  const missingIsins = [...new Set(p2rows.map(r => r.isin).filter(Boolean))];
  if (missingIsins.length) Object.assign(nameMap, await openFigiNames(missingIsins));

  // Phase 3: OpenFIGI by TICKER+exchange for rows with raw_ticker but no ISIN
  // Tries Nordic/European exchanges (user is primarily SEK-denominated)
  const p3rows = needsResolution.filter(r => !resolveRow(r).name);
  const tickersForFigi = [...new Set(p3rows.map(r => {
    const stripped = stripDivName(r.name);
    const m = stripped.match(/^([A-Z0-9][A-Z0-9.\-]+)\s+[A-Z]$/);
    return (m ? m[1] : stripped) || null;
  }).filter(Boolean))];
  if (tickersForFigi.length) {
    const exchanges = ['SS', 'OMX', 'DC', 'OS', 'FP', 'GR'];
    const batch = tickersForFigi.flatMap(t => exchanges.map(e => ({ idType: 'TICKER', idValue: t, exchCode: e })));
    try {
      const r = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.slice(0, 100)), signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const results = await r.json();
        const seen = new Set();
        results.forEach((result, i) => {
          const raw = result?.data?.[0]?.name;
          const ticker = batch[i]?.idValue;
          if (!raw || !ticker || seen.has(ticker) || nameMap[ticker]) return;
          const cased = raw.split(' ').map(w => w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w).join(' ');
          nameMap[ticker] = cleanYFName(cased);
          seen.add(ticker);
        });
      }
    } catch {}
  }

  // Phase 4: Finnhub search for anything still unresolved (parallel, fast single calls)
  const p4rows = needsResolution.filter(r => !resolveRow(r).name);
  if (p4rows.length) {
    await Promise.all(p4rows.map(async (row) => {
      const stripped = stripDivName(row.name);
      const m = stripped.match(/^([A-Z0-9][A-Z0-9.\-]+)\s+[A-Z]$/);
      const searchTerm = row.isin || (m ? m[1] : stripped);
      if (!searchTerm) return;
      try {
        const results = await finnhubSearch(searchTerm);
        const best = results[0];
        if (best?.description) nameMap[searchTerm] = cleanYFName(best.description);
      } catch {}
    }));
  }

  // Write back all resolved names
  let resolved = 0;
  await Promise.all(needsResolution.map(async (row) => {
    const { base, shareClass, name } = resolveRow(row);
    if (!name) return;
    const finalName = shareClass && !name.includes(shareClass) ? `${name} ${shareClass}` : name;
    if (finalName !== row.name) {
      await supabase.from('transactions').update({ name: finalName }).eq('id', row.id);
      resolved++;
    }
  }));
  log.info('dividend names resolved', { userId, resolved, total: needsResolution.length });
  return resolved;
}

app.post('/api/dividends/fix-names', requireUser, async (req, res) => {
  // Respond immediately — resolution runs in background (avoids request timeout for large datasets)
  res.json({ status: 'running' });
  resolveDividendNames(req.user.id).catch(() => {});
});

// ── Dividends ───────────────────────────────────────────────────────────────
app.get('/api/dividends', requireUser, async (req, res) => {
  const BC = (req.query.currency || 'SEK').toUpperCase();
  const { data: txs } = await supabase.from('transactions').select('date, name, total_sek, isin, broker').eq('user_id', req.user.id).eq('type', 'dividend');
  const divs = (txs||[]).filter(t => t.total_sek);
  let bcRate = 1;
  if (BC !== 'SEK') {
    try {
      const fx = await fetch(`https://api.frankfurter.app/latest?from=SEK&to=${BC}`);
      const fxd = await fx.json();
      if (fxd?.rates?.[BC]) bcRate = fxd.rates[BC];
    } catch(e) {}
  }
  const conv = (sek) => parseFloat((Math.abs(sek) * bcRate).toFixed(2));
  // Fallback: strip Montrose raw description to bare ticker symbol
  const cleanDivName = (name) => {
    if (!name) return 'Unknown';
    let n = name.replace(/^Utdelning\s+/i, '').replace(/^Källskatt\s+/i, '');
    n = n.replace(/\s+[\d,.]+\s+[A-Z]{3}\/aktie.*$/i, '').replace(/\s+-\s+.*$/, '');
    return n.trim() || name;
  };
  // Build name lookup maps from buy/sell transactions (which carry proper company names).
  // Three maps covering all broker combinations:
  //   isinToName      — primary, works whenever dividend row has ISIN (all brokers)
  //   rawTickerToName — Montrose buy/sell rows have raw_ticker; matches Montrose dividends without ISIN
  //   baseTickerToName — keyed by ticker prefix before "." (e.g. "EVO" from "EVO.ST");
  //                      covers Avanza/Nordnet buy rows (raw_ticker='') paired with Montrose dividends
  // Prefer YF longName from price cache (hot for held stocks), then the stored CSV name.
  const isinToName = {};
  const rawTickerToName = {};
  const baseTickerToName = {};
  const isinToBase = {}; // ISIN → base ticker, used for targeted ISIN updates in second pass
  // Seed name maps from last portfolio_cache snapshot — these names were already properly
  // resolved from YF and stored, so they work even when YF is currently unavailable.
  {
    const { data: snap } = await supabase.from('portfolio_cache')
      .select('dashboard').eq('user_id', req.user.id).limit(1).single();
    (snap?.dashboard?.portfolio || []).forEach(h => {
      if (!h.name || !h.ticker) return;
      const name = cleanYFName(h.name);
      const base = h.ticker.split('.')[0].toUpperCase();
      if (h.isin && !isinToName[h.isin]) isinToName[h.isin] = name;
      if (!rawTickerToName[base]) rawTickerToName[base] = name;
      if (!baseTickerToName[base]) baseTickerToName[base] = name;
      if (h.isin && !isinToBase[h.isin]) isinToBase[h.isin] = base;
    });
  }
  const { data: buyTxs } = await supabase.from('transactions')
    .select('isin, raw_ticker, name, ticker')
    .eq('user_id', req.user.id)
    .in('type', ['buy', 'sell'])
    .not('name', 'is', null);
  // First pass: build maps using whatever is in _priceCache right now
  const tickersNeedingLookup = new Map(); // base → full ticker (e.g. "EVO" → "EVO.ST")
  (buyTxs || []).forEach(t => {
    const cached = t.ticker ? _priceCache.get(t.ticker) : null;
    // Skip shortName if it looks like a bare ticker (e.g. "EVO", "VIT") — real company names have lowercase
    const shortName = cached?.q?.shortName;
    const rawDisplayName = cached?.q?.longName ||
      (shortName && /[a-z]/.test(shortName) ? shortName : null) ||
      t.name;
    const displayName = cached ? cleanYFName(rawDisplayName) : rawDisplayName;
    if (t.isin && !isinToName[t.isin]) isinToName[t.isin] = displayName;
    if (t.raw_ticker && !rawTickerToName[t.raw_ticker]) rawTickerToName[t.raw_ticker] = displayName;
    if (t.ticker) {
      const base = t.ticker.split('.')[0].toUpperCase();
      if (!baseTickerToName[base]) baseTickerToName[base] = displayName;
      if (t.isin && !isinToBase[t.isin]) isinToBase[t.isin] = base;
      // Queue a YF lookup if name looks unresolved: no cache at all, or no lowercase letters
      // (real company names always have lowercase; "VIT B", "EVO", "SAGA D" etc. are broker abbreviations)
      if ((!cached || !/[a-z]/.test(displayName)) && !tickersNeedingLookup.has(base)) {
        tickersNeedingLookup.set(base, t.ticker);
      }
    }
  });
  // Second pass: fetch real names via Finnhub profile2 for ticker-like names not yet resolved
  if (tickersNeedingLookup.size > 0) {
    await Promise.all([...tickersNeedingLookup.entries()].map(async ([base, ticker]) => {
      try {
        const name = await finnhubName(ticker);
        if (name) {
          rawTickerToName[base] = name;
          baseTickerToName[base] = name;
          for (const [isin, b] of Object.entries(isinToBase)) {
            // Only overwrite if existing name is ticker-like (no lowercase) — never clobber
            // a good name from portfolio_cache (e.g. "Vitec Software Group B") with an API result
            if (b === base && !/[a-z]/.test(isinToName[isin] || '')) isinToName[isin] = name;
          }
        }
      } catch {}
    }));
  }
  // Third pass: dividend rows whose name is still ticker-like but have no matching buy transaction.
  {
    const seenKeys = new Set();
    const divNeedingLookup = [];
    for (const t of divs) {
      const cleaned = cleanDivName(t.name);
      const isinResolved = t.isin && isinToName[t.isin] && /[a-z]/.test(isinToName[t.isin]);
      const rawResolved = /[a-z]/.test(rawTickerToName[cleaned] || '');
      const baseResolved = /[a-z]/.test(baseTickerToName[cleaned.toUpperCase()] || '');
      if (isinResolved || rawResolved || baseResolved) continue;
      // Allow: plain tickers (EVO), dotted tickers (LVMH.PA, NOVOB.CO), share class suffixes (SAGA D, VIT B)
      if (!/^[A-Z0-9][A-Z0-9.\-]{0,9}(?:\s[A-Z])?$/.test(cleaned)) continue;
      const key = t.isin || cleaned;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      divNeedingLookup.push(t);
    }
    if (divNeedingLookup.length > 0) {
      // Batch-resolve ISINs via OpenFIGI first (free, no key, global, unambiguous)
      const isinBatch = [...new Set(divNeedingLookup.map(t => t.isin).filter(Boolean))];
      const figiMap = await openFigiNames(isinBatch);

      await Promise.all(divNeedingLookup.map(async (t) => {
        const cleaned = cleanDivName(t.name);
        // Strip trailing share class (e.g. "SAGA D" → "SAGA", "VIT B" → "VIT") for symbol lookup
        const shareClassMatch = cleaned.match(/^([A-Z0-9][A-Z0-9.\-]+)\s+[A-Z]$/);
        const lookupSymbol = shareClassMatch ? shareClassMatch[1] : cleaned;
        try {
          // 1. OpenFIGI via ISIN — most reliable, no ambiguity
          const figiName = t.isin ? figiMap[t.isin] : null;
          if (figiName) {
            if (t.isin) isinToName[t.isin] = figiName;
            rawTickerToName[cleaned] = figiName;
            baseTickerToName[cleaned.toUpperCase()] = figiName;
            return;
          }
          // 2. Finnhub search by ISIN only — never search by bare ticker like "VIT" or "SAGA"
          //    because text-based searches match wrong companies without exchange context
          const fhResults = t.isin ? await finnhubSearch(t.isin) : [];
          const best = fhResults[0];
          const nameFromSearch = best?.description ? cleanYFName(best.description) : null;
          // 3. Tiingo/Finnhub profile2 only when ticker has an exchange suffix (e.g. LVMH.PA)
          const hasExchangeSuffix = /\.[A-Z]{1,3}$/.test(lookupSymbol);
          const fhSym = best?.symbol || (hasExchangeSuffix ? toFinnhubSymbol(lookupSymbol) : null);
          const name = nameFromSearch || (fhSym ? await finnhubName(toYFSymbol(fhSym)) : null);
          if (name) {
            if (t.isin) isinToName[t.isin] = name;
            rawTickerToName[cleaned] = name;
            baseTickerToName[cleaned.toUpperCase()] = name;
          }
        } catch {}
      }));
    }
  }
  const resolveName = (t) => {
    const cleaned = cleanDivName(t.name);
    // Extract share class if present (e.g., "Investor A" → base: "Investor", class: "A")
    const shareClassMatch = cleaned.match(/\s+([A-Z])$/);
    const shareClass = shareClassMatch ? shareClassMatch[1] : null;
    const cleanedBase = shareClass ? cleaned.slice(0, -2).trim() : cleaned;

    const byIsin = t.isin ? isinToName[t.isin] : null;
    const byRaw = rawTickerToName[cleaned] || rawTickerToName[cleanedBase];
    const byBase = baseTickerToName[cleanedBase.toUpperCase()] || baseTickerToName[cleaned.toUpperCase()];

    // Prefer any source that looks like a real company name (has lowercase letters)
    let resolvedName = [byIsin, byRaw, byBase].find(n => n && /[a-z]/.test(n)) || byIsin || byRaw || byBase || cleaned;

    // Append share class back if it was present and not already in resolved name
    if (shareClass && resolvedName && !resolvedName.includes(shareClass)) {
      resolvedName = `${resolvedName} ${shareClass}`;
    }
    return resolvedName;
  };
  const thisYear = new Date().getFullYear().toString();
  const totalAllTime = divs.reduce((s,t)=>s+conv(t.total_sek),0);
  const totalThisYear = divs.filter(t=>t.date?.startsWith(thisYear)).reduce((s,t)=>s+conv(t.total_sek),0);
  const brokers = [...new Set(divs.map(t => t.broker).filter(Boolean))];
  const byYear = {};
  divs.forEach(t => { const y=t.date?.substring(0,4); if(!y) return; if(!byYear[y]) byYear[y]={year:y,total:0,stocks:{}}; byYear[y].total+=conv(t.total_sek); const n=resolveName(t); byYear[y].stocks[n]=(byYear[y].stocks[n]||0)+conv(t.total_sek); });
  const byYearArr = Object.values(byYear).sort((a,b)=>b.year.localeCompare(a.year)).map(y=>({...y,stocks:Object.entries(y.stocks).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total)}));
  const byStock = {};
  divs.forEach(t => { const n=resolveName(t); byStock[n]=(byStock[n]||0)+conv(t.total_sek); });
  res.json({ totalAllTime, totalThisYear, byYear:byYearArr, byStock:Object.entries(byStock).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total), display_currency: BC, brokers, dividends: divs.map(t => ({ date: t.date, name: resolveName(t), total: conv(t.total_sek), broker: t.broker })) });
});

// Public dividends endpoint
app.get('/api/users/:username/dividends', async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('id, public_dividends').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  if (!profile.public_dividends) return res.status(403).json({ error: "This user's dividends are private." });
  
  const { data: txs } = await supabase.from('transactions').select('date, name, total_sek').eq('user_id', profile.id).eq('type', 'dividend');
  const divs = (txs||[]).filter(t => t.total_sek);
  const thisYear = new Date().getFullYear().toString();
  const totalAllTime = divs.reduce((s,t)=>s+Math.abs(t.total_sek),0);
  const totalThisYear = divs.filter(t=>t.date?.startsWith(thisYear)).reduce((s,t)=>s+Math.abs(t.total_sek),0);
  const byYear = {};
  divs.forEach(t => { const y=t.date?.substring(0,4); if(!y) return; if(!byYear[y]) byYear[y]={year:y,total:0,stocks:{}}; byYear[y].total+=Math.abs(t.total_sek); const n=t.name||'Unknown'; byYear[y].stocks[n]=(byYear[y].stocks[n]||0)+Math.abs(t.total_sek); });
  const byYearArr = Object.values(byYear).sort((a,b)=>b.year.localeCompare(a.year)).map(y=>({...y,stocks:Object.entries(y.stocks).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total)}));
  const byStock = {};
  divs.forEach(t => { const n=t.name||'Unknown'; byStock[n]=(byStock[n]||0)+Math.abs(t.total_sek); });
  res.json({ totalAllTime, totalThisYear, byYear:byYearArr, byStock:Object.entries(byStock).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total) });
});

// Public CS trades endpoint — requires public_cs_trades column: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_cs_trades BOOLEAN DEFAULT FALSE;
app.get('/api/users/:username/cs-trades', async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('id, public_cs_trades').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  if (!profile.public_cs_trades) return res.status(403).json({ error: "This user's CS trades are private." });
  const { data, error } = await supabase.from('cs_inventory')
    .select('id, skin_name, exterior, float_value, purchase_price, purchase_currency, purchase_date, sold, screenshot_url, cs_sales(sale_price, sale_currency, sale_date, screenshot_url)')
    .eq('user_id', profile.id)
    .order('purchase_date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(item => ({
    id: item.id,
    skinName: item.skin_name,
    exterior: item.exterior,
    floatValue: item.float_value,
    purchasePrice: item.purchase_price,
    purchaseCurrency: item.purchase_currency,
    purchaseDate: item.purchase_date,
    sold: item.sold,
    salePrice: item.cs_sales?.[0]?.sale_price ?? null,
    saleCurrency: item.cs_sales?.[0]?.sale_currency ?? null,
    saleDate: item.cs_sales?.[0]?.sale_date ?? null,
    screenshotUrl: item.screenshot_url || item.cs_sales?.[0]?.screenshot_url || null,
  })));
});

app.get('/api/users/:username/friends', async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('id').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
    .eq('status', 'accepted');
  const friendIds = (friendships || []).map(f => f.requester_id === profile.id ? f.addressee_id : f.requester_id);
  if (!friendIds.length) return res.json([]);
  const { data: friends } = await supabase.from('profiles').select('username, avatar_base64, role').in('id', friendIds);
  res.json((friends || []).map(p => ({ username: p.username, avatarBase64: p.avatar_base64, role: p.role })));
});

// ── Overrides ───────────────────────────────────────────────────────────────
app.get('/api/overrides', requireUser, async (req, res) => {
  const [{ data: global }, { data: user }] = await Promise.all([
    supabase.from('global_ticker_overrides').select('isin, ticker').eq('active', true),
    supabase.from('ticker_overrides').select('isin, ticker').eq('user_id', req.user.id),
  ]);
  res.json({ global: global || [], user: user || [] });
});

app.post('/api/overrides', requireUser, async (req, res) => {
  const { isin, ticker } = req.body;
  if (!isin || !ticker) return res.status(400).json({ error: 'isin and ticker required' });
  await supabase.from('ticker_overrides').upsert({ user_id:req.user.id, isin:isin.toUpperCase(), ticker:ticker.toUpperCase() });
  await supabase.from('ticker_cache').delete().eq('user_id', req.user.id).like('cache_key', `%${isin}%`);
  res.json({ success: true });
});

app.delete('/api/overrides/:isin', requireUser, async (req, res) => {
  await supabase.from('ticker_overrides').delete().eq('user_id', req.user.id).eq('isin', req.params.isin);
  res.json({ success: true });
});

// ── Global overrides (admin/mod) ─────────────────────────────────────────────
app.get('/api/admin/global-overrides', requireModerator, async (req, res) => {
  const { data, error } = await supabase.from('global_ticker_overrides').select('isin, ticker, active, created_by, created_at').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const enriched = await Promise.all((data || []).map(async o => {
    try {
      const cached = _priceCache.get(o.ticker);
      const q = cached ? cached.q : await finnhubQuote(o.ticker).catch(() => null);
      return { ...o, name: q?.longName || q?.shortName || null };
    } catch(e) {
      return { ...o, name: null };
    }
  }));
  res.json(enriched);
});

app.patch('/api/admin/global-overrides/:isin/toggle', requireModerator, async (req, res) => {
  const { data: current, error } = await supabase.from('global_ticker_overrides').select('active').eq('isin', req.params.isin).single();
  if (error || !current) return res.status(404).json({ error: 'Not found' });
  await supabase.from('global_ticker_overrides').update({ active: !current.active }).eq('isin', req.params.isin);
  res.json({ active: !current.active });
});

app.post('/api/admin/global-overrides', requireModerator, async (req, res) => {
  const { isin, ticker } = req.body;
  if (!isin || !ticker) return res.status(400).json({ error: 'isin and ticker required' });
  const { error } = await supabase.from('global_ticker_overrides').upsert({ isin: isin.toUpperCase(), ticker: ticker.toUpperCase(), created_by: req.username, created_at: new Date().toISOString() });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete('/api/admin/global-overrides/:isin', requireModerator, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });
  const email = `${req.username.toLowerCase()}@statera.local`;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Incorrect password' });
  await supabase.from('global_ticker_overrides').delete().eq('isin', req.params.isin);
  res.json({ success: true });
});

app.delete('/api/admin/global-overrides', requireModerator, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const email = `${req.username.toLowerCase()}@statera.local`;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Incorrect password' });
  await supabase.from('global_ticker_overrides').delete().neq('isin', '');
  res.json({ success: true });
});

// ── Ownership ───────────────────────────────────────────────────────────────
app.post('/api/ownership', requireUser, async (req, res) => {
  const { tickers } = req.body;
  if (!tickers?.length) return res.json([]);
  const results = [];
  for (const { ticker, name } of tickers) {
    try {
      results.push({ ticker, name, noData: true }); continue; // ownership data requires premium API
      // eslint-disable-next-line no-unreachable
    } catch(e) { results.push({ ticker, name, error:true }); }
    await new Promise(r => setTimeout(r, 200));
  }
  res.json(results);
});

app.get('/api/ownership/search/:query', requireUser, async (req, res) => {
  try {
    const results = await finnhubSearch(req.params.query);
    res.json(results.filter(r => r.symbol && (r.type === 'Common Stock' || r.type === 'ETP')).slice(0, 8)
      .map(r => ({ ticker: toYFSymbol(r.symbol), name: r.description, exchange: r.symbol.includes(':') ? r.symbol.split(':')[1] : 'US' })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Performance history ─────────────────────────────────────────────────────
app.post('/api/history', requireUser, async (req, res) => {
  const { portfolio, baseCurrency, period } = req.body;
  if (!portfolio?.length) return res.json([]);
  const days = { '1W':7,'1M':30,'3M':90,'1Y':365,'3Y':1095 }[period]||90;
  const startDate = new Date(); startDate.setDate(startDate.getDate()-days);
  const priceHistory = {};
  try {
    for (const h of portfolio) {
      try {
        const fhSym = toFinnhubSymbol(h.ticker);
        const from = Math.floor(startDate.getTime() / 1000);
        const to = Math.floor(Date.now() / 1000);
        const hist = await finnhubFetch(`/stock/candle?symbol=${encodeURIComponent(fhSym)}&resolution=D&from=${from}&to=${to}`);
        priceHistory[h.ticker] = {};
        if (hist?.s === 'ok' && hist.t) {
          hist.t.forEach((ts, i) => { priceHistory[h.ticker][new Date(ts * 1000).toISOString().split('T')[0]] = hist.c[i]; });
        }
      } catch {}
      await new Promise(r => setTimeout(r, 150));
    }
  } catch(e) {}
  const allDates = new Set(Object.values(priceHistory).flatMap(d=>Object.keys(d)));
  const sortedDates = [...allDates].sort();
  if (sortedDates.length < 2) return res.json([]);
  const nearest=(ticker,date)=>{ if(priceHistory[ticker]?.[date]) return priceHistory[ticker][date]; const n=Object.keys(priceHistory[ticker]||{}).filter(d=>d<=date).sort().pop(); return n?priceHistory[ticker][n]:null; };
  const points=[];
  for (const date of sortedDates) { let v=0; for (const item of portfolio) { const p=nearest(item.ticker,date); if(p) v+=p*item.quantity; } if(v>0) points.push({ date, value:v }); }
  if (points.length < 2) return res.json([]);
  const baseValue = points[0].value;
  res.json(points.map(p=>({ date:p.date, returnPct:parseFloat(((p.value-baseValue)/baseValue*100).toFixed(2)) })));
});

// ── Activity helpers ────────────────────────────────────────────────────────
async function appendActivity(userId, type, payload={}) { await supabase.from('activity').insert({ user_id:userId, type, payload }); }
async function appendModLog(moderator, action, targetUser, details='') { await supabase.from('moderation_log').insert({ moderator, action, target_user:targetUser, details }); }

// ── Friends ─────────────────────────────────────────────────────────────────
app.get('/api/friends', requireUser, async (req, res) => {
  const userId = req.user.id;
  const { data: all } = await supabase.from('friendships').select('requester_id, addressee_id, status').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  const accepted=(all||[]).filter(f=>f.status==='accepted'), incoming=(all||[]).filter(f=>f.status==='pending'&&f.addressee_id===userId), outgoing=(all||[]).filter(f=>f.status==='pending'&&f.requester_id===userId);
  const getProfiles = async (ids) => { if(!ids.length) return []; const { data } = await supabase.from('profiles').select('id, username, avatar_base64, bio, role').in('id', ids); return data||[]; };
  const friendIds=accepted.map(f=>f.requester_id===userId?f.addressee_id:f.requester_id);
  const [fp, ip, op] = await Promise.all([getProfiles(friendIds), getProfiles(incoming.map(f=>f.requester_id)), getProfiles(outgoing.map(f=>f.addressee_id))]);
  const fmt=p=>({ username:p.username, avatarBase64:p.avatar_base64, bio:p.bio, role:p.role });
  res.json({ friends:fp.map(fmt), incoming:ip.map(fmt), outgoing:op.map(p=>p.username) });
});

app.get('/api/friends/pending-count', requireUser, async (req, res) => {
  const { count } = await supabase.from('friendships').select('*', { count:'exact', head:true }).eq('addressee_id', req.user.id).eq('status', 'pending');
  res.json({ count:count||0 });
});

app.post('/api/friends/request/:username', requireUser, async (req, res) => {
  const { data: target } = await supabase.from('profiles').select('id').eq('username', req.params.username).single();
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot friend yourself.' });
  const { data: reverse } = await supabase.from('friendships').select('id').eq('requester_id', target.id).eq('addressee_id', req.user.id).eq('status', 'pending').single();
  if (reverse) { await supabase.from('friendships').update({ status:'accepted' }).eq('id', reverse.id); await Promise.all([appendActivity(req.user.id,'friend_added',{ targetUser:req.params.username }),appendActivity(target.id,'friend_added',{ targetUser:req.username })]); return res.json({ success:true, status:'accepted' }); }
  const { error } = await supabase.from('friendships').insert({ requester_id:req.user.id, addressee_id:target.id, status:'pending' });
  if (error) return res.status(400).json({ error:error.message });
  res.json({ success:true, status:'requested' });
});

app.post('/api/friends/accept/:username', requireUser, async (req, res) => {
  const { data: sender } = await supabase.from('profiles').select('id').eq('username', req.params.username).single();
  if (!sender) return res.status(404).json({ error: 'User not found.' });
  await supabase.from('friendships').update({ status:'accepted' }).eq('requester_id', sender.id).eq('addressee_id', req.user.id).eq('status', 'pending');
  await Promise.all([appendActivity(req.user.id,'friend_added',{ targetUser:req.params.username }),appendActivity(sender.id,'friend_added',{ targetUser:req.username })]);
  res.json({ success:true });
});

app.post('/api/friends/decline/:username', requireUser, async (req, res) => {
  const { data: sender } = await supabase.from('profiles').select('id').eq('username', req.params.username).single();
  if (!sender) return res.status(404).json({ error: 'User not found.' });
  await supabase.from('friendships').delete().eq('requester_id', sender.id).eq('addressee_id', req.user.id);
  res.json({ success:true });
});

app.post('/api/friends/remove/:username', requireUser, async (req, res) => {
  const { data: target } = await supabase.from('profiles').select('id').eq('username', req.params.username).single();
  if (!target) return res.status(404).json({ error: 'User not found.' });
  await supabase.from('friendships').delete().or(`and(requester_id.eq.${req.user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${req.user.id})`);
  res.json({ success:true });
});

// ── Activity feed ───────────────────────────────────────────────────────────
app.get('/api/feed', requireUser, async (req, res) => {
  try {
    // Fetch all friendships involving this user, filter accepted in JS
    // (chaining .or() + .eq() in Supabase can produce unexpected results)
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`);

    const friendIds = (friendships||[])
      .filter(f => f.status === 'accepted')
      .map(f => f.requester_id === req.user.id ? f.addressee_id : f.requester_id);

    const allIds = [...new Set([...friendIds, req.user.id])];

    const [{ data: activity }, { data: profiles }] = await Promise.all([
      supabase.from('activity').select('id, user_id, type, payload, created_at').in('user_id', allIds).order('created_at', { ascending:false }).limit(50),
      supabase.from('profiles').select('id, username, avatar_base64, role').in('id', allIds),
    ]);

    const profileMap = {};
    (profiles||[]).forEach(p => { profileMap[p.id] = p; });

    res.json((activity||[]).map(a => {
      const profile = profileMap[a.user_id] || {};
      const payload = a.payload || {};
      return { ...payload, id: a.id, type: a.type, createdAt: a.created_at, username: profile.username, avatarBase64: profile.avatar_base64, role: profile.role };
    }));
  } catch(e) {
    log.error('feed failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/activity/mine', requireUser, async (req, res) => {
  const { data } = await supabase.from('activity').select('*').eq('user_id', req.user.id).order('created_at', { ascending:false }).limit(50);
  res.json(data||[]);
});

// Get a specific user's public activity
app.get('/api/users/:username/activity', requireUser, async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('id, username').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  const { data: activities } = await supabase.from('activity').select('*').eq('user_id', profile.id).order('created_at', { ascending:false }).limit(10);
  res.json((activities || []).map(a => {
    const payload = a.payload || {};
    return { ...payload, id: a.id, type: a.type, created_at: a.created_at, username: profile.username };
  }));
});

app.post('/api/activity/screenshot', requireUser, async (req, res) => {
  const { skinName, caption, imageBase64 } = req.body;
  if (!skinName) return res.status(400).json({ error: 'Skin name required.' });
  if (imageBase64 && imageBase64.length > 1.5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large. Maximum 1.5 MB.' });
  await appendActivity(req.user.id, 'skin_screenshot', { skinName: skinName||'Unknown skin', caption: caption||'', imageBase64: imageBase64||null });
  res.json({ success:true });
});

app.delete('/api/activity/:id', requireUser, async (req, res) => {
  await supabase.from('activity').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ success:true });
});

// ── Announcements ───────────────────────────────────────────────────────────
app.get('/api/announcements', async (req, res) => {
  const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending:false }).limit(10);
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
  const entry = (descriptions || []).find(d => d.value?.includes('sticker_info'));
  if (!entry) return [];
  const icons = [...entry.value.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  // Try "Sticker: A, B" / "Patch: A, B" / "Autograph: A" label format
  const labelMatch = entry.value.match(/(?:Stickers?|Patches?|Autograph):\s*([^<]+)/i);
  if (labelMatch) {
    const names = labelMatch[1].trim().split(/,\s*/);
    return icons.map((url, i) => ({ url, name: (names[i] || '').trim() }));
  }
  // Fallback: strip all HTML tags and extract non-empty text fragments
  const textFragments = entry.value.replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
  return icons.map((url, i) => ({ url, name: (textFragments[i] || '').trim() }));
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

// ── CS routes ───────────────────────────────────────────────────────────────
app.get('/api/cs/settings', requireUser, async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('steam_id').eq('id', req.user.id).single();
  res.json({ steam_id:profile?.steam_id||'' });
});

app.post('/api/cs/settings', requireUser, async (req, res) => {
  const { key, value } = req.body;
  if (key === 'steam_id') await supabase.from('profiles').update({ steam_id:value }).eq('id', req.user.id);
  res.json({ success:true });
});

let lastPriceSyncAt = null;
let steamPriceLookupRunning = false;

async function runPriceSync() {
  try {
    const r = await fetch('https://api.skinport.com/v1/items?app_id=730&currency=SEK');
    if (!r.ok) { log.error('cs prices sync: skinport error', { status: r.status }); return; }

    const items = await r.json();
    if (!Array.isArray(items)) { log.error('cs prices sync: unexpected skinport response'); return; }

    let sekPerUsd = 10.5;
    try {
      const fx = await fetch('https://api.frankfurter.app/latest?from=USD&to=SEK');
      const fxData = await fx.json();
      sekPerUsd = fxData?.rates?.SEK || sekPerUsd;
    } catch(e) {}

    const now = new Date().toISOString();
    const entries = items
      .filter(i => i.market_hash_name)
      .filter(i => (i.suggested_price || i.min_price || 0) > 0)
      .map(i => ({
        skin_name: i.market_hash_name,
        price_sek: i.suggested_price || i.min_price || 0,
        price_usd: parseFloat(((i.suggested_price || i.min_price || 0) / sekPerUsd).toFixed(2)),
        last_updated: now,
      }));

    const CHUNK = 500;
    await Promise.all(
      Array.from({ length: Math.ceil(entries.length / CHUNK) }, (_, i) =>
        supabase.from('cs_price_cache').upsert(entries.slice(i * CHUNK, (i + 1) * CHUNK), { onConflict: 'skin_name' })
      )
    );

    log.info('cs prices sync completed', { count: entries.length, sekRate: sekPerUsd });
    lastPriceSyncAt = Date.now();
  } catch(e) {
    log.error('cs prices sync failed', { error: e.message });
  }
}

// Daily automatic price sync — runs 1 min after boot, then every 24 hours
setTimeout(runPriceSync, 60 * 1000);
setInterval(runPriceSync, 24 * 60 * 60 * 1000).unref();

app.get('/api/cs/prices/last-sync', requireUser, (req, res) => {
  res.json({ lastSync: lastPriceSyncAt });
});

const SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

app.post('/api/cs/prices/sync', requireUser, async (req, res) => {
  const isPrivileged = req.role === 'admin' || req.role === 'moderator';
  if (!isPrivileged && lastPriceSyncAt && Date.now() - lastPriceSyncAt < SYNC_COOLDOWN_MS) {
    const minAgo = Math.floor((Date.now() - lastPriceSyncAt) / 60000);
    return res.json({ success: false, cooldown: true, error: `Prices were synced ${minAgo} minute(s) ago. Please wait before syncing again.` });
  }
  // Respond immediately — upserts run in background to avoid Vercel's 10s proxy timeout
  res.json({ success: true, count: 0, source: 'skinport', syncing: true });
  setImmediate(runPriceSync);
});

app.get('/api/cs/prices/search/:query', requireUser, async (req, res) => {
  const BC = (req.query.currency || 'SEK').toUpperCase();
  const { data } = await supabase.from('cs_price_cache').select('skin_name, price_usd, price_sek').ilike('skin_name', `%${req.params.query}%`).limit(20);
  if (!data) return res.json([]);
  let bcRate = 1;
  if (BC !== 'SEK') {
    try {
      const fx = await fetch(`https://api.frankfurter.app/latest?from=SEK&to=${BC}`);
      const fxd = await fx.json();
      if (fxd?.rates?.[BC]) bcRate = fxd.rates[BC];
    } catch(e) {}
  }
  res.json(data.map(r => ({ ...r, price: parseFloat(((r.price_sek || 0) * bcRate).toFixed(2)) })));
});

app.get('/api/cs/prices/overrides', requireUser, async (req, res) => {
  const { data, error } = await supabase.from('cs_price_overrides').select('skin_name, price_sek').eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/cs/prices/override', requireUser, async (req, res) => {
  const { skin_name, price, currency } = req.body;
  if (!skin_name || price == null || isNaN(price)) return res.status(400).json({ error: 'skin_name and numeric price required' });
  const price_sek = await toSEK(parseFloat(price), currency || 'SEK');
  const { error } = await supabase.from('cs_price_overrides').upsert(
    { user_id: req.user.id, skin_name, price_sek },
    { onConflict: 'user_id,skin_name' }
  );
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete('/api/cs/prices/override/:skinName', requireUser, async (req, res) => {
  const { error } = await supabase.from('cs_price_overrides').delete()
    .eq('user_id', req.user.id).eq('skin_name', decodeURIComponent(req.params.skinName));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});


app.get('/api/cs/steam/inventory/:steamId', requireUser, async (req, res) => {
  if (!/^\d{17}$/.test(req.params.steamId)) return res.status(400).json({ error: 'Invalid Steam ID' });
  const BC = (req.query.currency || 'SEK').toUpperCase();
  try {
    const data = await fetchJSON(`https://steamcommunity.com/inventory/${req.params.steamId}/730/2?l=english&count=500`);
    if (!data?.assets) return res.status(404).json({ error:'Inventory not found or private' });
    const descMap = {};
    (data.descriptions||[]).forEach(d=>{ descMap[`${d.classid}_${d.instanceid}`]=d; });
    const names = (data.assets||[]).map(a=>{ const d=descMap[`${a.classid}_${a.instanceid}`]; return d?.market_hash_name||d?.name||'Unknown'; }).filter(n=>n!=='Unknown');
    const [{ data: prices }, { data: overrideRows }] = await Promise.all([
      supabase.from('cs_price_cache').select('skin_name, price_sek, last_updated').in('skin_name', names),
      supabase.from('cs_price_overrides').select('skin_name, price_sek').eq('user_id', req.user.id),
    ]);
    const priceMap = {};
    (prices||[]).forEach(p=>{ priceMap[p.skin_name] = p; });
    const overrideMap = {};
    (overrideRows||[]).forEach(o=>{ overrideMap[o.skin_name] = o.price_sek; });

    const uniqueNames = [...new Set(names)];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allMissing = uniqueNames.filter(n =>
      !overrideMap[n] &&
      (!priceMap[n] || new Date(priceMap[n].last_updated).getTime() < sevenDaysAgo)
    );

    // Shared Steam Market fetch helpers
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    let usdToSek = 10.5;
    let bcRate = 1; // SEK→BC conversion rate (populated after usdToSek fetch)
    if (allMissing.length > 0 || BC !== 'SEK') {
      try {
        const targets = BC !== 'SEK' ? `SEK,${BC}` : 'SEK';
        const fx = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${targets}`);
        const fxd = await fx.json();
        usdToSek = fxd?.rates?.SEK || usdToSek;
        if (BC !== 'SEK' && fxd?.rates?.[BC]) bcRate = (fxd.rates[BC]) / usdToSek;
      } catch(e) {}
    }

    const steamPrice = async (name) => {
      const encoded = encodeURIComponent(name);

      // 1. priceoverview — median of recent sales, fast, works for most items
      try {
        const r = await fetch(
          `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encoded}`,
          { headers: { 'User-Agent': UA } }
        );
        if (r.ok) {
          let d; try { d = JSON.parse(await r.text()); } catch(e) {}
          if (d?.success) {
            const raw = d.median_price || d.lowest_price;
            if (raw) { const usd = parseFloat(raw.replace(/[^0-9.]/g, '')); if (usd > 0) return usd; }
          }
        }
      } catch(e) {}

      await new Promise(r => setTimeout(r, 300));

      // 2. pricehistory — actual completed sales
      // Works unauthenticated for popular items; rare items may require a Steam session.
      // High volume (5+ recent sales): average last 10 to smooth anomalies.
      // Low volume (<5 sales): use only the most recent sale — averaging old sparse
      // sales gives a worse estimate than the latest transaction price.
      try {
        const r = await fetch(
          `https://steamcommunity.com/market/pricehistory/?appid=730&currency=1&market_hash_name=${encoded}`,
          { headers: { 'User-Agent': UA } }
        );
        if (r.ok) {
          let d; try { d = JSON.parse(await r.text()); } catch(e) {}
          if (d?.success && Array.isArray(d.prices) && d.prices.length > 0) {
            const recent = d.prices.slice(-10);
            const price = recent.length >= 5
              ? recent.reduce((s, p) => s + parseFloat(p[1]), 0) / recent.length
              : parseFloat(recent[recent.length - 1][1]);
            if (price > 0) return price;
          }
        }
      } catch(e) {}

      await new Promise(r => setTimeout(r, 300));

      // 3. listings/render — lowest current ask
      try {
        const r = await fetch(
          `https://steamcommunity.com/market/listings/730/${encoded}/render/?start=0&count=1&currency=1&language=english&format=json`,
          { headers: { 'User-Agent': UA } }
        );
        if (r.ok) {
          let d; try { d = JSON.parse(await r.text()); } catch(e) {}
          if (d?.success && d.listinginfo) {
            const listing = Object.values(d.listinginfo)[0];
            if (listing) { const usd = (listing.converted_price + listing.converted_fee) / 100; if (usd > 0) return usd; }
          }
        }
      } catch(e) {}

      await new Promise(r => setTimeout(r, 300));

      // 4. HTML listing page — extract var line1 graph data (last recorded sale price).
      // Steam embeds historical sale prices as inline JS on the public listing page,
      // accessible without auth. currency=1 forces USD so the value is directly usable.
      try {
        const r = await fetch(
          `https://steamcommunity.com/market/listings/730/${encoded}?currency=1&l=english`,
          { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } }
        );
        if (r.ok) {
          const html = await r.text();
          const match = html.match(/var line1\s*=\s*(\[[\s\S]*?\]);?/);
          if (match) {
            const data = JSON.parse(match[1]);
            if (Array.isArray(data) && data.length > 0) {
              const price = parseFloat(data[data.length - 1][1]);
              if (price > 0) return price;
            }
          }
        }
      } catch(e) {}

      await new Promise(r => setTimeout(r, 300));

      // 5. CSFloat marketplace — lowest current ask, no API key required.
      // Covers items above Steam's ~$1,800 price cap (Dragon Lore, Howl, etc.)
      // where all Steam Market endpoints return nothing.
      try {
        const r = await fetch(
          `https://csfloat.com/api/v1/listings?market_hash_name=${encoded}&limit=1&sort_by=price&order=asc`,
          { headers: { 'User-Agent': UA } }
        );
        if (r.ok) {
          let d; try { d = JSON.parse(await r.text()); } catch(e) {}
          if (Array.isArray(d?.data) && d.data.length > 0) {
            const usd = d.data[0].price / 100;
            if (usd > 0) return usd;
          }
        }
      } catch(e) {}

      return null;
    };

    const cacheEntries = async (entries) => {
      if (!entries.length) return;
      const now = new Date().toISOString();
      await supabase.from('cs_price_cache').upsert(
        entries.map(e => ({ skin_name: e.name, price_sek: e.sek, price_usd: e.usd, last_updated: now })),
        { onConflict: 'skin_name' }
      );
    };

    // Sync: fetch first 5 missing items before responding so prices show on first load
    const syncBatch = allMissing.slice(0, 5);
    const bgBatch = allMissing.slice(5);

    if (syncBatch.length > 0) {
      const syncEntries = [];
      const syncFailed = [];
      for (const name of syncBatch) {
        const usd = await steamPrice(name);
        if (usd) { const sek = parseFloat((usd * usdToSek).toFixed(2)); syncEntries.push({ name, usd, sek }); priceMap[name] = { price_sek: sek }; }
        else { syncFailed.push(name); }
        await new Promise(r => setTimeout(r, 500));
      }
      const syncNow = new Date().toISOString();
      setImmediate(async () => {
        await cacheEntries(syncEntries);
        if (syncFailed.length > 0) await supabase.from('cs_price_cache').upsert(
          syncFailed.map(n => ({ skin_name: n, price_sek: 0, price_usd: 0, last_updated: syncNow })),
          { onConflict: 'skin_name' }
        );
      });
    }

    const buildItems = () => (data.assets||[]).map(asset => {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`];
      const name = desc?.market_hash_name || desc?.name || 'Unknown';
      const tags = parseSteamTags(desc?.tags);
      const stickers = parseSteamStickers(desc?.descriptions);
      const priceSEK = overrideMap[name] ?? priceMap[name]?.price_sek ?? 0;
      return {
        assetId: asset.assetid, name,
        iconUrl: desc?.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/360x360` : null,
        tradable: desc?.tradable === 1, type: desc?.type || '',
        price: parseFloat((priceSEK * bcRate).toFixed(2)),
        isOverride: name in overrideMap,
        exterior: tags.exterior || null, quality: tags.quality || null,
        rarity: tags.rarity || null, rarityColor: tags.rarityColor || null, stickers,
      };
    }).filter(i => i.name !== 'Unknown');

    const items = buildItems();
    res.json({ items, totalValue: items.reduce((s,i)=>s+i.price,0), count: items.length, pricingPending: bgBatch.length > 0, display_currency: BC });

    // Background: fetch remaining items after response — skip if a job is already running
    if (bgBatch.length > 0 && !steamPriceLookupRunning) {
      setImmediate(async () => {
        steamPriceLookupRunning = true;
        try {
          const bgEntries = [];
          const bgFailed = [];
          for (const name of bgBatch) {
            const usd = await steamPrice(name);
            if (usd) bgEntries.push({ name, usd, sek: parseFloat((usd * usdToSek).toFixed(2)) });
            else bgFailed.push(name);
            await new Promise(r => setTimeout(r, 700));
          }
          await cacheEntries(bgEntries);
          if (bgEntries.length > 0) log.info('steam bg price fallback cached', { count: bgEntries.length });
          if (bgFailed.length > 0) {
            const bgNow = new Date().toISOString();
            await supabase.from('cs_price_cache').upsert(
              bgFailed.map(n => ({ skin_name: n, price_sek: 0, price_usd: 0, last_updated: bgNow })),
              { onConflict: 'skin_name' }
            );
          }
        } finally { steamPriceLookupRunning = false; }
      });
    }
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/cs/inventory', requireUser, async (req, res) => {
  const BC = (req.query.currency || 'SEK').toUpperCase();
  const { data, error } = await supabase.from('cs_inventory').select('*, cs_sales(*)').eq('user_id', req.user.id).order('purchase_date', { ascending:false });
  if (error) { log.error('cs_inventory GET failed', { error: error.message, userId: req.user.id }); return res.status(500).json({ error: error.message }); }
  const items = data || [];
  const names = [...new Set(items.map(i => i.skin_name))];
  let priceMap = {};
  if (names.length > 0) {
    const { data: prices } = await supabase.from('cs_price_cache').select('skin_name, price_sek, price_usd').in('skin_name', names);
    (prices || []).forEach(p => { priceMap[p.skin_name] = p; });
  }
  // Build FX: sale currencies + BC if not SEK. fxFromSEK[cur] = how many `cur` per 1 SEK.
  const saleCurrencies = [...new Set(items.map(i => i.cs_sales?.[0]?.sale_currency).filter(c => c && c !== 'SEK'))];
  const needFX = [...new Set([...saleCurrencies, ...(BC !== 'SEK' ? [BC] : [])])];
  const fxFromSEK = { SEK: 1 };
  if (needFX.length > 0) {
    try {
      const fx = await fetch(`https://api.frankfurter.app/latest?from=SEK&to=${needFX.join(',')}`);
      const fxd = await fx.json();
      Object.entries(fxd.rates || {}).forEach(([cur, rate]) => { fxFromSEK[cur] = rate; });
    } catch(e) {}
  }
  const bcRate = fxFromSEK[BC] || 1;
  const sekToBC = (sekAmt) => sekAmt != null ? parseFloat(((sekAmt || 0) * bcRate).toFixed(2)) : null;
  const salePriceBC = (item) => {
    const sale = item.cs_sales?.[0];
    if (!sale?.sale_price) return null;
    const saleCur = sale.sale_currency || 'SEK';
    const toSEKRate = saleCur === 'SEK' ? 1 : (1 / (fxFromSEK[saleCur] || 1));
    return parseFloat((sale.sale_price * toSEKRate * bcRate).toFixed(2));
  };
  res.json(items.map(item => ({
    ...item,
    current_price: sekToBC(priceMap[item.skin_name]?.price_sek || 0),
    purchase_price_display: sekToBC(item.purchase_price_sek || item.purchase_price),
    sale_price_display: salePriceBC(item),
    sale_price: item.cs_sales?.[0]?.sale_price,
    sale_currency: item.cs_sales?.[0]?.sale_currency || null,
    sale_date: item.cs_sales?.[0]?.sale_date,
    display_currency: BC,
  })));
});

async function toSEK(amount, currency) {
  if (!amount) return 0;
  if (!currency || currency === 'SEK') return parseFloat(amount);
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=SEK`);
    const d = await r.json();
    const rate = d?.rates?.SEK;
    return rate ? parseFloat(amount) * rate : parseFloat(amount);
  } catch(e) { return parseFloat(amount); }
}

app.post('/api/cs/inventory', requireUser, async (req, res) => {
  const { skin_name, exterior, float_value, pattern, purchase_price, purchase_currency, purchase_date, notes, screenshot_url, steam_asset_id } = req.body;
  if (!skin_name||!purchase_date) return res.status(400).json({ error:'skin_name and purchase_date required' });
  const purchase_price_sek = await toSEK(purchase_price, purchase_currency);
  const { data, error } = await supabase.from('cs_inventory').insert({ user_id:req.user.id, skin_name, exterior, float_value, pattern, purchase_price:purchase_price||0, purchase_currency:purchase_currency||'SEK', purchase_price_sek, purchase_date, notes, screenshot_url:screenshot_url||null, steam_asset_id:steam_asset_id||null }).select().single();
  if (error) return res.status(500).json({ error:error.message });
  await appendActivity(req.user.id, 'cs_trade', { action:'buy', skinName:skin_name, price:purchase_price, currency:purchase_currency, exterior });
  res.json({ id:data.id, success:true });
});

app.put('/api/cs/inventory/:id', requireUser, async (req, res) => {
  const { skin_name, exterior, float_value, pattern, purchase_price, purchase_currency, purchase_date, notes, screenshot_url, steam_asset_id } = req.body;
  if (!skin_name || !purchase_date) return res.status(400).json({ error: 'skin_name and purchase_date required' });
  const { data: existing } = await supabase.from('cs_inventory').select('skin_name, screenshot_url').eq('id', req.params.id).eq('user_id', req.user.id).single();
  const purchase_price_sek = await toSEK(purchase_price, purchase_currency);
  const { error } = await supabase.from('cs_inventory')
    .update({ skin_name, exterior, float_value, pattern, purchase_price: purchase_price || 0, purchase_currency: purchase_currency || 'SEK', purchase_price_sek, purchase_date, notes, screenshot_url: screenshot_url || null, steam_asset_id: steam_asset_id || null })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  if (screenshot_url && !existing?.screenshot_url) {
    await appendActivity(req.user.id, 'cs_trade_screenshot', { skinName: skin_name, screenshotUrl: screenshot_url });
  }
  res.json({ success: true });
});

app.delete('/api/cs/inventory/:id', requireUser, async (req, res) => {
  await supabase.from('cs_inventory').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ success:true });
});

app.post('/api/cs/inventory/:id/sell', requireUser, async (req, res) => {
  const { sale_price, sale_currency, sale_date, notes, screenshot_url } = req.body;
  if (!sale_price||!sale_date) return res.status(400).json({ error:'sale_price and sale_date required' });
  const { data: item } = await supabase.from('cs_inventory').select('skin_name, purchase_price, sold').eq('id', req.params.id).eq('user_id', req.user.id).single();
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (item.sold) return res.status(409).json({ error: 'Item already marked as sold.' });
  await supabase.from('cs_inventory').update({ sold:true }).eq('id', req.params.id).eq('user_id', req.user.id);
  const { data } = await supabase.from('cs_sales').insert({ inventory_id:req.params.id, user_id:req.user.id, sale_price, sale_currency:sale_currency||'SEK', sale_date, notes, screenshot_url:screenshot_url||null }).select().single();
  await appendActivity(req.user.id, 'cs_trade', { action:'sell', skinName:item.skin_name, buyPrice:item.purchase_price, sellPrice:sale_price, currency:sale_currency });
  res.json({ id:data?.id, success:true });
});

app.get('/api/cs/steam/screenshot/:id', requireUser, async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid screenshot ID' });
  try {
    // Scrape the Steam page for og:image which contains the full-resolution screenshot
    const r = await fetch(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const html = await r.text();
    const match = html.match(/<meta property="og:image"\s+content="([^"]+)"/);
    const previewUrl = match?.[1] || null;
    if (!previewUrl) return res.status(404).json({ error: 'Screenshot not found' });
    res.json({ previewUrl });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cs/pnl', requireUser, async (req, res) => {
  const BC = (req.query.currency || 'SEK').toUpperCase();
  const [{ data: sold }, { data: holding }] = await Promise.all([
    supabase.from('cs_inventory').select('purchase_price, purchase_price_sek, cs_sales(sale_price, sale_currency)').eq('user_id', req.user.id).eq('sold', true),
    supabase.from('cs_inventory').select('id, skin_name, purchase_price, purchase_price_sek').eq('user_id', req.user.id).eq('sold', false),
  ]);
  const holdingItems = holding || [];
  let priceMap = {};
  if (holdingItems.length > 0) {
    const names = [...new Set(holdingItems.map(i => i.skin_name))];
    const { data: prices } = await supabase.from('cs_price_cache').select('skin_name, price_sek').in('skin_name', names);
    (prices || []).forEach(p => { priceMap[p.skin_name] = p.price_sek; });
  }
  const saleCurrencies = [...new Set((sold||[]).map(r => r.cs_sales?.[0]?.sale_currency).filter(Boolean).filter(c => c !== 'SEK'))];
  const needFX = [...new Set([...saleCurrencies, ...(BC !== 'SEK' ? [BC] : [])])];
  const fxFromSEK = { SEK: 1 };
  if (needFX.length > 0) {
    try {
      const fx = await fetch(`https://api.frankfurter.app/latest?from=SEK&to=${needFX.join(',')}`);
      const fxd = await fx.json();
      Object.entries(fxd.rates || {}).forEach(([cur, rate]) => { fxFromSEK[cur] = rate; });
    } catch(e) {}
  }
  const bcRate = fxFromSEK[BC] || 1;
  const sekToBC = (sekAmt) => parseFloat(((sekAmt || 0) * bcRate).toFixed(2));
  const saleToBC = (amount, currency) => {
    const cur = currency || 'SEK';
    const toSEKRate = cur === 'SEK' ? 1 : (1 / (fxFromSEK[cur] || 1));
    return parseFloat(((amount || 0) * toSEKRate * bcRate).toFixed(2));
  };
  const costOf = r => r.purchase_price_sek || r.purchase_price;
  const realised = (sold||[]).reduce((s,r) => {
    const sale = r.cs_sales?.[0];
    return s + (saleToBC(sale?.sale_price, sale?.sale_currency) - sekToBC(costOf(r)));
  }, 0);
  const unrealised = holdingItems.reduce((s,r) => s + (sekToBC(priceMap[r.skin_name]||0) - sekToBC(costOf(r))), 0);
  res.json({
    realised: parseFloat(realised.toFixed(2)),
    unrealised: parseFloat(unrealised.toFixed(2)),
    totalInvested: sekToBC(holdingItems.reduce((s,r) => s + costOf(r), 0)),
    currentValue: sekToBC(holdingItems.reduce((s,r) => s + (priceMap[r.skin_name]||0), 0)),
    totalPnl: parseFloat((realised + unrealised).toFixed(2)),
    soldCount: (sold||[]).length, holdingCount: holdingItems.length,
    display_currency: BC,
  });
});

// ── Admin routes ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    // Fetch profiles and transaction counts in parallel — no N+1
    const [{ data: profiles }, { data: txCounts }, { count: totalTx }] = await Promise.all([
      supabase.from('profiles').select('id, username, role, created_at, public_inventory, public_holdings, avatar_base64'),
      supabase.from('transactions').select('user_id').then(r => r), // get all for grouping
      supabase.from('transactions').select('*', { count:'exact', head:true }),
    ]);

    // Group transaction counts by user_id client-side
    const txCountMap = {};
    (txCounts || []).forEach(t => { txCountMap[t.user_id] = (txCountMap[t.user_id] || 0) + 1; });

    const usersStats = (profiles || []).map(p => ({
      username: p.username, role: p.role, createdAt: p.created_at,
      transactionCount: txCountMap[p.id] || 0,
      publicInventory: p.public_inventory, publicHoldings: p.public_holdings,
      avatarBase64: p.avatar_base64 || null,
    }));

    const mem = process.memoryUsage();
    res.json({
      system: { uptime: Math.floor(process.uptime()), nodeVersion: process.version, memoryMB: Math.round(mem.rss/1024/1024), heapUsedMB: Math.round(mem.heapUsed/1024/1024), platform: process.platform },
      users: usersStats,
      totals: { userCount: (profiles||[]).length, totalTx: totalTx||0 },
      tickerCache: { total: 0, resolved: 0, failed: 0 },
    });
  } catch(e) {
    log.error('admin/stats failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:username', requireAdmin, async (req, res) => {
  if (req.params.username === 'admin') return res.status(400).json({ error:'Cannot delete admin account.' });
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });
  const email = `${req.username.toLowerCase()}@statera.local`;
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) return res.status(401).json({ error: 'Incorrect password' });
  const { data: profile } = await supabase.from('profiles').select('id').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error:'User not found.' });
  await supabase.auth.admin.deleteUser(profile.id);
  await appendModLog('admin', 'delete-user', req.params.username);
  res.json({ success:true });
});

app.post('/api/admin/users/:username/reset-password', requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword||newPassword.length<6) return res.status(400).json({ error:'Password must be at least 6 characters.' });
  const { data: profile } = await supabase.from('profiles').select('id').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error:'User not found.' });
  await supabase.auth.admin.updateUserById(profile.id, { password:newPassword });
  await appendModLog('admin', 'reset-password', req.params.username);
  res.json({ success:true });
});

app.post('/api/admin/users/:username/set-role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['user','moderator'].includes(role)) return res.status(400).json({ error:'Invalid role.' });
  await supabase.from('profiles').update({ role }).eq('username', req.params.username);
  await appendModLog('admin', `set-role:${role}`, req.params.username);
  res.json({ success:true });
});

app.post('/api/admin/users/:username/set-role-admin', requireAdmin, async (req, res) => {
  // Only the root "admin" account can grant or revoke admin role
  if (req.username?.toLowerCase() !== 'admin') return res.status(403).json({ error: 'Only the root admin account can manage admin roles.' });
  const { role } = req.body;
  if (!['user','moderator','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  // Protect the root admin account from being demoted
  if (req.params.username?.toLowerCase() === 'admin') return res.status(400).json({ error: 'Cannot change the root admin role.' });
  await supabase.from('profiles').update({ role }).eq('username', req.params.username);
  await appendModLog('admin', `set-role-admin:${role}`, req.params.username);
  res.json({ success: true });
});

app.post('/api/admin/users/:username/clear-bio', requireAdmin, async (req, res) => {
  await supabase.from('profiles').update({ bio:'' }).eq('username', req.params.username);
  await appendModLog('admin', 'clear-bio', req.params.username);
  res.json({ success:true });
});

app.post('/api/admin/cache/clear', requireAdmin, async (req, res) => {
  const { username } = req.body;
  if (username) { const { data: p } = await supabase.from('profiles').select('id').eq('username', username).single(); if (p) await supabase.from('ticker_cache').delete().eq('user_id', p.id); }
  else await supabase.from('ticker_cache').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
  res.json({ success:true });
});

app.get('/api/admin/ticker-failures', requireAdmin, async (req, res) => {
  const { data } = await supabase.from('transactions').select('raw_ticker, isin, name, profiles(username)').in('type', ['buy','sell']).or('ticker.is.null,ticker.eq.').limit(200);
  const grouped = {};
  (data||[]).forEach(t => { const key=t.raw_ticker||t.isin||t.name||'unknown'; if(!grouped[key]) grouped[key]={ key, count:0, users:new Set(), isin:t.isin, name:t.name }; grouped[key].count++; if(t.profiles?.username) grouped[key].users.add(t.profiles.username); });
  res.json(Object.values(grouped).map(g=>({ ...g, users:[...g.users] })).sort((a,b)=>b.count-a.count).slice(0,50));
});

app.post('/api/admin/announcements', requireAdmin, async (req, res) => {
  const { title, message, type } = req.body;
  if (!title||!message) return res.status(400).json({ error:'title and message required.' });
  const { data, error } = await supabase.from('announcements').insert({ title, message, type:type||'info', posted_by:req.username }).select().single();
  if (error) return res.status(500).json({ error:error.message });
  res.json({ success:true, announcement:data });
});

app.delete('/api/admin/announcements/:id', requireAdmin, async (req, res) => {
  await supabase.from('announcements').delete().eq('id', req.params.id);
  res.json({ success:true });
});

// ── Moderator routes ─────────────────────────────────────────────────────────
app.get('/api/mod/log', requireModerator, async (req, res) => {
  const { data } = await supabase.from('moderation_log').select('*').order('created_at', { ascending:false }).limit(100);
  res.json(data||[]);
});

app.post('/api/mod/users/:username/reset-password', requireModerator, async (req, res) => {
  const { newPassword } = req.body;
  const { data: profile } = await supabase.from('profiles').select('id, role').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error:'User not found.' });
  if (profile.role==='admin') return res.status(403).json({ error:'Cannot reset admin password.' });
  await supabase.auth.admin.updateUserById(profile.id, { password:newPassword });
  await appendModLog(req.username, 'reset-password', req.params.username);
  res.json({ success:true });
});

app.post('/api/mod/users/:username/clear-bio', requireModerator, async (req, res) => {
  await supabase.from('profiles').update({ bio:'' }).eq('username', req.params.username);
  await appendModLog(req.username, 'clear-bio', req.params.username);
  res.json({ success:true });
});

app.post('/api/mod/announcements', requireModerator, async (req, res) => {
  const { title, message, type } = req.body;
  if (!title||!message) return res.status(400).json({ error:'title and message required.' });
  const { data } = await supabase.from('announcements').insert({ title, message, type:type||'info', posted_by:req.username }).select().single();
  await appendModLog(req.username, 'post-announcement', '-', title);
  res.json({ success:true, announcement:data });
});

app.delete('/api/mod/announcements/:id', requireModerator, async (req, res) => {
  await supabase.from('announcements').delete().eq('id', req.params.id);
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

  // Verify the OpenID response with Steam
  try {
    const verifyParams = new URLSearchParams({ ...openidParams, 'openid.mode': 'check_authentication' });
    const verifyRes = await fetch(`${STEAM_OPENID_URL}?${verifyParams.toString()}`);
    const verifyText = await verifyRes.text();
    if (!verifyText.includes('is_valid:true')) {
      return res.redirect(`${BASE_URL}/profile/edit?steam_error=invalid`);
    }

    // Extract SteamID from claimed_id (format: https://steamcommunity.com/openid/id/STEAMID64)
    const claimedId = openidParams['openid.claimed_id'] || '';
    const steamIdMatch = claimedId.match(/\/id\/(\d+)$/);
    if (!steamIdMatch) return res.redirect(`${BASE_URL}/profile?steam_error=invalid`);
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

        // Fetch Steam level
        const levelData = await fetchJSON(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${STEAM_KEY}&steamid=${steamId}`);
        steamLevel = levelData?.response?.player_level || 0;
      } catch(e) {
        log.error('Steam API fetch failed', { error: e.message });
      }
    }

    // Save verified Steam ID and level
    await supabase.from('profiles').update({
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
  await supabase.from('profiles').update({ steam_id: '', steam_verified: false }).eq('id', req.user.id);
  res.json({ success: true });
});

// Keep lookup for profile display
app.get('/api/steam/lookup/:steamId', requireUser, async (req, res) => {
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
  const { data } = await supabase.from('app_settings').select('key, value');
  const settings = {};
  (data || []).forEach(s => { settings[s.key] = s.value; });
  res.json(settings);
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  await supabase.from('app_settings').upsert({ key, value: String(value) }, { onConflict: 'key' });
  res.json({ success: true });
});

// ── Catch-all ────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const fs = require('fs');
  const indexPath = FRONTEND_DIST ? require('path').join(FRONTEND_DIST,'index.html') : require('path').join(__dirname,'frontend','dist','index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath); else next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Statera server running on http://localhost:${PORT}`));