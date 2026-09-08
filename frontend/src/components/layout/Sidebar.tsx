import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  LayoutDashboard,
  LayoutGrid,
  Phone,
  Shield,
  SlidersHorizontal,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { getUser } from '@/lib/auth';
import { snappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   Navigation, and nothing else.

   The sidebar used to also carry the connection indicator and the account
   card, which pushed the actual navigation into the middle third of the column
   and duplicated state the top bar is better placed to own. Stripped back to
   what it is for, it fits in 200px with 30px rows — and the whole nav is
   visible without the eye travelling.
--------------------------------------------------------------------------- */

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/logs', label: 'Logs', icon: Terminal },
  { to: '/dashboards', label: 'Dashboards', icon: LayoutGrid },
  { to: '/rules', label: 'Rules', icon: SlidersHorizontal },
];

const ADMIN: NavItem[] = [{ to: '/admin/on-call', label: 'On-Call', icon: Phone }];

export function Sidebar({ openIncidents }: { openIncidents: number }) {
  const location = useLocation();
  const user = getUser();
  const adminItems = user?.role === 'admin' ? ADMIN : [];

  // Which item owns the sliding indicator. A server detail page is "under"
  // Overview, so the indicator stays put instead of vanishing when you drill in.
  const activePath = (() => {
    const p = location.pathname;
    if (p.startsWith('/server/')) return '/';
    const match = [...PRIMARY, ...adminItems]
      .filter((i) => i.to !== '/')
      .find((i) => p.startsWith(i.to));
    return match?.to ?? '/';
  })();

  const renderItem = (item: NavItem) => {
    const active = activePath === item.to;
    const showBadge = item.to === '/incidents' && openIncidents > 0;

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={cn(
          'relative flex h-7.5 items-center gap-2.5 rounded-md px-2.5',
          'text-[13px] transition-colors duration-150',
          active ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink',
        )}
      >
        {/* One indicator element, shared across every nav item. Because it has a
            layoutId, motion tweens it between rows — so the highlight physically
            travels to whatever you clicked instead of teleporting. */}
        {active && (
          <motion.span
            layoutId="nav-indicator"
            className="absolute inset-0 overflow-hidden rounded-md border border-accent/25 bg-accent/12"
            transition={snappy}
          >
            <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />
          </motion.span>
        )}
        <item.icon
          size={14}
          className={cn('relative shrink-0 transition-colors', active && 'text-accent-text')}
        />
        <span className="relative truncate">{item.label}</span>
        {showBadge && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={snappy}
            className="relative ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums"
            style={{ background: 'rgba(208,59,59,0.16)', color: '#f0716f' }}
          >
            {openIncidents > 99 ? '99+' : openIncidents}
          </motion.span>
        )}
      </NavLink>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-50 flex-col border-r border-line bg-panel/85 backdrop-blur-xl">
      <div className="flex h-12 items-center gap-2.5 border-b border-line px-3.5">
        <div
          className="grid h-6 w-6 place-items-center rounded-md shadow-sm shadow-black/40"
          style={{
            background: 'linear-gradient(145deg, var(--color-accent), var(--color-accent-deep))',
          }}
        >
          <Shield size={13} className="text-canvas" />
        </div>
        <span className="text-[13px] leading-none font-semibold tracking-[-0.01em] text-ink">
          Sentinel
        </span>
      </div>

      <nav className="flex-1 space-y-px overflow-y-auto p-2">
        {PRIMARY.map(renderItem)}

        {adminItems.length > 0 && (
          <>
            <div className="px-2.5 pt-4 pb-1 text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
              Admin
            </div>
            {adminItems.map(renderItem)}
          </>
        )}
      </nav>

      <div className="border-t border-line px-3.5 py-2.5 font-mono text-[10px] text-ink-subtle">
        {user?.name ?? 'Signed in'} · {user?.role ?? ''}
      </div>
    </aside>
  );
}
