import { AlertTriangle, AlertOctagon, Clock } from 'lucide-react';

interface Incident {
  id: string;
  serverId: string;
  metricType: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
}

interface IncidentFeedProps {
  incidents: Incident[];
  onIncidentClick: (id: string) => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const severityStyles = {
  critical: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    icon: AlertOctagon,
    iconColor: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400',
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-400',
  },
};

export function IncidentFeed({ incidents, onIncidentClick }: IncidentFeedProps) {
  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertTriangle size={32} className="mb-3 opacity-30" />
        <p className="text-sm">No active incidents</p>
        <p className="text-xs mt-1 opacity-60">All systems operational</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
      {incidents.map((incident, index) => {
        const config = severityStyles[incident.severity as keyof typeof severityStyles] || severityStyles.warning;
        const Icon = config.icon;

        return (
          <div
            key={incident.id}
            onClick={() => onIncidentClick(incident.id)}
            className={`
              p-3 rounded-lg border cursor-pointer
              ${config.bg} ${config.border}
              hover:bg-zinc-800/50 transition-colors duration-200
              animate-slide-up
            `}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start gap-2.5">
              <Icon size={16} className={`${config.iconColor} mt-0.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.badge}`}>
                    {incident.severity.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {incident.serverId}
                  </span>
                </div>
                <p className="text-xs text-foreground/80 line-clamp-2">{incident.message}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  <Clock size={10} className="text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(incident.createdAt)}
                  </span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                    incident.status === 'open'
                      ? 'bg-red-500/10 text-red-400'
                      : incident.status === 'acknowledged'
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {incident.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
