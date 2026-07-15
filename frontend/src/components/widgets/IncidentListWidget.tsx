import { useQuery } from '@apollo/client/react';
import { GET_INCIDENTS } from '@/graphql/queries';
import { LEVEL, levelForIncidentStatus, levelForSeverity } from '@/lib/status';
import { timeAgo } from '@/lib/format';
import { StatusBadge } from '@/components/ui';
import { WidgetFrame, WidgetMessage } from './WidgetFrame';

export interface IncidentListConfig {
  status?: 'open' | 'acknowledged' | 'resolved';
  serverId?: string;
  limit?: number;
}

interface IncidentRow {
  id: string;
  serverId: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
  parentIncidentId?: string | null;
}

export function IncidentListWidget({ config }: { config: IncidentListConfig }) {
  const { data, loading } = useQuery(GET_INCIDENTS, {
    variables: {
      status: config.status,
      serverId: config.serverId,
      limit: config.limit ?? 20,
    },
    pollInterval: 10000,
    fetchPolicy: 'cache-and-network',
  });

  const incidents: IncidentRow[] = ((data as any)?.incidents ?? []).filter(
    (i: IncidentRow) => !i.parentIncidentId,
  );

  const title = ['Incidents', config.status, config.serverId].filter(Boolean).join(' · ');

  return (
    <WidgetFrame title={title} value={incidents.length ? String(incidents.length) : null}>
      {loading && incidents.length === 0 ? (
        <WidgetMessage>Loading…</WidgetMessage>
      ) : incidents.length === 0 ? (
        <WidgetMessage>No incidents match this filter.</WidgetMessage>
      ) : (
        <div className="h-full space-y-1 overflow-auto">
          {incidents.map((inc) => {
            const sev = levelForSeverity(inc.severity);
            const Icon = LEVEL[sev].icon;
            return (
              <div
                key={inc.id}
                className="flex items-start gap-2 rounded border border-line bg-inset p-1.5"
              >
                <Icon size={11} className="mt-0.5 shrink-0" style={{ color: LEVEL[sev].text }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-ink">{inc.serverId}</span>
                    <StatusBadge level={levelForIncidentStatus(inc.status)} showIcon={false}>
                      {inc.status}
                    </StatusBadge>
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-ink-subtle">
                      {timeAgo(inc.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-muted">{inc.message}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetFrame>
  );
}
