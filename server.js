const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { initDB, getDB } = require('./db');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const app = express();
app.use(express.json({ limit: '20mb' }));

// Data files stored next to server.js in dev, or in DATA_DIR env var for production
const DATA_DIR = process.env.STATERA_DATA_DIR || __dirname;

// Serve built React frontend in production
const FRONTEND_DIST = process.env.STATERA_FRONTEND || null;
if (FRONTEND_DIST && fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

// Init SQLite for CS features
initDB(DATA_DIR);

const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const TICKER_CACHE_FILE = path.join(DATA_DIR, 'ticker_cache.json');
const OVERRIDES_FILE = path.join(DATA_DIR, 'ticker_overrides.json');

// --- AUTH ---
const crypto = require('crypto');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

function loadAuth() {
  try { if (fs.existsSync(AUTH_FILE)) return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); } catch(e) {}
  return null;
}

function saveAuth(data) { fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2)); }

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

// Check if any user exists
app.get('/api/auth/status', (req, res) => {
  const auth = loadAuth();
  res.json({ hasUser: !!auth });
});

// Register new user (only allowed if no user exists yet)
app.post('/api/auth/register', (req, res) => {
  const existing = loadAuth();
  if (existing) return res.status(400).json({ error: 'A user already exists.' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPassword(password, salt);
  saveAuth({ username: username.trim(), hash, salt });
  res.json({ success: true, username: username.trim() });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const auth = loadAuth();
  if (!auth) return res.status(400).json({ error: 'No user registered.' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (auth.username.toLowerCase() !== username.trim().toLowerCase()) return res.status(401).json({ error: 'Invalid username or password.' });
  const hash = hashPassword(password, auth.salt);
  if (hash !== auth.hash) return res.status(401).json({ error: 'Invalid username or password.' });
  res.json({ success: true, username: auth.username });
});

// Change password
app.post('/api/auth/change-password', (req, res) => {
  const auth = loadAuth();
  if (!auth) return res.status(400).json({ error: 'No user registered.' });
  const { currentPassword, newPassword } = req.body;
  const hash = hashPassword(currentPassword, auth.salt);
  if (hash !== auth.hash) return res.status(401).json({ error: 'Current password is incorrect.' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const newSalt = crypto.randomBytes(32).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);
  saveAuth({ username: auth.username, hash: newHash, salt: newSalt });
  res.json({ success: true });
});



// --- FILE HELPERS ---
function loadTransactions() { try { if (fs.existsSync(TRANSACTIONS_FILE)) return JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8')); } catch(e) {} return[]; }
function saveTransactions(t) { fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(t, null, 2)); }
function loadTickerCache() { try { if (fs.existsSync(TICKER_CACHE_FILE)) return JSON.parse(fs.readFileSync(TICKER_CACHE_FILE, 'utf8')); } catch(e) {} return {}; }
function saveTickerCache(c) { fs.writeFileSync(TICKER_CACHE_FILE, JSON.stringify(c, null, 2)); }
function loadOverrides() { try { if (fs.existsSync(OVERRIDES_FILE)) return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')); } catch(e) {} return {}; }
function saveOverrides(o) { fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(o, null, 2)); }

// --- FX ---
async function getFxRate(from, to) {
  if (from === to) return 1.0;
  try {
    const q = await yahooFinance.quote(`${from}${to}=X`);
    return q.regularMarketPrice || q.price || 1.0;
  } catch(e) {
    try {
      const q2 = await yahooFinance.quote(`${to}${from}=X`);
      return 1.0 / (q2.regularMarketPrice || q2.price || 1.0);
    } catch(e2) { return 1.0; }
  }
}

function parseSENum(s) {
  if (s === null || s === undefined || s === '') return 0;
  return parseFloat(String(s).replace(',', '.').replace(/\s/g, '')) || 0;
}


// --- FLAG + EXCHANGE HELPERS ---
const SUFFIX_FLAG = {
  '.ST': '🇸🇪', '.OL': '🇳🇴', '.CO': '🇩🇰', '.HE': '🇫🇮',
  '.PA': '🇫🇷', '.DE': '🇩🇪', '.AS': '🇳🇱', '.L': '🇬🇧', '.IL': '🇬🇧',
  '.TO': '🇨🇦', '.V': '🇨🇦', '.CN': '🇨🇦',
  '.AX': '🇦🇺', '.NZ': '🇳🇿',
  '.MI': '🇮🇹', '.MC': '🇪🇸', '.SW': '🇨🇭', '.BR': '🇧🇪',
  '.AT': '🇦🇹', '.LS': '🇵🇹', '.VX': '🇨🇭',
  '.T': '🇯🇵', '.HK': '🇭🇰', '.KS': '🇰🇷',
  '.SA': '🇧🇷', '.MX': '🇲🇽', '.JO': '🇿🇦',
};

function getFlag(ticker) {
  if (!ticker) return '🇺🇸';
  for (const [suffix, flag] of Object.entries(SUFFIX_FLAG)) {
    if (ticker.endsWith(suffix)) return flag;
  }
  return '🇺🇸';
}

function cleanCompanyName(name) {
  if (!name) return name;
  return name
    .replace(/\s+(ser\.?\s*[A-Z]|Class\s+[A-Z]|Cl\s*\.?\s*[A-Z])\s*$/i, '')
    .replace(/\s+(AB|ASA|PLC|Inc\.?|Corp\.?|Ltd\.?|LLC|SE|NV|AG|SA|Oyj|ApS|A\/S)\s*$/i, '')
    .replace(/[,.\s]+$/, '')
    .trim();
}

const CURRENCY_SUFFIX_MAP = {
  'SEK': ['.ST'], 'NOK': ['.OL'], 'DKK':['.CO'],
  'EUR':['.HE', '.PA', '.DE', '.F', '.AS', '.BR', '.MC', '.MI', '.VX', '.AT', '.LS'],
  'GBP': ['.L', '.IL'], 'CAD': ['.TO', '.V', '.CN'], 'AUD': ['.AX'], 'NZD': ['.NZ'],
  'JPY': ['.T'], 'HKD': ['.HK'], 'BRL': ['.SA'], 'MXN':['.MX'], 'ZAR': ['.JO'],
  'KRW': ['.KS'], 'INR':['.BO', '.NS'],
};

const ISIN_CURRENCY_MAP = {
  'SE': 'SEK', 'NO': 'NOK', 'DK': 'DKK', 'FI': 'EUR', 'GB': 'GBP', 'IE': 'EUR',
  'US': 'USD', 'CA': 'USD', 'DE': 'EUR', 'FR': 'EUR', 'NL': 'EUR', 'BE': 'EUR',
  'ES': 'EUR', 'IT': 'EUR', 'PT': 'EUR', 'AT': 'EUR', 'CH': 'CHF', 'AU': 'AUD',
  'NZ': 'NZD', 'JP': 'JPY', 'HK': 'HKD', 'BR': 'BRL', 'MX': 'MXN', 'ZA': 'ZAR',
  'KR': 'KRW', 'IN': 'INR',
};

const ALL_SUFFIXES =[
  '.ST', '.OL', '.CO', '.HE', '.TO', '.V', '.CN', '.L', '.IL',
  '.PA', '.DE', '.F', '.AS', '.BR', '.MC', '.MI', '.VX', '.AT', '.LS',
  '.AX', '.NZ', '.T', '.HK', '.SS', '.SZ', '.KS', '.BO', '.NS',
  '.SA', '.MX', '.JO', '.SW',
];

const MONTROSE_EXCHANGE_MAP = {
  '.N': 'USD', '.O': 'USD', '.A': 'USD', '.OQ': 'USD',
  '.OL': 'NOK', '.CO': 'DKK', '.HE': 'EUR',
  '.L': 'GBP', '.PA': 'EUR', '.DE': 'EUR', '.AS': 'EUR', '.TO': 'CAD',
};

function stripMontroseSuffix(rawTicker, kursvaluta) {
  if (!rawTicker) return { cleanTicker: null, effectiveCurrency: kursvaluta };
  for (const [suffix, currency] of Object.entries(MONTROSE_EXCHANGE_MAP)) {
    if (rawTicker.endsWith(suffix)) return { cleanTicker: rawTicker.slice(0, -suffix.length), effectiveCurrency: currency };
  }
  return { cleanTicker: rawTicker, effectiveCurrency: kursvaluta || 'SEK' };
}

function normalizeTicker(t) {
  if (!t) return null;
  return t.trim().replace(/\s+/g, '-').toUpperCase();
}

async function tryQuote(symbol) {
  try {
    const q = await yahooFinance.quote(symbol);
    if (q && q.currency) return { symbol, quote: q };
  } catch(e) {}
  return null;
}

function getEffectiveCurrency(currency, isin, broker) {
  const isinPrefix = isin ? isin.substring(0, 2) : null;
  const isinCurrency = isinPrefix ? ISIN_CURRENCY_MAP[isinPrefix] : null;

  if (broker === 'avanza' || broker === 'nordnet') return currency || isinCurrency || 'USD';
  if (broker === 'montrose') {
    if (currency && currency !== 'SEK') return currency;
    return 'SEK';
  }
  return currency || isinCurrency || 'USD';
}

async function resolveSymbol(rawTicker, isin, name, currency, broker) {
  const overrides = loadOverrides();
  const overrideKey = isin || rawTicker;
  if (overrideKey && overrides[overrideKey]) return overrides[overrideKey];

  const cache = loadTickerCache();
  const cacheKey = `${broker || ''}|${currency || ''}|${isin || rawTicker || name}`;
  if (cache[cacheKey] !== undefined) return cache[cacheKey];

  const effectiveCurrency = getEffectiveCurrency(currency, isin, broker);
  const isinPrefix = isin ? isin.substring(0, 2) : null;
  const preferUSListing = effectiveCurrency === 'USD' || isinPrefix === 'US' || isinPrefix === 'CA';
  const preferredSuffixes = preferUSListing ? [] : (CURRENCY_SUFFIX_MAP[effectiveCurrency] || []);
  const remainingSuffixes = ALL_SUFFIXES.filter(s => !preferredSuffixes.includes(s));
  const orderedSuffixes = [...preferredSuffixes, ...remainingSuffixes];

  const normalized = normalizeTicker(rawTicker);
  const firstWord = rawTicker ? rawTicker.trim().split(/\s+/)[0].toUpperCase() : null;
  const tickerVariants = [];
  if (normalized) tickerVariants.push(normalized);
  if (firstWord && firstWord !== normalized) tickerVariants.push(firstWord);

  const save = (symbol) => {
    if (symbol) { cache[cacheKey] = symbol; saveTickerCache(cache); }
    return symbol;
  };

  const GARBAGE_NAME_PATTERNS = [/övf/i, /utflytt/i, /transfer/i, /flytt/i, /intern/i, /inlägg/i, /uttag/i, /insättning/i, /återbetalning/i];
  const isGarbageName = !name || GARBAGE_NAME_PATTERNS.some(p => p.test(name));
  const searchName = isGarbageName ? null : name;

  const verifyQuote = async (symbol) => {
    try {
      const q = await yahooFinance.quote(symbol);
      return q && q.currency ? { symbol, currency: q.currency } : null;
    } catch(e) { return null; }
  };

  const exchangeScore = (symbol) => {
    if (!symbol.includes('.')) return 0;
    for (let i = 0; i < preferredSuffixes.length; i++) {
      if (symbol.endsWith(preferredSuffixes[i])) return i + 1;
    }
    return 999;
  };

  // ── Fast path: directly try normalized ticker + preferred suffixes first ──
  // This avoids expensive Yahoo search for common cases like VOLV-B.ST, INVE-A.ST etc.
  if (!preferUSListing && tickerVariants.length > 0 && preferredSuffixes.length > 0) {
    for (const suffix of preferredSuffixes) {
      for (const v of tickerVariants) {
        const candidate = `${v}${suffix}`;
        const r = await verifyQuote(candidate);
        if (r) return save(candidate);
      }
    }
  }

  if (isin) {
    try {
      const results = await yahooFinance.search(isin);
      const candidates = results.quotes?.filter(q => q.isYahooFinance && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'MUTUALFUND')) ||[];

      if (preferUSListing) {
        const usMatch = candidates.find(q => !q.symbol.includes('.'));
        if (usMatch) return save(usMatch.symbol);
      }

      if (candidates.length > 0 && effectiveCurrency) {
        const toVerify = candidates.slice(0, 8);
        const verified = (await Promise.all(toVerify.map(c => verifyQuote(c.symbol)))).filter(Boolean);
        const currencyMatches = verified.filter(v => v.currency === effectiveCurrency);
        if (currencyMatches.length > 0) {
          currencyMatches.sort((a, b) => exchangeScore(a.symbol) - exchangeScore(b.symbol));
          const best = currencyMatches[0];
          if (exchangeScore(best.symbol) === 999 && preferredSuffixes.length > 0) {
            for (const suffix of preferredSuffixes) {
              for (const v of tickerVariants) {
                const r = await verifyQuote(`${v}${suffix}`);
                if (r && r.currency === effectiveCurrency) return save(`${v}${suffix}`);
              }
            }
          }
          return save(best.symbol);
        }
      }

      for (const suffix of preferredSuffixes) {
        const match = candidates.find(q => q.symbol.endsWith(suffix));
        if (match) return save(match.symbol);
      }

      if (preferredSuffixes.length > 0) {
        const baseTickers = new Set();
        for (const c of candidates) {
          const base = c.symbol.includes('.') ? c.symbol.split('.')[0] : c.symbol;
          baseTickers.add(base);
        }
        for (const suffix of preferredSuffixes) {
          for (const base of baseTickers) {
            const r = await verifyQuote(`${base}${suffix}`);
            if (r && r.currency === effectiveCurrency) return save(`${base}${suffix}`);
          }
        }
      }

      for (const suffix of preferredSuffixes) {
        for (const v of tickerVariants) {
          const r = await tryQuote(`${v}${suffix}`);
          if (r) return save(`${v}${suffix}`);
        }
      }

      if (searchName && preferredSuffixes.length > 0) {
        try {
          const shortName = searchName.split(' ').slice(0, 2).join(' ');
          const nameResults = await yahooFinance.search(shortName);
          const nameCandidates = nameResults.quotes?.filter(q => q.isYahooFinance && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')) ||[];
          for (const suffix of preferredSuffixes) {
            const match = nameCandidates.find(q => q.symbol.endsWith(suffix));
            if (match) return save(match.symbol);
          }
        } catch(e) {}
      }

      if (searchName) {
        try {
          const searchTerms =[
            searchName.split(' ').slice(0, 3).join(' '),
            searchName.split(' ').slice(0, 2).join(' '),
          ].filter((v, i, a) => a.indexOf(v) === i);

          for (const term of searchTerms) {
            const nameResults = await yahooFinance.search(term);
            const nameCandidates = nameResults.quotes?.filter(q => q.isYahooFinance && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')) || [];

            if (preferUSListing) {
              const allVerifiedUS =[];
              for (const c of nameCandidates.filter(q => !q.symbol.includes('.'))) {
                const r = await verifyQuote(c.symbol);
                if (r && r.currency === effectiveCurrency) allVerifiedUS.push({ symbol: c.symbol, shortname: c.shortname || '' });
              }

              if (allVerifiedUS.length > 1 && searchName) {
                const classMatch = searchName.match(/class\s+([a-z])/i);
                if (classMatch) {
                  const classLetter = classMatch[1].toUpperCase();
                  const CLASS_TICKER_MAP = { 'GOOGL': 'A', 'GOOG': 'C', 'BRK-A': 'A', 'BRK-B': 'B', 'FCAA': 'A', 'FCAB': 'B' };
                  const classHit = allVerifiedUS.find(c => CLASS_TICKER_MAP[c.symbol] === classLetter);
                  if (classHit) return save(classHit.symbol);
                  try {
                    const classQuery = `${term} class ${classLetter}`;
                    const classResults = await yahooFinance.search(classQuery);
                    const classCandidates = classResults.quotes?.filter(q => q.isYahooFinance && !q.symbol.includes('.') && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')) ||[];
                    for (const c of classCandidates) {
                      const r = await verifyQuote(c.symbol);
                      if (r && r.currency === effectiveCurrency) return save(c.symbol);
                    }
                  } catch(e) {}
                }
              }
              if (allVerifiedUS.length > 0) return save(allVerifiedUS[0].symbol);
            } else {
              for (const suffix of preferredSuffixes) {
                const match = nameCandidates.find(q => q.symbol.endsWith(suffix));
                if (match) {
                  const r = await verifyQuote(match.symbol);
                  if (r && r.currency === effectiveCurrency) return save(match.symbol);
                }
              }
            }
          }
        } catch(e) {}
      }

      if (candidates.length > 0) {
        if (preferUSListing) {
          const noSuffix = candidates.find(q => !q.symbol.includes('.'));
          if (noSuffix) return save(noSuffix.symbol);
        }
        return save(candidates[0].symbol);
      }
    } catch(e) {}
  }

  for (const suffix of orderedSuffixes) {
    for (const v of tickerVariants) {
      const r = await tryQuote(`${v}${suffix}`);
      if (r) return save(`${v}${suffix}`);
    }
  }
  for (const v of tickerVariants) {
    const r = await tryQuote(v);
    if (r) return save(v);
  }

  if (searchName) {
    try {
      const shortName = searchName.split(' ').slice(0, 3).join(' ');
      const results = await yahooFinance.search(shortName);
      const candidates = results.quotes?.filter(q => q.isYahooFinance && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')) ||[];
      if (preferUSListing) {
        const usMatch = candidates.find(q => !q.symbol.includes('.'));
        if (usMatch) return save(usMatch.symbol);
      }
      for (const suffix of preferredSuffixes) {
        const match = candidates.find(q => q.symbol.endsWith(suffix));
        if (match) return save(match.symbol);
      }
      if (candidates.length > 0) return save(candidates[0].symbol);
    } catch(e) {}
  }

  return save(null);
}

// --- CSV PARSERS ---
function parseNordnet(content) {
  const lines = content.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const txs =[];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t').map(s => s.trim());
    if (c.length < 10) continue;
    const date = c[2];
    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
    const typeRaw = c[5], name = c[6], isin = c[7] || null;
    let qty = parseSENum(c[8]);
    const price = parseSENum(c[9]);
    const instrumentCurrency = c[18] && c[18].trim() ? c[18].trim() : (c[12] || 'SEK');
    const totalSEK = Math.abs(parseSENum(c[13])); 
    let type = 'other';
    if (typeRaw === 'KÖPT' || typeRaw === 'KÖP') type = 'buy';
    else if (typeRaw === 'SÅLT') { type = 'sell'; qty = -Math.abs(qty); }
    else if (typeRaw === 'UTDELNING') type = 'dividend';
    else if (typeRaw === 'INSÄTTNING') type = 'deposit';
    else if (typeRaw === 'UTBETALNING') type = 'withdrawal';
    else if (['INLÄGG VP', 'SPLIT INLÄGG VP', 'DECIMALER INLÄGG VP'].includes(typeRaw)) { type = 'buy'; qty = Math.abs(qty); }
    else if (['UTTAG VP', 'SPLIT UTTAG VP', 'DECIMALER UTTAG VP'].includes(typeRaw)) { type = 'sell'; qty = -Math.abs(qty); }
    if (!name && type === 'other') continue;
    txs.push({ broker: 'nordnet', date, type, name, isin, ticker: null, quantity: qty, price, currency: instrumentCurrency, totalSEK: type === 'dividend' ? totalSEK : 0 });
  }
  return txs;
}

function parseAvanza(content) {
  const clean = content.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').filter(l => l.trim());
  const txs =[];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(';').map(s => s.trim());
    if (c.length < 8) continue;
    const date = c[0];
    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
    const typeRaw = c[2], name = c[3], isin = c[11] || null;
    let qty = parseSENum(c[4]);
    const price = parseSENum(c[5]);
    const totalSEK = Math.abs(parseSENum(c[6])); 
    const instrumentCurrency = c[10] && c[10].trim() ? c[10].trim() : (c[7] || 'SEK');
    let type = 'other';
    if (typeRaw === 'Köp') type = 'buy';
    else if (typeRaw === 'Sälj') type = 'sell';
    else if (typeRaw === 'Utdelning') type = 'dividend';
    else if (typeRaw === 'Insättning') type = 'deposit';
    else if (typeRaw === 'Uttag') type = 'withdrawal';
    else if (['Värdepappersinsättning', 'Inlåning av värdepapper'].includes(typeRaw)) { type = 'buy'; qty = Math.abs(qty); }
    else if (['Värdepappersuttag', 'Utlåning av värdepapper'].includes(typeRaw)) { type = 'sell'; qty = -Math.abs(qty); }
    txs.push({ broker: 'avanza', date, type, name, isin, ticker: null, quantity: qty, price, currency: instrumentCurrency, totalSEK: type === 'dividend' ? totalSEK : 0 });
  }
  return txs;
}

function parseMontrose(content) {
  const clean = content.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').filter(l => l.trim());
  const txs =[];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',').map(s => s.trim().replace(/\r$/, ''));
    if (c.length < 8) continue;
    const date = c[0];
    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
    const typeRaw = c[1], name = c[3], rawTickerRaw = c[4] || null, isin = c[5] || null;
    let qty = parseSENum(c[6]);
    const price = parseSENum(c[7]);
    const kursvaluta = c[8] || 'SEK';
    const totalSEK = Math.abs(parseSENum(c[9])); 
    const { cleanTicker, effectiveCurrency } = stripMontroseSuffix(rawTickerRaw, kursvaluta);
    let type = 'other';
    if (typeRaw === 'Köp') type = 'buy';
    else if (typeRaw === 'Sälj') type = 'sell';
    else if (typeRaw === 'Utdelning') type = 'dividend';
    else if (typeRaw === 'Insättning') type = 'deposit';
    else if (typeRaw === 'Uttag') { type = isin ? 'sell' : 'withdrawal'; }
    else if (typeRaw === 'VP-överföring in') { type = 'buy'; qty = Math.abs(qty); }
    else if (typeRaw === 'VP-överföring ut') { type = 'sell'; qty = -Math.abs(qty); }
    else if (typeRaw === 'Övrigt' && isin) { type = qty > 0 ? 'buy' : 'sell'; }
    txs.push({ broker: 'montrose', date, type, name, isin, rawTicker: cleanTicker, ticker: null, quantity: qty, price, currency: effectiveCurrency, totalSEK: type === 'dividend' ? totalSEK : 0 });
  }
  return txs;
}

function detectBroker(content) {
  if (content.includes('Bokföringsdag') && content.includes('Transaktionstyp')) return 'nordnet';
  if (content.includes('Typ av transaktion') || content.includes('Transaktionsvaluta')) return 'avanza';
  if (content.includes('Kursvaluta') && content.includes('Ticker')) return 'montrose';
  return null;
}

// --- STANDARD ENDPOINTS ---
app.get('/api/search/:query', async (req, res) => {
  try {
    const results = await yahooFinance.search(req.params.query);
    const filtered = results.quotes.filter(q => q.isYahooFinance && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')).slice(0, 8);
    res.json(filtered.map(q => ({ ticker: q.symbol, name: q.shortname || q.longname || 'Unknown', exchange: q.exchange || '' })));
  } catch(e) { res.status(500).json([]); }
});

app.get('/api/validate/:ticker', async (req, res) => {
  try {
    const quote = await yahooFinance.quote(req.params.ticker);
    res.json({ valid: !!quote, currency: quote?.currency || 'USD', exchange: quote?.exchange || 'Unknown' });
  } catch(e) { res.status(404).json({ valid: false }); }
});

app.post('/api/portfolio', async (req, res) => {
  const { portfolio, baseCurrency } = req.body;
  let enriched =[], totalValue = 0, totalCost = 0;
  for (let item of portfolio) {
    try {
      const quote = await yahooFinance.quote(item.ticker);
      if (!quote || !quote.currency) continue;
      const fx = await getFxRate(quote.currency, baseCurrency);
      const nativePrice = quote.regularMarketPrice || quote.price || 0;
      const currentPrice = nativePrice * fx, currentValue = currentPrice * item.quantity;
      const costBasis = (item.avgPrice * fx) * item.quantity, profit = currentValue - costBasis;
      const todayGainBase = (quote.regularMarketChange || 0) * fx * item.quantity;
      let sector = 'Unknown', industry = 'Unknown';
      try {
        const summary = await yahooFinance.quoteSummary(item.ticker, { modules: ['assetProfile'] });
        sector = summary?.assetProfile?.sector || 'Unknown';
        industry = summary?.assetProfile?.industry || 'Unknown';
      } catch(e) {}
      totalValue += currentValue; totalCost += costBasis;
      const rawName = quote.shortName || quote.longName || item.ticker;
      enriched.push({ ticker: item.ticker, isin: item.isin || null, name: rawName, cleanName: cleanCompanyName(rawName), currency: quote.currency, quoteType: quote.quoteType || 'EQUITY', flag: getFlag(item.ticker), sector, industry, nativePrice, fxRate: fx, quantity: item.quantity, buyPrice: item.avgPrice * fx, currentPrice, currentValue, profit, todayGainBase, returnPct: costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0, todayChangePct: quote.regularMarketChangePercent || 0 });
    } catch(e) {}
  }
  res.json({ portfolio: enriched, totals: { value: totalValue, profit: totalValue - totalCost, returnPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0 } });
});

// --- OVERRIDE ENDPOINTS ---
app.get('/api/overrides', (req, res) => {
  res.json(loadOverrides());
});

app.post('/api/overrides', (req, res) => {
  const { isin, ticker } = req.body;
  if (!isin || !ticker) return res.status(400).json({ error: 'isin and ticker required' });
  const overrides = loadOverrides();
  overrides[isin] = ticker;
  saveOverrides(overrides);
  const cache = loadTickerCache();
  for (const key of Object.keys(cache)) {
    if (key.includes(isin)) delete cache[key];
  }
  saveTickerCache(cache);
  res.json({ success: true, overrides });
});

app.delete('/api/overrides/:isin', (req, res) => {
  const overrides = loadOverrides();
  delete overrides[req.params.isin];
  saveOverrides(overrides);
  res.json({ success: true, overrides });
});

// --- TRANSACTION ENDPOINTS ---
app.post('/api/transactions/upload', async (req, res) => {
  const { files } = req.body;
  if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'No files provided' });
  let allNew =[];
  const results =[];
  for (const file of files) {
    const broker = file.broker || detectBroker(file.content);
    if (!broker) { results.push({ file: file.name, error: 'Could not detect broker format' }); continue; }
    let parsed =[];
    if (broker === 'nordnet') parsed = parseNordnet(file.content);
    else if (broker === 'avanza') parsed = parseAvanza(file.content);
    else if (broker === 'montrose') parsed = parseMontrose(file.content);
    allNew.push(...parsed);
    results.push({ file: file.name, broker, count: parsed.length });
  }
  const toResolve = allNew.filter(t => (t.type === 'buy' || t.type === 'sell') && !t.ticker);
  console.log(`Resolving tickers for ${toResolve.length} transactions...`);
  for (const tx of toResolve) {
    tx.ticker = await resolveSymbol(tx.rawTicker || null, tx.isin, tx.name, tx.currency, tx.broker);
    await new Promise(r => setTimeout(r, 150));
  }
  const existing = loadTransactions();
  const existingIds = new Set(existing.map(t => `${t.broker}|${t.date}|${t.type}|${t.isin}|${t.quantity}|${t.price}`));
  const newUnique = allNew.filter(t => !existingIds.has(`${t.broker}|${t.date}|${t.type}|${t.isin}|${t.quantity}|${t.price}`));
  const merged = [...existing, ...newUnique].sort((a, b) => a.date.localeCompare(b.date));
  saveTransactions(merged);
  res.json({ results, total: merged.length, newAdded: newUnique.length });
});

// Re-resolve tickers for transactions where ticker is empty
app.post('/api/transactions/resolve', async (req, res) => {
  const transactions = loadTransactions();
  const unresolved = transactions.filter(t => (t.type === 'buy' || t.type === 'sell') && !t.ticker && (t.rawTicker || t.isin));
  console.log(`Re-resolving ${unresolved.length} unresolved tickers...`);

  // Clear null cache entries so the resolver actually retries
  const cache = loadTickerCache();
  let cleared = 0;
  for (const [k, v] of Object.entries(cache)) {
    if (v === null || v === undefined || v === '') { delete cache[k]; cleared++; }
  }
  if (cleared > 0) { saveTickerCache(cache); console.log(`Cleared ${cleared} null cache entries`); }

  let resolved = 0;
  for (const tx of unresolved) {
    const ticker = await resolveSymbol(tx.rawTicker || null, tx.isin, tx.name, tx.currency, tx.broker);
    if (ticker) { tx.ticker = ticker; resolved++; }
    // Small delay to avoid Yahoo rate limiting
    await new Promise(r => setTimeout(r, 150));
  }
  saveTransactions(transactions);
  console.log(`Resolved ${resolved} tickers.`);
  res.json({ resolved, total: unresolved.length });
});

app.get('/api/transactions/count', (req, res) => {
  const txs = loadTransactions();
  const trades = txs.filter(t => (t.type === 'buy' || t.type === 'sell') && (t.ticker || t.rawTicker));
  res.json({ total: txs.length, trades: trades.length });
});

app.get('/api/transactions', (req, res) => {
  const txs = loadTransactions();
  res.json(txs.sort((a, b) => b.date.localeCompare(a.date)));
});

app.delete('/api/transactions', (req, res) => {
  saveTransactions([]);
  res.json({ success: true });
});

app.get('/api/transactions/reconstruct', (req, res) => {
  const transactions = loadTransactions();
  // Normalise: use rawTicker as fallback when ticker resolver hasn't run yet
  const normalised = transactions.map(t => ({
    ...t,
    ticker: (t.ticker || t.rawTicker || '').trim(),
  }));
  const trades = normalised
    .filter(t => (t.type === 'buy' || t.type === 'sell') && t.ticker)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.type === b.type) return 0;
      return a.type === 'sell' ? -1 : 1; 
    });
  const holdings = {};
  for (const tx of trades) {
    const { ticker, quantity, price, isin } = tx;
    if (!holdings[ticker]) holdings[ticker] = { ticker, isin: isin || null, quantity: 0, totalCost: 0 };
    if (isin && !holdings[ticker].isin) holdings[ticker].isin = isin;
    const h = holdings[ticker];
    if (quantity > 0) {
      if (price === 0) {
        h.quantity += quantity; 
      } else {
        h.totalCost += quantity * price;
        h.quantity  += quantity;
      }
    } else {
      const sellQty = Math.abs(quantity);
      if (h.quantity <= 0) {
      } else if (price === 0) {
        h.quantity -= sellQty; 
      } else {
        const avg = h.quantity > 0 ? h.totalCost / h.quantity : 0;
        h.totalCost = Math.max(0, h.totalCost - sellQty * avg);
        h.quantity -= sellQty;
      }
    }
  }
  res.json(Object.values(holdings).filter(h => h.quantity > 0.001).map(h => ({
    ticker: h.ticker,
    isin: h.isin || null,
    quantity: parseFloat(h.quantity.toFixed(6)),
    avgPrice: h.quantity > 0 ? parseFloat((h.totalCost / h.quantity).toFixed(4)) : 0
  })));
});


// --- DIVIDENDS ---
app.get('/api/dividends', (req, res) => {
  const transactions = loadTransactions();
  const divs = transactions.filter(t => t.type === 'dividend' && t.totalSEK > 0);

  const byTicker = {};
  for (const d of divs) {
    const key = d.isin || d.name;
    if (!byTicker[key]) byTicker[key] = { name: d.name, isin: d.isin || '', total: 0, payments:[] };
    byTicker[key].total += d.totalSEK;
    byTicker[key].payments.push({ date: d.date, amount: d.totalSEK });
  }
  const byStock = Object.values(byTicker).sort((a, b) => b.total - a.total);

  const byYear = {};
  const byYearStock = {}; 
  for (const d of divs) {
    const y = d.date.substring(0, 4);
    byYear[y] = (byYear[y] || 0) + d.totalSEK;
    if (!byYearStock[y]) byYearStock[y] = {};
    const key = d.isin || d.name;
    if (!byYearStock[y][key]) byYearStock[y][key] = { name: d.name, total: 0 };
    byYearStock[y][key].total += d.totalSEK;
  }
  const byYearArr = Object.entries(byYear).sort((a, b) => a[0].localeCompare(b[0])).map(([year, total]) => ({
    year, total,
    stocks: Object.values(byYearStock[year]).sort((a, b) => b.total - a.total)
  }));

  const byMonth = {};
  for (const d of divs) {
    const m = d.date.substring(0, 7); 
    byMonth[m] = (byMonth[m] || 0) + d.totalSEK;
  }
  const byMonthArr = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([month, total]) => ({ month, total }));

  const totalAllTime = divs.reduce((s, d) => s + d.totalSEK, 0);
  const currentYear = new Date().getFullYear().toString();
  const totalThisYear = byYear[currentYear] || 0;

  res.json({ totalAllTime, totalThisYear, byStock, byYear: byYearArr, byMonth: byMonthArr });
});


// --- AVANZA OWNERSHIP FALLBACK ---
async function getAvanzaOwnership(query) {
  if (!query) return null;
  try {
    let orderbookId = null;

    // STRATEGY 1: Avanza Mobile API (Bypasses web 404s and Cloudflare)
    try {
      const mRes = await fetch(`https://www.avanza.se/_mobile/market/search?query=${encodeURIComponent(query)}`, { 
        headers: { 'User-Agent': 'Avanza/2.30.0 (iOS)' } 
      });
      if (mRes.ok) {
        const mData = await mRes.json();
        const stockHits = mData.hits?.find(h => h.instrumentType === 'STOCK');
        orderbookId = stockHits?.topHits?.[0]?.id;
      }
    } catch(e) {}

    // STRATEGY 2: HTML Scraping (If Mobile API didn't find the ID)
    if (!orderbookId) {
      const webHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      // Clean query for web search (e.g., "VOLV-B.ST" -> "VOLV B")
      const cleanQuery = query.includes('.') ? query.split('.')[0].replace(/-/g, ' ') : query;
      const htmlRes = await fetch(`https://www.avanza.se/sok/aktier.html?query=${encodeURIComponent(cleanQuery)}`, { headers: webHeaders });
      
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const match = html.match(/\/aktier\/om-aktien\.html\/(\d+)\//);
        if (match) orderbookId = match[1];
      }
    }

    if (!orderbookId) {
      console.log(`[Avanza] Orderbook ID not found for ${query}`);
      return null;
    }

    // Now fetch the actual ownership data using the confirmed ID
    const stockRes = await fetch(`https://www.avanza.se/_api/market-guide/stock/${orderbookId}`, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
    });
    
    if (!stockRes.ok) throw new Error(`Stock API returned HTTP ${stockRes.status}`);
    
    const stockData = await stockRes.json();
    const owners = stockData.companyOwners?.owners ||[];
    if (!owners.length) return null;

    const topInstitutional = owners.slice(0, 10).map(o => ({
      name: o.name,
      pctHeld: (o.capital || 0) / 100 // Avanza returns 8.5 for 8.5%. Convert to 0.085
    }));

    const institutionPct = topInstitutional.reduce((acc, curr) => acc + curr.pctHeld, 0);
    return { topInstitutional, institutionPct, source: 'Avanza' };

  } catch (e) {
    console.log(`[Avanza] Failed to fetch ownership for ${query}:`, e.message);
    return null;
  }
}

