import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { pointer } from '@/lib/pointer';

/* ---------------------------------------------------------------------------
   The hero field.

   Not decoration: it is the product's mental model. A fleet sits on a lattice,
   mostly dark, and the cursor is the probe — whatever you sweep over resolves
   into a hostname and a live number, and the lattice bends around it. You
   learn the pitch ("point at infrastructure, get an answer") by moving the
   mouse before you read a word of copy.

   Colour discipline is the same as the console's: the lattice is achromatic,
   the series hue marks what you're inspecting, and red only ever means a node
   is actually in trouble.
--------------------------------------------------------------------------- */

interface Node {
  id: string;
  /** Position as a fraction of the canvas, so the fleet reflows with the hero. */
  fx: number;
  fy: number;
  base: number;
  unit: string;
}

// The real seven from services/simulator. Placed clear of the headline column.
const NODES: Node[] = [
  { id: 'staging-db-01', fx: 0.19, fy: 0.15, base: 52, unit: '%' },
  { id: 'prod-web-01', fx: 0.63, fy: 0.17, base: 44, unit: '%' },
  { id: 'prod-web-02', fx: 0.82, fy: 0.33, base: 48, unit: '%' },
  { id: 'prod-api-01', fx: 0.70, fy: 0.56, base: 58, unit: '%' },
  { id: 'prod-api-02', fx: 0.91, fy: 0.68, base: 41, unit: '%' },
  { id: 'prod-worker-03', fx: 0.56, fy: 0.83, base: 63, unit: '%' },
  { id: 'staging-cache-01', fx: 0.15, fy: 0.86, base: 37, unit: '%' },
];

// Only the prod constellation is wired together, and only between neighbours.
// Long edges would draw diagonals straight through the headline, and the two
// staging hosts genuinely aren't part of that cluster — so they sit alone.
const EDGES: [number, number][] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [3, 5],
];

const SPACING = 30;
const PROBE = 210;
const REVEAL = 250;

const INK = '236,236,240';
const SERIES = '57,135,229';
const CRIT = '208,59,59';

