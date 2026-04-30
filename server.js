const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { initDB, getUserDB } = require('./db');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '20mb' }));

const DATA_DIR = process.env.STATERA_DATA_DIR || __dirname;
const FRONTEND_DIST = process.env.STATERA_FRONTEND || null;
if (FRONTEND_DIST && fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

const MAX_USERS = 10;
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// ── User directory helpers ─────────────────────────────────────────────────
function getUserDir(username) {
  const dir = path.join(DATA_DIR, 'users', username);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function userFile(username, filename) {
  return path.join(getUserDir(username), filename);
}

// ── JSON file helpers ──────────────────────────────────────────────────────
function loadJSON(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) {}
  return def;
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ── User registry ──────────────────────────────────────────────────────────
function loadUsers() {
  const users = loadJSON(USERS_FILE, null);
  if (users) return users;
  // Migrate from old single-user auth.json
  const oldAuth = path.join(DATA_DIR, 'auth.json');
  if (fs.existsSync(oldAuth)) {
    try {
      const old = JSON.parse(fs.readFileSync(oldAuth, 'utf8'));
      if (old.username) {
        const migrated = [{ username: old.username, hash: old.hash, salt: old.salt, createdAt: new Date().toISOString() }];
        saveUsers(migrated);
        // Migrate old data files to user dir
        const udir = getUserDir(old.username);
        ['transactions.json','ticker_cache.json','ticker_overrides.json'].forEach(f => {
          const oldPath = path.join(DATA_DIR, f);
          const newPath = path.join(udir, f);
          if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.copyFileSync(oldPath, newPath);
        });
        return migrated;
      }
    } catch(e) {}
  }
  return [];
}

function saveUsers(users) { saveJSON(USERS_FILE, users); }
function hashPassword(pw, salt) { return crypto.pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex'); }
function findUser(username) { return loadUsers().find(u => u.username.toLowerCase() === username.toLowerCase()); }
function getUserRole(username) {
  if (username.toLowerCase() === 'admin') return 'admin';
  const user = findUser(username);
  return user?.role || 'user';
}

// ── Per-user file helpers ──────────────────────────────────────────────────
function loadTransactions(username) { return loadJSON(userFile(username, 'transactions.json'), []); }
function saveTransactions(username, t) { saveJSON(userFile(username, 'transactions.json'), t); }
function loadTickerCache(username) { return loadJSON(userFile(username, 'ticker_cache.json'), {}); }
function saveTickerCache(username, c) { saveJSON(userFile(username, 'ticker_cache.json'), c); }
function loadOverrides(username) { return loadJSON(userFile(username, 'ticker_overrides.json'), {}); }
function saveOverrides(username, o) { saveJSON(userFile(username, 'ticker_overrides.json'), o); }
function loadProfile(username) {
  const def = { username, bio: '', steamId: '', publicInventory: false, createdAt: new Date().toISOString() };
  return { ...def, ...loadJSON(userFile(username, 'profile.json'), {}) };
}
function saveProfile(username, data) { saveJSON(userFile(username, 'profile.json'), data); }
function loadFriends(username) { return loadJSON(userFile(username, 'friends.json'), { friends: [], incoming: [], outgoing: [] }); }
function saveFriends(username, data) { saveJSON(userFile(username, 'friends.json'), data); }
function loadActivity(username) { return loadJSON(userFile(username, 'activity.json'), []); }
function saveActivity(username, data) { saveJSON(userFile(username, 'activity.json'), data.slice(0, 100)); }
function appendActivity(username, event) {
  const activity = loadActivity(username);
  activity.unshift({ ...event, id: Date.now() + Math.random(), createdAt: new Date().toISOString() });
  saveActivity(username, activity);
}
const MOD_LOG_FILE = path.join(DATA_DIR, 'moderation_log.json');
function loadModLog() { return loadJSON(MOD_LOG_FILE, []); }
function appendModLog(moderator, action, targetUser, details = '') {
  const log = loadModLog();
  log.unshift({ moderator, action, targetUser, details, createdAt: new Date().toISOString() });
  saveJSON(MOD_LOG_FILE, log.slice(0, 200));
}

// ── Auth middleware ────────────────────────────────────────────────────────
function requireUser(req, res, next) {
  const username = req.headers['x-user'];
  if (!username) return res.status(401).json({ error: 'Not authenticated' });
  const user = findUser(username);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.username = user.username;
  req.userDir = getUserDir(user.username);
  req.role = getUserRole(user.username);
  next();
}

function requireModerator(req, res, next) {
  const username = req.headers['x-user'];
  if (!username) return res.status(401).json({ error: 'Not authenticated' });
  const user = findUser(username);
  if (!user) return res.status(403).json({ error: 'Access denied' });
  const role = getUserRole(user.username);
  if (role !== 'admin' && role !== 'moderator') return res.status(403).json({ error: 'Moderator access required' });
  req.username = user.username;
  req.userDir = getUserDir(user.username);
  req.role = role;
  next();
}

// ── sqlite3 promise helpers ────────────────────────────────────────────────
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
  });
}
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row || null); });
  });
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
  });
}

// ── Auth routes ────────────────────────────────────────────────────────────
app.get('/api/auth/status', (req, res) => {
  const users = loadUsers();
  res.json({ hasUsers: users.length > 0, count: users.length, full: users.length >= MAX_USERS });
});

