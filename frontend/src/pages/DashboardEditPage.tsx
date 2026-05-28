import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import GridLayout, { type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ArrowLeft, Edit3, Loader2, Plus, Save, Settings, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { GET_DASHBOARD, UPDATE_DASHBOARD } from '@/graphql/dashboards';
import { GET_SERVERS } from '@/graphql/queries';
import {
  MetricChartWidget,
  type MetricChartConfig,
} from '@/components/widgets/MetricChartWidget';
import { LogPanelWidget, type LogPanelConfig } from '@/components/widgets/LogPanelWidget';
import {
  IncidentListWidget,
  type IncidentListConfig,
} from '@/components/widgets/IncidentListWidget';

type WidgetKind = 'metric_chart' | 'log_panel' | 'incident_list';

interface WidgetCell {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: WidgetKind;
  config: MetricChartConfig | LogPanelConfig | IncidentListConfig;
}

const DEFAULT_CONFIG: Record<WidgetKind, WidgetCell['config']> = {
  metric_chart: { serverId: '', metric: 'cpu', rangeMinutes: 30 },
  log_panel: { serverId: '', levels: ['ERROR', 'FATAL'], rangeMinutes: 15 },
  incident_list: { limit: 20 },
};

function newWidget(type: WidgetKind, cellsCount: number): WidgetCell {
  return {
    i: `${type}-${Date.now()}-${cellsCount}`,
    x: (cellsCount * 4) % 12,
    y: Infinity, // place at the bottom
    w: 4,
    h: 4,
    type,
    config: structuredClone(DEFAULT_CONFIG[type]) as WidgetCell['config'],
  };
}

export function DashboardEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useQuery(GET_DASHBOARD, {
    variables: { id },
    skip: !id,
  });

  const [updateDashboard] = useMutation(UPDATE_DASHBOARD);
  const { data: serversData } = useQuery(GET_SERVERS, { pollInterval: 30000 });
  const servers: { serverId: string }[] = (serversData as any)?.servers ?? [];

  const [cells, setCells] = useState<WidgetCell[]>([]);
  const [editing, setEditing] = useState(false);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialize cells from the loaded dashboard
  useEffect(() => {
    const d = (data as any)?.dashboard;
    if (!d) return;
    try {
      const parsed = JSON.parse(d.layout) as WidgetCell[];
      setCells(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCells([]);
    }
  }, [data]);

  const dashboard = (data as any)?.dashboard;

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

  const handleLayoutChange = (next: Layout) => {
    setCells((prev) =>
      prev.map((c) => {
        const l = next.find((n) => n.i === c.i);
        return l ? { ...c, x: l.x, y: l.y, w: l.w, h: l.h } : c;
      }),
    );
  };

  const addWidget = (type: WidgetKind) => {
    setCells((prev) => [...prev, newWidget(type, prev.length)]);
  };

  const removeWidget = (i: string) => {
    setCells((prev) => prev.filter((c) => c.i !== i));
  };

  const updateConfig = (i: string, patch: Partial<WidgetCell['config']>) => {
    setCells((prev) =>
      prev.map((c) =>
        c.i === i ? { ...c, config: { ...c.config, ...patch } } : c,
      ),
    );
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDashboard({
        variables: { id, layout: JSON.stringify(cells) },
      });
      toast.success('Dashboard saved');
      setEditing(false);
    } catch (err) {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !dashboard) {
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboards"
            className="p-1.5 rounded hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{dashboard.name}</h1>
            <p className="text-xs text-muted-foreground">
              Updated {new Date(dashboard.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <>
              <button
                onClick={() => addWidget('metric_chart')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={12} /> Metric chart
              </button>
              <button
                onClick={() => addWidget('log_panel')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={12} /> Log panel
              </button>
              <button
                onClick={() => addWidget('incident_list')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={12} /> Incident list
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Save size={12} />
                {saving ? 'Saving…' : 'Save layout'}
              </button>
            </>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              editing
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-zinc-800 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Edit3 size={12} />
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      {cells.length === 0 && !editing ? (
        <div className="glass rounded-xl border border-zinc-800 p-16 text-center text-sm text-muted-foreground">
          Empty dashboard. Click <span className="text-emerald-400">Edit</span> to add widgets.
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 48 }}
          dragConfig={{ enabled: editing, cancel: 'button, select, input, .nodrag' }}
          resizeConfig={{ enabled: editing }}
          width={Math.max(800, typeof window !== 'undefined' ? window.innerWidth - 320 : 1200)}
          onLayoutChange={handleLayoutChange}
        >
          {cells.map((cell) => (
            <div
              key={cell.i}
              className={`bg-zinc-900/60 border rounded-lg p-3 overflow-hidden ${
                editing ? 'border-emerald-500/30' : 'border-zinc-800'
              }`}
            >
              {editing && (
                <div className="flex justify-end gap-1 mb-1 nodrag">
                  <button
                    onClick={() =>
                      setConfiguring(configuring === cell.i ? null : cell.i)
                    }
                    title="Configure"
                    className="p-1 rounded hover:bg-zinc-800 text-muted-foreground hover:text-foreground"
                  >
                    <Settings size={11} />
                  </button>
                  <button
                    onClick={() => removeWidget(cell.i)}
                    title="Remove"
                    className="p-1 rounded hover:bg-zinc-800 text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
              {editing && configuring === cell.i ? (
                <WidgetConfig
                  cell={cell}
                  servers={servers}
                  onChange={(patch) => updateConfig(cell.i, patch)}
                  onClose={() => setConfiguring(null)}
                />
              ) : (
                <div className="h-full">
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

// ---------------------------------------------------------------------------
// Widget configuration popover
// ---------------------------------------------------------------------------
interface WidgetConfigProps {
  cell: WidgetCell;
  servers: { serverId: string }[];
  onChange: (patch: Partial<WidgetCell['config']>) => void;
  onClose: () => void;
}

const LEVEL_OPTIONS = ['DEBUG', 'INFO', 'WARN', 'WARNING', 'ERROR', 'FATAL'];

function WidgetConfig({ cell, servers, onChange, onClose }: WidgetConfigProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-3 h-full overflow-auto nodrag text-xs">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-muted-foreground uppercase">{cell.type}</div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={12} />
        </button>
      </div>

      {cell.type === 'metric_chart' && (
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">server</span>
            <select
              value={(cell.config as MetricChartConfig).serverId}
              onChange={(e) => onChange({ serverId: e.target.value } as Partial<MetricChartConfig>)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
            >
              <option value="">— pick —</option>
              {servers.map((s) => (
                <option key={s.serverId} value={s.serverId}>{s.serverId}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">metric</span>
            <select
              value={(cell.config as MetricChartConfig).metric}
              onChange={(e) =>
                onChange({ metric: e.target.value } as Partial<MetricChartConfig>)
              }
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
            >
              <option value="cpu">cpu</option>
              <option value="memory">memory</option>
              <option value="disk">disk</option>
              <option value="latencyMs">latencyMs</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">range (min)</span>
            <input
              type="number"
              value={(cell.config as MetricChartConfig).rangeMinutes ?? 30}
              onChange={(e) =>
                onChange({ rangeMinutes: Number(e.target.value) } as Partial<MetricChartConfig>)
              }
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
            />
          </label>
        </div>
      )}

      {cell.type === 'log_panel' && (
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">server (optional)</span>
            <select
              value={(cell.config as LogPanelConfig).serverId ?? ''}
              onChange={(e) => onChange({ serverId: e.target.value || undefined } as Partial<LogPanelConfig>)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
            >
              <option value="">all servers</option>
              {servers.map((s) => (
                <option key={s.serverId} value={s.serverId}>{s.serverId}</option>
              ))}
            </select>
          </label>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase mb-1">levels</div>
            <div className="flex flex-wrap gap-1">
              {LEVEL_OPTIONS.map((lvl) => {
                const active = (cell.config as LogPanelConfig).levels?.includes(lvl);
                return (
                  <button
                    key={lvl}
                    onClick={() => {
                      const cur = (cell.config as LogPanelConfig).levels ?? [];
                      onChange({
                        levels: active ? cur.filter((l) => l !== lvl) : [...cur, lvl],
                      } as Partial<LogPanelConfig>);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-800 text-muted-foreground'
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {cell.type === 'incident_list' && (
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">status</span>
            <select
              value={(cell.config as IncidentListConfig).status ?? ''}
              onChange={(e) =>
                onChange({
                  status: (e.target.value || undefined) as IncidentListConfig['status'],
                } as Partial<IncidentListConfig>)
              }
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
            >
              <option value="">all</option>
              <option value="open">open</option>
              <option value="acknowledged">acknowledged</option>
              <option value="resolved">resolved</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">limit</span>
            <input
              type="number"
              value={(cell.config as IncidentListConfig).limit ?? 20}
              onChange={(e) =>
                onChange({ limit: Number(e.target.value) } as Partial<IncidentListConfig>)
              }
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
            />
          </label>
        </div>
      )}
    </div>
  );
}
