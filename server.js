require('dotenv').config();
const express = require('express');
const path = require('path');
const https = require('https');
const { supabase } = require('./supabase');

// Simple in-memory rate limiter for auth routes
const rateLimitMap = new Map();
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
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), ts: new Date().toISOString() });
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
  const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { data: setting } = await supabase.from('app_settings').select('value').eq('key', 'allowRegistration').single();
  const allowRegistration = setting ? setting.value === 'true' : true;
  res.json({ hasUsers: (count || 0) > 0, allowRegistration });
});

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const { data: regSetting } = await supabase.from('app_settings').select('value').eq('key', 'allowRegistration').single();
  if (regSetting && regSetting.value === 'false') return res.status(403).json({ error: 'Registration is currently disabled.' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) return res.status(400).json({ error: 'Username must be 3-20 characters, letters/numbers/underscore only.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const { data: existing } = await supabase.from('profiles').select('id').eq('username', username.trim()).single();
  if (existing) return res.status(400).json({ error: 'Username already taken.' });
  const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  if (count >= 10) return res.status(400).json({ error: 'Maximum 10 users reached.' });
  const email = `${username.trim().toLowerCase()}@statera.local`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError) return res.status(400).json({ error: authError.message });
  const role = username.trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  const { error: profileError } = await supabase.from('profiles').insert({ id: authData.user.id, username: username.trim(), role, bio: '', steam_id: '', public_inventory: false, public_holdings: false });
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

// ── Profile routes ──────────────────────────────────────────────────────────
app.get('/api/users', requireUser, async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('username, role, bio, public_inventory, public_holdings, public_dividends, avatar_base64, created_at, steam_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(p => ({ username: p.username, role: p.role, bio: p.bio, publicInventory: p.public_inventory, publicHoldings: p.public_holdings, publicDividends: p.public_dividends, steamId: p.public_inventory ? p.steam_id : null, steamLevel: p.public_inventory ? (p.steam_level || 0) : null, showcaseItems: p.public_inventory ? (p.showcase_items || []) : [], avatarBase64: p.avatar_base64 || null, createdAt: p.created_at })));
});

app.get('/api/users/:username/profile', async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('*').eq('username', req.params.username).single();
  if (error || !data) return res.status(404).json({ error: 'User not found' });
  res.json({ username: data.username, role: data.role, bio: data.bio, publicInventory: data.public_inventory, publicHoldings: data.public_holdings, publicDividends: data.public_dividends, showPortfolioValue: data.show_portfolio_value, steamId: data.steam_id || null, steamVerified: data.steam_verified || false, steamLevel: data.steam_level || 0, showcaseItems: data.showcase_items || [], avatarBase64: data.avatar_base64, createdAt: data.created_at });
});

app.put('/api/users/:username/profile', requireUser, async (req, res) => {
  if (req.username !== req.params.username) return res.status(403).json({ error: "Cannot edit another user's profile." });
  const { bio, steamId, publicInventory, publicHoldings, publicDividends, showPortfolioValue, avatarBase64, showcaseItems } = req.body;
  const update = {};
  if (bio !== undefined) update.bio = bio;
  if (steamId !== undefined) { update.steam_id = steamId; if (steamId !== (await supabase.from('profiles').select('steam_id').eq('id', req.user.id).single()).data?.steam_id) update.steam_verified = false; }
  if (publicInventory !== undefined) update.public_inventory = publicInventory;
  if (publicHoldings !== undefined) update.public_holdings = publicHoldings;
  if (publicDividends !== undefined) update.public_dividends = publicDividends;
  if (showPortfolioValue !== undefined) update.show_portfolio_value = showPortfolioValue;
  if (avatarBase64 !== undefined) update.avatar_base64 = avatarBase64;
  if (showcaseItems !== undefined) {
    const items = Array.isArray(showcaseItems) ? showcaseItems.slice(0, 10) : [];
    update.showcase_items = items;
  }
  const { data, error } = await supabase.from('profiles').update(update).eq('id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, profile: { username: data.username, bio: data.bio, steamId: data.steam_id, publicInventory: data.public_inventory, publicHoldings: data.public_holdings, publicDividends: data.public_dividends, showPortfolioValue: data.show_portfolio_value, avatarBase64: data.avatar_base64, showcaseItems: data.showcase_items, steamLevel: data.steam_level } });
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
  try {
    if (tickers.length > 0) {
      const quotes = await yahooFinance.quote(tickers);
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
      quotesArray.forEach(q => { if (q?.symbol && q.regularMarketPrice) pricesMap[q.symbol] = q.regularMarketPrice; });
    }
  } catch(e) { console.error('Failed to fetch prices for public holdings:', e.message); }
  
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
  const { data } = await supabase.from('ticker_overrides').select('isin, ticker').eq('user_id', userId);
  const overrides = {};
  (data || []).forEach(r => { overrides[r.isin] = r.ticker; });
  return overrides;
}

// ── Ticker resolution ───────────────────────────────────────────────────────
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

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

function cleanRawTicker(raw) {
  if (!raw) return null;
  // Strip Montrose exchange suffixes (.N = NYSE, .O = NASDAQ, .ST = Stockholm etc)
  let cleaned = raw.trim().toUpperCase();
  // Remove trailing exchange codes like .N .O .ST .OL .CO
  cleaned = cleaned.replace(/\.(?:N|O|NQ|NY)$/, '');
  // Normalize remaining
  cleaned = cleaned.replace(/\s+/g, '-').replace(/[^A-Z0-9\-\.]/g, '');
  return cleaned || null;
}

// Batch resolver — loads cache/overrides once, resolves many tickers
async function resolveSymbolBatch(transactions, userId) {
  // Load cache and overrides once for the whole batch
  const [cache, overrides] = await Promise.all([
    loadTickerCache(userId),
    loadOverrides(userId),
  ]);

  const results = {};
  for (const tx of transactions) {
    const key = tx.id;
    const ticker = await resolveSymbolWithContext(
      tx.raw_ticker || null, tx.isin, tx.name, tx.currency, tx.broker,
      userId, cache, overrides
    );
    results[key] = ticker;
    await new Promise(r => setTimeout(r, 120));
  }
  return results;
}

async function resolveSymbol(rawTicker, isin, name, currency, broker, userId) {
  const [cache, overrides] = await Promise.all([loadTickerCache(userId), loadOverrides(userId)]);
  return resolveSymbolWithContext(rawTicker, isin, name, currency, broker, userId, cache, overrides);
}

async function resolveSymbolWithContext(rawTicker, isin, name, currency, broker, userId, cache, overrides) {
  // 1. Manual override wins always
  const overrideKey = isin || rawTicker;
  if (overrideKey && overrides[overrideKey]) return overrides[overrideKey];

  // 2. Cache hit
  const cacheKey = `${broker || ''}|${currency || ''}|${isin || rawTicker || name}`;
  if (cache[cacheKey] !== undefined) return cache[cacheKey];

  const save = async (symbol) => {
    if (symbol) {
      await saveTickerCacheEntry(userId, cacheKey, symbol);
      cache[cacheKey] = symbol; // update local cache
    }
    return symbol;
  };

  const effectiveCurrency = getEffectiveCurrency(currency, isin, broker);
  const isinPrefix = isin ? isin.substring(0, 2).toUpperCase() : null;
  
  // Dual-listing detection: CA companies often dual-list on TSX and NYSE
  // If trading in USD, strongly prefer US listing (no suffix) over .TO (Toronto)
  const rawCurrency = (currency || 'SEK').toUpperCase();
  const isCanadianInUS = (isinPrefix === 'CA' && rawCurrency === 'USD');
  
  const preferUSListing = effectiveCurrency === 'USD' || isinPrefix === 'US' || isinPrefix === 'CA';
  const preferredSuffixes = preferUSListing ? [] : (CURRENCY_SUFFIX_MAP[effectiveCurrency] || []);

  const cleaned = cleanRawTicker(rawTicker);
  const firstWord = rawTicker ? rawTicker.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
  const variants = [...new Set([cleaned, firstWord].filter(Boolean))];

  const verifyQuote = async (symbol) => {
    try {
      const q = await yahooFinance.quote(symbol);
      return q?.regularMarketPrice != null ? symbol : null;
    } catch(e) { return null; }
  };

  // 3. Fast path: try ticker + preferred suffixes
  if (!preferUSListing && variants.length && preferredSuffixes.length) {
    for (const suffix of preferredSuffixes) {
      for (const v of variants) {
        const result = await verifyQuote(`${v}${suffix}`);
        if (result) return save(result);
      }
    }
  }

  // 4. For US listings, try direct ticker first
  if (preferUSListing && variants.length) {
    for (const v of variants) {
      const result = await verifyQuote(v);
      if (result) return save(result);
    }
  }

  // 5. ISIN search — use Yahoo search and score results
  if (isin) {
    try {
      const results = await yahooFinance.search(isin);
      const quotes = (results?.quotes || []).filter(q => q.symbol && q.quoteType !== 'OPTION' && q.quoteType !== 'FUTURE');
      if (quotes.length) {
        // Score: heavily prefer symbols matching transaction currency's exchange
        // This ensures dual-listed stocks resolve to the correct market
        const scored = quotes.map(q => {
          let score = 0;
          // +100 for matching preferred suffix (e.g., .ST for SEK, .OL for NOK)
          if (preferredSuffixes.some(s => q.symbol.endsWith(s))) score += 100;
          // +50 for US listings when appropriate
          if (preferUSListing && !q.symbol.includes('.')) score += 50;
          // BOOST: +200 for CA companies trading in USD to prefer US over .TO
          if (isCanadianInUS && !q.symbol.includes('.')) score += 200;
          // PENALTY: -100 for .TO when trading CA company in USD
          if (isCanadianInUS && q.symbol.endsWith('.TO')) score -= 100;
          return { symbol: q.symbol, score };
        }).sort((a, b) => b.score - a.score);
        return save(scored[0].symbol);
      }
    } catch(e) {}
  }

  // 6. Name-based search as last resort
  if (name?.length > 2) {
    try {
      // Use first 3 words of name for better search results
      const searchName = name.split(/\s+/).slice(0, 3).join(' ');
      const results = await yahooFinance.search(searchName);
      const quotes = (results?.quotes || []).filter(q => q.symbol && q.quoteType !== 'OPTION' && q.quoteType !== 'FUTURE');
      if (quotes.length) {
        const preferred = quotes.find(q => preferredSuffixes.some(s => q.symbol.endsWith(s)));
        if (preferred) return save(preferred.symbol);
        // Only use first result if it matches expected currency region
        const first = quotes[0];
        if (preferUSListing && !first.symbol.includes('.')) return save(first.symbol);
        if (!preferUSListing && preferredSuffixes.some(s => first.symbol.endsWith(s))) return save(first.symbol);
      }
    } catch(e) {}
  }

  return save(null);
}

// ── CSV parsers ─────────────────────────────────────────────────────────────
function parseMontrose(content) {
  const lines = content.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const idx = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const iDatum=idx('datum'), iTyp=idx('typ'), iNamn=idx('rdepapper')!==-1?idx('rdepapper'):idx('eskr');
  const iIsin=idx('isin'), iTicker=idx('ticker'), iAntal=idx('antal'), iKurs=idx('kurs'), iKursvaluta=idx('kursvaluta'), iTotalt=idx('totalt'), iKonto=idx('konto');
  const TYPE_MAP = { 'köp':'buy','kop':'buy','sälj':'sell','salj':'sell','utdelning':'dividend','utländsk skatt':'foreign-tax','utlandsk skatt':'foreign-tax','insättning':'deposit','uttag':'withdrawal','vp-överföring in':'buy','vp-overforing in':'buy','vp-överföring ut':'sell','vp-overforing ut':'sell' };
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
    if (!cols[iDatum]) return null;
    const rawType = (cols[iTyp]||'').trim().toLowerCase();
    const txType = TYPE_MAP[rawType] || 'other';
    const rawQty = parseFloat((cols[iAntal]||'').replace(/\s/g,'').replace(',','.'));
    const qty = isNaN(rawQty) ? 0 : Math.abs(rawQty); // always store positive; type determines direction
    if (txType === 'other' && !cols[iIsin]?.trim()) return null; // skip empty rows
    return { broker:'montrose', date:cols[iDatum]?.trim()||'', type:txType, name:cols[iNamn]?.trim()||'', isin:cols[iIsin]?.trim()||'', rawTicker:cols[iTicker]?.trim()||'', ticker:'', quantity:qty, price:parseFloat((cols[iKurs]||'0').replace(/\s/g,'').replace(',','.'))||0, currency:cols[iKursvaluta]?.trim()||'SEK', totalSEK:parseFloat((cols[iTotalt]||'0').replace(/\s/g,'').replace(',','.'))||0, account:cols[iKonto]?.trim()||'' };
  }).filter(Boolean);
}

function parseAvanza(content) {
  const lines = content.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));
  const col = (row, name) => { const i = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase())); return i >= 0 ? (row[i]||'').trim().replace(/"/g,'') : ''; };
  const TYPE_MAP = { 'köpt':'buy','sålt':'sell','utdelning':'dividend','utländsk källskatt':'foreign-tax','insättning':'deposit','uttag':'withdrawal' };
  return lines.slice(1).map(line => {
    const cols = line.split(';');
    if (cols.length < 4) return null;
    const txType = TYPE_MAP[col(cols,'typ').toLowerCase()] || 'other';
    const rawQty = parseFloat(col(cols,'antal').replace(',','.').replace(/\s/g,''));
    const qty = isNaN(rawQty) ? 0 : Math.abs(rawQty);
    return { broker:'avanza', date:col(cols,'datum'), type:txType, name:col(cols,'värdepapper')||col(cols,'beskrivning'), isin:col(cols,'isin'), rawTicker:'', ticker:'', quantity:qty, price:parseFloat(col(cols,'kurs').replace(',','.').replace(/\s/g,''))||0, currency:col(cols,'valuta')||'SEK', totalSEK:parseFloat(col(cols,'belopp').replace(',','.').replace(/\s/g,''))||0, account:col(cols,'konto') };
  }).filter(Boolean);
}

