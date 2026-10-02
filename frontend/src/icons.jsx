const Svg = ({ size = 16, className = '', strokeWidth = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);

export const IconX = (p) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12"/></Svg>;

export const IconRefresh = (p) => <Svg {...p}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></Svg>;

export const IconSpinner = ({ className = '', ...p }) => <Svg {...p} className={`animate-spin ${className}`}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></Svg>;

export const IconSearch = (p) => <Svg {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></Svg>;

export const IconLock = (p) => <Svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></Svg>;

export const IconAlert = (p) => <Svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></Svg>;

export const IconImage = (p) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></Svg>;
