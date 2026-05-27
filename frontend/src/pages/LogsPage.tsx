import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  Pause,
  Play,
  RefreshCw,
  Search,
  Terminal,
} from 'lucide-react';
import { GET_LOGS } from '@/graphql/logs';
import { GET_SERVERS } from '@/graphql/queries';
import { connectLogTail, type LogRecord } from '@/lib/sse';

interface LogItem {
  time: string;
  serverId: string;
  service: string | null;
  level: string;
  message: string;
  fields: string | null;
  traceId: string | null;
}

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'WARNING', 'ERROR', 'FATAL'];

function levelBadgeClass(level: string): string {
  const l = level.toUpperCase();
  if (l === 'FATAL' || l === 'ERROR') return 'bg-red-500/20 text-red-400';
  if (l === 'WARN' || l === 'WARNING') return 'bg-amber-500/20 text-amber-400';
  if (l === 'DEBUG') return 'bg-zinc-500/20 text-zinc-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

function levelIcon(level: string) {
  const l = level.toUpperCase();
  if (l === 'FATAL' || l === 'ERROR') return AlertOctagon;
  if (l === 'WARN' || l === 'WARNING') return AlertTriangle;
  return Info;
}

export function LogsPage() {
  const [searchParams] = useSearchParams();
  const [serverId, setServerId] = useState<string>(searchParams.get('serverId') || '');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [submittedQuery, setSubmittedQuery] = useState<string>('');
  const [tailing, setTailing] = useState<boolean>(false);
  const [liveLogs, setLiveLogs] = useState<LogRecord[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const liveContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset buffer + open tail in the same effect so the state reset
    // doesn't cascade-render before the subscription starts.
    setLiveLogs([]);
    if (!tailing) return;
    const close = connectLogTail(serverId || null, {
      onLog: (rec) => {
        setLiveLogs((prev) => {
          const next = [...prev, rec];
          if (next.length > 500) next.splice(0, next.length - 500);
          return next;
        });
      },
    });
    return () => close();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset is paired with subscribe
  }, [serverId, tailing]);

  // Auto-scroll the live tail to the bottom on new lines
  useEffect(() => {
    if (!tailing || !liveContainerRef.current) return;
    liveContainerRef.current.scrollTop = liveContainerRef.current.scrollHeight;
  }, [liveLogs, tailing]);

  const { data: serversData } = useQuery(GET_SERVERS, { pollInterval: 10000 });
  const servers: { serverId: string }[] = (serversData as any)?.servers || [];

  const {
    data: logsData,
    loading: logsLoading,
    refetch: refetchLogs,
  } = useQuery(GET_LOGS, {
    variables: {
      serverId: serverId || undefined,
      service: serviceFilter || undefined,
      levels: levelFilter.length > 0 ? levelFilter : undefined,
      query: submittedQuery || undefined,
      limit: 200,
    },
    skip: tailing,
    fetchPolicy: 'cache-and-network',
  });

  const logs: LogItem[] = (logsData as any)?.logs?.items || [];

  const liveLogItems: LogItem[] = useMemo(() => {
    return liveLogs
      .filter((r) => !levelFilter.length || levelFilter.includes(r.level.toUpperCase()))
      .filter((r) => !serviceFilter || (r.service ?? '').includes(serviceFilter))
      .map((r) => ({
        time: r.time || r.timestamp || new Date().toISOString(),
        serverId: r.server_id,
        service: r.service ?? null,
        level: r.level,
        message: r.message,
        fields: r.fields ? JSON.stringify(r.fields) : null,
        traceId: r.trace_id ?? null,
      }))
      .reverse(); // newest first like the query path
  }, [liveLogs, levelFilter, serviceFilter]);

  const displayLogs = tailing ? liveLogItems : logs;

  const toggleLevel = (lvl: string) => {
    setLevelFilter((prev) =>
      prev.includes(lvl) ? prev.filter((x) => x !== lvl) : [...prev, lvl]
    );
  };

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(searchQuery);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Terminal size={22} className="text-emerald-400" />
            Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search and tail structured log lines from the fleet
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTailing((t) => !t)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tailing
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-zinc-800 text-muted-foreground hover:text-foreground'
            }`}
          >
            {tailing ? <Pause size={14} /> : <Play size={14} />}
            {tailing ? 'Pause Tail' : 'Live Tail'}
            {tailing && (
              <span className="flex items-center gap-1">
                <Activity size={10} className="text-emerald-400" />
                <span className="text-[10px] opacity-80">{liveLogs.length}</span>
              </span>
            )}
          </button>
          <button
            onClick={() => refetchLogs()}
            disabled={tailing}
            className="p-2 rounded-lg hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl border border-zinc-800 p-4 mb-4 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 focus-within:border-emerald-500/30">
            <Search size={14} className="text-muted-foreground" />
            <input
              type="text"
              placeholder="Full-text search (e.g. connection refused)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={tailing}
              className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            />
            {submittedQuery && !tailing && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSubmittedQuery('');
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                CLEAR
              </button>
            )}
          </div>
          <select
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-500/30"
          >
            <option value="">All servers</option>
            {servers.map((s) => (
              <option key={s.serverId} value={s.serverId}>
                {s.serverId}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="service…"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="w-32 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/30"
          />
        </form>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Level:</span>
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => toggleLevel(lvl)}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                levelFilter.includes(lvl)
                  ? levelBadgeClass(lvl)
                  : 'bg-zinc-800 text-muted-foreground hover:text-foreground'
              }`}
            >
              {lvl}
            </button>
          ))}
          {levelFilter.length > 0 && (
            <button
              onClick={() => setLevelFilter([])}
              className="text-[10px] text-muted-foreground hover:text-foreground ml-2"
            >
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Logs table */}
      <div
        ref={liveContainerRef}
        className="glass rounded-xl border border-zinc-800 overflow-auto max-h-[calc(100vh-280px)]"
      >
        {logsLoading && displayLogs.length === 0 && !tailing ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 bg-zinc-800/50 rounded animate-pulse" />
            ))}
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <Terminal size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">
              {tailing
                ? 'Waiting for live log lines…'
                : 'No logs match the current filters.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-zinc-900/80 sticky top-0 z-10">
              <tr className="border-b border-zinc-800 text-left">
                <th className="w-6" />
                <th className="px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  Time
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider">
                  Level
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider">
                  Server
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider">
                  Service
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground uppercase tracking-wider">
                  Message
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 font-mono">
              {displayLogs.map((log, idx) => {
                const key = `${log.time}-${idx}`;
                const isOpen = expanded.has(key);
                const Icon = levelIcon(log.level);
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => toggleExpanded(key)}
                      className="hover:bg-zinc-800/40 cursor-pointer"
                    >
                      <td className="pl-2 text-muted-foreground">
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                        {new Date(log.time).toISOString().split('T')[1]?.slice(0, 12)}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${levelBadgeClass(log.level)}`}
                        >
                          <Icon size={9} />
                          {log.level.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                        {log.serverId}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                        {log.service || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-foreground/90 break-all">
                        {log.message}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-zinc-900/50">
                        <td colSpan={6} className="px-12 py-2 text-[11px] text-muted-foreground">
                          {log.traceId && (
                            <div className="mb-1">
                              <span className="text-foreground/60">trace_id:</span>{' '}
                              <span className="text-emerald-400">{log.traceId}</span>
                            </div>
                          )}
                          {log.fields && (
                            <pre className="whitespace-pre-wrap text-foreground/80 bg-zinc-800/60 rounded p-2 overflow-x-auto">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(log.fields), null, 2);
                                } catch {
                                  return log.fields;
                                }
                              })()}
                            </pre>
                          )}
                          {!log.fields && !log.traceId && (
                            <span className="italic">No structured fields.</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
