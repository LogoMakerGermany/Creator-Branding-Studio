import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentDraftLegalAcceptanceInput } from '@ucbs/shared';
import {
  getTransactionalEmailStatus,
  isTransactionalEmailConfigured,
} from '../config/env.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { createInviteCode, getInviteById } from './invite.service.js';
import { getUserById } from './user.service.js';
import { syncAuthenticatedAppUser } from './auth-registration.service.js';
import { getSystemSettings, updateSystemSettings } from './system-settings.service.js';
import {
  deliverAssignedInviteEmail,
  dispatchTransactionalEmail,
  EMAIL_ALREADY_SENT_MESSAGE,
  INVITE_CREATED_AND_SENT_MESSAGE,
  INVITE_CREATED_EMAIL_FAILED_MESSAGE,
  inviteEmail,
  resetTestEmailTransport,
  setTestEmailTransport,
  welcomeEmail,
  welcomeEmailIdempotencyKey,
} from './email.service.js';

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

async function withEmailEnv<T>(
  vars: { key?: string | null; from?: string | null },
  fn: () => Promise<T>
): Promise<T> {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.EMAIL_FROM;
  try {
    if (vars.key === null) delete process.env.RESEND_API_KEY;
    else if (vars.key !== undefined) process.env.RESEND_API_KEY = vars.key;
    if (vars.from === null) delete process.env.EMAIL_FROM;
    else if (vars.from !== undefined) process.env.EMAIL_FROM = vars.from;
    return await fn();
  } finally {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevFrom;
  }
}

const configured = {
  key: 're_fake_not_a_real_key',
  from: 'NEXTER <noreply@test.invalid>',
};

