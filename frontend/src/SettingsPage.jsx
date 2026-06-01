import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MARKET_INDEXES } from './GlobalBar';

function authHeaders(extra = {}) {
  const token = sessionStorage.getItem('auth_token');
  return { ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...extra };
}

const SYNC_COOLDOWN_MS = 60 * 60 * 1000;

function fmtAgo(ts) {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
}

export default function SettingsPage({ isDark, baseCurrency, onSetBaseCurrency }) {
  const navigate = useNavigate();
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSync, setLastSync] = useState(() => {
    const s = localStorage.getItem('cs_prices_last_sync');
    return s ? parseInt(s, 10) : null;
  });
  const updateLastSync = (ts) => { setLastSync(ts); localStorage.setItem('cs_prices_last_sync', String(ts)); };
  const allIds = MARKET_INDEXES.map(m => m.id);
  const [marketOrder, setMarketOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('marketIndexes')) || [];
      const valid = saved.filter(id => allIds.includes(id));
      return [...valid, ...allIds.filter(id => !valid.includes(id))];
    } catch { return allIds; }
  });
  const [dragging, setDragging] = useState(null);
  const dragOverRef = useRef(null);

  const card = `rounded-2xl border p-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const label = `text-xs font-semibold uppercase tracking-wider mb-2 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`;
  const select = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`;
  const btnOrange = `px-4 py-2 text-sm font-semibold rounded-lg transition bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 disabled:cursor-not-allowed`;

  useEffect(() => {
    fetch('/api/cs/prices/last-sync', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.lastSync) updateLastSync(d.lastSync); })
      .catch(() => {});
  }, []);

  const recentlySynced = lastSync && (Date.now() - lastSync < SYNC_COOLDOWN_MS);
  const cooldownMinsLeft = recentlySynced ? Math.ceil((SYNC_COOLDOWN_MS - (Date.now() - lastSync)) / 60000) : 0;

  const syncPrices = async () => {
    setSyncingPrices(true);
    setSyncStatus('Starting sync...');
    try {
      const res = await fetch('/api/cs/prices/sync', { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!data.success) { setSyncStatus('Failed: ' + data.error); setSyncingPrices(false); return; }

      let secs = 35;
      setSyncStatus(`Syncing in background — done in ~${secs}s`);
      const tick = setInterval(() => {
        secs--;
        if (secs > 0) {
          setSyncStatus(`Syncing in background — done in ~${secs}s`);
        } else {
          clearInterval(tick);
          setSyncingPrices(false);
          setSyncStatus('✓ Sync complete — prices updated');
          updateLastSync(Date.now());
        }
      }, 1000);
    } catch(e) { setSyncStatus('Error: ' + e.message); setSyncingPrices(false); }
  };

  return (
    <div className={`flex-1 overflow-y-auto p-6 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        <div className={card}>
          <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Display</h2>
          <div>
            <label className={label}>Base Currency</label>
            <select
              value={baseCurrency}
              onChange={e => onSetBaseCurrency(e.target.value)}
              className={select}
            >
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="SEK">SEK — Swedish Krona</option>
              <option value="USD">USD — US Dollar</option>
            </select>
            <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Used across Stock Portfolio and CS Skins for value calculations and display.
            </p>
          </div>
        </div>

        <div className={card}>
          <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Market Bar</h2>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            All indexes are always shown in the top bar and scroll automatically. Drag to set your preferred order.
          </p>
          <div className="flex flex-col gap-2">
            {marketOrder.map(id => {
              const idx = MARKET_INDEXES.find(m => m.id === id);
              if (!idx) return null;
              const isDraggingThis = dragging === id;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={e => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnter={() => {
                    if (!dragging || dragging === id) return;
                    dragOverRef.current = id;
                    const from = marketOrder.indexOf(dragging);
                    const to   = marketOrder.indexOf(id);
                    if (from === -1 || to === -1) return;
                    const next = [...marketOrder];
                    next.splice(from, 1);
                    next.splice(to, 0, dragging);
                    setMarketOrder(next);
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDragEnd={() => {
                    setDragging(null);
                    dragOverRef.current = null;
                    localStorage.setItem('marketIndexes', JSON.stringify(marketOrder));
                    window.dispatchEvent(new Event('marketIndexes-updated'));
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border select-none transition ${
                    isDraggingThis ? 'opacity-40' : ''
                  } ${isDark ? 'border-gray-700 bg-gray-750' : 'border-gray-200'}`}
                >
                  <svg className={`shrink-0 cursor-grab ${isDark ? 'text-gray-500' : 'text-gray-400'}`} width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <circle cx="4" cy="3" r="1.3"/><circle cx="10" cy="3" r="1.3"/>
                    <circle cx="4" cy="7" r="1.3"/><circle cx="10" cy="7" r="1.3"/>
                    <circle cx="4" cy="11" r="1.3"/><circle cx="10" cy="11" r="1.3"/>
                  </svg>
                  <img src={`https://flagcdn.com/${idx.country}.svg`} alt={idx.country} className="w-5 h-3.5 object-cover rounded-sm shrink-0" />
                  <span className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{idx.label}</span>
                  <span className={`ml-auto text-xs font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{idx.ticker}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={card}>
          <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>CS Item Prices</h2>
          <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Prices are sourced from Skinport and Steam Market, updated automatically every 24 hours.
            Use the button below to trigger a manual sync.
          </p>
          {lastSync && (
            <p className={`text-xs mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Last synced: {fmtAgo(lastSync)}
              {recentlySynced && ` — sync available again in ${cooldownMinsLeft}m`}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button onClick={syncPrices} disabled={syncingPrices || recentlySynced} className={btnOrange}>
              {syncingPrices ? '⏳ Syncing...' : '↺ Sync Prices Now'}
            </button>
          </div>
          {syncStatus && (
            <p className={`text-xs mt-3 ${syncStatus.startsWith('✓') ? 'text-green-400' : 'text-orange-400'}`}>
              {syncStatus}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
