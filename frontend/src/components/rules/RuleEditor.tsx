import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Tabs } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { LEVEL, levelForLogLevel } from '@/lib/status';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   Types mirror services/processor/src/rule_engine.py's DSL.
--------------------------------------------------------------------------- */
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
export type CompositeExpr = { type: 'and' | 'or'; children: LeafExpr[] };
export type RuleExpr = LeafExpr | CompositeExpr;

export interface RuleDraft {
  id?: string;
  name: string;
  severity: 'warning' | 'critical';
  runbookUrl: string;
  expression: RuleExpr;
}

const METRIC_KEYS: MetricExpr['metric'][] = ['cpu', 'memory', 'disk', 'latency_ms'];
const OPS: MetricExpr['op'][] = ['>', '>=', '<', '<='];
const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

const metricLeaf = (): MetricExpr => ({
  type: 'metric',
  metric: 'cpu',
  op: '>',
  value: 80,
  window_s: 15,
});

const logLeaf = (): LogExpr => ({
  type: 'log',
  levels: ['ERROR', 'FATAL'],
  rate_per_min: 5,
  window_s: 60,
  exclude_patterns: [],
});

type Kind = 'metric' | 'log' | 'composite';

const kindOf = (e: RuleExpr): Kind =>
  e.type === 'metric' ? 'metric' : e.type === 'log' ? 'log' : 'composite';

/* --- Field shells -------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/* --- Leaf editor --------------------------------------------------------- */

