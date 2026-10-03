export const card = 'bg-zinc-800 border-zinc-700 border rounded-xl';

export const input = 'w-full px-3 py-2 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500 bg-zinc-700 border-zinc-600 text-white placeholder-zinc-500';

export const label = 'text-xs font-semibold uppercase tracking-wider block mb-1.5 text-zinc-400';

export const btn = 'px-4 py-2 text-sm font-semibold rounded-lg transition';
export const btnSm = 'px-3 py-1.5 text-xs font-semibold rounded-lg transition';

const base = 'font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed';
const md = 'px-4 py-2 text-sm';
const sm = 'px-3 py-1.5 text-xs';
const primary = 'bg-zinc-600 hover:bg-zinc-500 text-white';
const secondary = 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200';
const danger = 'bg-red-600 hover:bg-red-500 text-white';
export const confirmColors = 'bg-emerald-600 hover:bg-emerald-500 text-white';

export const btnPrimary = `${base} ${md} ${primary}`;
export const btnSecondary = `${base} ${md} ${secondary}`;
export const btnPrimarySm = `${base} ${sm} ${primary}`;
export const btnSecondarySm = `${base} ${sm} ${secondary}`;
export const btnDangerSm = `${base} ${sm} ${danger}`;
export const btnConfirm = `${base} ${md} ${confirmColors}`;
export const btnConfirmSm = `${base} ${sm} ${confirmColors}`;

// Shared page layout: the top nav bar's height (used as an inline offset by every page shell)
// and the centered content column that both the bar and wide pages align to.
export const TOPBAR_H = 64;
export const contentColumn = 'max-w-[1400px] mx-auto';
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60';
