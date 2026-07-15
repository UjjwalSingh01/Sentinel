import { useQuery } from '@apollo/client/react';
import { motion } from 'motion/react';
import { GitBranch } from 'lucide-react';
import { GET_INCIDENT_TRACES } from '@/graphql/traces';
import { LEVEL, SERIES } from '@/lib/status';
import { formatDuration } from '@/lib/format';
import { Skeleton } from '@/components/ui';

interface Span {
  time: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  serverId: string;
  service: string | null;
  name: string;
  durationMs: number;
  status: string | null;
}

interface Trace {
  traceId: string;
  serverId: string;
  rootName: string;
  rootDurationMs: number;
  spans: Span[];
}

/** Depth-first, so a child always renders directly under its parent. */
function flatten(spans: Span[]): { span: Span; depth: number }[] {
  const root = spans.find((s) => !s.parentSpanId);
  if (!root) return spans.map((span) => ({ span, depth: 0 }));

  const byParent = new Map<string | null, Span[]>();
  for (const s of spans) {
    const siblings = byParent.get(s.parentSpanId) ?? [];
    siblings.push(s);
    byParent.set(s.parentSpanId, siblings);
  }

  const out: { span: Span; depth: number }[] = [];
  const walk = (span: Span, depth: number) => {
    out.push({ span, depth });
    for (const child of byParent.get(span.spanId) ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  return out;
}

export function TracesPanel({ incidentId }: { incidentId: string }) {
  const { data, loading } = useQuery(GET_INCIDENT_TRACES, { variables: { incidentId } });
  const traces: Trace[] = (data as any)?.incidentTraces ?? [];

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-subtle">
        No exemplar traces were captured for this incident.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {traces.map((trace) => {
        const rows = flatten(trace.spans);
        const total = trace.rootDurationMs || 1;

        // The single slowest non-root span is the story of the trace — call it
        // out so the eye lands on the bottleneck instead of hunting for it.
        const slowest = rows
          .filter((r) => r.depth > 0)
          .reduce<Span | null>(
            (worst, r) => (!worst || r.span.durationMs > worst.durationMs ? r.span : worst),
            null,
          );

        return (
          <div key={trace.traceId} className="rounded-md border border-line bg-inset p-3">
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <span className="truncate font-mono text-[11px] font-medium text-ink">
                {trace.rootName}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-subtle tabular-nums">
                {formatDuration(trace.rootDurationMs)}
              </span>
            </div>

            <div className="space-y-1">
              {rows.map(({ span, depth }, i) => {
                const error = span.status && span.status !== 'OK';
                const isBottleneck = slowest?.spanId === span.spanId;
                const pct = Math.max(1.5, (span.durationMs / total) * 100);

                // Error → critical red. Bottleneck → amber (it's a warning, not a
                // failure). Everything else → the neutral series hue.
                const color = error
                  ? LEVEL.critical.mark
                  : isBottleneck
                    ? LEVEL.warn.mark
                    : SERIES;

                return (
                  <div key={span.spanId} className="flex items-center gap-2">
                    <div
                      className="w-44 shrink-0 truncate font-mono text-[10px] text-ink-muted"
                      style={{ paddingLeft: depth * 10 }}
                      title={`${span.service ?? ''} ${span.name}`}
                    >
                      {depth > 0 && <span className="text-ink-subtle">└ </span>}
                      {span.name}
                    </div>

                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-card">
                      <motion.div
                        className="absolute inset-y-0 left-0 rounded-sm"
                        style={{ background: color, opacity: error || isBottleneck ? 1 : 0.65 }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{
                          duration: 0.55,
                          delay: i * 0.05,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      />
                    </div>

                    <div
                      className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums"
                      style={{
                        color: error
                          ? LEVEL.critical.text
                          : isBottleneck
                            ? LEVEL.warn.text
                            : 'var(--color-ink-muted)',
                      }}
                    >
                      {formatDuration(span.durationMs)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="flex items-center gap-1.5 text-[10px] text-ink-subtle">
        <GitBranch size={10} />
        Bars are scaled to the root span. Amber marks the slowest child; red marks an error.
      </p>
    </div>
  );
}