app.post('/api/auth/register', (req, res) => {
  const users = loadUsers();
  if (users.length >= MAX_USERS) return res.status(400).json({ error: `Maximum ${MAX_USERS} users reached.` });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) return res.status(400).json({ error: 'Username must be 3-20 characters, letters/numbers/underscore only.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())) return res.status(400).json({ error: 'Username already taken.' });
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPassword(password, salt);
  const isAdmin = username.trim().toLowerCase() === 'admin';
  const newUser = { username: username.trim(), hash, salt, role: isAdmin ? 'admin' : 'user', createdAt: new Date().toISOString() };
  users.push(newUser);
  saveUsers(users);
  getUserDir(newUser.username);
  saveProfile(newUser.username, { username: newUser.username, bio: '', steamId: '', publicInventory: false, createdAt: newUser.createdAt });
  res.json({ success: true, username: newUser.username });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const user = findUser(username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
  const hash = hashPassword(password, user.salt);
  if (hash !== user.hash) return res.status(401).json({ error: 'Invalid username or password.' });
  res.json({ success: true, username: user.username, role: getUserRole(user.username) });
});

app.post('/api/auth/change-password', requireUser, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === req.username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (hashPassword(currentPassword, user.salt) !== user.hash) return res.status(401).json({ error: 'Current password is incorrect.' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const newSalt = crypto.randomBytes(32).toString('hex');
  user.hash = hashPassword(newPassword, newSalt);
  user.salt = newSalt;
  saveUsers(users);
  res.json({ success: true });
});

// ── Profile routes ─────────────────────────────────────────────────────────
app.get('/api/users', (req, res) => {
  const users = loadUsers();
  res.json(users.map(u => {
    const p = loadProfile(u.username);
    return { username: u.username, bio: p.bio, publicInventory: p.publicInventory, publicHoldings: p.publicHoldings, steamId: p.publicInventory ? p.steamId : null, avatarBase64: p.avatarBase64 || null, createdAt: u.createdAt, role: getUserRole(u.username) };
  }));
});

app.get('/api/users/:username/profile', (req, res) => {
  const user = findUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const p = loadProfile(user.username);
  res.json({ username: user.username, bio: p.bio, publicInventory: p.publicInventory, publicHoldings: p.publicHoldings, steamId: p.publicInventory ? p.steamId : null, avatarBase64: p.avatarBase64 || null, createdAt: user.createdAt, role: getUserRole(user.username) });
});

app.put('/api/users/:username/profile', requireUser, (req, res) => {
  if (req.username !== req.params.username) return res.status(403).json({ error: "Cannot edit another user's profile." });
  const { bio, steamId, publicInventory, publicHoldings, avatarBase64 } = req.body;
  const current = loadProfile(req.username);
  const updated = { ...current, bio: bio ?? current.bio, steamId: steamId ?? current.steamId, publicInventory: publicInventory ?? current.publicInventory, publicHoldings: publicHoldings ?? current.publicHoldings, avatarBase64: avatarBase64 !== undefined ? avatarBase64 : current.avatarBase64 };
  saveProfile(req.username, updated);
  res.json({ success: true, profile: updated });
});

app.get('/api/users/:username/inventory', async (req, res) => {
  const user = findUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const p = loadProfile(user.username);
  if (!p.publicInventory || !p.steamId) return res.status(403).json({ error: "This user's inventory is private." });
  try {
    const data = await fetchJSON(`https://steamcommunity.com/inventory/${p.steamId}/730/2?l=english&count=500`);
    if (!data || !data.assets) return res.status(404).json({ error: 'Inventory not found or private on Steam' });
    const udir = getUserDir(user.username);
    const db = getUserDB(user.username, udir);
    const descMap = {};
    (data.descriptions || []).forEach(d => { descMap[`${d.classid}_${d.instanceid}`] = d; });
    const items = await Promise.all((data.assets || []).map(async asset => {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`];
      const name = desc?.market_hash_name || desc?.name || 'Unknown';
      let priceSEK = 0;
      if (db) { const pr = await dbGet(db, 'SELECT price_sek FROM cs_price_cache WHERE skin_name = ?', [name]).catch(() => null); priceSEK = pr?.price_sek || 0; }
      return { name, iconUrl: desc?.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/128x128` : null, type: desc?.type || '', priceSEK };
    }));
    const valid = items.filter(i => i.name !== 'Unknown');
    res.json({ items: valid, totalValue: valid.reduce((s, i) => s + i.priceSEK, 0), count: valid.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Public holdings endpoint ──────────────────────────────────────────────
app.get('/api/users/:username/holdings', async (req, res) => {
  const user = findUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const p = loadProfile(user.username);
if (!p.publicHoldings) return res.status(403).json({ error: "This user's holdings are private." });
  // Return reconstructed portfolio for display (no prices, just tickers/quantities)
  const txs = loadTransactions(user.username);
  const normalised = txs.map(t => ({ ...t, ticker: (t.ticker || t.rawTicker || '').trim() }));
  const trades = normalised.filter(t => (t.type === 'buy' || t.type === 'sell') && t.ticker).sort((a, b) => a.date.localeCompare(b.date));
  const holdings = {};
  for (const tx of trades) {
    const { ticker, quantity, price } = tx;
    if (!holdings[ticker]) holdings[ticker] = { ticker, quantity: 0, totalCost: 0 };
    const h = holdings[ticker];
    if (quantity > 0) { h.totalCost += quantity * (price || 0); h.quantity += quantity; }
    else { const sellQty = Math.abs(quantity); const avg = h.quantity > 0 ? h.totalCost / h.quantity : 0; h.totalCost = Math.max(0, h.totalCost - sellQty * avg); h.quantity -= sellQty; }
  }
  res.json(Object.values(holdings).filter(h => h.quantity > 0.001).map(h => ({ ticker: h.ticker, quantity: parseFloat(h.quantity.toFixed(4)) })));
});

// ── Ticker resolution ──────────────────────────────────────────────────────
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const CURRENCY_SUFFIX_MAP = {
  SEK: ['.ST', '-B.ST', '-A.ST', '-C.ST', '-D.ST', '-PREF.ST'],
  NOK: ['.OL'],
  DKK: ['.CO'],
  EUR: ['.HE', '.AS', '.PA', '.DE', '.BE', '.F', '.MI', '.MC', '.LS', '.BR', '.VI', '.WA', '.PR'],
  GBP: ['.L', '.IL'],
  CHF: ['.SW', '.VX'],
  CAD: ['.TO', '.V', '.CN'],
  AUD: ['.AX'],
  HKD: ['.HK'],
  JPY: ['.T'],
  SGD: ['.SI'],
};
const ALL_SUFFIXES = Object.values(CURRENCY_SUFFIX_MAP).flat();

function getEffectiveCurrency(currency, isin, broker) {
  if (broker === 'montrose') {
    if (isin?.startsWith('SE')) return 'SEK';
    if (isin?.startsWith('NO')) return 'NOK';
    if (isin?.startsWith('DK')) return 'DKK';
    if (isin?.startsWith('FI')) return 'EUR';
  }
  return currency || 'SEK';
}

function normalizeTicker(raw) {
  if (!raw) return null;
  return raw.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9\-\.]/g, '');
}

async function resolveSymbol(rawTicker, isin, name, currency, broker, username = '_global') {
  const overrides = loadOverrides(username === '_global' ? null : username);
  const overrideKey = isin || rawTicker;
  if (overrideKey && overrides[overrideKey]) return overrides[overrideKey];

  const cache = loadTickerCache(username);
  const cacheKey = `${broker || ''}|${currency || ''}|${isin || rawTicker || name}`;
  if (cache[cacheKey] !== undefined) return cache[cacheKey];

  const effectiveCurrency = getEffectiveCurrency(currency, isin, broker);
  const isinPrefix = isin ? isin.substring(0, 2) : null;
  const preferUSListing = effectiveCurrency === 'USD' || isinPrefix === 'US' || isinPrefix === 'CA';
  const preferredSuffixes = preferUSListing ? [] : (CURRENCY_SUFFIX_MAP[effectiveCurrency] || []);

  const normalized = normalizeTicker(rawTicker);
  const firstWord = rawTicker ? rawTicker.trim().split(/\s+/)[0].toUpperCase() : null;
  const tickerVariants = [];
  if (normalized) tickerVariants.push(normalized);
  if (firstWord && firstWord !== normalized) tickerVariants.push(firstWord);

  const save = (symbol) => {
    if (symbol) { cache[cacheKey] = symbol; saveTickerCache(username, cache); }
    return symbol;
  };

  const verifyQuote = async (symbol) => {
    try {
      const q = await yahooFinance.quote(symbol);
      return q && q.currency ? { symbol, currency: q.currency } : null;
    } catch(e) { return null; }
  };

  // Fast path for non-US tickers
  if (!preferUSListing && tickerVariants.length > 0 && preferredSuffixes.length > 0) {
    for (const suffix of preferredSuffixes) {
      for (const v of tickerVariants) {
        const candidate = `${v}${suffix}`;
        const r = await verifyQuote(candidate);
        if (r) return save(candidate);
      }
    }
  }

  // ISIN search
  if (isin) {
    try {
      const results = await yahooFinance.search(isin);
      const quotes = (results?.quotes || []).filter(q => q.symbol && q.quoteType !== 'OPTION');
      if (quotes.length > 0) {
        const preferred = quotes.find(q => preferredSuffixes.some(s => q.symbol.endsWith(s)));
        const chosen = preferred || quotes[0];
        if (chosen) return save(chosen.symbol);
      }
    } catch(e) {}
  }

  // Name search
  if (name && name.length > 2) {
    try {
      const results = await yahooFinance.search(name);
      const quotes = (results?.quotes || []).filter(q => q.symbol && q.quoteType !== 'OPTION');
      if (quotes.length > 0) {
        const preferred = quotes.find(q => preferredSuffixes.some(s => q.symbol.endsWith(s)));
        const chosen = preferred || quotes[0];
        if (chosen) return save(chosen.symbol);
      }
    } catch(e) {}
  }

  return save(null);
}

// ── CSV parsers ────────────────────────────────────────────────────────────
function parseMontrose(content) {
  const lines = content.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const idx = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const iDatum = idx('datum'); const iTyp = idx('typ'); const iNamn = idx('rdepapper') !== -1 ? idx('rdepapper') : idx('eskr');
  const iIsin = idx('isin'); const iTicker = idx('ticker'); const iAntal = idx('antal');
  const iKurs = idx('kurs'); const iKursvaluta = idx('kursvaluta'); const iKostnad = idx('kostnad');
  const iTotalt = idx('totalt'); const iKonto = idx('konto');

  const TYPE_MAP = { 'köp': 'buy', 'kop': 'buy', 'sälj': 'sell', 'salj': 'sell', 'utdelning': 'dividend', 'utländsk skatt': 'foreign-tax', 'utlandsk skatt': 'foreign-tax', 'insättning': 'deposit', 'uttag': 'withdrawal', 'vp-överföring in': 'buy', 'vp-overforing in': 'buy', 'vp-överföring ut': 'sell', 'vp-overforing ut': 'sell' };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    if (!cols[iDatum]) continue;
    const rawType = (cols[iTyp] || '').trim().toLowerCase();
    const type = TYPE_MAP[rawType] || 'other';
    const quantity = parseFloat(cols[iAntal]) || 0;
    const price = parseFloat(cols[iKurs]) || 0;
    const totalSEK = parseFloat(cols[iTotalt]) || 0;
    rows.push({ broker: 'montrose', date: cols[iDatum]?.trim() || '', type, name: cols[iNamn]?.trim() || '', isin: cols[iIsin]?.trim() || '', rawTicker: cols[iTicker]?.trim() || '', ticker: '', quantity, price, currency: cols[iKursvaluta]?.trim() || 'SEK', totalSEK, account: cols[iKonto]?.trim() || '' });
  }
  return rows;
}

function parseAvanza(content) {
  const lines = content.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));
  const col = (row, name) => { const i = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase())); return i >= 0 ? (row[i] || '').trim().replace(/"/g, '') : ''; };
  const TYPE_MAP = { 'köpt': 'buy', 'sålt': 'sell', 'utdelning': 'dividend', 'utländsk källskatt': 'foreign-tax', 'insättning': 'deposit', 'uttag': 'withdrawal' };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 4) continue;
    const rawType = col(cols, 'typ').toLowerCase();
    const type = TYPE_MAP[rawType] || 'other';
    const qty = parseFloat(col(cols, 'antal').replace(',', '.').replace(/\s/g, '')) || 0;
    const price = parseFloat(col(cols, 'kurs').replace(',', '.').replace(/\s/g, '')) || 0;
    const total = parseFloat(col(cols, 'belopp').replace(',', '.').replace(/\s/g, '')) || 0;
    rows.push({ broker: 'avanza', date: col(cols, 'datum'), type, name: col(cols, 'värdepapper') || col(cols, 'beskrivning'), isin: col(cols, 'isin'), rawTicker: '', ticker: '', quantity: qty, price, currency: col(cols, 'valuta') || 'SEK', totalSEK: total, account: col(cols, 'konto') });
  }
  return rows;
}

