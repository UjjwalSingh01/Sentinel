import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import GridLayout, { type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, LayoutGrid, Pencil, Plus, Save, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { GET_DASHBOARD, UPDATE_DASHBOARD } from '@/graphql/dashboards';
import { GET_SERVERS } from '@/graphql/queries';
import { MetricChartWidget, type MetricChartConfig } from '@/components/widgets/MetricChartWidget';
import { LogPanelWidget, type LogPanelConfig } from '@/components/widgets/LogPanelWidget';
import { IncidentListWidget, type IncidentListConfig } from '@/components/widgets/IncidentListWidget';
import { Button, EmptyState, IconButton, Skeleton } from '@/components/ui';
import { LEVEL, levelForLogLevel } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type WidgetKind = 'metric_chart' | 'log_panel' | 'incident_list';
type WidgetConfigT = MetricChartConfig | LogPanelConfig | IncidentListConfig;

interface WidgetCell {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: WidgetKind;
  config: WidgetConfigT;
}

const DEFAULTS: Record<WidgetKind, WidgetConfigT> = {
  metric_chart: { serverId: '', metric: 'cpu', rangeMinutes: 30 },
  log_panel: { serverId: '', levels: ['ERROR', 'FATAL'], rangeMinutes: 15 },
  incident_list: { limit: 20 },
};

const KIND_LABEL: Record<WidgetKind, string> = {
  metric_chart: 'Metric chart',
  log_panel: 'Log panel',
  incident_list: 'Incident list',
};

function newWidget(type: WidgetKind, count: number): WidgetCell {
  return {
    i: `${type}-${Date.now()}-${count}`,
    x: (count * 4) % 12,
    y: Infinity, // drop it at the bottom
    w: 4,
    h: 4,
    type,
    config: structuredClone(DEFAULTS[type]),
  };
}

export function DashboardEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useQuery(GET_DASHBOARD, { variables: { id }, skip: !id });
  const { data: serversData } = useQuery(GET_SERVERS, { pollInterval: 30000 });
  const [updateDashboard] = useMutation(UPDATE_DASHBOARD);

  const servers: { serverId: string }[] = (serversData as any)?.servers ?? [];
  const dashboard = (data as any)?.dashboard;

  const [cells, setCells] = useState<WidgetCell[]>([]);
  const [editing, setEditing] = useState(false);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1200 : window.innerWidth - 288,
  );

  useEffect(() => {
    if (!dashboard) return;
    try {
      const parsed = JSON.parse(dashboard.layout) as WidgetCell[];
      setCells(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCells([]);
    }
  }, [dashboard]);

  // The grid needs a pixel width. Hard-coding it left the layout wrong on every
  // window that wasn't the author's, so track the viewport instead.
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth - 288);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const layout: LayoutItem[] = useMemo(
    () =>
      cells.map((c) => ({
        i: c.i,
        x: c.x,
        y: c.y === Infinity ? 100 : c.y,
        w: c.w,
        h: c.h,
        minW: 2,
        minH: 2,
      })),
    [cells],
  );

  const patchConfig = (i: string, patch: Partial<WidgetConfigT>) =>
    setCells((prev) =>
      prev.map((c) => (c.i === i ? { ...c, config: { ...c.config, ...patch } } : c)),
    );

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDashboard({ variables: { id, layout: JSON.stringify(cells) } });
      toast.success('Layout saved');
      setEditing(false);
      setConfiguring(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !dashboard) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboards"
            aria-label="Back to dashboards"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
          >
            <ArrowLeft size={15} />
          </Link>
          <div>
            <h1 className="text-[19px] leading-tight font-semibold tracking-[-0.01em] text-ink">
              {dashboard.name}
            </h1>
            <p className="mt-1 font-mono text-[11px] text-ink-subtle">
              Updated {formatDateTime(dashboard.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AnimatePresence>
            {editing && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-2"
              >
                {(Object.keys(KIND_LABEL) as WidgetKind[]).map((kind) => (
                  <Button
                    key={kind}
                    variant="ghost"
                    icon={Plus}
                    className="text-[12px]"
                    onClick={() => setCells((prev) => [...prev, newWidget(kind, prev.length)])}
                  >
                    {KIND_LABEL[kind]}
                  </Button>
                ))}
                <Button variant="primary" icon={Save} onClick={save} loading={saving}>
                  Save layout
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            variant={editing ? 'secondary' : 'primary'}
            icon={editing ? X : Pencil}
            onClick={() => {
              setEditing((v) => !v);
              setConfiguring(null);
            }}
          >
            {editing ? 'Done' : 'Edit'}
          </Button>
        </div>
      </div>

      {cells.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={LayoutGrid}
            title="This dashboard is empty"
            hint={
              editing
                ? 'Add a widget from the buttons above, then drag it into place.'
                : 'Switch to edit mode to add metric charts, log panels or incident lists.'
            }
            action={
              !editing && (
                <Button variant="primary" icon={Pencil} onClick={() => setEditing(true)}>
                  Edit dashboard
                </Button>
              )
            }
          />
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 48 }}
          dragConfig={{ enabled: editing, cancel: 'button, select, input, .nodrag' }}
          resizeConfig={{ enabled: editing }}
          width={Math.max(720, width)}
          onLayoutChange={(next: Layout) =>
            setCells((prev) =>
              prev.map((c) => {
                const l = next.find((n) => n.i === c.i);
                return l ? { ...c, x: l.x, y: l.y, w: l.w, h: l.h } : c;
              }),
            )
          }
        >
          {cells.map((cell) => (
            <div
              key={cell.i}
              className={cn(
                'overflow-hidden rounded-lg border bg-card p-3 transition-colors',
                editing ? 'border-line-strong' : 'border-line',
                editing && 'cursor-grab active:cursor-grabbing',
              )}
            >
              {editing && (
                <div className="nodrag mb-1 flex justify-end gap-0.5">
                  <IconButton
                    icon={Settings2}
                    label="Configure widget"
                    className="h-6 w-6"
                    onClick={() => setConfiguring(configuring === cell.i ? null : cell.i)}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Remove widget"
                    className="h-6 w-6 hover:text-crit-text"
                    onClick={() => setCells((prev) => prev.filter((c) => c.i !== cell.i))}
                  />
                </div>
              )}

              {editing && configuring === cell.i ? (
                <WidgetConfig
                  cell={cell}
                  servers={servers}
                  onChange={(patch) => patchConfig(cell.i, patch)}
                  onClose={() => setConfiguring(null)}
                />
              ) : (
                <div className={editing ? 'h-[calc(100%-1.75rem)]' : 'h-full'}>
                  {cell.type === 'metric_chart' && (
                    <MetricChartWidget config={cell.config as MetricChartConfig} />
                  )}
                  {cell.type === 'log_panel' && (
                    <LogPanelWidget config={cell.config as LogPanelConfig} />
                  )}
                  {cell.type === 'incident_list' && (
                    <IncidentListWidget config={cell.config as IncidentListConfig} />
                  )}
                </div>
              )}
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}

/* --- Per-widget settings ------------------------------------------------- */

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

function ConfigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-medium tracking-wider text-ink-subtle uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function WidgetConfig({
  cell,
  servers,
  onChange,
  onClose,
}: {
  cell: WidgetCell;
  servers: { serverId: string }[];
  onChange: (patch: Partial<WidgetConfigT>) => void;
  onClose: () => void;
}) {
  return (
    <div className="nodrag h-[calc(100%-1.75rem)] overflow-auto rounded-md border border-line bg-inset p-2.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
          {KIND_LABEL[cell.type]}
        </span>
        <button onClick={onClose} className="text-ink-subtle transition-colors hover:text-ink">
          <X size={12} />
        </button>
      </div>

      {cell.type === 'metric_chart' && (
        <div className="space-y-2">
          <ConfigField label="server">
            <select
              value={(cell.config as MetricChartConfig).serverId}
              onChange={(e) => onChange({ serverId: e.target.value } as Partial<MetricChartConfig>)}
              className="field py-1 text-[11px]"
            >
              <option value="">Pick a server…</option>
              {servers.map((s) => (
                <option key={s.serverId} value={s.serverId}>
                  {s.serverId}
                </option>
              ))}
            </select>
          </ConfigField>
          <ConfigField label="metric">
            <select
              value={(cell.config as MetricChartConfig).metric}
              onChange={(e) =>
                onChange({ metric: e.target.value as MetricChartConfig['metric'] })
              }
              className="field py-1 text-[11px]"
            >
              <option value="cpu">cpu</option>
              <option value="memory">memory</option>
              <option value="disk">disk</option>
              <option value="latencyMs">latency</option>
            </select>
          </ConfigField>
          <ConfigField label="range (minutes)">
            <input
              type="number"
              value={(cell.config as MetricChartConfig).rangeMinutes ?? 30}
              onChange={(e) =>
                onChange({ rangeMinutes: Number(e.target.value) } as Partial<MetricChartConfig>)
              }
              className="field py-1 font-mono text-[11px]"
            />
          </ConfigField>
        </div>
      )}

      {cell.type === 'log_panel' && (
        <div className="space-y-2">
          <ConfigField label="server">
            <select
              value={(cell.config as LogPanelConfig).serverId ?? ''}
              onChange={(e) =>
                onChange({ serverId: e.target.value || undefined } as Partial<LogPanelConfig>)
              }
              className="field py-1 text-[11px]"
            >
              <option value="">All servers</option>
              {servers.map((s) => (
                <option key={s.serverId} value={s.serverId}>
                  {s.serverId}
                </option>
              ))}
            </select>
          </ConfigField>
          <ConfigField label="levels">
            <div className="flex flex-wrap gap-1">
              {LOG_LEVELS.map((lvl) => {
                const current = (cell.config as LogPanelConfig).levels ?? [];
                const active = current.includes(lvl);
                const token = LEVEL[levelForLogLevel(lvl)];
                return (
                  <button
                    key={lvl}
                    onClick={() =>
                      onChange({
                        levels: active ? current.filter((l) => l !== lvl) : [...current, lvl],
                      } as Partial<LogPanelConfig>)
                    }
                    className={cn(
                      'rounded px-1.5 py-0.5 font-mono text-[9px] font-medium transition-colors',
                      !active && 'bg-card text-ink-subtle hover:text-ink',
                    )}
                    style={active ? { background: token.tint, color: token.text } : undefined}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </ConfigField>
        </div>
      )}

      {cell.type === 'incident_list' && (
        <div className="space-y-2">
          <ConfigField label="status">
            <select
              value={(cell.config as IncidentListConfig).status ?? ''}
              onChange={(e) =>
                onChange({
                  status: (e.target.value || undefined) as IncidentListConfig['status'],
                } as Partial<IncidentListConfig>)
              }
              className="field py-1 text-[11px]"
            >
              <option value="">All</option>
              <option value="open">open</option>
              <option value="acknowledged">acknowledged</option>
              <option value="resolved">resolved</option>
            </select>
          </ConfigField>
          <ConfigField label="limit">
            <input
              type="number"
              value={(cell.config as IncidentListConfig).limit ?? 20}
              onChange={(e) =>
                onChange({ limit: Number(e.target.value) } as Partial<IncidentListConfig>)
              }
              className="field py-1 font-mono text-[11px]"
            />
          </ConfigField>
        </div>
      )}
    </div>
  );
}
