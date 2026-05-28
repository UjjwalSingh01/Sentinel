import { useMemo } from 'react';
import { useQuery } from '@apollo/client/react';
import { Terminal } from 'lucide-react';
import { GET_LOGS } from '@/graphql/logs';

export interface LogPanelConfig {
  serverId?: string;
  levels?: string[];
  rangeMinutes?: number;
}

interface LogPanelWidgetProps {
  config: LogPanelConfig;
}

interface LogItem {
  time: string;
  serverId: string;
  service: string | null;
  level: string;
  message: string;
}

export function LogPanelWidget({ config }: LogPanelWidgetProps) {
  const fromTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - (config.rangeMinutes ?? 15));
    return d.toISOString();
  }, [config.rangeMinutes]);

  const { data, loading } = useQuery(GET_LOGS, {
    variables: {
      serverId: config.serverId || undefined,
      levels: config.levels?.length ? config.levels : undefined,
      fromTime,
      limit: 50,
    },
    pollInterval: 10000,
    fetchPolicy: 'cache-and-network',
  });

  const items: LogItem[] = (data as any)?.logs?.items || [];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
        <Terminal size={12} className="text-emerald-400" />
        <span className="font-medium">
          Logs
          {config.serverId ? ` · ${config.serverId}` : ' · all servers'}
          {config.levels?.length ? ` · ${config.levels.join('/')}` : ''}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto font-mono text-[10px]">
        {loading && items.length === 0 ? (
          <div className="text-muted-foreground p-2">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground italic p-2">No log lines.</div>
        ) : (
          <table className="w-full">
            <tbody>
              {items.map((log, i) => (
                <tr key={i} className="border-b border-zinc-800/30">
                  <td className="px-1 py-0.5 text-muted-foreground whitespace-nowrap">
                    {new Date(log.time).toISOString().split('T')[1]?.slice(0, 8)}
                  </td>
                  <td className="px-1 py-0.5">
                    <span
                      className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                        log.level === 'ERROR' || log.level === 'FATAL'
                          ? 'bg-red-500/20 text-red-400'
                          : log.level === 'WARN' || log.level === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      {log.level}
                    </span>
                  </td>
                  <td className="px-1 py-0.5 text-muted-foreground truncate max-w-[60px]">
                    {log.serverId}
                  </td>
                  <td className="px-1 py-0.5 text-foreground/80 break-all">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
