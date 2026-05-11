import { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@apollo/client/react';
import { Activity, AlertTriangle, Server, RefreshCw } from 'lucide-react';
import { GET_SERVERS, GET_INCIDENTS } from '@/graphql/queries';
import { ServerCard } from '@/components/dashboard/ServerCard';
import { IncidentFeed } from '@/components/dashboard/IncidentFeed';
import { IncidentDetailDialog } from '@/components/incidents/IncidentDetailDialog';
import { connectSSE, disconnectSSE } from '@/lib/sse';
import { toast } from 'sonner';

interface ServerData {
  serverId: string;
  cpu: number;
  memory: number;
  disk: number;
  latencyMs: number;
}

interface IncidentData {
  id: string;
  serverId: string;
  metricType: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
}

export function DashboardPage() {
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);

  const {
    data: serversData,
    loading: serversLoading,
    refetch: refetchServers,
  } = useQuery(GET_SERVERS, {
    pollInterval: 5000,
  });

  const {
    data: incidentsData,
    loading: incidentsLoading,
    refetch: refetchIncidents,
  } = useQuery(GET_INCIDENTS, {
    variables: { limit: 20 },
    pollInterval: 10000,
  });

  const handleNewIncident = useCallback(
    (data: unknown) => {
      const incident = data as { server_id?: string; severity?: string; message?: string };
      toast.error(
        `${(incident.severity || 'alert').toUpperCase()} on ${incident.server_id || 'unknown'}`,
        {
          description: incident.message || 'New incident detected',
          duration: 6000,
        }
      );
      refetchIncidents();
      refetchServers();
    },
    [refetchIncidents, refetchServers]
  );

  const handleIncidentUpdated = useCallback(
    (data: unknown) => {
      const incident = data as { status?: string; server_id?: string };
      toast.info(
        `Incident ${incident.status || 'updated'}`,
        {
          description: `Server: ${incident.server_id || 'unknown'}`,
          duration: 4000,
        }
      );
      refetchIncidents();
    },
    [refetchIncidents]
  );

  useEffect(() => {
    connectSSE({
      onNewIncident: handleNewIncident,
      onIncidentUpdated: handleIncidentUpdated,
      onConnected: () => {
        toast.success('Real-time connection established', { duration: 2000 });
      },
    });

    return () => {
      disconnectSSE();
    };
  }, [handleNewIncident, handleIncidentUpdated]);

  const servers: ServerData[] = (serversData as any)?.servers || [];
  const incidents: IncidentData[] = (incidentsData as any)?.incidents || [];
  const openIncidents = incidents.filter((i: IncidentData) => i.status !== 'resolved');

  // Count incidents per server
  const incidentCounts: Record<string, number> = {};
  openIncidents.forEach((i: IncidentData) => {
    incidentCounts[i.serverId] = (incidentCounts[i.serverId] || 0) + 1;
  });

  return (
    <div className="p-6 h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time infrastructure overview</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900">
            <Activity size={14} className="text-emerald-400" />
            <span className="text-xs text-muted-foreground">{servers.length} servers</span>
            <span className="text-xs text-zinc-600">|</span>
            <AlertTriangle size={14} className={openIncidents.length > 0 ? 'text-amber-400' : 'text-muted-foreground'} />
            <span className="text-xs text-muted-foreground">{openIncidents.length} active</span>
          </div>
          <button
            onClick={() => { refetchServers(); refetchIncidents(); }}
            className="p-2 rounded-lg hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Server grid */}
        <div className="flex-1 overflow-y-auto pr-2">
          {serversLoading && servers.length === 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="glass rounded-xl p-5 h-52 animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-zinc-800" />
                    <div>
                      <div className="w-24 h-4 bg-zinc-800 rounded" />
                      <div className="w-16 h-3 bg-zinc-800 rounded mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="w-16 h-16 bg-zinc-800 rounded-full mx-auto" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Server size={48} className="opacity-20 mb-4" />
              <p className="text-lg font-medium">No servers detected</p>
              <p className="text-sm mt-1">Waiting for metric data from the simulator...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {servers.map((server: ServerData) => (
                <ServerCard
                  key={server.serverId}
                  serverId={server.serverId}
                  cpu={server.cpu}
                  memory={server.memory}
                  disk={server.disk}
                  latencyMs={server.latencyMs}
                  incidentCount={incidentCounts[server.serverId] || 0}
                />
              ))}
            </div>
          )}
        </div>

        {/* Incident feed sidebar */}
        <div className="w-80 shrink-0 glass rounded-xl border border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              <h3 className="text-sm font-semibold">Incident Feed</h3>
              <span className="ml-auto text-xs text-muted-foreground bg-zinc-800 px-2 py-0.5 rounded-full">
                {openIncidents.length}
              </span>
            </div>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            {incidentsLoading && incidents.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 bg-zinc-800/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <IncidentFeed
                incidents={incidents}
                onIncidentClick={setSelectedIncident}
              />
            )}
          </div>
        </div>
      </div>

      {/* Incident detail dialog */}
      <IncidentDetailDialog
        incidentId={selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
