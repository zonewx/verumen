import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiCache from './apiCache';
import { getToken } from './tokenStore';
import { flash } from './flash';
import { card, input, label, btnConfirm, btnSecondary, btnSecondarySm } from './ui';
import { IconImage } from './icons';

const COUNTRIES = [
  { code: 'se', name: 'Sweden' }, { code: 'no', name: 'Norway' }, { code: 'dk', name: 'Denmark' },
  { code: 'fi', name: 'Finland' }, { code: 'de', name: 'Germany' }, { code: 'gb', name: 'United Kingdom' },
  { code: 'fr', name: 'France' }, { code: 'es', name: 'Spain' }, { code: 'it', name: 'Italy' },
  { code: 'nl', name: 'Netherlands' }, { code: 'pl', name: 'Poland' }, { code: 'ch', name: 'Switzerland' },
  { code: 'at', name: 'Austria' }, { code: 'be', name: 'Belgium' }, { code: 'pt', name: 'Portugal' },
  { code: 'us', name: 'United States' }, { code: 'ca', name: 'Canada' }, { code: 'au', name: 'Australia' },
  { code: 'nz', name: 'New Zealand' }, { code: 'jp', name: 'Japan' }, { code: 'cn', name: 'China' },
  { code: 'sg', name: 'Singapore' }, { code: 'in', name: 'India' }, { code: 'br', name: 'Brazil' },
  { code: 'za', name: 'South Africa' }, { code: 'ae', name: 'UAE' }, { code: 'ru', name: 'Russia' },
];

const BIO_MAX = 200;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const PRIVACY_OPTIONS = [
  { key: 'isPublic', title: 'Public profile', desc: 'Anyone can view your profile, even without logging in.' },
  { key: 'publicInventory', title: 'Steam inventory', desc: 'Show your CS inventory on your profile.' },
  { key: 'publicCsTrades', title: 'CS trades', desc: 'Show your trade registry on your profile and your trade posts in other people’s feeds.' },
];

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

