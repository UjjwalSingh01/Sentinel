import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client/react';
import { Toaster } from 'sonner';
import { apolloClient } from '@/lib/apollo';
import { isAuthenticated } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ServerDetailPage } from '@/pages/ServerDetailPage';
import { IncidentsPage } from '@/pages/IncidentsPage';
import { LogsPage } from '@/pages/LogsPage';
import { RulesPage } from '@/pages/RulesPage';
import { DashboardsPage } from '@/pages/DashboardsPage';
import { DashboardEditPage } from '@/pages/DashboardEditPage';
import { OnCallAdminPage } from '@/pages/OnCallAdminPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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

      {/* Toasts sit bottom-left: top-right is where the eye already is for page
          actions, and a page landing under the cursor is a misclick waiting to
          happen. Colour comes from the status palette, same as everywhere else. */}
      <Toaster
        position="bottom-left"
        theme="dark"
        closeButton
        toastOptions={{
          style: {
            background: '#16161b',
            border: '1px solid #2b2b34',
            color: '#ececf0',
            fontSize: '13px',
            borderRadius: '8px',
          },
        }}
      />
    </ApolloProvider>
  );
}
