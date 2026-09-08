import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { LEVEL, METRICS, SERIES, levelForMetric, type Level } from '@/lib/status';
import { Sparkline } from '@/components/ui';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   The fleet, as a table.

   This replaces a grid of six large cards. The cards gave every host identical
   billing regardless of whether it was on fire, put them in whatever order the
   API returned, and fit four on a screen — so during an incident the one box
   you needed was as likely as not below the fold, in the middle of five that
   were fine.

   A table sorts. The default is worst-first, which means the answer to "what
   is broken" is always row one, and every column shares a baseline so you can
   compare fifteen hosts by running your eye down rather than reading each card.
--------------------------------------------------------------------------- */

export interface FleetRow {
  serverId: string;
  cpu: number;
  memory: number;
  disk: number;
  latencyMs: number;
  /** Open incidents on this host — the count and the worst severity. */
  alerts: number;
  alertLevel: Level;
  /** Combined health: the worse of "metrics right now" and "open incidents". */
  level: Level;
  history: number[];
}

type SortKey = 'level' | 'serverId' | 'cpu' | 'memory' | 'disk' | 'latencyMs' | 'alerts';

const RANK: Record<Level, number> = { critical: 4, serious: 3, warn: 2, neutral: 1, good: 0 };

const COLUMNS: { key: SortKey; label: string; align?: 'right'; width?: string }[] = [
  { key: 'serverId', label: 'Host' },
  { key: 'cpu', label: 'CPU', align: 'right', width: 'w-30' },
  { key: 'memory', label: 'Memory', align: 'right', width: 'w-30' },
  { key: 'disk', label: 'Disk', align: 'right', width: 'w-30' },
  { key: 'latencyMs', label: 'Latency', align: 'right', width: 'w-24' },
  { key: 'alerts', label: 'Alerts', align: 'right', width: 'w-20' },
];

export function FleetTable({ rows }: { rows: FleetRow[] }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'level', desc: true });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let d: number;
      if (sort.key === 'level') {
        // Severity first, then the hottest CPU inside each severity band, so
        // the top of the table is always the most alarming host in the fleet.
        d = RANK[a.level] - RANK[b.level] || a.cpu - b.cpu;
      } else if (sort.key === 'serverId') {
        d = a.serverId.localeCompare(b.serverId);
      } else {
        d = (a[sort.key] as number) - (b[sort.key] as number);
      }
      return sort.desc ? -d : d;
    });
    return copy;
  }, [rows, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line bg-inset/60">
            <th className="w-8" />
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  className={cn(
                    'px-3 py-1.5 text-[10px] font-medium tracking-wider whitespace-nowrap uppercase',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.width,
                  )}
                >
                  <button
                    onClick={() => toggle(c.key)}
                    className={cn(
                      'inline-flex items-center gap-1 transition-colors',
                      active ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted',
                    )}
                  >
                    {c.align === 'right' && active && <SortArrow desc={sort.desc} />}
                    {c.label}
                    {c.align !== 'right' && active && <SortArrow desc={sort.desc} />}
                  </button>
                </th>
              );
            })}
            <th className="w-32 px-3 py-1.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
              CPU trend
            </th>
            <th className="w-8" />
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => {
            const token = LEVEL[row.level];
            return (
              <tr
                key={row.serverId}
                onClick={() => navigate(`/server/${row.serverId}`)}
                className="group cursor-pointer border-b border-line/50 transition-colors last:border-0 hover:bg-row"
              >
                {/* Severity rail: the whole row doesn't need to turn red, a 2px
                    edge is enough to spot while scrolling. */}
                <td className="relative py-0 pl-3">
                  <span
                    className="absolute inset-y-0 left-0 w-0.5"
                    style={{
                      background: token.mark,
                      opacity: row.level === 'good' ? 0.25 : 1,
                    }}
                  />
                  <span
                    className={cn('block h-1.5 w-1.5 rounded-full', row.level !== 'good' && 'pulse-dot')}
                    style={{ background: token.mark }}
                    title={token.label}
                  />
                </td>

                <td className="px-3 py-2 font-mono text-[12.5px] whitespace-nowrap text-ink">
                  {row.serverId}
                </td>

                <MetricCell value={row.cpu} spec="cpu" />
                <MetricCell value={row.memory} spec="memory" />
                <MetricCell value={row.disk} spec="disk" />
                <MetricCell value={row.latencyMs} spec="latencyMs" />

                <td className="px-3 py-2 text-right">
                  {row.alerts > 0 ? (
                    <span
                      className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums"
                      style={{
                        background: LEVEL[row.alertLevel].tint,
                        color: LEVEL[row.alertLevel].text,
                      }}
                    >
                      {row.alerts}
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-ink-subtle">—</span>
                  )}
                </td>

                <td className="px-3 py-1">
                  {/* Only drawn once there is a shape to draw. The old card
                      rendered a flat line while history was still filling,
                      which read as "this host is idle" rather than "no data
                      yet". */}
                  {row.history.length >= 3 ? (
                    <Sparkline
                      data={row.history}
                      width={104}
                      height={22}
                      max={100}
                      color={SERIES}
                      guides={[{ value: METRICS.cpu.critical, color: LEVEL.critical.mark }]}
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-ink-subtle">collecting…</span>
                  )}
                </td>

                <td className="pr-3 text-right">
                  <ChevronRight
                    size={13}
                    className="inline text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A number, its unit, and a hairline bar underneath it — the bar is what lets
 *  you compare a column of hosts without reading any of the numbers. */
function MetricCell({ value, spec }: { value: number; spec: keyof typeof METRICS }) {
  const meta = METRICS[spec];
  const level = levelForMetric(meta, value);
  const token = LEVEL[level];
  const pct = Math.min((value / meta.max) * 100, 100);

  return (
    <td className="px-3 py-2 text-right align-middle">
      <div className="flex flex-col items-end gap-1">
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: level === 'good' ? 'var(--color-ink-muted)' : token.text }}
        >
          {value.toFixed(meta.unit === 'ms' ? 0 : 1)}
          <span className="ml-0.5 text-[9px] text-ink-subtle">{meta.unit}</span>
        </span>
        <span className="h-0.5 w-full max-w-16 overflow-hidden rounded-full bg-inset">
          <span
            className="block h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%`, background: token.mark, opacity: level === 'good' ? 0.55 : 1 }}
          />
        </span>
      </div>
    </td>
  );
}

function SortArrow({ desc }: { desc: boolean }) {
  const Icon = desc ? ArrowDown : ArrowUp;
  return <Icon size={10} className="shrink-0" />;
}
