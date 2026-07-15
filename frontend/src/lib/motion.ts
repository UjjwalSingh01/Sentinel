import { useEffect, useRef, useState } from 'react';
import {
  useReducedMotion,
  type Transition,
  type Variants,
} from 'motion/react';

/* ---------------------------------------------------------------------------
   The app's motion vocabulary.

   Three springs and nothing else. Every animated surface picks one of them, so
   a card, a modal and a nav indicator all decelerate with the same personality
   instead of each inventing its own timing.
--------------------------------------------------------------------------- */

/** UI that reacts to a click. Fast, tight, barely overshoots. */
export const snappy: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.7,
};

/** Surfaces that arrive on their own — cards, rows, panels. */
export const soft: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 0.9,
};

/** Big things: modals, page bodies. Slow enough to be noticed, not waited on. */
export const gentle: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 28,
  mass: 1,
};

/** Data that morphs (bar widths, arcs). Springs overshoot; a value must not. */
export const dataEase: Transition = {
  duration: 0.7,
  ease: [0.16, 1, 0.3, 1],
};

/* --- Variants ------------------------------------------------------------ */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: soft },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: gentle },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.14 } },
};

/**
 * Stagger container. Children arrive one after another rather than all at once,
 * which is what makes a grid feel like it's being *dealt* instead of blinking
 * into place. Keep the step small — anything over ~60ms starts to feel slow.
 */
export function stagger(step = 0.035, delay = 0): Variants {
  return {
    hidden: {},
    show: {
      transition: { staggerChildren: step, delayChildren: delay },
    },
  };
}

/* --- Hooks --------------------------------------------------------------- */

/**
 * Interpolates to `value` over `duration`, easing out. Metric readouts use this
 * so a CPU jump from 41 to 92 *travels* — you see the magnitude of the change,
 * not just the new number.
 *
 * Honours reduced-motion by snapping straight to the value.
 */
export function useCountUp(value: number, duration = 700): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const delta = value - from;
    if (Math.abs(delta) < 0.01) return;

    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + delta * eased);
      if (p < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration, reduced]);

  return display;
}

/**
 * Keeps the last `size` samples of a polled value, so a card that only ever
 * receives "the current number" can still draw a sparkline. The history is
 * built client-side from the poll itself — no extra query, no backend change.
 */
export function useHistory<T>(value: T | undefined, size = 40): T[] {
  const [series, setSeries] = useState<T[]>([]);

  useEffect(() => {
    if (value === undefined || value === null) return;
    setSeries((prev) => {
      const next = [...prev, value];
      return next.length > size ? next.slice(next.length - size) : next;
    });
  }, [value, size]);

  return series;
}

/** True only for renders after the first — used to skip entrance animations on
 *  data that was already on screen. */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export { useReducedMotion };
