import type { ReactNode } from 'react';
import { useSpotlight } from '@/lib/pointer';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
   A panel that knows where the cursor is.

   The console builds depth out of hairlines rather than shadows, so the hover
   state here is the hairline itself: a masked border that only exists in the
   ~160px around the pointer, plus a barely-there wash on the surface. No glow,
   no lift, no scale — the panel just becomes legible where you're looking.
--------------------------------------------------------------------------- */

export function ProbePanel({
  children,
  className,
  probe,
  tint = 'var(--color-series)',
}: {
  children: ReactNode;
  className?: string;
  /** Read out by the reticle while the cursor is inside. */
  probe?: string;
  tint?: string;
}) {
  const ref = useSpotlight<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-probe={probe}
      className={cn('relative overflow-hidden rounded-lg border border-line bg-card', className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `radial-gradient(220px circle at var(--px, -999px) var(--py, -999px), color-mix(in srgb, ${tint} 7%, transparent), transparent 72%)`,
          opacity: 'var(--near, 0)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-lg border"
        style={{
          borderColor: `color-mix(in srgb, ${tint} 55%, transparent)`,
          opacity: 'var(--near, 0)',
          maskImage:
            'radial-gradient(170px circle at var(--px, -999px) var(--py, -999px), #000 0%, transparent 70%)',
          WebkitMaskImage:
            'radial-gradient(170px circle at var(--px, -999px) var(--py, -999px), #000 0%, transparent 70%)',
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
