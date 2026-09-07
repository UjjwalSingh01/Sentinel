import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ProbePanel } from './ProbePanel';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   The three pillars, shown rather than described.

   Every observability landing page has a row of three cards with an icon and
   a sentence. These three are the actual widgets: a metric that climbs into
   its own threshold, a log tail that keeps arriving, a trace you can point at.
   The claim and the demo are the same object.
--------------------------------------------------------------------------- */

export function PillarShowcase() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Pillar
        n="01"
        title="Metrics"
        blurb="Four numbers per server, every three seconds, stored in hypertables that stay fast at a billion rows."
        probe="metrics"
      >
        <MetricDemo />
      </Pillar>

      <Pillar
        n="02"
        title="Logs"
        blurb="Full-text searchable, level-filtered, and automatically clipped to the minute an incident opened."
        probe="logs"
      >
        <LogDemo />
      </Pillar>

      <Pillar
        n="03"
        title="Traces"
        blurb="One request, span by span, so “the API was slow” becomes “the payments call took 330 of the 580ms”."
        probe="traces"
      >
        <TraceDemo />
      </Pillar>
    </div>
  );
}

function Pillar({
  n,
  title,
  blurb,
  probe,
  children,
}: {
  n: string;
  title: string;
  blurb: string;
  probe: string;
  children: React.ReactNode;
}) {
  return (
    <ProbePanel probe={probe} className="flex flex-col">
      <div className="flex items-baseline gap-2 px-5 pt-5">
        <span className="font-mono text-[10px] text-ink-subtle">{n}</span>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      </div>
      <p className="px-5 pt-2 pb-5 text-[13px] leading-relaxed text-ink-muted">{blurb}</p>
      <div className="mt-auto border-t border-line bg-inset/60 p-4">{children}</div>
    </ProbePanel>
  );
}

/* --- 01 · metrics --------------------------------------------------------- */

const WARN_AT = 70;
const CRIT_AT = 85;

