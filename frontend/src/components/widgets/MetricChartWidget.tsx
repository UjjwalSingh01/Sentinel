import { useMemo } from 'react';
import { useQuery } from '@apollo/client/react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LEVEL, METRICS, SERIES, levelForMetric, type MetricKey } from '@/lib/status';
import { GET_METRICS } from '@/graphql/queries';
import { WidgetFrame, WidgetMessage } from './WidgetFrame';

export interface MetricChartConfig {
  serverId: string;
  metric: MetricKey;
  rangeMinutes?: number;
}

export function MetricChartWidget({ config }: { config: MetricChartConfig }) {
  const fromTime = useMemo(
    () => new Date(Date.now() - (config.rangeMinutes ?? 30) * 60_000).toISOString(),
    [config.rangeMinutes],
  );

  const { data, loading } = useQuery(GET_METRICS, {
    variables: { serverId: config.serverId, fromTime, bucketMinutes: 1 },
    skip: !config.serverId,
    pollInterval: 10000,
    fetchPolicy: 'cache-and-network',
  });

  const spec = METRICS[config.metric] ?? METRICS.cpu;

  const points = ((data as any)?.metrics ?? []).map((p: any) => ({
    time: new Date(p.time).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    value: p[config.metric] ?? 0,
  }));

  const latest = points.length ? points[points.length - 1].value : 0;
  const level = levelForMetric(spec, latest);

  return (
    <WidgetFrame
      title={`${spec.label} · ${config.serverId || 'no server'}`}
      value={
        points.length ? (
          <span style={{ color: level === 'good' ? 'var(--color-ink)' : LEVEL[level].text }}>
            {latest.toFixed(spec.unit === 'ms' ? 0 : 1)}
            <span className="text-ink-subtle">{spec.unit}</span>
          </span>
        ) : null
      }
    >
      {!config.serverId ? (
        <WidgetMessage>Pick a server in this widget's settings.</WidgetMessage>
      ) : loading && points.length === 0 ? (
        <WidgetMessage>Loading…</WidgetMessage>
      ) : points.length === 0 ? (
        <WidgetMessage>No data in this range.</WidgetMessage>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={`wfill-${config.metric}-${config.serverId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e1e24" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 9, fill: '#6e6e78' }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              domain={[0, spec.max]}
              tick={{ fontSize: 9, fill: '#6e6e78' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#16161b',
                border: '1px solid #2b2b34',
                borderRadius: 6,
                fontSize: 11,
              }}
              labelStyle={{ color: '#9a9aa4' }}
              itemStyle={{ color: '#ececf0' }}
              formatter={(v) => [`${Number(v).toFixed(1)} ${spec.unit}`, spec.label]}
            />
            <ReferenceLine
              y={spec.critical}
              stroke={LEVEL.critical.mark}
              strokeDasharray="3 3"
              strokeOpacity={0.45}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={SERIES}
              strokeWidth={1.75}
              fill={`url(#wfill-${config.metric}-${config.serverId})`}
              dot={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </WidgetFrame>
  );
}
