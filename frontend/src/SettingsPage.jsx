export default function SettingsPage({ baseCurrency, onSetBaseCurrency }) {
  return (
    <div className={`flex-1 min-h-0 overflow-y-auto p-6 bg-zinc-900 text-white`}>
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-zinc-400">Nothing to configure here yet.</p>
      </div>
    </div>
  );
}
