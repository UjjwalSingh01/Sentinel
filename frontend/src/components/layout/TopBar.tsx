import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronRight, LogOut, RefreshCw, Search } from 'lucide-react';
import { getUser, logout } from '@/lib/auth';
import { useLive } from '@/lib/live';
import { RANGES, useRange, type RangeValue } from '@/lib/range';
import { snappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   The global bar.

   Every page used to open with its own 90px title block — a large heading, a
   sentence of prose nobody reads twice, and a refresh button in a slightly
   different place each time. That is a lot of vertical real estate spent
   telling you where you already know you are.

   This replaces all of it: location on the left, and on the right the three
   controls that belong to the whole console rather than to any one screen —
   the time window, the live indicator, and search. Everything below it is
   content.
--------------------------------------------------------------------------- */

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/incidents': 'Incidents',
  '/logs': 'Logs',
  '/dashboards': 'Dashboards',
  '/rules': 'Alert rules',
  '/admin/on-call': 'On-call schedule',
};

/** Pages where a time window means nothing — showing the control there would
 *  imply it does something. */
const NO_RANGE = ['/rules', '/dashboards', '/admin/on-call'];

export function TopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { serverId } = useParams<{ serverId: string }>();
  const { connected, refresh } = useLive();
  const { range, setRange } = useRange();
  const user = getUser();
  const [spinning, setSpinning] = useState(false);

  const path = location.pathname;
  const isServer = path.startsWith('/server/');
  const isDashboard = path.startsWith('/dashboards/') && path !== '/dashboards';
  const showRange = !NO_RANGE.some((p) => path.startsWith(p)) && !isDashboard;

  const onRefresh = () => {
    refresh();
    setSpinning(true);
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel/85 px-4 backdrop-blur-xl">
      {/* Location. A breadcrumb rather than a title, so drilling into a host
          keeps the trail back to the fleet visible. */}
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
        {isServer ? (
          <>
            <Link
              to="/"
              className="text-ink-muted transition-colors hover:text-ink"
            >
              Fleet
            </Link>
            <ChevronRight size={13} className="shrink-0 text-ink-subtle" />
            <span className="truncate font-mono font-medium text-ink">{serverId}</span>
          </>
        ) : (
          <span className="font-medium text-ink">{TITLES[path] ?? 'Sentinel'}</span>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {showRange && <RangeControl value={range} onChange={setRange} />}

        {/* Connection state. Green is a status here, not decoration — it is the
            answer to "am I looking at live data or a frozen screen?" */}
        <span
          className="flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-1"
          title={connected ? 'Live stream connected' : 'Reconnecting to the live stream'}
        >
          <span
            className={cn('block h-1.5 w-1.5 rounded-full', connected && 'pulse-dot')}
            style={{ background: connected ? 'var(--color-good)' : 'var(--color-ink-subtle)' }}
          />
          <span className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
            {connected ? 'live' : 'offline'}
          </span>
        </span>

        <button
          onClick={onRefresh}
          title="Refresh this page"
          aria-label="Refresh"
          className="grid h-7 w-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
        >
          <RefreshCw size={14} className={spinning ? 'animate-spin' : undefined} />
        </button>

        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 rounded-md border border-line bg-card px-2 py-1 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <Search size={12} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="rounded border border-line bg-inset px-1 py-px font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>

        <div className="ml-1 flex items-center gap-2 border-l border-line pl-3">
          <span
            className="grid h-6 w-6 place-items-center rounded-md border border-accent/25 bg-accent/12 font-mono text-[10px] font-medium text-accent-text"
            title={`${user?.name ?? 'User'} · ${user?.role ?? ''}`}
          >
            {user?.name?.charAt(0).toUpperCase() ?? 'U'}
          </span>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            title="Sign out"
            aria-label="Sign out"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Segmented control. The indicator is a shared layout element so it slides
 *  between windows instead of blinking. */
function RangeControl({
  value,
  onChange,
}: {
  value: RangeValue;
  onChange: (r: RangeValue) => void;
}) {
  return (
    <div
      className="flex items-center rounded-md border border-line bg-inset p-0.5"
      role="group"
      aria-label="Time range"
    >
      {RANGES.map((r) => {
        const active = r.value === value;
        return (
          <button
            key={r.value}
            onClick={() => onChange(r.value)}
            aria-pressed={active}
            className={cn(
              'relative rounded px-2 py-0.5 font-mono text-[11px] transition-colors duration-150',
              active ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId="range-indicator"
                className="absolute inset-0 rounded border border-accent/25 bg-accent/15"
                transition={snappy}
              />
            )}
            <span className="relative">{r.value}</span>
          </button>
        );
      })}
    </div>
  );
}
