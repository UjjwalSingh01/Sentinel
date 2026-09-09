import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { ServerOff } from 'lucide-react';
import { GET_INCIDENTS, GET_SERVERS } from '@/graphql/queries';
import { FleetTable, type FleetRow } from '@/components/dashboard/FleetTable';
import { IncidentFeed, type FeedIncident } from '@/components/dashboard/IncidentFeed';
import { IncidentVolume } from '@/components/dashboard/IncidentVolume';
import { IncidentDetailDialog } from '@/components/incidents/IncidentDetailDialog';
import { EmptyState, Skeleton } from '@/components/ui';
import { LEVEL, levelForServer, levelForSeverity, type Level } from '@/lib/status';
import { useLive } from '@/lib/live';
import { INCIDENT_LIMIT } from '@/components/layout/AppLayout';
import { useRange } from '@/lib/range';
import { cn } from '@/lib/utils';

interface ServerData {
  serverId: string;
  cpu: number;
  memory: number;
  disk: number;
  latencyMs: number;
}

interface ServersResult {
  servers: ServerData[];
}
interface IncidentsResult {
  incidents: FeedIncident[];
}

const HISTORY_LENGTH = 40;
/** How recent an alert has to be to still colour a host's status dot. */
const RECENT_MINUTES = 10;
const RANK: Record<Level, number> = { critical: 4, serious: 3, warn: 2, neutral: 1, good: 0 };
const worst = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);

