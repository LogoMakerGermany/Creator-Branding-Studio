import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { ReactNode } from 'react';
import { isAdminRole, UserRole } from '@ucbs/shared';
import { AUTH_GATE_PATH, isPathAllowedForGate, resolveAuthGate } from '@/lib/auth-gates';
import { Button } from '@/components/ui';

function AuthSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-950" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <span className="sr-only">Anmeldung wird geprüft</span>
    </div>
  );
}

function ProfileLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface-950 p-6 text-center">
      <p className="max-w-md text-sm text-zinc-300" role="alert">
        Deine Sitzung ist noch aktiv, das Profil konnte aber gerade nicht geladen werden.
      </p>
      <Button className="min-h-11" onClick={onRetry}>
        Erneut versuchen
      </Button>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, hasFirebaseSession, profileLoadError, refreshUser } = useAuth();
  const location = useLocation();

  if (loading) return <AuthSpinner />;

  if (!user) {
    if (hasFirebaseSession && profileLoadError) {
      return <ProfileLoadError onRetry={() => void refreshUser()} />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const gate = resolveAuthGate(user);
  if (gate === 'login') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isPathAllowedForGate(location.pathname, gate)) {
    return <Navigate to={AUTH_GATE_PATH[gate]} replace />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, hasFirebaseSession, profileLoadError, refreshUser } = useAuth();
  const location = useLocation();

  if (loading) return <AuthSpinner />;

  if (!user) {
    if (hasFirebaseSession && profileLoadError) {
      return <ProfileLoadError onRetry={() => void refreshUser()} />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const gate = resolveAuthGate(user);
  if (gate !== 'app') {
    return <Navigate to={AUTH_GATE_PATH[gate]} replace />;
  }

  if (!isAdminRole(user.role as UserRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading, hasFirebaseSession, profileLoadError, refreshUser } = useAuth();

  if (loading) return <AuthSpinner />;

  if (!user && hasFirebaseSession && profileLoadError) {
    return <ProfileLoadError onRetry={() => void refreshUser()} />;
  }

  if (user) {
    const gate = resolveAuthGate(user);
    return <Navigate to={AUTH_GATE_PATH[gate]} replace />;
  }

  return <>{children}</>;
}
