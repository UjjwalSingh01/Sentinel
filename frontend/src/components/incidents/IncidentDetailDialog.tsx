import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Layers,
  Sparkles,
  Terminal,
} from 'lucide-react';
import {
  ACKNOWLEDGE_INCIDENT,
  ASSIGN_INCIDENT,
  REQUEST_AI_ANALYSIS,
  RESOLVE_INCIDENT,
} from '@/graphql/mutations';
import { GET_INCIDENT, GET_USERS } from '@/graphql/queries';
import { GET_INCIDENT_CHILDREN } from '@/graphql/traces';
import { getUser } from '@/lib/auth';
import {
  LEVEL,
  levelForIncidentStatus,
  levelForLogLevel,
  levelForSeverity,
  type Level,
} from '@/lib/status';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Button, Skeleton, StatusBadge, Tabs } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { TracesPanel } from './TracesPanel';

interface IncidentDetailDialogProps {
  incidentId: string | null;
  onClose: () => void;
}

type EvidenceTab = 'logs' | 'traces' | 'related';

interface LogContext {
  total_lines?: number;
  templates?: Array<{ template: string; count: number; level: string; samples?: string[] }>;
}

export function IncidentDetailDialog({ incidentId, onClose }: IncidentDetailDialogProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab] = useState<EvidenceTab>('logs');

  const { data, loading, refetch } = useQuery(GET_INCIDENT, {
    variables: { id: incidentId },
    skip: !incidentId,
  });
  const { data: usersData } = useQuery(GET_USERS);
  const { data: childrenData } = useQuery(GET_INCIDENT_CHILDREN, {
    variables: { parentId: incidentId },
    skip: !incidentId,
  });

  const [acknowledgeIncident] = useMutation(ACKNOWLEDGE_INCIDENT);
  const [resolveIncident] = useMutation(RESOLVE_INCIDENT);
  const [assignIncident] = useMutation(ASSIGN_INCIDENT);
  const [requestAiAnalysis] = useMutation(REQUEST_AI_ANALYSIS);

  const incident = (data as any)?.incident;
  const users: { id: string; name: string; email: string }[] = (usersData as any)?.users ?? [];
  const children: any[] = (childrenData as any)?.incidentChildren ?? [];

  const logContext = useMemo<LogContext | null>(() => {
    if (!incident?.logContext) return null;
    try {
      return JSON.parse(incident.logContext);
    } catch {
      return null;
    }
  }, [incident?.logContext]);

  const sev = incident ? levelForSeverity(incident.severity) : 'warn';
  const SeverityIcon = LEVEL[sev].icon;

  const handleAnalysis = async () => {
    setAiLoading(true);
    try {
      await requestAiAnalysis({ variables: { id: incidentId } });
      await refetch();
    } finally {
      setAiLoading(false);
    }
  };

  const timeline: { label: string; at: string; level: Level }[] = [];
  if (incident) {
    timeline.push({ label: 'Fired', at: incident.createdAt, level: sev });
    if (incident.acknowledgedAt) {
      timeline.push({ label: 'Acknowledged', at: incident.acknowledgedAt, level: 'warn' });
    }
    if (incident.resolvedAt) {
      timeline.push({ label: 'Resolved', at: incident.resolvedAt, level: 'good' });
    }
  }

  return (
    <Modal
      open={Boolean(incidentId)}
      onClose={onClose}
      size="lg"
      title={loading || !incident ? 'Incident' : incident.ruleName || incident.message}
      subtitle={incident ? `${incident.serverId} · ${incident.id.slice(0, 8)}` : undefined}
      leading={
        incident && (
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
            style={{ background: LEVEL[sev].tint, color: LEVEL[sev].text }}
          >
            <SeverityIcon size={16} />
          </div>
        )
      }
      footer={
        incident && incident.status !== 'resolved' ? (
          <div className="flex justify-end gap-2">
            {incident.status === 'open' && (
              <Button
                icon={CheckCircle2}
                onClick={async () => {
                  await acknowledgeIncident({
                    variables: { id: incidentId, userId: getUser()?.user_id },
                  });
                  refetch();
                }}
              >
                Acknowledge
              </Button>
            )}
            <Button
              variant="primary"
              icon={CheckCircle2}
              onClick={async () => {
                await resolveIncident({ variables: { id: incidentId } });
                refetch();
              }}
            >
              Resolve
            </Button>
          </div>
        ) : null
      }
    >
      {loading || !incident ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-16" />
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="space-y-5 p-5">
          {/* The breach, stated once, in numbers. */}
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
            <Cell label="Severity">
              <StatusBadge level={sev}>{incident.severity}</StatusBadge>
            </Cell>
            <Cell label="Status">
              <StatusBadge level={levelForIncidentStatus(incident.status)}>
                {incident.status}
              </StatusBadge>
            </Cell>
            <Cell label={`${incident.metricType} value`}>
              <span className="font-mono text-[13px] tabular-nums" style={{ color: LEVEL[sev].text }}>
                {incident.currentValue.toFixed(1)}
              </span>
              <span className="font-mono text-[11px] text-ink-subtle">
                {' '}
                / {incident.threshold}
              </span>
            </Cell>
          </div>

          {/* Lifecycle. A horizontal walk of what happened, and when. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border border-line bg-card px-4 py-3">
            {timeline.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                {i > 0 && <span className="mx-1 h-px w-6 bg-line-strong" />}
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: LEVEL[step.level].mark }}
                />
                <span className="text-[12px] font-medium text-ink">{step.label}</span>
                <span
                  className="font-mono text-[11px] text-ink-subtle"
                  title={formatDateTime(step.at)}
                >
                  {timeAgo(step.at)}
                </span>
              </div>
            ))}
          </div>

          <Section title="Assignee">
            <select
              value={incident.assigneeId ?? ''}
              onChange={(e) => e.target.value && assignIncident({
                variables: { id: incidentId, userId: e.target.value },
              }).then(() => refetch())}
              className="field"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.email}
                </option>
              ))}
            </select>
          </Section>

          {/* Evidence. The whole reason this product exists: the incident arrives
              with its own logs and traces already attached. */}
          <Section
            title="Evidence"
            action={
              tab === 'logs' && (
                <Link
                  to={`/logs?serverId=${encodeURIComponent(incident.serverId)}`}
                  className="inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
                >
                  Open in Logs <ExternalLink size={10} />
                </Link>
              )
            }
          >
            <Tabs
              layoutId="evidence-tabs"
              value={tab}
              onChange={setTab}
              items={[
                { value: 'logs', label: 'Logs', icon: Terminal, count: logContext?.total_lines },
                {
                  value: 'traces',
                  label: 'Traces',
                  icon: GitBranch,
                  count: incident.exemplarTraceIds?.length || undefined,
                },
                ...(incident.childCount > 0
                  ? [{ value: 'related' as const, label: 'Related', icon: Layers, count: incident.childCount }]
                  : []),
              ]}
            />

            <div className="mt-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                >
                  {tab === 'logs' &&
                    (logContext?.templates?.length ? (
                      <div className="space-y-1.5">
                        {logContext.templates.slice(0, 8).map((t, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="rounded-md border border-line bg-inset p-2.5"
                          >
                            <div className="flex items-start gap-2">
                              <StatusBadge level={levelForLogLevel(t.level)} showIcon={false}>
                                ×{t.count} {t.level}
                              </StatusBadge>
                              <span className="min-w-0 flex-1 font-mono text-[11px] break-all text-ink">
                                {t.template}
                              </span>
                            </div>
                            {t.samples?.slice(0, 2).map((s, j) => (
                              <div
                                key={j}
                                title={s}
                                className="mt-1 truncate pl-1 font-mono text-[10px] text-ink-subtle"
                              >
                                {s}
                              </div>
                            ))}
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <Muted>No log evidence was captured for this incident.</Muted>
                    ))}

                  {tab === 'traces' && incidentId && <TracesPanel incidentId={incidentId} />}

                  {tab === 'related' &&
                    (children.length > 0 ? (
                      <div className="space-y-1.5">
                        {children.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-2.5 rounded-md border border-line bg-inset p-2.5"
                          >
                            <StatusBadge level={levelForSeverity(c.severity)} showIcon={false}>
                              {c.severity}
                            </StatusBadge>
                            <span className="shrink-0 font-mono text-[11px] text-ink">
                              {c.serverId}
                            </span>
                            <span className="truncate text-[12px] text-ink-muted">{c.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Muted>No related child incidents.</Muted>
                    ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </Section>

          <Section title="AI root-cause analysis">
            {incident.aiAnalysis ? (
              <motion.pre
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="max-h-72 overflow-auto rounded-md border border-line bg-inset p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-muted"
              >
                {incident.aiAnalysis}
              </motion.pre>
            ) : (
              <div className="flex items-center gap-3">
                <Button icon={Sparkles} onClick={handleAnalysis} loading={aiLoading}>
                  {aiLoading ? 'Analysing…' : 'Request analysis'}
                </Button>
                <p className="text-[11px] text-ink-subtle">
                  Sends this incident&apos;s metrics and captured logs to the model.
                </p>
              </div>
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}

/* --- Local layout bits --------------------------------------------------- */

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card px-3.5 py-3">
      <div className="mb-1.5 truncate text-[10px] font-medium tracking-wider text-ink-subtle uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-subtle">
      {children}
    </p>
  );
}