export function DashboardPage() {
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const { revision } = useLive();
  const { range } = useRange();

  const { data: serversData, loading: serversLoading, refetch: refetchServers } = useQuery(
    GET_SERVERS,
    { pollInterval: 5000 },
  );

  const { data: incidentsData, loading: incidentsLoading, refetch: refetchIncidents } = useQuery(
    GET_INCIDENTS,
    // A wider window than the feed needs, because the volume chart is built
    // from the same rows.
    { variables: { limit: INCIDENT_LIMIT }, pollInterval: 10000 },
  );

  // An incident pushed over SSE — or the top bar's refresh — should land now,
  // not on the next poll tick.
  useEffect(() => {
    if (revision > 0) {
      refetchIncidents();
      refetchServers();
    }
  }, [revision, refetchIncidents, refetchServers]);

  const servers: ServerData[] = useMemo(
    () => (serversData as ServersResult | undefined)?.servers ?? [],
    [serversData],
  );
  const incidents: FeedIncident[] = useMemo(
    () => (incidentsData as IncidentsResult | undefined)?.incidents ?? [],
    [incidentsData],
  );

  /* The recency cutoff below has to come from state rather than a Date.now()
     call inside the memo: a render must be pure, and pinning "now" to a tick
     also means the window actually slides as time passes instead of only when
     new data happens to arrive. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* --- CPU history -------------------------------------------------------
     The API only ever hands us "CPU right now", so a per-host sparkline would
     otherwise need a second query per server. We keep the last N polls in a ref
     — the trend is a free by-product of the polling we already do. The table
     hides the line until there are enough samples to mean something. */
  const [history, setHistory] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (servers.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory((prev) => {
      const next = { ...prev };
      for (const s of servers) {
        next[s.serverId] = [...(prev[s.serverId] ?? []), s.cpu].slice(-HISTORY_LENGTH);
      }
      return next;
    });
  }, [servers]);

  /* --- Fresh-incident highlighting -------------------------------------- */
  const seenRef = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (incidents.length === 0) return;
    const ids = incidents.map((i) => i.id);
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }
    const arrivals = ids.filter((id) => !seenRef.current!.has(id));
    if (arrivals.length === 0) return;
    arrivals.forEach((id) => seenRef.current!.add(id));
    setFreshIds(new Set(arrivals));
    const t = setTimeout(() => setFreshIds(new Set()), 2000);
    return () => clearTimeout(t);
  }, [incidents]);

  /* Open, and not a child of another incident. The sidebar badge and the
     Incidents page both fold children into their parent, so counting them here
     was the reason this panel said 200 while the nav said 94 — the same
     question with two different answers, which is exactly the kind of thing
     that stops you trusting a dashboard. */
  const openIncidents = useMemo(
    () => incidents.filter((i) => i.status !== 'resolved' && !i.parentIncidentId),
    [incidents],
  );

  /** True when the query hit its ceiling, so the count is a floor, not a total. */
  const countIsPartial = incidents.length >= INCIDENT_LIMIT;

  /* --- Fleet rows --------------------------------------------------------
     A host's status is the worse of two things: what its metrics say right
     now, and what has fired against it *recently*.

     Both halves are load-bearing. Without the incidents, the table showed a
     green "Healthy" host carrying two unresolved critical alerts — the
     contradiction that made the old overview untrustworthy. But counting every
     open incident regardless of age is just as useless in the other direction:
     nothing here auto-resolves, so after an hour every host is permanently red
     and the colour stops meaning anything. Bounding it to the last ten minutes
     keeps the dot answering the question an operator is actually asking —
     "what needs me *now*" — while the Alerts column still carries the full
     open count for the host. */
  const rows: FleetRow[] = useMemo(() => {
    const byHost: Record<string, FeedIncident[]> = {};
    for (const i of openIncidents) (byHost[i.serverId] ??= []).push(i);

    const recentCutoff = now - RECENT_MINUTES * 60_000;

    return servers.map((s) => {
      const open = byHost[s.serverId] ?? [];
      const recent = open.filter((i) => new Date(i.createdAt).getTime() >= recentCutoff);
      const alertLevel = open.reduce<Level>(
        (acc, i) => worst(acc, levelForSeverity(i.severity)),
        'good',
      );
      const recentLevel = recent.reduce<Level>(
        (acc, i) => worst(acc, levelForSeverity(i.severity)),
        'good',
      );
      return {
        ...s,
        alerts: open.length,
        alertLevel: open.length ? alertLevel : 'good',
        level: worst(levelForServer(s), recentLevel),
        history: history[s.serverId] ?? [],
      };
    });
  }, [servers, openIncidents, history, now]);

  const fleet = useMemo(() => {
    const counts = { total: rows.length, healthy: 0, degraded: 0, critical: 0 };
    for (const r of rows) {
      if (r.level === 'critical') counts.critical += 1;
      else if (r.level === 'warn' || r.level === 'serious') counts.degraded += 1;
      else counts.healthy += 1;
    }
    return counts;
  }, [rows]);

  const loadingFleet = serversLoading && servers.length === 0;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4 p-5">
      <div className="grid shrink-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Four numbers, at a size you can read from across a room. They agree
            with the table below because both come from the same combined
            health calculation. */}
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line">
          <Tile label="Hosts" value={fleet.total} />
          <Tile label="Healthy" value={fleet.healthy} level="good" />
          <Tile label="Degraded" value={fleet.degraded} level="warn" />
          <Tile label="Critical" value={fleet.critical} level="critical" />
        </div>

        <IncidentVolume incidents={incidents} range={range} now={now} />
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto" aria-label="Fleet">
          {loadingFleet ? (
            <Skeleton className="h-64" />
          ) : rows.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon={ServerOff}
                title="No hosts reporting"
                hint="Nothing has sent a metric yet. Once the simulator starts producing, hosts appear here automatically."
              />
            </div>
          ) : (
            <FleetTable rows={rows} />
          )}
        </section>

        <aside className="flex w-84 shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-card">
          <header className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
            <h2 className="text-[11px] font-medium tracking-[0.08em] text-ink-subtle uppercase">
              Active incidents
            </h2>
            <span className="ml-auto font-mono text-[12px] font-medium text-ink tabular-nums">
              {openIncidents.length}
              {countIsPartial && '+'}
            </span>
          </header>

          <div className="flex-1 overflow-y-auto">
            {incidentsLoading && incidents.length === 0 ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : (
              <IncidentFeed
                incidents={incidents}
                onIncidentClick={setSelectedIncident}
                freshIds={freshIds}
              />
            )}
          </div>
        </aside>
      </div>

      <IncidentDetailDialog
        incidentId={selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}

/** A count. Deliberately not a chart — four integers do not need axes, and the
 *  colour only appears when the number is non-zero, so a calm fleet is calm. */
function Tile({ label, value, level = 'neutral' }: { label: string; value: number; level?: Level }) {
  const active = value > 0 && level !== 'neutral' && level !== 'good';
  return (
    <div className="relative bg-card px-4 py-3.5">
      {active && (
        <span
          className="absolute inset-y-0 left-0 w-0.5"
          style={{ background: LEVEL[level].mark }}
        />
      )}
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </div>
      <div
        className={cn('mt-1.5 text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums')}
        style={{ color: active ? LEVEL[level].text : 'var(--color-ink)' }}
      >
        {value}
      </div>
    </div>
  );
}