function LeafEditor({
  leaf,
  onChange,
  onRemove,
  lockType,
  /** Must be unique per rendered leaf — two Tabs sharing a layoutId would share
   *  one indicator and sling it across the dialog. */
  layoutKey = 'leaf',
}: {
  leaf: LeafExpr;
  onChange: (next: LeafExpr) => void;
  onRemove?: () => void;
  lockType?: boolean;
  layoutKey?: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-line bg-inset p-3">
      <div className="flex items-center justify-between">
        {lockType ? (
          <span className="font-mono text-[10px] tracking-wider text-ink-subtle uppercase">
            {leaf.type}
          </span>
        ) : (
          <Tabs
            layoutId={`leaf-kind-${layoutKey}`}
            value={leaf.type}
            onChange={(t) => onChange(t === 'metric' ? metricLeaf() : logLeaf())}
            items={[
              { value: 'metric' as const, label: 'Metric' },
              { value: 'log' as const, label: 'Log' },
            ]}
          />
        )}
        {onRemove && (
          <IconButton
            icon={Trash2}
            label="Remove condition"
            onClick={onRemove}
            className="hover:text-crit-text"
          />
        )}
      </div>

      {leaf.type === 'metric' ? (
        <div className="grid grid-cols-4 gap-2">
          <Field label="metric">
            <select
              value={leaf.metric}
              onChange={(e) =>
                onChange({ ...leaf, metric: e.target.value as MetricExpr['metric'] })
              }
              className="field"
            >
              {METRIC_KEYS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="op">
            <select
              value={leaf.op}
              onChange={(e) => onChange({ ...leaf, op: e.target.value as MetricExpr['op'] })}
              className="field font-mono"
            >
              {OPS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="value">
            <input
              type="number"
              value={leaf.value}
              onChange={(e) => onChange({ ...leaf, value: Number(e.target.value) })}
              className="field font-mono"
            />
          </Field>
          <Field label="window (s)">
            <input
              type="number"
              value={leaf.window_s}
              onChange={(e) => onChange({ ...leaf, window_s: Number(e.target.value) })}
              className="field font-mono"
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="levels">
            <div className="flex flex-wrap gap-1.5">
              {LOG_LEVELS.map((lvl) => {
                const active = leaf.levels.includes(lvl);
                const token = LEVEL[levelForLogLevel(lvl)];
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
                    aria-pressed={active}
                    className={cn(
                      'rounded px-2 py-1 font-mono text-[10px] font-medium transition-colors',
                      !active && 'bg-card text-ink-subtle hover:text-ink',
                    )}
                    style={active ? { background: token.tint, color: token.text } : undefined}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="rate / min">
              <input
                type="number"
                value={leaf.rate_per_min}
                onChange={(e) => onChange({ ...leaf, rate_per_min: Number(e.target.value) })}
                className="field font-mono"
              />
            </Field>
            <Field label="window (s)">
              <input
                type="number"
                value={leaf.window_s}
                onChange={(e) => onChange({ ...leaf, window_s: Number(e.target.value) })}
                className="field font-mono"
              />
            </Field>
          </div>

          <Field label="exclude patterns — one regex per line">
            <textarea
              rows={3}
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
              placeholder={'invalid credentials\nHTTP 4[0-9][0-9]'}
              className="field resize-y font-mono"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/* --- Composite editor ---------------------------------------------------- */

function CompositeEditor({
  expr,
  onChange,
}: {
  expr: CompositeExpr;
  onChange: (next: CompositeExpr) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-line bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
          Match
        </span>
        <Tabs
          layoutId="composite-op"
          value={expr.type}
          onChange={(t) => onChange({ ...expr, type: t })}
          items={[
            { value: 'and' as const, label: 'ALL of' },
            { value: 'or' as const, label: 'ANY of' },
          ]}
        />
      </div>

      <div className="space-y-2">
        {expr.children.map((child, i) => (
          <LeafEditor
            key={i}
            layoutKey={`child-${i}`}
            leaf={child}
            onChange={(next) =>
              onChange({ ...expr, children: expr.children.map((c, j) => (j === i ? next : c)) })
            }
            onRemove={
              expr.children.length > 1
                ? () => onChange({ ...expr, children: expr.children.filter((_, j) => j !== i) })
                : undefined
            }
          />
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          icon={Plus}
          className="text-[12px]"
          onClick={() => onChange({ ...expr, children: [...expr.children, metricLeaf()] })}
        >
          Metric condition
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon={Plus}
          className="text-[12px]"
          onClick={() => onChange({ ...expr, children: [...expr.children, logLeaf()] })}
        >
          Log condition
        </Button>
      </div>
    </div>
  );
}

/* --- Dialog -------------------------------------------------------------- */

interface RuleEditorProps {
  /** null closes the dialog — the Modal animates itself out. */
  draft: RuleDraft | null;
  onCancel: () => void;
  onSubmit: (draft: RuleDraft) => Promise<void>;
}

export function RuleEditor({ draft: initial, onCancel, onSubmit }: RuleEditorProps) {
  const [draft, setDraft] = useState<RuleDraft | null>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setDraft(initial);
      setError(null);
    }
    // Deliberately keep the last draft while the modal animates out, so the
    // content doesn't blank a frame before it disappears.
  }, [initial]);

  const submit = async () => {
    if (!draft) return;
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

  const kind = draft ? kindOf(draft.expression) : 'metric';

  const setKind = (k: Kind) => {
    if (!draft || k === kind) return;
    const expression: RuleExpr =
      k === 'metric'
        ? metricLeaf()
        : k === 'log'
          ? logLeaf()
          : { type: 'and', children: [metricLeaf(), logLeaf()] };
    setDraft({ ...draft, expression });
  };

  return (
    <Modal
      open={Boolean(initial)}
      onClose={onCancel}
      size="lg"
      title={draft?.id ? 'Edit rule' : 'New rule'}
      subtitle="Saved changes reach the running processor in about ten milliseconds."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={submitting}
            disabled={!draft?.name.trim()}
          >
            {draft?.id ? 'Save changes' : 'Create rule'}
          </Button>
        </div>
      }
    >
      {draft && (
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="name">
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Sustained DB errors"
                className="field"
              />
            </Field>
            <Field label="severity">
              <select
                value={draft.severity}
                onChange={(e) =>
                  setDraft({ ...draft, severity: e.target.value as 'warning' | 'critical' })
                }
                className="field"
              >
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
            </Field>
          </div>

          <Field label="runbook url — optional">
            <input
              value={draft.runbookUrl}
              onChange={(e) => setDraft({ ...draft, runbookUrl: e.target.value })}
              placeholder="https://wiki.example.com/runbooks/cpu-spike"
              className="field"
            />
          </Field>

          <div>
            <div className="mb-2.5 flex items-center gap-3">
              <span className="text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
                Condition
              </span>
              <Tabs
                layoutId="rule-kind"
                value={kind}
                onChange={setKind}
                items={[
                  { value: 'metric' as const, label: 'Metric' },
                  { value: 'log' as const, label: 'Log' },
                  { value: 'composite' as const, label: 'Composite' },
                ]}
              />
            </div>

            <motion.div
              key={kind}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              {kind === 'composite' ? (
                <CompositeEditor
                  expr={draft.expression as CompositeExpr}
                  onChange={(next) => setDraft({ ...draft, expression: next })}
                />
              ) : (
                <LeafEditor
                  lockType
                  leaf={draft.expression as LeafExpr}
                  onChange={(next) => setDraft({ ...draft, expression: next })}
                />
              )}
            </motion.div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md px-3 py-2.5 text-[12px]"
              style={{ background: LEVEL.critical.tint, color: LEVEL.critical.text }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