function parseNordnet(content) {
  const bom = content.charCodeAt(0) === 0xFEFF;
  const clean = bom ? content.slice(1) : content;
  const lines = clean.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map(h => h.trim().replace(/"/g, ''));
  const col = (row, name) => { const i = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase())); return i >= 0 ? (row[i] || '').trim().replace(/"/g, '') : ''; };
  const TYPE_MAP = { 'købt': 'buy', 'köpt': 'buy', 'solgt': 'sell', 'sålt': 'sell', 'udbytte': 'dividend', 'utdelning': 'dividend', 'udenlandsk skat': 'foreign-tax', 'utenlandsk kildeskatt': 'foreign-tax' };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 4) continue;
    const rawType = col(cols, 'transaktionstype').toLowerCase();
    const type = TYPE_MAP[rawType] || 'other';
    const qty = parseFloat(col(cols, 'antal').replace(',', '.').replace(/\s/g, '')) || 0;
    const price = parseFloat(col(cols, 'kurs').replace(',', '.').replace(/\s/g, '')) || 0;
    const total = parseFloat((col(cols, 'belopp') || col(cols, 'totalt')).replace(',', '.').replace(/\s/g, '')) || 0;
    rows.push({ broker: 'nordnet', date: col(cols, 'afviklingsdato') || col(cols, 'bokföringsdag'), type, name: col(cols, 'värdepapper') || col(cols, 'verdipapir'), isin: col(cols, 'isin'), rawTicker: col(cols, 'värdepappersbeteckning') || '', ticker: '', quantity: qty, price, currency: col(cols, 'valuta') || 'SEK', totalSEK: total, account: col(cols, 'depå') || col(cols, 'depot') });
  }
  return rows;
}

function detectBrokerAndParse(filename, content) {
  const lower = filename.toLowerCase();
  if (lower.includes('montrose') || content.includes('kursvaluta')) return { broker: 'montrose', rows: parseMontrose(content) };
  if (content.includes('\t') || lower.includes('nordnet')) return { broker: 'nordnet', rows: parseNordnet(content) };
  return { broker: 'avanza', rows: parseAvanza(content) };
}

// ── Transaction endpoints ──────────────────────────────────────────────────
app.post('/api/transactions/upload', requireUser, async (req, res) => {
  const { files } = req.body;
  if (!files || !files.length) return res.status(400).json({ error: 'No files provided' });
  const results = [];
  let allNew = [];
  for (const { name, content } of files) {
    try {
      const { broker, rows } = detectBrokerAndParse(name, content);
      results.push({ file: name, broker, count: rows.length });
      allNew = allNew.concat(rows);
    } catch(e) { results.push({ file: name, error: e.message }); }
  }
  const existing = loadTransactions(req.username);
  const existingIds = new Set(existing.map(t => `${t.broker}|${t.date}|${t.type}|${t.isin}|${t.quantity}|${t.price}`));
  const newUnique = allNew.filter(t => !existingIds.has(`${t.broker}|${t.date}|${t.type}|${t.isin}|${t.quantity}|${t.price}`));
  const merged = [...existing, ...newUnique].sort((a, b) => a.date.localeCompare(b.date));
  const toResolve = merged.filter(t => (t.type === 'buy' || t.type === 'sell') && !t.ticker && (t.rawTicker || t.isin));
  console.log(`[${req.username}] Resolving ${toResolve.length} tickers...`);
  for (const tx of toResolve) {
    tx.ticker = await resolveSymbol(tx.rawTicker || null, tx.isin, tx.name, tx.currency, tx.broker, req.username);
    await new Promise(r => setTimeout(r, 150));
  }
  saveTransactions(req.username, merged);
  res.json({ results, newAdded: newUnique.length, total: merged.length });
});

