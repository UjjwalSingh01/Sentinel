import { useEffect, useRef, useState } from 'react';

/* ---------------------------------------------------------------------------
   Pointer bus.

   The landing page has a lot of things reacting to the cursor at once: a
   canvas field, half a dozen spotlit panels, a magnetic button, the reticle.
   If each of those bound its own `pointermove` and called
   getBoundingClientRect() inside it, we'd be doing N layout reads per mouse
   event and thrashing style/layout in the same tick.

   So there is exactly one listener, one rAF, and one pass per frame: read
   every rect first, then write every custom property. Nothing here triggers a
   React render — cursor state lives in the DOM, not in state.
--------------------------------------------------------------------------- */

export interface PointerState {
  x: number;
  y: number;
  /** False before the first move and while the pointer is off the document. */
  active: boolean;
  /** `data-probe` of whatever sits under the cursor. The reticle reads it out. */
  label: string | null;
  /** True while the pointer is over something interactive. */
  hot: boolean;
}

const state: PointerState = { x: -9999, y: -9999, active: false, label: null, hot: false };

type Listener = (s: PointerState) => void;
const listeners = new Set<Listener>();

interface Target {
  /** 0 = spotlight only. >0 = also pulled toward the cursor by this fraction. */
  magnet: number;
}
const targets = new Map<HTMLElement, Target>();

let bound = false;
let frame = 0;

function flush() {
  frame = 0;

  // Pass 1 — read. Every rect is measured before a single style is written.
  const measured: [HTMLElement, Target, DOMRect][] = [];
  targets.forEach((cfg, el) => measured.push([el, cfg, el.getBoundingClientRect()]));

  // Pass 2 — write.
  for (const [el, cfg, r] of measured) {
    const x = state.x - r.left;
    const y = state.y - r.top;
    el.style.setProperty('--px', `${x.toFixed(1)}px`);
    el.style.setProperty('--py', `${y.toFixed(1)}px`);

    // How close the cursor is to the element, 0..1, with a generous falloff so
    // a panel starts responding just before you arrive at it.
    const dx = Math.max(r.left - state.x, 0, state.x - r.right);
    const dy = Math.max(r.top - state.y, 0, state.y - r.bottom);
    const dist = Math.hypot(dx, dy);
    const near = state.active ? Math.max(0, 1 - dist / 160) : 0;
    el.style.setProperty('--near', near.toFixed(3));

    if (cfg.magnet > 0) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const radius = Math.max(r.width, r.height) * 0.9 + 60;
      const d = Math.hypot(state.x - cx, state.y - cy);
      const pull = state.active && d < radius ? (1 - d / radius) * cfg.magnet : 0;
      el.style.transform = pull
        ? `translate3d(${((state.x - cx) * pull).toFixed(2)}px, ${((state.y - cy) * pull).toFixed(2)}px, 0)`
        : 'translate3d(0, 0, 0)';
    }
  }
}

function schedule() {
  if (!frame && targets.size) frame = requestAnimationFrame(flush);
}

function onMove(e: PointerEvent) {
  state.x = e.clientX;
  state.y = e.clientY;
  state.active = true;

  const el = e.target instanceof Element ? e.target : null;
  const probe = el?.closest<HTMLElement>('[data-probe]');
  state.label = probe?.dataset.probe ?? null;
  state.hot = !!el?.closest('a, button, [role="button"]');

  schedule();
  listeners.forEach((fn) => fn(state));
}

function onLeave() {
  state.active = false;
  state.label = null;
  state.hot = false;
  schedule();
  listeners.forEach((fn) => fn(state));
}

function bind() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
}

/** Current cursor position. For rAF consumers (canvas) that poll rather than subscribe. */
export function pointer(): Readonly<PointerState> {
  bind();
  return state;
}

export function subscribePointer(fn: Listener): () => void {
  bind();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Publishes cursor position onto the element as `--px` / `--py` (pixels,
 * element-relative) and `--near` (0..1 proximity). Style with those; no render
 * happens, so this is free to put on as many panels as you like.
 */
export function useSpotlight<T extends HTMLElement>(magnet = 0) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    bind();
    targets.set(el, { magnet });
    schedule();
    return () => {
      targets.delete(el);
      if (magnet > 0) el.style.transform = '';
    };
  }, [magnet]);

  return ref;
}

/**
 * True only for real pointing devices. Everything cursor-specific on the page
 * is gated on this — a touch device gets the same layout with none of the
 * hover machinery, rather than a broken imitation of it.
 */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return fine;
}
