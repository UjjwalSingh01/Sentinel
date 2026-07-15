import { useMemo } from 'react';
import { useQuery } from '@apollo/client/react';
import { GET_LOGS } from '@/graphql/logs';
import { LEVEL, levelForLogLevel } from '@/lib/status';
import { formatClock } from '@/lib/format';
import { WidgetFrame, WidgetMessage } from './WidgetFrame';

export interface LogPanelConfig {
  serverId?: string;
  levels?: string[];
  rangeMinutes?: number;
}

interface LogItem {
  time: string;
  serverId: string;
  service: string | null;
  level: string;
  message: string;
}

export function LogPanelWidget({ config }: { config: LogPanelConfig }) {
  const fromTime = useMemo(
    () => new Date(Date.now() - (config.rangeMinutes ?? 15) * 60_000).toISOString(),
    [config.rangeMinutes],
  );

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

  const items: LogItem[] = (data as any)?.logs?.items ?? [];

  const title = [
    'Logs',
    config.serverId || 'all servers',
    config.levels?.length ? config.levels.join('/') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <WidgetFrame title={title}>
      {loading && items.length === 0 ? (
        <WidgetMessage>Loading…</WidgetMessage>
      ) : items.length === 0 ? (
        <WidgetMessage>No log lines in this window.</WidgetMessage>
      ) : (
        <div className="h-full overflow-auto">
          <table className="w-full font-mono text-[10px]">
            <tbody>
              {items.map((log, i) => {
                const token = LEVEL[levelForLogLevel(log.level)];
                return (
                  <tr key={i} className="border-b border-line/40 last:border-0">
                    <td className="py-1 pr-2 align-top whitespace-nowrap text-ink-subtle">
                      {formatClock(log.time)}
                    </td>
                    <td className="py-1 pr-2 align-top">
                      <span
                        className="rounded px-1 py-0.5 font-medium"
                        style={{ background: token.tint, color: token.text }}
                      >
                        {log.level.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1 pr-2 align-top whitespace-nowrap text-ink-subtle">
                      {log.serverId}
                    </td>
                    <td className="py-1 break-all text-ink">{log.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </WidgetFrame>
  );
}
