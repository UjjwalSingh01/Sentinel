import { useQuery } from '@apollo/client/react';
import { GitBranch, Loader2 } from 'lucide-react';
import { GET_INCIDENT_TRACES } from '@/graphql/traces';

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
  attributes: string | null;
}

interface Trace {
  traceId: string;
  serverId: string;
  rootName: string;
  rootDurationMs: number;
  spans: Span[];
}

function statusColor(status: string | null): string {
  if (!status) return 'bg-zinc-700';
  if (status === 'OK') return 'bg-emerald-500/70';
  return 'bg-red-500/70';
}

function orderSpansForWaterfall(spans: Span[]): Span[] {
  const root = spans.find((s) => !s.parentSpanId);
  if (!root) return spans;
  const byParent = new Map<string | null, Span[]>();
  for (const s of spans) {
    const list = byParent.get(s.parentSpanId) ?? [];
    list.push(s);
    byParent.set(s.parentSpanId, list);
  }
  const out: Span[] = [];
  const visit = (s: Span) => {
    out.push(s);
    const children = byParent.get(s.spanId) ?? [];
    for (const c of children) visit(c);
  };
  visit(root);
  return out;
}

function depthOf(span: Span, byId: Map<string, Span>): number {
  let depth = 0;
  let cur: Span | undefined = span;
  while (cur?.parentSpanId) {
    const parent = byId.get(cur.parentSpanId);
    if (!parent) break;
    depth += 1;
    cur = parent;
  }
  return depth;
}

interface TracesPanelProps {
  incidentId: string;
}

export function TracesPanel({ incidentId }: TracesPanelProps) {
  const { data, loading } = useQuery(GET_INCIDENT_TRACES, {
    variables: { incidentId },
  });

  const traces: Trace[] = (data as any)?.incidentTraces || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading traces…
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No exemplar traces captured for this incident.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {traces.map((trace) => {
        const ordered = orderSpansForWaterfall(trace.spans);
        const byId = new Map(trace.spans.map((s) => [s.spanId, s]));
        const total = trace.rootDurationMs || 1;
        return (
          <div key={trace.traceId} className="bg-zinc-800/60 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2 text-[11px]">
              <span className="font-mono text-muted-foreground" title={trace.traceId}>
                {trace.traceId.slice(0, 12)}…
              </span>
              <span className="text-foreground/80">
                <span className="font-semibold">{trace.rootName}</span>
                {' '}— {trace.rootDurationMs.toFixed(1)}ms
              </span>
            </div>
            <div className="space-y-0.5 font-mono text-[10px]">
              {ordered.map((s) => {
                const depth = depthOf(s, byId);
                const pct = Math.max(2, (s.durationMs / total) * 100);
                return (
                  <div key={s.spanId} className="flex items-center gap-2">
                    <div
                      className="text-muted-foreground truncate"
                      style={{ paddingLeft: `${depth * 12}px`, width: '220px' }}
                      title={`${s.service || ''} ${s.name}`}
                    >
                      {depth > 0 && <span className="opacity-50">↳ </span>}
                      {s.name}
                    </div>
                    <div className="flex-1 relative h-3 bg-zinc-900 rounded-sm overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 ${statusColor(s.status)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-16 text-right text-foreground/70">
                      {s.durationMs.toFixed(1)}ms
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1">
        <GitBranch size={10} /> Waterfall scaled to root span duration.
      </div>
    </div>
  );
}
