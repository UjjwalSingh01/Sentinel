import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, Pause, Play, RefreshCw, Search, Terminal } from 'lucide-react';
import { GET_LOGS } from '@/graphql/logs';
import { GET_SERVERS } from '@/graphql/queries';
import { connectLogTail, type LogRecord } from '@/lib/sse';
import { SavedFilterBar } from '@/components/filters/SavedFilterBar';
import {
  Button,
  EmptyState,
  IconButton,
  LiveDot,
  Skeleton,
} from '@/components/ui';
import { LEVEL, levelForLogLevel } from '@/lib/status';
import { formatClock } from '@/lib/format';
import { cn } from '@/lib/utils';

interface LogItem {
  time: string;
  serverId: string;
  service: string | null;
  level: string;
  message: string;
  fields: string | null;
  traceId: string | null;
}

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const MAX_LIVE_LINES = 500;

export function LogsPage() {
  const [params] = useSearchParams();
  const reduced = useReducedMotion();

  const [serverId, setServerId] = useState(params.get('serverId') ?? '');
  const [service, setService] = useState('');
  const [levels, setLevels] = useState<string[]>(
    params.get('level') ? [params.get('level')!] : [],
  );
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [tailing, setTailing] = useState(false);
  const [liveLogs, setLiveLogs] = useState<LogRecord[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The buffer reset has to happen in the same effect as the subscribe: if it
    // lived in its own effect it would flush a frame later and briefly show the
    // previous server's lines under the new server's header.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveLogs([]);
    if (!tailing) return;
    return connectLogTail(serverId || null, {
      onLog: (rec) =>
        setLiveLogs((prev) => {
          const next = [...prev, rec];
          return next.length > MAX_LIVE_LINES ? next.slice(-MAX_LIVE_LINES) : next;
        }),
    });
  }, [serverId, tailing]);

  const { data: serversData } = useQuery(GET_SERVERS, { pollInterval: 10000 });
  const servers: { serverId: string }[] = (serversData as any)?.servers ?? [];

  const { data, loading, refetch } = useQuery(GET_LOGS, {
    variables: {
      serverId: serverId || undefined,
      service: service || undefined,
      levels: levels.length ? levels : undefined,
      query: submitted || undefined,
      limit: 200,
    },
    skip: tailing,
    fetchPolicy: 'cache-and-network',
  });

  const queried: LogItem[] = (data as any)?.logs?.items ?? [];

  const live: LogItem[] = useMemo(
    () =>
      liveLogs
        .filter((r) => !levels.length || levels.includes(r.level.toUpperCase()))
        .filter((r) => !service || (r.service ?? '').includes(service))
        .map((r) => ({
          time: r.time || r.timestamp || new Date().toISOString(),
          serverId: r.server_id,
          service: r.service ?? null,
          level: r.level,
          message: r.message,
          fields: r.fields ? JSON.stringify(r.fields) : null,
          traceId: r.trace_id ?? null,
        }))
        .reverse(),
    [liveLogs, levels, service],
  );

  const rows = tailing ? live : queried;

  /* --- Burst collapsing ---------------------------------------------------
     A failing host does not emit one "connection refused" — it emits forty,
     and the old table gave each one its own row, so a single fault could push
     everything else off the screen. Consecutive identical lines fold into one
     row carrying a count, which is both shorter and more informative: the
     number *is* the signal. */
  const grouped = useMemo(() => {
    const out: (LogItem & { count: number; key: string })[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (
        last &&
        last.level === r.level &&
        last.serverId === r.serverId &&
        last.service === r.service &&
        last.message === r.message
      ) {
        last.count += 1;
        continue;
      }
      out.push({ ...r, count: 1, key: `${r.time}-${out.length}` });
    }
    return out;
  }, [rows]);

  // Newest-first ordering means new lines land at the top — so pin the scroll
  // there rather than chasing the bottom.
  useEffect(() => {
    if (tailing && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [live.length, tailing]);

  const toggle = <T,>(set: T[], v: T): T[] =>
    set.includes(v) ? set.filter((x) => x !== v) : [...set, v];

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-2 p-4">
      {/* Filters and the tail control share one bar. The page title lives in
          the top bar now, so this row is the first thing under the chrome. */}
      <div className="shrink-0 space-y-2 rounded-lg border border-line bg-card p-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(query);
          }}
          className="flex gap-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-md border border-line bg-inset px-3 focus-within:border-line-strong">
            <Search size={14} className="shrink-0 text-ink-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={tailing}
              placeholder="Search messages — e.g. connection refused"
              className="flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-ink-subtle disabled:opacity-50"
            />
            {submitted && !tailing && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSubmitted('');
                }}
                className="shrink-0 text-[10px] text-ink-subtle transition-colors hover:text-ink"
              >
                CLEAR
              </button>
            )}
          </div>

          <select
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            className="field w-44"
          >
            <option value="">All servers</option>
            {servers.map((s) => (
              <option key={s.serverId} value={s.serverId}>
                {s.serverId}
              </option>
            ))}
          </select>

          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="service…"
            className="field w-32"
          />

          <Button
            type="button"
            variant={tailing ? 'primary' : 'secondary'}
            icon={tailing ? Pause : Play}
            onClick={() => setTailing((t) => !t)}
            className="shrink-0"
          >
            {tailing ? 'Pause' : 'Live tail'}
          </Button>
          <IconButton
            icon={RefreshCw}
            label="Refresh"
            onClick={() => refetch()}
            disabled={tailing}
          />
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {LEVELS.map((lvl) => {
              const active = levels.includes(lvl);
              const token = LEVEL[levelForLogLevel(lvl)];
              return (
                <button
                  key={lvl}
                  onClick={() => setLevels((s) => toggle(s, lvl))}
                  aria-pressed={active}
                  className={cn(
                    'rounded px-2 py-1 font-mono text-[10px] font-medium transition-colors',
                    !active && 'bg-inset text-ink-subtle hover:text-ink',
                  )}
                  style={active ? { background: token.tint, color: token.text } : undefined}
                >
                  {lvl}
                </button>
              );
            })}
            {levels.length > 0 && (
              <button
                onClick={() => setLevels([])}
                className="ml-1 text-[10px] text-ink-subtle transition-colors hover:text-ink"
              >
                CLEAR
              </button>
            )}
          </div>

          <div className="ml-auto">
            <SavedFilterBar
              scope="logs"
              currentFilter={{ serverId, service, levels, query: submitted }}
              onApply={(f) => {
                if (typeof f.serverId === 'string') setServerId(f.serverId);
                if (typeof f.service === 'string') setService(f.service);
                if (Array.isArray(f.levels)) setLevels(f.levels as string[]);
                if (typeof f.query === 'string') {
                  setQuery(f.query);
                  setSubmitted(f.query);
                }
              }}
            />
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-card"
      >
        {loading && rows.length === 0 && !tailing ? (
          <div className="space-y-1.5 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Terminal}
            title={tailing ? 'Waiting for log lines' : 'No logs match these filters'}
            hint={
              tailing
                ? 'The stream is open. Lines appear here the moment they are ingested.'
                : 'Try widening the level filter or clearing the search.'
            }
          />
        ) : (
          <table className="w-full table-fixed">
            <thead className="sticky top-0 z-10 bg-inset/95 backdrop-blur">
              <tr className="border-b border-line">
                <th className="w-6" />
                <th className="w-20 px-2 py-1.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
                  Time
                </th>
                <th className="w-16 px-2 py-1.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
                  Level
                </th>
                {/* Host and service were two wide fixed columns pushing the
                    message — the thing you actually read — past the halfway
                    mark of the screen. One column, one line, and the message
                    gets everything that is left. */}
                <th className="w-56 px-2 py-1.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
                  Source
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
                  Message
                </th>
              </tr>
            </thead>

            <tbody>
              <AnimatePresence initial={false}>
                {grouped.map((log) => {
                  const key = log.key;
                  const open = expanded.has(key);
                  const level = levelForLogLevel(log.level);
                  const token = LEVEL[level];

                  return (
                    <Fragment key={key}>
                      <motion.tr
                        layout={tailing && !reduced}
                        initial={tailing && !reduced ? { opacity: 0, x: -8 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                        className="cursor-pointer border-b border-line/40 transition-colors hover:bg-row"
                      >
                        <td className="pl-2 text-ink-subtle">
                          <motion.span
                            className="block"
                            animate={{ rotate: open ? 90 : 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <ChevronRight size={11} />
                          </motion.span>
                        </td>
                        <td className="px-2 py-1 font-mono text-[10.5px] whitespace-nowrap text-ink-subtle tabular-nums">
                          {formatClock(log.time)}
                        </td>
                        <td className="px-2 py-1">
                          <span
                            className="rounded px-1 py-px font-mono text-[9.5px] font-medium"
                            style={{ background: token.tint, color: token.text }}
                          >
                            {log.level.toUpperCase()}
                          </span>
                        </td>
                        <td className="truncate px-2 py-1 font-mono text-[10.5px] whitespace-nowrap">
                          <span className="text-ink-muted">{log.serverId}</span>
                          {log.service && (
                            <span className="text-ink-subtle"> · {log.service}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 font-mono text-[11px] text-ink">
                          <div className="flex items-center gap-2">
                            <span className="truncate" title={log.message}>
                              {log.message}
                            </span>
                            {log.count > 1 && (
                              <span
                                className="shrink-0 rounded px-1 py-px font-mono text-[9.5px] font-medium tabular-nums"
                                style={{ background: token.tint, color: token.text }}
                                title={`${log.count} identical lines in a row`}
                              >
                                ×{log.count}
                              </span>
                            )}
                          </div>
                        </td>
                      </motion.tr>

                      {open && (
                        <tr className="bg-inset">
                          <td colSpan={5} className="px-10 py-2.5">
                            {log.traceId && (
                              <div className="mb-2 font-mono text-[11px]">
                                <span className="text-ink-subtle">trace_id </span>
                                <span className="text-ink">{log.traceId}</span>
                              </div>
                            )}
                            {log.fields ? (
                              <pre className="overflow-x-auto rounded border border-line bg-card p-2.5 font-mono text-[10px] leading-relaxed text-ink-muted">
                                {(() => {
                                  try {
                                    return JSON.stringify(JSON.parse(log.fields), null, 2);
                                  } catch {
                                    return log.fields;
                                  }
                                })()}
                              </pre>
                            ) : (
                              !log.traceId && (
                                <span className="text-[11px] text-ink-subtle italic">
                                  No structured fields on this line.
                                </span>
                              )
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {tailing && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-muted">
          <LiveDot level="good" />
          Tailing {serverId || 'all servers'} · {liveLogs.length} line
          {liveLogs.length === 1 ? '' : 's'} buffered
        </div>
      )}
    </div>
  );
}
