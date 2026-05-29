import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  X,
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Clock,
  User,
  Sparkles,
  Loader2,
  Server,
  Terminal,
  ExternalLink,
  GitBranch,
  Layers,
} from 'lucide-react';
import { ACKNOWLEDGE_INCIDENT, RESOLVE_INCIDENT, ASSIGN_INCIDENT, REQUEST_AI_ANALYSIS } from '@/graphql/mutations';
import { GET_INCIDENT, GET_USERS } from '@/graphql/queries';
import { GET_INCIDENT_CHILDREN } from '@/graphql/traces';
import { getUser } from '@/lib/auth';
import { TracesPanel } from './TracesPanel';

interface IncidentDetailDialogProps {
  incidentId: string | null;
  onClose: () => void;
}

type CorrelatedTab = 'logs' | 'traces' | 'children';

export function IncidentDetailDialog({ incidentId, onClose }: IncidentDetailDialogProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const [correlatedTab, setCorrelatedTab] = useState<CorrelatedTab>('logs');

  const { data: incidentData, loading, refetch } = useQuery(GET_INCIDENT, {
    variables: { id: incidentId },
    skip: !incidentId,
  });

  const { data: usersData } = useQuery(GET_USERS);
  const { data: childrenData } = useQuery(GET_INCIDENT_CHILDREN, {
    variables: { parentId: incidentId },
    skip: !incidentId,
  });
  const childIncidents: Array<{
    id: string;
    serverId: string;
    severity: string;
    message: string;
    createdAt: string;
    ruleName?: string | null;
  }> = (childrenData as any)?.incidentChildren || [];

  const [acknowledgeIncident] = useMutation(ACKNOWLEDGE_INCIDENT);
  const [resolveIncident] = useMutation(RESOLVE_INCIDENT);
  const [assignIncident] = useMutation(ASSIGN_INCIDENT);
  const [requestAiAnalysis] = useMutation(REQUEST_AI_ANALYSIS);

  const incident = (incidentData as any)?.incident;
  const users = (usersData as any)?.users || [];

  // log_context is a JSON string from the API; parse defensively.
  // Hook must run unconditionally — keep it above any early return.
  const logContext = useMemo(() => {
    if (!incident?.logContext) return null;
    try {
      return JSON.parse(incident.logContext) as {
        window_start?: string;
        window_end?: string;
        total_lines?: number;
        templates?: Array<{
          template: string;
          count: number;
          level: string;
          samples?: string[];
        }>;
      };
    } catch {
      return null;
    }
  }, [incident?.logContext]);

  if (!incidentId) return null;

  const handleAcknowledge = async () => {
    const currentUser = getUser();
    await acknowledgeIncident({
      variables: { id: incidentId, userId: currentUser?.user_id },
    });
    refetch();
  };

  const handleResolve = async () => {
    await resolveIncident({ variables: { id: incidentId } });
    refetch();
  };

  const handleAssign = async (userId: string) => {
    await assignIncident({ variables: { id: incidentId, userId } });
    refetch();
  };

  const handleRequestAnalysis = async () => {
    setAiLoading(true);
    try {
      await requestAiAnalysis({ variables: { id: incidentId } });
      await refetch();
    } finally {
      setAiLoading(false);
    }
  };

  const severityIcon = incident?.severity === 'critical' ? AlertOctagon : AlertTriangle;
  const SeverityIcon = severityIcon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative glass-strong rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 glass-strong rounded-t-2xl border-b border-zinc-800 p-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {incident && (
              <div className={`p-2 rounded-lg ${
                incident.severity === 'critical' ? 'bg-red-500/10' : 'bg-amber-500/10'
              }`}>
                <SeverityIcon size={20} className={
                  incident.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
                } />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold">Incident Detail</h2>
              {incident && (
                <p className="text-xs text-muted-foreground font-mono">{incident.id.slice(0, 8)}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : incident ? (
          <div className="p-5 space-y-5">
            {/* Status & Severity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Severity</p>
                <span className={`text-sm font-semibold px-2 py-1 rounded ${
                  incident.severity === 'critical'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {incident.severity.toUpperCase()}
                </span>
              </div>
              <div className="bg-zinc-900 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <span className={`text-sm font-semibold px-2 py-1 rounded ${
                  incident.status === 'open'
                    ? 'bg-red-500/10 text-red-400'
                    : incident.status === 'acknowledged'
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {incident.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Details */}
            <div className="bg-zinc-900 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Server:</span>
                <span className="text-sm font-mono">{incident.serverId}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Metric:</span>
                <span className="text-sm">{incident.metricType}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground ml-5">Value:</span>
                <span className="text-sm font-mono text-red-400">{incident.currentValue.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">/ threshold:</span>
                <span className="text-sm font-mono">{incident.threshold}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Created:</span>
                <span className="text-sm">{new Date(incident.createdAt).toLocaleString()}</span>
              </div>
              {incident.acknowledgedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-amber-400" />
                  <span className="text-xs text-muted-foreground">Acknowledged:</span>
                  <span className="text-sm">{new Date(incident.acknowledgedAt).toLocaleString()}</span>
                </div>
              )}
              {incident.resolvedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400" />
                  <span className="text-xs text-muted-foreground">Resolved:</span>
                  <span className="text-sm">{new Date(incident.resolvedAt).toLocaleString()}</span>
                </div>
              )}
              <div className="pt-2">
                <p className="text-sm text-foreground/80">{incident.message}</p>
              </div>
            </div>

            {/* Assignee */}
            <div className="bg-zinc-900 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <User size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Assigned to:</span>
                {incident.assignee ? (
                  <span className="text-sm">{incident.assignee.name}</span>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Unassigned</span>
                )}
              </div>
              <select
                value={incident.assigneeId || ''}
                onChange={(e) => e.target.value && handleAssign(e.target.value)}
                className="w-full mt-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">Select assignee...</option>
                {users.map((user: { id: string; name: string; email: string }) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Correlated evidence tabs: logs / traces / children */}
            <div className="bg-zinc-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCorrelatedTab('logs')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      correlatedTab === 'logs'
                        ? 'bg-zinc-800 text-emerald-400'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Terminal size={12} />
                    Logs
                    {logContext?.total_lines ? (
                      <span className="opacity-60 text-[10px]">{logContext.total_lines}</span>
                    ) : null}
                  </button>
                  <button
                    onClick={() => setCorrelatedTab('traces')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      correlatedTab === 'traces'
                        ? 'bg-zinc-800 text-emerald-400'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <GitBranch size={12} />
                    Traces
                    {incident.exemplarTraceIds?.length ? (
                      <span className="opacity-60 text-[10px]">{incident.exemplarTraceIds.length}</span>
                    ) : null}
                  </button>
                  {incident.childCount > 0 && (
                    <button
                      onClick={() => setCorrelatedTab('children')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        correlatedTab === 'children'
                          ? 'bg-zinc-800 text-emerald-400'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Layers size={12} />
                      Related
                      <span className="opacity-60 text-[10px]">{incident.childCount}</span>
                    </button>
                  )}
                </div>
                {correlatedTab === 'logs' && (
                  <Link
                    to={`/logs?serverId=${encodeURIComponent(incident.serverId)}`}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                  >
                    Open in Logs <ExternalLink size={11} />
                  </Link>
                )}
              </div>

              {correlatedTab === 'logs' && (
                logContext && logContext.templates && logContext.templates.length > 0 ? (
                  <div className="space-y-1.5">
                    {logContext.templates.slice(0, 8).map((t, i) => (
                      <div key={i} className="bg-zinc-800/60 rounded p-2 font-mono text-[11px]">
                        <div className="flex items-start gap-2">
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.level === 'FATAL' || t.level === 'ERROR'
                                ? 'bg-red-500/20 text-red-400'
                                : t.level === 'WARN' || t.level === 'WARNING'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-zinc-700 text-zinc-300'
                            }`}
                          >
                            ×{t.count} {t.level}
                          </span>
                          <span className="text-foreground/80 break-all">{t.template}</span>
                        </div>
                        {t.samples && t.samples.length > 0 && (
                          <div className="mt-1 ml-2 text-muted-foreground">
                            {t.samples.slice(0, 2).map((s, j) => (
                              <div key={j} className="truncate" title={s}>
                                e.g. {s}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No log evidence was captured for this incident.
                  </p>
                )
              )}

              {correlatedTab === 'traces' && (
                incidentId ? <TracesPanel incidentId={incidentId} /> : null
              )}

              {correlatedTab === 'children' && (
                childIncidents.length > 0 ? (
                  <div className="space-y-1.5 text-[12px]">
                    {childIncidents.map((c) => (
                      <div
                        key={c.id}
                        className="bg-zinc-800/60 rounded p-2 flex items-center gap-3"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            c.severity === 'critical'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {c.severity.toUpperCase()}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {c.serverId}
                        </span>
                        <span className="truncate text-foreground/80">{c.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No related child incidents.
                  </p>
                )
              )}
            </div>

            {/* AI Analysis */}
            <div className="bg-zinc-900 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-emerald-400" />
                <span className="text-sm font-semibold">AI Root-Cause Analysis</span>
              </div>
              {incident.aiAnalysis ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-xs text-foreground/80 bg-zinc-800 rounded-lg p-3 overflow-auto max-h-64 font-mono leading-relaxed">
                    {incident.aiAnalysis}
                  </pre>
                </div>
              ) : (
                <button
                  onClick={handleRequestAnalysis}
                  disabled={aiLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-sm disabled:opacity-50"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Request AI Analysis
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Actions */}
            {incident.status !== 'resolved' && (
              <div className="flex gap-3 pt-2">
                {incident.status === 'open' && (
                  <button
                    onClick={handleAcknowledge}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors text-sm font-medium"
                  >
                    <CheckCircle size={16} />
                    Acknowledge
                  </button>
                )}
                <button
                  onClick={handleResolve}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors text-sm font-medium"
                >
                  <CheckCircle size={16} />
                  Resolve
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            <p>Incident not found</p>
          </div>
        )}
      </div>
    </div>
  );
}
