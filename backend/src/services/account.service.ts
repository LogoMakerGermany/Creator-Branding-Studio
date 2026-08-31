import { dsListWhere, dsSet } from '../lib/data-store.js';
import { getUserById, setUserDisabled, updateUser } from './user.service.js';
import { getTransactions } from './coins.service.js';
import { listProjects, softDeleteProject } from './project.service.js';
import { listUserFiles } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { writeAdminAudit } from './admin-audit.service.js';

export const ACCOUNT_DELETE_CONFIRMATION = 'DELETE_ACCOUNT';

export interface AccountExport {
  exportedAt: string;
  user: Record<string, unknown>;
  projects: unknown[];
  files: unknown[];
  coinTransactions: unknown[];
  nexterSessions: unknown[];
  nexterQuotes: unknown[];
  jobs: unknown[];
  retention: {
    paymentsAndLedger: 'retained';
    adminAudit: 'retained';
    note: string;
  };
}

function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (
        key.includes('token') ||
        key.includes('secret') ||
        key.includes('password') ||
        key.includes('authorization') ||
        key === 'apikey' ||
        key === 'privatekey'
      ) {
        continue;
      }
      out[k] = stripSecrets(v);
    }
    return out as T;
  }
  return value;
}

export async function exportAccountData(userId: string): Promise<AccountExport> {
  const user = await getUserById(userId);
  if (!user) throw new ServiceError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');

  const [projects, files, coinTransactions, nexterSessions, nexterQuotes, generationJobs] =
    await Promise.all([
      listProjects(userId, { includeDeleted: true }),
      listUserFiles(userId),
      getTransactions(userId, 200),
      dsListWhere('nexterSessions', { userId }),
      dsListWhere('nexterQuotes', { userId }),
      dsListWhere('generationJobs', { userId }),
    ]);

  const safeUser = stripSecrets({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    coinBalance: user.coinBalance,
    locale: user.locale,
    createdAt: user.createdAt,
    disabled: user.disabled,
  });

  return {
    exportedAt: new Date().toISOString(),
    user: safeUser,
    projects: stripSecrets(projects),
    files: stripSecrets(
      files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        category: f.category,
        size: f.size,
        createdAt: f.createdAt,
      }))
    ),
    coinTransactions: stripSecrets(coinTransactions),
    nexterSessions: stripSecrets(nexterSessions),
    nexterQuotes: stripSecrets(nexterQuotes),
    jobs: stripSecrets(generationJobs),
    retention: {
      paymentsAndLedger: 'retained',
      adminAudit: 'retained',
      note: 'Zahlungs-, Ledger- und Audit-Daten werden technisch behalten. Keine Aufbewahrungsfrist wird hier festgelegt.',
    },
  };
}

export async function requestAccountDeletion(
  userId: string,
  confirmation: string
): Promise<{ disabled: boolean; anonymized: boolean }> {
  if (confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
    throw new ServiceError(
      400,
      'CONFIRMATION_REQUIRED',
      `Löschung erfordert Bestätigung: ${ACCOUNT_DELETE_CONFIRMATION}`
    );
  }

  const user = await getUserById(userId);
  if (!user) throw new ServiceError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');

  const projects = await listProjects(userId);
  for (const project of projects) {
    await softDeleteProject(project.id, userId).catch(() => undefined);
  }

  const sessions = await dsListWhere('nexterSessions', { userId });
  for (const session of sessions) {
    if (session.id) {
      await dsSet('nexterSessions', String(session.id), {
        ...session,
        messages: [],
        deletedAt: new Date().toISOString(),
      });
    }
  }

  await updateUser(userId, {
    displayName: 'Gelöschtes Konto',
    email: `deleted_${userId}@invalid.local`,
    avatarUrl: undefined,
  });
  await setUserDisabled(userId, true);

  await writeAdminAudit({
    actorUserId: userId,
    action: 'account_delete_request',
    targetUserId: userId,
    reason: 'user_requested',
    before: { email: user.email, displayName: user.displayName, disabled: user.disabled ?? false },
    after: { anonymized: true, disabled: true },
  });

  return { disabled: true, anonymized: true };
}