app.post('/api/transactions/resolve', requireUser, async (req, res) => {
  const transactions = loadTransactions(req.username);
  const unresolved = transactions.filter(t => (t.type === 'buy' || t.type === 'sell') && !t.ticker && (t.rawTicker || t.isin));
  console.log(`[${req.username}] Re-resolving ${unresolved.length} tickers...`);
  const cache = loadTickerCache(req.username);
  let cleared = 0;
  for (const [k, v] of Object.entries(cache)) {
    if (v === null || v === undefined || v === '') { delete cache[k]; cleared++; }
  }
  if (cleared > 0) { saveTickerCache(req.username, cache); }
  let resolved = 0;
  for (const tx of unresolved) {
    const ticker = await resolveSymbol(tx.rawTicker || null, tx.isin, tx.name, tx.currency, tx.broker, req.username);
    if (ticker) { tx.ticker = ticker; resolved++; }
    await new Promise(r => setTimeout(r, 150));
  }
  saveTransactions(req.username, transactions);
  res.json({ resolved, total: unresolved.length });
});

app.get('/api/transactions/count', requireUser, (req, res) => {
  const txs = loadTransactions(req.username);
  const trades = txs.filter(t => (t.type === 'buy' || t.type === 'sell') && (t.ticker || t.rawTicker));
  res.json({ total: txs.length, trades: trades.length });
});

app.get('/api/transactions', requireUser, (req, res) => {
  const txs = loadTransactions(req.username);
  res.json(txs.sort((a, b) => b.date.localeCompare(a.date)));
});

app.delete('/api/transactions', requireUser, (req, res) => {
  saveTransactions(req.username, []);
  res.json({ success: true });
});

app.get('/api/transactions/reconstruct', requireUser, (req, res) => {
  const transactions = loadTransactions(req.username);
  const normalised = transactions.map(t => ({ ...t, ticker: (t.ticker || t.rawTicker || '').trim() }));
  const trades = normalised.filter(t => (t.type === 'buy' || t.type === 'sell') && t.ticker).sort((a, b) => a.date.localeCompare(b.date));
  const holdings = {};
  for (const tx of trades) {
    const { ticker, quantity, price, isin } = tx;
    if (!holdings[ticker]) holdings[ticker] = { ticker, isin: isin || null, quantity: 0, totalCost: 0 };
    if (isin && !holdings[ticker].isin) holdings[ticker].isin = isin;
    const h = holdings[ticker];
    if (quantity > 0) {
      if (price === 0) { h.quantity += quantity; } else { h.totalCost += quantity * price; h.quantity += quantity; }
    } else {
      const sellQty = Math.abs(quantity);
      if (h.quantity <= 0) {} else if (price === 0) { h.quantity -= sellQty; } else {
        const avg = h.quantity > 0 ? h.totalCost / h.quantity : 0;
        h.totalCost = Math.max(0, h.totalCost - sellQty * avg);
        h.quantity -= sellQty;
      }
    }
  }
  const result = Object.values(holdings).filter(h => h.quantity > 0.001).map(h => ({ ticker: h.ticker, isin: h.isin || null, quantity: parseFloat(h.quantity.toFixed(6)), avgPrice: h.quantity > 0 ? parseFloat((h.totalCost / h.quantity).toFixed(4)) : 0 }));
  if (result.length > 0) appendActivity(req.username, { type: 'holdings_update', holdingCount: result.length, tickers: result.slice(0, 5).map(h => h.ticker) });
  res.json(result);
});

// ── Portfolio valuation ────────────────────────────────────────────────────
app.post('/api/portfolio', requireUser, async (req, res) => {
  const { portfolio, baseCurrency } = req.body;
  if (!portfolio || !portfolio.length) return res.json({ portfolio: [], totals: null });
  const BC = baseCurrency || 'SEK';
  let fxRates = {};
  try {
    const fx = await yahooFinance.quote(['USDSEK=X','EURSEK=X','GBPSEK=X','NOKSEK=X','DKKSEK=X','CADSEK=X','AUDSEK=X','HKDSEK=X','CHFSEK=X','JPYSEK=X']);
    const arr = Array.isArray(fx) ? fx : [fx];
    arr.forEach(q => { if (q && q.symbol && q.regularMarketPrice) fxRates[q.symbol] = q.regularMarketPrice; });
  } catch(e) {}

  const toSEK = (amount, currency) => {
    if (!currency || currency === 'SEK') return amount;
    const key = `${currency}SEK=X`;
    return fxRates[key] ? amount * fxRates[key] : amount;
  };
  const fromSEK = (amount) => {
    if (BC === 'SEK') return amount;
    const key = `${BC}SEK=X`;
    return fxRates[key] ? amount / fxRates[key] : amount;
  };

  const COUNTRY_FLAGS = { ST: '🇸🇪', OL: '🇳🇴', CO: '🇩🇰', HE: '🇫🇮', AS: '🇳🇱', PA: '🇫🇷', DE: '🇩🇪', F: '🇩🇪', L: '🇬🇧', IL: '🇮🇪', MI: '🇮🇹', MC: '🇪🇸', SW: '🇨🇭', VX: '🇨🇭', TO: '🇨🇦', V: '🇨🇦', AX: '🇦🇺', HK: '🇭🇰', T: '🇯🇵', SI: '🇸🇬' };
  const getFlag = (ticker) => { const parts = ticker.split('.'); if (parts.length > 1) return COUNTRY_FLAGS[parts[parts.length - 1]] || '🇺🇸'; return '🇺🇸'; };
  const cleanName = (name) => name ? name.replace(/\b(AB|ASA|AS|A\/S|SE|Inc\.|Corp\.|Ltd\.|PLC|N\.V\.|S\.A\.|GmbH|AG|B\.V\.)\b/gi, '').trim() : name;

  const results = [];
  for (const h of portfolio) {
    try {
      const q = await yahooFinance.quote(h.ticker);
      if (!q) continue;
      const nativePrice = q.regularMarketPrice || 0;
      const prevClose = q.regularMarketPreviousClose || nativePrice;
      const currency = q.currency || 'SEK';
      const currentValueSEK = toSEK(nativePrice * h.quantity, currency);
      const currentValueBase = fromSEK(currentValueSEK);
      const costSEK = toSEK((h.avgPrice || 0) * h.quantity, currency);
      const costBase = fromSEK(costSEK);
      const profitBase = currentValueBase - costBase;
      const returnPct = costBase > 0 ? (profitBase / costBase) * 100 : 0;
      const todayChangePct = prevClose > 0 ? ((nativePrice - prevClose) / prevClose) * 100 : 0;
      const todayGainBase = fromSEK(toSEK((nativePrice - prevClose) * h.quantity, currency));
      results.push({
        ticker: h.ticker, name: q.longName || q.shortName || h.ticker, cleanName: cleanName(q.longName || q.shortName || h.ticker),
        flag: getFlag(h.ticker), currency, quantity: h.quantity, nativePrice, avgPrice: h.avgPrice || 0,
        currentValue: currentValueBase, profit: profitBase, returnPct, todayChangePct, todayGainBase,
        sector: q.sector || 'Unknown', quoteType: q.quoteType,
      });
    } catch(e) { console.error(`[portfolio] Failed to quote ${h.ticker}:`, e.message); }
  }
  const totalValue = results.reduce((s, r) => s + r.currentValue, 0);
  const totalCost = results.reduce((s, r) => s + fromSEK(toSEK((r.avgPrice || 0) * r.quantity, r.currency)), 0);
  const totalProfit = totalValue - totalCost;
  res.json({ portfolio: results, totals: { value: totalValue, cost: totalCost, profit: totalProfit, returnPct: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0 } });
});

// ── Other portfolio routes ─────────────────────────────────────────────────
app.get('/api/overrides', requireUser, (req, res) => { res.json(loadOverrides(req.username)); });