function parseNordnet(content) {
  const bom = content.charCodeAt(0) === 0xFEFF;
  const lines = (bom ? content.slice(1) : content).split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map(h => h.trim().replace(/"/g,''));
  const col = (row, name) => { const i = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase())); return i >= 0 ? (row[i]||'').trim().replace(/"/g,'') : ''; };
  const TYPE_MAP = { 'købt':'buy','köpt':'buy','solgt':'sell','sålt':'sell','udbytte':'dividend','utdelning':'dividend','udenlandsk skat':'foreign-tax','utenlandsk kildeskatt':'foreign-tax' };
  return lines.slice(1).map(line => {
    const cols = line.split('\t');
    if (cols.length < 4) return null;
    const txType = TYPE_MAP[col(cols,'transaktionstype').toLowerCase()] || 'other';
    const rawQty = parseFloat(col(cols,'antal').replace(',','.').replace(/\s/g,''));
    const qty = isNaN(rawQty) ? 0 : Math.abs(rawQty);
    return { broker:'nordnet', date:col(cols,'afviklingsdato')||col(cols,'bokföringsdag'), type:txType, name:col(cols,'värdepapper')||col(cols,'verdipapir'), isin:col(cols,'isin'), rawTicker:col(cols,'värdepappersbeteckning')||'', ticker:'', quantity:qty, price:parseFloat(col(cols,'kurs').replace(',','.').replace(/\s/g,''))||0, currency:col(cols,'valuta')||'SEK', totalSEK:parseFloat((col(cols,'belopp')||col(cols,'totalt')).replace(',','.').replace(/\s/g,''))||0, account:col(cols,'depå')||col(cols,'depot') };
  }).filter(Boolean);
}

function detectBrokerAndParse(filename, content) {
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

  // Nordnet: tab-separated, unique headers like 'transaktionstype', 'afviklingsdato', 'bokföringsdag'
  const isNordnet = hasBOM || tabCount > 3 ||
    headerLower.includes('transaktionstype') ||
    headerLower.includes('afviklingsdato') ||
    headerLower.includes('bokföringsdag') ||
    lower.includes('nordnet');

  // Montrose: comma-separated, unique header 'kursvaluta' or 'ticker'
  const isMontrose = !isNordnet && (
    headerLower.includes('kursvaluta') ||
    (headerLower.includes('ticker') && commaCount > semicolonCount) ||
    lower.includes('montrose')
  );

  // Avanza: semicolon-separated, headers like 'typ av transaktion', 'courtage'
  const isAvanza = !isNordnet && !isMontrose && (
    semicolonCount > commaCount ||
    headerLower.includes('courtage') ||
    headerLower.includes('typ av transaktion') ||
    lower.includes('avanza')
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
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', req.user.id).order('date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/transactions/count', requireUser, async (req, res) => {
  const { count: total } = await supabase.from('transactions').select('*', { count:'exact', head:true }).eq('user_id', req.user.id);
  const { count: trades } = await supabase.from('transactions').select('*', { count:'exact', head:true }).eq('user_id', req.user.id).in('type', ['buy','sell']);
  res.json({ total: total||0, trades: trades||0 });
});

app.delete('/api/transactions', requireUser, async (req, res) => {
  await supabase.from('transactions').delete().eq('user_id', req.user.id);
  res.json({ success: true });
});

app.post('/api/transactions/upload', requireUser, async (req, res) => {
  const { files } = req.body;
  if (!files?.length) return res.status(400).json({ error: 'No files provided' });
  const results = [];
  let allNew = [];
  for (const { name, content } of files) {
    try { const { broker, rows } = detectBrokerAndParse(name, content); results.push({ file:name, broker, count:rows.length }); allNew = allNew.concat(rows); }
    catch(e) { results.push({ file:name, error:e.message }); }
  }
  const { data: existing } = await supabase.from('transactions').select('broker, date, type, isin, raw_ticker, name, quantity, price').eq('user_id', req.user.id);
  const dedupKey = t => {
    // Use ISIN as primary identifier, fall back to raw_ticker, then name
    const identifier = (t.isin || t.raw_ticker || t.rawTicker || t.name || '').trim().toUpperCase();
    return `${t.broker||''}|${t.date||''}|${t.type||''}|${identifier}|${Math.round((t.quantity||0)*10000)}|${Math.round((t.price||0)*10000)}`;
  };
  const existingIds = new Set((existing||[]).map(dedupKey));
  const newUnique = allNew.filter(t => !existingIds.has(dedupKey(t)));
  
  // Skip ticker resolution during upload to prevent timeouts with large CSVs
  // User will resolve tickers afterward using the "Resolve Tickers" button
  
  if (newUnique.length > 0) {
    const rows = newUnique.map(t => ({ user_id:req.user.id, broker:t.broker, date:t.date, type:t.type, name:t.name, isin:t.isin, raw_ticker:t.rawTicker, ticker:t.ticker, quantity:t.quantity, price:t.price, currency:t.currency, total_sek:t.totalSEK, account:t.account }));
    await supabase.from('transactions').insert(rows);
    
    // Log activity only when new transactions are added
    const { data: holdingsData } = await supabase.from('transactions').select('ticker').eq('user_id', req.user.id).not('ticker', 'is', null);
    const uniqueTickers = [...new Set((holdingsData || []).map(h => h.ticker))];
    await appendActivity(req.user.id, 'holdings_update', { holdingCount: uniqueTickers.length, tickers: uniqueTickers.slice(0, 5) });
  }
  const { count: total } = await supabase.from('transactions').select('*', { count:'exact', head:true }).eq('user_id', req.user.id);
  res.json({ results, newAdded:newUnique.length, total:total||0 });
});

app.post('/api/transactions/resolve', requireUser, async (req, res) => {
  const { force, limit } = req.body; // limit for chunked processing
  
  if (force) {
    // Clear all ticker cache entries for this user
    await supabase.from('ticker_cache').delete().eq('user_id', req.user.id);
  }
  
  // Get unresolved transactions (or all if force=true)
  let query = supabase
    .from('transactions')
    .select('id, raw_ticker, isin, name, currency, broker, ticker')
    .eq('user_id', req.user.id)
    .in('type', ['buy','sell','other','withdrawal']);
  
  if (!force) {
    query.or('ticker.is.null,ticker.eq.');
  }
  
  // Apply limit for chunked processing (default: resolve all)
  if (limit && limit > 0) {
    query.limit(limit);
  }
  
  const { data: unresolvedTxs } = await query;
  
  // Get total count of remaining unresolved
  const { count: totalUnresolved } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .in('type', ['buy','sell','other','withdrawal'])
    .or('ticker.is.null,ticker.eq.');
  
  if (!unresolvedTxs || unresolvedTxs.length === 0) {
    return res.json({ resolved: 0, total: 0, remaining: 0, forced: !!force });
  }
  
  // Use batch resolution for better performance
  const tickerResults = await resolveSymbolBatch(unresolvedTxs, req.user.id);
  
  // Update resolved tickers in database
  let resolved = 0;
  for (const tx of unresolvedTxs) {
    const ticker = tickerResults[tx.id];
    if (ticker && ticker !== tx.ticker) {
      await supabase.from('transactions').update({ ticker }).eq('id', tx.id);
      resolved++;
    }
  }
  
  res.json({ 
    resolved, 
    total: unresolvedTxs.length, 
    remaining: Math.max(0, (totalUnresolved || 0) - unresolvedTxs.length),
    forced: !!force 
  });
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

  // Build ISIN → best ticker mapping (prefer .ST, .OL etc over plain ticker)
  const isinToTicker = {};
  normalised.forEach(t => {
    if (t.isin && t.ticker) {
      if (!isinToTicker[t.isin] || t.ticker.includes('.')) {
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
      quantity: Math.floor(h.quantity), // Round down to whole shares
      avgPrice: h.quantity > 0 ? parseFloat((h.totalCost / h.quantity).toFixed(4)) : 0,
    }));

  res.json(result);
});

// ── Portfolio valuation ─────────────────────────────────────────────────────
app.post('/api/portfolio', requireUser, async (req, res) => {
  const { portfolio, baseCurrency } = req.body;
  if (!portfolio?.length) return res.json({ portfolio:[], totals:null });
  const BC = baseCurrency || 'SEK';
  let fxRates = {};
  try { const fx = await yahooFinance.quote(['USDSEK=X','EURSEK=X','GBPSEK=X','NOKSEK=X','DKKSEK=X']); (Array.isArray(fx)?fx:[fx]).forEach(q => { if (q?.symbol&&q.regularMarketPrice) fxRates[q.symbol]=q.regularMarketPrice; }); } catch(e) {}
  const toSEK=(amount,currency)=>{ if(!currency||currency==='SEK') return amount; return fxRates[`${currency}SEK=X`]?amount*fxRates[`${currency}SEK=X`]:amount; };
  const fromSEK=(amount)=>{ if(BC==='SEK') return amount; return fxRates[`${BC}SEK=X`]?amount/fxRates[`${BC}SEK=X`]:amount; };
  const FLAGS={ST:'🇸🇪',OL:'🇳🇴',CO:'🇩🇰',HE:'🇫🇮',AS:'🇳🇱',PA:'🇫🇷',DE:'🇩🇪',L:'🇬🇧',MI:'🇮🇹',MC:'🇪🇸',SW:'🇨🇭',TO:'🇨🇦',AX:'🇦🇺',HK:'🇭🇰',T:'🇯🇵'};
  const getFlag=(t)=>{ const p=t.split('.'); return p.length>1?(FLAGS[p[p.length-1]]||'🇺🇸'):'🇺🇸'; };
  const cleanName=(name)=>{
    if (!name) return name;
    return name
      .replace(/\s*\(publ\.?\)/gi, '')  // (publ) or (publ.)
      .replace(/\s*\(AB\)/gi, '')       // (AB)
      .replace(/\bAB\b(?!\w)/gi, '')    // AB at end of name
      .replace(/\bpubl\.?\b/gi, '')     // publ or publ.
      .replace(/\b(ASA|AS|A\/S|SE|Inc\.?|Inc|Corp\.?|Ltd\.?|Limited|PLC|N\.V\.|S\.A\.|GmbH|AG)\b/gi, '')
      .replace(/\s*[.,;]\s*$/g, '')     // Remove trailing punctuation
      .replace(/\s+/g, ' ')             // Normalize whitespace
      .trim();
  };
  const results=[];
  for (const h of portfolio) {
    try {
      const q = await yahooFinance.quote(h.ticker);
      if (!q) continue;
      const nativePrice=q.regularMarketPrice||0, prevClose=q.regularMarketPreviousClose||nativePrice, currency=q.currency||'SEK';
      const currentValueBase=fromSEK(toSEK(nativePrice*h.quantity,currency)), costBase=fromSEK(toSEK((h.avgPrice||0)*h.quantity,currency)), profitBase=currentValueBase-costBase;
      results.push({ ticker:h.ticker, name:q.longName||q.shortName||h.ticker, cleanName:cleanName(q.longName||q.shortName||h.ticker), flag:getFlag(h.ticker), currency, quantity:h.quantity, nativePrice, avgPrice:h.avgPrice||0, currentValue:currentValueBase, profit:profitBase, returnPct:costBase>0?(profitBase/costBase)*100:0, todayChangePct:prevClose>0?((nativePrice-prevClose)/prevClose)*100:0, todayGainBase:fromSEK(toSEK((nativePrice-prevClose)*h.quantity,currency)), sector:q.sector||'Unknown', quoteType:q.quoteType });
    } catch(e) { log.warn('portfolio quote failed', { ticker: h.ticker, error: e.message }); }
  }
  const totalValue=results.reduce((s,r)=>s+r.currentValue,0), totalCost=results.reduce((s,r)=>s+fromSEK(toSEK((r.avgPrice||0)*r.quantity,r.currency)),0), totalProfit=totalValue-totalCost;
  res.json({ portfolio:results, totals:{ value:totalValue, cost:totalCost, profit:totalProfit, returnPct:totalCost>0?(totalProfit/totalCost)*100:0 } });
});

// ── Dividends ───────────────────────────────────────────────────────────────
app.get('/api/dividends', requireUser, async (req, res) => {
  const { data: txs } = await supabase.from('transactions').select('date, name, total_sek').eq('user_id', req.user.id).eq('type', 'dividend');
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

// ── Overrides ───────────────────────────────────────────────────────────────
app.get('/api/overrides', requireUser, async (req, res) => { res.json(await loadOverrides(req.user.id)); });

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

// ── Ownership ───────────────────────────────────────────────────────────────
app.post('/api/ownership', requireUser, async (req, res) => {
  const { tickers } = req.body;
  if (!tickers?.length) return res.json([]);
  const results = [];
  for (const { ticker, name } of tickers) {
    try {
      const data = await yahooFinance.quoteSummary(ticker, { modules:['institutionOwnership','insiderHolders','majorHoldersBreakdown'] });
      const mhb = data?.majorHoldersBreakdown, inst = data?.institutionOwnership?.ownershipList||[];
      if (!mhb && !inst.length) { results.push({ ticker, name, noData:true }); continue; }
      results.push({ ticker, name, institutionPct:mhb?.institutionsPercentHeld??null, insiderPct:mhb?.insidersPercentHeld??null, topInstitutional:inst.slice(0,8).map(o=>({ name:o.organization, pctHeld:o.pctHeld?.raw??0 })), topInsiders:(data?.insiderHolders?.holders||[]).slice(0,6).map(i=>({ name:i.name, relation:i.relation })) });
    } catch(e) { results.push({ ticker, name, error:true }); }
    await new Promise(r => setTimeout(r, 200));
  }
  res.json(results);
});

app.get('/api/ownership/search/:query', requireUser, async (req, res) => {
  try { const results = await yahooFinance.search(req.params.query); res.json((results?.quotes||[]).filter(q=>q.symbol&&q.quoteType==='EQUITY').slice(0,8).map(q=>({ ticker:q.symbol, name:q.longname||q.shortname, exchange:q.exchange }))); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

// ── Performance history ─────────────────────────────────────────────────────
app.post('/api/history', requireUser, async (req, res) => {
  const { portfolio, baseCurrency, period } = req.body;
  if (!portfolio?.length) return res.json([]);
  const days = { '1W':7,'1M':30,'3M':90,'1Y':365,'3Y':1095 }[period]||90;
  const startDate = new Date(); startDate.setDate(startDate.getDate()-days);
  const priceHistory = {};
  try { for (const h of portfolio) { const hist = await yahooFinance.historical(h.ticker, { period1:startDate, interval:'1d' }); priceHistory[h.ticker]={}; hist.forEach(d=>{ priceHistory[h.ticker][d.date.toISOString().split('T')[0]]=d.close; }); await new Promise(r=>setTimeout(r,100)); } } catch(e) {}
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
app.get('/api/users/:username/activity', async (req, res) => {
  const { data: profile } = await supabase.from('profiles').select('id, username').eq('username', req.params.username).single();
  if (!profile) return res.status(404).json({ error: 'User not found' });
  const { data: activities } = await supabase.from('activity').select('*').eq('user_id', profile.id).order('created_at', { ascending:false }).limit(10);
  res.json((activities || []).map(a => ({ ...a, username: profile.username })));
});

app.post('/api/activity/screenshot', requireUser, async (req, res) => {
  const { skinName, caption, imageBase64 } = req.body;
  if (!skinName) return res.status(400).json({ error: 'Skin name required.' });
  if (imageBase64 && imageBase64.length > 1.5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large. Maximum 1 MB.' });
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
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers:{ 'User-Agent':'Statera/1.0' } }, (res) => {
      let data=''; res.on('data',d=>data+=d); res.on('end',()=>{ try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Invalid JSON from '+url)); } });
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

app.post('/api/cs/prices/sync', requireUser, async (req, res) => {
  try {
    let prices = null;
    try { const d = await fetchJSON('https://prices.csgotrader.app/latest/prices_v6.json'); if (d && typeof d === 'object' && !d.error) prices = d; } catch(e) {}
    let sekRate = 10.5;
    try { const fx = await fetchJSON('https://api.exchangerate-api.com/v4/latest/USD'); sekRate = fx?.rates?.SEK||10.5; } catch(e) {}
    if (!prices) return res.status(500).json({ error:'Could not fetch prices. Try again later.' });
    const now = new Date().toISOString();
    const entries = Object.entries(prices);
    for (let i=0; i<entries.length; i+=500) {
      const chunk = entries.slice(i, i+500).map(([name, data]) => { const priceUSD = data?.steam?.last_24h||data?.steam?.last_7d||data?.steam?.last_30d||0; return { skin_name:name, price_usd:priceUSD, price_sek:priceUSD*sekRate, last_updated:now }; });
      await supabase.from('cs_price_cache').upsert(chunk, { onConflict:'skin_name' });
    }
    res.json({ success:true, count:entries.length, sekRate, source:'csgotrader' });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/cs/prices/search/:query', requireUser, async (req, res) => {
  const { data } = await supabase.from('cs_price_cache').select('skin_name, price_usd, price_sek').ilike('skin_name', `%${req.params.query}%`).limit(20);
  res.json(data||[]);
});

app.get('/api/cs/steam/inventory/:steamId', requireUser, async (req, res) => {
  try {
    const data = await fetchJSON(`https://steamcommunity.com/inventory/${req.params.steamId}/730/2?l=english&count=500`);
    if (!data?.assets) return res.status(404).json({ error:'Inventory not found or private' });
    const descMap = {};
    (data.descriptions||[]).forEach(d=>{ descMap[`${d.classid}_${d.instanceid}`]=d; });
    const names = (data.assets||[]).map(a=>{ const d=descMap[`${a.classid}_${a.instanceid}`]; return d?.market_hash_name||d?.name||'Unknown'; }).filter(n=>n!=='Unknown');
    const { data: prices } = await supabase.from('cs_price_cache').select('skin_name, price_sek').in('skin_name', names);
    const priceMap = {};
    (prices||[]).forEach(p=>{ priceMap[p.skin_name]=p.price_sek; });
    const items = (data.assets||[]).map(asset=>{ const desc=descMap[`${asset.classid}_${asset.instanceid}`]; const name=desc?.market_hash_name||desc?.name||'Unknown'; return { assetId:asset.assetid, name, iconUrl:desc?.icon_url?`https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/128x128`:null, tradable:desc?.tradable===1, type:desc?.type||'', priceSEK:priceMap[name]||0 }; }).filter(i=>i.name!=='Unknown');
    res.json({ items, totalValue:items.reduce((s,i)=>s+i.priceSEK,0), count:items.length });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/cs/inventory', requireUser, async (req, res) => {
  const { data } = await supabase.from('cs_inventory').select('*, cs_sales(*), cs_price_cache(price_sek, price_usd)').eq('user_id', req.user.id).order('purchase_date', { ascending:false });
  res.json((data||[]).map(item=>({ ...item, current_price_sek:item.cs_price_cache?.price_sek, sale_price:item.cs_sales?.[0]?.sale_price, sale_date:item.cs_sales?.[0]?.sale_date })));
});

app.post('/api/cs/inventory', requireUser, async (req, res) => {
  const { skin_name, exterior, float_value, pattern, purchase_price, purchase_currency, purchase_date, notes } = req.body;
  if (!skin_name||!purchase_date) return res.status(400).json({ error:'skin_name and purchase_date required' });
  const { data, error } = await supabase.from('cs_inventory').insert({ user_id:req.user.id, skin_name, exterior, float_value, pattern, purchase_price:purchase_price||0, purchase_currency:purchase_currency||'SEK', purchase_date, notes }).select().single();
  if (error) return res.status(500).json({ error:error.message });
  await appendActivity(req.user.id, 'cs_trade', { action:'buy', skinName:skin_name, price:purchase_price, currency:purchase_currency, exterior });
  res.json({ id:data.id, success:true });
});

app.delete('/api/cs/inventory/:id', requireUser, async (req, res) => {
  await supabase.from('cs_inventory').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ success:true });
});

app.post('/api/cs/inventory/:id/sell', requireUser, async (req, res) => {
  const { sale_price, sale_currency, sale_date, notes } = req.body;
  if (!sale_price||!sale_date) return res.status(400).json({ error:'sale_price and sale_date required' });
  const { data: item } = await supabase.from('cs_inventory').select('skin_name, purchase_price').eq('id', req.params.id).single();
  await supabase.from('cs_inventory').update({ sold:true }).eq('id', req.params.id).eq('user_id', req.user.id);
  const { data } = await supabase.from('cs_sales').insert({ inventory_id:req.params.id, user_id:req.user.id, sale_price, sale_currency:sale_currency||'SEK', sale_date, notes }).select().single();
  if (item) await appendActivity(req.user.id, 'cs_trade', { action:'sell', skinName:item.skin_name, buyPrice:item.purchase_price, sellPrice:sale_price, currency:sale_currency });
  res.json({ id:data?.id, success:true });
});

app.get('/api/cs/pnl', requireUser, async (req, res) => {
  const { data: sold } = await supabase.from('cs_inventory').select('purchase_price, cs_sales(sale_price)').eq('user_id', req.user.id).eq('sold', true);
  const { data: holding } = await supabase.from('cs_inventory').select('purchase_price, cs_price_cache(price_sek)').eq('user_id', req.user.id).eq('sold', false);
  const realised=(sold||[]).reduce((s,r)=>s+((r.cs_sales?.[0]?.sale_price||0)-r.purchase_price),0);
  const unrealised=(holding||[]).reduce((s,r)=>s+((r.cs_price_cache?.price_sek||0)-r.purchase_price),0);
  res.json({ realised, unrealised, totalInvested:(holding||[]).reduce((s,r)=>s+r.purchase_price,0), currentValue:(holding||[]).reduce((s,r)=>s+(r.cs_price_cache?.price_sek||0),0), totalPnl:realised+unrealised, soldCount:(sold||[]).length, holdingCount:(holding||[]).length });
});

// ── Admin routes ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    // Fetch profiles and transaction counts in parallel — no N+1
    const [{ data: profiles }, { data: txCounts }, { count: totalTx }] = await Promise.all([
      supabase.from('profiles').select('id, username, role, created_at, public_inventory, public_holdings'),
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

// Step 1: Redirect user to Steam login
app.get('/api/steam/auth', requireUser, (req, res) => {
  // Store user id in a temp token so we know who to link after callback
  const token = req.headers.authorization?.replace('Bearer ', '');
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${BASE_URL}/api/steam/callback?token=${encodeURIComponent(token)}`,
    'openid.realm': BASE_URL,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  res.json({ url: `${STEAM_OPENID_URL}?${params.toString()}` });
});

// Step 2: Steam redirects back here after login
app.get('/api/steam/callback', async (req, res) => {
  const { token, ...openidParams } = req.query;

  // Verify the OpenID response with Steam
  try {
    const verifyParams = new URLSearchParams({ ...openidParams, 'openid.mode': 'check_authentication' });
    const verifyRes = await fetchJSON(`${STEAM_OPENID_URL}?${verifyParams.toString()}`).catch(() => null);

    // Extract SteamID from claimed_id (format: https://steamcommunity.com/openid/id/STEAMID64)
    const claimedId = openidParams['openid.claimed_id'] || '';
    const steamIdMatch = claimedId.match(/\/id\/(\d+)$/);
    if (!steamIdMatch) return res.redirect(`${BASE_URL}/profile?steam_error=invalid`);
    const steamId = steamIdMatch[1];

    // Verify the token and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.redirect(`${BASE_URL}/profile?steam_error=session`);

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
    }).eq('id', user.id);

    // Redirect back to profile with success
    res.redirect(`${BASE_URL}/profile?steam_success=1&steam_name=${encodeURIComponent(steamName)}`);
  } catch(e) {
    log.error('steam/callback failed', { error: e.message });
    res.redirect(`${BASE_URL}/profile?steam_error=failed`);
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