import { useMemo } from 'react';
import { useQuery } from '@apollo/client/react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity } from 'lucide-react';
import { GET_METRICS } from '@/graphql/queries';

export interface MetricChartConfig {
  serverId: string;
  metric: 'cpu' | 'memory' | 'disk' | 'latencyMs';
  rangeMinutes?: number;
}

interface MetricChartWidgetProps {
  config: MetricChartConfig;
}

export function MetricChartWidget({ config }: MetricChartWidgetProps) {
  const fromTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - (config.rangeMinutes ?? 30));
    return d.toISOString();
  }, [config.rangeMinutes]);

  const { data, loading } = useQuery(GET_METRICS, {
    variables: {
      serverId: config.serverId,
      fromTime,
      bucketMinutes: 1,
    },
    skip: !config.serverId,
    pollInterval: 10000,
    fetchPolicy: 'cache-and-network',
  });

  const points = ((data as any)?.metrics ?? []).map((p: any) => ({
    time: new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    value: p[config.metric] ?? 0,
  }));

  const title = `${config.metric} · ${config.serverId || '(no server)'}`;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity size={12} className="text-emerald-400" />
          <span className="font-medium">{title}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {!config.serverId ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
            Pick a server in widget settings.
          </div>
        ) : loading && points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
            No data.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#71717a' }} />
              <YAxis tick={{ fontSize: 9, fill: '#71717a' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  fontSize: '11px',
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#10b981" fill="#10b98133" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
