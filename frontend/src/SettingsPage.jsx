export default function SettingsPage({ isDark, baseCurrency, onSetBaseCurrency }) {
  const card = `rounded-2xl border p-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const label = `text-xs font-semibold uppercase tracking-wider mb-2 block ${isDark ? 'text-gray-400' : 'text-gray-500'}`;
  const select = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`;

  return (
    <div className={`flex-1 overflow-y-auto p-6 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className="max-w-xl flex flex-col gap-6">
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
      </div>
    </div>
  );
}
