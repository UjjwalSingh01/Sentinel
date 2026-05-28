import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types mirror services/processor/src/rule_engine.py DSL.
// ---------------------------------------------------------------------------
export type MetricExpr = {
  type: 'metric';
  metric: 'cpu' | 'memory' | 'disk' | 'latency_ms';
  op: '>' | '>=' | '<' | '<=';
  value: number;
  window_s: number;
};

export type LogExpr = {
  type: 'log';
  levels: string[];
  rate_per_min: number;
  window_s: number;
  exclude_patterns?: string[];
};

export type LeafExpr = MetricExpr | LogExpr;

export type CompositeExpr = {
  type: 'and' | 'or';
  children: LeafExpr[];
};

export type RuleExpr = LeafExpr | CompositeExpr;

export interface RuleDraft {
  id?: string;
  name: string;
  severity: 'warning' | 'critical';
  runbookUrl: string;
  expression: RuleExpr;
}

const METRICS: MetricExpr['metric'][] = ['cpu', 'memory', 'disk', 'latency_ms'];
const OPS: MetricExpr['op'][] = ['>', '>=', '<', '<='];
const LEVELS = ['DEBUG', 'INFO', 'WARN', 'WARNING', 'ERROR', 'FATAL'];

function defaultMetricLeaf(): MetricExpr {
  return { type: 'metric', metric: 'cpu', op: '>', value: 80, window_s: 15 };
}

function defaultLogLeaf(): LogExpr {
  return {
    type: 'log',
    levels: ['ERROR', 'FATAL'],
    rate_per_min: 5,
    window_s: 60,
    exclude_patterns: [],
  };
}

function topLevelType(expr: RuleExpr): 'metric' | 'log' | 'composite' {
  if (expr.type === 'metric') return 'metric';
  if (expr.type === 'log') return 'log';
  return 'composite';
}

// ---------------------------------------------------------------------------
// Leaf editor (used both at top level and inside composites)
// ---------------------------------------------------------------------------
interface LeafEditorProps {
  leaf: LeafExpr;
  onChange: (next: LeafExpr) => void;
  onRemove?: () => void;
  /** Restrict to a single leaf type (used inside composites where you pick once). */
  allowType?: 'metric' | 'log' | 'both';
}

