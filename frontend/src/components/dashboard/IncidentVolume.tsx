import { useMemo } from 'react';
import { LEVEL, levelForSeverity, type Level } from '@/lib/status';
import { rangeMinutes, type RangeValue } from '@/lib/range';

/* ---------------------------------------------------------------------------
   Incident volume over the selected window.

   The overview had a 300px table sitting on 450px of empty canvas, and no
   answer at all to the question you ask straight after "what is broken?" —
   namely "is this getting worse, and when did it start?". This is built from
   the incident list the page already fetches, so it costs nothing extra: one
   bar per bucket, coloured by the worst severity inside it.
--------------------------------------------------------------------------- */

interface Incident {
  createdAt: string;
  severity: string;
}

const BUCKETS = 56;
const RANK: Record<Level, number> = { critical: 4, serious: 3, warn: 2, neutral: 1, good: 0 };

export function IncidentVolume({
  incidents,
  range,
  now,
}: {
  incidents: Incident[];
  range: RangeValue;
  /** Pinned by the caller so this stays pure across renders. */
  now: number;
}) {
  const { bars, peak, total } = useMemo(() => {
    const span = rangeMinutes(range) * 60_000;
    const start = now - span;
    const width = span / BUCKETS;

    const counts = Array.from({ length: BUCKETS }, () => ({ n: 0, level: 'good' as Level }));
    let seen = 0;

    for (const inc of incidents) {
      const t = new Date(inc.createdAt).getTime();
      if (t < start || t > now) continue;
      const idx = Math.min(BUCKETS - 1, Math.floor((t - start) / width));
      const bucket = counts[idx];
      bucket.n += 1;
      const lvl = levelForSeverity(inc.severity);
      if (RANK[lvl] > RANK[bucket.level]) bucket.level = lvl;
      seen += 1;
    }

    return { bars: counts, peak: Math.max(...counts.map((c) => c.n), 1), total: seen };
  }, [incidents, range, now]);

  return (
    <section className="rounded-lg border border-line bg-card px-4 py-3">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium tracking-[0.08em] text-ink-subtle uppercase">
          Incident volume
        </h2>
        <span className="font-mono text-[11px] text-ink-muted tabular-nums">
          {total} in last {range}
        </span>
      </div>

      <div className="flex h-14 items-end gap-[2px]" role="img" aria-label={`${total} incidents in the last ${range}`}>
        {bars.map((b, i) => {
          const token = LEVEL[b.level];
          return (
            <div
              key={i}
              className="min-h-px flex-1 rounded-[1px] transition-[height] duration-500"
              style={{
                height: b.n === 0 ? '2px' : `${Math.max(8, (b.n / peak) * 100)}%`,
                background: b.n === 0 ? 'var(--color-line)' : token.mark,
                opacity: b.n === 0 ? 1 : 0.9,
              }}
              title={b.n ? `${b.n} incident${b.n === 1 ? '' : 's'}` : undefined}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-subtle">
        <span>−{range}</span>
        <span>now</span>
      </div>
    </section>
  );
}
