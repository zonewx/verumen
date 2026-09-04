import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiCache from './apiCache';
import { getToken } from './tokenStore';

const EXTERIORS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
const FLOAT_CACHE_KEY = 'cs_float_cache';

// Vanilla = special item (★) with no skin pattern (no |)
const withVanilla = n => (n && n.includes('★') && !n.includes('|')) ? `${n} | Vanilla` : (n || '');

const parseExteriorFromName = n => { const m = n?.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/); return m?.[1] || null; };
const floatToExterior = v => { const f = parseFloat(v); if (isNaN(f)) return null; if (f < 0.07) return 'Factory New'; if (f < 0.15) return 'Minimal Wear'; if (f < 0.38) return 'Field-Tested'; if (f < 0.45) return 'Well-Worn'; return 'Battle-Scarred'; };

function NumInput({ value, onChange, step = 1, min, max, placeholder, disabled, className, wrapperClass = '' }) {
  const dp = String(parseFloat(step) || 1).replace(/^[^.]*\.?/, '').length;
  const fire = val => onChange({ target: { value: String(val) } });
  const adj = dir => {
    const s = parseFloat(step) || 1;
    const next = parseFloat((parseFloat(value || 0) + dir * s).toFixed(dp));
    if (max !== undefined && next > parseFloat(max)) return;
    if (min !== undefined && next < parseFloat(min)) return;
    fire(next);
  };
  const ChevUp = () => (
    <svg className="w-3 h-3" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 5L5 1L9 5"/>
    </svg>
  );
  const ChevDown = () => (
    <svg className="w-3 h-3" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1L5 5L9 1"/>
    </svg>
  );
  return (
    <div className={`relative ${wrapperClass}`}>
      <input
        type="number" step={step} min={min} max={max}
        value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
        className={`${className} pr-8 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden`}
      />
      <div className="absolute right-0 top-0 bottom-0 w-7 flex flex-col border-l border-zinc-600 rounded-r-lg overflow-hidden pointer-events-auto">
        <button type="button" tabIndex={-1} onClick={() => adj(1)} disabled={disabled}
          className="flex-1 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-600 transition disabled:opacity-30">
          <ChevUp />
        </button>
        <button type="button" tabIndex={-1} onClick={() => adj(-1)} disabled={disabled}
          className="flex-1 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-600 transition border-t border-zinc-600 disabled:opacity-30">
          <ChevDown />
        </button>
      </div>
    </div>
  );
}

