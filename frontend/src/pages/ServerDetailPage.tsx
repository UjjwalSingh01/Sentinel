import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { ArrowLeft, Server, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { GET_METRICS, GET_INCIDENTS } from '@/graphql/queries';
import { MetricChart } from '@/components/server/MetricChart';
import { TimeRangeSelector, getTimeRange } from '@/components/server/TimeRangeSelector';
import { IncidentDetailDialog } from '@/components/incidents/IncidentDetailDialog';

export function ServerDetailPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('15m');
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const { from, bucketMinutes } = getTimeRange(timeRange);

  const { data: metricsData, loading: metricsLoading } = useQuery(GET_METRICS, {
    variables: { serverId, fromTime: from.toISOString(), toTime: new Date().toISOString(), bucketMinutes },
    pollInterval: 5000, skip: !serverId,
  });

  const { data: incidentsData } = useQuery(GET_INCIDENTS, {
    variables: { serverId, limit: 10 }, skip: !serverId,
  });

  const metrics = (metricsData as any)?.metrics || [];
  const incidents = (incidentsData as any)?.incidents || [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-800"><Server size={20} className="text-emerald-400" /></div>
            <div>
              <h1 className="text-xl font-bold font-mono">{serverId}</h1>
              <p className="text-xs text-muted-foreground">Server metrics and history</p>
            </div>
          </div>
        </div>
        <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />
      </div>

      {metricsLoading && metrics.length === 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="glass rounded-xl p-4 border border-zinc-800">
              <div className="h-4 w-20 bg-zinc-800 rounded mb-3" />
              <div className="h-48 bg-zinc-800/50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : metrics.length === 0 ? (
        <div className="glass rounded-xl p-12 border border-zinc-800 flex flex-col items-center justify-center text-muted-foreground mb-6">
          <Loader2 size={32} className="opacity-20 mb-3 animate-spin" />
          <p className="text-sm">Waiting for metric data...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <MetricChart data={metrics.map((m: any) => ({ time: m.time, value: m.cpu }))} label="CPU Usage" unit="%" color="#10b981" warningThreshold={80} criticalThreshold={90} />
          <MetricChart data={metrics.map((m: any) => ({ time: m.time, value: m.memory }))} label="Memory Usage" unit="%" color="#3b82f6" warningThreshold={85} criticalThreshold={95} />
          <MetricChart data={metrics.map((m: any) => ({ time: m.time, value: m.disk }))} label="Disk Usage" unit="%" color="#8b5cf6" warningThreshold={80} criticalThreshold={90} />
          <MetricChart data={metrics.map((m: any) => ({ time: m.time, value: m.latencyMs }))} label="Request Latency" unit="ms" color="#f59e0b" warningThreshold={500} criticalThreshold={800} />
        </div>
      )}

      <div className="glass rounded-xl border border-zinc-800">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400" />
          <h3 className="text-sm font-semibold">Recent Incidents</h3>
        </div>
        {incidents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground"><p className="text-sm">No incidents for this server</p></div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {incidents.map((inc: any) => (
              <div key={inc.id} onClick={() => setSelectedIncident(inc.id)} className="p-4 flex items-center gap-4 hover:bg-zinc-800/30 cursor-pointer transition-colors">
                <div className={`p-1.5 rounded-lg ${inc.severity === 'critical' ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                  <AlertTriangle size={14} className={inc.severity === 'critical' ? 'text-red-400' : 'text-amber-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{inc.message}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${inc.severity === 'critical' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>{inc.severity.toUpperCase()}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${inc.status === 'open' ? 'bg-red-500/10 text-red-400' : inc.status === 'acknowledged' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{inc.status}</span>
                  <div className="flex items-center gap-1 mt-1 text-muted-foreground"><Clock size={10} /><span className="text-[10px]">{new Date(inc.createdAt).toLocaleString()}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <IncidentDetailDialog incidentId={selectedIncident} onClose={() => setSelectedIncident(null)} />
    </div>
  );
}
