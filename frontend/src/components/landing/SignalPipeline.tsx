import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useSpotlight } from '@/lib/pointer';
import { snappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   The pipeline rail.

   A pulse walks the six stages on its own so the section is never static, and
   pointing at any stage takes the wheel — the walk stops, the rail fills to
   where you're pointing, and the detail below swaps. Hover is the transport
   control, which is a lot more honest than a carousel with arrows.
--------------------------------------------------------------------------- */

interface Stage {
  key: string;
  tech: string;
  role: string;
  body: string;
  wire: string;
}

const STAGES: Stage[] = [
  {
    key: 'simulator',
    tech: 'Python',
    role: 'emit',
    body: 'Seven servers emit CPU, memory, disk and latency every three seconds, alongside the log lines and request traces a real fleet would produce.',
    wire: 'POST /api/metrics  {"server_id":"prod-api-01","cpu":91.4}',
  },
  {
    key: 'ingestion',
    tech: 'FastAPI',
    role: 'accept',
    body: 'A thin front door validates the payload and hands it to the log. Nothing touches the database on the hot path, so a slow write can never back-pressure a collector.',
    wire: '202 Accepted → topic:metrics partition:2 offset:88214',
  },
  {
    key: 'redpanda',
    tech: 'Kafka API',
    role: 'buffer',
    body: 'The stream is durable and replayable. Restart the processor mid-incident and it picks up from its offset instead of losing the minutes that mattered.',
    wire: 'lag 0 · 7 partitions · retention 24h',
  },
  {
    key: 'processor',
    tech: 'asyncpg',
    role: 'evaluate',
    body: 'Samples land in TimescaleDB hypertables in batches, and the rule engine scores every one of them against your alert rules while it is still in memory.',
    wire: 'rule "api cpu > 85 for 60s" → BREACH (3/3 windows)',
  },
  {
    key: 'incident',
    tech: 'Gemini',
    role: 'assemble',
    body: 'A breach opens an incident and Sentinel packs the evidence itself: the log lines from that window, the slowest traces that overlap it, and a written explanation of what it thinks happened.',
    wire: 'INC-4417 opened · 42 log lines · 6 spans · summary ready',
  },
  {
    key: 'notify',
    tech: 'Redis · SMTP',
    role: 'deliver',
    body: 'Redis pub/sub pushes the incident to every open browser over SSE, and the on-call rotation gets the email. Nobody acknowledges in time, their manager gets one too.',
    wire: 'sse:incident.new → 3 clients · page alice@sentinel.io',
  },
];

export function SignalPipeline() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);
  const index = pinned ?? active;

  useEffect(() => {
    if (pinned !== null || reduced) return;
    const id = setInterval(() => setActive((i) => (i + 1) % STAGES.length), 2600);
    return () => clearInterval(id);
  }, [pinned, reduced]);

  const stage = STAGES[index];

  return (
    <div>
      {/* The rail. On narrow screens it turns vertical and the same fill logic
          runs down the left edge of the stack. */}
      <div className="relative">
        {/* Sits on the markers' centreline: the marker is 9px tall and starts
            at the top of the list, so 4px down is through its middle. */}
        <div className="absolute top-1 right-0 left-0 hidden h-px bg-line md:block" />
        <motion.div
          className="absolute top-1 left-0 hidden h-px md:block"
          style={{ background: 'var(--color-series)' }}
          animate={{ width: `${((index + 0.5) / STAGES.length) * 100}%` }}
          transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />

        <ol className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-6 md:gap-x-3">
          {STAGES.map((s, i) => (
            <StageCell
              key={s.key}
              stage={s}
              n={i}
              state={i === index ? 'active' : i < index ? 'past' : 'ahead'}
              onEnter={() => setPinned(i)}
              onLeave={() => setPinned(null)}
              onFocus={() => setPinned(i)}
              onBlur={() => setPinned(null)}
            />
          ))}
        </ol>
      </div>

      {/* Detail. Fixed height so swapping stages never reflows the page under
          the cursor — the one thing that would make hovering feel hostile. */}
      <div className="relative mt-10 min-h-55 sm:min-h-32.5 md:min-h-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={stage.key}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start"
          >
            <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted text-balance">
              {stage.body}
            </p>
            <div className="overflow-x-auto rounded-md border border-line bg-inset px-3 py-2.5">
              <code className="font-mono text-[11px] whitespace-nowrap text-series-text">
                {stage.wire}
              </code>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StageCell({
  stage,
  n,
  state,
  onEnter,
  onLeave,
  onFocus,
  onBlur,
}: {
  stage: Stage;
  n: number;
  state: 'active' | 'past' | 'ahead';
  onEnter: () => void;
  onLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const ref = useSpotlight<HTMLLIElement>();
  const active = state === 'active';

  return (
    <li
      ref={ref}
      data-probe={stage.key}
      tabIndex={0}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className="group relative rounded-md outline-none"
    >
      {/* Rail marker */}
      <div className="mb-4 flex items-center">
        <span
          className={cn(
            'relative grid h-2.25 w-2.25 place-items-center transition-colors duration-300',
            active ? 'bg-series' : state === 'past' ? 'bg-line-strong' : 'bg-line',
          )}
        >
          {active && (
            <motion.span
              layoutId="pipeline-halo"
              transition={snappy}
              className="absolute -inset-1.75 rounded-full border border-series/40"
            />
          )}
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink-subtle md:hidden">
          {String(n + 1).padStart(2, '0')}
        </span>
      </div>

      <div
        className="relative rounded-md px-2 py-1.5 -mx-2 transition-colors duration-200"
        style={{
          background:
            'radial-gradient(120px circle at var(--px, 50%) var(--py, 50%), color-mix(in srgb, var(--color-elevated) calc(var(--near, 0) * 100%), transparent), transparent 70%)',
        }}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="hidden font-mono text-[10px] text-ink-subtle md:inline">
            {String(n + 1).padStart(2, '0')}
          </span>
          <span
            className={cn(
              'font-mono text-[12px] font-medium transition-colors duration-200',
              active ? 'text-ink' : 'text-ink-muted group-hover:text-ink',
            )}
          >
            {stage.key}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-ink-subtle">
          {stage.role} · {stage.tech}
        </div>
      </div>
    </li>
  );
}