function fmt(n) { return (n || 0).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const CUR_SYM = { SEK: 'kr', USD: '$', EUR: '€', GBP: '£' };
function fmtCur(n, bc = 'SEK') {
  const v = n || 0;
  if (bc === 'SEK') return `${v.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
  const sym = CUR_SYM[bc];
  const formatted = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${formatted}` : `${formatted} ${bc}`;
}

const _screenshotCache = {};

function SteamScreenshotEmbed({ url }) {
  const match = url?.match(/id=(\d+)/);
  const cacheKey = match?.[1];
  const [preview, setPreview] = useState(() => (cacheKey ? _screenshotCache[cacheKey] ?? null : null));
  const [loading, setLoading] = useState(!preview && !!cacheKey);

  useEffect(() => {
    if (!cacheKey || _screenshotCache[cacheKey]) return;
    setLoading(true);
    const token = getToken();
    fetch(`/api/cs/steam/screenshot/${cacheKey}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(d => { if (d.previewUrl) { _screenshotCache[cacheKey] = d.previewUrl; setPreview(d.previewUrl); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cacheKey]);

  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-2 rounded-xl overflow-hidden group">
      {loading && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border bg-zinc-700/50 border-zinc-600`}>
          <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-400">Loading preview...</span>
        </div>
      )}
      {!loading && preview && (
        <div className="relative">
          <img src={preview} alt="Steam screenshot" className="w-full rounded-xl object-contain" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-xl flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition text-white text-xs font-semibold bg-black/60 px-3 py-1.5 rounded-full">View on Steam ↗</span>
          </div>
        </div>
      )}
      {!loading && !preview && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border bg-zinc-700/50 border-zinc-600 hover:bg-zinc-600`}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Steam Screenshot</p>
            <p className="text-xs text-zinc-400 truncate">{url}</p>
          </div>
        </div>
      )}
    </a>
  );
}

function authHeaders(extra = {}) {
  const token = getToken();
  return { ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...extra };
}

function SkinCard({ item, onClick, inRegistry, registryId }) {
  const isSpecial = item.quality && (item.quality.includes('StatTrak') || item.quality.includes('Souvenir'));
  const isKnifeOrGloves = item.rarity === 'Extraordinary';
  const qualityColor = item.quality?.includes('StatTrak') ? '#cf6a32' : item.quality?.includes('Souvenir') ? '#ffd700' : null;

  const addRegistryUrl = (() => {
    const baseName = item.name
      .replace(/^StatTrak™\s*/i, '')
      .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '');
    const params = new URLSearchParams({ addSkin: baseName });
    if (item.exterior) params.set('exterior', item.exterior); else params.set('noExterior', '1');
    if (item.quality?.toLowerCase().includes('stattrak')) params.set('statTrak', '1');
    if (item.iconUrl) params.set('iconUrl', item.iconUrl);
    if (item.floatValue != null) {
      params.set('floatValue', String(item.floatValue));
      if (item.paintSeed != null) params.set('paintSeed', String(item.paintSeed));
    }
    return `/skins/traderegistry?${params.toString()}`;
  })();

  return (
    <div
      onClick={onClick}
      className={`group/card relative rounded-xl border flex flex-col transition-transform hover:scale-[1.02] hover:z-10 ${onClick ? 'cursor-pointer' : ''} ${inRegistry ? 'border-green-700/60' : 'border-zinc-700'}`}
      style={{ background: item.rarityColor ? `linear-gradient(160deg, ${item.rarityColor}22 0%, transparent 100%), #27272a` : '#27272a' }}
    >
      {/* Image area */}
      <div className="relative p-3 pb-2">
        {inRegistry && (
          <div className="absolute top-2 right-2 z-10 flex items-center bg-zinc-900/90 border border-zinc-600 rounded px-1.5 py-0.5">
            <span className="text-[9px] font-semibold text-zinc-300 uppercase tracking-wide">In trade registry</span>
          </div>
        )}
        {item.iconUrl
          ? <img src={item.iconUrl} alt={item.name} className="w-full h-24 object-contain mt-5" />
          : <div className="w-full h-24 flex items-center justify-center text-3xl mt-5">🔫</div>
        }
        {/* Sticker row */}
        {item.stickers?.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {item.stickers.map((s, i) => (
              <div key={i} className="relative group">
                <img src={s.url} alt={s.name} className="w-9 h-9 object-contain opacity-85 hover:opacity-100 transition" />
                {s.name && (
                  <div className="absolute bottom-full left-0 mb-2 px-2.5 py-1.5 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                    <p className="text-xs font-semibold text-white">{s.name}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="px-3 pb-3 flex flex-col flex-1">
        <div className="mt-auto flex flex-col gap-0.5">
          {/* Rarity badge */}
          <div className="flex items-center gap-1.5 mb-0.5">
            {item.rarityColor && (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.rarityColor }} />
            )}
            {item.rarity && <span className="text-[10px] font-semibold" style={{ color: item.rarityColor || 'inherit' }}>{item.rarity}</span>}
          </div>

          {/* Name — StatTrak™ prefix and wear suffix stripped since both shown separately */}
          <p className="text-xs font-semibold leading-tight line-clamp-2" title={item.name}>
            {item.name.replace(/^StatTrak™\s*/i, '').startsWith('★') && <span className="mr-0.5">★</span>}
            {item.name
              .replace(/^★\s*/, '')
              .replace(/^StatTrak™\s*/i, '')
              .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '')}
          </p>

          {/* StatTrak / Souvenir + Exterior on same row */}
          {(isSpecial || item.exterior) && (
            <div className="flex items-center gap-1.5">
              {isSpecial && (
                <span className="text-[10px] font-bold" style={{ color: qualityColor }}>{item.quality}</span>
              )}
              {item.exterior && (
                <span className="text-[10px] text-zinc-400">{item.exterior}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Swoop-in button — absolute overlay, card height never changes */}
      <div
        className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-10 rounded-b-xl opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 transition-all duration-200 ease-out pointer-events-none group-hover/card:pointer-events-auto"
        style={{ background: 'linear-gradient(to top, #27272a 55%, transparent)' }}
      >
        {inRegistry ? (
          <a
            href={`/skins/traderegistry${registryId ? `?expand=${registryId}` : ''}`}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-green-900/40 border border-green-700/50 text-green-400 text-[11px] font-semibold hover:bg-green-900/60 hover:border-green-600/60 transition"
          >
            View in registry
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        ) : (
          <a
            href={addRegistryUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-zinc-700/60 border border-zinc-600/60 text-zinc-300 text-[11px] font-semibold hover:bg-zinc-700 hover:border-zinc-500 transition"
          >
            Add to registry
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

export default function CSSkins({ authUsername, baseCurrency = 'SEK' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.pathname === '/skins/inventory' ? 'inventory'
    : location.pathname === '/skins/traderegistry' ? 'tracker'
    : 'overview';
  const tabPaths = { overview: '/skins/overview', inventory: '/skins/inventory', tracker: '/skins/traderegistry' };
  const setTab = (t) => navigate(tabPaths[t] || '/skins/overview');

  const [settings, setSettings] = useState(() => apiCache.get('/api/cs/settings') || {});
  const [steamInventory, setSteamInventory] = useState(null);
  const [steamLoading, setSteamLoading] = useState(false);
  const [steamError, setSteamError] = useState('');
  const [floatCache, setFloatCache] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FLOAT_CACHE_KEY) || '{}'); } catch { return {}; }
  });
  const [invSort, setInvSort] = useState('default');
const [inventory, setInventory] = useState(() => apiCache.get(`/api/cs/inventory?currency=${baseCurrency}`) || []);
  const [pnl, setPnl] = useState(() => apiCache.get(`/api/cs/pnl?currency=${baseCurrency}`));
  const [showAddForm, setShowAddForm] = useState(false);
  const [addModalTab, setAddModalTab] = useState('inventory');
  const [modalInventory, setModalInventory] = useState(null);
  const [modalInvLoading, setModalInvLoading] = useState(false);
  const [modalInvSearch, setModalInvSearch] = useState('');
  const [selectedModalItem, setSelectedModalItem] = useState(null);
  const [showEditForm, setShowEditForm] = useState(null);
  const [editModalTab, setEditModalTab] = useState('skin');
  const [editInvSearch, setEditInvSearch] = useState('');
  const [selectedEditItem, setSelectedEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showSellForm, setShowSellForm] = useState(null);
  const [iconResetting, setIconResetting] = useState(false);
  const [skinSearch, setSkinSearch] = useState('');
  const [skinSearchResults, setSkinSearchResults] = useState([]);
  const [fetchingFloat, setFetchingFloat] = useState(false);
  const [filterSold, setFilterSold] = useState('all');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [trackerSearch, setTrackerSearch] = useState('');
  const [sortCol, setSortCol] = useState('purchase_date');
  const [sortDir, setSortDir] = useState('desc');
  const [addForm, setAddForm] = useState({
    skin_name: '', statTrak: false, hasExterior: true, exterior: 'Factory New', float_value: '', pattern: '',
    purchase_price: '', purchase_currency: 'USD',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: '', screenshot_url: '', icon_url: ''
  });
  const [sellForm, setSellForm] = useState({
    sale_price: '', sale_currency: 'USD',
    sale_date: new Date().toISOString().split('T')[0],
    notes: '', screenshot_url: ''
  });

  const fmtBC = n => fmtCur(n, baseCurrency);

  const card = `bg-zinc-800 border-zinc-700 border rounded-xl`;
  const input = `w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500 bg-zinc-700 border-zinc-600 text-white placeholder-zinc-500`;
  const label = `text-xs font-semibold uppercase tracking-wider block mb-1.5 text-zinc-400`;
  const btn = `px-4 py-2 text-sm font-semibold rounded-lg transition`;
  const btnOrange = `${btn} bg-zinc-600 hover:bg-zinc-500 text-white`;
  const btnGhost = `${btn} bg-zinc-700 hover:bg-zinc-600 text-zinc-200`;

  const _urlParams = new URLSearchParams(location.search);
  const expandParam = _urlParams.get('expand');
  const addSkinParam = _urlParams.get('addSkin');

  // Auto-expand + scroll to a registry row when ?expand=<id> is in the URL
  useEffect(() => {
    if (!expandParam || inventory.length === 0) return;
    const id = parseInt(expandParam, 10);
    setExpandedRows(prev => new Set([...prev, id]));
    setTimeout(() => {
      document.getElementById(`registry-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [expandParam, inventory.length]);

  // Pre-fill and open the add form when ?addSkin=... is in the URL
  useEffect(() => {
    if (!addSkinParam) return;
    const floatValueParam = _urlParams.get('floatValue');
    const paintSeedParam = _urlParams.get('paintSeed');
    setAddForm(f => ({
      ...f,
      skin_name: addSkinParam,
      statTrak: _urlParams.get('statTrak') === '1',
      hasExterior: _urlParams.get('noExterior') !== '1',
      exterior: _urlParams.get('exterior') || 'Factory New',
      icon_url: _urlParams.get('iconUrl') || '',
      float_value: floatValueParam ? parseFloat(floatValueParam).toFixed(4) : '',
      pattern: paintSeedParam || '',
    }));
    setShowAddForm(true);
  }, [addSkinParam]);

  // Background-fetch floats for all tradable inventory items after load.
  // Floats are immutable per item, so cache by assetId with no expiry.
  useEffect(() => {
    if (!steamInventory?.items) return;
    let cancelled = false;
    const run = async () => {
      const tradable = steamInventory.items.filter(i => i.tradable && i.inspectLink);
      const stored = (() => { try { return JSON.parse(localStorage.getItem(FLOAT_CACHE_KEY) || '{}'); } catch { return {}; } })();
      const missing = tradable.filter(i => !stored[i.assetId]);
      if (!missing.length) return;
      const cache = { ...stored };
      for (const item of missing) {
        if (cancelled) break;
        try {
          const r = await fetch(`/api/cs/float?link=${encodeURIComponent(item.inspectLink)}`, { headers: authHeaders() });
          if (cancelled) break;
          const data = await r.json();
          if (data.float !== undefined) {
            cache[item.assetId] = { floatValue: data.float, paintSeed: data.paintSeed ?? null };
            setFloatCache(c => ({ ...c, [item.assetId]: cache[item.assetId] }));
            try { localStorage.setItem(FLOAT_CACHE_KEY, JSON.stringify(cache)); } catch {}
          }
        } catch {}
        if (!cancelled) await new Promise(r => setTimeout(r, 350));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [steamInventory]);

  const fetchAll = useCallback(async () => {
    try {
      const h = authHeaders();
      const [inv, p, s] = await Promise.all([
        fetch(`/api/cs/inventory?currency=${baseCurrency}`, { headers: h }).then(r => r.json()),
        fetch(`/api/cs/pnl?currency=${baseCurrency}`, { headers: h }).then(r => r.json()),
        fetch('/api/cs/settings', { headers: h }).then(r => r.json()),
      ]);
      apiCache.set(`/api/cs/inventory?currency=${baseCurrency}`, Array.isArray(inv) ? inv : []);
      apiCache.set(`/api/cs/pnl?currency=${baseCurrency}`, p);
      apiCache.set('/api/cs/settings', s);
      setInventory(Array.isArray(inv) ? inv : []);
      setPnl(p);
      setSettings(s);
    } catch(e) { console.error(e); }
  }, [baseCurrency]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-fetch missing Steam market icons for items without one
  useEffect(() => {
    if (!inventory.length) return;
    if (!inventory.some(i => !i.icon_url)) return;
    const h = authHeaders();
    fetch('/api/cs/sync-icons', { method: 'POST', headers: h })
      .then(r => r.json())
      .then(d => { if (d.updated > 0) fetchAll(); })
      .catch(() => {});
  }, [inventory.length]);

  // Fetch Steam inventory whenever the user lands on the inventory tab.
  useEffect(() => {
    if (settings.steam_id && tab === 'inventory') {
      fetchSteamInventory();
    }
  }, [settings.steam_id, tab]);



  const INVENTORY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h auto-refresh
  const INVENTORY_CACHE_VERSION = 3; // bump when item shape changes

  const fetchSteamInventory = async (force = false) => {
    const id = settings.steam_id;
    if (!id) { setSteamError('No Steam ID linked — set it in your profile settings'); return; }
    if (!force) {
      try {
        const cached = localStorage.getItem('steam_inv_cache');
        if (cached) {
          const { data, ts, v } = JSON.parse(cached);
          if (v === INVENTORY_CACHE_VERSION && Date.now() - ts < INVENTORY_CACHE_TTL) { setSteamInventory(data); return; }
        }
      } catch(e) {}
    }
    setSteamLoading(true); setSteamError('');
    try {
      const res = await fetch(`/api/cs/steam/inventory/${id}?currency=${baseCurrency}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) { setSteamError(data.error || 'Failed to fetch inventory'); }
      else {
        setSteamInventory(data);
        try { localStorage.setItem('steam_inv_cache', JSON.stringify({ data, ts: Date.now(), v: INVENTORY_CACHE_VERSION })); } catch(e) {}
      }
    } catch(e) { setSteamError('Network error: ' + e.message); }
    setSteamLoading(false);
  };

  const loadModalInventory = async () => {
    if (modalInventory) return;
    const id = settings.steam_id;
    if (!id) return;
    // Use the same localStorage cache as the inventory tab
    try {
      const cached = localStorage.getItem('steam_inv_cache');
      if (cached) {
        const { data, ts, v } = JSON.parse(cached);
        if (v === INVENTORY_CACHE_VERSION && Date.now() - ts < INVENTORY_CACHE_TTL) { setModalInventory(data.items || []); return; }
      }
    } catch(e) {}
    setModalInvLoading(true);
    try {
      const res = await fetch(`/api/cs/steam/inventory/${id}?currency=${baseCurrency}`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setModalInventory(data.items || []);
        try { localStorage.setItem('steam_inv_cache', JSON.stringify({ data, ts: Date.now(), v: INVENTORY_CACHE_VERSION })); } catch(e) {}
      }
    } catch(e) {}
    setModalInvLoading(false);
  };

  const openAddModal = () => {
    setShowAddForm(true);
    setAddModalTab('inventory');
    setSelectedModalItem(null);
    setModalInvSearch('');
    loadModalInventory();
  };

  const closeAddModal = () => {
    setShowAddForm(false);
    setSelectedModalItem(null);
    setSkinSearchResults([]);
    setSkinSearch('');
    setModalInvSearch('');
  };

  const saveOverride = async (name, price) => {
    const res = await fetch('/api/cs/prices/override', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ skin_name: name, price, currency: baseCurrency }),
    });
    if (!res.ok) return;
    setSteamInventory(prev => {
      if (!prev) return prev;
      const items = prev.items.map(i => i.name === name ? { ...i, price, isOverride: true } : i);
      return { ...prev, items, totalValue: items.reduce((s, i) => s + i.price, 0) };
    });
  };

  const clearOverride = async (name) => {
    const res = await fetch(`/api/cs/prices/override/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) return;
    setSteamInventory(prev => {
      if (!prev) return prev;
      const items = prev.items.map(i => i.name === name ? { ...i, price: 0, isOverride: false } : i);
      return { ...prev, items, totalValue: items.reduce((s, i) => s + i.price, 0) };
    });
  };

  const selectModalSkin = async (item) => {
    setSelectedModalItem(item);
    const exterior = parseExteriorFromName(item.name);
    setAddForm(f => ({ ...f, skin_name: withVanilla(item.name), purchase_price: item.price > 0 ? String(item.price.toFixed(2)) : f.purchase_price, icon_url: item.iconUrl || '', ...(exterior ? { exterior } : {}) }));
    if (item.inspectLink) {
      setFetchingFloat(true);
      try {
        const r = await fetch(`/api/cs/float?link=${encodeURIComponent(item.inspectLink)}`, { headers: authHeaders() });
        const data = await r.json();
        if (data.float !== undefined) {
          const ext = floatToExterior(data.float);
          setAddForm(f => ({ ...f, float_value: data.float.toFixed(4), ...(ext ? { exterior: ext } : {}), ...(data.paintSeed ? { pattern: String(data.paintSeed) } : {}) }));
        }
      } catch { /* float fetch failed silently */ }
      setFetchingFloat(false);
    }
  };

  const searchSkins = async (q) => {
    if (q.length < 2) { setSkinSearchResults([]); return; }
    try {
      const res = await fetch(`/api/cs/prices/search/${encodeURIComponent(q)}?currency=${baseCurrency}`, { headers: authHeaders() });
      setSkinSearchResults(await res.json());
    } catch(e) {}
  };

  const addItem = async () => {
    if (!addForm.skin_name || !addForm.purchase_price || !addForm.purchase_date) return;
    // Construct full skin name from parts (only in manual tab)
    const isManual = !selectedModalItem;
    let finalSkinName = addForm.skin_name;
    if (isManual) {
      const stripped = finalSkinName.replace(/^StatTrak™\s*/, '').replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/, '').trim();
      finalSkinName = (addForm.statTrak ? 'StatTrak™ ' : '') + stripped + (addForm.hasExterior ? ` (${addForm.exterior})` : '');
    }
    const payload = { ...addForm, skin_name: finalSkinName };
    delete payload.statTrak; delete payload.hasExterior;
    if (selectedModalItem) {
      payload.steam_asset_id = selectedModalItem.assetId;
      payload.stickers = selectedModalItem.stickers || [];
    }
    await fetch('/api/cs/inventory', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    closeAddModal();
    setAddForm({
      skin_name: '', statTrak: false, hasExterior: true, exterior: 'Factory New', float_value: '', pattern: '',
      purchase_price: '', purchase_currency: 'USD',
      purchase_date: new Date().toISOString().split('T')[0],
      notes: '', screenshot_url: '', icon_url: ''
    });
    await fetchAll();
  };

  const sellItem = async (id) => {
    if (!sellForm.sale_price || !sellForm.sale_date) return;
    await fetch(`/api/cs/inventory/${id}/sell`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(sellForm)
    });
    setShowSellForm(null);
    setSellForm({
      sale_price: '', sale_currency: 'USD',
      sale_date: new Date().toISOString().split('T')[0],
      notes: '', screenshot_url: ''
    });
    await fetchAll();
  };

  const deleteItem = async (id) => {
    if (!confirm('Remove this trade from your registry?')) return;
    await fetch(`/api/cs/inventory/${id}`, { method: 'DELETE', headers: authHeaders() });
    await fetchAll();
  };

  const openEditModal = (item) => {
    setShowEditForm(item);
    setEditModalTab('skin');
    setEditInvSearch('');
    setSelectedEditItem(null);
    setEditForm({
      skin_name: item.skin_name || '',
      exterior: item.exterior || 'Factory New',
      float_value: item.float_value || '',
      pattern: item.pattern || '',
      purchase_price: item.purchase_price_display != null ? parseFloat(item.purchase_price_display).toFixed(2) : (item.purchase_price ?? ''),
      purchase_currency: 'USD',
      purchase_date: item.purchase_date || new Date().toISOString().split('T')[0],
      notes: item.notes || '',
      screenshot_url: item.screenshot_url || '',
      steam_asset_id: item.steam_asset_id || null,
      icon_url: item.icon_url || '',
      stickers: item.stickers || [],
    });
    loadModalInventory();
  };

  const closeEditModal = () => {
    setShowEditForm(null);
    setSelectedEditItem(null);
    setEditInvSearch('');
    setEditSaveError('');
  };

  const selectEditSkin = (item) => {
    setSelectedEditItem(item);
    setEditForm(f => ({ ...f, skin_name: item.name, steam_asset_id: item.assetId, icon_url: item.iconUrl || '', stickers: item.stickers || [] }));
  };

  const resetIcon = async () => {
    if (!showEditForm) return;
    setIconResetting(true);
    try {
      const res = await fetch(`/api/cs/inventory/${showEditForm.id}/reset-icon`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        const { iconUrl } = await res.json();
        setEditForm(f => ({ ...f, icon_url: iconUrl || '' }));
        setShowEditForm(f => ({ ...f, icon_url: iconUrl || '' }));
      }
    } finally {
      setIconResetting(false);
    }
  };

  const [editSaveError, setEditSaveError] = useState('');

  const saveEdit = async () => {
    if (!editForm.skin_name || editForm.purchase_price === '' || !editForm.purchase_date) return;
    setEditSaveError('');
    const payload = {
      ...editForm,
      ...(selectedEditItem ? { steam_asset_id: selectedEditItem.assetId, icon_url: selectedEditItem.iconUrl || '' } : {}),
    };
    const res = await fetch(`/api/cs/inventory/${showEditForm.id}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setEditSaveError(d.error || `Server error ${res.status}`);
      return;
    }
    closeEditModal();
    await fetchAll();
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1 text-zinc-300">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const filteredInv = inventory
    .filter(i => {
      if (filterSold === 'active') return !i.sold;
      if (filterSold === 'sold') return i.sold;
      return true;
    })
    .filter(i => !trackerSearch || i.skin_name.toLowerCase().includes(trackerSearch.toLowerCase()))
    .sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (sortCol === 'pnl') {
        av = a.sold ? ((a.sale_price_display || 0) - (a.purchase_price_display || 0)) : null;
        bv = b.sold ? ((b.sale_price_display || 0) - (b.purchase_price_display || 0)) : null;
      }
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const PnlCard = ({ label, value, positive, sub }) => (
    <div className={`${card} p-5`}>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-400`}>{label}</p>
      <p className={`text-2xl font-bold ${positive === undefined ? '' : positive ? 'text-green-400' : 'text-red-400'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 text-zinc-400`}>{sub}</p>}
    </div>
  );

  return (
    <div className={`flex flex-col flex-1 min-h-0 overflow-y-auto bg-zinc-900 text-white`}>
      <div className="max-w-7xl mx-auto px-6 py-8 w-full">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="flex flex-col gap-6">

              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Overview</h2>
                  <p className={`text-xs mt-0.5 text-zinc-400`}>Your CS2 skin portfolio at a glance</p>
                </div>
                {inventory.length > 0 && (
                  <button onClick={() => setTab('tracker')} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition">
                    Trade Registry →
                  </button>
                )}
              </div>

              {pnl && (
                <div className="grid grid-cols-2 gap-4">
                  <PnlCard label="Total Invested" value={fmtBC(pnl.totalInvested)} sub={`${pnl.holdingCount} skins held`} />
                  <PnlCard label="Realised P&L" value={`${pnl.realised >= 0 ? '+' : ''}${fmtBC(pnl.realised)}`} positive={pnl.realised >= 0} sub={`${pnl.soldCount} skins sold`} />
                </div>
              )}

              {/* Recent trades */}
              {inventory.length > 0 && (
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <p className={`text-xs font-semibold uppercase tracking-wider text-zinc-400`}>Recent Trades</p>
                    <button onClick={() => setTab('tracker')} className={`text-xs text-zinc-400 hover:text-zinc-200 transition`}>View all →</button>
                  </div>
                  <div className="flex flex-col divide-y divide-zinc-700">
                    {inventory.slice(0, 5).map(item => {
                      const costPrice = item.purchase_price_display || 0;
                      const pnlVal = item.sold ? ((item.sale_price_display || 0) - costPrice) : null;
                      const pnlPos = pnlVal !== null && pnlVal >= 0;
                      return (
                        <div key={item.id} className={`flex items-center gap-4 py-3 first:pt-0 last:pb-0`}>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${item.sold ? 'bg-gray-500' : 'bg-green-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{withVanilla(item.skin_name)}</p>
                            <p className={`text-xs text-zinc-400`}>
                              {item.purchase_date}
                              {item.exterior && <span className="ml-1">· {item.exterior}</span>}
                            </p>
                          </div>
                          {pnlVal !== null && (
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-bold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                                {pnlPos ? '+' : ''}{fmtBC(pnlVal)}
                              </p>
                              <p className={`text-xs text-zinc-400`}>{fmtBC(costPrice)}</p>
                            </div>
                          )}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${item.sold ? 'bg-zinc-700 text-zinc-400' : 'bg-green-900/40 text-green-400'}`}>
                            {item.sold ? 'Sold' : 'Holding'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEAM INVENTORY TAB */}
          {tab === 'inventory' && (
            <div className="flex flex-col gap-4">

              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Steam Inventory</h2>
                </div>
                <div className="flex items-center gap-2">
                  {steamInventory && (
                    <div className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
                      <button
                        onClick={() => fetchSteamInventory(true)}
                        disabled={steamLoading}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={steamLoading ? 'animate-spin' : ''}>
                          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
                        </svg>
                        Refresh
                      </button>
                    </div>
                  )}
                  {steamInventory && (
                    <div className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5 gap-0.5">
                      {[['default', 'Inventory order'], ['rarity', 'Rarity']].map(([v, l]) => (
                        <button key={v} onClick={() => setInvSort(v)}
                          className={`px-3 py-1 text-xs font-semibold rounded-md transition ${invSort === v ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {!settings.steam_id && (
                <div className={`${card} p-6 text-center`}>
                  <p className={`text-sm mb-1 font-semibold`}>No Steam account linked</p>
                  <p className={`text-sm mb-4 text-zinc-300`}>Link your Steam ID in your profile settings to fetch your inventory.</p>
                </div>
              )}
              {steamError && <div className={`${card} p-4`}><p className="text-red-400 text-sm">{steamError}</p></div>}
              {steamInventory?.stale && (
                <p className={`text-xs px-3 py-2 rounded-lg bg-zinc-700/60 text-zinc-400`}>
                  Showing cached inventory — Steam is temporarily unavailable ({steamInventory.staleReason})
                </p>
              )}
              {steamInventory && (() => {
                const RARITY_RANK = { Extraordinary: 7, Contraband: 6, Covert: 5, Classified: 4, Restricted: 3, 'Mil-Spec Grade': 2, 'Industrial Grade': 1, 'Consumer Grade': 0 };
                const tradable = steamInventory.items.filter(i=>i.tradable);
                const sorted = invSort === 'rarity'
                  ? [...tradable].sort((a, b) => (RARITY_RANK[b.rarity] ?? -1) - (RARITY_RANK[a.rarity] ?? -1))
                  : tradable;
                const registeredAssetIds = new Set(inventory.filter(i => i.steam_asset_id).map(i => i.steam_asset_id));
                const sortedWithFloats = sorted.map(item => ({
                  ...item,
                  floatValue: floatCache[item.assetId]?.floatValue ?? null,
                  paintSeed: floatCache[item.assetId]?.paintSeed ?? null,
                }));
                return (
                  <>
                    {/* Stats strip */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-zinc-400 px-1">
                      <span><span className="text-zinc-200 font-semibold">{tradable.length}</span> tradable items</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {sortedWithFloats.map((item, i) => (
                        <SkinCard key={i} item={item}
                          inRegistry={registeredAssetIds.has(item.assetId)}
                          registryId={inventory.find(r => r.steam_asset_id === item.assetId)?.id} />
                      ))}
                    </div>
                  </>
                );
              })()}
              {steamLoading && (
                <div className={`${card} p-10 flex flex-col items-center gap-3`}>
                  <div className="w-8 h-8 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin"/>
                  <p className={`text-sm text-zinc-400`}>Fetching your Steam inventory…</p>
                </div>
              )}
              {!steamInventory && !steamLoading && !steamError && settings.steam_id && (
                <div className={`${card} p-6 text-center`}>
                  <p className={`text-sm text-zinc-400`}>Loading your Steam inventory...</p>
                </div>
              )}
            </div>
          )}

          {/* TRADE REGISTRY */}
          {tab === 'tracker' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Trade Registry</h2>
                  <p className={`text-xs mt-0.5 text-zinc-400`}>Track every skin you've bought and sold</p>
                </div>
                <button onClick={openAddModal} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 1v12M1 7h12"/></svg>
                  Register Trade
                </button>
              </div>

              {/* Filters & search */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5 gap-0.5">
                  {[['all','All'],['active','Holding'],['sold','Sold']].map(([v, l]) => (
                    <button key={v} onClick={() => setFilterSold(v)} className={`px-3 py-1 text-xs font-semibold rounded-md transition ${filterSold === v ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}>{l}</button>
                  ))}
                </div>
                <input
                  value={trackerSearch}
                  onChange={e => setTrackerSearch(e.target.value)}
                  placeholder="Search skins..."
                  className={`ml-auto text-xs px-3 py-1.5 rounded-lg border outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500 w-48 bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500`}
                />
                <span className={`text-xs text-zinc-400`}>{filteredInv.length} trades</span>
              </div>

              {/* Stats strip */}
              {inventory.length > 0 && (() => {
                const holding = inventory.filter(i => !i.sold);
                const sold = inventory.filter(i => i.sold);
                const invested = holding.reduce((s, i) => s + (i.purchase_price_display || 0), 0);
                const realized = sold.reduce((s, i) => s + ((i.sale_price_display || 0) - (i.purchase_price_display || 0)), 0);
                return (
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-zinc-400 px-1">
                    {holding.length > 0 && (
                      <span>
                        <span className="text-zinc-200 font-semibold">{holding.length}</span> holding
                        {' · '}Invested {fmtBC(invested)}
                      </span>
                    )}
                    {sold.length > 0 && (
                      <span>
                        <span className="text-zinc-200 font-semibold">{sold.length}</span> sold
                        {' · '}Realised <span className={realized >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>{realized >= 0 ? '+' : ''}{fmtBC(realized)}</span>
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Add trade modal */}
              {showAddForm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                  <div className={`bg-zinc-800 border-zinc-700 border rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col`} style={{ maxHeight: '92vh' }}>

                    {/* Header */}
                    <div className={`flex items-center justify-between px-6 py-4 border-b border-zinc-700 shrink-0`}>
                      <h3 className="font-bold text-base">Register Trade</h3>
                      <button onClick={closeAddModal} className={`text-xl leading-none text-zinc-400 hover:text-white`}>✕</button>
                    </div>

                    {/* Tabs */}
                    <div className={`flex border-b border-zinc-700 shrink-0`}>
                      {[['inventory', 'From Steam Inventory'], ['manual', 'Enter Manually']].map(([t, tLabel]) => (
                        <button
                          key={t}
                          onClick={() => setAddModalTab(t)}
                          className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${addModalTab === t ? 'border-zinc-300 text-zinc-100' : `border-transparent text-zinc-400 hover:text-zinc-100`}`}
                        >
                          {tLabel}
                        </button>
                      ))}
                    </div>

                    {/* Scrollable body */}
                    <div className="overflow-y-auto flex-1 min-h-0">

                      {/* FROM INVENTORY TAB */}
                      {addModalTab === 'inventory' && (
                        <div className="p-6 flex flex-col gap-4">
                          {!settings.steam_id ? (
                            <div className="text-center py-8">
                              <p className={`text-sm mb-1 font-semibold`}>No Steam account linked</p>
                              <p className={`text-sm text-zinc-400`}>Link your Steam ID in profile settings to use this feature.</p>
                            </div>
                          ) : (
                            <>
                              {/* Selected skin preview */}
                              {selectedModalItem && (
                                <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-zinc-400 bg-zinc-700/50`}>
                                  <img src={selectedModalItem.iconUrl} alt={selectedModalItem.name} className="w-14 h-14 object-contain shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{selectedModalItem.name}</p>
                                    <p className={`text-xs text-zinc-400`}>{selectedModalItem.type}</p>
                                    {selectedModalItem.price > 0 && <p className="text-xs text-green-400 font-bold mt-0.5">Market: {fmtBC(selectedModalItem.price)}</p>}
                                  </div>
                                  <button onClick={() => { setSelectedModalItem(null); setAddForm(f => ({ ...f, skin_name: '' })); }} className={`text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-400 hover:bg-zinc-600 transition shrink-0`}>Change</button>
                                </div>
                              )}

                              {/* Grid */}
                              {!selectedModalItem && (
                                <>
                                  <input
                                    value={modalInvSearch}
                                    onChange={e => setModalInvSearch(e.target.value)}
                                    placeholder="Search your inventory..."
                                    className={`${input} text-xs`}
                                  />
                                  {modalInvLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                      <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  ) : modalInventory === null ? (
                                    <div className="text-center py-8">
                                      <button onClick={loadModalInventory} className={btnOrange}>Load Inventory</button>
                                    </div>
                                  ) : modalInventory.length === 0 ? (
                                    <p className={`text-center py-8 text-sm text-zinc-400`}>No CS items found in your inventory.</p>
                                  ) : (
                                    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-2 max-h-96 overflow-y-auto">
                                      {modalInventory
                                        .filter(i => !modalInvSearch || i.name.toLowerCase().includes(modalInvSearch.toLowerCase()))
                                        .map(item => (
                                          <button
                                            key={item.assetId}
                                            onClick={() => selectModalSkin(item)}
                                            className={`p-2 rounded-lg border-2 transition text-left border-zinc-600 bg-zinc-700/50 hover:bg-zinc-600 hover:border-zinc-400/60`}
                                          >
                                            <img src={item.iconUrl} alt={item.name} className="w-full h-20 object-contain mb-1.5" />
                                            <p className={`text-xs truncate text-zinc-300 leading-tight`}>{item.name}</p>
                                            {item.price > 0 && <p className="text-xs text-green-400 font-bold mt-0.5">{fmtBC(item.price)}</p>}
                                          </button>
                                        ))
                                      }
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Trade details form (shown after skin is selected) */}
                              {selectedModalItem && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                  <div>
                                    <label className={label}>Exterior</label>
                                    <select value={addForm.exterior} onChange={e => setAddForm(f => ({ ...f, exterior: e.target.value }))} className={input}>
                                      {EXTERIORS.map(e => <option key={e}>{e}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className={label}>Float {fetchingFloat && <span className="text-zinc-500 normal-case font-normal tracking-normal ml-1">fetching…</span>}</label>
                                    <NumInput step="0.0001" min="0" max="1" value={addForm.float_value} onChange={e => setAddForm(f => ({ ...f, float_value: e.target.value }))} placeholder={fetchingFloat ? 'Fetching…' : '0.0000'} disabled={fetchingFloat} className={input} />
                                  </div>
                                  <div>
                                    <label className={label}>Buy price *</label>
                                    <div className="flex gap-2">
                                      <NumInput step="0.01" value={addForm.purchase_price} onChange={e => setAddForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" className={input} wrapperClass="flex-1" />
                                      <span className="shrink-0 px-2 py-2 text-sm text-zinc-400">USD</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className={label}>Buy date *</label>
                                    <input type="date" value={addForm.purchase_date} onChange={e => setAddForm(f => ({ ...f, purchase_date: e.target.value }))} className={input} />
                                  </div>
                                  <div>
                                    <label className={label}>Pattern / Seed</label>
                                    <NumInput value={addForm.pattern} onChange={e => setAddForm(f => ({ ...f, pattern: e.target.value }))} placeholder="Optional" className={input} />
                                  </div>
                                  <div>
                                    <label className={label}>Notes</label>
                                    <input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className={label}>Steam screenshot URL</label>
                                    <input value={addForm.screenshot_url} onChange={e => setAddForm(f => ({ ...f, screenshot_url: e.target.value }))} placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..." className={input} />
                                    <p className={`text-xs mt-1.5 text-zinc-400`}>Upload to Steam (Public), paste the share link here.</p>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* MANUAL TAB */}
                      {addModalTab === 'manual' && (
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2 relative">
                            <label className={label}>Skin name *</label>
                            <input value={skinSearch} onChange={e => { setSkinSearch(e.target.value); setAddForm(f => ({ ...f, skin_name: e.target.value })); searchSkins(e.target.value); }} placeholder="e.g. AK-47 | Redline" className={input} />
                            {skinSearchResults.length > 0 && (
                              <div className={`absolute z-50 w-full mt-1 bg-zinc-800 border-zinc-600 border rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto`}>
                                {skinSearchResults.map((r, i) => (
                                  <div key={i} onClick={() => { const n = withVanilla(r.skin_name); setAddForm(f => ({ ...f, skin_name: n, hasExterior: r.hasExterior ?? true })); setSkinSearch(n); setSkinSearchResults([]); }} className={`flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-zinc-600 border-b border-zinc-700 last:border-0`}>
                                    <span className="text-sm">{withVanilla(r.skin_name)}</span>
                                    <span className="text-xs text-green-400 font-bold">{fmtBC(r.price)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="sm:col-span-2">
                            <label className={label}>StatTrak™</label>
                            <div className="flex gap-2">
                              {[false, true].map(val => (
                                <button key={String(val)} type="button" onClick={() => setAddForm(f => ({ ...f, statTrak: val }))}
                                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition border ${addForm.statTrak === val ? (val ? 'bg-orange-600/20 border-orange-500/60 text-orange-400' : 'bg-zinc-700/80 border-zinc-500 text-zinc-200') : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-500 hover:text-zinc-300'}`}>
                                  {val ? 'StatTrak™' : 'Standard'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className={label}>Exterior</label>
                            <select value={addForm.exterior} onChange={e => setAddForm(f => ({ ...f, exterior: e.target.value }))} className={input}>
                              {EXTERIORS.map(e => <option key={e}>{e}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={label}>Float *</label>
                            <NumInput step="0.0001" min="0" max="1" value={addForm.float_value} onChange={e => { const ext = floatToExterior(e.target.value); setAddForm(f => ({ ...f, float_value: e.target.value, ...(ext ? { exterior: ext } : {}) })); }} placeholder="0.0000" className={input} />
                          </div>
                          <div>
                            <label className={label}>Buy price *</label>
                            <div className="flex gap-2">
                              <NumInput step="0.01" value={addForm.purchase_price} onChange={e => setAddForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" className={input} wrapperClass="flex-1" />
                              <span className="shrink-0 px-2 py-2 text-sm text-zinc-400">USD</span>
                            </div>
                          </div>
                          <div>
                            <label className={label}>Buy date *</label>
                            <input type="date" value={addForm.purchase_date} onChange={e => setAddForm(f => ({ ...f, purchase_date: e.target.value }))} className={input} />
                          </div>
                          <div>
                            <label className={label}>Pattern / Seed</label>
                            <NumInput value={addForm.pattern} onChange={e => setAddForm(f => ({ ...f, pattern: e.target.value }))} placeholder="Optional" className={input} />
                          </div>
                          <div>
                            <label className={label}>Notes</label>
                            <input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={label}>Steam screenshot URL</label>
                            <input value={addForm.screenshot_url} onChange={e => setAddForm(f => ({ ...f, screenshot_url: e.target.value }))} placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..." className={input} />
                            <p className={`text-xs mt-1.5 text-zinc-400`}>Upload to Steam (Public), paste the share link here.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className={`flex gap-2 px-6 py-4 border-t border-zinc-700 shrink-0`}>
                      <button
                        onClick={addItem}
                        disabled={addModalTab === 'inventory'
                          ? !selectedModalItem || !addForm.purchase_price
                          : !addForm.skin_name || !addForm.purchase_price || (addForm.hasExterior && !addForm.float_value)}
                        className={`${btnOrange} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-600`}
                      >
                        Add to Registry
                      </button>
                      <button onClick={closeAddModal} className={btnGhost}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit trade modal */}
              {showEditForm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                  <div className={`bg-zinc-800 border-zinc-700 border rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col`} style={{ maxHeight: '92vh' }}>

                    {/* Header */}
                    <div className={`flex items-center justify-between px-6 py-4 border-b border-zinc-700 shrink-0`}>
                      <div>
                        <h3 className="font-bold text-base">Edit Trade</h3>
                        <p className={`text-xs mt-0.5 text-zinc-400`}>{withVanilla(showEditForm.skin_name)}</p>
                      </div>
                      <button onClick={closeEditModal} className={`text-xl leading-none text-zinc-400 hover:text-white`}>✕</button>
                    </div>

                    {/* Tabs */}
                    <div className={`flex border-b border-zinc-700 shrink-0`}>
                      {[['skin', 'Attached Skin'], ['details', 'Trade Details']].map(([t, tLabel]) => (
                        <button
                          key={t}
                          onClick={() => setEditModalTab(t)}
                          className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${editModalTab === t ? 'border-zinc-300 text-zinc-100' : `border-transparent text-zinc-400 hover:text-zinc-100`}`}
                        >
                          {tLabel}
                        </button>
                      ))}
                    </div>

                    <div className="overflow-y-auto flex-1 min-h-0">

                      {/* ATTACHED SKIN TAB */}
                      {editModalTab === 'skin' && (
                        <div className="p-6 flex flex-col gap-4">
                          {!settings.steam_id ? (
                            <div className="text-center py-8">
                              <p className="text-sm font-semibold mb-1">No Steam account linked</p>
                              <p className={`text-sm text-zinc-400`}>Link your Steam ID in profile settings to attach a skin.</p>
                            </div>
                          ) : (
                            <>
                              {/* Currently attached or newly selected skin */}
                              {(selectedEditItem || editForm.steam_asset_id) && (
                                <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-zinc-400 bg-zinc-700/50`}>
                                  {selectedEditItem ? (
                                    <>
                                      <img src={selectedEditItem.iconUrl} alt={selectedEditItem.name} className="w-14 h-14 object-contain shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate">{selectedEditItem.name}</p>
                                        <p className={`text-xs text-zinc-400`}>{selectedEditItem.type}</p>
                                        {selectedEditItem.price > 0 && <p className="text-xs text-green-400 font-bold mt-0.5">Market: {fmtBC(selectedEditItem.price)}</p>}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-sm truncate">{withVanilla(editForm.skin_name)}</p>
                                      <p className={`text-xs text-zinc-400`}>Previously attached — select from inventory to change</p>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => { setSelectedEditItem(null); setEditForm(f => ({ ...f, steam_asset_id: null })); }}
                                    className={`text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-400 hover:bg-zinc-600 transition shrink-0`}
                                  >
                                    Detach
                                  </button>
                                </div>
                              )}

                              {/* Inventory grid */}
                              <input
                                value={editInvSearch}
                                onChange={e => setEditInvSearch(e.target.value)}
                                placeholder="Search your inventory..."
                                className={`${input} text-xs`}
                              />
                              {modalInvLoading ? (
                                <div className="flex items-center justify-center py-12">
                                  <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                                </div>
                              ) : modalInventory === null ? (
                                <div className="text-center py-8">
                                  <button onClick={loadModalInventory} className={btnOrange}>Load Inventory</button>
                                </div>
                              ) : modalInventory.length === 0 ? (
                                <p className={`text-center py-8 text-sm text-zinc-400`}>No CS items found in your inventory.</p>
                              ) : (
                                <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-2 max-h-96 overflow-y-auto">
                                  {modalInventory
                                    .filter(i => !editInvSearch || i.name.toLowerCase().includes(editInvSearch.toLowerCase()))
                                    .map(item => {
                                      const isAttached = selectedEditItem?.assetId === item.assetId || (!selectedEditItem && editForm.steam_asset_id === item.assetId);
                                      return (
                                        <button
                                          key={item.assetId}
                                          onClick={() => selectEditSkin(item)}
                                          className={`p-2 rounded-lg border-2 transition text-left ${isAttached ? 'border-zinc-300 bg-zinc-700' : 'border-zinc-600 bg-zinc-700/50 hover:bg-zinc-600 hover:border-zinc-400/60'}`}
                                        >
                                          <img src={item.iconUrl} alt={item.name} className="w-full aspect-square object-contain mb-1" />
                                          <p className={`text-xs truncate text-zinc-300`}>{item.name}</p>
                                          {item.price > 0 && <p className="text-xs text-green-400 font-bold">{fmtBC(item.price)}</p>}
                                        </button>
                                      );
                                    })
                                  }
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* TRADE DETAILS TAB */}
                      {editModalTab === 'details' && (
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2">
                            <label className={label}>Skin name *</label>
                            <input value={editForm.skin_name} onChange={e => setEditForm(f => ({ ...f, skin_name: e.target.value }))} placeholder="e.g. AK-47 | Redline" className={input} />
                          </div>
                          <div>
                            <label className={label}>Exterior</label>
                            <select value={editForm.exterior} onChange={e => setEditForm(f => ({ ...f, exterior: e.target.value }))} className={input}>
                              {EXTERIORS.map(e => <option key={e}>{e}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={label}>Float</label>
                            <NumInput step="0.0001" min="0" max="1" value={editForm.float_value} onChange={e => setEditForm(f => ({ ...f, float_value: e.target.value }))} placeholder="0.0000" className={input} />
                          </div>
                          <div>
                            <label className={label}>Buy price *</label>
                            <div className="flex gap-2">
                              <NumInput step="0.01" value={editForm.purchase_price} onChange={e => setEditForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" className={input} wrapperClass="flex-1" />
                              <span className="shrink-0 px-2 py-2 text-sm text-zinc-400">USD</span>
                            </div>
                          </div>
                          <div>
                            <label className={label}>Buy date *</label>
                            <input type="date" value={editForm.purchase_date} onChange={e => setEditForm(f => ({ ...f, purchase_date: e.target.value }))} className={input} />
                          </div>
                          <div>
                            <label className={label}>Pattern / Seed</label>
                            <NumInput value={editForm.pattern} onChange={e => setEditForm(f => ({ ...f, pattern: e.target.value }))} placeholder="Optional" className={input} />
                          </div>
                          <div>
                            <label className={label}>Notes</label>
                            <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={label}>Steam screenshot URL</label>
                            <input value={editForm.screenshot_url} onChange={e => setEditForm(f => ({ ...f, screenshot_url: e.target.value }))} placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..." className={input} />
                            <p className={`text-xs mt-1.5 text-zinc-400`}>Upload to Steam (Public), paste the share link here.</p>
                          </div>
                          <div className="sm:col-span-2">
                            <label className={label}>Skin Image</label>
                            <div className="flex items-center gap-3">
                              {editForm.icon_url
                                ? <img src={editForm.icon_url} alt="" className="w-12 h-12 object-contain rounded bg-zinc-700/50 p-1 shrink-0" />
                                : <div className="w-12 h-12 rounded bg-zinc-700 flex items-center justify-center text-xl shrink-0">🔫</div>
                              }
                              <div>
                                <button
                                  type="button"
                                  onClick={resetIcon}
                                  disabled={iconResetting}
                                  className={`${btnGhost} text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}
                                >
                                  {iconResetting ? 'Fetching...' : 'Refresh Icon'}
                                </button>
                                <p className={`text-xs mt-1 text-zinc-500`}>Fetches from Steam Market. Use if the wrong image shows.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className={`flex flex-col gap-2 px-6 py-4 border-t border-zinc-700 shrink-0`}>
                      {editSaveError && (
                        <p className="text-xs text-red-400">{editSaveError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={!editForm.skin_name || editForm.purchase_price === '' || !editForm.purchase_date}
                          className={`${btnOrange} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          Save Changes
                        </button>
                        <button onClick={closeEditModal} className={btnGhost}>Cancel</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sell modal */}
              {showDeleteConfirm && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                  <div className="bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">
                    <h3 className="font-bold text-base mb-1">Delete trade?</h3>
                    <p className="text-sm text-zinc-400 mb-6">
                      This will permanently remove <span className="text-white font-semibold">{withVanilla(showDeleteConfirm.skin_name)}</span> from your registry. This cannot be undone.
                    </p>
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setShowDeleteConfirm(null)} className="text-sm px-4 py-2 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition">Cancel</button>
                      <button onClick={() => { deleteItem(showDeleteConfirm.id); setShowDeleteConfirm(null); }} className="text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition font-semibold">Delete</button>
                    </div>
                  </div>
                </div>
              )}

              {showSellForm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                  <div className={`bg-zinc-800 border-zinc-700 border rounded-2xl shadow-2xl w-full max-w-lg`}>
                    <div className={`flex items-center justify-between px-6 py-4 border-b border-zinc-700`}>
                      <div>
                        <h3 className="font-bold text-base">Mark as Sold</h3>
                        <p className={`text-sm text-zinc-400`}>{withVanilla(showSellForm.skin_name)}</p>
                      </div>
                      <button onClick={() => setShowSellForm(null)} className={`text-xl leading-none text-zinc-400 hover:text-white`}>✕</button>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-4">
                      <div>
                        <label className={label}>Sale price *</label>
                        <div className="flex gap-2">
                          <NumInput step="0.01" value={sellForm.sale_price} onChange={e => setSellForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="0.00" className={input} />
                          <span className="shrink-0 px-2 py-2 text-sm text-zinc-400">USD</span>
                        </div>
                      </div>
                      <div>
                        <label className={label}>Sale date *</label>
                        <input type="date" value={sellForm.sale_date} onChange={e => setSellForm(f => ({ ...f, sale_date: e.target.value }))} className={input} />
                      </div>
                      <div className="col-span-2">
                        <label className={label}>Notes</label>
                        <input value={sellForm.notes} onChange={e => setSellForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
                      </div>
                      <div className="col-span-2">
                        <label className={label}>Steam screenshot URL</label>
                        <input
                          value={sellForm.screenshot_url}
                          onChange={e => setSellForm(f => ({ ...f, screenshot_url: e.target.value }))}
                          placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..."
                          className={input}
                        />
                        <p className={`text-xs mt-1.5 text-zinc-400`}>Link a Steam screenshot of the sale (optional)</p>
                      </div>
                    </div>
                    <div className={`flex gap-2 px-6 py-4 border-t border-zinc-700`}>
                      <button onClick={() => sellItem(showSellForm.id)} className={`${btn} bg-red-600 hover:bg-red-500 text-white`}>Confirm Sale</button>
                      <button onClick={() => setShowSellForm(null)} className={btnGhost}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Table */}
              {filteredInv.length === 0 ? (
                <div className={`${card} p-10 text-center`}>
                  <svg className="mx-auto mb-4 text-zinc-600" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                  </svg>
                  <p className="font-semibold mb-1">
                    {trackerSearch ? 'No matching trades' : filterSold === 'sold' ? 'No sold trades yet' : filterSold === 'active' ? 'No trades currently held' : 'No trades registered yet'}
                  </p>
                  <p className={`text-sm mb-4 text-zinc-400`}>
                    {trackerSearch ? 'Try a different search term.' : filterSold === 'sold' ? 'Trades you mark as sold will appear here.' : filterSold === 'active' ? 'All your trades have been marked as sold.' : 'Register skins you\'ve bought to track their value and P&L over time.'}
                  </p>
                  {!trackerSearch && filterSold !== 'sold' && <button onClick={() => setShowAddForm(true)} className={btnOrange}>+ Register First Trade</button>}
                </div>
              ) : (
                <div className={`${card} overflow-hidden`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={`bg-zinc-900 border-zinc-700 border-b`}>
                        <tr>
                          <th className="pl-3 pr-1 py-3 w-6" />
                          {[
                            { key: 'skin_name', label: 'Skin' },
                          ].map(({ key, label: colLabel }) => (
                            <th
                              key={key}
                              onClick={() => toggleSort(key)}
                              className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-zinc-400 hover:text-zinc-200 transition`}
                            >
                              {colLabel}<SortIcon col={key} />
                            </th>
                          ))}
                          <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap min-w-[120px]">Stickers</th>
                          <th className="px-2 py-3 w-8" />
                          {[
                            { key: 'exterior', label: 'Exterior' },
                            { key: 'float_value', label: 'Float' },
                            { key: 'purchase_date', label: 'Buy Date' },
                            { key: 'purchase_price', label: 'Buy Price' },
                            { key: 'sold', label: 'Status' },
                            { key: 'pnl', label: 'P&L' },
                          ].map(({ key, label: colLabel }) => (
                            <th
                              key={key}
                              onClick={() => toggleSort(key)}
                              className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-zinc-400 hover:text-zinc-200 transition`}
                            >
                              {colLabel}<SortIcon col={key} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInv.map(item => {
                          const buyPrice = item.purchase_price_display || 0;
                          const pnlVal = item.sold ? ((item.sale_price_display || 0) - buyPrice) : null;
                          const pnlPos = pnlVal !== null && pnlVal >= 0;
                          const isExpanded = expandedRows.has(item.id);
                          const screenshotUrl = item.screenshot_url || item.cs_sales?.[0]?.screenshot_url;
                          const isVanilla = !item.float_value;
                          return (
                            <Fragment key={item.id}>
                              <tr
                                id={`registry-row-${item.id}`}
                                onClick={() => setExpandedRows(prev => { const next = new Set(prev); isExpanded ? next.delete(item.id) : next.add(item.id); return next; })}
                                className={`border-t ${isExpanded ? 'bg-zinc-700/40' : ''} border-zinc-700 hover:bg-zinc-600/30 transition cursor-pointer`}
                              >
                                <td className="pl-3 pr-1 py-2.5 w-6">
                                  <svg
                                    width="14" height="14" viewBox="0 0 16 16" fill="currentColor"
                                    className={`text-zinc-500 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                                  >
                                    <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
                                  </svg>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2.5">
                                    {item.icon_url && (
                                      <img src={item.icon_url} alt="" className="w-10 h-10 object-contain shrink-0 rounded" />
                                    )}
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <div className="w-fit flex flex-col">
                                        {(() => { const n = withVanilla(item.skin_name.replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '')); const hasStar = n.startsWith('★'); const isST = n.startsWith('StatTrak'); const nameColor = hasStar ? 'text-violet-300' : isST ? 'text-orange-400' : 'text-white'; return (<span className={`font-semibold flex items-baseline min-w-0 ${nameColor}`}><span className="shrink-0 w-4 text-xs">{hasStar ? '★' : ''}</span><span className="truncate">{hasStar ? n.slice(1).trim() : n}</span></span>); })()}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                  {item.stickers?.length > 0 && (
                                    <div className="flex gap-0.5">
                                      {item.stickers.map((s, i) => (
                                        <div key={i} className="relative group/sticker">
                                          <img src={s.url} alt={s.name || ''} className="w-8 h-8 object-contain opacity-70 hover:opacity-100 transition" />
                                          {s.name && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-zinc-900 border border-zinc-600 rounded-lg text-[11px] text-white whitespace-nowrap opacity-0 group-hover/sticker:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                              {s.name}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                                  {item.share_token && (
                                    <a
                                      href={`/trade/${item.share_token}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Share"
                                      className="inline-flex items-center justify-center w-7 h-7 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 3v13M7 8l5-5 5 5"/>
                                        <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>
                                      </svg>
                                    </a>
                                  )}
                                </td>
                                <td className={`px-4 py-2.5 text-xs text-zinc-400 whitespace-nowrap`}>{isVanilla ? '—' : (item.exterior || '—')}</td>
                                <td className={`px-4 py-2.5 text-xs text-zinc-400 ${item.float_value ? 'font-mono' : ''}`}>{item.float_value ? parseFloat(item.float_value).toFixed(4) : '—'}</td>
                                <td className={`px-4 py-2.5 text-xs text-zinc-400`}>{item.purchase_date}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs">
                                  {fmtBC(item.purchase_price_display)}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.sold ? `bg-zinc-700 text-zinc-400` : 'bg-green-900/40 text-green-400'}`}>
                                    {item.sold ? `Sold ${item.sale_date || ''}` : 'Holding'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs font-bold">
                                  {pnlVal !== null ? (
                                    <span className={pnlPos ? 'text-green-400' : 'text-red-400'}>
                                      {pnlPos ? '+' : ''}{fmtBC(pnlVal)}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600">—</span>
                                  )}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="border-t border-zinc-700">
                                  <td colSpan={10} className="p-0">
                                    <div className="bg-zinc-800/60 px-6 py-5 flex items-stretch gap-6" onClick={e => e.stopPropagation()}>
                                      {/* Content column */}
                                      <div className="flex-1 min-w-0 flex flex-col gap-3">
                                        {/* Item name */}
                                        {(() => { const n = withVanilla(item.skin_name.replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '')); const hasStar = n.startsWith('★'); const isST = n.startsWith('StatTrak'); const nameColor = hasStar ? 'text-violet-300' : isST ? 'text-orange-400' : 'text-white'; return <p className={`font-bold text-sm ${nameColor}`}>{n}</p>; })()}
                                        {/* Float bar */}
                                        {item.float_value && !isVanilla && (
                                          <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Float</p>
                                            <div className="relative h-1.5 rounded-full overflow-hidden max-w-[240px]" style={{background:'linear-gradient(to right,#22c55e,#84cc16,#eab308,#f97316,#ef4444)'}}>
                                              {[0.07,0.15,0.38,0.45].map(v => (
                                                <div key={v} className="absolute top-0 bottom-0 w-px bg-black/30" style={{left:`${v*100}%`}} />
                                              ))}
                                              <div className="absolute top-1/2 w-2.5 h-2.5 bg-white rounded-full shadow border-2 border-zinc-800" style={{left:`${Math.min(parseFloat(item.float_value)*100,99.5)}%`,transform:'translate(-50%,-50%)'}} />
                                            </div>
                                            <p className="text-[11px] font-mono text-zinc-400 mt-1">{parseFloat(item.float_value).toFixed(4)}</p>
                                          </div>
                                        )}
                                        {/* Stickers */}
                                        {item.stickers?.length > 0 && (
                                          <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Stickers</p>
                                            <div className="flex gap-1.5 flex-wrap">
                                              {item.stickers.map((s, i) => (
                                                <div key={i} className="relative group/sticker">
                                                  <img src={s.url} alt={s.name || ''} className="w-9 h-9 object-contain opacity-80 hover:opacity-100 transition" />
                                                  {s.name && (
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-zinc-900 border border-zinc-600 rounded-lg text-[11px] text-white whitespace-nowrap opacity-0 group-hover/sticker:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                                      {s.name}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {/* Stats row */}
                                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                                          {item.pattern != null && item.pattern !== '' && (
                                            <div>
                                              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">Pattern</p>
                                              <p className="text-sm font-mono">{item.pattern}</p>
                                            </div>
                                          )}
                                          {pnlVal !== null && (
                                            <div>
                                              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">P&L</p>
                                              <p className={`text-sm font-bold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>{pnlPos ? '+' : ''}{fmtBC(pnlVal)}</p>
                                            </div>
                                          )}
                                        </div>
                                        {/* Notes */}
                                        {item.notes && (
                                          <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">Notes</p>
                                            <p className="text-sm text-zinc-300">{item.notes}</p>
                                          </div>
                                        )}
                                        {/* Action buttons — bottom left */}
                                        <div className="flex gap-2 mt-auto pt-3">
                                          {!item.sold && (
                                            <button onClick={() => setShowSellForm(item)} className="text-xs px-3 py-1.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition">Sell</button>
                                          )}
                                          <button onClick={() => openEditModal(item)} className="text-xs px-3 py-1.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition">Edit</button>
                                          <button onClick={() => setShowDeleteConfirm(item)} className="text-xs px-3 py-1.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/60 transition">Delete</button>
                                        </div>
                                      </div>
                                      {/* Right: screenshot */}
                                      {screenshotUrl && (
                                        <div className="shrink-0 max-w-2xl w-full">
                                          <SteamScreenshotEmbed url={screenshotUrl} />
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
    </div>
  );
}
