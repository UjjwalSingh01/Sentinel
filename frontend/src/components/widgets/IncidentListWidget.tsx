import { useQuery } from '@apollo/client/react';
import { AlertOctagon, AlertTriangle } from 'lucide-react';
import { GET_INCIDENTS } from '@/graphql/queries';

export interface IncidentListConfig {
  status?: 'open' | 'acknowledged' | 'resolved';
  serverId?: string;
  limit?: number;
}

interface IncidentListWidgetProps {
  config: IncidentListConfig;
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

export function IncidentListWidget({ config }: IncidentListWidgetProps) {
  const { data, loading } = useQuery(GET_INCIDENTS, {
    variables: {
      status: config.status,
      serverId: config.serverId,
      limit: config.limit ?? 20,
    },
    pollInterval: 10000,
    fetchPolicy: 'cache-and-network',
  });

  const incidents: IncidentRow[] = ((data as any)?.incidents || []).filter(
    (i: IncidentRow) => !i.parentIncidentId,
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
        <AlertTriangle size={12} className="text-amber-400" />
        <span className="font-medium">
          Incidents
          {config.status ? ` · ${config.status}` : ''}
          {config.serverId ? ` · ${config.serverId}` : ''}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && incidents.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">Loading…</div>
        ) : incidents.length === 0 ? (
          <div className="text-xs text-muted-foreground italic p-2">No incidents.</div>
        ) : (
          <div className="space-y-1">
            {incidents.map((inc) => {
              const Icon = inc.severity === 'critical' ? AlertOctagon : AlertTriangle;
              return (
                <div
                  key={inc.id}
                  className="bg-zinc-800/40 rounded p-2 text-xs flex items-start gap-2"
                >
                  <Icon
                    size={12}
                    className={
                      inc.severity === 'critical' ? 'text-red-400 mt-0.5' : 'text-amber-400 mt-0.5'
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {inc.serverId}
                      </span>
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded ${
                          inc.status === 'open'
                            ? 'bg-red-500/10 text-red-400'
                            : inc.status === 'acknowledged'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {inc.status}
                      </span>
                    </div>
                    <div className="truncate text-foreground/80">{inc.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
