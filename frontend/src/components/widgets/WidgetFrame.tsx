import type { ReactNode } from 'react';

/**
 * Shared chrome for every dashboard widget: a title bar, an optional headline
 * value, and a body that fills whatever the grid cell gives it. Having one frame
 * means widgets line up with each other no matter how they're arranged.
 */
export function WidgetFrame({
  title,
  value,
  children,
}: {
  title: string;
  value?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-medium text-ink-muted">{title}</span>
        {value && (
          <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums">{value}</span>
        )}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function WidgetMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-ink-subtle">
      {children}
    </div>
  );
}
