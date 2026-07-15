import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Phone,
  Shield,
  SlidersHorizontal,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { getUser, logout } from '@/lib/auth';
import { snappy } from '@/lib/motion';
import { LiveDot } from '@/components/ui';
import { cn } from '@/lib/utils';

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

interface SidebarProps {
  /** Live count of unresolved incidents, shown against the Incidents item. */
  openIncidents: number;
  connected: boolean;
}

export function Sidebar({ openIncidents, connected }: SidebarProps) {
  const navigate = useNavigate();
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
          'relative flex items-center gap-2.5 rounded-md px-2.5 py-2',
          'text-[13px] font-medium transition-colors duration-150',
          active ? 'text-ink' : 'text-ink-muted hover:text-ink',
        )}
      >
        {/* One indicator element, shared across every nav item. Because it has a
            layoutId, motion tweens it between rows — so the highlight physically
            travels to whatever you clicked instead of teleporting. */}
        {active && (
          <motion.span
            layoutId="nav-indicator"
            className="absolute inset-0 rounded-md border border-line bg-elevated"
            transition={snappy}
          />
        )}
        <item.icon size={15} className="relative shrink-0" />
        <span className="relative">{item.label}</span>
        {showBadge && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={snappy}
            className="relative ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums"
            style={{ background: 'rgba(208,59,59,0.14)', color: '#f0716f' }}
          >
            {openIncidents}
          </motion.span>
        )}
      </NavLink>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-elevated">
          <Shield size={15} className="text-ink" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] leading-none font-semibold tracking-[-0.01em] text-ink">
            Sentinel
          </div>
          <div className="mt-1 text-[10px] leading-none tracking-wide text-ink-subtle uppercase">
            Observability
          </div>
        </div>
      </div>

      {/* Connection state. Green here is a status, not decoration — it's the
          answer to "am I actually looking at live data?" */}
      <div className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-line bg-card px-2.5 py-1.5">
        {connected ? (
          <>
            <LiveDot level="good" />
            <span className="text-[11px] font-medium text-ink-muted">Live stream</span>
          </>
        ) : (
          <>
            <span className="block h-1.5 w-1.5 rounded-full bg-ink-subtle" />
            <span className="text-[11px] font-medium text-ink-subtle">Reconnecting…</span>
          </>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {PRIMARY.map(renderItem)}

        {adminItems.length > 0 && (
          <>
            <div className="px-2.5 pt-5 pb-1.5 text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
              Admin
            </div>
            {adminItems.map(renderItem)}
          </>
        )}
      </nav>

      <div className="m-3 flex items-center gap-2.5 rounded-md border border-line bg-card p-2.5">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-elevated font-mono text-[11px] font-medium text-ink">
          {user?.name?.charAt(0).toUpperCase() ?? 'U'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-ink">{user?.name ?? 'User'}</div>
          <div className="truncate text-[10px] text-ink-subtle">{user?.role ?? ''}</div>
        </div>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          title="Sign out"
          aria-label="Sign out"
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
