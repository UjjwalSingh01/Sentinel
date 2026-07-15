import { Tabs } from '@/components/ui';

const RANGES = [
  { label: '5m', value: '5m', minutes: 5 },
  { label: '15m', value: '15m', minutes: 15 },
  { label: '1h', value: '1h', minutes: 60 },
  { label: '6h', value: '6h', minutes: 360 },
  { label: '24h', value: '24h', minutes: 1440 },
];

interface TimeRangeSelectorProps {
  selected: string;
  onChange: (range: string) => void;
}

export function TimeRangeSelector({ selected, onChange }: TimeRangeSelectorProps) {
  return (
    <Tabs
      layoutId="time-range"
      value={selected}
      onChange={onChange}
      items={RANGES.map((r) => ({ value: r.value, label: r.label }))}
    />
  );
}

/** `at` is passed in rather than read from the clock so callers can pin the
 *  window to a stable tick — see the note in ServerDetailPage. */
export function getTimeRange(range: string, at: number = Date.now()): {
  from: Date;
  bucketMinutes: number;
} {
  const config = RANGES.find((r) => r.value === range) ?? RANGES[2];
  const from = new Date(at - config.minutes * 60 * 1000);

  let bucketMinutes = 1;
  if (config.minutes > 60) bucketMinutes = 5;
  if (config.minutes > 360) bucketMinutes = 15;

  return { from, bucketMinutes };
}
