import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import {
  LEVEL,
  METRICS,
  SERIES,
  levelForMetric,
  levelForServer,
} from '@/lib/status';
import { fadeUp, snappy, useCountUp } from '@/lib/motion';
import { Meter, Sparkline, StatusBadge } from '@/components/ui';

interface ServerCardProps {
  serverId: string;
  cpu: number;
  memory: number;
  disk: number;
  latencyMs: number;
  incidentCount?: number;
  /** CPU samples accumulated from the dashboard's own polling. */
  history: number[];
}

/**
 * One box per server.
 *
 * The previous card gave equal billing to four radial gauges, which meant four
 * tiny numbers and no answer to the only question you actually ask when you scan
 * a fleet: *which one is hot?* So CPU is promoted to a headline with a trend, and
 * the other three become bars — bars share a baseline, so a column of cards can
 * be compared with your eyes instead of read one at a time.
 */
export function ServerCard({
  serverId,
  cpu,
  memory,
  disk,
  latencyMs,
  incidentCount = 0,
  history,
}: ServerCardProps) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const level = levelForServer({ cpu, memory, disk, latencyMs });
  const cpuLevel = levelForMetric(METRICS.cpu, cpu);
  const token = LEVEL[level];
  const cpuDisplay = useCountUp(cpu);

  return (
    <motion.button
      variants={fadeUp}
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.995 }}
      transition={snappy}
      onClick={() => navigate(`/server/${serverId}`)}
      className="group relative w-full overflow-hidden rounded-lg border border-line bg-card p-4 text-left transition-colors duration-200 hover:border-line-strong"
    >
      {/* Status rail. The whole card doesn't need to turn red — a 2px edge is
          enough to spot across a grid, and it keeps the data legible. */}
      <span
        className="absolute inset-y-0 left-0 w-0.5 transition-opacity duration-300"
        style={{ background: token.mark, opacity: level === 'good' ? 0.35 : 1 }}
      />

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-[13px] font-medium text-ink">{serverId}</div>
          <div className="mt-1.5">
            <StatusBadge level={level}>{token.label}</StatusBadge>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {incidentCount > 0 && (
            <StatusBadge level="critical">
              {incidentCount} alert{incidentCount === 1 ? '' : 's'}
            </StatusBadge>
          )}
          <ArrowUpRight
            size={14}
            className="text-ink-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
        </div>
      </div>

      {/* CPU: the headline. Value on the left, shape on the right. */}
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-medium text-ink-muted">CPU</div>
          <div
            className="font-mono text-[28px] leading-none font-medium tracking-[-0.02em] tabular-nums"
            style={{ color: cpuLevel === 'good' ? 'var(--color-ink)' : LEVEL[cpuLevel].text }}
          >
            {cpuDisplay.toFixed(1)}
            <span className="ml-0.5 text-sm text-ink-subtle">%</span>
          </div>
        </div>

        <Sparkline
          data={history}
          width={128}
          height={36}
          max={100}
          color={SERIES}
          guides={[
            { value: METRICS.cpu.warn, color: LEVEL.warn.mark },
            { value: METRICS.cpu.critical, color: LEVEL.critical.mark },
          ]}
          className="shrink-0"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-line pt-3.5">
        {(['memory', 'disk', 'latencyMs'] as const).map((key) => {
          const spec = METRICS[key];
          const value = { memory, disk, latencyMs }[key];
          return (
            <Meter
              key={key}
              compact
              label={spec.label}
              value={value}
              max={spec.max}
              unit={spec.unit}
              warn={spec.warn}
              critical={spec.critical}
              level={levelForMetric(spec, value)}
            />
          );
        })}
      </div>
    </motion.button>
  );
}