function LeafEditor({ leaf, onChange, onRemove, allowType = 'both' }: LeafEditorProps) {
  const switchType = (t: 'metric' | 'log') => {
    onChange(t === 'metric' ? defaultMetricLeaf() : defaultLogLeaf());
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        {allowType === 'both' ? (
          <div className="flex gap-1">
            {(['metric', 'log'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchType(t)}
                className={`px-2 py-1 rounded text-[11px] font-semibold ${
                  leaf.type === t
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-zinc-800 text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
            {leaf.type}
          </span>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-red-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {leaf.type === 'metric' ? (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">metric</span>
            <select
              value={leaf.metric}
              onChange={(e) => onChange({ ...leaf, metric: e.target.value as MetricExpr['metric'] })}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">op</span>
            <select
              value={leaf.op}
              onChange={(e) => onChange({ ...leaf, op: e.target.value as MetricExpr['op'] })}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
            >
              {OPS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">value</span>
            <input
              type="number"
              value={leaf.value}
              onChange={(e) => onChange({ ...leaf, value: Number(e.target.value) })}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">window s</span>
            <input
              type="number"
              value={leaf.window_s}
              onChange={(e) => onChange({ ...leaf, window_s: Number(e.target.value) })}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
            />
          </label>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase mb-1">levels</div>
            <div className="flex gap-1 flex-wrap">
              {LEVELS.map((lvl) => {
                const active = leaf.levels.includes(lvl);
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...leaf,
                        levels: active
                          ? leaf.levels.filter((l) => l !== lvl)
                          : [...leaf.levels, lvl],
                      })
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      active
                        ? lvl === 'ERROR' || lvl === 'FATAL'
                          ? 'bg-red-500/20 text-red-400'
                          : lvl.startsWith('WARN')
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-zinc-800 text-muted-foreground'
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase">rate / min</span>
              <input
                type="number"
                value={leaf.rate_per_min}
                onChange={(e) => onChange({ ...leaf, rate_per_min: Number(e.target.value) })}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase">window s</span>
              <input
                type="number"
                value={leaf.window_s}
                onChange={(e) => onChange({ ...leaf, window_s: Number(e.target.value) })}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500/40"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase">
              exclude patterns (one regex per line)
            </span>
            <textarea
              value={(leaf.exclude_patterns ?? []).join('\n')}
              onChange={(e) =>
                onChange({
                  ...leaf,
                  exclude_patterns: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500/40"
              placeholder="invalid credentials&#10;HTTP 4[0-9][0-9]"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level editor
// ---------------------------------------------------------------------------
interface RuleEditorProps {
  draft: RuleDraft;
  onCancel: () => void;
  onSubmit: (draft: RuleDraft) => Promise<void>;
}

export function RuleEditor({ draft: initial, onCancel, onSubmit }: RuleEditorProps) {
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const kind = topLevelType(draft.expression);

  const setKind = (k: 'metric' | 'log' | 'composite') => {
    if (k === kind) return;
    if (k === 'metric') {
      setDraft({ ...draft, expression: defaultMetricLeaf() });
    } else if (k === 'log') {
      setDraft({ ...draft, expression: defaultLogLeaf() });
    } else {
      setDraft({
        ...draft,
        expression: {
          type: 'and',
          children: [defaultMetricLeaf(), defaultLogLeaf()],
        },
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <form
        onSubmit={handleSubmit}
        className="relative glass-strong rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 glass-strong rounded-t-2xl border-b border-zinc-800 p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold">
              {draft.id ? 'Edit rule' : 'New rule'}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Changes apply to the running processor within seconds.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] text-muted-foreground uppercase">name</span>
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Sustained DB errors"
                className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-2 focus:outline-none focus:border-emerald-500/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] text-muted-foreground uppercase">severity</span>
              <select
                value={draft.severity}
                onChange={(e) =>
                  setDraft({ ...draft, severity: e.target.value as 'warning' | 'critical' })
                }
                className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-2 focus:outline-none focus:border-emerald-500/40"
              >
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[10px] text-muted-foreground uppercase">
              runbook url (optional)
            </span>
            <input
              value={draft.runbookUrl}
              onChange={(e) => setDraft({ ...draft, runbookUrl: e.target.value })}
              placeholder="https://wiki.example.com/runbooks/cpu-spike"
              className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-2 focus:outline-none focus:border-emerald-500/40"
            />
          </label>

          <div>
            <div className="text-[10px] text-muted-foreground uppercase mb-2">
              expression
            </div>
            <div className="flex gap-1 mb-3">
              {(['metric', 'log', 'composite'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    kind === k
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-zinc-800 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            {kind === 'composite' ? (
              <CompositeEditor
                expr={draft.expression as CompositeExpr}
                onChange={(next) => setDraft({ ...draft, expression: next })}
              />
            ) : (
              <LeafEditor
                leaf={draft.expression as LeafExpr}
                onChange={(next) => setDraft({ ...draft, expression: next })}
              />
            )}
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 glass-strong border-t border-zinc-800 p-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !draft.name.trim()}
            className="px-3 py-1.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving…' : draft.id ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composite editor (single-level: composite of leaves)
// ---------------------------------------------------------------------------
interface CompositeEditorProps {
  expr: CompositeExpr;
  onChange: (next: CompositeExpr) => void;
}

function CompositeEditor({ expr, onChange }: CompositeEditorProps) {
  const replaceChild = (idx: number, child: LeafExpr) => {
    onChange({
      ...expr,
      children: expr.children.map((c, i) => (i === idx ? child : c)),
    });
  };

  const removeChild = (idx: number) => {
    onChange({
      ...expr,
      children: expr.children.filter((_, i) => i !== idx),
    });
  };

  const addChild = (kind: 'metric' | 'log') => {
    onChange({
      ...expr,
      children: [...expr.children, kind === 'metric' ? defaultMetricLeaf() : defaultLogLeaf()],
    });
  };

  return (
    <div className="border border-zinc-800 rounded-lg p-3 space-y-3 bg-zinc-900/30">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground uppercase">operator</span>
        {(['and', 'or'] as const).map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => onChange({ ...expr, type: op })}
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              expr.type === op
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-zinc-800 text-muted-foreground'
            }`}
          >
            {op.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {expr.children.map((child, idx) => (
          <LeafEditor
            key={idx}
            leaf={child}
            onChange={(next) => replaceChild(idx, next)}
            onRemove={expr.children.length > 1 ? () => removeChild(idx) : undefined}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => addChild('metric')}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-zinc-800 text-muted-foreground hover:text-foreground"
        >
          <Plus size={11} /> metric
        </button>
        <button
          type="button"
          onClick={() => addChild('log')}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-zinc-800 text-muted-foreground hover:text-foreground"
        >
          <Plus size={11} /> log
        </button>
      </div>
    </div>
  );
}
