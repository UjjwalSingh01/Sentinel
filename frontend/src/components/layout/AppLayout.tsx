import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';

import { GET_INCIDENTS } from '@/graphql/queries';
import { connectSSE, disconnectSSE } from '@/lib/sse';
import { LiveContext, type LiveState } from '@/lib/live';
import { RangeContext, type RangeState, type RangeValue } from '@/lib/range';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';

export function AppLayout() {
  const location = useLocation();
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [range, setRange] = useState<RangeValue>('15m');

  // The sidebar badge needs a fleet-wide open count regardless of which page
  // you're on, so the count is owned here rather than by any one page.
  const { data, refetch } = useQuery(GET_INCIDENTS, {
    variables: { limit: 100 },
    pollInterval: 15000,
  });

  const openIncidents = useMemo(() => {
    const rows: { status: string; parentIncidentId: string | null }[] =
      (data as any)?.incidents ?? [];
    return rows.filter((i) => i.status !== 'resolved' && !i.parentIncidentId).length;
  }, [data]);

  const handleNewIncident = useCallback(
    (raw: unknown) => {
      const inc = raw as { server_id?: string; severity?: string; message?: string };
      const critical = inc.severity === 'critical';

      // Route the toast through the right channel: a critical page is an error,
      // a warning is a warning. sonner colours them accordingly.
      (critical ? toast.error : toast.warning)(
        `${critical ? 'Critical' : 'Warning'} · ${inc.server_id ?? 'unknown'}`,
        { description: inc.message ?? 'New incident detected', duration: 7000 },
      );

      setRevision((r) => r + 1);
      refetch();
    },
    [refetch],
  );

  const handleIncidentUpdated = useCallback(() => {
    setRevision((r) => r + 1);
    refetch();
  }, [refetch]);

  useEffect(() => {
    connectSSE({
      onNewIncident: handleNewIncident,
      onIncidentUpdated: handleIncidentUpdated,
      onConnected: () => setConnected(true),
      onError: () => setConnected(false),
    });
    return () => {
      disconnectSSE();
      setConnected(false);
    };
  }, [handleNewIncident, handleIncidentUpdated]);

  /* The console runs on its own palette. The flag goes on <html> rather than a
     wrapper element so that the modals and the command palette — which render
     through portals into <body> — are inside the theme too. Marketing surfaces
     never set it, so they keep the achromatic system. */
  useEffect(() => {
    document.documentElement.dataset.app = 'console';
    return () => {
      delete document.documentElement.dataset.app;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  const live: LiveState = useMemo(
    () => ({ connected, revision, openIncidents, refresh }),
    [connected, revision, openIncidents, refresh],
  );

  const rangeState: RangeState = useMemo(() => ({ range, setRange }), [range]);

  return (
    <LiveContext.Provider value={live}>
      <RangeContext.Provider value={rangeState}>
      <div className="min-h-screen bg-canvas">
        <Sidebar openIncidents={openIncidents} />

        <div className="ml-50 flex min-h-screen flex-col">
          <TopBar onOpenSearch={() => setPaletteOpen(true)} />

          <main className="relative min-h-0 flex-1">
          {/* Route transition. The body fades up on entry — enough to signal
              "this is a new surface" without making navigation feel slow. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
          </main>
        </div>

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
      </RangeContext.Provider>
    </LiveContext.Provider>
  );
}
