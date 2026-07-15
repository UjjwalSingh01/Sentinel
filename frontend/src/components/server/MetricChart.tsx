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
import { LEVEL, SERIES, levelForMetric, type MetricSpec } from '@/lib/status';
import { StatusBadge } from '@/components/ui';

interface MetricChartProps {
  spec: MetricSpec;
  data: Array<{ time: string; value: number | null }>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * A single metric over time.
 *
 * Every one of these charts draws its line in the SAME hue. The old version gave
 * each metric its own colour — including an amber latency line, which collided
 * head-on with amber-means-warning. Here the line is always neutral blue and the
 * only colour that varies is the threshold rules, so a chart turning colourful
 * genuinely means something is wrong.
 */
export function MetricChart({ spec, data }: MetricChartProps) {
  const latest = [...data].reverse().find((d) => d.value !== null)?.value ?? 0;
  const level = levelForMetric(spec, latest);
  const gradientId = `fill-${spec.key}`;

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[12px] font-medium text-ink-muted">{spec.label}</h3>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className="font-mono text-xl leading-none font-medium tabular-nums"
              style={{ color: level === 'good' ? 'var(--color-ink)' : LEVEL[level].text }}
            >
              {latest.toFixed(spec.unit === 'ms' ? 0 : 1)}
            </span>
            <span className="text-[11px] text-ink-subtle">{spec.unit}</span>
          </div>
        </div>
        <StatusBadge level={level}>{LEVEL[level].label}</StatusBadge>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          {/* Right margin leaves room for the threshold labels to sit outside
              the plot rather than being clipped by its edge. */}
          <AreaChart data={data} margin={{ top: 4, right: 30, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Recessive grid — it orients, it doesn't compete. */}
            <CartesianGrid stroke="#1e1e24" strokeDasharray="0" vertical={false} />

            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              tick={{ fill: '#6e6e78', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[0, spec.max]}
              tick={{ fill: '#6e6e78', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={34}
            />

            <Tooltip
              cursor={{ stroke: '#2b2b34', strokeWidth: 1 }}
              contentStyle={{
                background: '#16161b',
                border: '1px solid #2b2b34',
                borderRadius: 8,
                fontSize: 12,
                padding: '8px 10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
              labelStyle={{ color: '#9a9aa4', fontSize: 11, marginBottom: 4 }}
              itemStyle={{ color: '#ececf0' }}
              formatter={(v) => [`${Number(v).toFixed(1)} ${spec.unit}`, spec.label]}
              labelFormatter={(l) => formatTime(String(l))}
            />

            {/* Thresholds as reference lines, not fake series — a dataKey that
                returns a constant pollutes the tooltip with phantom entries. */}
            <ReferenceLine
              y={spec.warn}
              stroke={LEVEL.warn.mark}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{ value: 'warn', position: 'right', fill: LEVEL.warn.text, fontSize: 9 }}
            />
            <ReferenceLine
              y={spec.critical}
              stroke={LEVEL.critical.mark}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{ value: 'crit', position: 'right', fill: LEVEL.critical.text, fontSize: 9 }}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke={SERIES}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3.5, fill: SERIES, stroke: '#101014', strokeWidth: 2 }}
              animationDuration={600}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
