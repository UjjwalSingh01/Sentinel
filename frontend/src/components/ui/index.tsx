import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEVEL, SERIES, type Level } from '@/lib/status';
import { dataEase, snappy, useCountUp } from '@/lib/motion';

/* ===========================================================================
   Buttons
   Chrome is achromatic — a primary button is *bright*, not green. Colour is
   reserved for signal, so emphasis has to come from contrast instead.
   =========================================================================== */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-canvas hover:bg-white disabled:hover:bg-ink font-medium',
  secondary:
    'bg-elevated text-ink border border-line hover:border-line-strong hover:bg-[#1b1b21]',
  ghost:
    'text-ink-muted hover:text-ink hover:bg-elevated',
  // The one place a status hue touches a control: a destructive action, where
  // the colour *is* the warning.
  danger:
    'text-[#f0716f] bg-[rgba(208,59,59,0.10)] border border-[rgba(208,59,59,0.24)] hover:bg-[rgba(208,59,59,0.18)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', icon: Icon, loading, children, className, disabled, ...props }, ref) => {
    const reduced = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        whileTap={reduced || disabled ? undefined : { scale: 0.97 }}
        transition={snappy}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px]',
          'transition-colors duration-150 disabled:opacity-45 disabled:cursor-not-allowed',
          BUTTON_STYLES[variant],
          className,
        )}
        {...(props as React.ComponentProps<typeof motion.button>)}
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : Icon ? (
          <Icon size={14} />
        ) : null}
        {children}
      </motion.button>
    );
  },
);
Button.displayName = 'Button';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  spinning?: boolean;
}

export function IconButton({ icon: Icon, label, spinning, className, ...props }: IconButtonProps) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      whileTap={reduced ? undefined : { scale: 0.92 }}
      transition={snappy}
      title={label}
      aria-label={label}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-md text-ink-muted',
        'transition-colors duration-150 hover:bg-elevated hover:text-ink',
        className,
      )}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      <Icon size={15} className={spinning ? 'animate-spin' : undefined} />
    </motion.button>
  );
}

/* ===========================================================================
   Status badge — colour + icon + word. Never colour alone.
   =========================================================================== */

interface StatusBadgeProps {
  level: Level;
  children: ReactNode;
  /** Icons are load-bearing for accessibility; only drop them where the row
   *  already carries the same icon in an adjacent cell. */
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({ level, children, showIcon = true, className }: StatusBadgeProps) {
  const token = LEVEL[level];
  const Icon = token.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5',
        'text-[11px] font-medium whitespace-nowrap',
        className,
      )}
      style={{ background: token.tint, color: token.text }}
    >
      {showIcon && <Icon size={11} strokeWidth={2.5} className="shrink-0" />}
      {children}
    </span>
  );
}

/** A neutral, chrome-coloured pill — counts, types, tags. Carries no signal. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
        'bg-elevated text-[11px] font-medium text-ink-muted whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The breathing dot. The only thing in the app that moves forever. */
export function LiveDot({ level = 'good' as Level, className }: { level?: Level; className?: string }) {
  return (
    <span
      className={cn('pulse-dot block h-1.5 w-1.5 rounded-full', className)}
      style={{ background: LEVEL[level].mark }}
    />
  );
}

/* ===========================================================================
   Skeleton
   =========================================================================== */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

/* ===========================================================================
   Meter — a horizontal bar for a bounded value.

   Replaces the old radial gauges. A 4-up row of 80px rings forced every number
   to be tiny and made two servers hard to compare; bars share a baseline, so
   scanning a column of them tells you instantly which box is hot.
   =========================================================================== */

interface MeterProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  level: Level;
  /** Where the warning/critical thresholds sit, drawn as ticks on the track. */
  warn?: number;
  critical?: number;
  compact?: boolean;
}

