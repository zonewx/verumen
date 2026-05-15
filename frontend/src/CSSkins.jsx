import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiCache from './apiCache';

const EXTERIORS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
const CURRENCIES = ['SEK', 'USD', 'EUR'];

function fmt(n) { return (n || 0).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtSEK(n) { return `${fmt(n)} kr`; }

function SteamScreenshotEmbed({ url, isDark }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    const match = url.match(/id=(\d+)/);
    if (!match) return;
    setLoading(true);
    fetch(`/api/cs/steam/screenshot/${match[1]}`)
      .then(r => r.json())
      .then(d => { if (d.previewUrl) setPreview(d.previewUrl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [url]);

  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-2 rounded-xl overflow-hidden group">
      {loading && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-orange-400">Loading preview...</span>
        </div>
      )}
      {!loading && preview && (
        <div className="relative">
          <img src={preview} alt="Steam screenshot" className="w-full rounded-xl object-cover max-h-64" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-xl flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition text-white text-xs font-semibold bg-black/60 px-3 py-1.5 rounded-full">View on Steam ↗</span>
          </div>
        </div>
      )}
      {!loading && !preview && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
          <span className="text-xl">📷</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Steam Screenshot</p>
            <p className="text-xs text-orange-400 truncate">{url}</p>
          </div>
          <span className="text-xs text-orange-400 shrink-0">View ↗</span>
        </div>
      )}
    </a>
  );
}

function authHeaders(extra = {}) {
  const token = sessionStorage.getItem('auth_token');
  return { ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...extra };
}