describe('Block F — transactional email production', () => {
  afterEach(() => {
    resetTestEmailTransport();
  });

  it('1-2 provider availability is true only when key and from are both set', async () => {
    await withEmailEnv({ key: configured.key, from: configured.from }, async () => {
      assert.equal(isTransactionalEmailConfigured(), true);
      assert.equal(getTransactionalEmailStatus(), 'available');
    });
    await withEmailEnv({ key: null, from: null }, async () => {
      assert.equal(isTransactionalEmailConfigured(), false);
      assert.equal(getTransactionalEmailStatus(), 'unavailable');
    });
    await withEmailEnv({ key: configured.key, from: null }, async () => {
      assert.equal(getTransactionalEmailStatus(), 'unavailable');
    });
  });

  it('3 missing config creates invite without false success', async () => {
    await withEmailEnv({ key: null, from: null }, async () => {
      const invite = await createInviteCode(
        {
          description: 'assigned-missing-config',
          assignedEmail: `f3-${randomUUID()}@example.com`,
          maximumUses: 1,
        },
        'admin-f'
      );
      const email = await deliverAssignedInviteEmail(invite, { created: true });
      assert.equal(email.sent, false);
      assert.equal(email.attempted, true);
      assert.equal(email.status, 'not_configured');
      assert.equal(email.message, INVITE_CREATED_EMAIL_FAILED_MESSAGE);
      assert.doesNotMatch(email.message, /RESEND|EMAIL_FROM|INTERNAL_ERROR|401|403/);
      const stored = await getInviteById(invite.id);
      assert.ok(stored);
      assert.equal(stored?.code, invite.code);
      assert.equal(stored?.currentUses, 0);
    });
  });

  it('4 invite email success with mock provider', async () => {
    await withEmailEnv({ key: configured.key, from: configured.from }, async () => {
      const invite = await createInviteCode(
        {
          description: 'assigned-ok',
          assignedEmail: `f4-${randomUUID()}@example.com`,
          maximumUses: 1,
        },
        'admin-f'
      );
      const email = await deliverAssignedInviteEmail(invite, { created: true });
      assert.equal(email.sent, true);
      assert.equal(email.status, 'sent');
      assert.equal(email.message, INVITE_CREATED_AND_SENT_MESSAGE);
    });
  });

  it('5-7 provider failure keeps invite; retry uses same code; double-click is unique', async () => {
    setTestEmailTransport(async () => {
      throw new Error('provider down');
    });
    const invite = await createInviteCode(
      {
        description: 'retry-me',
        assignedEmail: `f5-${randomUUID()}@example.com`,
        maximumUses: 1,
      },
      'admin-f'
    );
    const first = await deliverAssignedInviteEmail(invite, { created: true });
    assert.equal(first.sent, false);
    assert.equal(first.status, 'failed');
    assert.equal((await getInviteById(invite.id))?.code, invite.code);
    assert.equal((await getInviteById(invite.id))?.currentUses, 0);

    resetTestEmailTransport();
    await withEmailEnv({ key: configured.key, from: configured.from }, async () => {
      const retry = await deliverAssignedInviteEmail(invite, { created: false });
      assert.equal(retry.sent, true);
      assert.equal((await getInviteById(invite.id))?.code, invite.code);
      const again = await Promise.all([
        deliverAssignedInviteEmail(invite, { created: false }),
        deliverAssignedInviteEmail(invite, { created: false }),
      ]);
      assert.equal(again.filter((r) => r.duplicate).length, 2);
      assert.equal(
        again.every((r) => r.sent === false),
        true
      );
      assert.equal(again[0].message, EMAIL_ALREADY_SENT_MESSAGE);
    });
    assert.equal((await getInviteById(invite.id))?.id, invite.id);
  });

  it('8-10 welcome success/failure keep account and 50 coins once; sync retry is idempotent', async () => {
    const prevMode = (await getSystemSettings()).registrationMode;
    await updateSystemSettings({ registrationMode: 'invite_only' }, 'block-f');
    try {
      await withEmailEnv({ key: configured.key, from: configured.from }, async () => {
        const invite = await createInviteCode({ description: 'welcome-ok', maximumUses: 1 }, 'admin-f');
        const uid = `wf-ok-${randomUUID()}`;
        const created = await syncAuthenticatedAppUser({
          uid,
          email: `${uid}@ok.test`,
          displayName: 'Ada',
          inviteCode: invite.code,
          authProvider: 'email',
          legalAcceptance: currentDraftLegalAcceptanceInput(),
          emailVerified: true,
        });
        assert.equal(created.created, true);
        assert.equal(await getCoinBalance(uid), 50);
        const welcomes = (await getTransactions(uid)).filter((tx) => tx.idempotencyKey === `welcome:${uid}`);
        assert.equal(welcomes.length, 1);

        const retry = await syncAuthenticatedAppUser({
          uid,
          email: `${uid}@ok.test`,
          displayName: 'Ada',
          inviteCode: invite.code,
          authProvider: 'email',
        });
        assert.equal(retry.created, false);
        assert.equal(await getCoinBalance(uid), 50);
        const after = (await getTransactions(uid)).filter((tx) => tx.idempotencyKey === `welcome:${uid}`);
        assert.equal(after.length, 1);
        const mailAgain = await dispatchTransactionalEmail(
          welcomeEmailIdempotencyKey(uid),
          welcomeEmail(`${uid}@ok.test`, 'Ada')
        );
        assert.equal(mailAgain.duplicate, true);
        assert.equal(mailAgain.sent, false);
      });

      setTestEmailTransport(async () => {
        throw new Error('welcome provider down');
      });
      const failInvite = await createInviteCode({ description: 'welcome-fail', maximumUses: 1 }, 'admin-f');
      const failUid = `wf-fail-${randomUUID()}`;
      const failed = await syncAuthenticatedAppUser({
        uid: failUid,
        email: `${failUid}@fail.test`,
        displayName: 'Bea',
        inviteCode: failInvite.code,
        authProvider: 'email',
        legalAcceptance: currentDraftLegalAcceptanceInput(),
        emailVerified: true,
      });
      assert.ok(await getUserById(failUid));
      assert.equal(failed.created, true);
      assert.equal(await getCoinBalance(failUid), 50);
      const failTx = (await getTransactions(failUid)).filter((tx) => tx.idempotencyKey === `welcome:${failUid}`);
      assert.equal(failTx.length, 1);
    } finally {
      await updateSystemSettings({ registrationMode: prevMode }, 'block-f');
    }
  });

  it('11-14 Firebase verification and password reset stay the source of truth and enumeration-safe', () => {
    const firebase = repo('frontend/src/lib/firebase.ts');
    const verify = repo('frontend/src/pages/auth/VerifyEmailPage.tsx');
    const login = repo('frontend/src/pages/auth/LoginPage.tsx');
    assert.match(firebase, /sendEmailVerification/);
    assert.match(firebase, /rememberEmailVerificationSendError/);
    assert.doesNotMatch(firebase, /emailVerified\s*=\s*true/);
    assert.match(verify, /EMAIL_VERIFICATION_SEND_ERROR_KEY/);
    assert.doesNotMatch(verify, /Wir haben eine Bestätigungs-Mail/);
    assert.match(verify, /await resendEmailVerification/);
    assert.match(firebase, /sendPasswordResetEmail/);
    assert.match(firebase, /auth\/user-not-found/);
    assert.match(login, /Falls ein Konto existiert, wurde eine Reset-E-Mail gesendet/);
    assert.doesNotMatch(src('src/services/email.service.ts'), /sendPasswordResetEmail/);
  });

  it('15-18 user errors, logs, invite codes and HTML interpolation stay safe', async () => {
    const logs: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    try {
      setTestEmailTransport(async () => {
        throw new Error('RESEND_API_KEY missing fetch failed 401');
      });
      const code = `SAFE${randomUUID().slice(0, 6).toUpperCase()}`;
      const invite = await createInviteCode(
        {
          code,
          description: '<script>alert(1)</script>',
          assignedEmail: `safe-${randomUUID()}@example.com`,
          maximumUses: 1,
        },
        'admin-f'
      );
      const email = await deliverAssignedInviteEmail(invite, { created: true });
      assert.equal(email.sent, false);
      assert.doesNotMatch(
        email.message,
        /RESEND_API_KEY|EMAIL_FROM|RESEND_ERROR|SMTP_ERROR|INTERNAL_ERROR|fetch failed|\b401\b|\b403\b/
      );
      const joined = logs.join('\n');
      assert.doesNotMatch(joined, /re_fake|RESEND_API_KEY\s*=|BEGIN PRIVATE KEY/);
      assert.doesNotMatch(joined, new RegExp(code));
      assert.doesNotMatch(joined, /https?:\/\/[^\s]+oobCode/);
    } finally {
      console.error = orig;
    }

    const injected = welcomeEmail('a@b.test', '<script>alert(1)</script>');
    assert.equal(injected.text.includes('<script>'), false);
    assert.equal(injected.text.includes('alert(1)'), true);
    const inviteBody = inviteEmail('a@b.test', 'CODE01', '<img src=x onerror=alert(1)>');
    assert.equal(inviteBody.text.includes('<img'), false);
    assert.doesNotMatch(src('src/services/email.service.ts'), /console\.(info|log).*payload\.text/);
  });

  it('19-20 Block E OAuth and completed generation work stay in place; no false-success UI', () => {
    const oauth = src('src/services/oauth.service.ts');
    assert.match(oauth, /assertInviteEligible/);
    assert.match(oauth, /compensatePendingOAuthRegistration/);
    assert.match(oauth, /registrationPending/);
    assert.doesNotMatch(oauth, /syntheticEmail/);
    assert.match(src('src/services/image-generation-e2e.test.ts'), /IMAGE_GENERATION_UNAVAILABLE/);
    assert.match(src('src/services/video-quote-e2e.test.ts'), /ai-video/);
    assert.match(src('src/services/music-quote-e2e.test.ts'), /AI_MUSIC/);
    const adminPage = repo('frontend/src/pages/admin/AdminPage.tsx');
    assert.match(adminPage, /result\.email\?\.message/);
    assert.match(adminPage, /nicht versendet/);
    assert.match(adminPage, /E-Mail erneut senden/);
    assert.match(adminPage, /Transactional Email/);
    assert.doesNotMatch(adminPage, /Einladung erfolgreich versendet/);
    assert.doesNotMatch(adminPage, /Welcome-Mail versendet/);
    assert.match(src('src/routes/status.routes.ts'), /transactionalEmail/);
    assert.match(src('src/config/env.ts'), /isTransactionalEmailConfigured/);
    assert.doesNotMatch(repo('frontend/src/pages/support/SupportPage.tsx'), /dispatchTransactionalEmail/);
    assert.match(src('src/services/payment-credit.service.ts'), /purchaseReceiptEmail/);
  });
});