function Toggle({ value, onChange, labelText }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={labelText} onClick={() => onChange(!value)}
      className={`relative w-11 h-6 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${value ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  );
}

// Profile photo with a hover overlay; clicking it opens the file picker
function AvatarPicker({ src, username, busy, onPick }) {
  return (
    <label className="relative group shrink-0 cursor-pointer" title="Change photo">
      {src
        ? <img src={src} alt={username} className="w-28 h-28 rounded-full object-cover border-4 border-zinc-600" />
        : <div className="w-28 h-28 rounded-full bg-zinc-600 border-4 border-zinc-600 flex items-center justify-center text-5xl font-bold text-white">{username?.[0]?.toUpperCase() || '?'}</div>}
      <span className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition flex flex-col items-center justify-center gap-1 text-white text-xs font-semibold">
        <IconImage size={18} />
        Change
      </span>
      {busy && <span className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center"><span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /></span>}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={e => { onPick(e.target.files[0]); e.target.value = ''; }} />
    </label>
  );
}

const toForm = data => ({
  bio: data.bio || '',
  country: data.country || 'se',
  isPublic: data.isPublic !== false,
  publicInventory: data.publicInventory || false,
  publicCsTrades: data.publicCsTrades || false,
});

export default function ProfileEditPage({ authUsername }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null);
  const [savedForm, setSavedForm] = useState(null);   // last saved state, for "unsaved changes"
  const [avatar, setAvatar] = useState(null);         // what's shown in the picker
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [steam, setSteam] = useState({ verified: false, id: '', level: 0 });
  const [steamBusy, setSteamBusy] = useState(false);
  const [steamError, setSteamError] = useState('');
  const [saving, setSaving] = useState(false);

  const dirty = !!form && (avatarChanged || JSON.stringify(form) !== JSON.stringify(savedForm));
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  async function fetchProfile() {
    try {
      const res = await fetch(`/api/users/${authUsername}/profile`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);
      apiCache.set(`/api/users/${authUsername}/profile`, data);
      setProfile(data);
      setForm(toForm(data));
      setSavedForm(toForm(data));
      setAvatar(data.avatarBase64 || null);
      setAvatarChanged(false);
      setSteam({ verified: !!data.steamVerified, id: data.steamId || '', level: data.steamLevel || 0 });
    } catch {
      setLoadError('Could not load your profile. Please refresh the page.');
    }
  }

  useEffect(() => {
    fetchProfile();
    // Result of the Steam link flow (the callback redirects back here with these params)
    const params = new URLSearchParams(window.location.search);
    if (params.get('steam_success')) {
      const steamName = params.get('steam_name');
      flash(steamName ? `✓ Steam linked as ${steamName}` : '✓ Steam account linked');
    } else if (params.get('steam_error')) {
      setSteamError('Steam verification failed. Please try again.');
    }
    if (params.has('steam_success') || params.has('steam_error')) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  async function linkSteam() {
    // Linking leaves the site for Steam's login page, so unsaved edits would be lost
    if (dirty) { setSteamError('Save or discard your changes first — linking takes you to Steam and back.'); return; }
    setSteamBusy(true); setSteamError('');
    try {
      const data = await fetch('/api/steam/auth', { headers: authHeaders() }).then(r => r.json());
      if (data.url) { window.location.href = data.url; return; }
      setSteamError('Could not start Steam login. Please try again.');
    } catch { setSteamError('Could not start Steam login. Please try again.'); }
    setSteamBusy(false);
  }

  async function unlinkSteam() {
    setSteamBusy(true); setSteamError('');
    try {
      const res = await fetch('/api/steam/unlink', { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error();
      setSteam({ verified: false, id: '', level: 0 });
      apiCache.del(`/api/users/${authUsername}/profile`);
      window.dispatchEvent(new Event('profile-updated'));
    } catch { setSteamError('Could not unlink Steam. Please try again.'); }
    setSteamBusy(false);
  }

  function pickAvatar(file) {
    if (!file) return;
    setAvatarError('');
    if (file.size > AVATAR_MAX_BYTES) { setAvatarError('Image must be under 2 MB.'); return; }
    setAvatarBusy(true);
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        // Center-crop to a 200×200 square
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height);
        canvas.width = 200; canvas.height = 200;
        canvas.getContext('2d').drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 200, 200);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
        setAvatarChanged(true);
        setAvatarBusy(false);
      };
      img.onerror = () => { setAvatarError('That file could not be read as an image.'); setAvatarBusy(false); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    setAvatar(null);
    setAvatarChanged(true);
  }

  function discard() {
    setForm(savedForm);
    setAvatar(profile.avatarBase64 || null);
    setAvatarChanged(false);
    setAvatarError('');
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const payload = { ...form };
      // Only send the avatar when it changed; an empty string removes it
      if (avatarChanged) payload.avatarBase64 = avatar || '';
      const res = await fetch(`/api/users/${authUsername}/profile`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) { flash(`✗ ${data.error || 'Could not save your profile.'}`, 5000); setSaving(false); return; }
      apiCache.del(`/api/users/${authUsername}/profile`);
      window.dispatchEvent(new Event('profile-updated'));
      flash('✓ Profile saved');
      navigate('/user');
    } catch {
      flash('✗ Could not save your profile. Please try again.', 5000);
      setSaving(false);
    }
  }

  if (loadError) {
    return <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">{loadError}</div>;
  }
  if (!profile || !form) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-900 text-white">
      <div className="max-w-3xl mx-auto w-full px-6 pt-6 flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Edit profile</h1>
            <p className="text-sm text-zinc-400 mt-1">This is how others see you on Verumen.</p>
          </div>
          <button onClick={() => navigate('/user')} className={`${btnSecondarySm} shrink-0`}>View profile</button>
        </div>

        {/* Live preview — mirrors the header on the public profile page */}
        <div className={`${card} p-6 flex flex-col sm:flex-row sm:items-center gap-6`}>
          <div className="flex flex-col items-center gap-2">
            <AvatarPicker src={avatar} username={authUsername} busy={avatarBusy} onPick={pickAvatar} />
            {avatar && <button onClick={removeAvatar} className="text-xs text-zinc-400 hover:text-red-400 transition">Remove photo</button>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <img src={`https://flagcdn.com/${form.country}.svg`} alt="" className="w-7 h-5 rounded-sm shrink-0" />
              <h2 className="text-2xl font-bold truncate">{authUsername}</h2>
              {steam.verified && steam.level > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300 shrink-0">Lvl {steam.level}</span>
              )}
            </div>
            {memberSince && <p className="text-xs text-zinc-400 mb-3">Member since {memberSince}</p>}
            <p className={`text-sm break-words ${form.bio ? 'text-zinc-300' : 'text-zinc-500 italic'}`}>{form.bio || 'No bio yet.'}</p>
            {avatarError && <p className="text-xs text-red-400 mt-3">{avatarError}</p>}
          </div>
        </div>

        <Section title="About" desc="Shown at the top of your profile.">
          <div className="flex flex-col gap-4">
            <div>
              <label className={label} htmlFor="bio">Bio</label>
              <textarea id="bio" value={form.bio} onChange={e => set('bio', e.target.value)} rows={4} maxLength={BIO_MAX}
                placeholder="Tell the community about yourself…" className={`${input} resize-none`} />
              <p className="text-xs mt-1.5 text-zinc-500 text-right">{form.bio.length}/{BIO_MAX}</p>
            </div>
            <div className="max-w-sm">
              <label className={label} htmlFor="country">Country</label>
              <div className="flex items-center gap-3">
                <img src={`https://flagcdn.com/${form.country}.svg`} alt="" className="w-8 h-6 rounded-sm shrink-0" />
                <select id="country" value={form.country} onChange={e => set('country', e.target.value)} className={input}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Steam account" desc="Linking verifies the account through Steam and shows your Steam level. Linking and unlinking take effect right away.">
          {steam.verified && steam.id ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-700">
              <img src="https://store.steampowered.com/favicon.ico" alt="" className="w-6 h-6 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold flex items-center gap-2">
                  Linked
                  <span className="text-emerald-400 text-xs font-semibold">Verified</span>
                  {steam.level > 0 && <span className="text-xs font-normal text-zinc-400">Level {steam.level}</span>}
                </p>
                <a href={`https://steamcommunity.com/profiles/${steam.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-400 hover:text-zinc-200 hover:underline">{steam.id} ↗</a>
              </div>
              <button onClick={unlinkSteam} disabled={steamBusy} className={`${btnSecondarySm} shrink-0`}>{steamBusy ? 'Unlinking…' : 'Unlink'}</button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <button onClick={linkSteam} disabled={steamBusy} className="hover:opacity-90 transition disabled:opacity-50" aria-label="Sign in through Steam">
                <img src="https://community.cloudflare.steamstatic.com/public/images/signinthroughsteam/sits_01.png" alt="Sign in through Steam" className="h-10" />
              </button>
              <p className="text-xs text-zinc-500">You’ll sign in on Steam’s own site and come straight back here.</p>
            </div>
          )}
          {steamError && <p className="text-xs mt-3 text-red-400">{steamError}</p>}
        </Section>

        <Section title="Privacy" desc="Choose what others can see. You always see everything on your own profile.">
          <div className="divide-y divide-zinc-700/70 -my-3">
            {PRIVACY_OPTIONS.map(({ key, title, desc }) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{title}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
                </div>
                <Toggle value={form[key]} onChange={v => set(key, v)} labelText={title} />
              </div>
            ))}
          </div>
        </Section>

        {/* Save bar — stays in view while scrolling */}
        <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-700 flex items-center justify-between gap-3">
          <p className={`text-xs ${dirty ? 'text-amber-400' : 'text-zinc-500'}`}>{dirty ? 'You have unsaved changes' : 'No unsaved changes'}</p>
          <div className="flex gap-2">
            <button onClick={dirty ? discard : () => navigate('/user')} className={btnSecondary}>{dirty ? 'Discard' : 'Cancel'}</button>
            <button onClick={save} disabled={!dirty || saving} className={btnConfirm}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
