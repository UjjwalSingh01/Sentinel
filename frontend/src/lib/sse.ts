/**
 * Sentinel SSE Client
 *
 * Manages EventSource connections for real-time incident streaming.
 * Uses native EventSource with token-based authentication via query parameter.
 */

type SSEEventHandler = (data: unknown) => void;

interface SSEHandlers {
  onNewIncident?: SSEEventHandler;
  onIncidentUpdated?: SSEEventHandler;
  onConnected?: () => void;
  onError?: (error: Event) => void;
}

let eventSource: EventSource | null = null;

export function connectSSE(handlers: SSEHandlers): void {
  disconnectSSE();

  const token = localStorage.getItem('sentinel_access_token');
  if (!token) {
    console.error('[SSE] No access token available');
    return;
  }

  const url = `/api/events?token=${encodeURIComponent(token)}`;
  eventSource = new EventSource(url);

  eventSource.addEventListener('connected', () => {
    console.info('[SSE] Connection established');
    handlers.onConnected?.();
  });

  eventSource.addEventListener('newIncident', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      handlers.onNewIncident?.(data);
    } catch (err) {
      console.error('[SSE] Failed to parse newIncident event', err);
    }
  });

  eventSource.addEventListener('incidentUpdated', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      handlers.onIncidentUpdated?.(data);
    } catch (err) {
      console.error('[SSE] Failed to parse incidentUpdated event', err);
    }
  });

  eventSource.onerror = (error: Event) => {
    console.error('[SSE] Connection error', error);
    handlers.onError?.(error);
  };
}

export function disconnectSSE(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    console.info('[SSE] Disconnected');
  }
}

export function isSSEConnected(): boolean {
  return eventSource !== null && eventSource.readyState === EventSource.OPEN;
}
