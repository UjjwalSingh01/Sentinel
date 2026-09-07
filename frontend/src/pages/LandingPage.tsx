import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'motion/react';
import { ArrowRight, Radar, Shield, Sparkles } from 'lucide-react';
import { isAuthenticated } from '@/lib/auth';
import { useFinePointer, useSpotlight } from '@/lib/pointer';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui';
import { Reticle } from '@/components/landing/Reticle';
import { FleetLattice } from '@/components/landing/FleetLattice';
import { SignalPipeline } from '@/components/landing/SignalPipeline';
import { PillarShowcase } from '@/components/landing/PillarShowcase';
import { ProbePanel } from '@/components/landing/ProbePanel';

/* ---------------------------------------------------------------------------
   Landing page.

   Same design system as the console — near-black surfaces, hairlines instead
   of shadows, Inter for prose and JetBrains Mono for anything a machine would
   have printed — and the same colour discipline: green/amber/red appear only
   where they describe the health of a value, never on a button or a heading.

   What the page adds is a cursor. The product's whole promise is "point at
   your infrastructure and it answers", so pointing is the interaction the
   page is built around: a reticle that names what it is over, a hero field
   that resolves hosts as you sweep it, panels that light their hairline where
   you are, a pipeline you scrub by hovering. All of it is gated on a fine
   pointer and collapses cleanly under prefers-reduced-motion.
--------------------------------------------------------------------------- */

const NAV = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'signals', label: 'Signals' },
  { id: 'incident', label: 'Incident' },
  { id: 'stack', label: 'Stack' },
];

export function LandingPage() {
  const fine = useFinePointer();
  const authed = isAuthenticated();

  return (
    <div className={cn('relative min-h-screen overflow-x-clip bg-canvas', fine && 'cursor-none')}>
      <ScrollRail />
      <Reticle />
      <TopBar authed={authed} />

      <main>
        <Hero authed={authed} fine={fine} />

        <Section
          id="pipeline"
          n="01"
          kicker="Pipeline"
          title="One number's journey to a 3am page."
          note="hover a stage to pin it"
        >
          <SignalPipeline />
        </Section>

        <Section
          id="signals"
          n="02"
          kicker="Signals"
          title="Three pillars, wired to each other."
          note="live sample data"
        >
          <PillarShowcase />
        </Section>

        <Section
          id="incident"
          n="03"
          kicker="Incident"
          title="It arrives with its homework already done."
        >
          <IncidentAnatomy />
        </Section>

        <Section id="stack" n="04" kicker="Stack" title="Boring parts, chosen on purpose.">
          <Manifest />
        </Section>

        <CallToAction authed={authed} />
      </main>

      <footer className="border-t border-line px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 font-mono text-[11px] text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>Sentinel · observability &amp; incident response</span>
          <span>FastAPI · TimescaleDB · Redpanda · React</span>
        </div>
      </footer>
    </div>
  );
}

/* --- chrome --------------------------------------------------------------- */

/** A hairline at the very top that fills as you read. The page's own progress meter. */
function ScrollRail() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 240, damping: 36, mass: 0.6 });

  return (
    <motion.div
      aria-hidden
      className="fixed top-0 right-0 left-0 z-50 h-px origin-left"
      style={{ scaleX, background: 'var(--color-series)' }}
    />
  );
}

function TopBar({ authed }: { authed: boolean }) {
  const { scrollY } = useScroll();
  const [lifted, setLifted] = useState(false);
  useMotionValueEvent(scrollY, 'change', (v) => setLifted(v > 24));

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        lifted ? 'border-b border-line bg-canvas/80 backdrop-blur-md' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <div className="flex items-center gap-2.5" data-probe="sentinel">
          <div className="grid h-7 w-7 place-items-center rounded-md border border-line bg-card">
            <Shield size={14} className="text-ink" />
          </div>
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Sentinel</span>
        </div>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <AnchorLink key={item.id} id={item.id}>
              {item.label}
            </AnchorLink>
          ))}
        </nav>

        <Link
          to={authed ? '/' : '/login'}
          data-probe={authed ? 'open console' : 'sign in'}
          className="ml-auto rounded-md border border-line bg-elevated px-3 py-1.5 text-[13px] text-ink transition-colors duration-150 hover:border-line-strong"
        >
          {authed ? 'Open console' : 'Sign in'}
        </Link>
      </div>
    </header>
  );
}