app.post('/api/overrides', requireUser, (req, res) => {
  const { isin, ticker } = req.body;
  if (!isin || !ticker) return res.status(400).json({ error: 'isin and ticker required' });
  const overrides = loadOverrides(req.username);
  overrides[isin] = ticker;
  saveOverrides(req.username, overrides);
  const cache = loadTickerCache(req.username);
  for (const key of Object.keys(cache)) { if (key.includes(isin)) delete cache[key]; }
  saveTickerCache(req.username, cache);
  res.json({ success: true, overrides });
});

app.delete('/api/overrides/:isin', requireUser, (req, res) => {
  const overrides = loadOverrides(req.username);
  delete overrides[req.params.isin];
  saveOverrides(req.username, overrides);
  res.json({ success: true, overrides });
});

// ── Search ─────────────────────────────────────────────────────────────────
app.get('/api/search/:query', requireUser, async (req, res) => {
  try {
    const results = await yahooFinance.search(req.params.query);
    res.json((results?.quotes || []).filter(q => q.symbol && q.quoteType !== 'OPTION').slice(0, 10));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/validate/:ticker', requireUser, async (req, res) => {
  try {
    const q = await yahooFinance.quote(req.params.ticker);
    res.json({ valid: !!q, ticker: req.params.ticker, name: q?.longName || q?.shortName });
  } catch(e) { res.json({ valid: false }); }
});

// ── Dividends ──────────────────────────────────────────────────────────────
app.get('/api/dividends', requireUser, (req, res) => {
  const transactions = loadTransactions(req.username);
  const divs = transactions.filter(t => t.type === 'dividend' && t.totalSEK);
  const thisYear = new Date().getFullYear().toString();
  const totalAllTime = divs.reduce((s, t) => s + Math.abs(t.totalSEK), 0);
  const totalThisYear = divs.filter(t => t.date?.startsWith(thisYear)).reduce((s, t) => s + Math.abs(t.totalSEK), 0);
  const byYear = {};
  divs.forEach(t => {
    const y = t.date?.substring(0, 4);
    if (!y) return;
    if (!byYear[y]) byYear[y] = { year: y, total: 0, stocks: {} };
    byYear[y].total += Math.abs(t.totalSEK);
    const n = t.name || 'Unknown';
    byYear[y].stocks[n] = (byYear[y].stocks[n] || 0) + Math.abs(t.totalSEK);
  });
  const byYearArr = Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year)).map(y => ({ ...y, stocks: Object.entries(y.stocks).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total) }));
  const byStock = {};
  divs.forEach(t => { const n = t.name || 'Unknown'; byStock[n] = (byStock[n] || 0) + Math.abs(t.totalSEK); });
  const byStockArr = Object.entries(byStock).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  res.json({ totalAllTime, totalThisYear, byYear: byYearArr, byStock: byStockArr });
});

// ── Ownership ──────────────────────────────────────────────────────────────
app.post('/api/ownership', requireUser, async (req, res) => {
  const { tickers } = req.body;
  if (!tickers || !tickers.length) return res.json([]);
  const results = [];
  for (const { ticker, name } of tickers) {
    try {
      const data = await yahooFinance.quoteSummary(ticker, { modules: ['institutionOwnership', 'insiderHolders', 'majorHoldersBreakdown'] });
      const mhb = data?.majorHoldersBreakdown;
      const inst = data?.institutionOwnership?.ownershipList || [];
      const insiders = data?.insiderHolders?.holders || [];
      if (!mhb && !inst.length) { results.push({ ticker, name, noData: true }); continue; }
      results.push({
        ticker, name,
        institutionPct: mhb?.institutionsPercentHeld ?? null,
        insiderPct: mhb?.insidersPercentHeld ?? null,
        floatPct: mhb?.institutionsFloatPercentHeld ?? null,
        topInstitutional: inst.slice(0, 8).map(o => ({ name: o.organization, pctHeld: o.pctHeld?.raw ?? 0, shares: o.position?.raw ?? 0 })),
        topInsiders: insiders.slice(0, 6).map(i => ({ name: i.name, relation: i.relation, shares: i.latestTransactionDescription?.raw ?? 0 })),
      });
    } catch(e) { results.push({ ticker, name, error: true }); }
    await new Promise(r => setTimeout(r, 200));
  }
  res.json(results);
});

app.get('/api/ownership/search/:query', requireUser, async (req, res) => {
  try {
    const results = await yahooFinance.search(req.params.query);
    res.json((results?.quotes || []).filter(q => q.symbol && q.quoteType === 'EQUITY').slice(0, 8).map(q => ({ ticker: q.symbol, name: q.longname || q.shortname, exchange: q.exchange })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Performance history ────────────────────────────────────────────────────
app.post('/api/history', requireUser, async (req, res) => {
  const { portfolio, baseCurrency, period } = req.body;
  if (!portfolio || !portfolio.length) return res.json([]);
  const periodMap = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '3Y': 1095 };
  const days = periodMap[period] || 90;
  const startDate = new Date(); startDate.setDate(startDate.getDate() - days);
  const priceHistory = {};
  try {
    for (const h of portfolio) {
      const hist = await yahooFinance.historical(h.ticker, { period1: startDate, interval: '1d' });
      priceHistory[h.ticker] = {};
      hist.forEach(d => { priceHistory[h.ticker][d.date.toISOString().split('T')[0]] = d.close; });
      await new Promise(r => setTimeout(r, 100));
    }
  } catch(e) { console.error('History fetch failed:', e.message); }
  const allDates = new Set();
  for (const ticker of Object.keys(priceHistory)) for (const date of Object.keys(priceHistory[ticker])) allDates.add(date);
  const sortedDates = [...allDates].sort();
  if (sortedDates.length < 2) return res.json([]);
  const nearest = (ticker, date) => {
    if (priceHistory[ticker]?.[date]) return priceHistory[ticker][date];
    const nearest = Object.keys(priceHistory[ticker] || {}).filter(d => d <= date).sort().pop();
    return nearest ? priceHistory[ticker][nearest] : null;
  };
  const points = [];
  for (const date of sortedDates) {
    let totalValue = 0;
    for (const item of portfolio) { const p = nearest(item.ticker, date); if (p) totalValue += p * item.quantity; }
    if (totalValue > 0) points.push({ date, value: totalValue });
  }
  if (points.length < 2) return res.json([]);
  const baseValue = points[0].value;
  res.json(points.map(p => ({ date: p.date, returnPct: parseFloat(((p.value - baseValue) / baseValue * 100).toFixed(2)) })));
});

// ── CS Skins API ───────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Statera/1.0' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Invalid JSON from ' + url)); } });
    }).on('error', reject);
  });
}

