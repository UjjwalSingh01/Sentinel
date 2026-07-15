import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { motion } from 'motion/react';
import { AlertOctagon, AlertTriangle, RefreshCw, Server, ServerOff } from 'lucide-react';
import { GET_INCIDENTS, GET_SERVERS } from '@/graphql/queries';
import { ServerCard } from '@/components/dashboard/ServerCard';
import { IncidentFeed, type FeedIncident } from '@/components/dashboard/IncidentFeed';
import { IncidentDetailDialog } from '@/components/incidents/IncidentDetailDialog';
import { EmptyState, IconButton, PageHeader, Skeleton, Stat } from '@/components/ui';
import { levelForServer } from '@/lib/status';
import { stagger } from '@/lib/motion';
import { useLive } from '@/lib/live';

interface ServerData {
  serverId: string;
  cpu: number;
  memory: number;
  disk: number;
  latencyMs: number;
}

const HISTORY_LENGTH = 40;

export function DashboardPage() {
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const { revision } = useLive();

  const {
    data: serversData,
    loading: serversLoading,
    refetch: refetchServers,
  } = useQuery(GET_SERVERS, { pollInterval: 5000 });

  const {
    data: incidentsData,
    loading: incidentsLoading,
    refetch: refetchIncidents,
  } = useQuery(GET_INCIDENTS, { variables: { limit: 20 }, pollInterval: 10000 });

  // An incident pushed over SSE should appear now, not on the next poll tick.
  useEffect(() => {
    if (revision > 0) {
      refetchIncidents();
      refetchServers();
    }
  }, [revision, refetchIncidents, refetchServers]);

  const servers: ServerData[] = useMemo(
    () => (serversData as any)?.servers ?? [],
    [serversData],
  );
  const incidents: FeedIncident[] = (incidentsData as any)?.incidents ?? [];

  /* --- CPU history -------------------------------------------------------
     The API only ever hands us "CPU right now", so a per-card sparkline would
     normally need a second query per server. Instead we keep the last N polls
     in a ref — the trend line is a free by-product of the polling we already do. */
  const historyRef = useRef<Record<string, number[]>>({});
  const [, forceHistoryRender] = useState(0);

  useEffect(() => {
    if (servers.length === 0) return;
    const next = { ...historyRef.current };
    for (const s of servers) {
      const prev = next[s.serverId] ?? [];
      const grown = [...prev, s.cpu];
      next[s.serverId] = grown.slice(-HISTORY_LENGTH);
    }
    historyRef.current = next;
    forceHistoryRender((n) => n + 1);
  }, [servers]);

  /* --- Fresh-incident highlighting -------------------------------------- */
  const seenRef = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (incidents.length === 0) return;
    const ids = incidents.map((i) => i.id);

    // The first payload is history, not news — nothing in it should flash.
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

  const openIncidents = incidents.filter((i) => i.status !== 'resolved');

  const incidentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of openIncidents) {
      counts[i.serverId] = (counts[i.serverId] ?? 0) + 1;
    }
    return counts;
  }, [openIncidents]);

  const fleet = useMemo(() => {
    const levels = servers.map(levelForServer);
    return {
      total: servers.length,
      healthy: levels.filter((l) => l === 'good').length,
      degraded: levels.filter((l) => l === 'warn').length,
      critical: levels.filter((l) => l === 'critical').length,
    };
  }, [servers]);

  const refreshAll = () => {
    refetchServers();
    refetchIncidents();
  };

  const loadingFleet = serversLoading && servers.length === 0;

  return (
    <div className="flex h-screen flex-col p-6">
      <PageHeader
        title="Overview"
        subtitle="Live health of every server reporting into Sentinel."
        actions={<IconButton icon={RefreshCw} label="Refresh" onClick={refreshAll} />}
      />

      {/* Fleet summary. Stat tiles, not charts — four numbers don't need axes,
          and the answer to "is anything on fire" should be readable in one look. */}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {[
          { label: 'Servers reporting', value: fleet.total, icon: Server, level: 'neutral' as const },
          { label: 'Healthy', value: fleet.healthy, icon: Server, level: 'neutral' as const },
          { label: 'Degraded', value: fleet.degraded, icon: AlertTriangle, level: 'warn' as const },
          { label: 'Critical', value: fleet.critical, icon: AlertOctagon, level: 'critical' as const },
        ].map((s) => (
          <div key={s.label} className="bg-card px-4 py-3.5">
            <Stat label={s.label} value={s.value} icon={s.icon} level={s.level} />
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        <section className="min-w-0 flex-1 overflow-y-auto pr-1" aria-label="Servers">
          {loadingFleet ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-47" />
              ))}
            </div>
          ) : servers.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon={ServerOff}
                title="No servers reporting"
                hint="Nothing has sent a metric yet. Once the simulator starts producing, cards appear here automatically."
              />
            </div>
          ) : (
            <motion.div
              variants={stagger(0.04)}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-4 xl:grid-cols-2"
            >
              {servers.map((server) => (
                <ServerCard
                  key={server.serverId}
                  {...server}
                  incidentCount={incidentCounts[server.serverId] ?? 0}
                  history={historyRef.current[server.serverId] ?? []}
                />
              ))}
            </motion.div>
          )}
        </section>

        <aside className="flex w-85 shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-card">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Incident feed</h2>
            <span className="ml-auto font-mono text-[11px] text-ink-subtle tabular-nums">
              {openIncidents.length} active
            </span>
          </header>

          <div className="flex-1 overflow-y-auto">
            {incidentsLoading && incidents.length === 0 ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-19" />
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