function SkinCard({ item, isDark, onClick, onSetPrice, onClearPrice }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const isSpecial = item.quality && (item.quality.includes('StatTrak') || item.quality.includes('Souvenir'));
  const isKnifeOrGloves = item.rarity === 'Extraordinary';
  const qualityColor = item.quality?.includes('StatTrak') ? '#cf6a32' : item.quality?.includes('Souvenir') ? '#ffd700' : null;

  const startEdit = (e) => { e.stopPropagation(); setInputVal(''); setEditing(true); };
  const cancelEdit = (e) => { e.stopPropagation(); setEditing(false); };
  const saveEdit = (e) => {
    e.stopPropagation();
    const val = parseFloat(inputVal.replace(',', '.'));
    if (!isNaN(val) && val > 0) { onSetPrice(val); setEditing(false); }
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border overflow-hidden flex flex-col transition-transform hover:scale-[1.02] ${onClick ? 'cursor-pointer' : ''} ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
    >
      {/* Image area with rarity tint */}
      <div className="relative p-3 pb-2" style={item.rarityColor ? { background: `linear-gradient(160deg, ${item.rarityColor}22 0%, transparent 70%)` } : {}}>
        {item.iconUrl
          ? <img src={item.iconUrl} alt={item.name} className="w-full h-24 object-contain" />
          : <div className="w-full h-24 flex items-center justify-center text-3xl">🔫</div>
        }
        {/* Sticker row */}
        {item.stickers?.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {item.stickers.map((s, i) => (
              <div key={i} className="relative group">
                <img src={s.url} alt={s.name} className="w-9 h-9 object-contain opacity-85 hover:opacity-100 transition" />
                {s.name && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] bg-gray-900 text-white rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-20 border border-gray-700 shadow-lg">
                    {s.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="px-3 pb-3 flex flex-col gap-0.5 flex-1">
        {/* Rarity + quality badges */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {item.rarityColor && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.rarityColor }} />
          )}
          {item.rarity && <span className="text-[10px] font-semibold" style={{ color: item.rarityColor || 'inherit' }}>{item.rarity}</span>}
          {isSpecial && <span className="text-[10px] font-bold ml-auto" style={{ color: qualityColor }}>{item.quality}</span>}
        </div>

        {/* Name */}
        <p className="text-xs font-semibold leading-tight line-clamp-2" title={item.name}>
          {isKnifeOrGloves && <span className="text-yellow-400 mr-0.5">★</span>}{item.name}
        </p>

        {/* Exterior */}
        {item.exterior && (
          <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.exterior}</p>
        )}

        <div className="mt-auto pt-1.5 flex items-center justify-between gap-1">
          {editing ? (
            <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                type="number"
                min="0"
                step="any"
                placeholder="kr"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(e); if (e.key === 'Escape') cancelEdit(e); }}
                className={`w-full text-xs px-2 py-1 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'} outline-none`}
              />
              <button onClick={saveEdit} className="text-[10px] px-1.5 py-1 rounded bg-green-600 text-white hover:bg-green-500 shrink-0">✓</button>
              <button onClick={cancelEdit} className={`text-[10px] px-1.5 py-1 rounded shrink-0 ${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>✕</button>
            </div>
          ) : item.priceSEK > 0 ? (
            <div className="flex items-center gap-1">
              <p className="text-sm font-bold text-green-400">{fmtSEK(item.priceSEK)}</p>
              {item.isOverride && (
                <button onClick={e => { e.stopPropagation(); onClearPrice(); }} title="Remove manual price" className="text-[10px] text-gray-500 hover:text-red-400 transition">✕</button>
              )}
            </div>
          ) : (
            <button onClick={startEdit} className={`text-xs font-medium ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} transition`}>
              — <span className="text-[10px]">set price</span>
            </button>
          )}
          {!item.tradable && !editing && <span className="text-[10px] text-yellow-500 font-medium">Not tradable</span>}
        </div>
      </div>
    </div>
  );
}

export default function CSSkins({ isDark, authUsername, baseCurrency = 'SEK' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.pathname === '/cs-skins/inventory' ? 'inventory'
    : location.pathname === '/cs-skins/tracker' ? 'tracker'
    : location.pathname === '/cs-skins/settings' ? 'settings'
    : 'overview';
  const setTab = (t) => navigate(t === 'overview' ? '/cs-skins' : `/cs-skins/${t}`);

  const [settings, setSettings] = useState(() => apiCache.get('/api/cs/settings') || {});
  const [steamInventory, setSteamInventory] = useState(null);
  const [steamLoading, setSteamLoading] = useState(false);
  const [steamError, setSteamError] = useState('');
  const [invSort, setInvSort] = useState('default');
  const [inventory, setInventory] = useState(() => apiCache.get('/api/cs/inventory') || []);
  const [pnl, setPnl] = useState(() => apiCache.get('/api/cs/pnl'));
  const [pricesReady, setPricesReady] = useState(() => apiCache.has('/api/cs/prices-ready'));
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
  const [skinSearch, setSkinSearch] = useState('');
  const [skinSearchResults, setSkinSearchResults] = useState([]);
  const [filterSold, setFilterSold] = useState('all');
  const [expandedRow, setExpandedRow] = useState(null);
  const [trackerSearch, setTrackerSearch] = useState('');
  const [sortCol, setSortCol] = useState('purchase_date');
  const [sortDir, setSortDir] = useState('desc');
  const [addForm, setAddForm] = useState({
    skin_name: '', exterior: 'Factory New', float_value: '', pattern: '',
    purchase_price: '', purchase_currency: 'SEK',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: '', screenshot_url: ''
  });
  const [sellForm, setSellForm] = useState({
    sale_price: '', sale_currency: 'SEK',
    sale_date: new Date().toISOString().split('T')[0],
    notes: '', screenshot_url: ''
  });

  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;
  const input = `w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const label = `text-xs font-semibold uppercase tracking-wider block mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`;
  const btn = `px-4 py-2 text-sm font-semibold rounded-lg transition`;
  const btnOrange = `${btn} bg-orange-600 hover:bg-orange-500 text-white`;
  const btnGhost = `${btn} ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;

  const fetchAll = useCallback(async () => {
    try {
      const h = authHeaders();
      const [inv, p, s] = await Promise.all([
        fetch('/api/cs/inventory', { headers: h }).then(r => r.json()),
        fetch('/api/cs/pnl', { headers: h }).then(r => r.json()),
        fetch('/api/cs/settings', { headers: h }).then(r => r.json()),
      ]);
      apiCache.set('/api/cs/inventory', Array.isArray(inv) ? inv : []);
      apiCache.set('/api/cs/pnl', p);
      apiCache.set('/api/cs/settings', s);
      setInventory(Array.isArray(inv) ? inv : []);
      setPnl(p);
      setSettings(s);
      const priceCheck = await fetch('/api/cs/prices/search/AK-47', { headers: h }).then(r => r.json());
      const ready = Array.isArray(priceCheck) && priceCheck.length > 0;
      if (ready) apiCache.set('/api/cs/prices-ready', true);
      setPricesReady(ready);
    } catch(e) { console.error(e); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-load Steam inventory as soon as Steam ID is known
  useEffect(() => {
    if (settings.steam_id && !steamInventory) {
      fetchSteamInventory();
    }
  }, [settings.steam_id]);

  // Auto-refresh while server signals prices are still being fetched in background.
  // Depends on the steamInventory object reference so it re-evaluates after every refresh,
  // not just when pricingPending flips — otherwise a stuck-at-true value never retriggers.
  const pricingRetries = useRef(0);
  useEffect(() => {
    if (!steamInventory?.pricingPending) { pricingRetries.current = 0; return; }
    if (pricingRetries.current >= 5) {
      setSteamInventory(prev => prev ? { ...prev, pricingPending: false } : prev);
      return;
    }
    const t = setTimeout(() => { pricingRetries.current++; fetchSteamInventory(true); }, 20000);
    return () => clearTimeout(t);
  }, [steamInventory]);

  const INVENTORY_CACHE_TTL = 10 * 60 * 1000;
  const INVENTORY_CACHE_VERSION = 2; // bump when item shape changes

  const fetchSteamInventory = async (force = false) => {
    const id = settings.steam_id;
    if (!id) { setSteamError('No Steam ID linked — set it in your profile settings'); return; }
    if (!force) {
      try {
        const cached = sessionStorage.getItem('steam_inv_cache');
        if (cached) {
          const { data, ts, v } = JSON.parse(cached);
          if (v === INVENTORY_CACHE_VERSION && Date.now() - ts < INVENTORY_CACHE_TTL) { setSteamInventory(data); return; }
        }
      } catch(e) {}
    }
    setSteamLoading(true); setSteamError('');
    try {
      const res = await fetch(`/api/cs/steam/inventory/${id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) { setSteamError(data.error || 'Failed to fetch inventory'); }
      else {
        setSteamInventory(data);
        sessionStorage.setItem('steam_inv_cache', JSON.stringify({ data, ts: Date.now(), v: INVENTORY_CACHE_VERSION }));
      }
    } catch(e) { setSteamError('Network error: ' + e.message); }
    setSteamLoading(false);
  };

  const loadModalInventory = async () => {
    if (modalInventory) return;
    const id = settings.steam_id;
    if (!id) return;
    // Use the same sessionStorage cache as the inventory tab
    try {
      const cached = sessionStorage.getItem('steam_inv_cache');
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 10 * 60 * 1000) { setModalInventory(data.items || []); return; }
      }
    } catch(e) {}
    setModalInvLoading(true);
    try {
      const res = await fetch(`/api/cs/steam/inventory/${id}`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setModalInventory(data.items || []);
        sessionStorage.setItem('steam_inv_cache', JSON.stringify({ data, ts: Date.now(), v: INVENTORY_CACHE_VERSION }));
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

  const saveOverride = async (name, priceSEK) => {
    await fetch('/api/cs/prices/override', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ skin_name: name, price_sek: priceSEK }),
    });
    setSteamInventory(prev => {
      if (!prev) return prev;
      const items = prev.items.map(i => i.name === name ? { ...i, priceSEK, isOverride: true } : i);
      return { ...prev, items, totalValue: items.reduce((s, i) => s + i.priceSEK, 0) };
    });
  };

  const clearOverride = async (name) => {
    await fetch(`/api/cs/prices/override/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    setSteamInventory(prev => {
      if (!prev) return prev;
      const items = prev.items.map(i => i.name === name ? { ...i, priceSEK: 0, isOverride: false } : i);
      return { ...prev, items, totalValue: items.reduce((s, i) => s + i.priceSEK, 0) };
    });
  };

  const selectModalSkin = (item) => {
    setSelectedModalItem(item);
    setAddForm(f => ({ ...f, skin_name: item.name, purchase_price: item.priceSEK > 0 ? String(item.priceSEK.toFixed(2)) : f.purchase_price }));
  };

  const searchSkins = async (q) => {
    if (q.length < 2) { setSkinSearchResults([]); return; }
    try {
      const res = await fetch(`/api/cs/prices/search/${encodeURIComponent(q)}`, { headers: authHeaders() });
      setSkinSearchResults(await res.json());
    } catch(e) {}
  };

  const addItem = async () => {
    if (!addForm.skin_name || !addForm.purchase_price || !addForm.purchase_date) return;
    const payload = { ...addForm };
    if (selectedModalItem) payload.steam_asset_id = selectedModalItem.assetId;
    await fetch('/api/cs/inventory', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    closeAddModal();
    setAddForm({
      skin_name: '', exterior: 'Factory New', float_value: '', pattern: '',
      purchase_price: '', purchase_currency: 'SEK',
      purchase_date: new Date().toISOString().split('T')[0],
      notes: '', screenshot_url: ''
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
      sale_price: '', sale_currency: 'SEK',
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
      purchase_price: item.purchase_price || '',
      purchase_currency: item.purchase_currency || 'SEK',
      purchase_date: item.purchase_date || new Date().toISOString().split('T')[0],
      notes: item.notes || '',
      screenshot_url: item.screenshot_url || '',
      steam_asset_id: item.steam_asset_id || null,
    });
    loadModalInventory();
  };

  const closeEditModal = () => {
    setShowEditForm(null);
    setSelectedEditItem(null);
    setEditInvSearch('');
  };

  const selectEditSkin = (item) => {
    setSelectedEditItem(item);
    setEditForm(f => ({ ...f, skin_name: item.name, steam_asset_id: item.assetId }));
  };

  const saveEdit = async () => {
    if (!editForm.skin_name || !editForm.purchase_price || !editForm.purchase_date) return;
    await fetch(`/api/cs/inventory/${showEditForm.id}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(editForm),
    });
    closeEditModal();
    await fetchAll();
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1 text-orange-400">{sortDir === 'asc' ? '↑' : '↓'}</span>;
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
        av = a.sold ? (a.sale_price - a.purchase_price) : ((a.current_price_sek || 0) - a.purchase_price);
        bv = b.sold ? (b.sale_price - b.purchase_price) : ((b.current_price_sek || 0) - b.purchase_price);
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
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-2xl font-bold ${positive === undefined ? '' : positive ? 'text-green-400' : 'text-red-400'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  );

  return (
    <div className={`flex flex-col flex-1 overflow-y-auto ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className="max-w-6xl mx-auto px-8 py-8 w-full">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="flex flex-col gap-6">

              {pnl && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <PnlCard label="Current Value" value={fmtSEK(pnl.currentValue)} />
                    <PnlCard label="Total Invested" value={fmtSEK(pnl.totalInvested)} />
                    <PnlCard label="Unrealised P&L" value={`${pnl.unrealised >= 0 ? '+' : ''}${fmtSEK(pnl.unrealised)}`} positive={pnl.unrealised >= 0} sub={`${pnl.holdingCount} skins held`} />
                    <PnlCard label="Realised P&L" value={`${pnl.realised >= 0 ? '+' : ''}${fmtSEK(pnl.realised)}`} positive={pnl.realised >= 0} sub={`${pnl.soldCount} skins sold`} />
                  </div>
                  <div className={`${card} p-5`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Total P&L</p>
                    <p className={`text-4xl font-bold ${pnl.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pnl.totalPnl >= 0 ? '+' : ''}{fmtSEK(pnl.totalPnl)}</p>
                  </div>
                </>
              )}

              {settings.steam_id && (
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Steam Inventory</h3>
                    <select
                      value={invSort}
                      onChange={e => setInvSort(e.target.value)}
                      className={`px-2 py-1.5 rounded-lg border text-xs outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                    >
                      <option value="default">Inventory order</option>
                      <option value="price-desc">Price: High → Low</option>
                      <option value="price-asc">Price: Low → High</option>
                    </select>
                  </div>
                  {steamError && <p className="text-red-400 text-sm">{steamError}</p>}
                  {steamInventory?.pricingPending && (
                    <p className={`text-xs mb-3 px-3 py-2 rounded-lg ${isDark ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-700'}`}>
                      Fetching prices for new items in background — updating automatically in ~20s
                    </p>
                  )}
                  {steamInventory && (() => {
                    const tradable = steamInventory.items.filter(i=>i.tradable);
                    const sorted = invSort === 'price-desc' ? [...tradable].sort((a,b)=>b.priceSEK-a.priceSEK)
                      : invSort === 'price-asc' ? [...tradable].sort((a,b)=>a.priceSEK-b.priceSEK)
                      : tradable;
                    return (
                      <div>
                        <div className="flex gap-6 mb-4">
                          <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Tradable items</p><p className="text-xl font-bold">{tradable.length}</p></div>
                          <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Est. Value</p><p className="text-xl font-bold text-green-400">{fmtSEK(tradable.reduce((s,i)=>s+i.priceSEK,0))}</p></div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                          {sorted.map((item, i) => (
                            <SkinCard key={i} item={item} isDark={isDark}
                              onSetPrice={p => saveOverride(item.name, p)}
                              onClearPrice={() => clearOverride(item.name)} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {!steamInventory && !steamLoading && !steamError && (
                    <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Click "Fetch Inventory" to load your Steam CS inventory.</p>
                  )}
                </div>
              )}

              {/* Recent trades */}
              {inventory.length > 0 && (
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Recent Trades</h3>
                    <button onClick={() => setTab('tracker')} className={`text-xs text-orange-400 hover:underline`}>View all →</button>
                  </div>
                  <div className="flex flex-col divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-100'}">
                    {inventory.slice(0, 5).map(item => {
                      const costSEK = item.purchase_price_sek || item.purchase_price;
                      const currentSEK = item.current_price_sek || 0;
                      const pnlVal = item.sold ? (item.sale_price - costSEK) : (currentSEK - costSEK);
                      const pnlPos = pnlVal >= 0;
                      return (
                        <div key={item.id} className={`flex items-center gap-4 py-3 first:pt-0 last:pb-0`}>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${item.sold ? (isDark ? 'bg-gray-500' : 'bg-gray-300') : 'bg-green-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{item.skin_name}</p>
                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                              {item.purchase_date}
                              {item.exterior && <span className="ml-1">· {item.exterior}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold ${currentSEK === 0 && !item.sold ? (isDark ? 'text-gray-500' : 'text-gray-400') : pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                              {currentSEK === 0 && !item.sold ? '—' : `${pnlPos ? '+' : ''}${fmtSEK(pnlVal)}`}
                            </p>
                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                              {item.purchase_currency !== 'SEK'
                                ? `${fmt(item.purchase_price)} ${item.purchase_currency}`
                                : fmtSEK(item.purchase_price)
                              }
                            </p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${item.sold ? (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500') : 'bg-green-900/40 text-green-400'}`}>
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
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Steam Inventory</h2>
                <select
                  value={invSort}
                  onChange={e => setInvSort(e.target.value)}
                  className={`px-2 py-1.5 rounded-lg border text-xs outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                >
                  <option value="default">Inventory order</option>
                  <option value="price-desc">Price: High → Low</option>
                  <option value="price-asc">Price: Low → High</option>
                </select>
              </div>
              {!settings.steam_id && (
                <div className={`${card} p-6 text-center`}>
                  <p className={`text-sm mb-1 font-semibold`}>No Steam account linked</p>
                  <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Link your Steam ID in your profile settings to fetch your inventory.</p>
                </div>
              )}
              {steamError && <div className={`${card} p-4`}><p className="text-red-400 text-sm">{steamError}</p></div>}
              {steamInventory?.pricingPending && (
                <p className={`text-xs px-3 py-2 rounded-lg ${isDark ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-700'}`}>
                  Fetching prices for new items in background — updating automatically in ~20s
                </p>
              )}
              {steamInventory && (() => {
                const tradable = steamInventory.items.filter(i=>i.tradable);
                const sorted = invSort === 'price-desc' ? [...tradable].sort((a,b)=>b.priceSEK-a.priceSEK)
                  : invSort === 'price-asc' ? [...tradable].sort((a,b)=>a.priceSEK-b.priceSEK)
                  : tradable;
                return (
                  <>
                    <div className={`${card} p-4 flex gap-6`}>
                      <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Tradable items</p><p className="text-2xl font-bold">{tradable.length}</p></div>
                      <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Estimated value</p><p className="text-2xl font-bold text-green-400">{fmtSEK(tradable.reduce((s,i)=>s+i.priceSEK,0))}</p></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {sorted.map((item, i) => (
                        <SkinCard key={i} item={item} isDark={isDark}
                          onSetPrice={p => saveOverride(item.name, p)}
                          onClearPrice={() => clearOverride(item.name)} />
                      ))}
                    </div>
                  </>
                );
              })()}
              {!steamInventory && !steamLoading && settings.steam_id && (
                <div className={`${card} p-6 text-center`}>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading your Steam inventory...</p>
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
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Track every skin you've bought and sold</p>
                </div>
                <button onClick={openAddModal} className={btnOrange}>+ Register Trade</button>
              </div>

              {/* Filters & search */}
              <div className="flex flex-wrap gap-2 items-center">
                {[['all','All'],['active','Holding'],['sold','Sold']].map(([v, l]) => (
                  <button key={v} onClick={() => setFilterSold(v)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${filterSold === v ? 'bg-orange-600 text-white' : `${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}`}>{l}</button>
                ))}
                <input
                  value={trackerSearch}
                  onChange={e => setTrackerSearch(e.target.value)}
                  placeholder="Search skins..."
                  className={`ml-auto text-xs px-3 py-1.5 rounded-lg border outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 w-48 ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}
                />
                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{filteredInv.length} trades</span>
              </div>

              {/* Add trade modal */}
              {showAddForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                  <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col`} style={{ maxHeight: '90vh' }}>

                    {/* Header */}
                    <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} shrink-0`}>
                      <h3 className="font-bold text-base">Register Trade</h3>
                      <button onClick={closeAddModal} className={`text-xl leading-none ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}>✕</button>
                    </div>

                    {/* Tabs */}
                    <div className={`flex border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} shrink-0`}>
                      {[['inventory', 'From Steam Inventory'], ['manual', 'Enter Manually']].map(([t, tLabel]) => (
                        <button
                          key={t}
                          onClick={() => setAddModalTab(t)}
                          className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${addModalTab === t ? 'border-orange-500 text-orange-500' : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}`}
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
                              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Link your Steam ID in profile settings to use this feature.</p>
                            </div>
                          ) : (
                            <>
                              {/* Selected skin preview */}
                              {selectedModalItem && (
                                <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-orange-500 ${isDark ? 'bg-orange-900/20' : 'bg-orange-50'}`}>
                                  <img src={selectedModalItem.iconUrl} alt={selectedModalItem.name} className="w-14 h-14 object-contain shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{selectedModalItem.name}</p>
                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{selectedModalItem.type}</p>
                                    {selectedModalItem.priceSEK > 0 && <p className="text-xs text-green-400 font-bold mt-0.5">Market: {fmtSEK(selectedModalItem.priceSEK)}</p>}
                                  </div>
                                  <button onClick={() => { setSelectedModalItem(null); setAddForm(f => ({ ...f, skin_name: '' })); }} className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} transition shrink-0`}>Change</button>
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
                                      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  ) : modalInventory === null ? (
                                    <div className="text-center py-8">
                                      <button onClick={loadModalInventory} className={btnOrange}>Load Inventory</button>
                                    </div>
                                  ) : modalInventory.length === 0 ? (
                                    <p className={`text-center py-8 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No CS items found in your inventory.</p>
                                  ) : (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                                      {modalInventory
                                        .filter(i => !modalInvSearch || i.name.toLowerCase().includes(modalInvSearch.toLowerCase()))
                                        .map(item => (
                                          <button
                                            key={item.assetId}
                                            onClick={() => selectModalSkin(item)}
                                            className={`p-2 rounded-lg border-2 transition text-left ${isDark ? 'border-gray-600 bg-gray-700/50 hover:bg-gray-700 hover:border-orange-500/60' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-orange-400/60'}`}
                                          >
                                            <img src={item.iconUrl} alt={item.name} className="w-full aspect-square object-contain mb-1" />
                                            <p className={`text-xs truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{item.name}</p>
                                            {item.priceSEK > 0 && <p className="text-xs text-green-400 font-bold">{fmtSEK(item.priceSEK)}</p>}
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
                                    <label className={label}>Float</label>
                                    <input type="number" step="0.0001" min="0" max="1" value={addForm.float_value} onChange={e => setAddForm(f => ({ ...f, float_value: e.target.value }))} placeholder="0.0000" className={input} />
                                  </div>
                                  <div>
                                    <label className={label}>Buy price *</label>
                                    <div className="flex gap-2">
                                      <input type="number" step="0.01" value={addForm.purchase_price} onChange={e => setAddForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" className={input} />
                                      <select value={addForm.purchase_currency} onChange={e => setAddForm(f => ({ ...f, purchase_currency: e.target.value }))} className={`${input} w-24`}>
                                        {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className={label}>Buy date *</label>
                                    <input type="date" value={addForm.purchase_date} onChange={e => setAddForm(f => ({ ...f, purchase_date: e.target.value }))} className={input} />
                                  </div>
                                  <div>
                                    <label className={label}>Pattern / Seed</label>
                                    <input type="number" value={addForm.pattern} onChange={e => setAddForm(f => ({ ...f, pattern: e.target.value }))} placeholder="Optional" className={input} />
                                  </div>
                                  <div>
                                    <label className={label}>Notes</label>
                                    <input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className={label}>Steam screenshot URL</label>
                                    <input value={addForm.screenshot_url} onChange={e => setAddForm(f => ({ ...f, screenshot_url: e.target.value }))} placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..." className={input} />
                                    <p className={`text-xs mt-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Upload to Steam (Public), paste the share link here.</p>
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
                              <div className={`absolute z-50 w-full mt-1 ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'} border rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto`}>
                                {skinSearchResults.map((r, i) => (
                                  <div key={i} onClick={() => { setAddForm(f => ({ ...f, skin_name: r.skin_name })); setSkinSearch(r.skin_name); setSkinSearchResults([]); }} className={`flex items-center justify-between px-4 py-2.5 cursor-pointer ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} last:border-0`}>
                                    <span className="text-sm">{r.skin_name}</span>
                                    <span className="text-xs text-green-400 font-bold">{fmtSEK(r.price_sek)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <label className={label}>Exterior</label>
                            <select value={addForm.exterior} onChange={e => setAddForm(f => ({ ...f, exterior: e.target.value }))} className={input}>
                              {EXTERIORS.map(e => <option key={e}>{e}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={label}>Float</label>
                            <input type="number" step="0.0001" min="0" max="1" value={addForm.float_value} onChange={e => setAddForm(f => ({ ...f, float_value: e.target.value }))} placeholder="0.0000" className={input} />
                          </div>
                          <div>
                            <label className={label}>Buy price *</label>
                            <div className="flex gap-2">
                              <input type="number" step="0.01" value={addForm.purchase_price} onChange={e => setAddForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" className={input} />
                              <select value={addForm.purchase_currency} onChange={e => setAddForm(f => ({ ...f, purchase_currency: e.target.value }))} className={`${input} w-24`}>
                                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className={label}>Buy date *</label>
                            <input type="date" value={addForm.purchase_date} onChange={e => setAddForm(f => ({ ...f, purchase_date: e.target.value }))} className={input} />
                          </div>
                          <div>
                            <label className={label}>Pattern / Seed</label>
                            <input type="number" value={addForm.pattern} onChange={e => setAddForm(f => ({ ...f, pattern: e.target.value }))} placeholder="Optional" className={input} />
                          </div>
                          <div>
                            <label className={label}>Notes</label>
                            <input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={label}>Steam screenshot URL</label>
                            <input value={addForm.screenshot_url} onChange={e => setAddForm(f => ({ ...f, screenshot_url: e.target.value }))} placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..." className={input} />
                            <p className={`text-xs mt-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Upload to Steam (Public), paste the share link here.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className={`flex gap-2 px-6 py-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'} shrink-0`}>
                      <button
                        onClick={addItem}
                        disabled={!addForm.skin_name || !addForm.purchase_price || !addForm.purchase_date}
                        className={`${btnOrange} disabled:opacity-40 disabled:cursor-not-allowed`}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                  <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col`} style={{ maxHeight: '90vh' }}>

                    {/* Header */}
                    <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} shrink-0`}>
                      <div>
                        <h3 className="font-bold text-base">Edit Trade</h3>
                        <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{showEditForm.skin_name}</p>
                      </div>
                      <button onClick={closeEditModal} className={`text-xl leading-none ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}>✕</button>
                    </div>

                    {/* Tabs */}
                    <div className={`flex border-b ${isDark ? 'border-gray-700' : 'border-gray-100'} shrink-0`}>
                      {[['skin', 'Attached Skin'], ['details', 'Trade Details']].map(([t, tLabel]) => (
                        <button
                          key={t}
                          onClick={() => setEditModalTab(t)}
                          className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${editModalTab === t ? 'border-orange-500 text-orange-500' : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}`}
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
                              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Link your Steam ID in profile settings to attach a skin.</p>
                            </div>
                          ) : (
                            <>
                              {/* Currently attached or newly selected skin */}
                              {(selectedEditItem || showEditForm.steam_asset_id) && (
                                <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-orange-500 ${isDark ? 'bg-orange-900/20' : 'bg-orange-50'}`}>
                                  {selectedEditItem ? (
                                    <>
                                      <img src={selectedEditItem.iconUrl} alt={selectedEditItem.name} className="w-14 h-14 object-contain shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate">{selectedEditItem.name}</p>
                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{selectedEditItem.type}</p>
                                        {selectedEditItem.priceSEK > 0 && <p className="text-xs text-green-400 font-bold mt-0.5">Market: {fmtSEK(selectedEditItem.priceSEK)}</p>}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-sm truncate">{editForm.skin_name}</p>
                                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Previously attached — select from inventory to change</p>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => { setSelectedEditItem(null); setEditForm(f => ({ ...f, steam_asset_id: null })); }}
                                    className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} transition shrink-0`}
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
                                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                              ) : modalInventory === null ? (
                                <div className="text-center py-8">
                                  <button onClick={loadModalInventory} className={btnOrange}>Load Inventory</button>
                                </div>
                              ) : modalInventory.length === 0 ? (
                                <p className={`text-center py-8 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No CS items found in your inventory.</p>
                              ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                                  {modalInventory
                                    .filter(i => !editInvSearch || i.name.toLowerCase().includes(editInvSearch.toLowerCase()))
                                    .map(item => {
                                      const isAttached = selectedEditItem?.assetId === item.assetId || (!selectedEditItem && showEditForm.steam_asset_id === item.assetId);
                                      return (
                                        <button
                                          key={item.assetId}
                                          onClick={() => selectEditSkin(item)}
                                          className={`p-2 rounded-lg border-2 transition text-left ${isAttached ? 'border-orange-500 bg-orange-500/10' : isDark ? 'border-gray-600 bg-gray-700/50 hover:bg-gray-700 hover:border-orange-500/60' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-orange-400/60'}`}
                                        >
                                          <img src={item.iconUrl} alt={item.name} className="w-full aspect-square object-contain mb-1" />
                                          <p className={`text-xs truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{item.name}</p>
                                          {item.priceSEK > 0 && <p className="text-xs text-green-400 font-bold">{fmtSEK(item.priceSEK)}</p>}
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
                            <input type="number" step="0.0001" min="0" max="1" value={editForm.float_value} onChange={e => setEditForm(f => ({ ...f, float_value: e.target.value }))} placeholder="0.0000" className={input} />
                          </div>
                          <div>
                            <label className={label}>Buy price *</label>
                            <div className="flex gap-2">
                              <input type="number" step="0.01" value={editForm.purchase_price} onChange={e => setEditForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" className={input} />
                              <select value={editForm.purchase_currency} onChange={e => setEditForm(f => ({ ...f, purchase_currency: e.target.value }))} className={`${input} w-24`}>
                                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className={label}>Buy date *</label>
                            <input type="date" value={editForm.purchase_date} onChange={e => setEditForm(f => ({ ...f, purchase_date: e.target.value }))} className={input} />
                          </div>
                          <div>
                            <label className={label}>Pattern / Seed</label>
                            <input type="number" value={editForm.pattern} onChange={e => setEditForm(f => ({ ...f, pattern: e.target.value }))} placeholder="Optional" className={input} />
                          </div>
                          <div>
                            <label className={label}>Notes</label>
                            <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={label}>Steam screenshot URL</label>
                            <input value={editForm.screenshot_url} onChange={e => setEditForm(f => ({ ...f, screenshot_url: e.target.value }))} placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..." className={input} />
                            <p className={`text-xs mt-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Upload to Steam (Public), paste the share link here.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className={`flex gap-2 px-6 py-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'} shrink-0`}>
                      <button
                        onClick={saveEdit}
                        disabled={!editForm.skin_name || !editForm.purchase_price || !editForm.purchase_date}
                        className={`${btnOrange} disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        Save Changes
                      </button>
                      <button onClick={closeEditModal} className={btnGhost}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sell modal */}
              {showSellForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                  <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl shadow-2xl w-full max-w-lg`}>
                    <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                      <div>
                        <h3 className="font-bold text-base">Mark as Sold</h3>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{showSellForm.skin_name}</p>
                      </div>
                      <button onClick={() => setShowSellForm(null)} className={`text-xl leading-none ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}>✕</button>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-4">
                      <div>
                        <label className={label}>Sale price *</label>
                        <div className="flex gap-2">
                          <input type="number" step="0.01" value={sellForm.sale_price} onChange={e => setSellForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="0.00" className={input} />
                          <select value={sellForm.sale_currency} onChange={e => setSellForm(f => ({ ...f, sale_currency: e.target.value }))} className={`${input} w-24`}>
                            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                          </select>
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
                        <p className={`text-xs mt-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Link a Steam screenshot of the sale (optional)</p>
                      </div>
                    </div>
                    <div className={`flex gap-2 px-6 py-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                      <button onClick={() => sellItem(showSellForm.id)} className={`${btn} bg-red-600 hover:bg-red-500 text-white`}>Confirm Sale</button>
                      <button onClick={() => setShowSellForm(null)} className={btnGhost}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Table */}
              {filteredInv.length === 0 ? (
                <div className={`${card} p-10 text-center`}>
                  <p className="text-3xl mb-3">📋</p>
                  <p className="font-semibold mb-1">{trackerSearch ? 'No matching trades' : 'No trades registered yet'}</p>
                  <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {trackerSearch ? 'Try a different search term.' : 'Register skins you\'ve bought to track their value and P&L over time.'}
                  </p>
                  {!trackerSearch && <button onClick={() => setShowAddForm(true)} className={btnOrange}>+ Register First Trade</button>}
                </div>
              ) : (
                <div className={`${card} overflow-hidden`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                        <tr>
                          {[
                            { key: 'skin_name', label: 'Skin' },
                            { key: 'exterior', label: 'Exterior' },
                            { key: 'float_value', label: 'Float' },
                            { key: 'purchase_date', label: 'Buy Date' },
                            { key: 'purchase_price', label: 'Buy Price' },
                            { key: 'current_price_sek', label: 'Current' },
                            { key: 'pnl', label: 'P&L' },
                            { key: 'sold', label: 'Status' },
                          ].map(({ key, label: colLabel }) => (
                            <th
                              key={key}
                              onClick={() => toggleSort(key)}
                              className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'} transition`}
                            >
                              {colLabel}<SortIcon col={key} />
                            </th>
                          ))}
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInv.map(item => {
                          const currentSEK = item.current_price_sek || 0;
                          const buySEK = item.purchase_price_sek || item.purchase_price;
                          const pnlVal = item.sold ? (item.sale_price - buySEK) : (currentSEK - buySEK);
                          const pnlPos = pnlVal >= 0;
                          const isExpanded = expandedRow === item.id;
                          const hasScreenshot = item.screenshot_url || (item.sold && item.cs_sales?.[0]?.screenshot_url);
                          return (
                            <tr
                              key={item.id}
                              onClick={() => setExpandedRow(isExpanded ? null : item.id)}
                              className={`border-t ${isExpanded ? (isDark ? 'bg-gray-700/40' : 'bg-gray-50') : ''} ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'} transition cursor-pointer`}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold max-w-xs truncate">{item.skin_name}</span>
                                  {hasScreenshot && <span className="text-orange-400 text-xs" title="Has screenshot">📷</span>}
                                  {item.notes && <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`} title={item.notes}>💬</span>}
                                </div>
                              </td>
                              <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} whitespace-nowrap`}>{item.exterior || '—'}</td>
                              <td className={`px-4 py-3 text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.float_value ? parseFloat(item.float_value).toFixed(4) : '—'}</td>
                              <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.purchase_date}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                                {item.purchase_currency && item.purchase_currency !== 'SEK'
                                  ? <span>{fmt(item.purchase_price)} <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.purchase_currency}</span></span>
                                  : fmtSEK(item.purchase_price)
                                }
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                                {item.sold
                                  ? <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>{fmtSEK(item.sale_price)}</span>
                                  : (currentSEK > 0 ? fmtSEK(currentSEK) : '—')
                                }
                              </td>
                              <td className={`px-4 py-3 font-bold whitespace-nowrap text-xs ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                                {pnlPos ? '+' : ''}{fmtSEK(pnlVal)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.sold ? `${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}` : 'bg-green-900/40 text-green-400'}`}>
                                  {item.sold ? `Sold ${item.sale_date || ''}` : 'Holding'}
                                </span>
                              </td>
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <div className="flex gap-1">
                                  {!item.sold && <button onClick={() => setShowSellForm(item)} className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60' : 'bg-red-50 text-red-600 hover:bg-red-100'} transition`}>Sell</button>}
                                  <button onClick={() => openEditModal(item)} className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} transition`}>Edit</button>
                                  <button onClick={() => deleteItem(item.id)} className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} transition`}>✕</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Expanded detail panel — outside the scroll container so it uses full width */}
                  {expandedRow && (() => {
                    const item = filteredInv.find(i => i.id === expandedRow);
                    if (!item) return null;
                    const screenshotUrl = item.screenshot_url || item.cs_sales?.[0]?.screenshot_url;
                    return (
                      <div className={`border-t ${isDark ? 'border-gray-700 bg-gray-800/60' : 'border-gray-100 bg-gray-50/60'} px-6 py-5`}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="flex flex-col gap-2 text-sm">
                            {item.pattern && <div><span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Pattern: </span><span>{item.pattern}</span></div>}
                            {item.notes && <div><span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Notes: </span><span>{item.notes}</span></div>}
                            {item.sold && item.sale_date && <div><span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Sold on: </span><span>{item.sale_date}</span></div>}
                            {!item.pattern && !item.notes && !item.sold && <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No additional details.</p>}
                          </div>
                          <div>
                            {screenshotUrl
                              ? <SteamScreenshotEmbed url={screenshotUrl} isDark={isDark} />
                              : <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No screenshot linked.</p>
                            }
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div className="flex flex-col gap-4 max-w-lg">
              <h2 className="text-lg font-bold">CS Settings</h2>

              <div className={`${card} p-5`}>
                <h3 className="font-semibold mb-1">Steam Account</h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Your Steam ID is managed in your <button onClick={() => navigate('/profile/edit')} className="text-orange-400 hover:underline">profile settings</button>. Changes there will sync here automatically.
                </p>
                {settings.steam_id
                  ? <p className="text-xs text-green-400 mt-3">✓ Linked: {settings.steam_id}</p>
                  : <p className={`text-xs mt-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No Steam ID linked yet.</p>
                }
              </div>
            </div>
          )}

        </div>
    </div>
  );
}