// --- OWNERSHIP ---
app.post('/api/ownership', async (req, res) => {
  const { tickers } = req.body; 
  if (!tickers || !tickers.length) return res.json([]);

  const results =[];
  const isNordic = (t) => t.endsWith('.ST') || t.endsWith('.OL') || t.endsWith('.CO') || t.endsWith('.HE');

  for (const item of tickers) {
    try {
      // 1. FORCE AVANZA FOR NORDIC STOCKS
      if (isNordic(item.ticker)) {
        const query = item.isin || item.ticker;
        const avanzaData = await getAvanzaOwnership(query);
        if (avanzaData) {
          results.push({
            ticker: item.ticker,
            name: item.name || item.ticker,
            flag: getFlag(item.ticker),
            noData: false,
            insiderPct: null,
            institutionPct: avanzaData.institutionPct,
            floatPct: null,
            topInstitutional: avanzaData.topInstitutional,
            topInsiders:[],
            source: 'Avanza'
          });
          continue; 
        }
      }

      // 2. YAHOO FINANCE FALLBACK (For US/INTL stocks, or if Avanza fails)
      const summary = await yahooFinance.quoteSummary(item.ticker, {
        modules:['majorHoldersBreakdown', 'institutionOwnership', 'insiderHolders']
      }, { validateResult: false }).catch(() => null);

      const breakdown  = summary?.majorHoldersBreakdown || {};
      const instOwners = summary?.institutionOwnership?.ownershipList || [];
      const insiders   = summary?.insiderHolders?.holders ||[];

      const instPct = breakdown.institutionsPercentHeld?.raw ?? null;
      const hasValidYahooData = instPct !== null || (instOwners.length > 0 && (instOwners[0].pctHeld?.raw > 0 || instOwners[0].pctHeld > 0));

      if (hasValidYahooData) {
        const topInstitutional = instOwners.slice(0, 5).map(h => ({
          name: h.organization || h.name || 'Unknown',
          pctHeld: h.pctHeld?.raw ?? h.pctHeld ?? 0,
          shares: h.position?.raw ?? h.position ?? 0,
          reportDate: h.reportDate?.fmt || '',
        }));
        const topInsiders = insiders.slice(0, 5).map(h => ({
          name: h.name || '',
          relation: h.relation || '',
          shares: h.positionDirect?.raw ?? 0,
          latestTransaction: h.latestTransType || '',
        }));
        results.push({
          ticker: item.ticker,
          name: item.name || item.ticker,
          flag: getFlag(item.ticker),
          noData: false,
          insiderPct: breakdown.insidersPercentHeld?.raw ?? null,
          institutionPct: instPct,
          floatPct: breakdown.institutionsFloatPercentHeld?.raw ?? null,
          topInstitutional,
          topInsiders,
          source: 'Yahoo'
        });
      } else {
        results.push({ ticker: item.ticker, name: item.name || item.ticker, flag: getFlag(item.ticker), noData: true });
      }
    } catch(e) {
      results.push({ ticker: item.ticker, name: item.name || item.ticker, flag: getFlag(item.ticker), error: true });
    }
  }
  res.json(results);
});

