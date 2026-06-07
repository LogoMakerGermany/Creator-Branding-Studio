import { useEffect } from 'react';
import { Outlet, Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Sidebar, BottomNav } from '../components/Sidebar';
import { fetchCsrfToken } from '../lib/api';
import { CoinBalance } from '../components/CoinBalance';

export function AppLayout() {
  const { user, loading, fetchUser } = useAuthStore();
  const { id: projectId } = useParams();

  useEffect(() => {
    fetchCsrfToken().catch(() => {});
    fetchUser();
  }, [fetchUser]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mesh">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-neon-pink border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-mesh">
      <Sidebar projectId={projectId} />
      <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
        <div className="mx-auto max-w-7xl p-4 md:p-8">
          <div className="mb-6 flex justify-end">
            <CoinBalance />
          </div>
          <Outlet />
        </div>
      </main>
      <BottomNav projectId={projectId} />
    </div>
  );
}

export function AuthLayout() {
  const { user, loading, fetchUser } = useAuthStore();

  useEffect(() => { fetchUser(); }, [fetchUser]);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-mesh p-4">
      <Outlet />
    </div>
  );
}
