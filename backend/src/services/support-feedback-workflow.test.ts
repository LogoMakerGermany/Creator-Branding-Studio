import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { ServiceError } from '../lib/errors.js';
import { dsSet } from '../lib/data-store.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { getOrCreateUser } from './user.service.js';
import { createProject } from './project.service.js';
import { saveUserFile } from './file-cloud.service.js';
import { getCoinBalance } from './coins.service.js';
import { writeAdminAudit, listAdminAuditForTarget } from './admin-audit.service.js';
import { exportAccountData, requestAccountDeletion, ACCOUNT_DELETE_CONFIRMATION } from './account.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { detectSupportIntent } from './nexter/tools.service.js';
import {
  submitFeedback,
  getFeedbackById,
  assertFeedbackReadable,
  listOwnFeedback,
  listFeedbackPage,
  updateFeedbackStatus as setFeedbackStatus,
  toSafeFeedback,
  FEEDBACK_MESSAGE_MAX,
  SUPPORT_MAX_PER_WINDOW,
} from './feedback.service.js';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function user(label: string) {
  return getOrCreateUser(randomUUID(), `${randomUUID()}@${label}.test`, label);
}

describe('support & feedback local closure', () => {
  it('authenticated user can create support; unauthenticated is blocked', async () => {
    const owner = await user('sup-auth');
    const row = await submitFeedback(owner.id, {
      type: 'support',
      category: 'technical',
      subject: 'Login hängt',
      message: 'Nach dem Login bleibt die Seite leer.',
    });
    assert.equal(row.userId, owner.id);
    assert.equal(row.type, 'support');
    assert.equal(row.status, 'new');
    assert.equal(row.subject, 'Login hängt');
    const routes = src('src/routes/feedback.routes.ts');
    assert.match(routes, /authenticate/);
    assert.match(routes, /Permission\.SUBMIT_FEEDBACK/);
    await new Promise<void>((resolve, reject) => {
      authenticate({ headers: {} } as never, {} as never, (err?: unknown) => {
        try {
          assert.ok(err instanceof AppError && err.statusCode === 401);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('validates type, category, subject, message, whitespace and length', async () => {
    const owner = await user('sup-val');
    await assert.rejects(
      () => submitFeedback(owner.id, { type: 'ticket', message: 'Gültige Nachricht hier' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () => submitFeedback(owner.id, { category: 'unknown-cat', message: 'Gültige Nachricht hier' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () => submitFeedback(owner.id, { subject: '   ', message: 'Gültige Nachricht hier' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () => submitFeedback(owner.id, { message: '   \n\t  ' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () => submitFeedback(owner.id, { message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VALIDATION_ERROR'
    );
    const ok = await submitFeedback(owner.id, {
      type: 'feedback',
      category: 'suggestion',
      subject: 'Klarer Betreff',
      message: 'Das Layout im Support-Hub ist verständlich.',
    });
    assert.equal(ok.type, 'feedback');
    assert.equal(ok.category, 'suggestion');
  });

  it('treats HTML/script as text and does not store tokens or signed URLs', async () => {
    const owner = await user('sup-xss');
    const row = await submitFeedback(owner.id, {
      type: 'bug',
      category: 'technical',
      subject: 'Script-Test',
      message: '<script>alert(1)</script> Button reagiert nicht',
    });
    assert.equal(row.message.includes('<script>'), false);
    assert.match(row.message, /Button reagiert nicht/);
    const safe = toSafeFeedback(row);
    assert.equal('screenshotDataUrl' in safe, false);
    await assert.rejects(
      () =>
        submitFeedback(owner.id, {
          message: 'Bitte Token prüfen Bearer abcdefghijklmnop',
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VALIDATION_ERROR'
    );
    await assert.rejects(
      () =>
        submitFeedback(owner.id, {
          message: 'Screenshot als URL',
          screenshotDataUrl: 'https://storage.googleapis.com/x?X-Goog-Signature=abc',
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VALIDATION_ERROR'
    );
    const stored = await getFeedbackById(row.id);
    const raw = JSON.stringify(stored);
    assert.equal(/X-Goog-Signature|authorization|Bearer /i.test(raw), false);
  });

  it('lists only own records and blocks foreign reads', async () => {
    const a = await user('sup-own-a');
    const b = await user('sup-own-b');
    const mine = await submitFeedback(a.id, { message: 'Nur für Nutzer A sichtbar bitte.' });
    await submitFeedback(b.id, { message: 'Eintrag von Nutzer B bleibt privat.' });
    const listA = await listOwnFeedback(a.id, { limit: 20, offset: 0 });
    assert.equal(listA.items.every((row) => row.userId === a.id), true);
    assert.equal(listA.items.some((row) => row.id === mine.id), true);
    assert.equal(listA.items.some((row) => row.message.includes('Nutzer B')), false);
    assert.throws(
      () => assertFeedbackReadable(mine, b.id, false),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    assertFeedbackReadable(mine, a.id, false);
  });

  it('checks project, job and file ownership and stores ids only', async () => {
    const a = await user('sup-ctx-a');
    const b = await user('sup-ctx-b');
    const project = await createProject(a.id, { name: 'Support Projekt', type: 'logo' });
    const foreignProject = await createProject(b.id, { name: 'Fremdprojekt', type: 'banner' });
    const jobId = randomUUID();
    const foreignJobId = randomUUID();
    const now = new Date().toISOString();
    await dsSet('generationJobs', jobId, {
      id: jobId,
      userId: a.id,
      module: 'logo',
      status: 'failed',
      prompt: 'logo',
      createdAt: now,
    });
    await dsSet('generationJobs', foreignJobId, {
      id: foreignJobId,
      userId: b.id,
      module: 'logo',
      status: 'failed',
      prompt: 'logo',
      createdAt: now,
    });
    const file = await saveUserFile(a.id, {
      name: 'shot.png',
      mimeType: 'image/png',
      category: 'other',
      dataUrl: PIXEL,
      source: 'upload',
    });
    const foreignFile = await saveUserFile(b.id, {
      name: 'other.png',
      mimeType: 'image/png',
      category: 'other',
      dataUrl: PIXEL,
      source: 'upload',
    });

    const ok = await submitFeedback(a.id, {
      type: 'bug',
      category: 'generation',
      message: 'Diese Generierung ist fehlgeschlagen, bitte prüfen.',
      projectId: project.id,
      jobId,
      fileId: file.id,
      requestId: 'req_diag_1234',
    });
    assert.equal(ok.projectId, project.id);
    assert.equal(ok.jobId, jobId);
    assert.equal(ok.fileId, file.id);
    assert.equal(ok.requestId, 'req_diag_1234');
    const raw = JSON.stringify(ok);
    assert.equal(raw.includes('https://'), false);
    assert.equal(raw.includes(PIXEL), false);

    await assert.rejects(
      () => submitFeedback(a.id, { message: 'Fremdes Projekt', projectId: foreignProject.id }),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    await assert.rejects(
      () => submitFeedback(a.id, { message: 'Fremder Job', jobId: foreignJobId }),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    await assert.rejects(
      () => submitFeedback(a.id, { message: 'Fremde Datei', fileId: foreignFile.id }),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    await assert.rejects(
      () => submitFeedback(a.id, { message: 'Kaputte Request-ID', requestId: 'nope' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VALIDATION_ERROR'
    );
  });

  it('does not mutate coins or refunds and ignores user status writes', async () => {
    const owner = await user('sup-coins');
    const before = await getCoinBalance(owner.id);
    const row = await submitFeedback(owner.id, {
      type: 'support',
      category: 'coins',
      message: 'Coin-Anzeige wirkt falsch, bitte nur prüfen.',
      status: 'closed',
    } as never);
    assert.equal(row.status, 'new');
    assert.equal(await getCoinBalance(owner.id), before);
    const service = src('src/services/feedback.service.ts');
    assert.doesNotMatch(service, /addCoins|refundBillableChargeOnce|deductAmount/);
    const routes = src('src/routes/feedback.routes.ts');
    assert.doesNotMatch(routes, /\.patch\(|\.put\(/);
  });

  it('admin list is role-gated; users and anonymous are blocked; admin can update with audit', async () => {
    const owner = await user('sup-admin-owner');
    const row = await submitFeedback(owner.id, { type: 'bug', message: 'Admin soll den Status setzen können.' });
    const mw = requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN);
    assert.throws(
      () => mw({ user: undefined } as never, {} as never, () => undefined),
      (err: unknown) => err instanceof AppError && err.statusCode === 401
    );
    assert.throws(
      () =>
        mw(
          { user: { uid: 'u1', role: UserRole.USER } } as never,
          {} as never,
          () => undefined
        ),
      (err: unknown) => err instanceof AppError && err.statusCode === 403
    );
    const adminSrc = src('src/routes/admin.routes.ts');
    assert.match(adminSrc, /adminRoutes.use\(authenticate, requireRole\(UserRole\.ADMIN, UserRole\.SUPER_ADMIN\)\)/);
    assert.match(adminSrc, /writeAdminAudit/);
    assert.match(adminSrc, /feedback_status/);
    const updated = await setFeedbackStatus(row.id, 'reviewing');
    assert.equal(updated.status, 'reviewing');
    await writeAdminAudit({
      actorUserId: 'admin-test',
      action: 'feedback_status',
      targetUserId: owner.id,
      reason: 'status:reviewing',
      before: { id: row.id, status: 'new' },
      after: { id: row.id, status: 'reviewing' },
    });
    const audit = await listAdminAuditForTarget(owner.id, 10);
    assert.equal(audit.some((e) => e.action === 'feedback_status'), true);
    const page = await listFeedbackPage({ status: 'reviewing', limit: 20, offset: 0 });
    assert.ok(page.limit <= 50);
    assert.equal(page.items.every((item) => item.status === 'reviewing'), true);
    assert.equal(page.items.some((item) => 'screenshotDataUrl' in item), false);
  });

  it('paginates, limits queries, dedupes double submit and rate-limits bursts', async () => {
    const owner = await user('sup-page');
    const first = await submitFeedback(owner.id, {
      subject: 'Doppelt',
      message: 'Identische Nachricht darf nicht zweimal landen.',
    });
    const again = await submitFeedback(owner.id, {
      subject: 'Doppelt',
      message: 'Identische Nachricht darf nicht zweimal landen.',
    });
    assert.equal(again.id, first.id);
    const keyed = await submitFeedback(owner.id, {
      subject: 'Idem',
      message: 'Idempotency-Key hält denselben Eintrag.',
      idempotencyKey: 'key-one',
    });
    const keyed2 = await submitFeedback(owner.id, {
      subject: 'Idem geändert',
      message: 'Anderer Text, gleicher Key.',
      idempotencyKey: 'key-one',
    });
    assert.equal(keyed2.id, keyed.id);
    for (let i = 0; i < 6; i += 1) {
      await submitFeedback(owner.id, { message: `Weitere Anfrage Nummer ${i} mit genug Text.` });
    }
    await assert.rejects(
      () => submitFeedback(owner.id, { message: 'Diese Anfrage soll am Limit scheitern dürfen.' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'RATE_LIMIT'
    );
    const page = await listOwnFeedback(owner.id, { limit: 2, offset: 0 });
    assert.equal(page.items.length, 2);
    assert.equal(page.hasMore, true);
    assert.ok(page.total <= SUPPORT_MAX_PER_WINDOW);
    const service = src('src/services/feedback.service.ts');
    assert.match(service, /FEEDBACK_ADMIN_SCAN_MAX/);
    assert.match(service, /FEEDBACK_LIST_MAX/);
    assert.match(src('src/index.ts'), /apiLimiter/);
  });

  it('Nexter routes support and feedback intents without silent tickets or SLA claims', async () => {
    const owner = await user('sup-nexter');
    assert.equal(detectSupportIntent('Ich habe ein Problem.')?.type, 'support');
    assert.equal(detectSupportIntent('Ich möchte Feedback geben.')?.type, 'feedback');
    assert.equal(detectSupportIntent('Ich möchte einen Fehler melden.')?.type, 'bug');
    const before = await listOwnFeedback(owner.id);
    const problem = await nexterChat(owner.id, 'Ich habe ein Problem.');
    const last = [...problem.messages].reverse().find((m) => m.role === 'assistant');
    assert.match(last?.content || '', /Support-Hub|keine Anfrage still/i);
    assert.doesNotMatch(last?.content || '', /2 Stunden|meldet sich|E-Mail/i);
    assert.equal(last?.actions?.some((a) => a.path?.startsWith('/support')), true);
    const feedback = await nexterChat(owner.id, 'Ich möchte Feedback geben.');
    const fbLast = [...feedback.messages].reverse().find((m) => m.role === 'assistant');
    assert.equal(fbLast?.actions?.some((a) => a.path?.includes('type=feedback')), true);
    const after = await listOwnFeedback(owner.id);
    assert.equal(after.total, before.total);
    const conv = src('src/services/nexter/conversation.service.ts');
    assert.doesNotMatch(conv, /submitFeedback/);
    assert.match(conv, /detectSupportIntent/);
  });

  it('exports and redacts support data; retention stays undefined; providers stay unused', async () => {
    const owner = await user('sup-export');
    await submitFeedback(owner.id, {
      type: 'feedback',
      message: 'Bitte im Export ohne Screenshot-Blob enthalten.',
      screenshotDataUrl: PIXEL,
    });
    const exported = await exportAccountData(owner.id);
    assert.ok(Array.isArray(exported.support));
    assert.equal((exported.support as Array<{ message?: string }>).some((row) => row.message?.includes('Export')), true);
    assert.equal(JSON.stringify(exported.support).includes('data:image'), false);
    await requestAccountDeletion(owner.id, ACCOUNT_DELETE_CONFIRMATION);
    const remaining = await listOwnFeedback(owner.id);
    assert.equal(remaining.items.every((row) => row.message === '[redacted]'), true);
    const account = src('src/services/account.service.ts');
    assert.match(account, /listFeedbackForUserExport/);
    assert.match(account, /redactFeedbackForAccountDelete/);
    assert.doesNotMatch(src('src/services/feedback.service.ts'), /Aufbewahrungsfrist|retentionDays/);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    assert.doesNotMatch(src('src/services/feedback.service.ts'), /dispatchTransactionalEmail|resend/);
    assert.doesNotMatch(src('src/services/feedback.service.ts'), /stripe|paypal/i);
  });

  it('source-level hub, admin, a11y, privacy and no client Firestore/Storage writes', () => {
    const page = repo('frontend/src/pages/support/SupportPage.tsx');
    const admin = repo('frontend/src/pages/admin/AdminPage.tsx');
    const boundary = repo('frontend/src/components/ErrorBoundary.tsx');
    const api = repo('frontend/src/services/api.ts');
    const nav = repo('frontend/src/v2/config/navigation.ts');
    const routes = repo('frontend/src/routes/index.tsx');
    assert.match(routes, /path="\/support"/);
    assert.match(nav, /path: '\/support'/);
    assert.match(page, /htmlFor="support-type"/);
    assert.match(page, /htmlFor="support-message"/);
    assert.match(page, /aria-live="polite"/);
    assert.match(page, /Noch keine Anfragen/);
    assert.match(page, /Es wird keine E-Mail verschickt/);
    assert.match(page, /loading=\{sending\}/);
    assert.match(page, /min-h-11/);
    assert.doesNotMatch(page, /<table/);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(page, /from 'firebase\/firestore'/);
    assert.doesNotMatch(page, /from 'firebase\/storage'/);
    assert.match(page, /getLastApiRequestId/);
    assert.match(api, /getLastApiRequestId/);
    assert.match(boundary, /Problem melden/);
    assert.match(boundary, /type=bug/);
    assert.doesNotMatch(boundary, /stack|componentStack/);
    assert.match(admin, /Support & Feedback/);
    assert.match(admin, /api\.admin\.feedback/);
    assert.match(admin, /status: fbStatus/);
    assert.doesNotMatch(admin, /selectedFeedback\.email/);
    const service = src('src/services/feedback.service.ts');
    assert.doesNotMatch(service, /console\.(log|info|debug|error)\(/);
    assert.match(src('src/index.ts'), /apiLimiter/);
    assert.equal(page.includes('Du bekommst eine E-Mail'), false);
    assert.doesNotMatch(page, /support@|hilfe@|\+\d{5,}/);
  });
});
