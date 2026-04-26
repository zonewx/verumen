import { useState, useEffect, useCallback } from 'react';

const EXTERIORS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
const CURRENCIES = ['SEK', 'USD', 'EUR'];

function fmt(n) { return (n || 0).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtSEK(n) { return `${fmt(n)} kr`; }

export default function CSSkins({ isDark, onBack, authUsername }) {
  const [tab, setTab] = useState('overview');
  const [settings, setSettings] = useState({});
  const [steamId, setSteamId] = useState('');
  const [steamInventory, setSteamInventory] = useState(null);
  const [steamLoading, setSteamLoading] = useState(false);
  const [steamError, setSteamError] = useState('');
  const [inventory, setInventory] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [pricesReady, setPricesReady] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSellForm, setShowSellForm] = useState(null);
  const [skinSearch, setSkinSearch] = useState('');
  const [skinSearchResults, setSkinSearchResults] = useState([]);
  const [filterSold, setFilterSold] = useState('all');
  const [addForm, setAddForm] = useState({
    skin_name: '', exterior: 'Factory New', float_value: '', pattern: '',
    purchase_price: '', purchase_currency: 'SEK', purchase_date: new Date().toISOString().split('T')[0], notes: ''
  });
  const [sellForm, setSellForm] = useState({
    sale_price: '', sale_currency: 'SEK', sale_date: new Date().toISOString().split('T')[0], notes: ''
  });

  const card = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;
  const input = `w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const label = `text-xs font-semibold uppercase tracking-wider block mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`;
  const btn = `px-4 py-2 text-sm font-semibold rounded-lg transition`;
  const btnOrange = `${btn} bg-orange-600 hover:bg-orange-500 text-white`;
  const btnGhost = `${btn} ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`;

  const fetchAll = useCallback(async () => {
    try {
      const [inv, p, s] = await Promise.all([
        fetch('/api/cs/inventory').then(r => r.json()),
        fetch('/api/cs/pnl').then(r => r.json()),
        fetch('/api/cs/settings').then(r => r.json()),
      ]);
      setInventory(Array.isArray(inv) ? inv : []);
      setPnl(p);
      setSettings(s);
      setSteamId(s.steam_id || '');
      // Check if prices are loaded
      const priceCheck = await fetch('/api/cs/prices/search/AK-47').then(r => r.json());
      setPricesReady(Array.isArray(priceCheck) && priceCheck.length > 0);
    } catch(e) { console.error(e); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const syncPrices = async () => {
    setSyncingPrices(true);
    setSyncStatus('Downloading CS item prices (~30 sec)...');
    try {
      const res = await fetch('/api/cs/prices/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncStatus(`✓ Synced ${data.count.toLocaleString()} items (${data.source})${data.note ? ' — ' + data.note : ''} at ${data.sekRate?.toFixed(2)} SEK/USD`);
        setPricesReady(true);
        await fetchAll();
      } else setSyncStatus('Failed: ' + data.error);
    } catch(e) { setSyncStatus('Error: ' + e.message); }
    setSyncingPrices(false);
  };

  const saveSteamId = async () => {
    await fetch('/api/cs/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'steam_id', value: steamId }) });
    setSettings(s => ({ ...s, steam_id: steamId }));
  };

  const fetchSteamInventory = async () => {
    const id = settings.steam_id || steamId;
    if (!id) { setSteamError('Enter your Steam ID first'); return; }
    setSteamLoading(true); setSteamError('');
    try {
      const res = await fetch(`/api/cs/steam/inventory/${id}`);
      const data = await res.json();
      if (!res.ok) { setSteamError(data.error || 'Failed to fetch inventory'); }
      else setSteamInventory(data);
    } catch(e) { setSteamError('Network error: ' + e.message); }
    setSteamLoading(false);
  };

  const searchSkins = async (q) => {
    if (q.length < 2) { setSkinSearchResults([]); return; }
    try {
      const res = await fetch(`/api/cs/prices/search/${encodeURIComponent(q)}`);
      setSkinSearchResults(await res.json());
    } catch(e) {}
  };

  const addItem = async () => {
    if (!addForm.skin_name || !addForm.purchase_price || !addForm.purchase_date) return;
    await fetch('/api/cs/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addForm) });
    setShowAddForm(false);
    setAddForm({ skin_name: '', exterior: 'Factory New', float_value: '', pattern: '', purchase_price: '', purchase_currency: 'SEK', purchase_date: new Date().toISOString().split('T')[0], notes: '' });
    setSkinSearchResults([]);
    setSkinSearch('');
    await fetchAll();
  };

  const sellItem = async (id) => {
    if (!sellForm.sale_price || !sellForm.sale_date) return;
    await fetch(`/api/cs/inventory/${id}/sell`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sellForm) });
    setShowSellForm(null);
    setSellForm({ sale_price: '', sale_currency: 'SEK', sale_date: new Date().toISOString().split('T')[0], notes: '' });
    await fetchAll();
  };

  const deleteItem = async (id) => {
    if (!confirm('Remove this skin from your tracker?')) return;
    await fetch(`/api/cs/inventory/${id}`, { method: 'DELETE' });
    await fetchAll();
  };

  const filteredInv = inventory.filter(i => {
    if (filterSold === 'active') return !i.sold;
    if (filterSold === 'sold') return i.sold;
    return true;
  });

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'inventory', label: 'My Inventory' },
    { id: 'tracker', label: 'Skin Tracker' },
    { id: 'settings', label: 'Settings' },
  ];

  const PnlCard = ({ label, value, positive, sub }) => (
    <div className={`${card} p-5`}>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-2xl font-bold ${positive === undefined ? '' : positive ? 'text-green-400' : 'text-red-400'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  );

  return (
    <div className={`flex flex-col h-screen ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      {/* Header */}
      <div className={`flex items-center gap-4 px-8 py-4 border-b ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} shrink-0`}>
        <button onClick={onBack} className={`p-1.5 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition`} title="Back to home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center text-white text-sm font-bold">CS</div>
          <span className="text-lg font-bold tracking-tight">CS Skins</span>
        </div>
        <div className={`flex gap-0 border-b-0 ml-6`}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold transition border-b-2 ${tab === t.id ? 'border-orange-500 text-orange-400' : `border-transparent ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}`}>
              {t.label}
            </button>
          ))}
        </div>
        {!pricesReady && (
          <button onClick={syncPrices} disabled={syncingPrices} className={`ml-auto text-xs px-3 py-1.5 rounded-lg font-semibold transition ${syncingPrices ? 'opacity-50 cursor-not-allowed bg-orange-900 text-orange-300' : 'bg-orange-600 hover:bg-orange-500 text-white'}`}>
            {syncingPrices ? '⏳ Syncing prices...' : '⚡ Sync CS Prices'}
          </button>
        )}
        {syncStatus && <p className={`ml-auto text-xs ${syncStatus.startsWith('✓') ? 'text-green-400' : 'text-orange-400'}`}>{syncStatus}</p>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="flex flex-col gap-6">
              {!pricesReady && (
                <div className={`${card} p-5 border-orange-600/40`}>
                  <div className="flex items-start gap-4">
                    <div className="text-2xl">⚡</div>
                    <div>
                      <p className="font-semibold mb-1">Sync CS item prices to get started</p>
                      <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Downloads current Steam Market prices for all CS items (~30 seconds). Only needed once — prices update daily.</p>
                      <button onClick={syncPrices} disabled={syncingPrices} className={btnOrange}>{syncingPrices ? '⏳ Syncing...' : 'Sync Prices Now'}</button>
                    </div>
                  </div>
                </div>
              )}

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

              {/* Steam inventory preview */}
              {settings.steam_id && (
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Steam Inventory</h3>
                    <button onClick={fetchSteamInventory} disabled={steamLoading} className={btnOrange}>
                      {steamLoading ? '⏳ Loading...' : '↺ Fetch Inventory'}
                    </button>
                  </div>
                  {steamError && <p className="text-red-400 text-sm">{steamError}</p>}
                  {steamInventory && (
                    <div>
                      <div className="flex gap-6 mb-4">
                        <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Items</p><p className="text-xl font-bold">{steamInventory.count}</p></div>
                        <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Est. Value</p><p className="text-xl font-bold text-green-400">{fmtSEK(steamInventory.totalValue)}</p></div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-72 overflow-y-auto">
                        {steamInventory.items.slice(0, 24).map((item, i) => (
                          <div key={i} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-2 text-center`}>
                            {item.iconUrl && <img src={item.iconUrl} alt={item.name} className="w-full h-16 object-contain mb-1" />}
                            <p className="text-xs font-medium truncate" title={item.name}>{item.name}</p>
                            {item.priceSEK > 0 && <p className="text-xs text-green-400 font-bold">{fmtSEK(item.priceSEK)}</p>}
                          </div>
                        ))}
                      </div>
                      {steamInventory.items.length > 24 && <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>+{steamInventory.items.length - 24} more items</p>}
                    </div>
                  )}
                  {!steamInventory && !steamLoading && !steamError && (
                    <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Click "Fetch Inventory" to load your Steam CS inventory.</p>
                  )}
                </div>
              )}

              {!settings.steam_id && (
                <div className={`${card} p-5`}>
                  <p className="font-semibold mb-1">Connect your Steam account</p>
                  <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Add your Steam ID in Settings to automatically fetch your CS inventory value.</p>
                  <button onClick={() => setTab('settings')} className={btnGhost}>Go to Settings →</button>
                </div>
              )}
            </div>
          )}

          {/* STEAM INVENTORY TAB */}
          {tab === 'inventory' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Steam Inventory</h2>
                <button onClick={fetchSteamInventory} disabled={steamLoading || !settings.steam_id} className={btnOrange}>
                  {steamLoading ? '⏳ Fetching...' : '↺ Refresh'}
                </button>
              </div>
              {!settings.steam_id && (
                <div className={`${card} p-6 text-center`}>
                  <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Set your Steam ID in Settings first.</p>
                  <button onClick={() => setTab('settings')} className={btnOrange}>Go to Settings</button>
                </div>
              )}
              {steamError && <div className={`${card} p-4`}><p className="text-red-400 text-sm">{steamError}</p></div>}
              {steamInventory && (
                <>
                  <div className={`${card} p-4 flex gap-6`}>
                    <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Total items</p><p className="text-2xl font-bold">{steamInventory.count}</p></div>
                    <div><p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} mb-1`}>Estimated value</p><p className="text-2xl font-bold text-green-400">{fmtSEK(steamInventory.totalValue)}</p></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {steamInventory.items.map((item, i) => (
                      <div key={i} className={`${card} p-3`}>
                        {item.iconUrl && <img src={item.iconUrl} alt={item.name} className="w-full h-20 object-contain mb-2" />}
                        <p className="text-xs font-semibold leading-tight mb-1" title={item.name}>{item.name}</p>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.type}</p>
                        {item.priceSEK > 0 && <p className="text-sm font-bold text-green-400 mt-1">{fmtSEK(item.priceSEK)}</p>}
                        {!item.tradable && <span className="text-xs text-yellow-500">Not tradable</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!steamInventory && !steamLoading && settings.steam_id && (
                <div className={`${card} p-6 text-center`}>
                  <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Your Steam inventory is not loaded yet.</p>
                  <button onClick={fetchSteamInventory} className={btnOrange}>Fetch Inventory</button>
                </div>
              )}
            </div>
          )}

          {/* SKIN TRACKER */}
          {tab === 'tracker' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Skin Tracker</h2>
                <button onClick={() => setShowAddForm(true)} className={btnOrange}>+ Add Skin</button>
              </div>

              {/* Filter */}
              <div className="flex gap-2">
                {[['all','All'],['active','Holding'],['sold','Sold']].map(([v, l]) => (
                  <button key={v} onClick={() => setFilterSold(v)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${filterSold === v ? 'bg-orange-600 text-white' : `${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}`}>{l}</button>
                ))}
                <span className={`ml-auto text-xs self-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{filteredInv.length} items</span>
              </div>

              {/* Add form */}
              {showAddForm && (
                <div className={`${card} p-5`}>
                  <h3 className="font-bold mb-4">Add skin to tracker</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 relative">
                      <label className={label}>Skin name</label>
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
                      <label className={label}>Purchase price</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.01" value={addForm.purchase_price} onChange={e => setAddForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" className={input} />
                        <select value={addForm.purchase_currency} onChange={e => setAddForm(f => ({ ...f, purchase_currency: e.target.value }))} className={`${input} w-24`}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={label}>Purchase date</label>
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
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button onClick={addItem} className={btnOrange}>Add to Tracker</button>
                    <button onClick={() => { setShowAddForm(false); setSkinSearchResults([]); setSkinSearch(''); }} className={btnGhost}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Sell form */}
              {showSellForm && (
                <div className={`${card} p-5 border-red-600/30`}>
                  <h3 className="font-bold mb-1">Mark as sold</h3>
                  <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{showSellForm.skin_name}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={label}>Sale price</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.01" value={sellForm.sale_price} onChange={e => setSellForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="0.00" className={input} />
                        <select value={sellForm.sale_currency} onChange={e => setSellForm(f => ({ ...f, sale_currency: e.target.value }))} className={`${input} w-24`}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={label}>Sale date</label>
                      <input type="date" value={sellForm.sale_date} onChange={e => setSellForm(f => ({ ...f, sale_date: e.target.value }))} className={input} />
                    </div>
                    <div className="col-span-2">
                      <label className={label}>Notes</label>
                      <input value={sellForm.notes} onChange={e => setSellForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={input} />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => sellItem(showSellForm.id)} className={`${btn} bg-red-600 hover:bg-red-500 text-white`}>Confirm Sale</button>
                    <button onClick={() => setShowSellForm(null)} className={btnGhost}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Inventory table */}
              {filteredInv.length === 0 ? (
                <div className={`${card} p-10 text-center`}>
                  <p className="text-3xl mb-3">🔫</p>
                  <p className="font-semibold mb-1">No skins tracked yet</p>
                  <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Add skins you've bought to track their value and P&L over time.</p>
                  <button onClick={() => setShowAddForm(true)} className={btnOrange}>+ Add First Skin</button>
                </div>
              ) : (
                <div className={`${card} overflow-hidden`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={`${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
                        <tr>
                          {['Skin', 'Exterior', 'Float', 'Bought', 'Buy Price', 'Current', 'P&L', 'Status', ''].map(h => (
                            <th key={h} className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-400'} whitespace-nowrap`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInv.map(item => {
                          const currentSEK = item.current_price_sek || 0;
                          const buySEK = item.purchase_price;
                          const pnlVal = item.sold ? (item.sale_price - buySEK) : (currentSEK - buySEK);
                          const pnlPos = pnlVal >= 0;
                          return (
                            <tr key={item.id} className={`border-t ${isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-gray-50'} transition`}>
                              <td className="px-4 py-3 font-semibold max-w-xs truncate">{item.skin_name}</td>
                              <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} whitespace-nowrap`}>{item.exterior || '—'}</td>
                              <td className={`px-4 py-3 text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.float_value ? parseFloat(item.float_value).toFixed(4) : '—'}</td>
                              <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.purchase_date}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{fmtSEK(buySEK)}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                                {item.sold ? <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{fmtSEK(item.sale_price)}</span> : (currentSEK > 0 ? fmtSEK(currentSEK) : '—')}
                              </td>
                              <td className={`px-4 py-3 font-bold whitespace-nowrap text-xs ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                                {pnlPos ? '+' : ''}{fmtSEK(pnlVal)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.sold ? `${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}` : 'bg-green-900/40 text-green-400'}`}>
                                  {item.sold ? 'Sold' : 'Holding'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1">
                                  {!item.sold && <button onClick={() => setShowSellForm(item)} className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60' : 'bg-red-50 text-red-600 hover:bg-red-100'} transition`}>Sell</button>}
                                  <button onClick={() => deleteItem(item.id)} className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} transition`}>✕</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Your Steam ID is used to fetch your CS inventory. Make sure your inventory is set to <strong>Public</strong> in Steam privacy settings.
                  <br /><br />
                  To find your Steam ID: go to <strong>steamcommunity.com</strong>, open your profile, and copy the number from the URL (e.g. 76561198xxxxxxxxx).
                </p>
                <label className={label}>Steam ID</label>
                <input value={steamId} onChange={e => setSteamId(e.target.value)} placeholder="76561198xxxxxxxxx" className={`${input} mb-3`} />
                <button onClick={saveSteamId} className={btnOrange}>Save Steam ID</button>
                {settings.steam_id && <p className="text-xs text-green-400 mt-2">✓ Saved: {settings.steam_id}</p>}
              </div>

              <div className={`${card} p-5`}>
                <h3 className="font-semibold mb-1">Price Database</h3>
                <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Prices are sourced from <strong>csgotrader.app</strong> — a free community price database updated daily with Steam Market prices.
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={syncPrices} disabled={syncingPrices} className={btnOrange}>
                    {syncingPrices ? '⏳ Syncing...' : '↺ Sync Prices Now'}
                  </button>
                  {pricesReady && <span className="text-xs text-green-400">✓ Prices loaded</span>}
                </div>
                {syncStatus && <p className={`text-xs mt-2 ${syncStatus.startsWith('✓') ? 'text-green-400' : 'text-orange-400'}`}>{syncStatus}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