export function Meter({ label, value, max, unit, level, warn, critical, compact }: MeterProps) {
  const token = LEVEL[level];
  const display = useCountUp(value);
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-muted">{label}</span>
        <span
          className="font-mono text-[13px] font-medium tabular-nums"
          style={{ color: level === 'good' ? 'var(--color-ink)' : token.text }}
        >
          {display.toFixed(unit === 'ms' ? 0 : 1)}
          <span className="ml-0.5 text-[10px] text-ink-subtle">{unit}</span>
        </span>
      </div>

      <div
        className={cn('relative w-full overflow-hidden rounded-full bg-inset', compact ? 'h-1' : 'h-1.5')}
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${value.toFixed(1)}${unit}`}
      >
        {/* Threshold ticks: the bar tells you the value, these tell you what
            the value has to beat. Without them a full-looking bar is meaningless. */}
        {[warn, critical].map((t, i) =>
          t !== undefined && t < max ? (
            <span
              key={i}
              className="absolute top-0 bottom-0 w-px bg-line-strong"
              style={{ left: `${(t / max) * 100}%` }}
            />
          ) : null,
        )}
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: token.mark }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={dataEase}
        />
      </div>
    </div>
  );
}

/* ===========================================================================
   Sparkline — single hue, no axes, no chrome.

   Its job is shape, not value: is this thing climbing? The Meter beside it
   already carries the number, so adding a y-axis here would be noise.
   =========================================================================== */

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Fixed ceiling keeps the shape honest — an auto-scaled sparkline makes a
   *  flat 2% wobble look like a crisis. */
  max?: number;
  color?: string;
  /** Horizontal reference lines (warn/critical). Without them a rising line has
   *  no meaning — "climbing" only matters relative to something. */
  guides?: { value: number; color: string }[];
  className?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 28,
  max,
  color = SERIES,
  guides,
  className,
}: SparklineProps) {
  const reduced = useReducedMotion();
  const id = `spark-${Math.abs(hash(String(data.length) + color))}`;

  const ceiling = max ?? Math.max(...data, 1);
  const span = ceiling || 1;
  const enough = data.length >= 2;

  // With fewer than two samples there is no shape to draw yet — but the frame
  // still renders. An empty box would read as a broken card; an empty *chart*,
  // with its thresholds already in place, reads as one that is filling up.
  const pts = enough
    ? data.map((v, i) => {
        const x = i * (width / (data.length - 1));
        const y = height - (Math.min(v, ceiling) / span) * height;
        return [x, Math.max(1, Math.min(height - 1, y))] as const;
      })
    : [];

  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      <line
        x1={0}
        x2={width}
        y1={height - 0.5}
        y2={height - 0.5}
        stroke="var(--color-line)"
        strokeWidth={1}
      />

      {guides?.map((g, i) =>
        g.value < ceiling ? (
          <line
            key={i}
            x1={0}
            x2={width}
            y1={height - (g.value / span) * height}
            y2={height - (g.value / span) * height}
            stroke={g.color}
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.35}
          />
        ) : null,
      )}

      {enough && (
        <>
          <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
          {/* The head of the line — where the value is *now*. */}
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={color} />
        </>
      )}
    </svg>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/* ===========================================================================
   Stat tile — a headline number. Not a chart; deliberately has no plot.
   =========================================================================== */

interface StatProps {
  label: string;
  value: number;
  icon?: LucideIcon;
  /** Tints the number when non-zero. Used for "3 critical" — a zero there
   *  should stay neutral, because zero critical incidents is not a warning. */
  level?: Level;
  suffix?: string;
}

export function Stat({ label, value, icon: Icon, level = 'neutral', suffix }: StatProps) {
  const display = useCountUp(value);
  const active = value > 0 && level !== 'neutral';
  const token = LEVEL[level];

  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <div
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
          style={{
            background: active ? token.tint : 'var(--color-elevated)',
            color: active ? token.text : 'var(--color-ink-subtle)',
          }}
        >
          <Icon size={14} />
        </div>
      )}
      <div className="min-w-0">
        <div
          className="font-mono text-lg leading-none font-medium tabular-nums"
          style={{ color: active ? token.text : 'var(--color-ink)' }}
        >
          {Math.round(display)}
          {suffix && <span className="ml-0.5 text-xs text-ink-subtle">{suffix}</span>}
        </div>
        <div className="mt-1 truncate text-[11px] text-ink-muted">{label}</div>
      </div>
    </div>
  );
}

/* ===========================================================================
   Empty state
   =========================================================================== */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-elevated text-ink-subtle">
        <Icon size={18} />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[13px] text-ink-muted text-balance">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

/* ===========================================================================
   Tabs — the indicator is a shared layout element, so it *slides* between
   tabs instead of blinking. This is the single cheapest way to make an app
   feel considered.
   =========================================================================== */

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Unique across the page — two Tabs with the same id would share one
   *  indicator and fly across the screen at each other. */
  layoutId: string;
  className?: string;
}

export function Tabs<T extends string>({ items, value, onChange, layoutId, className }: TabsProps<T>) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-lg bg-inset p-1', className)}>
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            aria-current={active}
            className={cn(
              'relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
              'text-[12px] font-medium transition-colors duration-150',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-elevated"
                transition={snappy}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {Icon && <Icon size={12} />}
              {item.label}
              {item.count !== undefined && (
                <span className="font-mono text-[10px] text-ink-subtle tabular-nums">
                  {item.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ===========================================================================
   Page header — one component so every page's title block is identical.
   =========================================================================== */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[19px] leading-tight font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
