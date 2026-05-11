import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { AlertTriangle, Filter, RefreshCw } from 'lucide-react';
import { GET_INCIDENTS } from '@/graphql/queries';
import { IncidentDetailDialog } from '@/components/incidents/IncidentDetailDialog';

export function IncidentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery(GET_INCIDENTS, {
    variables: {
      status: statusFilter === 'all' ? undefined : statusFilter,
      limit: 100,
    },
    pollInterval: 10000,
  });

  const incidents = (data as any)?.incidents || [];

  const statusTabs = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'acknowledged', label: 'Acknowledged' },
    { value: 'resolved', label: 'Resolved' },
  ];

  const countByStatus = (s: string) =>
    s === 'all'
      ? incidents.length
      : incidents.filter((i: any) => i.status === s).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and manage infrastructure incidents
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6">
        <Filter size={14} className="text-muted-foreground" />
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              statusFilter === tab.value
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-zinc-800'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] opacity-60">
              ({countByStatus(tab.value)})
            </span>
          </button>
        ))}
      </div>

      {/* Incidents Table */}
      <div className="glass rounded-xl border border-zinc-800 overflow-hidden">
        {loading && incidents.length === 0 ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <AlertTriangle size={40} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">No incidents found</p>
            <p className="text-sm mt-1">
              {statusFilter !== 'all'
                ? `No ${statusFilter} incidents. Try changing the filter.`
                : 'All systems operating normally.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Server
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Metric
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Message
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Assignee
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {incidents.map((inc: any) => (
                <tr
                  key={inc.id}
                  onClick={() => setSelectedIncident(inc.id)}
                  className="hover:bg-zinc-800/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] font-semibold px-2 py-1 rounded ${
                        inc.severity === 'critical'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {inc.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">{inc.serverId}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {inc.metricType}
                  </td>
                  <td className="px-4 py-3 text-sm max-w-xs truncate">
                    {inc.message}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] px-2 py-1 rounded ${
                        inc.status === 'open'
                          ? 'bg-red-500/10 text-red-400'
                          : inc.status === 'acknowledged'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {inc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {inc.assignee?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(inc.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <IncidentDetailDialog
        incidentId={selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
