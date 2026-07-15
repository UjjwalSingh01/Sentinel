import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { motion } from 'motion/react';
import { Pencil, Plus, Power, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CREATE_RULE,
  DELETE_RULE,
  GET_ALERT_RULES,
  TOGGLE_RULE,
  UPDATE_RULE,
} from '@/graphql/rules';
import { RuleEditor, type RuleDraft, type RuleExpr } from '@/components/rules/RuleEditor';
import {
  Button,
  Chip,
  EmptyState,
  IconButton,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { levelForSeverity } from '@/lib/status';
import { snappy } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface AlertRuleRow {
  id: string;
  name: string;
  type: 'metric' | 'log' | 'composite';
  severity: 'warning' | 'critical';
  expression: string;
  enabled: boolean;
  runbookUrl: string | null;
  updatedAt: string;
}

function emptyDraft(): RuleDraft {
  return {
    name: '',
    severity: 'warning',
    runbookUrl: '',
    expression: { type: 'metric', metric: 'cpu', op: '>', value: 80, window_s: 15 },
  };
}

/** Renders the JSON DSL back as something a human can read at a glance. */
function describe(expr: RuleExpr): string {
  if (expr.type === 'metric') return `${expr.metric} ${expr.op} ${expr.value} for ${expr.window_s}s`;
  if (expr.type === 'log')
    return `${expr.levels.join('/')} ≥ ${expr.rate_per_min}/min over ${expr.window_s}s`;
  return `${expr.type.toUpperCase()}( ${expr.children.map(describe).join(' · ')} )`;
}

export function RulesPage() {
  const { data, loading, refetch } = useQuery(GET_ALERT_RULES, { pollInterval: 30000 });
  const [editing, setEditing] = useState<RuleDraft | null>(null);

  const [createRule] = useMutation(CREATE_RULE);
  const [updateRule] = useMutation(UPDATE_RULE);
  const [toggleRule] = useMutation(TOGGLE_RULE);
  const [deleteRule] = useMutation(DELETE_RULE);

  const rules: AlertRuleRow[] = (data as any)?.alertRules ?? [];

  const openEdit = (rule: AlertRuleRow) => {
    let expression: RuleExpr;
    try {
      expression = JSON.parse(rule.expression);
    } catch {
      expression = emptyDraft().expression;
    }
    setEditing({
      id: rule.id,
      name: rule.name,
      severity: rule.severity,
      runbookUrl: rule.runbookUrl ?? '',
      expression,
    });
  };

  const handleSubmit = async (draft: RuleDraft) => {
    const vars: Record<string, unknown> = {
      name: draft.name,
      severity: draft.severity,
      expression: JSON.stringify(draft.expression),
      runbookUrl: draft.runbookUrl || null,
    };

    if (draft.id) {
      await updateRule({ variables: { id: draft.id, ...vars } });
      toast.success('Rule updated', { description: 'The processor reloads within seconds.' });
    } else {
      vars.type =
        draft.expression.type === 'and' || draft.expression.type === 'or'
          ? 'composite'
          : draft.expression.type;
      await createRule({ variables: vars });
      toast.success('Rule created', { description: 'The processor reloads within seconds.' });
    }

    setEditing(null);
    await refetch();
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Alert rules"
        subtitle="Edit a rule and the running processor picks it up within seconds — no restart."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing(emptyDraft())}>
            New rule
          </Button>
        }
      />

      <div className="overflow-hidden rounded-lg border border-line bg-card">
        {loading && rules.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="No alert rules yet"
            hint="Without a rule nothing will ever page anyone. Start with a CPU threshold."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setEditing(emptyDraft())}>
                Create the first rule
              </Button>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="w-12" />
                {['Name', 'Type', 'Severity', 'Expression'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[10px] font-medium tracking-wider text-ink-subtle uppercase"
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {rules.map((rule, i) => {
                let expr: RuleExpr | null = null;
                try {
                  expr = JSON.parse(rule.expression);
                } catch {
                  /* malformed — fall back to the raw string below */
                }

                return (
                  <motion.tr
                    key={rule.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...snappy, delay: i * 0.03 }}
                    className={cn(
                      'border-b border-line/60 transition-colors last:border-0 hover:bg-elevated',
                      !rule.enabled && 'opacity-45',
                    )}
                  >
                    <td className="py-2.5 pl-4">
                      {/* A disabled rule is inert, not broken — so the toggle is
                          chrome, never a status colour. */}
                      <button
                        onClick={async () => {
                          await toggleRule({ variables: { id: rule.id, enabled: !rule.enabled } });
                          toast.success(`Rule ${rule.enabled ? 'disabled' : 'enabled'}`);
                          await refetch();
                        }}
                        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                        aria-pressed={rule.enabled}
                        className={cn(
                          'grid h-7 w-7 place-items-center rounded-md transition-colors',
                          rule.enabled
                            ? 'bg-elevated text-ink'
                            : 'bg-inset text-ink-subtle hover:text-ink',
                        )}
                      >
                        <Power size={13} />
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium text-ink">{rule.name}</td>
                    <td className="px-4 py-2.5">
                      <Chip>{rule.type}</Chip>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge level={levelForSeverity(rule.severity)}>
                        {rule.severity}
                      </StatusBadge>
                    </td>
                    <td className="max-w-md px-4 py-2.5">
                      <span className="block truncate font-mono text-[11px] text-ink-muted">
                        {expr ? describe(expr) : rule.expression}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton icon={Pencil} label="Edit rule" onClick={() => openEdit(rule)} />
                        <IconButton
                          icon={Trash2}
                          label="Delete rule"
                          className="hover:text-crit-text"
                          onClick={async () => {
                            if (!confirm(`Delete rule “${rule.name}”? This cannot be undone.`)) return;
                            await deleteRule({ variables: { id: rule.id } });
                            toast.success('Rule deleted');
                            await refetch();
                          }}
                        />
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <RuleEditor
        draft={editing}
        onCancel={() => setEditing(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
