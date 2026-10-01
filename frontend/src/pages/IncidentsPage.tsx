import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { AnimatePresence, motion } from 'motion/react';
import { Layers, Repeat, ShieldCheck } from 'lucide-react';
import { GET_INCIDENTS } from '@/graphql/queries';
import { IncidentDetailDialog } from '@/components/incidents/IncidentDetailDialog';
import { SavedFilterBar } from '@/components/filters/SavedFilterBar';
import {
  Chip,
  EmptyState,
  Skeleton,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { levelForIncidentStatus, levelForSeverity } from '@/lib/status';
import { formatDateTime, timeAgo } from '@/lib/format';
import { snappy } from '@/lib/motion';
import { useLive } from '@/lib/live';
import { getUser } from '@/lib/auth';

type Status = 'all' | 'mine' | 'open' | 'acknowledged' | 'resolved';

/** Unresolved incidents this user has taken on, by assignment or by acking. */
function isMine(inc: { status: string; assigneeId?: string | null; acknowledgedBy?: string | null }, me?: string) {
  if (!me || inc.status === 'resolved') return false;
  return inc.assigneeId === me || inc.acknowledgedBy === me;
}

export function IncidentsPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status>((params.get('status') as Status) || 'all');
  const [selected, setSelected] = useState<string | null>(null);
  const { revision } = useLive();
  const me = getUser()?.user_id;

  const { data, loading, refetch } = useQuery(GET_INCIDENTS, {
    variables: { status: status === 'all' || status === 'mine' ? undefined : status, limit: 100 },
    pollInterval: 10000,
  });

  useEffect(() => {
    if (revision > 0) refetch();
  }, [revision, refetch]);

  const incidents: any[] = (data as any)?.incidents ?? [];

  // Children are folded into their parent's "+N related" pill, so showing them
  // as their own rows would double-count one real-world problem.
  const topLevel = useMemo(() => incidents.filter((i) => !i.parentIncidentId), [incidents]);
  const rows = useMemo(
    () => (status === 'mine' ? topLevel.filter((i) => isMine(i, me)) : topLevel),
    [topLevel, status, me],
  );

  const countFor = (s: Status) =>
    s === 'all'
      ? topLevel.length
      : s === 'mine'
        ? topLevel.filter((i) => isMine(i, me)).length
        : topLevel.filter((i) => i.status === s).length;

  return (
    <div className="p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          layoutId="incident-status"
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all', label: 'All', count: countFor('all') },
            { value: 'mine', label: 'Assigned to me', count: countFor('mine') },
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
                : status === 'mine'
                  ? 'Nothing is assigned to or acknowledged by you.'
                  : `No ${status} incidents right now.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-inset/60">
                  {['Severity', 'Server', 'Metric', 'Message', 'Status', 'Assignee', 'Fired'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-1.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase whitespace-nowrap"
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
                      className="cursor-pointer border-b border-line/50 transition-colors last:border-0 hover:bg-row"
                    >
                      <td className="px-3 py-1.5">
                        <StatusBadge level={levelForSeverity(inc.severity)}>
                          {inc.severity}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[12px] whitespace-nowrap text-ink">
                        {inc.serverId}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] whitespace-nowrap text-ink-muted">
                        {inc.metricType}
                      </td>
                      <td className="max-w-xl px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] text-ink">{inc.message}</span>
                          {inc.childCount > 0 && (
                            <Chip className="shrink-0">
                              <Layers size={9} />+{inc.childCount}
                            </Chip>
                          )}
                          {inc.occurrenceCount > 0 && (
                            <span
                              className="shrink-0"
                              title={`Recurred ${inc.occurrenceCount}× since it was claimed${
                                inc.lastOccurredAt ? ` · last ${timeAgo(inc.lastOccurredAt)}` : ''
                              }`}
                            >
                              <Chip>
                                <Repeat size={9} />×{inc.occurrenceCount}
                              </Chip>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusBadge
                          level={levelForIncidentStatus(inc.status)}
                          showIcon={false}
                        >
                          {inc.status}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-1.5 text-[12px] whitespace-nowrap text-ink-muted">
                        {inc.assignee?.name ?? '—'}
                      </td>
                      <td
                        className="px-3 py-1.5 font-mono text-[11px] whitespace-nowrap text-ink-subtle"
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
