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
  isResendConfigured,
} from '../config/env.js';
import {
  isAllowedTransactionalFrom,
  normalizeRecipientEmail,
  parseFromAddress,
  transactionalAppUrl,
} from '../lib/email-address.js';
import { arePaymentsEnabled } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { createInviteCode, getInviteById } from './invite.service.js';
import { getUserById } from './user.service.js';
import { syncAuthenticatedAppUser } from './auth-registration.service.js';
import { getSystemSettings, updateSystemSettings } from './system-settings.service.js';
import { ServiceError } from '../lib/errors.js';
import {
  deliverAssignedInviteEmail,
  dispatchTransactionalEmail,
  EMAIL_ALREADY_SENT_MESSAGE,
  INVITE_CREATED_EMAIL_FAILED_MESSAGE,
  inviteEmail,
  resetTestEmailTransport,
  sendTransactionalEmail,
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
  vars: { key?: string | null; from?: string | null; replyTo?: string | null },
  fn: () => Promise<T>
): Promise<T> {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.EMAIL_FROM;
  const prevReply = process.env.EMAIL_REPLY_TO;
  try {
    if (vars.key === null) delete process.env.RESEND_API_KEY;
    else if (vars.key !== undefined) process.env.RESEND_API_KEY = vars.key;
    if (vars.from === null) delete process.env.EMAIL_FROM;
    else if (vars.from !== undefined) process.env.EMAIL_FROM = vars.from;
    if (vars.replyTo === null) delete process.env.EMAIL_REPLY_TO;
    else if (vars.replyTo !== undefined) process.env.EMAIL_REPLY_TO = vars.replyTo;
    return await fn();
  } finally {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevFrom;
    if (prevReply === undefined) delete process.env.EMAIL_REPLY_TO;
    else process.env.EMAIL_REPLY_TO = prevReply;
  }
}

const configured = {
  key: 're_fake_not_a_real_key',
  from: 'NEXTER <noreply@test.invalid>',
};

