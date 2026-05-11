interface TimeRangeSelectorProps {
  selected: string;
  onChange: (range: string) => void;
}

const ranges = [
  { label: '5m', value: '5m', minutes: 5 },
  { label: '15m', value: '15m', minutes: 15 },
  { label: '1h', value: '1h', minutes: 60 },
  { label: '6h', value: '6h', minutes: 360 },
  { label: '24h', value: '24h', minutes: 1440 },
];

export function TimeRangeSelector({ selected, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
      {ranges.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`
            px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
            ${
              selected === range.value
                ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-zinc-800'
            }
          `}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

export function getTimeRange(range: string): { from: Date; bucketMinutes: number } {
  const now = new Date();
  const rangeConfig = ranges.find((r) => r.value === range) || ranges[2];
  const from = new Date(now.getTime() - rangeConfig.minutes * 60 * 1000);

  let bucketMinutes = 1;
  if (rangeConfig.minutes > 60) bucketMinutes = 5;
  if (rangeConfig.minutes > 360) bucketMinutes = 15;

  return { from, bucketMinutes };
}
