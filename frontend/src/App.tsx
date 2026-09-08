import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client/react';
import { Toaster } from 'sonner';
import { apolloClient } from '@/lib/apollo';
import { isAuthenticated } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { PrivacyPage } from '@/pages/legal/PrivacyPage';
import { TermsPage } from '@/pages/legal/TermsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ServerDetailPage } from '@/pages/ServerDetailPage';
import { IncidentsPage } from '@/pages/IncidentsPage';
import { LogsPage } from '@/pages/LogsPage';
import { RulesPage } from '@/pages/RulesPage';
import { DashboardsPage } from '@/pages/DashboardsPage';
import { DashboardEditPage } from '@/pages/DashboardEditPage';
import { OnCallAdminPage } from '@/pages/OnCallAdminPage';

/* A signed-out visitor lands on the marketing page rather than a bare login
   form — the form is one click away from there, and someone arriving from a
   link deserves to be told what this is before being asked for a password. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          {/* Public on purpose: someone must be able to read what they are
              agreeing to before they have an account. */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/server/:serverId" element={<ServerDetailPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/dashboards" element={<DashboardsPage />} />
            <Route path="/dashboards/:id" element={<DashboardEditPage />} />
            <Route path="/admin/on-call" element={<OnCallAdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>

      {/* Bottom-right. Bottom-left sat on the sidebar's footer and top-right
          landed on the fleet's own summary tiles and filter controls — a toast
          that covers the thing it is telling you about is worse than no toast.
          Colour comes from the status palette, same as everywhere else. */}
      <Toaster
        position="bottom-right"
        theme="dark"
        closeButton
        toastOptions={{
          // Tokens rather than literals: toasts only ever appear inside the
          // console, and the console re-tints these variables.
          style: {
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-line-strong)',
            color: 'var(--color-ink)',
            fontSize: '13px',
            borderRadius: '10px',
          },
        }}
      />
    </ApolloProvider>
  );
}
