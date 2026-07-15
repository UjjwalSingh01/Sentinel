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
}

export const LiveContext = createContext<LiveState>({
  connected: false,
  revision: 0,
  openIncidents: 0,
});

export function useLive(): LiveState {
  return useContext(LiveContext);
}
