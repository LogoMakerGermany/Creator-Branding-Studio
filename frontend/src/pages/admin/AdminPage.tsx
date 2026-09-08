import { useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type AdminAnalytics,
  type AdminSystemStatus,
  type AdminUserSummary,
  type TesterFeedbackRow,
} from '@/services/api';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

type PaymentClaim = {
  id: string;
  provider: string;
  status: string;
  packageId?: string;
  error?: string;
};

type AuditRow = {
  id: string;
  actorUserId: string;
  action: string;
  targetUserId?: string;
  reason?: string;
  createdAt: string;
};

type InviteRow = {
  id: string;
  code: string;
  description: string;
  assignedEmail?: string;
  maximumUses: number;
  currentUses: number;
  expiresAt?: string;
  isActive: boolean;
  grantRole?: string;
  createdAt: string;
};

type JobRow = {
  id: string;
  userId: string;
  module?: string;
  status: string;
  errorCode?: string;
  createdAt: string;
  assetKey?: string;
  parentJobId?: string;
  batchId?: string;
  refunded?: boolean;
};

function SectionError({ message }: { message: string }) {
  return (
    <p className="text-sm text-amber-200" role="alert">
      {message}
    </p>
  );
}

export function AdminPage() {
  const { user: actor } = useAuth();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [system, setSystem] = useState<AdminSystemStatus | null>(null);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userOffset, setUserOffset] = useState(0);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [feedback, setFeedback] = useState<TesterFeedbackRow[]>([]);
  const [feedbackHasMore, setFeedbackHasMore] = useState(false);
  const [feedbackOffset, setFeedbackOffset] = useState(0);
  const [fbStatus, setFbStatus] = useState('');
  const [fbType, setFbType] = useState('');
  const [fbCategory, setFbCategory] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<TesterFeedbackRow | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [payments, setPayments] = useState<{ stripe: PaymentClaim[]; paypal: PaymentClaim[] }>({
    stripe: [],
    paypal: [],
  });
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobStatus, setJobStatus] = useState('');
  const [q, setQ] = useState('');
  const [dashError, setDashError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUserSummary | null>(null);
  const [tx, setTx] = useState<Array<{ id: string; type: string; amount: number; description: string }>>([]);
  const [userJobs, setUserJobs] = useState<JobRow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; type?: string }>>([]);
  const [files, setFiles] = useState<Array<{ id: string; name: string; mimeType?: string }>>([]);
  const [nexterSessionCount, setNexterSessionCount] = useState(0);
  const [amount, setAmount] = useState('50');
  const [reason, setReason] = useState('');
  const [confirmAdj, setConfirmAdj] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmRole, setConfirmRole] = useState(false);
  const [nextRole, setNextRole] = useState('user');
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [inviteDesc, setInviteDesc] = useState('');
  const [inviteMax, setInviteMax] = useState('1');
  const [confirmInviteRevoke, setConfirmInviteRevoke] = useState<string | null>(null);
  const [confirmRecover, setConfirmRecover] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const pageSize = 25;

  async function loadDashboard() {
    setDashLoading(true);
    try {
      const data = await api.admin.overview();
      setAnalytics(data.analytics);
      setSystem(data.system);
      setDashError(null);
    } catch (err) {
      setDashError(err instanceof Error ? err.message : 'Übersicht nicht ladbar');
    } finally {
      setDashLoading(false);
    }
  }

  async function loadUsers(query?: string, offset = 0) {
    setUsersLoading(true);
    try {
      const u = await api.admin.users(query, pageSize, offset);
      setUsers(u.users);
      setUserTotal(u.total);
      setUserOffset(u.offset);
      setHasMoreUsers(u.hasMore);
      setUsersError(null);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'User-Liste nicht ladbar');
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadJobs(status?: string) {
    setJobsLoading(true);
    try {
      const r = await api.admin.jobs(status || undefined);
      setJobs(r.jobs);
      setJobsError(null);
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Jobs nicht ladbar');
    } finally {
      setJobsLoading(false);
    }
  }

  async function loadInvites() {
    setInvitesLoading(true);
    try {
      const r = await api.admin.invites();
      setInvites(r.invites);
      setInvitesError(null);
    } catch (err) {
      setInvitesError(err instanceof Error ? err.message : 'Invites nicht ladbar');
    } finally {
      setInvitesLoading(false);
    }
  }

  async function loadFeedback(offset = 0, append = false) {
    try {
      const f = await api.admin.feedback({
        status: fbStatus || undefined,
        type: fbType || undefined,
        category: fbCategory || undefined,
        limit: 25,
        offset,
      });
      setFeedback((prev) => (append ? [...prev, ...f.feedback] : f.feedback));
      setFeedbackHasMore(Boolean(f.hasMore));
      setFeedbackOffset((f.offset ?? 0) + f.feedback.length);
      setFeedbackError(null);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Support-Liste nicht ladbar');
    }
  }

  async function loadSecondary() {
    try {
      const [au, p] = await Promise.all([api.admin.audit(), api.admin.payments()]);
      setAudit(au.audit);
      setPayments({ stripe: p.stripe, paypal: p.paypal });
    } catch {
      /* isolated */
    }
    await loadFeedback(0, false);
  }

  async function openUser(u: AdminUserSummary) {
    setSelected(u);
    const detail = await api.admin.user(u.id);
    setSelected(detail.user);
    setTx(detail.transactions);
    setUserJobs(detail.jobs);
    setProjects(detail.projects);
    setFiles(detail.files);
    setNexterSessionCount(detail.nexterSessionCount);
    setNextRole(detail.user.role === 'admin' || detail.user.role === 'tester' || detail.user.role === 'support' ? detail.user.role : 'user');
  }

  useEffect(() => {
    void loadDashboard();
    void loadUsers();
    void loadJobs();
    void loadInvites();
    void loadSecondary();
  }, []);

  const paymentsEnabled = system?.payments.enabled === true;

  return (
    <div className="space-y-8 pb-16">
      <h1 className="font-display text-3xl font-bold text-white">Admin</h1>

      <section aria-labelledby="admin-system">
        <h2 id="admin-system" className="mb-2 font-semibold text-white">
          Systemstatus
        </h2>
        {dashLoading && (
          <p className="text-sm text-zinc-500" role="status">
            Systemstatus wird geladen…
          </p>
        )}
        {dashError && <SectionError message={dashError} />}
        {system && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 p-4 text-sm text-zinc-300">
              <p className="text-[11px] uppercase text-zinc-500">Umgebung</p>
              <p className="text-white">{system.environment}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Firebase: {system.firebase.adminConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'} · {system.firebase.mode}
                {system.firebase.projectConsistency
                  ? ` · Projekt-IDs: ${
                      system.firebase.projectConsistency === 'ok'
                        ? 'OK'
                        : system.firebase.projectConsistency === 'mismatch'
                          ? 'PROBLEM'
                          : 'NOT VERIFIED'
                    }`
                  : ''}
              </p>
              {system.email && (
                <p className="text-xs text-zinc-500">
                  Firebase Auth E-Mail:{' '}
                  {system.email.firebaseAuthEmail === 'available' ? 'AVAILABLE' : 'UNAVAILABLE'} · Resend:{' '}
                  {system.email.customProviderStatus === 'configured' ? 'CONFIGURED' : 'NOT CONFIGURED'}
                </p>
              )}
              <p className="text-xs text-zinc-500">
                Datenspeicher: {system.devStore ? 'lokaler Dev Store (kein Production-Firestore)' : 'Firestore'}
              </p>
              {system.checkedAt && (
                <p className="text-xs text-zinc-500">Stand: {system.checkedAt}</p>
              )}
              {typeof system.processUptimeSec === 'number' && (
                <p className="text-xs text-zinc-500">
                  Prozesslaufzeit: {system.processUptimeSec}s (kein SLA, keine Historie)
                </p>
              )}
            </div>
            <div className="rounded-xl border border-white/10 p-4 text-sm text-zinc-300">
              <p className="text-[11px] uppercase text-zinc-500">Zahlungen</p>
              <p className="text-white">{paymentsEnabled ? 'aktiviert' : 'deaktiviert'}</p>
              <p className="mt-1 text-xs text-zinc-500">
                ENV: {system.payments.envEnabled ? 'an' : 'aus'} · Settings: {system.payments.settingsEnabled ? 'an' : 'aus'}
              </p>
              <p className="text-xs text-zinc-500">Kein Umsatz. Coins sind kein Erlös.</p>
            </div>
            <div className="rounded-xl border border-white/10 p-4 text-sm text-zinc-300">
              <p className="text-[11px] uppercase text-zinc-500">Registrierung / Kill-Switch</p>
              <p className="text-white">{system.settings.registrationMode}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Generierung: {system.settings.generationsEnabled ? 'an' : 'aus'} · Bild:{' '}
                {system.settings.imageGenerationsEnabled ? 'an' : 'aus'} · Video:{' '}
                {system.settings.videoGenerationsEnabled ? 'an' : 'aus'}
              </p>
            </div>
          </div>
        )}
        {system && (
          <div className="mt-3 rounded-xl border border-white/10 p-4 text-xs text-zinc-400">
            <p className="mb-2 font-semibold text-white">Diagnose (keine Keys, keine Live-Pings)</p>
            <p>
              Firestore:{' '}
              {system.firestore
                ? `${system.firestore.configured ? 'CONFIGURED' : 'NOT CONFIGURED'} · ${system.firestore.mode}`
                : system.devStore
                  ? 'DEV STORE'
                  : 'n/a'}
            </p>
            <p>Storage: {system.storage?.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</p>
            <p>Zahlungen: {paymentsEnabled ? 'aktiviert' : 'deaktiviert'}</p>
            <p>Job-Zähler stehen unter Übersicht — Stichprobe, kein SLA/Uptime-Verlauf.</p>
          </div>
        )}
        {system && (
          <div className="mt-3 rounded-xl border border-white/10 p-4 text-xs text-zinc-400">
            <p className="mb-2 font-semibold text-white">Provider (configured ≠ online, keine Keys)</p>
            {Object.entries(system.providers).map(([k, v]) => (
              <p key={k}>
                {k}: {v.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
              </p>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="admin-metrics">
        <h2 id="admin-metrics" className="mb-2 font-semibold text-white">
          Übersicht
        </h2>
        {dashLoading && (
          <p className="text-sm text-zinc-500" role="status">
            Kennzahlen werden geladen…
          </p>
        )}
        {analytics && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['User (Scan)', analytics.users],
              ['Gesperrt', analytics.disabledUsers ?? 0],
              ['Jobs gesamt', analytics.generations],
              ['Pending', analytics.pendingJobs ?? 0],
              ['Processing', analytics.processingJobs ?? 0],
              ['Failed', analytics.failed],
              ['Fehlerquote', `${Math.round(analytics.failRate * 100)}%`],
              ['Invites aktiv', analytics.activeInviteCount ?? 0],
              ['Coins ausgegeben', analytics.coinsSpent],
              ['Coin-Kaufbuchungen', analytics.coinsBought],
              ['API-Kosten ct', analytics.apiCostCents ?? 0],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-white/10 p-4">
                <p className="text-[11px] uppercase text-zinc-500">{k}</p>
                <p className="font-display text-2xl text-white">{v}</p>
              </div>
            ))}
          </div>
        )}
        {analytics && (
          <p className="mt-2 text-[11px] text-zinc-500">Kennzahlen aus begrenztem Scan — kein SLA, keine Uptime-Historie.</p>
        )}
      </section>

      {system && (
        <section aria-labelledby="admin-settings">
          <h2 id="admin-settings" className="mb-2 font-semibold text-white">
            System Settings
          </h2>
          <p className="mb-2 text-xs text-zinc-500">Quelle: system_settings. ENV-Zahlungskill bleibt zusätzlich hart aus, solange PAYMENTS_ENABLED nicht true ist.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-zinc-300" htmlFor="reg-mode">
              Registration Mode
              <select
                id="reg-mode"
                className="mt-1 block min-h-11 rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm text-white"
                value={system.settings.registrationMode}
                onChange={(e) => {
                  const registrationMode = e.target.value as AdminSystemStatus['settings']['registrationMode'];
                  void api.admin
                    .updateSettings({ registrationMode })
                    .then(() => loadDashboard())
                    .then(() => setSettingsMsg('Registration Mode gespeichert'))
                    .catch((err) => setSettingsMsg(err instanceof Error ? err.message : 'Speichern fehlgeschlagen'));
                }}
              >
                <option value="closed">closed</option>
                <option value="invite_only">invite_only</option>
                <option value="public">public</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={system.settings.generationsEnabled}
                onChange={(e) => {
                  void api.admin
                    .updateSettings({ generationsEnabled: e.target.checked })
                    .then(() => loadDashboard());
                }}
              />
              Generierung
            </label>
            {settingsMsg && (
              <p className="text-xs text-zinc-400" role="status">
                {settingsMsg}
              </p>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="admin-users">
        <h2 id="admin-users" className="mb-2 font-semibold text-white">
          User
        </h2>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void loadUsers(q, 0);
          }}
        >
          <Input
            id="admin-user-search"
            label="Suche"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="E-Mail, Name oder UID"
          />
          <Button type="submit" className="min-h-11 self-end">
            Suchen
          </Button>
        </form>
        {usersLoading && (
          <p className="text-sm text-zinc-500" role="status">
            User werden geladen…
          </p>
        )}
        {usersError && <SectionError message={usersError} />}
        {!usersLoading && users.length === 0 && (
          <p className="text-sm text-zinc-500">Keine User in diesem Ausschnitt.</p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-300">
            <thead>
              <tr className="text-xs uppercase text-zinc-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">E-Mail</th>
                <th className="px-2 py-2">Rolle</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Coins</th>
                <th className="px-2 py-2">UID</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-white/5">
                  <td className="px-2 py-2">
                    <button type="button" className="text-left text-white underline-offset-2 hover:underline" onClick={() => void openUser(u)}>
                      {u.displayName}
                    </button>
                  </td>
                  <td className="px-2 py-2">{u.email}</td>
                  <td className="px-2 py-2">{u.role}</td>
                  <td className="px-2 py-2">{u.disabled ? 'gesperrt' : 'aktiv'}</td>
                  <td className="px-2 py-2">{u.coinBalance}</td>
                  <td className="px-2 py-2 font-mono text-xs">{u.id.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={userOffset <= 0}
            onClick={() => void loadUsers(q, Math.max(0, userOffset - pageSize))}
          >
            Zurück
          </Button>
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={!hasMoreUsers}
            onClick={() => void loadUsers(q, userOffset + pageSize)}
          >
            Weiter
          </Button>
          <p className="self-center text-xs text-zinc-500">
            {userOffset + 1}–{userOffset + users.length} / {userTotal} (Scan-Limit)
          </p>
        </div>
      </section>

      {selected && (
        <section className="space-y-3 rounded-xl border border-white/10 p-4" aria-labelledby="admin-user-detail">
          <h2 id="admin-user-detail" className="font-semibold text-white">
            {selected.displayName} — {selected.coinBalance} Coins {selected.disabled ? '(gesperrt)' : '(aktiv)'}
          </h2>
          <p className="text-xs text-zinc-500">
            UID {selected.id} · Rolle {selected.role} · Provider {selected.authProviders.join(', ') || '—'} · E-Mail-Verify{' '}
            {selected.emailVerified == null ? 'unbekannt' : selected.emailVerified ? 'ja' : 'nein'}
          </p>
          <p className="text-xs text-zinc-500">Coin-Anpassung braucht Betrag, Grund, Bestätigung und läuft über das Ledger.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24" label="Betrag" id="admin-coin-amount" />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Grund (pflicht)" label="Grund" id="admin-reason" />
            <label className="flex min-h-11 items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={confirmAdj} onChange={(e) => setConfirmAdj(e.target.checked)} />
              Coin-Buchung bestätigen
            </label>
            <Button
              className="min-h-11"
              disabled={!confirmAdj || reason.trim().length < 3}
              onClick={() => {
                const n = Number.parseInt(amount, 10);
                if (!Number.isInteger(n) || n === 0) return;
                void api.admin
                  .coins(selected.id, n, reason.trim(), true, crypto.randomUUID())
                  .then(() => {
                    setConfirmAdj(false);
                    return openUser(selected);
                  })
                  .then(() => loadUsers(q, userOffset))
                  .catch((err) => setGrantMsg(err instanceof ApiError ? err.message : 'Buchung fehlgeschlagen'));
              }}
            >
              Buchen
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
            <label htmlFor="admin-role" className="text-sm text-zinc-300">
              Rolle
              <select
                id="admin-role"
                className="mt-1 block min-h-11 rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm"
                value={nextRole}
                onChange={(e) => setNextRole(e.target.value)}
              >
                <option value="user">user</option>
                <option value="tester">tester</option>
                <option value="admin">admin</option>
                <option value="support">support</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={confirmRole} onChange={(e) => setConfirmRole(e.target.checked)} />
              Rollenwechsel bestätigen
            </label>
            <Button
              className="min-h-11"
              disabled={!confirmRole || reason.trim().length < 3}
              onClick={() => {
                void api.admin
                  .setRole(selected.id, nextRole, reason.trim(), true)
                  .then(() => {
                    setConfirmRole(false);
                    return openUser(selected);
                  })
                  .then(() => loadUsers(q, userOffset))
                  .catch((err) => setGrantMsg(err instanceof Error ? err.message : 'Rolle fehlgeschlagen'));
              }}
            >
              Rolle speichern
            </Button>
            {actor?.id !== selected.id && (
              <>
                <label className="flex min-h-11 items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={confirmDisable} onChange={(e) => setConfirmDisable(e.target.checked)} />
                  Sperren/Entsperren bestätigen
                </label>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  disabled={!confirmDisable || reason.trim().length < 3}
                  onClick={() => {
                    void api.admin
                      .disable(selected.id, !selected.disabled, reason.trim(), true)
                      .then(() => {
                        setConfirmDisable(false);
                        return openUser(selected);
                      })
                      .then(() => loadUsers(q, userOffset))
                      .catch((err) => setGrantMsg(err instanceof Error ? err.message : 'Sperre fehlgeschlagen'));
                  }}
                >
                  {selected.disabled ? 'Entsperren' : 'Sperren'}
                </Button>
              </>
            )}
          </div>
          {selected.role === 'tester' && (
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={confirmGrant} onChange={(e) => setConfirmGrant(e.target.checked)} />
                Bestätigen: 500 Test-Coins
              </label>
              <Button
                className="min-h-11"
                disabled={!confirmGrant || reason.trim().length < 3}
                onClick={() => {
                  void api.admin
                    .testerGrant(selected.id, reason.trim() || 'Tester-Guthaben V1', true)
                    .then((r) => {
                      setGrantMsg(r.message);
                      setConfirmGrant(false);
                      return openUser(selected);
                    })
                    .then(() => loadUsers(q, userOffset))
                    .catch((err) => setGrantMsg(err instanceof Error ? err.message : 'Grant fehlgeschlagen'));
                }}
              >
                500 Test-Coins vergeben
              </Button>
            </div>
          )}
          {grantMsg && (
            <p className="text-xs text-zinc-400" role="status">
              {grantMsg}
            </p>
          )}
          <div>
            <p className="mb-1 text-xs uppercase text-zinc-500">Coin-Transaktionen</p>
            {tx.length === 0 && <p className="text-xs text-zinc-500">Keine Buchungen.</p>}
            {tx.slice(0, 8).map((r) => (
              <p key={r.id} className="text-xs text-zinc-400">
                {r.type} {r.amount} — {r.description}
              </p>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs uppercase text-zinc-500">Jobs (Metadaten)</p>
            {userJobs.length === 0 && <p className="text-xs text-zinc-500">Keine Jobs.</p>}
            {userJobs.slice(0, 8).map((r) => (
              <p key={r.id} className="text-xs text-zinc-400">
                {r.module ?? 'job'} · {r.status}
                {r.errorCode ? ` · ${r.errorCode}` : ''}
              </p>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs uppercase text-zinc-500">Projekte / Dateien / Nexter (ohne Inhalte)</p>
            <p className="text-xs text-zinc-400">
              {projects.length} Projekte · {files.length} Datei-Metadaten · {nexterSessionCount} Nexter-Sessions (kein Chat-Volltext)
            </p>
          </div>
        </section>
      )}

      <section aria-labelledby="admin-jobs">
        <h2 id="admin-jobs" className="mb-2 font-semibold text-white">
          Generation Jobs
        </h2>
        <label htmlFor="job-filter" className="mb-2 block text-xs text-zinc-400">
          Statusfilter
        </label>
        <select
          id="job-filter"
          className="mb-3 min-h-11 rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm text-white"
          value={jobStatus}
          onChange={(e) => {
            setJobStatus(e.target.value);
            void loadJobs(e.target.value);
          }}
        >
          <option value="">alle</option>
          <option value="pending">pending</option>
          <option value="processing">processing</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="interrupted">interrupted</option>
        </select>
        {jobsLoading && (
          <p className="text-sm text-zinc-500" role="status">
            Jobs werden geladen…
          </p>
        )}
        {jobsError && <SectionError message={jobsError} />}
        {!jobsLoading && jobs.length === 0 && <p className="text-sm text-zinc-500">Keine Jobs.</p>}
        <div className="overflow-x-auto">
          {jobs.map((j) => (
            <p key={j.id} className="text-xs text-zinc-400">
              {j.createdAt} · {j.module ?? 'job'} · {j.status} · {j.userId.slice(0, 8)}
              {j.assetKey ? ` · ${j.assetKey}` : ''}
              {j.parentJobId ? ` · parent ${j.parentJobId.slice(0, 8)}` : ''}
              {j.refunded ? ' · refunded' : ''}
              {j.errorCode ? ` · ${j.errorCode}` : ''}
            </p>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={confirmRecover} onChange={(e) => setConfirmRecover(e.target.checked)} />
          Stale-Recovery bestätigen (kein Provider-Retry)
        </label>
        <Button
          className="mt-2 min-h-11"
          disabled={!confirmRecover}
          onClick={() => {
            void api.admin.recoverJobs().then(() => {
              setConfirmRecover(false);
              void loadJobs(jobStatus);
            });
          }}
        >
          Unterbrochene Jobs refunden
        </Button>
      </section>

      <section aria-labelledby="admin-invites">
        <h2 id="admin-invites" className="mb-2 font-semibold text-white">
          Invites
        </h2>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (inviteDesc.trim().length < 1) return;
            void api.admin
              .createInvite({
                description: inviteDesc.trim(),
                maximumUses: Number.parseInt(inviteMax, 10) || 1,
                grantRole: 'tester',
              })
              .then(() => {
                setInviteDesc('');
                return loadInvites();
              })
              .then(() => loadDashboard());
          }}
        >
          <Input id="invite-desc" label="Beschreibung" value={inviteDesc} onChange={(e) => setInviteDesc(e.target.value)} />
          <Input id="invite-max" label="Max. Uses" className="w-24" value={inviteMax} onChange={(e) => setInviteMax(e.target.value)} />
          <Button type="submit" className="min-h-11 self-end">
            Invite erstellen
          </Button>
        </form>
        {invitesLoading && (
          <p className="text-sm text-zinc-500" role="status">
            Invites werden geladen…
          </p>
        )}
        {invitesError && <SectionError message={invitesError} />}
        {!invitesLoading && invites.length === 0 && <p className="text-sm text-zinc-500">Keine Invites.</p>}
        {invites.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-2 text-xs text-zinc-300">
            <p>
              {inv.code} · {inv.description} · {inv.currentUses}/{inv.maximumUses} · {inv.isActive ? 'aktiv' : 'deaktiviert'}
              {inv.expiresAt ? ` · bis ${inv.expiresAt}` : ''}
            </p>
            {inv.isActive && (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-zinc-400">
                  <input
                    type="checkbox"
                    checked={confirmInviteRevoke === inv.id}
                    onChange={(e) => setConfirmInviteRevoke(e.target.checked ? inv.id : null)}
                  />
                  Revoke bestätigen
                </label>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  disabled={confirmInviteRevoke !== inv.id}
                  onClick={() => {
                    void api.admin.deactivateInvite(inv.id).then(() => {
                      setConfirmInviteRevoke(null);
                      return loadInvites();
                    });
                  }}
                >
                  Deaktivieren
                </Button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="admin-payments">
        <h2 id="admin-payments" className="mb-2 font-semibold text-white">
          Payment-Claims (read-only)
        </h2>
        <p className="mb-2 text-xs text-zinc-500">Keine Stripe-/PayPal-Aufrufe. Keine Umsatzmetrik.</p>
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
      </section>

      <section aria-labelledby="admin-audit">
        <h2 id="admin-audit" className="mb-2 font-semibold text-white">
          Audit
        </h2>
        {audit.length === 0 && <p className="text-xs text-zinc-500">Keine Audit-Einträge.</p>}
        {audit.slice(0, 20).map((a) => (
          <p key={a.id} className="text-xs text-zinc-400">
            {a.createdAt} · {a.action} · {a.actorUserId.slice(0, 8)} → {a.targetUserId?.slice(0, 8)} · {a.reason}
          </p>
        ))}
      </section>

      <section aria-labelledby="admin-feedback">
        <h2 id="admin-feedback" className="mb-2 font-semibold text-white">
          Support & Feedback
        </h2>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-zinc-400">
            Status
            <select
              className="mt-1 min-h-11 w-full rounded border border-zinc-700 bg-surface-900 px-2 text-sm text-white"
              value={fbStatus}
              onChange={(e) => setFbStatus(e.target.value)}
            >
              <option value="">Alle</option>
              {['new', 'reviewing', 'resolved', 'closed'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Typ
            <select
              className="mt-1 min-h-11 w-full rounded border border-zinc-700 bg-surface-900 px-2 text-sm text-white"
              value={fbType}
              onChange={(e) => setFbType(e.target.value)}
            >
              <option value="">Alle</option>
              {['bug', 'feedback', 'support'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={'feature' + '_request'}>Feature-Wunsch</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Kategorie
            <select
              className="mt-1 min-h-11 w-full rounded border border-zinc-700 bg-surface-900 px-2 text-sm text-white"
              value={fbCategory}
              onChange={(e) => setFbCategory(e.target.value)}
            >
              <option value="">Alle</option>
              {['technical', 'generation', 'file', 'coins', 'account', 'suggestion', 'bug', 'usability', 'payment', 'other'].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
        <Button className="mb-3 min-h-11" type="button" onClick={() => void loadFeedback(0, false)}>
          Filtern
        </Button>
        {feedbackError && <SectionError message={feedbackError} />}
        {feedback.length === 0 && !feedbackError && <p className="text-xs text-zinc-500">Kein Feedback.</p>}
        <ul className="space-y-2">
          {feedback.map((f) => (
            <li key={f.id} className="border-b border-white/5 py-2 text-sm text-zinc-300">
              <button type="button" className="w-full text-left" onClick={() => void api.admin.getFeedback(f.id).then((r) => setSelectedFeedback(r.feedback)).catch(() => setSelectedFeedback(f))}>
                <p>
                  {f.createdAt} · {f.type ?? 'feedback'} · {f.category ?? 'other'} · {f.status ?? 'new'} · User {f.userId.slice(0, 8)}
                </p>
                <p className="truncate text-zinc-400">{f.subject || f.message}</p>
              </button>
              <label htmlFor={`fb-st-${f.id}`} className="mt-1 block text-[11px] text-zinc-500">
                Status {f.status ?? 'new'}
              </label>
              <select
                id={`fb-st-${f.id}`}
                className="rounded border border-zinc-700 bg-surface-900 px-2 py-1 text-xs"
                value={statusMap[f.id] ?? f.status ?? 'new'}
                onChange={(e) => {
                  const status = e.target.value;
                  setStatusMap((m) => ({ ...m, [f.id]: status }));
                  void api.admin.updateFeedback(f.id, status).then((r) => {
                    setFeedback((rows) => rows.map((row) => (row.id === f.id ? r.feedback : row)));
                    setSelectedFeedback((cur) => (cur?.id === f.id ? r.feedback : cur));
                  });
                }}
              >
                {['new', 'reviewing', 'resolved', 'closed'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        {feedbackHasMore && (
          <Button className="mt-3 min-h-11" type="button" variant="secondary" onClick={() => void loadFeedback(feedbackOffset, true)}>
            Weitere laden
          </Button>
        )}
        {selectedFeedback && (
          <div className="mt-4 rounded-xl border border-white/10 p-3 text-sm text-zinc-300">
            <p className="font-medium text-white">{selectedFeedback.subject || 'Anfrage'}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {selectedFeedback.type} · {selectedFeedback.category} · {selectedFeedback.status} · User {selectedFeedback.userId}
            </p>
            <p className="mt-3 whitespace-pre-wrap">{selectedFeedback.message}</p>
            <ul className="mt-3 space-y-1 text-xs text-zinc-500">
              {selectedFeedback.requestId && <li>Request-ID: {selectedFeedback.requestId}</li>}
              {selectedFeedback.projectId && <li>Projekt: {selectedFeedback.projectId}</li>}
              {selectedFeedback.jobId && <li>Job: {selectedFeedback.jobId}</li>}
              {selectedFeedback.fileId && <li>Datei: {selectedFeedback.fileId}</li>}
              {selectedFeedback.route && <li>Route: {selectedFeedback.route}</li>}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
