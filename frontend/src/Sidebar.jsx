export default function Sidebar({ 
  currentUser, 
  onLogout, 
  isDark,
  selectedBroker,
  onBrokerChange,
  portfolioActions 
}) {
  const pa = portfolioActions || {};
  
  const sub = `text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`;
  const cardCls = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl`;

  return (
    <div className={`w-64 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border-r flex flex-col h-screen overflow-y-auto`}>
      {/* Header */}
      <div className={`p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'} flex items-center justify-between`}>
        <h2 className="text-lg font-bold">Portfolio</h2>
      </div>

      {/* Import Section */}
      <div className="p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Import</h3>
        
        <div className={`${cardCls} p-4 flex flex-col gap-3`}>
          {/* BROKER SELECTOR */}
          <div>
            <label className={`text-xs font-semibold uppercase tracking-wider block mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Broker (optional)
            </label>
            <select 
              value={selectedBroker}
              onChange={(e) => onBrokerChange(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-sm outline-none ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-gray-50 border-gray-200 text-gray-900'
              }`}
            >
              <option value="auto">Auto-detect</option>
              <option value="montrose">Montrose</option>
              <option value="avanza">Avanza</option>
              <option value="nordnet">Nordnet</option>
            </select>
            <p className={sub + ' mt-1'}>Force specific broker or auto-detect</p>
          </div>

          {/* UPLOAD BUTTON */}
          <label className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl cursor-pointer font-semibold text-sm transition ${
            pa.uploadLoading 
              ? 'opacity-50 cursor-not-allowed bg-gray-700 text-gray-400' 
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}>
            {pa.uploadLoading ? '⏳ Processing…' : pa.uploadStatus ? '↺ Re-upload CSV' : '↑ Upload CSV files'}
            <input 
              type="file" 
              accept=".csv" 
              multiple 
              className="hidden" 
              disabled={pa.uploadLoading} 
              onChange={e => { pa.onUpload(e.target.files); e.target.value = ''; }} 
            />
          </label>
          <p className={sub}>Supports Montrose, Avanza, Nordnet.</p>

          {/* UPLOAD PROGRESS */}
          {pa.uploadProgress && (
            <div className={`rounded-lg px-3 py-2.5 text-sm border ${
              isDark ? 'bg-blue-900/20 border-blue-800/40 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}>
              <div className="flex items-center gap-2">
                <div className="animate-spin">⏳</div>
                <span className="font-medium">{pa.uploadProgress.label}</span>
              </div>
            </div>
          )}

          {/* UPLOAD STATUS */}
          {pa.uploadStatus?.error && (
            <div className="rounded-lg px-3 py-2 text-xs bg-red-900/20 border border-red-800/40 text-red-400">
              ✗ {pa.uploadStatus.error}
            </div>
          )}

          {!pa.uploadProgress && pa.uploadStatus?.results && (
            <div className="flex flex-col gap-1.5">
              {pa.uploadStatus.results.map((r, i) => (
                <div key={i} className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg px-3 py-2 text-xs`}>
                  {r.error ? (
                    <p className="text-red-400">✗ {r.file}: {r.error}</p>
                  ) : (
                    <p><span className="font-bold capitalize">{r.broker}</span> — {r.count} rows</p>
                  )}
                </div>
              ))}
              <p className="text-xs text-green-400 font-semibold">
                +{pa.uploadStatus.newAdded} new · {pa.uploadStatus.total} total
              </p>
            </div>
          )}

          {/* TRANSACTION COUNT */}
          {pa.txCount?.total > 0 && (
            <div className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-xl px-3 py-2.5 flex items-center justify-between`}>
              <div>
                <p className="text-sm font-bold text-green-400">{pa.txCount.trades} trades</p>
                <p className={sub}>{pa.txCount.total} total in history</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-400">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          )}

          {/* SYNC BUTTON */}
          {pa.txCount?.trades > 0 && (
            <>
              <button 
                onClick={pa.onSync} 
                disabled={pa.syncLoading} 
                className={`py-2.5 rounded-xl font-semibold text-sm transition ${
                  pa.syncLoading 
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                    : 'bg-green-700 hover:bg-green-600 text-white'
                }`}
              >
                {pa.syncLoading ? '⏳ Syncing…' : '⟳ Sync Portfolio'}
              </button>
              {pa.syncStatus && (
                <p className={`text-xs ${pa.syncStatus.startsWith('✓') ? 'text-green-400' : sub}`}>
                  {pa.syncStatus}
                </p>
              )}

              <button 
                onClick={pa.onResolve} 
                disabled={pa.resolveLoading} 
                className={`py-2.5 rounded-xl font-semibold text-sm transition ${
                  isDark 
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                } disabled:opacity-50`}
              >
                {pa.resolveLoading ? '⏳ Resolving...' : '🔍 Resolve Tickers'}
              </button>
              {pa.resolveStatus && (
                <p className={`text-xs ${pa.resolveStatus.startsWith('✓') ? 'text-green-400' : sub}`}>
                  {pa.resolveStatus}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Manage Section */}
      {pa.portfolio?.length > 0 && (
        <div className="p-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Manage</h3>
          <div className={`${cardCls} p-4 flex flex-col gap-3`}>
            <div className={`${isDark ? 'bg-gray-700/40' : 'bg-gray-50'} rounded-xl overflow-hidden max-h-60 overflow-y-auto`}>
              {pa.portfolio.map(s => (
                <label key={s.ticker} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition ${
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                } border-b ${isDark ? 'border-gray-700/50' : 'border-gray-100'} last:border-0`}>
                  <input 
                    type="checkbox" 
                    checked={pa.selectedForRemoval?.includes(s.ticker)} 
                    onChange={() => pa.onToggleRemoval(s.ticker)} 
                    className="accent-blue-500" 
                  />
                  <span className="text-sm font-medium">{s.ticker}</span>
                  <span className={`text-xs ml-auto ${sub}`}>{s.quantity} shares</span>
                </label>
              ))}
            </div>
            {pa.selectedForRemoval?.length > 0 && (
              <button 
                onClick={pa.onRemoveSelected} 
                className="py-2.5 rounded-xl font-semibold text-sm bg-orange-600 hover:bg-orange-500 text-white transition"
              >
                Remove {pa.selectedForRemoval.length} selected
              </button>
            )}
            <button 
              onClick={pa.onForceResolve} 
              disabled={pa.resolveLoading} 
              className="py-2.5 rounded-xl font-semibold text-sm bg-purple-700 hover:bg-purple-600 text-white transition disabled:opacity-50"
            >
              {pa.resolveLoading ? '⏳ Re-resolving...' : '🔄 Force Re-Resolve All'}
            </button>
          </div>
        </div>
      )}

      {/* Settings Section */}
      <div className="p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Settings</h3>
        <div className={`${cardCls} p-4 flex flex-col gap-4`}>
          <div>
            <label className={`text-xs font-semibold uppercase tracking-wider mb-2 block ${sub}`}>
              Base Currency
            </label>
            <select 
              value={pa.baseCurrency} 
              onChange={e => pa.onSetBaseCurrency(e.target.value)}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none ${
                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
              }`}
            >
              <option>EUR</option>
              <option>GBP</option>
              <option>SEK</option>
              <option>USD</option>
            </select>
          </div>

          {/* Ticker Overrides */}
          <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-100'} pt-4`}>
            <label className={`text-xs font-semibold uppercase tracking-wider mb-3 block ${sub}`}>
              Ticker Overrides
            </label>
            <p className={`text-xs mb-3 ${sub}`}>Pin an ISIN to a specific Yahoo ticker.</p>
            <div className="flex gap-2 mb-2">
              <input 
                value={pa.overrideIsin} 
                onChange={e => pa.onOverrideIsinChange(e.target.value)} 
                placeholder="ISIN" 
                className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none ${
                  isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'
                }`} 
              />
              <input 
                value={pa.overrideTicker} 
                onChange={e => pa.onOverrideTickerChange(e.target.value)} 
                placeholder="Ticker" 
                className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none ${
                  isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'
                }`} 
              />
            </div>
            <button 
              onClick={pa.onAddOverride} 
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition mb-2"
            >
              Save Override
            </button>
            {pa.overrideMsg && <p className="text-xs text-green-400 mb-2">{pa.overrideMsg}</p>}
            {Object.entries(pa.overrides || {}).length > 0 && (
              <div className="flex flex-col gap-1">
                {Object.entries(pa.overrides).map(([isin, ticker]) => (
                  <div key={isin} className={`flex items-center justify-between ${
                    isDark ? 'bg-gray-700/50' : 'bg-gray-100'
                  } rounded-lg px-3 py-2`}>
                    <span className="text-xs">{isin} → <span className="font-bold">{ticker}</span></span>
                    <button 
                      onClick={() => pa.onDeleteOverride(isin)} 
                      className="text-red-400 hover:text-red-300 text-xs ml-2 transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Change Password */}
          <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-100'} pt-4`}>
            <label className={`text-xs font-semibold uppercase tracking-wider mb-3 block ${sub}`}>
              Change Password
            </label>
            <div className="flex flex-col gap-2">
              <input 
                type="password" 
                value={pa.authForm?.password || ''} 
                onChange={e => pa.onAuthFormChange('password', e.target.value)} 
                placeholder="Current password" 
                className={`px-3 py-2 rounded-lg border text-sm outline-none ${
                  isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'
                }`} 
              />
              <input 
                type="password" 
                value={pa.authForm?.newPassword || ''} 
                onChange={e => pa.onAuthFormChange('newPassword', e.target.value)} 
                placeholder="New password (6+ chars)" 
                className={`px-3 py-2 rounded-lg border text-sm outline-none ${
                  isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'
                }`} 
              />
              {pa.authError && <p className="text-xs text-red-400">{pa.authError}</p>}
              <button 
                onClick={pa.onChangePassword} 
                disabled={pa.authLoading} 
                className="py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
              >
                {pa.authLoading ? 'Saving...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-red-400">Danger Zone</h3>
        <div className={`${cardCls} p-4 flex flex-col gap-3`}>
          <p className={sub}>These actions cannot be undone.</p>
          
          {/* CLEAR ALL DATA */}
          <button 
            onClick={pa.onClearAll}
            className={`py-2.5 rounded-xl font-semibold text-sm border transition ${
              isDark 
                ? 'border-red-800/60 text-red-400 hover:bg-red-900/20' 
                : 'border-red-200 text-red-500 hover:bg-red-50'
            }`}
          >
            Clear All Data
          </button>

          {/* DELETE BY BROKER */}
          {pa.txCount?.byBroker && Object.keys(pa.txCount.byBroker).length > 0 && (
            <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} pt-4 mt-4`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${sub}`}>
                Delete by Broker
              </p>
              <div className="flex flex-col gap-2">
                {Object.entries(pa.txCount.byBroker).map(([broker, count]) => (
                  <button
                    key={broker}
                    onClick={() => pa.onClearBroker(broker)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition ${
                      isDark 
                        ? 'border-orange-800/60 text-orange-400 hover:bg-orange-900/20' 
                        : 'border-orange-200 text-orange-600 hover:bg-orange-50'
                    }`}
                  >
                    Clear {broker.charAt(0).toUpperCase() + broker.slice(1)} ({count})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logout */}
      <div className="p-4 mt-auto">
        <button 
          onClick={onLogout}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition ${
            isDark 
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
          }`}
        >
          Logout
        </button>
      </div>
    </div>
  );
}