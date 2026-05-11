import { Server, Activity, HardDrive, Clock, AlertTriangle, AlertOctagon } from 'lucide-react';
import { MetricGauge } from './MetricGauge';
import { useNavigate } from 'react-router-dom';

interface ServerCardProps {
  serverId: string;
  cpu: number;
  memory: number;
  disk: number;
  latencyMs: number;
  incidentCount?: number;
}

function getOverallStatus(cpu: number, memory: number, latencyMs: number): 'healthy' | 'warning' | 'critical' {
  if (cpu > 90 || memory > 95) return 'critical';
  if (cpu > 80 || memory > 85 || latencyMs > 800) return 'warning';
  return 'healthy';
}

const statusConfig = {
  healthy: {
    border: 'border-emerald-500/20',
    glow: 'shadow-emerald-500/5',
    dot: 'bg-emerald-500',
    label: 'Healthy',
    icon: Server,
  },
  warning: {
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/5',
    dot: 'bg-amber-500',
    label: 'Warning',
    icon: AlertTriangle,
  },
  critical: {
    border: 'border-red-500/30',
    glow: 'shadow-red-500/10',
    dot: 'bg-red-500 animate-pulse',
    label: 'Critical',
    icon: AlertOctagon,
  },
};

export function ServerCard({ serverId, cpu, memory, disk, latencyMs, incidentCount = 0 }: ServerCardProps) {
  const navigate = useNavigate();
  const status = getOverallStatus(cpu, memory, latencyMs);
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div
      onClick={() => navigate(`/server/${serverId}`)}
      className={`
        glass rounded-xl p-5 cursor-pointer
        border ${config.border}
        shadow-lg ${config.glow}
        hover:shadow-xl hover:scale-[1.02]
        transition-all duration-300 ease-out
        animate-fade-in
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-zinc-800`}>
            <StatusIcon size={18} className={status === 'critical' ? 'text-red-500' : status === 'warning' ? 'text-amber-500' : 'text-emerald-500'} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">{serverId}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${config.dot}`} />
              <span className="text-xs text-muted-foreground">{config.label}</span>
            </div>
          </div>
        </div>
        {incidentCount > 0 && (
          <span className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-xs font-medium">
            {incidentCount} alert{incidentCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-2">
        <MetricGauge
          value={cpu}
          max={100}
          label="CPU"
          unit="%"
          warningThreshold={80}
          criticalThreshold={90}
          size={80}
        />
        <MetricGauge
          value={memory}
          max={100}
          label="Memory"
          unit="%"
          warningThreshold={85}
          criticalThreshold={95}
          size={80}
        />
        <MetricGauge
          value={disk}
          max={100}
          label="Disk"
          unit="%"
          warningThreshold={80}
          criticalThreshold={90}
          size={80}
        />
        <MetricGauge
          value={latencyMs}
          max={2000}
          label="Latency"
          unit="ms"
          warningThreshold={500}
          criticalThreshold={800}
          size={80}
        />
      </div>
    </div>
  );
}
