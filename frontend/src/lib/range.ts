import { createContext, useContext } from 'react';

/* ---------------------------------------------------------------------------
   The fleet-wide time window.

   Previously the only time control in the product lived inside one page, which
   meant the console had no answer to the question every operator asks first:
   "show me the last fifteen minutes of everything." It lives in the top bar now
   and every page that plots or lists time-bounded data reads it from here.
--------------------------------------------------------------------------- */

export const RANGES = [
  { value: '5m', minutes: 5 },
  { value: '15m', minutes: 15 },
  { value: '1h', minutes: 60 },
  { value: '6h', minutes: 360 },
  { value: '24h', minutes: 1440 },
] as const;

export type RangeValue = (typeof RANGES)[number]['value'];

export interface RangeState {
  range: RangeValue;
  setRange: (r: RangeValue) => void;
}

export const RangeContext = createContext<RangeState>({
  range: '15m',
  setRange: () => {},
});

export function useRange(): RangeState {
  return useContext(RangeContext);
}

export function rangeMinutes(range: RangeValue): number {
  return RANGES.find((r) => r.value === range)?.minutes ?? 15;
}

/**
 * `at` is passed in rather than read from the clock so callers can pin the
 * window to a stable tick — minting a fresh `new Date()` on every render makes
 * Apollo treat each render as a new query and refetch forever.
 */
export function windowFor(
  range: RangeValue,
  at: number = Date.now(),
): { from: Date; bucketMinutes: number } {
  const minutes = rangeMinutes(range);
  let bucketMinutes = 1;
  if (minutes > 60) bucketMinutes = 5;
  if (minutes > 360) bucketMinutes = 15;
  return { from: new Date(at - minutes * 60_000), bucketMinutes };
}
