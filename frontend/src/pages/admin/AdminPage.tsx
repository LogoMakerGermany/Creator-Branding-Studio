import { useEffect, useState } from 'react';
import { api, type AdminAnalytics, type TesterFeedbackRow, type UserProfile } from '@/services/api';
import { Button, Input } from '@/components/ui';

type PaymentClaim = {
  id: string;
  provider: string;
  status: string;
  userId?: string;
  packageId?: string;
  coins?: number;
  error?: string;
  updatedAt?: string;
};

type AuditRow = {
  id: string;
  actorUserId: string;
  action: string;
  targetUserId?: string;
  reason?: string;
  createdAt: string;
};

export function AdminPage() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [feedback, setFeedback] = useState<TesterFeedbackRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [payments, setPayments] = useState<{ stripe: PaymentClaim[]; paypal: PaymentClaim[] }>({
    stripe: [],
    paypal: [],
  });
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof api.status>> | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [tx, setTx] = useState<unknown[]>([]);
  const [jobs, setJobs] = useState<unknown[]>([]);
  const [amount, setAmount] = useState('50');
  const [reason, setReason] = useState('');
  const [confirmAdj, setConfirmAdj] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  async function load(query?: string) {
    try {
      const [a, u, f, au, p, st] = await Promise.all([
        api.admin.analytics(),
        api.admin.users(query),
        api.admin.feedback(),
        api.admin.audit(),
        api.admin.payments(),
        api.status(),
      ]);
      setAnalytics(a.analytics);
      setUsers(u.users);
      setFeedback(f.feedback);
      setAudit(au.audit);
      setPayments({ stripe: p.stripe, paypal: p.paypal });
      setProviders(st);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin-Zugriff verweigert');
    }
  }

  async function openUser(u: UserProfile) {
    setSelected(u);
    const detail = await api.admin.user(u.id);
    setSelected(detail.user);
    setTx(detail.transactions);
    setJobs(detail.jobs);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">Admin</h1>
      {error && <p className="text-sm text-amber-300">{error}</p>}
      {providers && (
        <div className="rounded-xl border border-white/10 p-4 text-xs text-zinc-400">
          <p className="mb-2 font-semibold text-white">Provider (configured ≠ online)</p>
          {['openai', 'replicate', 'runway', 'elevenlabs'].map((k) => (
            <p key={k}>
              {k}: {providers.ai[k]?.configured ? 'configured' : 'not configured'}
            </p>
          ))}
          <p>resend: {providers.resend?.configured ? 'configured' : 'not configured'}</p>
          <p>stripe: {providers.stripe.configured ? 'configured' : 'not configured'}</p>
          <p>paypal: {providers.paypal.configured ? 'configured' : 'not configured'}</p>
        </div>
      )}
      {analytics && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['User', analytics.users],
            ['Generierungen', analytics.generations],
            ['Fehlerquote', `${Math.round(analytics.failRate * 100)}%`],
            ['API-Kosten ct', analytics.apiCostCents ?? 0],
            ['Coins ausgegeben', analytics.coinsSpent],
            ['Coins gekauft', analytics.coinsBought],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl border border-white/10 p-4">
              <p className="text-[11px] uppercase text-zinc-500">{k}</p>
              <p className="font-display text-2xl text-white">{v}</p>
            </div>
          ))}
        </div>
      )}
      <div>
        <h2 className="mb-2 font-semibold text-white">User</h2>
        <div className="mb-3 flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche E-Mail / Name" />
          <Button onClick={() => void load(q)}>Suchen</Button>
        </div>
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
            >
              <button type="button" className="text-left text-zinc-200" onClick={() => void openUser(u)}>
                {u.displayName} · {u.email} · {u.role} · {u.coinBalance} Coins
                {u.disabled ? ' · gesperrt' : ''}
              </button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    void api.admin.disable(u.id, !u.disabled, u.disabled ? 'entsperrt' : 'gesperrt').then(() => load(q))
                  }
                >
                  {u.disabled ? 'Entsperren' : 'Sperren'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {selected && (
        <div className="space-y-3 rounded-xl border border-white/10 p-4">
          <h2 className="font-semibold text-white">
            {selected.displayName} — {selected.coinBalance} Coins {selected.disabled ? '(gesperrt)' : ''}
          </h2>
          <p className="text-xs text-zinc-500">Coin-Anpassung braucht Betrag, Grund und Bestätigung.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24"
              label="Betrag"
            />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Grund (pflicht)" label="Grund" />
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={confirmAdj} onChange={(e) => setConfirmAdj(e.target.checked)} />
              Bestätigen
            </label>
            <Button
              disabled={!confirmAdj || reason.trim().length < 3}
              onClick={() => {
                const n = Number.parseInt(amount, 10);
                if (!Number.isInteger(n) || n === 0) return;
                void api.admin
                  .coins(selected.id, n, reason.trim(), true)
                  .then(() => {
                    setConfirmAdj(false);
                    return openUser(selected);
                  })
                  .then(() => load(q));
              }}
            >
              Buchen
            </Button>
          </div>
          {selected.role === 'tester' && (
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={confirmGrant}
                  onChange={(e) => setConfirmGrant(e.target.checked)}
                />
                Bestätigen: 500 Test-Coins
              </label>
              <Button
                disabled={!confirmGrant || reason.trim().length < 3}
                onClick={() => {
                  void api.admin
                    .testerGrant(selected.id, reason.trim() || 'Tester-Guthaben V1', true)
                    .then((r) => {
                      setGrantMsg(r.message);
                      setConfirmGrant(false);
                      return openUser(selected);
                    })
                    .then(() => load(q))
                    .catch((err) => setGrantMsg(err instanceof Error ? err.message : 'Grant fehlgeschlagen'));
                }}
              >
                500 Test-Coins vergeben
              </Button>
              {grantMsg && <p className="text-xs text-zinc-400">{grantMsg}</p>}
            </div>
          )}
          <div>
            <p className="mb-1 text-xs uppercase text-zinc-500">Letzte Coin-Transaktionen</p>
            {tx.slice(0, 8).map((row) => {
              const r = row as { id: string; type: string; amount: number; description: string };
              return (
                <p key={r.id} className="text-xs text-zinc-400">
                  {r.type} {r.amount} — {r.description}
                </p>
              );
            })}
          </div>
          <div>
            <p className="mb-1 text-xs uppercase text-zinc-500">Jobs</p>
            {jobs.slice(0, 5).map((row) => {
              const r = row as { id: string; status?: string; module?: string };
              return (
                <p key={r.id} className="text-xs text-zinc-400">
                  {r.module ?? 'job'} · {r.status}
                </p>
              );
            })}
          </div>
        </div>
      )}
      <div>
        <h2 className="mb-2 font-semibold text-white">Payments</h2>
        {[...payments.stripe, ...payments.paypal].slice(0, 20).map((p) => (
          <p key={`${p.provider}-${p.id}`} className="text-xs text-zinc-400">
            {p.provider} {p.id.slice(0, 12)}… · {p.status}
            {p.packageId ? ` · ${p.packageId}` : ''}
            {p.error ? ` · ${p.error}` : ''}
          </p>
        ))}
        {payments.stripe.length + payments.paypal.length === 0 && (
          <p className="text-xs text-zinc-500">Keine Payment-Claims.</p>
        )}
      </div>
      <div>
        <h2 className="mb-2 font-semibold text-white">Audit</h2>
        {audit.slice(0, 20).map((a) => (
          <p key={a.id} className="text-xs text-zinc-400">
            {a.createdAt} · {a.action} · {a.actorUserId.slice(0, 8)} → {a.targetUserId?.slice(0, 8)} · {a.reason}
          </p>
        ))}
      </div>
      <div>
        <h2 className="mb-2 font-semibold text-white">Tester-Feedback</h2>
        {feedback.length === 0 && <p className="text-xs text-zinc-500">Kein Feedback.</p>}
        {feedback.map((f) => (
          <div key={f.id} className="border-b border-white/5 py-2 text-sm text-zinc-300">
            <p>
              {f.createdAt} · {f.category ?? 'other'} · {f.module} · {f.status ?? 'new'} · {f.userId.slice(0, 8)}
            </p>
            <p>{f.message}</p>
            {f.screenshotDataUrl && (
              <img src={f.screenshotDataUrl} alt="Feedback-Screenshot" className="mt-2 max-h-32 rounded" />
            )}
            <label htmlFor={`fb-st-${f.id}`} className="mt-1 block text-[11px] text-zinc-500">
              Status
            </label>
            <select
              id={`fb-st-${f.id}`}
              className="rounded border border-zinc-700 bg-surface-900 px-2 py-1 text-xs"
              value={statusMap[f.id] ?? f.status ?? 'new'}
              onChange={(e) => {
                const status = e.target.value;
                setStatusMap((m) => ({ ...m, [f.id]: status }));
                void api.admin.updateFeedback(f.id, status).then(() => load(q));
              }}
            >
              {['new', 'reviewing', 'resolved', 'closed'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
