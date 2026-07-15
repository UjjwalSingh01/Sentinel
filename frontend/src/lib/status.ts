import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from 'lucide-react';

/* ---------------------------------------------------------------------------
   The status vocabulary.

   Every green/amber/red pixel in the app resolves through this file. Two rules
   hold everywhere:

     1. A status colour is RESERVED — it never paints a button, a tab, a link or
        a chart series. If it's coloured, it's telling you about a value.
     2. A status never travels alone. Each level carries an icon and a word, so
        the meaning survives colourblindness, greyscale printing and forced-
        colors mode.
--------------------------------------------------------------------------- */

export type Level = 'good' | 'warn' | 'serious' | 'critical' | 'neutral';

export interface LevelToken {
  /** Solid mark colour — meters, bars, dots, chart threshold rules. */
  mark: string;
  /** Text-safe step of the same hue (>=6.6:1 on our surfaces). */
  text: string;
  /** Tinted fill for badges and rows. */
  tint: string;
  /** Hairline for a tinted container. */
  ring: string;
  icon: LucideIcon;
  label: string;
}

export const LEVEL: Record<Level, LevelToken> = {
  good: {
    mark: '#0ca30c',
    text: '#3ecf5c',
    tint: 'rgba(12, 163, 12, 0.12)',
    ring: 'rgba(12, 163, 12, 0.28)',
    icon: CheckCircle2,
    label: 'Healthy',
  },
  warn: {
    mark: '#fab219',
    text: '#fab219',
    tint: 'rgba(250, 178, 25, 0.12)',
    ring: 'rgba(250, 178, 25, 0.28)',
    icon: AlertTriangle,
    label: 'Warning',
  },
  serious: {
    mark: '#ec835a',
    text: '#ec835a',
    tint: 'rgba(236, 131, 90, 0.12)',
    ring: 'rgba(236, 131, 90, 0.28)',
    icon: AlertTriangle,
    label: 'Serious',
  },
  critical: {
    mark: '#d03b3b',
    text: '#f0716f',
    tint: 'rgba(208, 59, 59, 0.14)',
    ring: 'rgba(208, 59, 59, 0.32)',
    icon: AlertOctagon,
    label: 'Critical',
  },
  neutral: {
    mark: '#6e6e78',
    text: '#9a9aa4',
    tint: 'rgba(255, 255, 255, 0.05)',
    ring: 'rgba(255, 255, 255, 0.10)',
    icon: Info,
    label: 'Unknown',
  },
};

/** The one hue every time-series and sparkline is drawn in. */
export const SERIES = '#3987e5';
export const SERIES_TEXT = '#6ba7f5';

/* --- Metric thresholds --------------------------------------------------- */

export type MetricKey = 'cpu' | 'memory' | 'disk' | 'latencyMs';

export interface MetricSpec {
  key: MetricKey;
  label: string;
  unit: string;
  max: number;
  warn: number;
  critical: number;
}

export const METRICS: Record<MetricKey, MetricSpec> = {
  cpu: { key: 'cpu', label: 'CPU', unit: '%', max: 100, warn: 80, critical: 90 },
  memory: { key: 'memory', label: 'Memory', unit: '%', max: 100, warn: 85, critical: 95 },
  disk: { key: 'disk', label: 'Disk', unit: '%', max: 100, warn: 80, critical: 90 },
  latencyMs: { key: 'latencyMs', label: 'Latency', unit: 'ms', max: 2000, warn: 500, critical: 800 },
};

export function levelForMetric(spec: MetricSpec, value: number): Level {
  if (value >= spec.critical) return 'critical';
  if (value >= spec.warn) return 'warn';
  return 'good';
}

/** A server's overall health is the worst of its parts. */
export function levelForServer(s: {
  cpu: number;
  memory: number;
  disk: number;
  latencyMs: number;
}): Level {
  const levels = (Object.keys(METRICS) as MetricKey[]).map((k) =>
    levelForMetric(METRICS[k], s[k]),
  );
  if (levels.includes('critical')) return 'critical';
  if (levels.includes('warn')) return 'warn';
  return 'good';
}

/* --- Incident / log mappings --------------------------------------------- */

/** Incident severity strings from the API → our level vocabulary. */
export function levelForSeverity(severity: string): Level {
  return severity === 'critical' ? 'critical' : 'warn';
}

export function levelForLogLevel(level: string): Level {
  const l = level.toUpperCase();
  if (l === 'FATAL' || l === 'ERROR') return 'critical';
  if (l === 'WARN' || l === 'WARNING') return 'warn';
  if (l === 'DEBUG') return 'neutral';
  return 'good';
}

/** Incident lifecycle. Resolved is "good" — the thing is over. */
export function levelForIncidentStatus(status: string): Level {
  if (status === 'open') return 'critical';
  if (status === 'acknowledged') return 'warn';
  return 'good';
}