app.get('/api/ownership/search/:query', async (req, res) => {
  try {
    const results = await yahooFinance.search(req.params.query);
    const filtered = (results.quotes ||[])
      .filter(q => q.isYahooFinance && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
      .slice(0, 6)
      .map(q => ({ ticker: q.symbol, name: q.shortname || q.longname || q.symbol, exchange: q.exchange || '', flag: getFlag(q.symbol) }));
    res.json(filtered);
  } catch(e) { res.status(500).json([]); }
});

// --- HISTORY ---
app.post('/api/history', async (req, res) => {
  const { portfolio, baseCurrency, period } = req.body;
  const periodMap = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '3Y': 365*3, '5Y': 365*5, '10Y': 365*10 };
  const days = periodMap[period] || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];
  const interval = days <= 90 ? '1d' : days <= 365 ? '1wk' : '1mo';
  const transactions = loadTransactions();
  const trades = transactions.filter(t => (t.type === 'buy' || t.type === 'sell') && t.ticker);
  const useTransactions = trades.length > 0;
  let tickersToFetch = new Set();
  
  if (useTransactions) { for (const tx of trades) tickersToFetch.add(tx.ticker); }
  else { if (!portfolio || portfolio.length === 0) return res.json([]); for (const item of portfolio) tickersToFetch.add(item.ticker); }
  
  if (tickersToFetch.size === 0) return res.json([]);
  
  const priceHistory = {};
  for (const ticker of tickersToFetch) {
    try {
      const quote = await yahooFinance.quote(ticker);
      if (!quote || !quote.currency) continue;
      const fx = await getFxRate(quote.currency, baseCurrency);
      const result = await yahooFinance.chart(ticker, { period1: startDate, period2: new Date(), interval });
      priceHistory[ticker] = {};
      for (const q of (result.quotes ||[])) {
        const price = q.adjclose || q.close || q.open;
        if (price && price > 0) priceHistory[ticker][new Date(q.date).toISOString().split('T')[0]] = price * fx;
      }
    } catch(e) { console.error(`History fetch failed for ${ticker}:`, e.message); }
  }
  
  const allDates = new Set();
  for (const ticker of Object.keys(priceHistory)) for (const d of Object.keys(priceHistory[ticker])) if (d >= startStr) allDates.add(d);
  const sortedDates = [...allDates].sort();
  
  if (sortedDates.length < 2) return res.json([]);
  
  const nearestPrice = (ticker, date) => {
    if (priceHistory[ticker]?.[date]) return priceHistory[ticker][date];
    const nearest = Object.keys(priceHistory[ticker] || {}).filter(d => d <= date).sort().pop();
    return nearest ? priceHistory[ticker][nearest] : null;
  };
  
  const points =[];
  for (const date of sortedDates) {
    let totalValue = 0;
    if (useTransactions) {
      const holdings = {};
      for (const tx of trades) { if (tx.date > date) continue; holdings[tx.ticker] = (holdings[tx.ticker] || 0) + tx.quantity; }
      for (const [ticker, qty] of Object.entries(holdings)) { if (qty <= 0) continue; const p = nearestPrice(ticker, date); if (p) totalValue += p * qty; }
    } else {
      for (const item of portfolio) { const p = nearestPrice(item.ticker, date); if (p) totalValue += p * item.quantity; }
    }
    if (totalValue > 0) points.push({ date, value: totalValue });
  }
  
  if (points.length < 2) return res.json([]);
  const baseValue = points[0].value;
  res.json(points.map(p => ({ date: p.date, returnPct: parseFloat(((p.value - baseValue) / baseValue * 100).toFixed(2)) })));
});


