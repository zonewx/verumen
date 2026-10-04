let _token = null;
const _listeners = new Set();
export const getToken = () => _token;
export const setToken = (t) => { _token = t; _listeners.forEach(fn => fn(t)); };
export const clearToken = () => { _token = null; _listeners.forEach(fn => fn(null)); };
// Lets long-lived connections (e.g. realtime presence) pick up refreshed tokens
export const onTokenChange = (fn) => { _listeners.add(fn); return () => _listeners.delete(fn); };
