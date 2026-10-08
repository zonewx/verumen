import { useState, useEffect, useCallback } from 'react';
import apiCache from './apiCache';
import { getToken } from './tokenStore';
import { card, input, btnSecondarySm } from './ui';
import { IconRefresh, IconSearch } from './icons';

// Readable names for the actions the server records. Unknown actions fall back to the raw name.
const ACTIONS = {
  'delete-user':         { label: 'Deleted user',            tone: 'danger' },
  'reset-password':      { label: 'Reset password',          tone: 'account' },
  'send-reset-email':    { label: 'Sent password reset link', tone: 'account' },
  'set-email':           { label: 'Changed email',           tone: 'account' },
  'clear-bio':           { label: 'Cleared bio',             tone: 'content' },
  'post-announcement':   { label: 'Posted announcement',     tone: 'content' },
  'delete-announcement': { label: 'Deleted announcement',    tone: 'content' },
  'update-setting':      { label: 'Changed site setting',    tone: 'role' },
};
const TONE_DOT = { danger: 'bg-red-400', account: 'bg-amber-400', role: 'bg-sky-400', content: 'bg-zinc-400' };

function describe(action) {
  // Role changes are stored as e.g. "set-role:moderator" / "set-role-admin:admin"
  const roleMatch = /^set-role(?:-admin)?:(\w+)$/.exec(action || '');
  if (roleMatch) return { label: `Set role to ${roleMatch[1]}`, tone: 'role' };
  return ACTIONS[action] || { label: action || 'Unknown action', tone: 'content' };
}

// `now` is when the log was last loaded, so rendering stays pure
function timeAgo(date, now) {
  const s = Math.round((now - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

async function requestLog() {
  const token = getToken();
  const res = await fetch('/api/mod/log', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json();
  if (!res.ok || !Array.isArray(data)) throw new Error(data?.error || 'Could not load the log.');
  return data;
}

// Shared by the admin and moderator panels: who did what, to whom, and when.
export default function ModLog() {
  const [entries, setEntries] = useState(() => apiCache.get('/api/mod/log'));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);

  // Applies a finished request to state — only ever called from promise callbacks
  const receive = useCallback(data => {
    apiCache.set('/api/mod/log', data);
    setEntries(data);
    setLoadedAt(Date.now());
    setError('');
    setLoading(false);
  }, []);
  const fail = useCallback(e => {
    setError(e.message || 'Could not load the log.');
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true; // ignore a response that arrives after the tab was closed
    requestLog().then(d => active && receive(d), e => active && fail(e));
    return () => { active = false; };
  }, [receive, fail]);

  const refresh = () => {
    setLoading(true);
    requestLog().then(receive, fail);
  };

  const q = query.trim().toLowerCase();
  const rows = (entries || []).filter(e => !q || [e.moderator, e.targetUser, e.details, e.action, describe(e.action).label]
    .some(v => String(v || '').toLowerCase().includes(q)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"><IconSearch size={14} /></span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by user, action or details…" className={`${input} pl-9`} />
        </div>
        <p className="text-xs text-zinc-400">
          {entries ? `${rows.length}${q ? ` of ${entries.length}` : ''} entr${rows.length === 1 ? 'y' : 'ies'}` : ''}
        </p>
        <button onClick={refresh} disabled={loading} className={`${btnSecondarySm} inline-flex items-center gap-1.5 ml-auto`}>
          <IconRefresh size={12} className={loading ? 'animate-spin' : ''} />Refresh
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 border-b border-zinc-700">
              <tr>
                {['When', 'By', 'Action', 'Target', 'Details'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries === null || (loading && !entries.length) ? (
                <tr><td colSpan="5" className="px-4 py-10 text-center"><span className="inline-block w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="5" className="px-4 py-10 text-center text-sm text-zinc-400">{q ? 'No entries match your search.' : 'No staff actions logged yet.'}</td></tr>
              ) : rows.map((e, i) => {
                const { label, tone } = describe(e.action);
                const when = e.createdAt ? new Date(e.createdAt) : null;
                const valid = when && !isNaN(when);
                return (
                  <tr key={e.id ?? i} className="border-t border-zinc-700 hover:bg-zinc-700/20 align-top">
                    <td className="px-4 py-3 text-xs whitespace-nowrap" title={valid ? when.toLocaleString() : ''}>
                      <span className="text-zinc-200">{valid ? (loadedAt ? timeAgo(when, loadedAt) : when.toLocaleDateString()) : '—'}</span>
                      {valid && <span className="block text-zinc-500 font-mono mt-0.5">{when.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-sky-400 whitespace-nowrap">{e.moderator || '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-200 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} />{label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-zinc-300 whitespace-nowrap">{e.targetUser && e.targetUser !== '-' ? e.targetUser : '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400 break-words min-w-40">{e.details || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-zinc-500">Shows the most recent 200 staff actions.</p>
    </div>
  );
}
