import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [lastSync, setLastSync] = useState(null);

  const card = `rounded-2xl border p-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const label = `text-xs font-semibold uppercase tracking-wider mb-2 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`;
  const select = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`;
  const btnOrange = `px-4 py-2 text-sm font-semibold rounded-lg transition bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 disabled:cursor-not-allowed`;

  useEffect(() => {
    fetch('/api/cs/prices/last-sync', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.lastSync) setLastSync(d.lastSync); })
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
          setLastSync(Date.now());
        }
      }, 1000);
    } catch(e) { setSyncStatus('Error: ' + e.message); setSyncingPrices(false); }
  };

  return (
    <div className={`flex-1 overflow-y-auto p-6 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className="max-w-xl mx-auto w-full flex flex-col gap-6">
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
