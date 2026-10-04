import { useSyncExternalStore } from 'react';
import { getToken, onTokenChange } from './tokenStore';

// Live online status via Supabase Realtime Presence. Every logged-in browser joins the private
// "online-users" channel with the user's own Supabase token; Supabase drops the entry the moment
// the connection closes, so friends see someone go offline within seconds — no polling.
// Until the channel is actually joined (or if it can't be — missing env vars, Supabase errors),
// the app falls back to the server heartbeat (user.isOnline), so status never silently breaks.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let state = { live: false, online: new Set() };
const listeners = new Set();
let client = null;
let channel = null;
let currentUser = null;
const set = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };

// True only while the realtime channel is joined and delivering presence
export const isRealtimeLive = () => state.live;

export async function startPresence(username) {
  if (!configured || !username || currentUser === username) return;
  await stopPresence();
  currentUser = username;
  const { RealtimeClient } = await import('@supabase/realtime-js');
  if (currentUser !== username) return; // logged out / switched while loading

  // worker: keeps the heartbeat running in background tabs, which browsers otherwise throttle
  client = new RealtimeClient(`${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: SUPABASE_ANON_KEY }, worker: true });
  await client.setAuth(getToken());
  channel = client.channel('online-users', { config: { private: true, presence: { key: username.toLowerCase() } } });
  channel
    .on('presence', { event: 'sync' }, () => set({ online: new Set(Object.keys(channel.presenceState())) }))
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') { set({ live: true }); channel.track({ username, online_at: new Date().toISOString() }); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (state.live || status !== 'CLOSED') console.warn('[presence] realtime unavailable, using heartbeat fallback:', err?.message || status);
        set({ live: false });
      }
    });
}

export async function stopPresence() {
  currentUser = null;
  const ch = channel, cl = client;
  channel = null; client = null;
  if (ch) { try { await ch.untrack(); } catch {} cl?.removeChannel(ch); }
  cl?.disconnect();
  set({ live: false, online: new Set() });
}

onTokenChange(t => { if (client && t) client.setAuth(t); });

const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
// Lookup used by friend lists: live presence while realtime is joined, else the server flag
export function useIsOnline() {
  const s = useSyncExternalStore(subscribe, () => state);
  return user => (s.live ? s.online.has(user?.username?.toLowerCase()) : !!user?.isOnline);
}