export function FleetLattice({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let originX = 0;
    let originY = 0;
    let raf = 0;
    let visible = true;
    const start = performance.now();

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Centre the lattice so it never looks cropped on one side.
      cols = Math.ceil(w / SPACING) + 1;
      rows = Math.ceil(h / SPACING) + 1;
      originX = (w - (cols - 1) * SPACING) / 2;
      originY = (h - (rows - 1) * SPACING) / 2;
      if (reduced) draw(0, -9999, -9999, false);
    };

    /** cpu value for node i at time t — smooth, plausible, never repeating soon. */
    const valueAt = (i: number, t: number) => {
      const n = NODES[i];
      return n.base + 14 * Math.sin(t * 0.31 + i * 1.7) + 7 * Math.sin(t * 0.13 + i * 3.1);
    };

    const draw = (t: number, mx: number, my: number, active: boolean) => {
      ctx.clearRect(0, 0, w, h);

      // Which node is currently on fire. One at a time, on a slow rotation, so
      // the field always has exactly one thing worth looking at.
      const cycle = 13;
      const hotIndex = Math.floor(t / cycle) % NODES.length;
      const hotPhase = (t % cycle) / cycle;
      // Ramp in, hold, ramp out — a step change would read as a rendering bug.
      const hotAmount = Math.max(0, Math.min(1, Math.min(hotPhase * 6, (1 - hotPhase) * 4)));

      /* --- lattice ---------------------------------------------------------
         Points brighten near the cursor and drift outward from it, so the
         field visibly yields to the probe. */
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = originX + c * SPACING;
          const y = originY + r * SPACING;

          const dx = x - mx;
          const dy = y - my;
          const d = Math.hypot(dx, dy);
          const inf = active && d < PROBE ? 1 - d / PROBE : 0;
          const eased = inf * inf;

          // Ambient breathing keeps the field alive when nobody is pointing —
          // and legible on a touch device, where nobody ever will.
          const wave = 0.5 + 0.5 * Math.sin(t * 0.6 + x * 0.011 + y * 0.017);
          const alpha = 0.11 + wave * 0.07 + eased * 0.55;

          const push = eased * 7;
          const px = d > 0.01 ? x + (dx / d) * push : x;
          const py = d > 0.01 ? y + (dy / d) * push : y;
          const size = 1 + eased * 1.6;

          ctx.fillStyle =
            eased > 0.35
              ? `rgba(${SERIES},${(alpha * 0.9).toFixed(3)})`
              : `rgba(${INK},${alpha.toFixed(3)})`;
          ctx.fillRect(px - size / 2, py - size / 2, size, size);
        }
      }

      const pos = NODES.map((n) => [n.fx * w, n.fy * h] as const);

      /* --- mesh ----------------------------------------------------------- */
      ctx.lineWidth = 1;
      for (const [a, b] of EDGES) {
        const [ax, ay] = pos[a];
        const [bx, by] = pos[b];
        // Edges near the cursor lift out of the background.
        const mid = Math.hypot((ax + bx) / 2 - mx, (ay + by) / 2 - my);
        const lift = active ? Math.max(0, 1 - mid / (REVEAL * 1.6)) : 0;
        ctx.strokeStyle = `rgba(${INK},${(0.045 + lift * 0.14).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      /* --- nodes ---------------------------------------------------------- */
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < NODES.length; i++) {
        const [x, y] = pos[i];
        const d = Math.hypot(x - mx, y - my);
        const near = active && d < REVEAL ? 1 - d / REVEAL : 0;
        const crit = i === hotIndex ? hotAmount : 0;
        const value = Math.min(97.6, valueAt(i, t) + crit * 38);
        const rgb = crit > 0.3 ? CRIT : SERIES;

        // Tether: the probe is physically connected to what it's reading.
        if (near > 0.02) {
          ctx.strokeStyle = `rgba(${SERIES},${(near * 0.28).toFixed(3)})`;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Critical halo — the one thing on the page that pulses on its own.
        if (crit > 0.02) {
          const ring = (t % 1.8) / 1.8;
          ctx.strokeStyle = `rgba(${CRIT},${(crit * (1 - ring) * 0.5).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, 6 + ring * 26, 0, Math.PI * 2);
          ctx.stroke();
        }

        // The node itself: a square, because everything measured in this app is
        // drawn with straight edges.
        const s = 7 + near * 3;
        ctx.fillStyle = `rgba(${rgb},${(0.18 + near * 0.5 + crit * 0.4).toFixed(3)})`;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        ctx.strokeStyle = `rgba(${rgb},${(0.4 + near * 0.6 + crit * 0.4).toFixed(3)})`;
        ctx.strokeRect(x - s / 2 - 0.5, y - s / 2 - 0.5, s + 1, s + 1);

        // Label + reading. Hidden until you look at it — except when it's
        // critical, which announces itself.
        const legible = Math.max(near, crit * 0.9);
        if (legible > 0.03) {
          ctx.fillStyle = `rgba(${INK},${(legible * 0.72).toFixed(3)})`;
          ctx.fillText(NODES[i].id, x + 12, y - 5);
          ctx.fillStyle =
            crit > 0.3
              ? `rgba(240,113,111,${legible.toFixed(3)})`
              : `rgba(${SERIES},${legible.toFixed(3)})`;
          ctx.fillText(`cpu ${value.toFixed(1)}${NODES[i].unit}`, x + 12, y + 8);
        }
      }
    };

    const frame = () => {
      raf = 0;
      const p = pointer();
      const t = (performance.now() - start) / 1000;
      draw(t, p.x, p.y, p.active);
      if (visible) raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();

    // Stop the loop when the hero scrolls away or the tab is hidden — no point
    // burning a frame budget on something nobody is looking at.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && !document.hidden;
        if (visible && !raf && !reduced) raf = requestAnimationFrame(frame);
      },
      { threshold: 0 },
    );
    io.observe(parent);

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible && !raf && !reduced) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisibility);

    if (!reduced) raf = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
