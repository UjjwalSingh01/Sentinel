import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CornerDownLeft,
  LayoutDashboard,
  LayoutGrid,
  Phone,
  Search,
  Server,
  SlidersHorizontal,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { GET_SERVERS } from '@/graphql/queries';
import { getUser } from '@/lib/auth';
import { gentle } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/**
 * ⌘K. Once an app has seven pages and seven servers, a mouse trip through the
 * sidebar to reach `prod-web-04` is the slowest thing in the product. This makes
 * every destination two keystrokes away.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery(GET_SERVERS, { pollInterval: open ? 10000 : 0 });
  const servers: { serverId: string }[] = (data as any)?.servers ?? [];
  const isAdmin = getUser()?.role === 'admin';

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };

    const nav: Command[] = [
      { id: 'nav-overview', label: 'Overview', group: 'Go to', icon: LayoutDashboard, run: go('/') },
      { id: 'nav-incidents', label: 'Incidents', group: 'Go to', icon: AlertTriangle, run: go('/incidents') },
      { id: 'nav-logs', label: 'Logs', group: 'Go to', icon: Terminal, run: go('/logs') },
      { id: 'nav-dashboards', label: 'Dashboards', group: 'Go to', icon: LayoutGrid, run: go('/dashboards') },
      { id: 'nav-rules', label: 'Alert rules', group: 'Go to', icon: SlidersHorizontal, run: go('/rules') },
    ];

    if (isAdmin) {
      nav.push({ id: 'nav-oncall', label: 'On-call schedule', group: 'Go to', icon: Phone, run: go('/admin/on-call') });
    }

    const serverCmds: Command[] = servers.map((s) => ({
      id: `server-${s.serverId}`,
      label: s.serverId,
      hint: 'Open metrics',
      group: 'Servers',
      icon: Server,
      run: go(`/server/${s.serverId}`),
    }));

    const filters: Command[] = [
      { id: 'f-open', label: 'Open incidents', hint: 'status:open', group: 'Filters', icon: AlertTriangle, run: go('/incidents?status=open') },
      { id: 'f-errors', label: 'Error logs', hint: 'level:ERROR', group: 'Filters', icon: Terminal, run: go('/logs?level=ERROR') },
    ];

    return [...nav, ...serverCmds, ...filters];
  }, [servers, navigate, onClose, isAdmin]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Reset when reopened, and keep the cursor in range as results narrow.
  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(results.length - 1, 0)));
  }, [results.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[cursor]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-60 flex items-start justify-center p-4 pt-[12vh]">
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-line-strong bg-panel shadow-2xl shadow-black/60"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.12 } }}
            transition={gentle}
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search size={15} className="shrink-0 text-ink-subtle" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Jump to a page or a server…"
                className="flex-1 bg-transparent py-3.5 text-[14px] text-ink outline-none placeholder:text-ink-subtle"
              />
              <kbd className="shrink-0 rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-ink-muted">
                  Nothing matches “{query}”.
                </p>
              ) : (
                results.map((cmd, i) => {
                  const header = cmd.group !== lastGroup ? cmd.group : null;
                  lastGroup = cmd.group;
                  const active = i === cursor;

                  return (
                    <div key={cmd.id}>
                      {header && (
                        <div className="px-2.5 pt-3 pb-1.5 text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
                          {header}
                        </div>
                      )}
                      <button
                        data-index={i}
                        onMouseMove={() => setCursor(i)}
                        onClick={cmd.run}
                        className={cn(
                          'relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left',
                          active ? 'text-ink' : 'text-ink-muted',
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="cmdk-cursor"
                            className="absolute inset-0 rounded-md bg-elevated"
                            transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                          />
                        )}
                        <cmd.icon size={14} className="relative shrink-0" />
                        <span className="relative flex-1 truncate text-[13px]">{cmd.label}</span>
                        {cmd.hint && (
                          <span className="relative shrink-0 font-mono text-[10px] text-ink-subtle">
                            {cmd.hint}
                          </span>
                        )}
                        {active && (
                          <CornerDownLeft size={12} className="relative shrink-0 text-ink-subtle" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
