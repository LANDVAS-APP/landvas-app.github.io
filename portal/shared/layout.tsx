// The portal frame: a sidebar of sections, a top bar, the page.
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ExternalLink, LogOut, Menu, X } from 'lucide-react';
import { getBackend } from '../../src/backend/backend';
import { cn } from '../../src/lib/utils';
import { PlayerAvatar } from '../../src/ui';
import { PlotMark } from './auth';

export type NavItem = { to: string; label: string; icon: ReactNode; group?: string; count?: number; end?: boolean };

export function Shell({ title, nav, top, user, children }: {
  title: string;
  nav: NavItem[];
  top?: ReactNode;
  user: { username: string | null; profile?: any; sub?: ReactNode };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  const groups: { name?: string; items: NavItem[] }[] = [];
  for (const n of nav) {
    const g = groups[groups.length - 1];
    if (g && g.name === n.group) g.items.push(n); else groups.push({ name: n.group, items: [n] });
  }
  return (
    <div className="p-shell">
      <aside className={cn('p-side', open && 'open')} aria-label="Sections">
        <div className="flex items-center gap-2.5 px-5 pb-3 pt-5">
          <PlotMark />
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold leading-tight tracking-tight">LANDVAS</div>
            <div className="text-xs text-muted">{title}</div>
          </div>
          <button className="ml-auto rounded-lg p-1.5 text-muted hover:text-fg min-[961px]:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="p-nav grid gap-0.5 px-3 pb-6">
          {groups.map((g, i) => (
            <div key={i} className="grid gap-0.5">
              {g.name && <div className="p-nav-group">{g.name}</div>}
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn(isActive && 'active')}>
                  <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{n.icon}</span>
                  {n.label}
                  {!!n.count && <span className="p-count tnum">{n.count > 99 ? '99+' : n.count}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-50 bg-[var(--scrim)] min-[961px]:hidden" onClick={() => setOpen(false)} />}
      <div className="p-main">
        <header className="p-top">
          <button className="rounded-lg p-1.5 text-muted hover:text-fg min-[961px]:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">{top}</div>
          <a href="https://landvas.app/world" target="_blank" rel="noopener" className="hidden items-center gap-1.5 text-sm text-muted hover:text-fg sm:inline-flex">Open the game <ExternalLink className="h-3.5 w-3.5" /></a>
          <div className="flex items-center gap-2 border-l border-line pl-3">
            {user.profile && <PlayerAvatar p={user.profile} size={28} />}
            <div className="hidden min-w-0 leading-tight md:block">
              <div className="truncate text-sm font-semibold">@{user.username ?? 'you'}</div>
              {user.sub && <div className="truncate text-[11px] text-muted">{user.sub}</div>}
            </div>
            <button className="rounded-lg p-1.5 text-muted hover:text-fg" title="Sign out" aria-label="Sign out" onClick={() => void getBackend().signOut()}><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="p-content">{children}</main>
      </div>
    </div>
  );
}
