import { useState } from 'react';

export default function PortfolioSidebar({
  isDark, isSidebarOpen, authUsername, portfolio, txCount,
  uploadStatus, uploadLoading, syncStatus, syncLoading,
  resolveLoading, resolveStatus, selectedForRemoval,
  baseCurrency, overrides, overrideMsg, showChangePassword,
  authForm, authError, authLoading,
  onUpload, onSync, onResolve, onClearTransactions,
  onToggleRemoval, onRemoveSelected, onClearPortfolio,
  onSetBaseCurrency, onToggleDark, onShowChangePassword,
  onHideChangePassword, onChangePassword, onAuthFormChange,
  onAddOverride, onDeleteOverride, onNavigateHome,
  overrideIsin, overrideTicker, onOverrideIsinChange, onOverrideTicerChange,
}) {
  const [sections, setSections] = useState({ import: true, manage: false, settings: false, danger: false });
  const toggle = key => setSections(p => ({ ...p, [key]: !p[key] }));

  const s = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const txt = isDark ? 'text-gray-300' : 'text-gray-700';
  const sub = isDark ? 'text-gray-500' : 'text-gray-400';
  const input = `w-full px-3 py-2 rounded-lg border text-xs outline-none transition focus:ring-2 focus:ring-blue-500/20 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`;
  const rowBtn = `w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition text-left ${isDark ? `${txt} hover:bg-gray-700/60` : `${txt} hover:bg-gray-100`}`;
  const actionBtn = `w-full py-2.5 px-3 rounded-xl text-sm font-semibold transition text-center`;

  const SectionHeader = ({ skey, label, icon }) => (
    <button onClick={() => toggle(skey)} className={rowBtn}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`shrink-0 ${sub}`}>{icon}</svg>
      <span className="flex-1 font-semibold">{label}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`shrink-0 ${sub} transition-transform duration-200 ${sections[skey] ? '' : '-rotate-90'}`}>
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </button>
  );

  const Divider = () => <div className={`my-1 border-t ${isDark ? 'border-gray-700/60' : 'border-gray-100'}`} />;

  return (
    <div className={`w-68 shrink-0 ${s} border-r flex flex-col overflow-hidden transition-all duration-300 ${isSidebarOpen ? '' : '-ml-68'}`}
      style={{ width: isSidebarOpen ? '17rem' : '0', minWidth: isSidebarOpen ? '17rem' : '0' }}>

      {/* Logo area */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b ${isDark ? 'border-gray-700/60' : 'border-gray-100'} shrink-0`}>
        <button onClick={onNavigateHome} className="flex items-center gap-2.5 hover:opacity-75 transition flex-1 min-w-0">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none" className="shrink-0">
            <rect width="28" height="28" rx="6" fill="#0f1e3c"/>
            <path d="M6 18l4-5 4 3 4-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">Statera</p>
            <p className={`text-xs truncate ${sub}`}>{authUsername}</p>
          </div>
        </button>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">

        {/* ── Import CSV ── */}
        <SectionHeader skey="import" label="Import CSV"
          icon={<><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 12l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/></>} />

        {sections.import && (
          <div className="px-2 pb-3 pt-1 flex flex-col gap-3">
            <label className={`${actionBtn} cursor-pointer ring-1 ${uploadLoading ? `ring-gray-600 ${isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'} cursor-not-allowed` : 'ring-blue-600 bg-blue-600 hover:bg-blue-500 text-white'}`}>
              {uploadLoading ? '⏳ Processing…' : uploadStatus ? '↺ Re-upload CSV' : '↑ Upload CSV files'}
              <input type="file" accept=".csv" multiple className="hidden" disabled={uploadLoading} onChange={e => { onUpload(e.target.files); e.target.value = ''; }} />
            </label>

            <p className={`text-xs ${sub} px-1`}>Broker detected automatically. Supports Montrose, Avanza and Nordnet.</p>

            {uploadStatus?.error && (
              <div className={`rounded-lg px-3 py-2 text-xs bg-red-900/20 border border-red-800/40 text-red-400`}>✗ {uploadStatus.error}</div>
            )}

            {uploadStatus?.results && (
              <div className="flex flex-col gap-1.5">
                {uploadStatus.results.map((r, i) => (
                  <div key={i} className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg px-3 py-2 text-xs`}>
                    {r.error
                      ? <p className="text-red-400">✗ {r.file}: {r.error}</p>
                      : <p className={isDark ? 'text-gray-300' : 'text-gray-600'}><span className="font-bold capitalize">{r.broker}</span> — {r.count} rows</p>}
                  </div>
                ))}
                <p className="text-xs text-green-400 font-semibold px-1">+{uploadStatus.newAdded} new · {uploadStatus.total} total</p>
              </div>
            )}

            {txCount.total > 0 && (
              <div className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-xl px-3 py-2.5 flex items-center justify-between`}>
                <div>
                  <p className="text-sm font-bold text-green-400">{txCount.trades} trades</p>
                  <p className={`text-xs ${sub}`}>{txCount.total} total in history</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-400"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            )}

            {txCount.trades > 0 && (
              <button onClick={onSync} disabled={syncLoading}
                className={`${actionBtn} ${syncLoading ? `${isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'}` : 'bg-green-700 hover:bg-green-600 text-white'} disabled:cursor-not-allowed`}>
                {syncLoading ? '⏳ Syncing…' : '⟳ Sync Portfolio'}
              </button>
            )}

            {syncStatus && (
              <p className={`text-xs px-1 ${syncStatus.startsWith('✓') ? 'text-green-400' : sub}`}>{syncStatus}</p>
            )}

            {txCount.trades > 0 && (
              <button onClick={onResolve} disabled={resolveLoading}
                className={`${actionBtn} ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50`}>
                {resolveLoading ? '⏳ Resolving...' : '🔍 Resolve Tickers'}
              </button>
            )}

            {resolveStatus && (
              <p className={`text-xs px-1 ${resolveStatus.startsWith('✓') ? 'text-green-400' : sub}`}>{resolveStatus}</p>
            )}
          </div>
        )}

        <Divider />

        {/* ── Manage Portfolio ── */}
        <SectionHeader skey="manage" label="Manage Holdings"
          icon={<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6" strokeLinecap="round"/></>} />

        {sections.manage && (
          <div className="px-2 pb-3 pt-1 flex flex-col gap-3">
            {portfolio.length === 0 ? (
              <p className={`text-xs ${sub} px-1`}>No holdings synced yet.</p>
            ) : (
              <>
                <div className={`${isDark ? 'bg-gray-700/40' : 'bg-gray-50'} rounded-xl overflow-hidden max-h-52 overflow-y-auto`}>
                  {portfolio.map(s => (
                    <label key={s.ticker} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} border-b ${isDark ? 'border-gray-700/50' : 'border-gray-100'} last:border-0`}>
                      <input type="checkbox" checked={selectedForRemoval.includes(s.ticker)} onChange={() => onToggleRemoval(s.ticker)} className="accent-blue-500" />
                      <span className="text-sm font-medium">{s.ticker}</span>
                      <span className={`text-xs ${sub} ml-auto`}>{s.quantity}</span>
                    </label>
                  ))}
                </div>
                {selectedForRemoval.length > 0 && (
                  <button onClick={onRemoveSelected} className={`${actionBtn} bg-orange-600 hover:bg-orange-500 text-white`}>
                    Remove {selectedForRemoval.length} selected
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <Divider />

        {/* ── Settings ── */}
        <SectionHeader skey="settings" label="Settings"
          icon={<><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>} />

        {sections.settings && (
          <div className="px-2 pb-3 pt-1 flex flex-col gap-3">
            {/* Currency */}
            <div>
              <label className={`text-xs font-semibold uppercase tracking-wider ${sub} block mb-1.5 px-1`}>Base Currency</label>
              <select value={baseCurrency} onChange={e => onSetBaseCurrency(e.target.value)}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}>
                <option>EUR</option><option>GBP</option><option>SEK</option><option>USD</option>
              </select>
            </div>

            {/* Theme */}
            <button onClick={onToggleDark}
              className={`${actionBtn} ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} flex items-center justify-center gap-2`}>
              <span>{isDark ? '☀️' : '🌙'}</span>
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>

            {/* Change password */}
            {!showChangePassword ? (
              <button onClick={onShowChangePassword}
                className={`${actionBtn} ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                🔑 Change Password
              </button>
            ) : (
              <div className={`${isDark ? 'bg-gray-700/40' : 'bg-gray-50'} rounded-xl p-3 flex flex-col gap-2`}>
                <p className={`text-xs font-semibold uppercase tracking-wider ${sub}`}>Change Password</p>
                <input type="password" value={authForm.password} onChange={e => onAuthFormChange('password', e.target.value)} placeholder="Current password" className={input} />
                <input type="password" value={authForm.newPassword} onChange={e => onAuthFormChange('newPassword', e.target.value)} placeholder="New password (6+ chars)" className={input} />
                {authError && <p className="text-xs text-red-400">{authError}</p>}
                <div className="flex gap-2">
                  <button onClick={onChangePassword} disabled={authLoading} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50">Save</button>
                  <button onClick={onHideChangePassword} className={`flex-1 py-2 ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg text-xs font-bold transition`}>Cancel</button>
                </div>
              </div>
            )}

            {/* Ticker overrides */}
            <div className={`border-t ${isDark ? 'border-gray-700/60' : 'border-gray-100'} pt-3`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${sub} mb-2 px-1`}>Ticker Overrides</p>
              <p className={`text-xs ${sub} mb-2.5 px-1`}>Pin an ISIN to a specific Yahoo ticker. Takes effect on next upload.</p>
              <div className="flex gap-2 mb-2">
                <input value={overrideIsin} onChange={e => onOverrideIsinChange(e.target.value)} placeholder="ISIN" className={input} />
                <input value={overrideTicker} onChange={e => onOverrideTicerChange(e.target.value)} placeholder="Ticker" className={input} />
              </div>
              <button onClick={onAddOverride} className={`${actionBtn} bg-blue-600 hover:bg-blue-500 text-white mb-2`}>Save Override</button>
              {overrideMsg && <p className="text-xs text-green-400 px-1 mb-2">{overrideMsg}</p>}
              {Object.entries(overrides).length > 0 && (
                <div className="flex flex-col gap-1">
                  {Object.entries(overrides).map(([isin, ticker]) => (
                    <div key={isin} className={`flex items-center justify-between ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'} rounded-lg px-3 py-2`}>
                      <span className="text-xs">{isin} → <span className="font-bold">{ticker}</span></span>
                      <button onClick={() => onDeleteOverride(isin)} className="text-red-400 hover:text-red-300 text-xs ml-2 transition">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <Divider />

        {/* ── Danger Zone ── */}
        <SectionHeader skey="danger" label="Danger Zone"
          icon={<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>} />

        {sections.danger && (
          <div className="px-2 pb-3 pt-1 flex flex-col gap-2">
            <p className={`text-xs ${sub} px-1`}>These actions cannot be undone.</p>
            <button onClick={onClearPortfolio} className={`${actionBtn} border ${isDark ? 'border-red-800/60 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
              Clear Portfolio
            </button>
            {txCount.total > 0 && (
              <button onClick={onClearTransactions} className={`${actionBtn} border ${isDark ? 'border-red-800/60 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
                Clear Transaction History
              </button>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}