function AnchorLink({ id, children }: { id: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <a
      href={`#${id}`}
      data-probe={id}
      onClick={(e) => {
        e.preventDefault();
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }}
      className="rounded px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors duration-150 hover:text-ink"
    >
      {children}
    </a>
  );
}

/* --- hero ----------------------------------------------------------------- */

const FACTS: [string, string][] = [
  ['fleet', '7 hosts'],
  ['cadence', '3s'],
  ['signals', 'metrics · logs · traces'],
  ['delivery', 'SSE push · on-call email'],
];

function Hero({ authed, fine }: { authed: boolean; fine: boolean }) {
  const reduced = useReducedMotion();
  const cta = useSpotlight<HTMLAnchorElement>(0.3);

  return (
    <section className="relative flex min-h-svh flex-col justify-center overflow-hidden pt-24 pb-14">
      {/* The field. Everything under the copy is one canvas, and the cursor is
          the only thing that resolves it. */}
      <FleetLattice className="absolute inset-0 h-full w-full" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--color-canvas))' }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <motion.div
          initial={reduced ? false : 'hidden'}
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
        >
          <Rise>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 py-1 pr-3 pl-1.5 backdrop-blur-sm">
              <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-good" />
              <span className="font-mono text-[10.5px] tracking-[0.14em] text-ink-muted uppercase">
                signal-first observability
              </span>
            </div>
          </Rise>

          <Rise>
            {/* The mono word is the tell: this is a console, and the thing it
                does best is the verb set in the machine's own typeface. */}
            <h1 className="max-w-[16ch] text-[clamp(2.6rem,7.4vw,5.5rem)] leading-[0.94] font-semibold tracking-[-0.045em] text-ink">
              The console that{' '}
              <span className="font-mono tracking-[-0.06em]">notices</span> first.
            </h1>
          </Rise>

          <Rise>
            <p className="mt-7 max-w-xl text-[16px] leading-relaxed text-ink-muted text-balance">
              Sentinel watches every host in the fleet, catches the anomaly while the sample is
              still in memory, and hands whoever is on call an incident that already has the logs,
              the traces and an explanation attached.
            </p>
          </Rise>

          <Rise>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                ref={cta}
                to={authed ? '/' : '/login'}
                data-probe={authed ? 'open console' : 'open console'}
                style={{ transition: 'transform 280ms var(--ease-out-quint)' }}
                className="group inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-[13.5px] font-medium text-canvas transition-colors duration-150 hover:bg-white"
              >
                Open the console
                <ArrowRight
                  size={14}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
              <AnchorButton id="pipeline">See how it works</AnchorButton>
            </div>
          </Rise>

          {fine && (
            <Rise>
              <p className="mt-6 flex items-center gap-2 font-mono text-[11px] text-ink-subtle">
                <Radar size={12} />
                sweep the field — every host answers when you point at it
              </p>
            </Rise>
          )}
        </motion.div>
      </div>

      {/* Fact rail. Mono, hairline-separated, no icons — it reads like a spec
          sheet because that is what it is. */}
      <div className="relative mx-auto mt-16 w-full max-w-6xl px-6">
        <motion.dl
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 border-t border-line md:grid-cols-4"
        >
          {FACTS.map(([k, v], i) => (
            <div
              key={k}
              className={cn(
                'px-4 py-4 first:pl-0',
                i > 0 && 'border-l border-line',
                i === 2 && 'border-l-0 md:border-l',
                i >= 2 && 'border-t border-line md:border-t-0',
              )}
            >
              <dt className="font-mono text-[10px] tracking-[0.14em] text-ink-subtle uppercase">
                {k}
              </dt>
              <dd className="mt-1.5 font-mono text-[12.5px] text-ink">{v}</dd>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}

function Rise({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}

function AnchorButton({ id, children }: { id: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <a
      href={`#${id}`}
      data-probe={id}
      onClick={(e) => {
        e.preventDefault();
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }}
      className="inline-flex items-center gap-2 rounded-md border border-line bg-elevated px-4 py-2.5 text-[13.5px] text-ink transition-colors duration-150 hover:border-line-strong"
    >
      {children}
    </a>
  );
}

/* --- section frame -------------------------------------------------------- */

function Section({
  id,
  n,
  kicker,
  title,
  note,
  children,
}: {
  id: string;
  n: string;
  kicker: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <section id={id} className="scroll-mt-20 border-t border-line px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-[10px] tracking-[0.18em] text-ink-subtle uppercase">
              {n} / {kicker}
            </span>
            {note && (
              <span className="hidden font-mono text-[10px] text-ink-subtle sm:inline">{note}</span>
            )}
          </div>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.7rem,3.6vw,2.6rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-ink text-balance">
            {title}
          </h2>
        </motion.div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12"
        >
          {children}
        </motion.div>
      </div>
    </section>
  );
}

/* --- 03 · incident anatomy ------------------------------------------------ */

const TIMELINE: [string, string, string][] = [
  [
    'T+0.0s',
    'The sample crosses the line',
    'prod-api-01 reports 91.4% CPU. The processor still holds the two windows before it, so it knows this is a trend and not a blip.',
  ],
  [
    'T+0.1s',
    'The incident opens',
    'Severity, host, the rule that fired and the value that tripped it, written in one transaction — and deduplicated against anything already open for that host.',
  ],
  [
    'T+1.2s',
    'Evidence gets attached',
    'Log lines from the same minute and the slowest traces overlapping the window are linked to the incident, not left for someone to go find later.',
  ],
  [
    'T+3.0s',
    'Gemini writes the summary',
    'A plain-English read on what the metric, the logs and the spans have in common, so the first thing you see is a hypothesis.',
  ],
  [
    'T+3.1s',
    'Every open tab updates',
    'Redis publishes, the API pushes over SSE, and the dashboard renders the incident without anyone reloading anything.',
  ],
  [
    'T+15m',
    'Nobody acknowledged',
    'The on-call schedule decides who gets the email — and who gets the second one when the first goes unanswered.',
  ],
];

function IncidentAnatomy() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-14">
      <ol>
        {TIMELINE.map(([t, title, body], i) => (
          <TimelineRow key={t + title} at={t} title={title} body={body} last={i === TIMELINE.length - 1} />
        ))}
      </ol>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <IncidentCard />
      </div>
    </div>
  );
}

function TimelineRow({
  at,
  title,
  body,
  last,
}: {
  at: string;
  title: string;
  body: string;
  last: boolean;
}) {
  const ref = useSpotlight<HTMLLIElement>();

  return (
    <li ref={ref} data-probe={at} className={cn('relative flex gap-5 sm:gap-6', last ? 'pb-0' : 'pb-8')}>
      <span className="w-13 shrink-0 pt-px text-right font-mono text-[11px] text-ink-subtle sm:w-16">
        {at}
      </span>

      {/* Marker and spine share a column, so the hairline is guaranteed to run
          through the middle of every dot no matter how the rows resize. */}
      <span aria-hidden className="relative flex w-1.75 shrink-0 justify-center">
        <span
          className="relative z-10 mt-1.25 h-1.75 w-1.75 shrink-0 self-start rounded-full bg-line-strong"
          style={{
            // The marker fills in as the cursor comes near it — the row you are
            // reading is the row that is lit.
            boxShadow:
              'inset 0 0 0 3px color-mix(in srgb, var(--color-series) calc(var(--near, 0) * 100%), transparent)',
          }}
        />
        {!last && <span className="absolute top-4.5 -bottom-10 w-px bg-line" />}
      </span>

      <div className="min-w-0 pb-0">
        <h3 className="text-[14px] font-medium text-ink">{title}</h3>
        <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-ink-muted">{body}</p>
      </div>
    </li>
  );
}

function IncidentCard() {
  return (
    <ProbePanel probe="INC-4417" tint="var(--color-crit)" className="p-5">
      <div className="flex items-center gap-2">
        <StatusBadge level="critical">Critical</StatusBadge>
        <span className="font-mono text-[11px] text-ink-subtle">INC-4417</span>
        <span className="ml-auto font-mono text-[11px] text-ink-subtle">2m ago</span>
      </div>

      <h3 className="mt-3.5 text-[15px] leading-snug font-medium text-ink">
        CPU sustained above 90% on prod-api-01
      </h3>
      <p className="mt-1 font-mono text-[11px] text-ink-subtle">
        rule · api cpu &gt; 85% for 60s
      </p>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <Readout label="CPU" value="94.2" unit="%" level="crit" />
        <Readout label="Memory" value="71.0" unit="%" level="warn" />
        <Readout label="Latency" value="612" unit="ms" level="warn" />
      </div>

      <div className="mt-5 rounded-md border border-line bg-inset p-3.5">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-ink-subtle" />
          <span className="font-mono text-[10px] tracking-[0.12em] text-ink-subtle uppercase">
            AI summary
          </span>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
          CPU climbed with request latency while the error log filled with upstream timeouts from
          the payments call. The traces agree: <span className="font-mono text-[11.5px] text-series-text">payments.charge</span>{' '}
          accounts for 57% of the slowest request in this window. Likely a downstream dependency,
          not local saturation.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2" aria-hidden>
        <span className="rounded-md bg-ink px-2.5 py-1.5 text-[12px] font-medium text-canvas">
          Acknowledge
        </span>
        <span className="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[12px] text-ink-muted">
          Open traces
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-subtle">42 logs · 6 spans</span>
      </div>
    </ProbePanel>
  );
}

function Readout({
  label,
  value,
  unit,
  level,
}: {
  label: string;
  value: string;
  unit: string;
  level: 'crit' | 'warn';
}) {
  const colour = level === 'crit' ? 'var(--color-crit-text)' : 'var(--color-warn-text)';
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.1em] text-ink-subtle uppercase">{label}</div>
      <div className="mt-1 font-mono text-[15px] tabular-nums" style={{ color: colour }}>
        {value}
        <span className="ml-0.5 text-[10px] text-ink-subtle">{unit}</span>
      </div>
    </div>
  );
}

