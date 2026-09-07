import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { subscribePointer, useFinePointer } from '@/lib/pointer';

/* ---------------------------------------------------------------------------
   The reticle.

   The console's whole premise is that you point at something and it tells you
   what it is. So the landing page's cursor is an instrument: crosshair rules
   across the viewport, a ring, and a mono readout that names whatever is under
   it (anything carrying `data-probe`) or falls back to raw coordinates.

   It writes transforms straight to the DOM from one rAF — no React state, so
   moving the mouse costs nothing.
--------------------------------------------------------------------------- */

export function Reticle() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();

  const wrapRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const hRef = useRef<HTMLDivElement>(null);
  const vRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!fine) return;

    // Target (raw cursor) and rendered (lerped) positions. The ring trails
    // slightly; the crosshair rules do not — a lagging crosshair reads as
    // broken, a lagging ring reads as weight.
    let tx = -9999;
    let ty = -9999;
    let rx = -9999;
    let ry = -9999;
    let hot = 0;
    let hotTarget = 0;
    let label: string | null = null;
    let rendered: string | null | undefined;
    let visible = false;
    let raf = 0;

    const unsubscribe = subscribePointer((s) => {
      tx = s.x;
      ty = s.y;
      label = s.label;
      hotTarget = s.hot ? 1 : 0;
      if (rx < -9000) {
        rx = tx;
        ry = ty;
      }
      if (visible !== s.active) {
        visible = s.active;
        if (wrapRef.current) wrapRef.current.style.opacity = s.active ? '1' : '0';
      }
      if (!raf) raf = requestAnimationFrame(tick);
    });

    const tick = () => {
      raf = 0;
      const k = reduced ? 1 : 0.22;
      rx += (tx - rx) * k;
      ry += (ty - ry) * k;
      hot += (hotTarget - hot) * (reduced ? 1 : 0.16);

      if (hRef.current) hRef.current.style.transform = `translate3d(0, ${ty}px, 0)`;
      if (vRef.current) vRef.current.style.transform = `translate3d(${tx}px, 0, 0)`;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${(1 + hot * 0.9).toFixed(3)})`;
        ringRef.current.style.borderColor = `rgba(236,236,240,${(0.22 + hot * 0.5).toFixed(3)})`;
      }
      if (tagRef.current) tagRef.current.style.transform = `translate3d(${tx + 16}px, ${ty + 16}px, 0)`;
      // The tag only exists when it has something to say. Over open canvas it
      // would just be a coordinate pair sitting on top of the host label the
      // field already drew there.
      if (rendered !== label) {
        rendered = label;
        if (label && textRef.current) textRef.current.textContent = label;
        tagRef.current?.style.setProperty('opacity', label ? '1' : '0');
      }

      const settled = Math.abs(tx - rx) < 0.4 && Math.abs(ty - ry) < 0.4 && Math.abs(hotTarget - hot) < 0.01;
      if (!settled) raf = requestAnimationFrame(tick);
    };

    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fine, reduced]);

  if (!fine) return null;

  return (
    <div ref={wrapRef} aria-hidden className="pointer-events-none fixed inset-0 z-60 opacity-0 transition-opacity duration-300">
      {/* Rules. Barely there — they give the cursor a coordinate system without
          drawing a grid over the content. */}
      <div ref={hRef} className="absolute top-0 left-0 h-px w-full bg-ink/5.5" />
      <div ref={vRef} className="absolute top-0 left-0 h-full w-px bg-ink/5.5" />

      <div
        ref={ringRef}
        className="absolute top-0 left-0 -mt-2.25 -ml-2.25 h-4.5 w-4.5 rounded-full border"
        style={{ borderColor: 'rgba(236,236,240,0.22)' }}
      >
        <span className="absolute top-1/2 left-1/2 h-0.75 w-0.75 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
      </div>

      <div
        ref={tagRef}
        className="absolute top-0 left-0 rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] tracking-wide whitespace-nowrap text-ink-muted uppercase opacity-0 transition-opacity duration-150"
      >
        <span ref={textRef} />
      </div>
    </div>
  );
}