app.get('/api/cs/settings', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const rows = await dbAll(db, 'SELECT key, value FROM cs_settings');
    const s = {}; rows.forEach(r => { s[r.key] = r.value; });
    res.json(s);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cs/settings', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    await dbRun(db, 'INSERT OR REPLACE INTO cs_settings (key, value) VALUES (?, ?)', [key, value]);
    // Also update profile steamId if relevant
    if (key === 'steam_id') {
      const p = loadProfile(req.username);
      saveProfile(req.username, { ...p, steamId: value });
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cs/prices/sync', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    let prices = null;
    const priceUrls = ['https://prices.csgotrader.app/latest/prices_v6.json','https://api.csgotrader.app/prices'];
    for (const url of priceUrls) {
      try { const d = await fetchJSON(url); if (d && typeof d === 'object' && !d.error) { prices = d; break; } } catch(e) {}
    }
    let sekRate = 10.5;
    try { const fx = await fetchJSON('https://api.exchangerate-api.com/v4/latest/USD'); sekRate = fx?.rates?.SEK || 10.5; } catch(e) {}
    const now = new Date().toISOString();
    if (prices) {
      const entries = Object.entries(prices);
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          const stmt = db.prepare('INSERT OR REPLACE INTO cs_price_cache (skin_name, price_usd, price_sek, last_updated) VALUES (?, ?, ?, ?)');
          for (const [name, data] of entries) {
            const priceUSD = data?.steam?.last_24h || data?.steam?.last_7d || data?.steam?.last_30d || 0;
            stmt.run(name, priceUSD, priceUSD * sekRate, now);
          }
          stmt.finalize();
          db.run('COMMIT', err => { if (err) reject(err); else resolve(); });
        });
      });
      res.json({ success: true, count: entries.length, sekRate, source: 'csgotrader' });
    } else {
      res.status(500).json({ error: 'Could not fetch prices. Try again later.' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cs/prices/search/:query', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const rows = await dbAll(db, 'SELECT skin_name, price_usd, price_sek FROM cs_price_cache WHERE skin_name LIKE ? LIMIT 20', [`%${req.params.query}%`]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cs/steam/inventory/:steamId', requireUser, async (req, res) => {
  const { steamId } = req.params;
  try {
    const data = await fetchJSON(`https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=500`);
    if (!data || !data.assets) return res.status(404).json({ error: 'Inventory not found or private' });
    const db = getUserDB(req.username, req.userDir);
    const descMap = {};
    (data.descriptions || []).forEach(d => { descMap[`${d.classid}_${d.instanceid}`] = d; });
    const items = await Promise.all((data.assets || []).map(async asset => {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`];
      const name = desc?.market_hash_name || desc?.name || 'Unknown';
      let priceSEK = 0;
      if (db) { const p = await dbGet(db, 'SELECT price_sek FROM cs_price_cache WHERE skin_name = ?', [name]).catch(() => null); priceSEK = p?.price_sek || 0; }
      return { assetId: asset.assetid, name, iconUrl: desc?.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/128x128` : null, tradable: desc?.tradable === 1, type: desc?.type || '', priceSEK };
    }));
    const valid = items.filter(i => i.name !== 'Unknown');
    res.json({ items: valid, totalValue: valid.reduce((s, i) => s + i.priceSEK, 0), count: valid.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cs/inventory', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const items = await dbAll(db, `SELECT i.*, s.id as sale_id, s.sale_price, s.sale_currency, s.sale_date, s.notes as sale_notes, p.price_sek as current_price_sek, p.price_usd as current_price_usd FROM cs_inventory i LEFT JOIN cs_sales s ON s.inventory_id = i.id LEFT JOIN cs_price_cache p ON p.skin_name = i.skin_name ORDER BY i.purchase_date DESC`);
    res.json(items);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cs/inventory', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { skin_name, exterior, float_value, pattern, purchase_price, purchase_currency, purchase_date, notes } = req.body;
  if (!skin_name || !purchase_date) return res.status(400).json({ error: 'skin_name and purchase_date required' });
  try {
    const result = await dbRun(db, `INSERT INTO cs_inventory (skin_name, exterior, float_value, pattern, purchase_price, purchase_currency, purchase_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [skin_name, exterior || null, float_value || null, pattern || null, purchase_price || 0, purchase_currency || 'SEK', purchase_date, notes || null]);
    appendActivity(req.username, { type: 'cs_trade', action: 'buy', skinName: skin_name, price: purchase_price, currency: purchase_currency, exterior: exterior || '' });
    res.json({ id: result.lastID, success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cs/inventory/:id', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try { await dbRun(db, 'DELETE FROM cs_inventory WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cs/inventory/:id/sell', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { sale_price, sale_currency, sale_date, notes } = req.body;
  if (!sale_price || !sale_date) return res.status(400).json({ error: 'sale_price and sale_date required' });
  try {
    await dbRun(db, 'UPDATE cs_inventory SET sold = 1 WHERE id = ?', [req.params.id]);
    const result = await dbRun(db, 'INSERT INTO cs_sales (inventory_id, sale_price, sale_currency, sale_date, notes) VALUES (?, ?, ?, ?, ?)', [req.params.id, sale_price, sale_currency || 'SEK', sale_date, notes || null]);
    const soldSkin = await dbGet(db, 'SELECT skin_name, purchase_price FROM cs_inventory WHERE id = ?', [req.params.id]).catch(() => null);
    if (soldSkin) appendActivity(req.username, { type: 'cs_trade', action: 'sell', skinName: soldSkin.skin_name, buyPrice: soldSkin.purchase_price, sellPrice: sale_price, currency: sale_currency });
    res.json({ id: result.lastID, success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cs/pnl', requireUser, async (req, res) => {
  const db = getUserDB(req.username, req.userDir);
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const [sold, holding] = await Promise.all([
      dbAll(db, 'SELECT i.purchase_price, s.sale_price FROM cs_inventory i JOIN cs_sales s ON s.inventory_id = i.id'),
      dbAll(db, 'SELECT i.purchase_price, p.price_sek as current_price FROM cs_inventory i LEFT JOIN cs_price_cache p ON p.skin_name = i.skin_name WHERE i.sold = 0')
    ]);
    const realised = sold.reduce((s, r) => s + (r.sale_price - r.purchase_price), 0);
    const unrealised = holding.reduce((s, r) => s + ((r.current_price || 0) - r.purchase_price), 0);
    const totalInvested = holding.reduce((s, r) => s + r.purchase_price, 0);
    const currentValue = holding.reduce((s, r) => s + (r.current_price || 0), 0);
    res.json({ realised, unrealised, totalInvested, currentValue, totalPnl: realised + unrealised, soldCount: sold.length, holdingCount: holding.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Admin middleware ───────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const username = req.headers['x-user'];
  if (!username || username.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const user = findUser(username);
  if (!user) return res.status(403).json({ error: 'Admin user not found.' });
  req.username = user.username;
  next();
}

// ── Announcements file ─────────────────────────────────────────────────────
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');
function loadAnnouncements() { return loadJSON(ANNOUNCEMENTS_FILE, []); }
function saveAnnouncements(a) { saveJSON(ANNOUNCEMENTS_FILE, a); }

// ── Admin: System stats ────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const users = loadUsers();
  const usersStats = users.map(u => {
    const udir = getUserDir(u.username);
    const txs = loadTransactions(u.username);
    const profile = loadProfile(u.username);
    // Get folder size
    let folderSize = 0;
    try {
      const files = fs.readdirSync(udir);
      files.forEach(f => {
        try { folderSize += fs.statSync(path.join(udir, f)).size; } catch(e) {}
      });
    } catch(e) {}
    return {
      username: u.username,
      createdAt: u.createdAt,
      role: getUserRole(u.username),
      transactionCount: txs.length,
      tradeCount: txs.filter(t => t.type === 'buy' || t.type === 'sell').length,
      folderSizeKB: Math.round(folderSize / 1024),
      publicInventory: profile.publicInventory,
      publicHoldings: profile.publicHoldings,
      hasSteam: !!profile.steamId,
    };
  });

  // Total transactions
  const totalTx = usersStats.reduce((s, u) => s + u.transactionCount, 0);
  const totalTrades = usersStats.reduce((s, u) => s + u.tradeCount, 0);

  // Ticker cache stats
  let tickerStats = { total: 0, resolved: 0, failed: 0 };
  users.forEach(u => {
    const cache = loadTickerCache(u.username);
    const vals = Object.values(cache);
    tickerStats.total += vals.length;
    tickerStats.resolved += vals.filter(v => v).length;
    tickerStats.failed += vals.filter(v => !v).length;
  });

  // System info
  const mem = process.memoryUsage();
  res.json({
    system: {
      uptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
      memoryMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      platform: process.platform,
    },
    users: usersStats,
    totals: { userCount: users.length, totalTx, totalTrades },
    tickerCache: tickerStats,
  });
});

// ── Admin: Delete user ─────────────────────────────────────────────────────
app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
  const { username } = req.params;
  if (username.toLowerCase() === 'admin') return res.status(400).json({ error: 'Cannot delete admin account.' });
  const users = loadUsers();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });
  const udir = getUserDir(username);
  try { fs.rmSync(udir, { recursive: true, force: true }); } catch(e) {}
  users.splice(idx, 1);
  saveUsers(users);
  appendModLog('admin', 'delete-user', username);
  res.json({ success: true });
});

// ── Admin: Reset user password ─────────────────────────────────────────────
app.post('/api/admin/users/:username/reset-password', requireAdmin, (req, res) => {
  const { username } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const newSalt = crypto.randomBytes(32).toString('hex');
  user.hash = hashPassword(newPassword, newSalt);
  user.salt = newSalt;
  saveUsers(users);
  appendModLog('admin', 'reset-password', username);
  res.json({ success: true });
});

// ── Admin: Clear user bio ──────────────────────────────────────────────────
app.post('/api/admin/users/:username/clear-bio', requireAdmin, (req, res) => {
  const { username } = req.params;
  const user = findUser(username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const profile = loadProfile(username);
  saveProfile(username, { ...profile, bio: '' });
  res.json({ success: true });
});

// ── Admin: Set user privacy ────────────────────────────────────────────────
app.post('/api/admin/users/:username/set-privacy', requireAdmin, (req, res) => {
  const { username } = req.params;
  const { publicInventory, publicHoldings } = req.body;
  const user = findUser(username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const profile = loadProfile(username);
  saveProfile(username, { ...profile, publicInventory: publicInventory ?? profile.publicInventory, publicHoldings: publicHoldings ?? profile.publicHoldings });
  res.json({ success: true });
});

// ── Admin: Clear ticker cache ──────────────────────────────────────────────
app.post('/api/admin/cache/clear', requireAdmin, (req, res) => {
  const { username } = req.body; // optional — if not provided, clear all
  const users = username ? [findUser(username)].filter(Boolean) : loadUsers();
  let cleared = 0;
  users.forEach(u => {
    const cacheFile = userFile(u.username, 'ticker_cache.json');
    if (fs.existsSync(cacheFile)) { fs.unlinkSync(cacheFile); cleared++; }
  });
  res.json({ success: true, cleared });
});

// ── Admin: Re-resolve tickers for a user ──────────────────────────────────
app.post('/api/admin/users/:username/resolve', requireAdmin, async (req, res) => {
  const { username } = req.params;
  const user = findUser(username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const transactions = loadTransactions(username);
  const unresolved = transactions.filter(t => (t.type === 'buy' || t.type === 'sell') && !t.ticker && (t.rawTicker || t.isin));
  let resolved = 0;
  for (const tx of unresolved) {
    const ticker = await resolveSymbol(tx.rawTicker || null, tx.isin, tx.name, tx.currency, tx.broker, username);
    if (ticker) { tx.ticker = ticker; resolved++; }
    await new Promise(r => setTimeout(r, 150));
  }
  saveTransactions(username, transactions);
  res.json({ resolved, total: unresolved.length });
});

// ── Admin: Ticker failure stats ────────────────────────────────────────────
app.get('/api/admin/ticker-failures', requireAdmin, (req, res) => {
  const users = loadUsers();
  const failures = [];
  users.forEach(u => {
    const txs = loadTransactions(u.username);
    txs.filter(t => (t.type === 'buy' || t.type === 'sell') && !t.ticker && (t.rawTicker || t.isin)).forEach(tx => {
      failures.push({ username: u.username, rawTicker: tx.rawTicker, isin: tx.isin, name: tx.name });
    });
  });
  // Group by rawTicker
  const grouped = {};
  failures.forEach(f => {
    const key = f.rawTicker || f.isin || f.name;
    if (!grouped[key]) grouped[key] = { key, count: 0, users: new Set(), isin: f.isin, name: f.name };
    grouped[key].count++;
    grouped[key].users.add(f.username);
  });
  res.json(Object.values(grouped).map(g => ({ ...g, users: [...g.users] })).sort((a, b) => b.count - a.count).slice(0, 50));
});

// ── Admin: Export user data ────────────────────────────────────────────────
app.get('/api/admin/users/:username/export', requireAdmin, (req, res) => {
  const { username } = req.params;
  const user = findUser(username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const txs = loadTransactions(username);
  const profile = loadProfile(username);
  const overrides = loadOverrides(username);
  res.json({ username, profile, transactions: txs, overrides, exportedAt: new Date().toISOString() });
});

// ── Admin: Announcements ───────────────────────────────────────────────────
app.get('/api/announcements', (req, res) => {
  res.json(loadAnnouncements());
});

app.post('/api/admin/announcements', requireAdmin, (req, res) => {
  const { title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message required.' });
  const announcements = loadAnnouncements();
  const newAnn = { id: Date.now(), title, message, type: type || 'info', createdAt: new Date().toISOString() };
  announcements.unshift(newAnn);
  saveAnnouncements(announcements.slice(0, 10)); // keep last 10
  res.json({ success: true, announcement: newAnn });
});

app.delete('/api/admin/announcements/:id', requireAdmin, (req, res) => {
  const announcements = loadAnnouncements().filter(a => a.id !== parseInt(req.params.id));
  saveAnnouncements(announcements);
  res.json({ success: true });
});


// ── Role management (admin only) ───────────────────────────────────────────
app.post('/api/admin/users/:username/set-role', requireAdmin, (req, res) => {
  const { username } = req.params;
  const { role } = req.body;
  if (username.toLowerCase() === 'admin') return res.status(400).json({ error: 'Cannot change admin role.' });
  if (!['user', 'moderator'].includes(role)) return res.status(400).json({ error: 'Invalid role. Must be user or moderator.' });
  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.role = role;
  saveUsers(users);
  appendModLog('admin', `set-role:${role}`, username);
  res.json({ success: true, role });
});

// ── Moderation log (mod + admin) ───────────────────────────────────────────
app.get('/api/mod/log', requireModerator, (req, res) => {
  res.json(loadModLog());
});

// ── Moderator: user actions ────────────────────────────────────────────────
app.post('/api/mod/users/:username/reset-password', requireModerator, (req, res) => {
  const { username } = req.params;
  const { newPassword } = req.body;
  if (getUserRole(username) === 'admin') return res.status(403).json({ error: 'Cannot reset admin password.' });
  if (getUserRole(username) === 'moderator' && req.role !== 'admin') return res.status(403).json({ error: 'Only admin can reset a moderator password.' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const newSalt = crypto.randomBytes(32).toString('hex');
  user.hash = hashPassword(newPassword, newSalt);
  user.salt = newSalt;
  saveUsers(users);
  appendModLog(req.username, 'reset-password', username);
  res.json({ success: true });
});

app.post('/api/mod/users/:username/clear-bio', requireModerator, (req, res) => {
  const { username } = req.params;
  if (getUserRole(username) === 'admin') return res.status(403).json({ error: 'Cannot modify admin.' });
  const profile = loadProfile(username);
  saveProfile(username, { ...profile, bio: '' });
  appendModLog(req.username, 'clear-bio', username);
  res.json({ success: true });
});

app.post('/api/mod/users/:username/set-privacy', requireModerator, (req, res) => {
  const { username } = req.params;
  const { publicInventory, publicHoldings } = req.body;
  const profile = loadProfile(username);
  saveProfile(username, { ...profile, publicInventory: publicInventory ?? profile.publicInventory, publicHoldings: publicHoldings ?? profile.publicHoldings });
  appendModLog(req.username, 'set-privacy', username, JSON.stringify({ publicInventory, publicHoldings }));
  res.json({ success: true });
});

app.post('/api/mod/users/:username/resolve', requireModerator, async (req, res) => {
  const { username } = req.params;
  const user = findUser(username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const transactions = loadTransactions(username);
  const unresolved = transactions.filter(t => (t.type === 'buy' || t.type === 'sell') && !t.ticker && (t.rawTicker || t.isin));
  let resolved = 0;
  for (const tx of unresolved) {
    const ticker = await resolveSymbol(tx.rawTicker || null, tx.isin, tx.name, tx.currency, tx.broker, username);
    if (ticker) { tx.ticker = ticker; resolved++; }
    await new Promise(r => setTimeout(r, 150));
  }
  saveTransactions(username, transactions);
  appendModLog(req.username, 'resolve-tickers', username, `resolved ${resolved}`);
  res.json({ resolved, total: unresolved.length });
});

// ── Mod announcements ──────────────────────────────────────────────────────
app.post('/api/mod/announcements', requireModerator, (req, res) => {
  const { title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message required.' });
  const announcements = loadAnnouncements();
  const newAnn = { id: Date.now(), title, message, type: type || 'info', createdAt: new Date().toISOString(), postedBy: req.username };
  announcements.unshift(newAnn);
  saveAnnouncements(announcements.slice(0, 10));
  appendModLog(req.username, 'post-announcement', '-', title);
  res.json({ success: true, announcement: newAnn });
});

app.delete('/api/mod/announcements/:id', requireModerator, (req, res) => {
  const announcements = loadAnnouncements().filter(a => a.id !== parseInt(req.params.id));
  saveAnnouncements(announcements);
  appendModLog(req.username, 'delete-announcement', '-', req.params.id);
  res.json({ success: true });
});

// ── Friends ────────────────────────────────────────────────────────────────
app.get('/api/friends', requireUser, (req, res) => {
  const data = loadFriends(req.username);
  // Enrich with profiles
  const enrich = (usernames) => usernames.map(u => {
    const p = loadProfile(u);
    return { username: u, avatarBase64: p.avatarBase64 || null, bio: p.bio || '', role: getUserRole(u) };
  });
  res.json({ friends: enrich(data.friends), incoming: enrich(data.incoming), outgoing: data.outgoing });
});

app.post('/api/friends/request/:username', requireUser, (req, res) => {
  const target = req.params.username;
  if (target === req.username) return res.status(400).json({ error: 'Cannot friend yourself.' });
  if (!findUser(target)) return res.status(404).json({ error: 'User not found.' });
  const myData = loadFriends(req.username);
  const theirData = loadFriends(target);
  if (myData.friends.includes(target)) return res.status(400).json({ error: 'Already friends.' });
  if (myData.outgoing.includes(target)) return res.status(400).json({ error: 'Request already sent.' });
  // If they already sent us a request, auto-accept
  if (myData.incoming.includes(target)) {
    myData.friends.push(target);
    myData.incoming = myData.incoming.filter(u => u !== target);
    theirData.friends.push(req.username);
    theirData.outgoing = theirData.outgoing.filter(u => u !== req.username);
    saveFriends(req.username, myData);
    saveFriends(target, theirData);
    appendActivity(req.username, { type: 'friend_added', targetUser: target });
    appendActivity(target, { type: 'friend_added', targetUser: req.username });
    return res.json({ success: true, status: 'accepted' });
  }
  myData.outgoing.push(target);
  theirData.incoming.push(req.username);
  saveFriends(req.username, myData);
  saveFriends(target, theirData);
  res.json({ success: true, status: 'requested' });
});

app.post('/api/friends/accept/:username', requireUser, (req, res) => {
  const sender = req.params.username;
  const myData = loadFriends(req.username);
  const theirData = loadFriends(sender);
  if (!myData.incoming.includes(sender)) return res.status(400).json({ error: 'No pending request from this user.' });
  myData.friends.push(sender);
  myData.incoming = myData.incoming.filter(u => u !== sender);
  theirData.friends.push(req.username);
  theirData.outgoing = theirData.outgoing.filter(u => u !== req.username);
  saveFriends(req.username, myData);
  saveFriends(sender, theirData);
  appendActivity(req.username, { type: 'friend_added', targetUser: sender });
  appendActivity(sender, { type: 'friend_added', targetUser: req.username });
  res.json({ success: true });
});

app.post('/api/friends/decline/:username', requireUser, (req, res) => {
  const sender = req.params.username;
  const myData = loadFriends(req.username);
  const theirData = loadFriends(sender);
  myData.incoming = myData.incoming.filter(u => u !== sender);
  theirData.outgoing = theirData.outgoing.filter(u => u !== req.username);
  saveFriends(req.username, myData);
  saveFriends(sender, theirData);
  res.json({ success: true });
});

app.post('/api/friends/remove/:username', requireUser, (req, res) => {
  const target = req.params.username;
  const myData = loadFriends(req.username);
  const theirData = loadFriends(target);
  myData.friends = myData.friends.filter(u => u !== target);
  theirData.friends = theirData.friends.filter(u => u !== req.username);
  saveFriends(req.username, myData);
  saveFriends(target, theirData);
  res.json({ success: true });
});

// ── Activity feed ──────────────────────────────────────────────────────────
app.get('/api/feed', requireUser, (req, res) => {
  const friends = loadFriends(req.username).friends;
  const allActivity = [];
  // Include own activity too
  [...friends, req.username].forEach(username => {
    const activity = loadActivity(username);
    const profile = loadProfile(username);
    activity.forEach(a => {
      allActivity.push({ ...a, username, avatarBase64: profile.avatarBase64 || null, role: getUserRole(username) });
    });
  });
  allActivity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(allActivity.slice(0, 50));
});

app.post('/api/activity/screenshot', requireUser, (req, res) => {
  const { skinName, caption, imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required.' });
  appendActivity(req.username, { type: 'skin_screenshot', skinName: skinName || 'Unknown skin', caption: caption || '', imageBase64 });
  res.json({ success: true });
});

app.get('/api/activity/mine', requireUser, (req, res) => {
  res.json(loadActivity(req.username));
});

app.delete('/api/activity/:id', requireUser, (req, res) => {
  const activity = loadActivity(req.username).filter(a => String(a.id) !== String(req.params.id));
  saveActivity(req.username, activity);
  res.json({ success: true });
});

// ── Pending friend request count (for notification dot) ───────────────────
app.get('/api/friends/pending-count', requireUser, (req, res) => {
  const data = loadFriends(req.username);
  res.json({ count: data.incoming.length });
});

// ── Catch-all ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = FRONTEND_DIST ? path.join(FRONTEND_DIST, 'index.html') : path.join(__dirname, 'frontend', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else next();
});

const PORT = process.env.PORT || 3000;
// Adding '0.0.0.0' tells the server to listen to external requests
app.listen(PORT, '0.0.0.0', () => console.log(`Statera server running on port ${PORT}`));
