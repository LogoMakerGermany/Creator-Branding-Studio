import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';

export function AdminPage() {
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => (await api.get('/admin/stats')).data,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => (await api.get('/admin/users')).data,
  });

  const { data: apiUsage = [] } = useQuery({
    queryKey: ['admin-api'],
    queryFn: async () => (await api.get('/admin/api-usage')).data,
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => (await api.get('/payments/admin/all')).data,
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/admin/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Admin Dashboard</h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <GlassCard glow="pink"><p className="text-sm text-white/50">Benutzer</p><p className="text-2xl font-bold">{stats?.userCount ?? '–'}</p></GlassCard>
        <GlassCard glow="cyan"><p className="text-sm text-white/50">Projekte</p><p className="text-2xl font-bold">{stats?.projectCount ?? '–'}</p></GlassCard>
        <GlassCard glow="purple"><p className="text-sm text-white/50">API-Nutzung</p><p className="text-2xl font-bold">{apiUsage.reduce((s: number, u: { count: number }) => s + u.count, 0)}</p></GlassCard>
      </div>

      <GlassCard className="mt-8">
        <h2 className="font-semibold">Benutzerverwaltung</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-white/40"><th className="pb-2">Name</th><th>E-Mail</th><th>Coins</th><th>Rolle</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u: { id: string; name: string; email: string; role: string; banned: boolean; coins?: number }) => (
                <tr key={u.id} className="border-t border-white/5">
                  <td className="py-2">{u.name}</td>
                  <td>{u.email}</td>
                  <td className="text-neon-pink">{u.coins ?? 0}</td>
                  <td>
                    <select value={u.role} onChange={e => updateUser.mutate({ id: u.id, data: { role: e.target.value } })}
                      className="rounded bg-surface-3 px-2 py-1 text-xs">
                      <option value="tester">Tester</option>
                      <option value="user">Benutzer</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{u.banned ? 'Gesperrt' : 'Aktiv'}</td>
                  <td>
                    <NeonButton variant="ghost" className="!px-2 !py-1 text-xs"
                      onClick={() => updateUser.mutate({ id: u.id, data: { banned: !u.banned } })}>
                      {u.banned ? 'Entsperren' : 'Sperren'}
                    </NeonButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <h2 className="font-semibold">Audit Logs</h2>
          <div className="mt-3 max-h-60 overflow-y-auto space-y-2 text-xs">
            {(stats?.recentAudit || []).map((l: { id: string; action: string; resource?: string; createdAt: string }) => (
              <div key={l.id} className="rounded bg-white/5 p-2">
                <span className="text-neon-cyan">{l.action}</span> {l.resource} – {new Date(l.createdAt).toLocaleString('de-DE')}
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <h2 className="font-semibold">Security Events</h2>
          <div className="mt-3 max-h-60 overflow-y-auto space-y-2 text-xs">
            {(stats?.recentSecurity || []).map((e: { id: string; type: string; severity: string; message: string }) => (
              <div key={e.id} className="rounded bg-white/5 p-2">
                <span className={e.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}>[{e.severity}]</span> {e.type}: {e.message}
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <h2 className="font-semibold">Fehler</h2>
          <div className="mt-3 max-h-60 overflow-y-auto space-y-2 text-xs">
            {(stats?.recentErrors || []).map((j: { id: string; assetType: string; error?: string }) => (
              <div key={j.id} className="rounded bg-red-500/10 p-2 text-red-300">
                {j.assetType}: {j.error}
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <h2 className="font-semibold">API Nutzung</h2>
          <div className="mt-3 space-y-2">
            {apiUsage.map((u: { provider: string; count: number }) => (
              <div key={u.provider} className="flex justify-between text-sm">
                <span>{u.provider}</span><span className="text-neon-purple">{u.count}</span>
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <h2 className="font-semibold">Zahlungen (Stripe / PayPal)</h2>
          <div className="mt-3 max-h-60 overflow-y-auto space-y-2 text-xs">
            {(paymentsData?.payments || []).slice(0, 20).map((p: { id: string; provider: string; coins: number; status: string; amountEur: number }) => (
              <div key={p.id} className="flex justify-between rounded bg-white/5 p-2">
                <span>{p.provider} · {p.coins} Coins</span>
                <span className="text-neon-cyan">{p.status} · {p.amountEur}€</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