describe('Block S — Resend production readiness', () => {
  afterEach(() => {
    resetTestEmailTransport();
  });

  it('1-6 CONFIG: key+valid From required; malformed From unavailable; secrets not exposed', async () => {
    await withEmailEnv({ key: null, from: configured.from }, async () => {
      assert.equal(isResendConfigured(), false);
      assert.equal(isTransactionalEmailConfigured(), false);
      assert.equal(getTransactionalEmailStatus(), 'unavailable');
    });
    await withEmailEnv({ key: configured.key, from: null }, async () => {
      assert.equal(isResendConfigured(), true);
      assert.equal(isTransactionalEmailConfigured(), false);
      assert.equal(getTransactionalEmailStatus(), 'unavailable');
    });
    await withEmailEnv({ key: configured.key, from: 'not-an-email' }, async () => {
      assert.equal(isTransactionalEmailConfigured(), false);
      assert.equal(getTransactionalEmailStatus(), 'unavailable');
    });
    await withEmailEnv({ key: configured.key, from: 'NEXTER <>' }, async () => {
      assert.equal(getTransactionalEmailStatus(), 'unavailable');
    });
    await withEmailEnv({ key: configured.key, from: 'NEXTER <noreply@test.invalid>\nBcc: evil@x' }, async () => {
      assert.equal(getTransactionalEmailStatus(), 'unavailable');
    });
    await withEmailEnv({ key: configured.key, from: configured.from }, async () => {
      assert.equal(isTransactionalEmailConfigured(), true);
      assert.equal(getTransactionalEmailStatus(), 'available');
    });
    await withEmailEnv(
      { key: configured.key, from: configured.from, replyTo: 'not-a-reply' },
      async () => {
        assert.equal(getTransactionalEmailStatus(), 'unavailable');
      }
    );

    const prevNode = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await withEmailEnv(
        { key: configured.key, from: 'NEXTER <onboarding@resend.dev>' },
        async () => {
          assert.equal(getTransactionalEmailStatus(), 'unavailable');
        }
      );
      await withEmailEnv({ key: configured.key, from: 'NEXTER <noreply@gmail.com>' }, async () => {
        assert.equal(getTransactionalEmailStatus(), 'unavailable');
      });
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }

    assert.doesNotMatch(src('src/routes/status.routes.ts'), /RESEND_API_KEY|EMAIL_FROM|getResendApiKey\(\)/);
    assert.doesNotMatch(repo('frontend/src/lib/runtime-config.ts'), /RESEND_API_KEY|EMAIL_FROM|EMAIL_REPLY_TO/);
    assert.doesNotMatch(repo('frontend/src/services/api.ts'), /RESEND_API_KEY|EMAIL_FROM|EMAIL_REPLY_TO/);
    assert.equal(repo('frontend/src/lib/runtime-config.ts').includes('RESEND'), false);
  });

  it('7-11 RECIPIENT: valid accepted; empty/malformed/header injection rejected; From not client-controlled', async () => {
    assert.equal(normalizeRecipientEmail('Ada@Example.com'), 'ada@example.com');
    assert.equal(normalizeRecipientEmail(''), null);
    assert.equal(normalizeRecipientEmail('not-an-email'), null);
    assert.equal(normalizeRecipientEmail('ada@example.com\nBcc: evil@x'), null);
    assert.equal(parseFromAddress('NEXTER <noreply@test.invalid>')?.email, 'noreply@test.invalid');
    assert.equal(isAllowedTransactionalFrom(parseFromAddress('onboarding@resend.dev'), true), false);

    await withEmailEnv({ key: configured.key, from: configured.from }, async () => {
      const ok = await sendTransactionalEmail(welcomeEmail('ada@example.com', 'Ada'));
      assert.equal(ok.sent, true);
      const empty = await sendTransactionalEmail({
        to: '',
        kind: 'welcome',
        subject: 'Willkommen bei NEXTER Creator Studio',
        text: 'x',
      });
      assert.equal(empty.sent, false);
      const malformed = await sendTransactionalEmail({
        to: 'not-an-email',
        kind: 'welcome',
        subject: 'Willkommen bei NEXTER Creator Studio',
        text: 'x',
      });
      assert.equal(malformed.sent, false);
      const injected = await sendTransactionalEmail({
        to: 'ada@example.com\r\nBcc: evil@x.com',
        kind: 'welcome',
        subject: 'Willkommen bei NEXTER Creator Studio',
        text: 'x',
      });
      assert.equal(injected.sent, false);
    });

    assert.doesNotMatch(src('src/services/email.service.ts'), /payload\.from|req\.body\.from|from:\s*payload/);
    assert.match(src('src/services/email.service.ts'), /getTransactionalFromAddress/);
    await assert.rejects(
      () =>
        createInviteCode(
          { description: 'bad-mail', assignedEmail: 'ada@example.com\nBcc:evil@x', maximumUses: 1 },
          'admin-s'
        ),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_INPUT'
    );
  });

  it('12-20 TEMPLATES: NEXTER branding, no legacy/localhost/old hosts, escaped user text, production URL', () => {
    const prevFront = process.env.FRONTEND_URL;
    try {
      process.env.FRONTEND_URL = 'https://nexter-creator-studio-production.up.railway.app';
      const welcome = welcomeEmail('a@test.invalid', '<script>alert(1)</script>');
      const invite = inviteEmail('a@test.invalid', 'CODE01', '<img src=x onerror=alert(1)>');
      assert.match(welcome.subject, /NEXTER Creator Studio/);
      assert.match(invite.subject, /NEXTER/);
      assert.match(welcome.text, /NEXTER/);
      assert.match(invite.text, /NEXTER Creator Studio/);
      assert.equal(welcome.text.includes('<script>'), false);
      assert.equal(invite.text.includes('<img'), false);
      assert.match(welcome.text, /https:\/\/nexter-creator-studio-production\.up\.railway\.app/);
      assert.match(invite.text, /https:\/\/nexter-creator-studio-production\.up\.railway\.app/);
      assert.doesNotMatch(welcome.subject + welcome.text + invite.subject + invite.text, /\bUCBS\b|\bNexa\b|\bNexta\b/);
      assert.doesNotMatch(welcome.text + invite.text, /localhost|127\.0\.0\.1|creatorbrandingstudioultimate-production/);
      assert.equal(
        transactionalAppUrl('http://localhost:5173', true),
        null
      );
      assert.equal(
        transactionalAppUrl('https://nexter-creator-studio-production.up.railway.app', true),
        'https://nexter-creator-studio-production.up.railway.app'
      );
    } finally {
      if (prevFront === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = prevFront;
    }

    process.env.FRONTEND_URL = 'http://localhost:5173';
    try {
      const local = inviteEmail('a@test.invalid', 'CODE01', 'Beta');
      assert.doesNotMatch(local.text, /localhost|127\.0\.0\.1/);
    } finally {
      if (prevFront === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = prevFront;
    }
  });

  it('21-27 INVITE: survives provider failure; dispatch recorded; no duplicate side effects; admin auth preserved', async () => {
    setTestEmailTransport(async () => {
      throw new Error('provider down');
    });
    const invite = await createInviteCode(
      {
        description: 's-fail',
        assignedEmail: `s21-${randomUUID()}@example.com`,
        maximumUses: 1,
      },
      'admin-s'
    );
    const first = await deliverAssignedInviteEmail(invite, { created: true });
    assert.equal(first.sent, false);
    assert.equal(first.status, 'failed');
    assert.equal(first.message, INVITE_CREATED_EMAIL_FAILED_MESSAGE);
    assert.equal((await getInviteById(invite.id))?.code, invite.code);
    assert.equal((await getInviteById(invite.id))?.currentUses, 0);

    resetTestEmailTransport();
    await withEmailEnv({ key: configured.key, from: configured.from }, async () => {
      const retry = await deliverAssignedInviteEmail(invite, { created: false });
      assert.equal(retry.sent, true);
      const again = await deliverAssignedInviteEmail(invite, { created: false });
      assert.equal(again.duplicate, true);
      assert.equal(again.sent, false);
      assert.equal(again.message, EMAIL_ALREADY_SENT_MESSAGE);
    });

    assert.match(src('src/routes/admin.routes.ts'), /requirePermission\(Permission\.MANAGE_INVITES\)/);
    assert.match(src('src/routes/admin.routes.ts'), /requireRole\(UserRole\.ADMIN, UserRole\.SUPER_ADMIN\)/);
    assert.doesNotMatch(src('src/services/oauth.service.ts'), /syntheticEmail/);
  });

  it('28-30 WELCOME: notification only; coins/user unchanged by mail; duplicate send protected', async () => {
    const prevMode = (await getSystemSettings()).registrationMode;
    await updateSystemSettings({ registrationMode: 'invite_only' }, 'block-s');
    try {
      await withEmailEnv({ key: configured.key, from: configured.from }, async () => {
        const invite = await createInviteCode({ description: 's-welcome', maximumUses: 1 }, 'admin-s');
        const uid = `ws-${randomUUID()}`;
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
        const mailAgain = await dispatchTransactionalEmail(
          welcomeEmailIdempotencyKey(uid),
          welcomeEmail(`${uid}@ok.test`, 'Ada')
        );
        assert.equal(mailAgain.duplicate, true);
        assert.equal(mailAgain.sent, false);
        assert.equal(await getCoinBalance(uid), 50);
        assert.ok(await getUserById(uid));
        assert.equal((await getTransactions(uid)).filter((tx) => tx.idempotencyKey === `welcome:${uid}`).length, 1);
      });
    } finally {
      await updateSystemSettings({ registrationMode: prevMode }, 'block-s');
    }
    assert.doesNotMatch(src('src/services/email.service.ts'), /addCoins|updateCoinBalance/);
  });

  it('31-34 FIREBASE AUTH: verification/reset architecture and production continue URLs preserved', () => {
    const firebase = repo('frontend/src/lib/firebase.ts');
    const actionUrl = repo('frontend/src/lib/auth-action-url.ts');
    assert.match(firebase, /sendEmailVerification/);
    assert.match(firebase, /sendPasswordResetEmail/);
    assert.doesNotMatch(src('src/services/email.service.ts'), /sendPasswordResetEmail|sendEmailVerification/);
    assert.match(firebase, /authActionContinueUrl\('\/verify-email'\)/);
    assert.match(firebase, /authActionContinueUrl\('\/login'\)/);
    assert.match(actionUrl, /window\.location\.origin/);
    assert.doesNotMatch(actionUrl, /localhost:5173|creatorbrandingstudioultimate-production/);
    assert.doesNotMatch(firebase, /localhost:5173/);
  });

  it('35-38 ERRORS: sanitized provider errors; no key/body dump; unavailable is not success', async () => {
    const logs: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    try {
      setTestEmailTransport(async () => {
        throw new Error('RESEND_API_KEY missing fetch failed 401');
      });
      const invite = await createInviteCode(
        {
          description: 's-err',
          assignedEmail: `s35-${randomUUID()}@example.com`,
          maximumUses: 1,
        },
        'admin-s'
      );
      const email = await deliverAssignedInviteEmail(invite, { created: true });
      assert.equal(email.sent, false);
      assert.doesNotMatch(email.message, /RESEND_API_KEY|re_fake|401|fetch failed/);
      assert.doesNotMatch(logs.join('\n'), /re_fake|RESEND_API_KEY\s*=|Hallo,/);
    } finally {
      console.error = orig;
    }
    resetTestEmailTransport();
    await withEmailEnv({ key: null, from: null }, async () => {
      const invite = await createInviteCode(
        {
          description: 's-unavail',
          assignedEmail: `s38-${randomUUID()}@example.com`,
          maximumUses: 1,
        },
        'admin-s'
      );
      const email = await deliverAssignedInviteEmail(invite, { created: true });
      assert.equal(email.sent, false);
      assert.equal(email.status, 'not_configured');
      assert.equal(email.message, INVITE_CREATED_EMAIL_FAILED_MESSAGE);
    });
  });

  it('39-41 ABUSE: rate limits and admin-only invite mail; users cannot relay arbitrary mail', () => {
    assert.match(src('src/index.ts'), /authLimiter/);
    assert.match(src('src/index.ts'), /apiLimiter/);
    assert.match(src('src/index.ts'), /app\.use\('\/api\/v1\/auth', authLimiter\)/);
    assert.match(src('src/index.ts'), /app\.use\('\/api\/v1', apiLimiter\)/);
    assert.match(src('src/routes/admin.routes.ts'), /\/invites\/:id\/resend-email/);
    assert.doesNotMatch(src('src/routes/auth.routes.ts'), /deliverAssignedInviteEmail|sendTransactionalEmail/);
    assert.doesNotMatch(repo('frontend/src/services/api.ts'), /EMAIL_FROM|RESEND_API_KEY|reply_to/);
    assert.equal(isPaidProviderTestBlocked(), true);
  });

  it('42-49 REGRESSION: Block E/F/I/N and generation isolation remain; payments off; no live Resend in tests', () => {
    assert.match(src('src/services/oauth.service.ts'), /assertInviteEligible/);
    assert.match(src('src/services/oauth.service.ts'), /compensatePendingOAuthRegistration/);
    assert.match(src('src/config/env.ts'), /isTransactionalEmailConfigured/);
    assert.match(src('src/services/email.service.ts'), /INVITE_CREATED_EMAIL_FAILED_MESSAGE/);
    assert.match(src('src/services/nexter-branding-e2e.test.ts'), /invite, welcome, and payment receipt templates use NEXTER/);
    assert.match(src('src/lib/media-providers.ts'), /isPaidProviderTestBlocked/);
    assert.match(src('src/services/image-generation-e2e.test.ts'), /IMAGE_GENERATION_UNAVAILABLE/);
    assert.match(src('src/lib/runway-video.ts'), /gen4\.5/);
    assert.equal(arePaymentsEnabled(), false);
    assert.match(src('src/services/email.service.ts'), /isPaidProviderTestBlocked/);
    assert.doesNotMatch(
      src('src/services/email.service.ts') + src('src/lib/email-address.ts'),
      /re_[A-Za-z0-9]{16,}|sk_live_|BEGIN PRIVATE KEY/
    );
  });
});