/* --- 04 · stack manifest -------------------------------------------------- */

const MANIFEST: [string, string, string][] = [
  ['ingest', 'FastAPI', 'Pydantic-validated at the edge; the hot path never waits on a write.'],
  ['transport', 'Redpanda', 'Kafka API, durable and replayable. A restart resumes at its offset.'],
  ['storage', 'TimescaleDB', 'Hypertables chunked by time, GIN-indexed for full-text log search.'],
  ['query', 'Strawberry GraphQL', 'One typed schema the dashboard, the palette and the widgets share.'],
  ['live', 'Redis → SSE', 'Pub/sub fans an incident out to every open browser in one hop.'],
  ['reasoning', 'Gemini', 'Summaries written from the incident’s own metrics, logs and spans.'],
  ['paging', 'On-call schedule', 'Rotation, acknowledgement window, and escalation when it lapses.'],
  ['ship', 'Docker · Nginx · Actions', 'One compose file up, eleven containers, CI on every push.'],
];

function Manifest() {
  const ref = useSpotlight<HTMLDivElement>();

  return (
    <div ref={ref} className="relative">
      {/* The grid is drawn by the gap: cells sit on a hairline-coloured surface,
          so the rules are one pixel of background rather than sixteen borders. */}
      <div className="relative grid gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-2 lg:grid-cols-4">
        {MANIFEST.map(([key, tech, body]) => (
          <div key={key} className="bg-card p-5">
            <div className="font-mono text-[10px] tracking-[0.16em] text-ink-subtle uppercase">
              {key}
            </div>
            <div className="mt-2 text-[14px] font-medium text-ink">{tech}</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
          </div>
        ))}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(260px circle at var(--px, -999px) var(--py, -999px), rgba(57,135,229,0.06), transparent 70%)',
            opacity: 'var(--near, 0)',
          }}
        />
      </div>
    </div>
  );
}

