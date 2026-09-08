import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { motion } from 'motion/react';
import { ShieldCheck, Terminal } from 'lucide-react';
import { GET_INCIDENTS, GET_METRICS } from '@/graphql/queries';
import { MetricChart } from '@/components/server/MetricChart';
import { useRange, windowFor } from '@/lib/range';
import { IncidentDetailDialog } from '@/components/incidents/IncidentDetailDialog';
import { EmptyState, Skeleton, StatusBadge } from '@/components/ui';
import { METRICS, type MetricKey, levelForSeverity, levelForIncidentStatus } from '@/lib/status';
import { fadeUp, stagger } from '@/lib/motion';
import { formatDateTime, timeAgo } from '@/lib/format';

const KEYS: MetricKey[] = ['cpu', 'memory', 'disk', 'latencyMs'];

export function ServerDetailPage() {
  const { serverId } = useParams<{ serverId: string }>();
  // The window comes from the top bar, so changing it once re-scopes every
  // page that plots time — this one included.
  const { range } = useRange();
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);

  // The query window has to be pinned to a value that only changes on a tick.
  // Calling `new Date()` inline would mint fresh variables on every render,
  // which Apollo reads as a brand-new query — it would refetch in a loop and
  // never leave the loading state.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const { fromTime, toTime, bucketMinutes } = useMemo(() => {
    const { from, bucketMinutes: bucket } = windowFor(range, tick);
    return {
      fromTime: from.toISOString(),
      toTime: new Date(tick).toISOString(),
      bucketMinutes: bucket,
    };
  }, [range, tick]);

  const { data: metricsData, loading } = useQuery(GET_METRICS, {
    variables: { serverId, fromTime, toTime, bucketMinutes },
    skip: !serverId,
  });

  const { data: incidentsData } = useQuery(GET_INCIDENTS, {
    variables: { serverId, limit: 10 },
    skip: !serverId,
  });

  const metrics: any[] = (metricsData as any)?.metrics ?? [];
  const incidents: any[] = (incidentsData as any)?.incidents ?? [];

  return (
    <div className="p-4">
      {/* No page header: the top bar already says Fleet › this-host, and owns
          the time range that this page's queries read. */}
      {loading && metrics.length === 0 ? (
        <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {KEYS.map((k) => (
            <Skeleton key={k} className="h-67" />
          ))}
        </div>
      ) : metrics.length === 0 ? (
        <div className="panel mb-3">
          <EmptyState
            icon={Terminal}
            title="No metrics in this window"
            hint="Nothing was recorded for this server in the selected range. Try a wider one."
          />
        </div>
      ) : (
        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          animate="show"
          className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2"
        >
          {KEYS.map((key) => (
            <motion.div key={key} variants={fadeUp}>
              <MetricChart
                spec={METRICS[key]}
                data={metrics.map((m) => ({ time: m.time, value: m[key] }))}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <section className="overflow-hidden rounded-lg border border-line bg-card">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Recent incidents</h2>
        </header>

        {incidents.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No incidents on this server"
            hint="It has stayed inside every alert rule's thresholds."
          />
        ) : (
          <div className="divide-y divide-line">
            {incidents.map((inc) => (
              <button
                key={inc.id}
                onClick={() => setSelectedIncident(inc.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated"
              >
                <StatusBadge level={levelForSeverity(inc.severity)}>{inc.severity}</StatusBadge>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{inc.message}</span>
                <StatusBadge level={levelForIncidentStatus(inc.status)} showIcon={false}>
                  {inc.status}
                </StatusBadge>
                <span
                  className="w-20 shrink-0 text-right font-mono text-[11px] text-ink-subtle"
                  title={formatDateTime(inc.createdAt)}
                >
                  {timeAgo(inc.createdAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <IncidentDetailDialog
        incidentId={selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
