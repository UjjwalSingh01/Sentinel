import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface MetricChartProps {
  data: Array<{
    time: string;
    value: number | null;
  }>;
  label: string;
  unit: string;
  color: string;
  warningThreshold?: number;
  criticalThreshold?: number;
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MetricChart({
  data,
  label,
  unit,
  color,
  warningThreshold,
  criticalThreshold,
}: MetricChartProps) {
  return (
    <div className="glass rounded-xl p-4 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground">{label}</h4>
        <div className="flex items-center gap-3">
          {warningThreshold !== undefined && (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[10px] text-muted-foreground">Warning: {warningThreshold}{unit}</span>
            </div>
          )}
          {criticalThreshold !== undefined && (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[10px] text-muted-foreground">Critical: {criticalThreshold}{unit}</span>
            </div>
          )}
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id={`gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#27272a' }}
              tickLine={{ stroke: '#27272a' }}
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#27272a' }}
              tickLine={{ stroke: '#27272a' }}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#fafafa',
              }}
              formatter={(val) => [`${Number(val).toFixed(2)} ${unit}`, label]}
              labelFormatter={(lbl) => formatTime(String(lbl))}
            />
            {warningThreshold !== undefined && (
              <Area
                type="monotone"
                dataKey={() => warningThreshold}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1}
                fill="none"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}
            {criticalThreshold !== undefined && (
              <Area
                type="monotone"
                dataKey={() => criticalThreshold}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeWidth={1}
                fill="none"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${label})`}
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: '#18181b', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
