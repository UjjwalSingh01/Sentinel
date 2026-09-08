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

  /* The indicator used to depend solely on the server's own `connected` event.
     If that named event never arrived — or arrived before this listener was
     attached — the console sat there reporting OFFLINE while incidents were
     visibly streaming in, which is the worst possible lie for a status light
     to tell. `onopen` fires when the transport is actually established, so it
     is the honest source of truth; the custom event is kept as a second
     confirmation. */
  eventSource.onopen = () => {
    handlers.onConnected?.();
  };

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

// ---------------------------------------------------------------------------
// Log tail
// ---------------------------------------------------------------------------

export interface LogRecord {
  time?: string;
  timestamp?: string;
  server_id: string;
  service?: string | null;
  level: string;
  message: string;
  fields?: Record<string, unknown> | null;
  trace_id?: string | null;
}

interface LogTailHandlers {
  onLog: (record: LogRecord) => void;
  onConnected?: () => void;
  onError?: (error: Event) => void;
}

export function connectLogTail(serverId: string | null, handlers: LogTailHandlers): () => void {
  const token = localStorage.getItem('sentinel_access_token');
  if (!token) {
    console.error('[SSE] No access token available for log tail');
    return () => {};
  }

  const params = new URLSearchParams({ token });
  if (serverId) params.set('server_id', serverId);
  const url = `/api/logs/tail?${params.toString()}`;
  const es = new EventSource(url);

  es.addEventListener('connected', () => {
    console.info('[SSE] Log tail established', serverId ?? 'all');
    handlers.onConnected?.();
  });

  es.addEventListener('log', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as LogRecord;
      handlers.onLog(data);
    } catch (err) {
      console.error('[SSE] Failed to parse log event', err);
    }
  });

  es.onerror = (error: Event) => {
    console.error('[SSE] Log tail error', error);
    handlers.onError?.(error);
  };

  return () => {
    es.close();
  };
}
