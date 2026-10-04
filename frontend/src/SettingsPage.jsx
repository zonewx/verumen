import { useState, useEffect, useCallback } from 'react';
import { getToken } from './tokenStore';
import { card, input, label, btnConfirm } from './ui';

const authHeaders = () => {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

function Section({ title, desc, children }) {
  return (
    <div className={`${card} p-6`}>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {desc && <p className="text-xs text-zinc-400 mt-1 mb-5">{desc}</p>}
      {children}
    </div>
  );
}

function Status({ msg }) {
  if (!msg) return null;
  return <p className={`text-xs mt-3 font-medium ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>;
}

function UsernameSection({ authUsername }) {
  const [newUsername, setNewUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  // Root status comes from the server (decided by account id, not by name)
  const [isRootAdmin, setIsRootAdmin] = useState(false);
  useEffect(() => {
    fetch('/api/auth/me', { headers: authHeaders() }).then(r => r.json()).then(d => setIsRootAdmin(!!d.isRootAdmin)).catch(() => {});
  }, []);

  const submit = async () => {
    const name = newUsername.trim();
    if (!name) return;
    if (name === authUsername) { setMsg({ ok: false, text: 'That is already your username.' }); return; }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) { setMsg({ ok: false, text: 'Use 3–20 letters, numbers or underscores.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(authUsername)}/username`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ newUsername: name }),
      });
      const data = await res.json();
      if (!data.success) { setMsg({ ok: false, text: data.error || 'Failed to change username.' }); setBusy(false); return; }
      localStorage.setItem('auth_user', data.username);
      setMsg({ ok: true, text: 'Username changed. Reloading…' });
      // Full reload so every part of the app picks up the new name from the server
      setTimeout(() => window.location.assign('/settings'), 1200);
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' });
      setBusy(false);
    }
  };

  return (
    <Section title="Username" desc="Your username is how you sign in and how others find you.">
      <p className="text-xs text-zinc-400 mb-3">Current: <span className="font-semibold text-white">{authUsername}</span></p>
      {isRootAdmin ? (
        <p className="text-xs text-zinc-500">The root admin account's username can't be changed.</p>
      ) : (
        <>
          <label className={label}>New username</label>
          <div className="flex gap-2">
            <input
              value={newUsername}
              onChange={e => { setNewUsername(e.target.value); setMsg(null); }}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="New username"
              maxLength={20}
              className={`${input} flex-1`}
            />
            <button onClick={submit} disabled={busy || !newUsername.trim()} className={`${btnConfirm} shrink-0`}>
              {busy ? 'Saving…' : 'Change username'}
            </button>
          </div>
          <p className="text-xs mt-1.5 text-zinc-500">3–20 characters: letters, numbers and underscores.</p>
          <Status msg={msg} />
        </>
      )}
    </Section>
  );
}

function EmailSection() {
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    fetch('/api/auth/me', { headers: authHeaders() }).then(r => r.json()).then(d => { if (d.username) setMe(d); }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('email-verified', load);
    return () => window.removeEventListener('email-verified', load);
  }, [load]);

  const set = key => e => { setForm(f => ({ ...f, [key]: e.target.value })); setMsg(null); };
  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.password && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/change-email', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) setMsg({ ok: false, text: data.error || 'Failed to change email.' });
      else {
        setForm({ email: '', password: '' });
        setMe(m => ({ ...m, pendingEmail: data.pendingEmail }));
        setMsg({ ok: true, text: `We sent a confirmation link to ${data.pendingEmail}. Your email changes once you click it.` });
      }
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' });
    }
    setBusy(false);
  };

  return (
    <Section title="Email" desc="Used for password resets. A new address only takes effect after you confirm it from that inbox.">
      <div className="flex flex-col gap-2 mb-5">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/60 border border-zinc-700 text-sm">
          {me === null
            ? <span className="text-zinc-500">Loading…</span>
            : me.email
              ? <><span className="flex-1 truncate text-zinc-200">{me.email}</span>{me.emailVerified && <span className="text-emerald-400 text-xs font-semibold shrink-0">Verified</span>}</>
              : <span className="text-zinc-500 italic">No email set</span>}
        </div>
        {me?.pendingEmail && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/60 border border-amber-700/50 text-sm">
            <span className="flex-1 truncate text-zinc-400">{me.pendingEmail}</span>
            <span className="text-amber-400 text-xs font-semibold shrink-0">Awaiting confirmation</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4 max-w-md">
        <div>
          <label className={label}>New email</label>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" className={input} />
        </div>
        <div>
          <label className={label}>Current password</label>
          <input type="password" value={form.password} onChange={set('password')} onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="current-password" className={input} />
        </div>
        <div>
          <button onClick={submit} disabled={!canSubmit} className={btnConfirm}>{busy ? 'Sending…' : 'Change email'}</button>
        </div>
      </div>
      <Status msg={msg} />
    </Section>
  );
}

function PasswordSection() {
  const empty = { current: '', next: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = key => e => { setForm(f => ({ ...f, [key]: e.target.value })); setMsg(null); };

  const mismatch = form.confirm && form.next !== form.confirm;
  const canSubmit = form.current && form.next.length >= 6 && form.next === form.confirm && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      const data = await res.json();
      if (!res.ok) setMsg({ ok: false, text: data.error || 'Failed to change password.' });
      else { setForm(empty); setMsg({ ok: true, text: 'Password changed. Any other devices have been signed out.' }); }
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' });
    }
    setBusy(false);
  };

  return (
    <Section title="Password" desc="Changing your password signs you out on all other devices.">
      <div className="flex flex-col gap-4 max-w-md">
        <div>
          <label className={label}>Current password</label>
          <input type="password" value={form.current} onChange={set('current')} autoComplete="current-password" className={input} />
        </div>
        <div>
          <label className={label}>New password</label>
          <input type="password" value={form.next} onChange={set('next')} autoComplete="new-password" placeholder="At least 6 characters" className={input} />
        </div>
        <div>
          <label className={label}>Confirm new password</label>
          <input type="password" value={form.confirm} onChange={set('confirm')} onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="new-password" className={input} />
          {mismatch && <p className="text-xs mt-1.5 text-red-400">Passwords don't match.</p>}
        </div>
        <div>
          <button onClick={submit} disabled={!canSubmit} className={btnConfirm}>{busy ? 'Saving…' : 'Change password'}</button>
        </div>
      </div>
      <Status msg={msg} />
    </Section>
  );
}

export default function SettingsPage({ authUsername }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-zinc-900 text-white">
      <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <UsernameSection authUsername={authUsername} />
        <EmailSection />
        <PasswordSection />
      </div>
    </div>
  );
}
