import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { LEVEL, levelForIncidentStatus, levelForSeverity } from '@/lib/status';
import { snappy, stagger } from '@/lib/motion';
import { EmptyState, StatusBadge } from '@/components/ui';
import { timeAgo } from '@/lib/format';

export interface FeedIncident {
  id: string;
  serverId: string;
  metricType: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
}

interface IncidentFeedProps {
  incidents: FeedIncident[];
  onIncidentClick: (id: string) => void;
  /** Ids that arrived during this session — they get the one-time flash. */
  freshIds: Set<string>;
}

export function IncidentFeed({ incidents, onIncidentClick, freshIds }: IncidentFeedProps) {
  const reduced = useReducedMotion();

  if (incidents.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No active incidents"
        hint="Every server in the fleet is inside its thresholds."
      />
    );
  }

  return (
    <motion.div variants={stagger(0.03)} initial="hidden" animate="show" className="space-y-1 p-1.5">
      {/* AnimatePresence gives rows an exit: a resolved incident slides out
          rather than the list snapping shut under your cursor. */}
      <AnimatePresence initial={false}>
        {incidents.map((incident) => {
          const sev = levelForSeverity(incident.severity);
          const token = LEVEL[sev];
          const Icon = token.icon;

          return (
            <motion.button
              key={incident.id}
              layout
              variants={{
                hidden: { opacity: 0, x: -8 },
                show: { opacity: 1, x: 0 },
              }}
              exit={{ opacity: 0, x: 8, height: 0, marginBottom: 0 }}
              transition={snappy}
              onClick={() => onIncidentClick(incident.id)}
              className={`w-full rounded-md border border-transparent p-2.5 text-left transition-colors duration-150 hover:border-line hover:bg-elevated ${
                !reduced && freshIds.has(incident.id) ? 'flash-in' : ''
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  size={14}
                  className="mt-0.5 shrink-0"
                  style={{ color: token.text }}
                  aria-hidden
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-[12px] font-medium text-ink">
                      {incident.serverId}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-subtle">
                      {timeAgo(incident.createdAt)}
                    </span>
                  </div>

                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-muted">
                    {incident.message}
                  </p>

                  <div className="mt-2 flex items-center gap-1.5">
                    <StatusBadge level={sev} showIcon={false}>
                      {incident.severity}
                    </StatusBadge>
                    <StatusBadge level={levelForIncidentStatus(incident.status)} showIcon={false}>
                      {incident.status}
                    </StatusBadge>
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