// ─────────────────────────────────────────────────────────────────────────────
// CS SKINS API
// ─────────────────────────────────────────────────────────────────────────────

// Helper: fetch URL as JSON
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Statera/1.0' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
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

// Get/set CS settings
app.get('/api/cs/settings', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const rows = await dbAll(db, 'SELECT key, value FROM cs_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cs/settings', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    await dbRun(db, 'INSERT OR REPLACE INTO cs_settings (key, value) VALUES (?, ?)', [key, value]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Sync prices from csgotrader.app
app.post('/api/cs/prices/sync', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const [prices, fxData] = await Promise.all([
      fetchJSON('https://prices.csgotrader.app/latest/prices_v6.json'),
      fetchJSON('https://api.exchangerate-api.com/v4/latest/USD').catch(() => ({ rates: { SEK: 10.5 } }))
    ]);
    const sekRate = fxData?.rates?.SEK || 10.5;
    const now = new Date().toISOString();
    const entries = Object.entries(prices);
    // Insert in batches using serialized runs
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
    res.json({ success: true, count: entries.length, sekRate });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get price for a specific skin
app.get('/api/cs/prices/:name', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const row = await dbGet(db, 'SELECT * FROM cs_price_cache WHERE skin_name = ?', [req.params.name]);
    res.json(row || { price_usd: 0, price_sek: 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Search prices
app.get('/api/cs/prices/search/:query', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const rows = await dbAll(db, 'SELECT skin_name, price_usd, price_sek FROM cs_price_cache WHERE skin_name LIKE ? LIMIT 20', [`%${req.params.query}%`]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Fetch Steam inventory (public)
app.get('/api/cs/steam/inventory/:steamId', async (req, res) => {
  const { steamId } = req.params;
  try {
    const data = await fetchJSON(`https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=500`);
    if (!data || !data.assets) return res.status(404).json({ error: 'Inventory not found or private' });
    const db = getDB();
    const descMap = {};
    (data.descriptions || []).forEach(d => { descMap[`${d.classid}_${d.instanceid}`] = d; });
    const itemsRaw = (data.assets || []).map(asset => {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`];
      return {
        assetId: asset.assetid,
        name: desc?.market_hash_name || desc?.name || 'Unknown',
        iconUrl: desc?.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/128x128` : null,
        tradable: desc?.tradable === 1,
        marketable: desc?.marketable === 1,
        type: desc?.type || '',
      };
    }).filter(i => i.name !== 'Unknown');

    // Enrich with prices if db available
    const items = await Promise.all(itemsRaw.map(async item => {
      let priceSEK = 0;
      if (db) {
        const price = await dbGet(db, 'SELECT price_sek FROM cs_price_cache WHERE skin_name = ?', [item.name]).catch(() => null);
        priceSEK = price?.price_sek || 0;
      }
      return { ...item, priceSEK };
    }));

    const totalValue = items.reduce((s, i) => s + i.priceSEK, 0);
    res.json({ items, totalValue, count: items.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CS Inventory (manual tracker) ──────────────────────────────────────────

app.get('/api/cs/inventory', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const items = await dbAll(db, `
      SELECT i.*,
        s.id as sale_id, s.sale_price, s.sale_currency, s.sale_date, s.notes as sale_notes,
        p.price_sek as current_price_sek, p.price_usd as current_price_usd, p.last_updated as price_updated
      FROM cs_inventory i
      LEFT JOIN cs_sales s ON s.inventory_id = i.id
      LEFT JOIN cs_price_cache p ON p.skin_name = i.skin_name
      ORDER BY i.purchase_date DESC
    `);
    res.json(items);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cs/inventory', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { skin_name, exterior, float_value, pattern, stickers, purchase_price, purchase_currency, purchase_date, notes, image_url } = req.body;
  if (!skin_name || !purchase_date) return res.status(400).json({ error: 'skin_name and purchase_date required' });
  try {
    const result = await dbRun(db,
      `INSERT INTO cs_inventory (skin_name, exterior, float_value, pattern, stickers, purchase_price, purchase_currency, purchase_date, notes, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [skin_name, exterior || null, float_value || null, pattern || null, stickers || null, purchase_price || 0, purchase_currency || 'SEK', purchase_date, notes || null, image_url || null]
    );
    res.json({ id: result.lastID, success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cs/inventory/:id', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    await dbRun(db, 'DELETE FROM cs_inventory WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Mark item as sold
app.post('/api/cs/inventory/:id/sell', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  const { sale_price, sale_currency, sale_date, notes } = req.body;
  if (!sale_price || !sale_date) return res.status(400).json({ error: 'sale_price and sale_date required' });
  try {
    await dbRun(db, 'UPDATE cs_inventory SET sold = 1 WHERE id = ?', [req.params.id]);
    const result = await dbRun(db,
      'INSERT INTO cs_sales (inventory_id, sale_price, sale_currency, sale_date, notes) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, sale_price, sale_currency || 'SEK', sale_date, notes || null]
    );
    res.json({ id: result.lastID, success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// P&L summary
app.get('/api/cs/pnl', async (req, res) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'Database not available' });
  try {
    const [sold, holding] = await Promise.all([
      dbAll(db, `SELECT i.purchase_price, s.sale_price FROM cs_inventory i JOIN cs_sales s ON s.inventory_id = i.id`),
      dbAll(db, `SELECT i.purchase_price, p.price_sek as current_price FROM cs_inventory i LEFT JOIN cs_price_cache p ON p.skin_name = i.skin_name WHERE i.sold = 0`)
    ]);
    const realised = sold.reduce((s, r) => s + (r.sale_price - r.purchase_price), 0);
    const unrealised = holding.reduce((s, r) => s + ((r.current_price || 0) - r.purchase_price), 0);
    const totalInvested = holding.reduce((s, r) => s + r.purchase_price, 0);
    const currentValue = holding.reduce((s, r) => s + (r.current_price || 0), 0);
    res.json({ realised, unrealised, totalInvested, currentValue, totalPnl: realised + unrealised, soldCount: sold.length, holdingCount: holding.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Catch-all: serve React app for any non-API route (supports React Router)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = FRONTEND_DIST
    ? path.join(FRONTEND_DIST, 'index.html')
    : path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Statera server running on http://localhost:${PORT}`));