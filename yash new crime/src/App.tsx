/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/public/LandingPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import CitizenDashboard from './pages/citizen/CitizenDashboard';
import AdminLogin from './pages/auth/AdminLogin';
import CitizenLogin from './pages/auth/CitizenLogin';
import CitizenRegister from './pages/auth/CitizenRegister';
import ForgotPassword from './pages/auth/ForgotPassword';

import { ToastProvider } from './components/ToastProvider';
import { useAppSelector } from './store/hooks';
import { selectIsAuthenticated, selectCurrentUser } from './store/slices/authSlice';

const ADMIN_ROLES = new Set(['admin', 'officer', 'super_admin', 'viewer']);
const CITIZEN_ROLES = new Set(['citizen', 'officer', 'viewer']);

function RequireAuth({ children, portal }: { children: ReactNode; portal: 'admin' | 'citizen' }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);

  const loginPath = portal === 'admin' ? '/admin-login' : '/citizen-login';
  const homePath = portal === 'admin' ? '/admin' : '/citizen';

  if (!isAuthenticated || !user) {
    return <Navigate to={loginPath} replace />;
  }

  const allowed = portal === 'admin' ? ADMIN_ROLES : CITIZEN_ROLES;
  if (!allowed.has(user.role)) {
    // Signed in, but this portal is not for their role - send them home.
    const theirPortal = user.role === 'citizen' ? '/citizen' : '/admin';
    return <Navigate to={theirPortal === homePath ? '/' : theirPortal} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/citizen-login" element={<CitizenLogin />} />
          <Route path="/citizen-register" element={<CitizenRegister />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/admin/*"
            element={
              <RequireAuth portal="admin">
                <AdminDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/citizen/*"
            element={
              <RequireAuth portal="citizen">
                <CitizenDashboard />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}
