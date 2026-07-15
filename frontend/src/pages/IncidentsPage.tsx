import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { AnimatePresence, motion } from 'motion/react';
import { Layers, RefreshCw, ShieldCheck } from 'lucide-react';
import { GET_INCIDENTS } from '@/graphql/queries';
import { IncidentDetailDialog } from '@/components/incidents/IncidentDetailDialog';
import { SavedFilterBar } from '@/components/filters/SavedFilterBar';
import {
  Chip,
  EmptyState,
  IconButton,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { levelForIncidentStatus, levelForSeverity } from '@/lib/status';
import { formatDateTime, timeAgo } from '@/lib/format';
import { snappy } from '@/lib/motion';
import { useLive } from '@/lib/live';

type Status = 'all' | 'open' | 'acknowledged' | 'resolved';

export function IncidentsPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status>((params.get('status') as Status) || 'all');
  const [selected, setSelected] = useState<string | null>(null);
  const { revision } = useLive();

  const { data, loading, refetch } = useQuery(GET_INCIDENTS, {
    variables: { status: status === 'all' ? undefined : status, limit: 100 },
    pollInterval: 10000,
  });

  useEffect(() => {
    if (revision > 0) refetch();
  }, [revision, refetch]);

  const incidents: any[] = (data as any)?.incidents ?? [];

  // Children are folded into their parent's "+N related" pill, so showing them
  // as their own rows would double-count one real-world problem.
  const rows = useMemo(() => incidents.filter((i) => !i.parentIncidentId), [incidents]);

  const countFor = (s: Status) =>
    s === 'all' ? rows.length : rows.filter((i) => i.status === s).length;

  return (
    <div className="p-6">
      <PageHeader
        title="Incidents"
        subtitle="Every alert the rule engine has fired, newest first."
        actions={<IconButton icon={RefreshCw} label="Refresh" onClick={() => refetch()} />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          layoutId="incident-status"
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all', label: 'All', count: countFor('all') },
            { value: 'open', label: 'Open', count: countFor('open') },
            { value: 'acknowledged', label: 'Acknowledged', count: countFor('acknowledged') },
            { value: 'resolved', label: 'Resolved', count: countFor('resolved') },
          ]}
        />
        <SavedFilterBar
          scope="incidents"
          currentFilter={{ status }}
          onApply={(f) => {
            if (typeof f.status === 'string') setStatus(f.status as Status);
          }}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-card">
        {loading && incidents.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No incidents here"
            hint={
              status === 'all'
                ? 'Nothing has breached a rule. The fleet is inside its thresholds.'
                : `No ${status} incidents right now.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  {['Severity', 'Server', 'Metric', 'Message', 'Status', 'Assignee', 'Fired'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                <AnimatePresence initial={false}>
                  {rows.map((inc, i) => (
                    <motion.tr
                      key={inc.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ ...snappy, delay: Math.min(i * 0.015, 0.3) }}
                      onClick={() => setSelected(inc.id)}
                      className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-elevated"
                    >
                      <td className="px-4 py-2.5">
                        <StatusBadge level={levelForSeverity(inc.severity)}>
                          {inc.severity}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap text-ink">
                        {inc.serverId}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap text-ink-muted">
                        {inc.metricType}
                      </td>
                      <td className="max-w-md px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] text-ink">{inc.message}</span>
                          {inc.childCount > 0 && (
                            <Chip className="shrink-0">
                              <Layers size={9} />+{inc.childCount}
                            </Chip>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          level={levelForIncidentStatus(inc.status)}
                          showIcon={false}
                        >
                          {inc.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] whitespace-nowrap text-ink-muted">
                        {inc.assignee?.name ?? '—'}
                      </td>
                      <td
                        className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap text-ink-subtle"
                        title={formatDateTime(inc.createdAt)}
                      >
                        {timeAgo(inc.createdAt)}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <IncidentDetailDialog incidentId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