/* --- close ---------------------------------------------------------------- */

function CallToAction({ authed }: { authed: boolean }) {
  const reduced = useReducedMotion();
  const cta = useSpotlight<HTMLAnchorElement>(0.3);
  const [seconds, setSeconds] = useState(0);

  // A quiet counter: the demo fleet really is emitting while you read this.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <section className="border-t border-line px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <h2 className="text-[clamp(2rem,5vw,3.4rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-ink text-balance">
            Point at your infrastructure.
          </h2>
          <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-ink-muted">
            The demo fleet is already running. Sign in and you land on seven live hosts, whatever
            they happen to be doing right now.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              ref={cta}
              to={authed ? '/' : '/login'}
              data-probe={authed ? 'open console' : 'sign in'}
              style={{ transition: 'transform 280ms var(--ease-out-quint)' }}
              className="group inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 text-[14px] font-medium text-canvas transition-colors duration-150 hover:bg-white"
            >
              {authed ? 'Open console' : 'Sign in'}
              <ArrowRight
                size={15}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
            <span className="font-mono text-[11.5px] text-ink-subtle">
              admin@sentinel.io · sentinel123
            </span>
          </div>

          <p className="mt-10 font-mono text-[11px] text-ink-subtle tabular-nums">
            {Math.floor(seconds / 3) * 7 || 0} samples ingested since you opened this page
          </p>
        </motion.div>
      </div>
    </section>
  );
}
