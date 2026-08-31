import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Permission, ROLE_PERMISSIONS, UserRole } from '@ucbs/shared';
import { getOrCreateUser, setUserRole, updateUser, getUserById } from './user.service.js';
import { addCoins, getCoinBalance, getTransactions } from './coins.service.js';
import { grantTesterCoins, TESTER_GRANT_AMOUNT, testerGrantIdempotencyKey } from './tester-grant.service.js';
import { listAdminAuditForTarget } from './admin-audit.service.js';
import { createInviteCode, redeemInviteCode } from './invite.service.js';
import { upsertDna } from './dna.service.js';
import { createProject, getProject, listProjects } from './project.service.js';
import { exportProjectZip } from './project-export.service.js';
import { saveUserFile, getUserFile } from './file-cloud.service.js';
import { getContentPackage } from './text.service.js';
import { getVersionsForJob } from './change-request.service.js';
import { createQuote, cancelQuote, confirmQuote } from './nexter/quotes.service.js';
import {
  submitFeedback,
  getFeedbackById,
  assertFeedbackReadable,
  updateFeedbackStatus,
  validateFeedbackScreenshot,
} from './feedback.service.js';
import { dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { AppError } from '../middleware/errorHandler.js';
import { getDefaultFreeCoins, getAiProviderStatus, isDevAuthEnabled, isProduction } from '../config/env.js';

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

describe('phase J — tester grant', () => {
  it('1/2/31 tester +500, expected 550, second call adds 0', async () => {
    const tester = await getOrCreateUser(`j-g-${randomUUID()}`, 'grant@j.test', 'Grant', {
      role: UserRole.TESTER,
    });
    assert.equal(tester.role, UserRole.TESTER);
    const welcome = getDefaultFreeCoins();
    assert.equal(welcome, 50);
    assert.equal(await getCoinBalance(tester.id), welcome);

    const actor = `admin-${randomUUID()}`;
    const first = await grantTesterCoins({
      actorUserId: actor,
      targetUserId: tester.id,
      reason: 'Closed-Tester V1',
      confirm: true,
    });
    assert.equal(first.granted, TESTER_GRANT_AMOUNT);
    assert.equal(first.duplicate, false);
    assert.equal(first.message, 'Testguthaben vergeben');
    assert.equal(first.newBalance, welcome + 500);
    assert.equal(await getCoinBalance(tester.id), 550);

    const second = await grantTesterCoins({
      actorUserId: actor,
      targetUserId: tester.id,
      reason: 'Closed-Tester V1 erneut',
      confirm: true,
    });
    assert.equal(second.granted, 0);
    assert.equal(second.alreadyGranted, true);
    assert.equal(second.message, 'bereits vergeben');
    assert.equal(await getCoinBalance(tester.id), 550);
  });

  it('3 creator target rejected', async () => {
    const creator = await getOrCreateUser(`j-c-${randomUUID()}`, 'creator@j.test', 'Creator');
    assert.equal(creator.role, UserRole.USER);
    await assert.rejects(
      () =>
        grantTesterCoins({
          actorUserId: 'admin-1',
          targetUserId: creator.id,
          reason: 'sollte scheitern',
          confirm: true,
        }),
      (err: unknown) => err instanceof AppError && err.code === 'TESTER_ROLE_REQUIRED'
    );
  });

  it('4/5/7/8 audit + ledger + actor/target uids', async () => {
    const tester = await getOrCreateUser(`j-a-${randomUUID()}`, 'aud@j.test', 'Aud', {
      role: UserRole.TESTER,
    });
    const actor = `admin-${randomUUID()}`;
    await grantTesterCoins({
      actorUserId: actor,
      targetUserId: tester.id,
      reason: 'Audit-Grant',
      confirm: true,
    });
    const audits = await listAdminAuditForTarget(tester.id);
    const grant = audits.find((a) => a.action === 'tester_grant_500');
    assert.ok(grant);
    assert.equal(grant!.actorUserId, actor);
    assert.equal(grant!.targetUserId, tester.id);
    const txs = (await getTransactions(tester.id, 20)) as Array<{
      type: string;
      amount: number;
      description: string;
      adminActorId?: string;
      idempotencyKey?: string;
    }>;
    const bonus = txs.find((t) => t.description === 'Tester-Guthaben 500' && t.amount === 500);
    assert.ok(bonus);
    assert.equal(bonus!.adminActorId, actor);
    assert.equal(bonus!.idempotencyKey, testerGrantIdempotencyKey(tester.id));
  });

  it('6 creator actor has no MANAGE_USERS; grant route is admin-only', () => {
    assert.equal(ROLE_PERMISSIONS[UserRole.USER].includes(Permission.MANAGE_USERS), false);
    assert.equal(ROLE_PERMISSIONS[UserRole.TESTER].includes(Permission.MANAGE_USERS), false);
    const admin = src('src/routes/admin.routes.ts');
    assert.match(admin, /requireRole\(UserRole\.ADMIN, UserRole\.SUPER_ADMIN\)/);
    const grantSrc = src('src/services/tester-grant.service.ts');
    assert.match(grantSrc, /tester-grant-500:\$\{userId\}/);
    assert.match(admin, /users\/:userId\/tester-grant/);
    assert.match(admin, /requirePermission\(Permission\.MANAGE_USERS\)/);
  });

  it('9 parallel double grant credits once', async () => {
    const tester = await getOrCreateUser(`j-p-${randomUUID()}`, 'par@j.test', 'Par', {
      role: UserRole.TESTER,
    });
    const before = await getCoinBalance(tester.id);
    const actor = `admin-${randomUUID()}`;
    const [a, b] = await Promise.all([
      grantTesterCoins({
        actorUserId: actor,
        targetUserId: tester.id,
        reason: 'parallel-a',
        confirm: true,
      }),
      grantTesterCoins({
        actorUserId: actor,
        targetUserId: tester.id,
        reason: 'parallel-b',
        confirm: true,
      }),
    ]);
    const granted = [a, b].filter((r) => r.granted === 500).length;
    assert.equal(granted, 1);
    assert.equal(await getCoinBalance(tester.id), before + 500);
  });
});

describe('phase J — onboarding', () => {
  it('6/7 start incomplete; complete + reload stays complete', async () => {
    const user = await getOrCreateUser(`j-ob-${randomUUID()}`, 'ob@j.test', 'Onboard');
    assert.equal(user.onboardingCompleted, false);
    await updateUser(user.id, { onboardingCompleted: true, displayName: 'Onboard Done' });
    const once = await getUserById(user.id);
    assert.equal(once?.onboardingCompleted, true);
    await updateUser(user.id, { onboardingCompleted: true });
    const twice = await getUserById(user.id);
    assert.equal(twice?.onboardingCompleted, true);
    assert.equal(twice?.displayName, 'Onboard Done');
  });

  it('9 DNA create without OpenAI (no analyzeAssets required)', async () => {
    const user = await getOrCreateUser(`j-dna-${randomUUID()}`, 'dna@j.test', 'Dna');
    const dna = await upsertDna({
      userId: user.id,
      name: 'NightWolf',
      styleDirection: 'gaming',
      primaryColors: ['#1E40AF'],
      secondaryColors: ['#22D3EE'],
      targetPlatforms: ['twitch'],
    });
    assert.equal(dna.name, 'NightWolf');
    const routes = src('src/routes/dna.routes.ts');
    assert.match(routes, /try \{[\s\S]*analyzeAssets[\s\S]*\} catch/);
  });
});

describe('phase J — feedback', () => {
  it('10/11 create with category', async () => {
    const user = await getOrCreateUser(`j-fb-${randomUUID()}`, 'fb@j.test', 'Fb');
    const row = await submitFeedback(user.id, {
      module: '/logo-studio',
      route: '/logo-studio',
      message: 'Logo-Button zu klein auf Mobile',
      category: 'usability',
    });
    assert.equal(row.category, 'usability');
    assert.equal(row.status, 'new');
    assert.ok(row.createdAt);
    assert.ok(row.updatedAt);
  });

  it('12 admin status change is real', async () => {
    const user = await getOrCreateUser(`j-st-${randomUUID()}`, 'st@j.test', 'St');
    const row = await submitFeedback(user.id, { module: 'dashboard', message: 'Status-Test bitte' });
    const updated = await updateFeedbackStatus(row.id, 'reviewing');
    assert.equal(updated.status, 'reviewing');
    const loaded = await getFeedbackById(row.id);
    assert.equal(loaded?.status, 'reviewing');
  });

  it('13 foreign access 404', async () => {
    const a = await getOrCreateUser(`j-fa-${randomUUID()}`, 'fa@j.test', 'A');
    const b = await getOrCreateUser(`j-fb2-${randomUUID()}`, 'fb2@j.test', 'B');
    const row = await submitFeedback(a.id, {
      module: 'settings',
      message: 'Nur A darf das lesen',
      screenshotDataUrl: PIXEL,
    });
    assert.throws(
      () => assertFeedbackReadable(row, b.id, false),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    assertFeedbackReadable(row, a.id, false);
    assertFeedbackReadable(row, b.id, true);
  });

  it('14 screenshot MIME/size validation', () => {
    assert.equal(validateFeedbackScreenshot(undefined), undefined);
    assert.equal(validateFeedbackScreenshot(PIXEL), PIXEL);
    assert.throws(
      () => validateFeedbackScreenshot('data:text/html;base64,PHNjcmlwdD4='),
      /VALIDATION_ERROR|Bild/
    );
    assert.throws(
      () => validateFeedbackScreenshot(`data:image/png;base64,${'A'.repeat(2_000_010)}`),
      /zu groß/
    );
  });
});

describe('phase J — legacy / marketplace / permissions', () => {
  it('15/16 legacy APIs blocked for tester; marketplace rules closed', () => {
    const index = src('src/routes/index.ts');
    for (const path of [
      '/marketplace',
      '/agency',
      '/agency-management',
      '/client',
      '/white-label',
      '/live-stream',
      '/mobile',
      '/team',
      '/chat',
    ]) {
      assert.match(index, new RegExp(`v1Blocked\\([^)]*\\)|use\\('${path.replace('/', '\\/')}', v1Blocked`));
      assert.match(index, new RegExp(`use\\('${path}', v1Blocked`));
    }
    const mw = src('src/middleware/v1-legacy.ts');
    assert.match(mw, /FEATURE_NOT_AVAILABLE/);
    const rules = repo('firestore.rules');
    assert.match(rules, /match \/marketplace_items\/\{itemId\}/);
    assert.match(rules, /allow read, write: if false/);
    assert.equal(rules.includes('allow read: if true'), false);
  });

  it('13 tester has V1 permissions only', () => {
    const tester = ROLE_PERMISSIONS[UserRole.TESTER];
    const user = ROLE_PERMISSIONS[UserRole.USER];
    for (const p of [
      Permission.MANAGE_AGENCY,
      Permission.MANAGE_WHITE_LABEL,
      Permission.SELL_MARKETPLACE,
      Permission.BUY_MARKETPLACE,
      Permission.USE_LIVE_STREAMING,
      Permission.USE_MOBILE_APP,
      Permission.USE_TEAM_CHAT,
    ]) {
      assert.equal(tester.includes(p), false, p);
      assert.equal(user.includes(p), false, p);
    }
    assert.equal(tester.includes(Permission.SUBMIT_FEEDBACK), true);
    assert.equal(tester.includes(Permission.USE_LOGO_STUDIO), true);
  });
});

describe('phase J — production safety / provider / stats / errors', () => {
  it('17/18/23/24 dev login + purchase blocked in production; ENV documented', () => {
    assert.equal(isProduction() ? isDevAuthEnabled() : true, isProduction() ? false : true);
    const auth = src('src/routes/auth.routes.ts');
    assert.match(auth, /isProduction\(\) \|\| !isDevAuthEnabled\(\)/);
    const stripe = src('src/routes/stripe.routes.ts');
    assert.match(stripe, /dev-purchase/);
    assert.match(stripe, /isProduction\(\) \|\| !isDevAuthEnabled\(\)/);
    const paypal = src('src/routes/paypal.routes.ts');
    assert.match(paypal, /isProduction\(\) \|\| !isDevAuthEnabled\(\)/);
    const index = src('src/index.ts');
    assert.match(index, /skip: \(\) => !isProduction\(\)/);
    assert.match(index, /authLimiter/);
    const env = src('src/config/env.ts');
    assert.match(env, /DEV_AUTH_BYPASS/);
    assert.match(env, /must not be enabled in production/);
    const example = src('.env.example');
    assert.match(example, /RESEND_API_KEY/);
    assert.match(example, /EMAIL_FROM/);
    assert.match(example, /PAYPAL_WEBHOOK_ID/);
    assert.match(example, /REQUIRED/);
    assert.match(example, /OPTIONAL/);
    assert.match(example, /FEATURE-DEPENDENT/);
    assert.match(example, /DEV ONLY/);
    assert.match(example, /DEFAULT_FREE_COINS=50/);
    assert.equal(example.includes('DEFAULT_FREE_COINS=500'), false);
  });

  it('19 provider configured ≠ online', () => {
    const status = getAiProviderStatus();
    for (const row of Object.values(status)) {
      assert.equal(row.liveChecked, false);
      assert.equal(row.available, null);
      assert.equal(typeof row.configured, 'boolean');
    }
    const routes = src('src/routes/status.routes.ts');
    assert.match(routes, /liveChecked: false/);
    assert.match(routes, /available: null/);
    assert.match(routes, /resend:/);
  });

  it('20 dashboard project count uses brand projects', async () => {
    const user = await getOrCreateUser(`j-stt-${randomUUID()}`, 'stats@j.test', 'Stats');
    assert.equal((await listProjects(user.id)).length, 0);
    await createProject(user.id, { name: 'Alpha', type: 'branding' });
    await createProject(user.id, { name: 'Beta', type: 'logo' });
    assert.equal((await listProjects(user.id)).length, 2);
    const auth = src('src/routes/auth.routes.ts');
    assert.match(auth, /listProjects\(userId\)/);
    assert.equal(auth.includes('listLayouts'), false);
  });

  it('21 error UX critical codes are mapped', () => {
    const api = repo('frontend/src/services/api.ts');
    for (const code of [
      'AI_NOT_CONFIGURED',
      'AI_UNAVAILABLE',
      'INSUFFICIENT_COINS',
      'DAILY_JOB_LIMIT',
      'CONCURRENT_JOB_LIMIT',
      'ACCOUNT_DISABLED',
      'VALIDATION_ERROR',
      'CHANGE_REQUIRES_QUOTE',
      'FEATURE_NOT_AVAILABLE',
      'NETWORK_ERROR',
      'PAYMENT_FAILED',
      'INVALID_UPLOAD',
      'UPLOAD_FAILED',
      'INTERNAL_ERROR',
    ]) {
      assert.match(api, new RegExp(code));
    }
    const handler = src('src/middleware/errorHandler.ts');
    assert.match(handler, /Ein interner Fehler ist aufgetreten/);
    assert.equal(handler.includes('err.stack'), false);
  });

  it('25 docker healthcheck exists', () => {
    const docker = repo('Dockerfile');
    assert.match(docker, /HEALTHCHECK/);
    assert.match(docker, /\/health/);
    assert.match(docker, /NODE_ENV=production/);
  });
});

describe('phase J — isolation + tester release gate', () => {
  it('22 user A/B isolation: feedback, file, project export, content, versions', async () => {
    const a = await getOrCreateUser(`j-iso-a-${randomUUID()}`, 'iso-a@j.test', 'A');
    const b = await getOrCreateUser(`j-iso-b-${randomUUID()}`, 'iso-b@j.test', 'B');
    const fb = await submitFeedback(a.id, {
      module: 'export',
      message: 'Screenshot nur für A',
      screenshotDataUrl: PIXEL,
    });
    assert.throws(() => assertFeedbackReadable(fb, b.id, false));
    assert.equal(await getFeedbackById(fb.id).then((r) => r?.screenshotDataUrl), PIXEL);

    const file = await saveUserFile(a.id, {
      name: 'secret.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    assert.equal(await getUserFile(file.id, b.id), null);
    assert.ok(await getUserFile(file.id, a.id));

    const project = await createProject(a.id, { name: 'Secret', type: 'branding' });
    assert.equal(await getProject(project.id, b.id), null);
    await assert.rejects(() => exportProjectZip(project.id, b.id), /nicht gefunden/);

    const contentId = randomUUID();
    await dsSet('textJobs', contentId, {
      id: contentId,
      userId: a.id,
      title: 'secret pack',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.equal(await getContentPackage(contentId, b.id), null);

    const jobId = randomUUID();
    await dsSet('designVersions', randomUUID(), {
      id: randomUUID(),
      jobId,
      userId: a.id,
      version: 1,
      imageUrl: PIXEL,
      createdAt: new Date().toISOString(),
    });
    const versionsB = await getVersionsForJob(jobId, b.id);
    assert.equal(versionsB.length, 0);
  });

  it('23 tester release gate: invite, welcome 50, +500, onboarding, DNA, project, quote cancel/refund', async () => {
    const admin = await getOrCreateUser(`j-adm-${randomUUID()}`, 'adm@j.test', 'Admin', {
      role: UserRole.ADMIN,
    });
    const invite = await createInviteCode(
      { description: 'Phase J tester', grantRole: 'tester', maximumUses: 1 },
      admin.id
    );
    const redeemed = await redeemInviteCode(invite.code, 'gate@j.test', `pending-${randomUUID()}`);
    assert.equal(redeemed.grantRole, 'tester');

    const tester = await getOrCreateUser(`j-gate-${randomUUID()}`, 'gate@j.test', 'Gate', {
      role: UserRole.TESTER,
      inviteCodeId: invite.id,
    });
    assert.equal(tester.role, UserRole.TESTER);
    assert.equal(await getCoinBalance(tester.id), 50);

    await grantTesterCoins({
      actorUserId: admin.id,
      targetUserId: tester.id,
      reason: 'Tester Release Gate',
      confirm: true,
    });
    assert.equal(await getCoinBalance(tester.id), 550);

    await updateUser(tester.id, { onboardingCompleted: true, displayName: 'Gate Tester' });
    const dna = await upsertDna({
      userId: tester.id,
      name: 'GateWolf',
      styleDirection: 'gaming',
      primaryColors: ['#1E40AF'],
    });
    const project = await createProject(tester.id, {
      name: 'Gate Project',
      type: 'branding',
      dnaId: dna.id,
    });
    assert.ok(project.id);

    const beforeFree = await getCoinBalance(tester.id);
    const quote = await createQuote(tester.id, 'logo', project.id, { logoName: 'GateWolf' });
    await cancelQuote(tester.id, quote.id);
    assert.equal(await getCoinBalance(tester.id), beforeFree);

    const prevOpenAi = process.env.OPENAI_API_KEY;
    const prevReplicate = process.env.REPLICATE_API_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
    try {
      const paid = await createQuote(tester.id, 'logo', project.id, { logoName: 'GateWolf' });
      await assert.rejects(() => confirmQuote(tester.id, paid.id));
      assert.equal(await getCoinBalance(tester.id), 550);
    } finally {
      if (prevOpenAi !== undefined) process.env.OPENAI_API_KEY = prevOpenAi;
      else delete process.env.OPENAI_API_KEY;
      if (prevReplicate !== undefined) process.env.REPLICATE_API_TOKEN = prevReplicate;
      else delete process.env.REPLICATE_API_TOKEN;
    }

    const feedback = await submitFeedback(tester.id, {
      module: 'export-center',
      category: 'suggestion',
      message: 'Gate-Feedback ohne Provider',
    });
    assert.equal(feedback.userId, tester.id);
    await exportProjectZip(project.id, tester.id);
  });
});