function MetricDemo() {
  const reduced = useReducedMotion();
  const [series, setSeries] = useState<number[]>(() =>
    Array.from({ length: 44 }, (_, i) => 48 + 12 * Math.sin(i / 4) + 5 * Math.sin(i / 1.7)),
  );

  useEffect(() => {
    if (reduced) return;
    let tick = series.length;
    const id = setInterval(() => {
      tick += 1;
      // A slow climb into the critical band and back out — the same shape the
      // rule engine is built to catch.
      const phase = (tick % 90) / 90;
      const swell = phase > 0.45 && phase < 0.72 ? (phase - 0.45) * 150 : 0;
      const next = 48 + 12 * Math.sin(tick / 4) + 5 * Math.sin(tick / 1.7) + swell;
      setSeries((prev) => [...prev.slice(1), Math.max(8, Math.min(98, next))]);
    }, 620);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const value = series[series.length - 1];
  const level = value >= CRIT_AT ? 'crit' : value >= WARN_AT ? 'warn' : 'good';
  const colour =
    level === 'crit' ? 'var(--color-crit)' : level === 'warn' ? 'var(--color-warn)' : 'var(--color-series)';

  const W = 260;
  const H = 64;
  const points = series
    .map((v, i) => `${((i / (series.length - 1)) * W).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`)
    .join(' ');

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-wide text-ink-subtle uppercase">
          prod-api-01 · cpu
        </span>
        <span className="font-mono text-[13px] tabular-nums" style={{ color: colour }}>
          {value.toFixed(1)}
          <span className="ml-0.5 text-[10px] text-ink-subtle">%</span>
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="pillar-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity={0.2} />
            <stop offset="100%" stopColor={colour} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[WARN_AT, CRIT_AT].map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={H - (t / 100) * H}
            y2={H - (t / 100) * H}
            stroke={t === CRIT_AT ? 'var(--color-crit)' : 'var(--color-warn)'}
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.34}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon points={`0,${H} ${points} ${W},${H}`} fill="url(#pillar-fill)" />
        <polyline
          points={points}
          fill="none"
          stroke={colour}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-2 h-4.5">
        {level !== 'good' && (
          <motion.span
            initial={reduced ? false : { opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[10px]"
            style={{
              background:
                level === 'crit' ? 'rgba(208,59,59,0.12)' : 'rgba(250,178,25,0.12)',
              color: level === 'crit' ? 'var(--color-crit-text)' : 'var(--color-warn-text)',
            }}
          >
            {level === 'crit' ? 'threshold breached → incident' : 'approaching threshold'}
          </motion.span>
        )}
      </div>
    </div>
  );
}

/* --- 02 · logs ------------------------------------------------------------ */

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const LOG_POOL: [LogLevel, string, string][] = [
  ['INFO', 'api', 'GET /v1/orders 200 41ms'],
  ['INFO', 'worker', 'job 8812 finished in 1.2s'],
  ['WARN', 'api', 'connection pool near capacity 18/20'],
  ['ERROR', 'db', 'connection refused 10.0.1.5:5432'],
  ['INFO', 'web', 'cache hit ratio 0.94'],
  ['WARN', 'api', 'p95 latency 412ms (>300ms budget)'],
  ['ERROR', 'api', 'upstream timeout after 3000ms'],
  ['INFO', 'cache', 'evicted 1204 keys'],
  ['INFO', 'web', 'GET /health 200 3ms'],
  ['WARN', 'worker', 'retrying job 8814 (attempt 2)'],
];

const LOG_COLOUR: Record<LogLevel, string> = {
  INFO: 'var(--color-ink-subtle)',
  WARN: 'var(--color-warn-text)',
  ERROR: 'var(--color-crit-text)',
};

interface LogLine {
  id: number;
  at: string;
  level: LogLevel;
  source: string;
  text: string;
}

function makeLine(id: number): LogLine {
  const [level, source, text] = LOG_POOL[id % LOG_POOL.length];
  const d = new Date(Date.now() - (6 - (id % 7)) * 1000);
  return {
    id,
    at: d.toTimeString().slice(0, 8),
    level,
    source,
    text,
  };
}

function LogDemo() {
  const reduced = useReducedMotion();
  const [lines, setLines] = useState<LogLine[]>(() =>
    Array.from({ length: 6 }, (_, i) => makeLine(i)),
  );
  const seed = useRef(6);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setLines((prev) => [...prev.slice(1), makeLine(seed.current++)]);
    }, 1400);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-ink-subtle uppercase">
          live tail
        </span>
        <span className="flex items-center gap-1.5">
          <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-good" />
          <span className="font-mono text-[10px] text-ink-subtle">streaming</span>
        </span>
      </div>

      <div className="space-y-0.75 overflow-hidden">
        {lines.map((l, i) => (
          <div
            key={l.id}
            className={cn(
              'flex items-baseline gap-2 rounded-sm px-1 py-0.75 font-mono text-[10.5px] whitespace-nowrap',
              i === lines.length - 1 && !reduced && 'flash-in',
            )}
            style={{ opacity: 0.45 + (i / lines.length) * 0.55 }}
          >
            <span className="shrink-0 text-ink-subtle">{l.at}</span>
            <span className="w-9.5 shrink-0" style={{ color: LOG_COLOUR[l.level] }}>
              {l.level}
            </span>
            <span className="shrink-0 text-ink-muted">{l.source}</span>
            <span className="truncate text-ink-muted/80">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- 03 · traces ---------------------------------------------------------- */

interface Span {
  name: string;
  start: number;
  dur: number;
  slow?: boolean;
}

const SPANS: Span[] = [
  { name: 'POST /v1/checkout', start: 0, dur: 580 },
  { name: 'auth.verify', start: 12, dur: 28 },
  { name: 'db.query orders', start: 60, dur: 120 },
  { name: 'payments.charge', start: 190, dur: 330, slow: true },
  { name: 'db.insert receipt', start: 522, dur: 26 },
  { name: 'queue.publish', start: 552, dur: 26 },
];

const TOTAL = 600;

function TraceDemo() {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const depth = useMemo(() => SPANS.map((_, i) => (i === 0 ? 0 : 1)), []);

  return (
    <div onPointerLeave={() => setHover(null)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-ink-subtle uppercase">
          trace 7f31c2 · 580ms
        </span>
        <span className="font-mono text-[10px] text-ink-subtle">
          {hover === null ? '6 spans' : `${SPANS[hover].dur}ms`}
        </span>
      </div>

      <div className="space-y-1.25">
        {SPANS.map((s, i) => {
          const dim = hover !== null && hover !== i;
          const colour = s.slow ? 'var(--color-crit)' : 'var(--color-series)';
          return (
            <div
              key={s.name}
              onPointerEnter={() => setHover(i)}
              className="group flex items-center gap-2"
              style={{ opacity: dim ? 0.32 : 1, transition: 'opacity 160ms ease-out' }}
            >
              <span
                className="w-26 shrink-0 truncate font-mono text-[10px]"
                style={{ color: hover === i ? 'var(--color-ink)' : 'var(--color-ink-muted)' }}
              >
                {'  '.repeat(depth[i])}
                {s.name}
              </span>
              <span className="relative h-1.75 flex-1 rounded-sm bg-elevated">
                <motion.span
                  className="absolute inset-y-0 rounded-sm"
                  style={{ background: colour, left: `${(s.start / TOTAL) * 100}%` }}
                  initial={reduced ? false : { width: 0 }}
                  whileInView={{ width: `${(s.dur / TOTAL) * 100}%` }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.6, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 font-mono text-[10px] text-ink-subtle">
        payments.charge — 57% of the request
      </p>
    </div>
  );
}
