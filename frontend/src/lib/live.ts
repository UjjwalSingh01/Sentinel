import { createContext, useContext } from 'react';

export interface LiveState {
  /** Is the SSE stream currently open? Drives the "Live stream" indicator. */
  connected: boolean;
  /**
   * Bumped on every incident event. Pages watch this and refetch, which means a
   * new incident lands on screen immediately instead of waiting out the poll.
   */
  revision: number;
  /** Unresolved incidents, for the sidebar badge. */
  openIncidents: number;
  /**
   * Manual refresh from the top bar. It bumps `revision`, which every page
   * already watches — so one control refreshes whatever screen you are on
   * without each page needing its own button.
   */
  refresh: () => void;
}

export const LiveContext = createContext<LiveState>({
  connected: false,
  revision: 0,
  openIncidents: 0,
  refresh: () => {},
});

export function useLive(): LiveState {
  return useContext(LiveContext);
}
