import React from 'react';

type Props = { platform: string; className?: string };

export const PlatformIcon: React.FC<Props> = ({ platform, className = 'w-7 h-7' }) => {
  const p = platform.toLowerCase();
  if (p === 'facebook') return <svg viewBox="0 0 24 24" className={className} aria-label="Facebook"><path fill="currentColor" d="M13.5 21v-8h2.75l.4-3h-3.15V8.08c0-.87.24-1.46 1.5-1.46h1.76V3.94c-.3-.04-1.33-.13-2.53-.13-2.5 0-4.21 1.53-4.21 4.34V10H7.2v3h2.82v8h3.48Z"/></svg>;
  if (p === 'instagram') return <svg viewBox="0 0 24 24" className={className} aria-label="Instagram" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>;
  if (p === 'tiktok') return <svg viewBox="0 0 24 24" className={className} aria-label="TikTok"><path fill="currentColor" d="M14.2 3h3.02c.2 1.54 1.03 2.78 2.58 3.58v3.04c-1.2-.03-2.2-.35-3.15-.9v5.9c0 3.76-2.44 6.38-6.05 6.38A5.63 5.63 0 0 1 5 15.38c0-3.27 2.67-5.86 6.04-5.86.35 0 .7.03 1.03.1v3.2a3.03 3.03 0 0 0-1.03-.18c-1.58 0-2.84 1.14-2.84 2.74 0 1.47 1.1 2.62 2.56 2.62 1.64 0 2.53-1.12 2.53-3.18V3h.91Z"/></svg>;
  if (p === 'youtube') return <svg viewBox="0 0 24 24" className={className} aria-label="YouTube"><path fill="currentColor" d="M21.6 7.2a2.9 2.9 0 0 0-2.03-2.04C17.78 4.67 12 4.67 12 4.67s-5.78 0-7.57.49A2.9 2.9 0 0 0 2.4 7.2C1.92 8.99 1.92 12 1.92 12s0 3.01.48 4.8a2.9 2.9 0 0 0 2.03 2.04c1.79.49 7.57.49 7.57.49s5.78 0 7.57-.49a2.9 2.9 0 0 0 2.03-2.04c.48-1.79.48-4.8.48-4.8s0-3.01-.48-4.8ZM10.15 15.4V8.6L16 12l-5.85 3.4Z"/></svg>;
  if (p === 'x') return <svg viewBox="0 0 24 24" className={className} aria-label="X"><path fill="currentColor" d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.49 22H3.37l7.25-8.28L2.8 2h6.4l4.42 5.84L18.9 2Zm-1.1 17.7h1.73L8.29 4.2H6.43L17.8 19.7Z"/></svg>;
  return <svg viewBox="0 0 24 24" className={className} aria-label="Telegram"><path fill="currentColor" d="m21.4 4.55-3.16 14.9c-.24 1.05-.86 1.3-1.75.82l-4.82-3.55-2.33 2.24c-.26.26-.48.48-.98.48l.35-4.91 8.93-8.07c.39-.35-.09-.55-.61-.2L6 13.34 1.3 11.87c-1.02-.32-1.04-1.02.21-1.5L19.9 3.16c.87-.32 1.63.2 1.5 1.39Z"/></svg>;
};
