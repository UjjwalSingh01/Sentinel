import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Pencil, Plus, Power, Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CREATE_RULE,
  DELETE_RULE,
  GET_ALERT_RULES,
  TOGGLE_RULE,
  UPDATE_RULE,
} from '@/graphql/rules';
import { RuleEditor, type RuleDraft, type RuleExpr } from '@/components/rules/RuleEditor';

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
    expression: {
      type: 'metric',
      metric: 'cpu',
      op: '>',
      value: 80,
      window_s: 15,
    },
  };
}

function describe(expr: RuleExpr): string {
  if (expr.type === 'metric') {
    return `${expr.metric} ${expr.op} ${expr.value} for ${expr.window_s}s`;
  }
  if (expr.type === 'log') {
    return `${expr.levels.join('/')} ≥ ${expr.rate_per_min}/min (${expr.window_s}s window)`;
  }
  return `${expr.type.toUpperCase()}(${expr.children.map(describe).join(', ')})`;
}

export function RulesPage() {
  const { data, loading, refetch } = useQuery(GET_ALERT_RULES, { pollInterval: 30000 });
  const [editing, setEditing] = useState<RuleDraft | null>(null);

  const [createRule] = useMutation(CREATE_RULE);
  const [updateRule] = useMutation(UPDATE_RULE);
  const [toggleRule] = useMutation(TOGGLE_RULE);
  const [deleteRule] = useMutation(DELETE_RULE);

  const rules: AlertRuleRow[] = (data as any)?.alertRules || [];

  const openNew = () => setEditing(emptyDraft());

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
    const variables: Record<string, unknown> = {
      name: draft.name,
      severity: draft.severity,
      expression: JSON.stringify(draft.expression),
      runbookUrl: draft.runbookUrl || null,
    };
    if (draft.id) {
      await updateRule({ variables: { id: draft.id, ...variables } });
      toast.success('Rule updated');
    } else {
      variables.type = draft.expression.type === 'and' || draft.expression.type === 'or'
        ? 'composite'
        : draft.expression.type;
      await createRule({ variables });
      toast.success('Rule created');
    }
    setEditing(null);
    await refetch();
  };

  const handleToggle = async (rule: AlertRuleRow) => {
    await toggleRule({ variables: { id: rule.id, enabled: !rule.enabled } });
    toast.success(`Rule ${rule.enabled ? 'disabled' : 'enabled'}`);
    await refetch();
  };

  const handleDelete = async (rule: AlertRuleRow) => {
    if (!confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return;
    await deleteRule({ variables: { id: rule.id } });
    toast.success('Rule deleted');
    await refetch();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings size={22} className="text-emerald-400" />
            Alert Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edit alerts inline — the processor reloads within seconds.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New rule
        </button>
      </div>

      <div className="glass rounded-xl border border-zinc-800 overflow-hidden">
        {loading && rules.length === 0 ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-zinc-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No rules defined.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3 w-12"></th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Expression</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {rules.map((rule) => {
                let expr: RuleExpr | null = null;
                try {
                  expr = JSON.parse(rule.expression);
                } catch {
                  /* malformed expression — render raw */
                }
                return (
                  <tr key={rule.id} className={!rule.enabled ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(rule)}
                        title={rule.enabled ? 'Disable' : 'Enable'}
                        className={`p-1.5 rounded-md transition-colors ${
                          rule.enabled
                            ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                            : 'bg-zinc-800 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Power size={14} />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium">{rule.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground uppercase">
                      {rule.type}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          rule.severity === 'critical'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {rule.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-md">
                      {expr ? describe(expr) : rule.expression}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(rule)}
                          title="Edit"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-800 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          title="Delete"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-zinc-800 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <RuleEditor
          draft={editing}
          onCancel={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
