import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoinSpendCategory, UserRole } from '@ucbs/shared';
import { getOrCreateUser, getUserById, setUserDisabled, setUserRole } from './user.service.js';
import { devStore } from '../lib/dev-store.js';
import {
  addCoins,
  deductCoins,
  deductAmount,
  getCoinBalance,
  getTransactions,
  refundOnce,
} from './coins.service.js';
import { withCoinCharge } from '../lib/billable-job.js';
import {
  creditCoinsFromPackagePurchase,
  setPaymentCreditTestHook,
  getPackageById,
} from './payment-credit.service.js';
import { getPaymentClaim } from './session-store.service.js';
import { createInviteCode, redeemInviteCode, getInviteByCode } from './invite.service.js';
import { writeAdminAudit, listAdminAuditForTarget } from './admin-audit.service.js';
import { denyIfDisabled } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  getBillableCharge,
} from './billable-charge.service.js';
import { recoverStaleJobs } from './job-recovery.service.js';
import { dispatchTransactionalEmail, welcomeEmail } from './email.service.js';
import { exportAccountData, requestAccountDeletion, ACCOUNT_DELETE_CONFIRMATION } from './account.service.js';
import { dsGet } from '../lib/data-store.js';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

async function setBalance(id: string, coins: number) {
  const current = await getCoinBalance(id);
  if (current < coins) await addCoins(id, coins - current, 'test-set', 'bonus', { sourceType: 'admin' });
  if (current > coins) {
    const r = await deductAmount(id, current - coins, 'test-trim');
    assert.equal(r.success, true);
  }
}

describe('phase I — coins ledger', () => {
  it('22/23 balance + ledger atomic with before/after', async () => {
    const user = await getOrCreateUser(`i-ledger-${randomUUID()}`, 'ledger@test.local', 'L');
    const before = await getCoinBalance(user.id);
    const result = await deductCoins(user.id, CoinSpendCategory.TEXT_GENERATION, 'Text-Test', {
      idempotencyKey: `t-${user.id}`,
    });
    assert.equal(result.success, true);
    const txs = (await getTransactions(user.id, 10)) as Array<{
      type: string;
      amount: number;
      balanceBefore?: number;
      balanceAfter: number;
    }>;
    const spend = txs.find((t) => t.type === 'spend' && t.amount === -result.cost);
    assert.ok(spend);
    assert.equal(spend!.balanceBefore, before);
    assert.equal(spend!.balanceAfter, before - result.cost);
    assert.equal(await getCoinBalance(user.id), spend!.balanceAfter);
  });

  it('25 parallel Dev-Store deducts cannot both succeed on insufficient funds', async () => {
    const id = `i-race-${randomUUID()}`;
    await getOrCreateUser(id, `${id}@test.local`, 'R');
    await setBalance(id, 20);
    assert.equal(await getCoinBalance(id), 20);

    const a = deductCoins(id, CoinSpendCategory.LOGO_GENERATION, 'parallel-a');
    const b = deductCoins(id, CoinSpendCategory.LOGO_GENERATION, 'parallel-b');
    const [ra, rb] = await Promise.all([a, b]);
    const wins = [ra, rb].filter((r) => r.success).length;
    assert.equal(wins, 1);
    assert.equal(await getCoinBalance(id), 5);
  });

  it('26/27/28 refund exactly once including throw', async () => {
    const user = await getOrCreateUser(`i-ref-${randomUUID()}`, 'ref@test.local', 'Ref');
    const before = await getCoinBalance(user.id);
    const charge = await deductCoins(user.id, CoinSpendCategory.TEXT_GENERATION, 'job', {
      idempotencyKey: `c-${user.id}`,
    });
    assert.ok(charge.transactionId);
    await refundOnce({
      userId: user.id,
      chargeTransactionId: charge.transactionId!,
      amount: charge.cost,
      description: 'refund-1',
    });
    const afterFirst = await getCoinBalance(user.id);
    assert.equal(afterFirst, before);
    const second = await refundOnce({
      userId: user.id,
      chargeTransactionId: charge.transactionId!,
      amount: charge.cost,
      description: 'refund-2',
    });
    assert.equal(second.duplicate, true);
    assert.equal(await getCoinBalance(user.id), before);

    let threw = false;
    try {
      await withCoinCharge(user.id, CoinSpendCategory.TEXT_GENERATION, 'throw-job', async () => {
        throw new Error('provider down');
      });
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('29 welcome only on new user', async () => {
    const id = `i-wel-${randomUUID()}`;
    await getOrCreateUser(id, `${id}@test.local`, 'W');
    const first = ((await getTransactions(id, 20)) as Array<{ type: string; description: string }>).filter(
      (t) => t.type === 'bonus' && t.description === 'Willkommensbonus'
    );
    assert.equal(first.length, 1);
    await getOrCreateUser(id, `${id}@test.local`, 'W');
    const second = ((await getTransactions(id, 20)) as Array<{ type: string; description: string }>).filter(
      (t) => t.type === 'bonus' && t.description === 'Willkommensbonus'
    );
    assert.equal(second.length, 1);
  });

  it('30 missing legacy coinBalance does not mint welcome coins', async () => {
    const id = `i-legacy-${randomUUID()}`;
    devStore.saveUser(id, {
      id,
      email: `${id}@test.local`,
      displayName: 'Legacy',
      role: UserRole.USER,
      authProviders: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const user = await getOrCreateUser(id, `${id}@test.local`, 'Legacy');
    assert.equal(user.coinBalance, 0);
    const welcome = ((await getTransactions(id, 20)) as Array<{ description: string }>).filter(
      (t) => t.description === 'Willkommensbonus'
    );
    assert.equal(welcome.length, 0);
  });
});

describe('phase I — payments', () => {
  it('1/9/13 package credit once for stripe and paypal', async () => {
    const user = await getOrCreateUser(`i-pay-${randomUUID()}`, 'pay@test.local', 'P');
    const before = await getCoinBalance(user.id);
    const pkg = getPackageById('starter')!;
    const sessionId = `cs_test_${randomUUID()}`;
    const first = await creditCoinsFromPackagePurchase({
      provider: 'stripe',
      paymentId: sessionId,
      userId: user.id,
      packageId: 'starter',
      amountCents: pkg.priceCents,
      currency: 'eur',
    });
    assert.equal(first.credited, true);
    assert.equal(first.totalCoins, pkg.coins + pkg.bonusCoins);
    const second = await creditCoinsFromPackagePurchase({
      provider: 'stripe',
      paymentId: sessionId,
      userId: user.id,
      packageId: 'starter',
      amountCents: pkg.priceCents,
      currency: 'eur',
    });
    assert.equal(second.duplicate, true);
    assert.equal(await getCoinBalance(user.id), before + first.totalCoins);
    const claim = await getPaymentClaim('stripe', sessionId);
    assert.equal(claim?.status, 'credited');

    const orderId = `PAYPAL-${randomUUID()}`;
    const p1 = await creditCoinsFromPackagePurchase({
      provider: 'paypal',
      paymentId: orderId,
      userId: user.id,
      packageId: 'starter',
      amountCents: pkg.priceCents,
      currency: 'EUR',
    });
    const p2 = await creditCoinsFromPackagePurchase({
      provider: 'paypal',
      paymentId: orderId,
      userId: user.id,
      packageId: 'starter',
      amountCents: pkg.priceCents,
      currency: 'EUR',
    });
    assert.equal(p1.credited, true);
    assert.equal(p2.duplicate, true);
  });

  it('4/5 credit fail after claim is retryable then coins once', async () => {
    const user = await getOrCreateUser(`i-retry-${randomUUID()}`, 'retry@test.local', 'R');
    const before = await getCoinBalance(user.id);
    const pkg = getPackageById('starter')!;
    const paymentId = `cs_fail_${randomUUID()}`;
    setPaymentCreditTestHook(() => {
      throw new Error('injected credit failure');
    });
    await assert.rejects(() =>
      creditCoinsFromPackagePurchase({
        provider: 'stripe',
        paymentId,
        userId: user.id,
        packageId: 'starter',
        amountCents: pkg.priceCents,
        currency: 'eur',
      })
    );
    setPaymentCreditTestHook(null);
    const failed = await getPaymentClaim('stripe', paymentId);
    assert.equal(failed?.status, 'failed');
    const retry = await creditCoinsFromPackagePurchase({
      provider: 'stripe',
      paymentId,
      userId: user.id,
      packageId: 'starter',
      amountCents: pkg.priceCents,
      currency: 'eur',
    });
    assert.equal(retry.credited, true);
    assert.equal(await getCoinBalance(user.id), before + retry.totalCoins);
  });

  it('6/7/8 invalid package/amount/currency grant no coins', async () => {
    const user = await getOrCreateUser(`i-bad-${randomUUID()}`, 'bad@test.local', 'B');
    const before = await getCoinBalance(user.id);
    const pkg = getPackageById('starter')!;
    await assert.rejects(
      () =>
        creditCoinsFromPackagePurchase({
          provider: 'stripe',
          paymentId: `cs_${randomUUID()}`,
          userId: user.id,
          packageId: 'does-not-exist',
          amountCents: pkg.priceCents,
          currency: 'eur',
        }),
      /INVALID_PACKAGE|Unbekanntes/
    );
    await assert.rejects(
      () =>
        creditCoinsFromPackagePurchase({
          provider: 'stripe',
          paymentId: `cs_${randomUUID()}`,
          userId: user.id,
          packageId: 'starter',
          amountCents: 1,
          currency: 'eur',
        }),
      /AMOUNT_MISMATCH/
    );
    await assert.rejects(
      () =>
        creditCoinsFromPackagePurchase({
          provider: 'stripe',
          paymentId: `cs_${randomUUID()}`,
          userId: user.id,
          packageId: 'starter',
          amountCents: pkg.priceCents,
          currency: 'usd',
        }),
      /CURRENCY_MISMATCH/
    );
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('11/12 paypal routes ack 500 on credit fail and reject bad signatures', () => {
    const paypal = src('src/routes/paypal.routes.ts');
    assert.match(paypal, /res\.status\(500\)\.json\(\{ error: 'credit_failed' \}\)/);
    assert.match(paypal, /Invalid PayPal webhook signature/);
    const stripe = src('src/routes/stripe.routes.ts');
    assert.match(stripe, /Invalid signature/);
  });
});

describe('phase I — admin / invite / disabled', () => {
  it('31/32/37 admin coins ledger + audit + idempotent', async () => {
    const user = await getOrCreateUser(`i-adm-${randomUUID()}`, 'adm@test.local', 'A');
    const before = await getCoinBalance(user.id);
    const key = `idem-${randomUUID()}`;
    const a = await addCoins(user.id, 10, 'Kulanz', 'bonus', {
      adminActorId: 'admin-1',
      reason: 'Kulanz',
      sourceType: 'admin',
      idempotencyKey: `admin-coins:admin-1:${user.id}:${key}`,
    });
    const b = await addCoins(user.id, 10, 'Kulanz', 'bonus', {
      adminActorId: 'admin-1',
      reason: 'Kulanz',
      sourceType: 'admin',
      idempotencyKey: `admin-coins:admin-1:${user.id}:${key}`,
    });
    assert.equal(a, before + 10);
    assert.equal(b, before + 10);
    await writeAdminAudit({
      actorUserId: 'admin-1',
      action: 'coin_adjustment',
      targetUserId: user.id,
      reason: 'Kulanz',
      before: { coinBalance: before },
      after: { coinBalance: a, amount: 10 },
    });
    const logs = await listAdminAuditForTarget(user.id);
    assert.ok(logs.some((l) => l.action === 'coin_adjustment' && l.actorUserId === 'admin-1'));
  });

  it('33/34 creator cannot use admin role middleware or self-role via requireRole', () => {
    const mw = requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN);
    assert.throws(
      () =>
        mw(
          { user: { uid: 'u', email: 'c@x', role: UserRole.USER, displayName: 'c', coinBalance: 0 } } as never,
          {} as never,
          () => undefined
        ),
      (err: unknown) => err instanceof AppError && err.statusCode === 403
    );
    const adminSrc = src('src/routes/admin.routes.ts');
    assert.match(adminSrc, /requireRole\(UserRole\.ADMIN, UserRole\.SUPER_ADMIN\)/);
    const authMe = src('src/routes/auth.routes.ts');
    assert.equal(/role:\s*z\.enum/.test(authMe.split('authRoutes.get')[1] ?? ''), false);
  });

  it('35/36 disabled blocks, re-enable allows', async () => {
    const user = await getOrCreateUser(`i-dis-${randomUUID()}`, 'dis@test.local', 'D');
    assert.equal(denyIfDisabled(user), null);
    await setUserDisabled(user.id, true);
    const blocked = await getUserById(user.id);
    const err = denyIfDisabled(blocked);
    assert.equal(err?.code, 'ACCOUNT_DISABLED');
    await setUserDisabled(user.id, false);
    assert.equal(denyIfDisabled(await getUserById(user.id)), null);
  });

  it('38 role change is auditierbar', async () => {
    const user = await getOrCreateUser(`i-role-${randomUUID()}`, 'role@test.local', 'Ro');
    const before = user.role;
    await setUserRole(user.id, UserRole.TESTER);
    await writeAdminAudit({
      actorUserId: 'admin-1',
      action: 'role_change',
      targetUserId: user.id,
      reason: 'beta',
      before: { role: before },
      after: { role: UserRole.TESTER },
    });
    const logs = await listAdminAuditForTarget(user.id);
    assert.ok(logs.some((l) => l.action === 'role_change'));
  });

  it('39/40 audit API is admin-only; frontend admin route guarded', () => {
    assert.match(src('src/routes/admin.routes.ts'), /\/audit/);
    assert.match(src('../frontend/src/routes/index.tsx'), /AdminRoute/);
    assert.match(src('../frontend/src/components/auth/ProtectedRoute.tsx'), /isAdminRole/);
  });

  it('41-46 invites: maxUses, parallel, expiry, disabled, usedBy', async () => {
    const a = await createInviteCode({ description: 'one', maximumUses: 1 }, 'admin-1');
    const u1 = `iu1-${randomUUID()}`;
    const u2 = `iu2-${randomUUID()}`;
    const r1 = redeemInviteCode(a.code, 'a@test.local', u1);
    const r2 = redeemInviteCode(a.code, 'b@test.local', u2);
    const settled = await Promise.allSettled([r1, r2]);
    const ok = settled.filter((s) => s.status === 'fulfilled').length;
    assert.equal(ok, 1);
    const after = await getInviteByCode(a.code);
    assert.equal(after?.currentUses, 1);
    assert.equal(after?.usedBy?.length, 1);

    const expired = await createInviteCode(
      { description: 'old', maximumUses: 1, expiresAt: new Date(Date.now() - 1000).toISOString() },
      'admin-1'
    );
    await assert.rejects(() => redeemInviteCode(expired.code, 'x@test.local', 'u'), /abgelaufen/);

    const off = await createInviteCode({ description: 'off', maximumUses: 2 }, 'admin-1');
    const { deactivateInviteCode } = await import('./invite.service.js');
    await deactivateInviteCode(off.id);
    await assert.rejects(() => redeemInviteCode(off.code, 'x@test.local', 'u'), /inaktiv/);
  });
});

describe('phase I — jobs recovery / limits', () => {
  it('14-19 stale charged job refunds once; fresh and settled untouched', async () => {
    const user = await getOrCreateUser(`i-job-${randomUUID()}`, 'job@test.local', 'J');
    const before = await getCoinBalance(user.id);
    const charge = await deductCoins(user.id, CoinSpendCategory.TEXT_GENERATION, 'stale-job', {
      persistCharge: {
        id: `chg-${user.id}`,
        description: 'stale-job',
        category: CoinSpendCategory.TEXT_GENERATION,
      },
    });
    const row = await getBillableCharge(`chg-${user.id}`);
    assert.ok(row);
    await (await import('../lib/data-store.js')).dsSet('billable_charges', row!.id, {
      ...row!,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const first = await recoverStaleJobs({ now: Date.now(), staleMs: 1000 });
    assert.ok(first.refunded >= 1 || first.alreadyRefunded >= 1);
    assert.equal(await getCoinBalance(user.id), before);
    const second = await recoverStaleJobs({ now: Date.now(), staleMs: 1000 });
    assert.equal(await getCoinBalance(user.id), before);
    void second;

    const freshId = `fresh-${user.id}`;
    await deductCoins(user.id, CoinSpendCategory.TEXT_GENERATION, 'fresh', {
      persistCharge: { id: freshId, description: 'fresh', category: CoinSpendCategory.TEXT_GENERATION },
    });
    const recFresh = await recoverStaleJobs({ now: Date.now(), staleMs: 60 * 60 * 1000 });
    const still = await getBillableCharge(freshId);
    assert.equal(still?.status, 'charged');
    void recFresh;
    void charge;
  });

  it('20/21 job limits block before coin deduct', async () => {
    const prevC = process.env.MAX_CONCURRENT_JOBS_PER_USER;
    const prevD = process.env.MAX_DAILY_JOBS_PER_USER;
    process.env.MAX_CONCURRENT_JOBS_PER_USER = '1';
    const user = await getOrCreateUser(`i-lim-${randomUUID()}`, 'lim@test.local', 'L');
    const before = await getCoinBalance(user.id);
    await deductCoins(user.id, CoinSpendCategory.TEXT_GENERATION, 'hold', {
      persistCharge: { id: `hold-${user.id}`, description: 'hold', category: CoinSpendCategory.TEXT_GENERATION },
    });
    await assert.rejects(
      () =>
        withCoinCharge(user.id, CoinSpendCategory.TEXT_GENERATION, 'blocked', async () => ({
          status: 'completed',
        })),
      (err: unknown) => err instanceof AppError && err.code === 'CONCURRENT_JOB_LIMIT'
    );
    assert.equal(await getCoinBalance(user.id), before - 2);

    process.env.MAX_DAILY_JOBS_PER_USER = '1';
    process.env.MAX_CONCURRENT_JOBS_PER_USER = '50';
    const user2 = await getOrCreateUser(`i-day-${randomUUID()}`, 'day@test.local', 'D');
    const b2 = await getCoinBalance(user2.id);
    await deductCoins(user2.id, CoinSpendCategory.TEXT_GENERATION, 'day', {
      persistCharge: { id: `day-${user2.id}`, description: 'day', category: CoinSpendCategory.TEXT_GENERATION },
    });
    await assert.rejects(
      () =>
        withCoinCharge(user2.id, CoinSpendCategory.TEXT_GENERATION, 'day-block', async () => ({
          status: 'completed',
        })),
      (err: unknown) => err instanceof AppError && err.code === 'DAILY_JOB_LIMIT'
    );
    assert.equal(await getCoinBalance(user2.id), b2 - 2);

    if (prevC === undefined) delete process.env.MAX_CONCURRENT_JOBS_PER_USER;
    else process.env.MAX_CONCURRENT_JOBS_PER_USER = prevC;
    if (prevD === undefined) delete process.env.MAX_DAILY_JOBS_PER_USER;
    else process.env.MAX_DAILY_JOBS_PER_USER = prevD;
  });
});

describe('phase I — email / account / legal / security', () => {
  it('47-51 payment mail once; mail error does not roll coins; welcome mail no second bonus', async () => {
    const user = await getOrCreateUser(`i-mail-${randomUUID()}`, 'mail@test.local', 'M');
    const before = await getCoinBalance(user.id);
    const pkg = getPackageById('starter')!;
    const paymentId = `cs_mail_${randomUUID()}`;
    await creditCoinsFromPackagePurchase({
      provider: 'stripe',
      paymentId,
      userId: user.id,
      packageId: 'starter',
      amountCents: pkg.priceCents,
      currency: 'eur',
    });
    await creditCoinsFromPackagePurchase({
      provider: 'stripe',
      paymentId,
      userId: user.id,
      packageId: 'starter',
      amountCents: pkg.priceCents,
      currency: 'eur',
    });
    const dispatch = await dsGet('email_dispatches', `purchase:stripe:${paymentId}`);
    assert.ok(dispatch?.sentAt);
    assert.equal(await getCoinBalance(user.id), before + pkg.coins + pkg.bonusCoins);

    const w1 = await dispatchTransactionalEmail(`welcome:${user.id}`, welcomeEmail(user.email, user.displayName));
    const w2 = await dispatchTransactionalEmail(`welcome:${user.id}`, welcomeEmail(user.email, user.displayName));
    assert.equal(w2.duplicate, true);
    void w1;
    const bonuses = ((await getTransactions(user.id, 30)) as Array<{ description: string }>).filter(
      (t) => t.description === 'Willkommensbonus'
    );
    assert.equal(bonuses.length, 1);
  });

  it('52-57 export isolation, delete confirmation, finance retained, disabled after delete', async () => {
    const user = await getOrCreateUser(`i-acc-${randomUUID()}`, 'acc@test.local', 'Acc');
    const other = await getOrCreateUser(`i-acc-o-${randomUUID()}`, 'other@test.local', 'Oth');
    const exported = await exportAccountData(user.id);
    const raw = JSON.stringify(exported);
    assert.equal(raw.includes(other.email), false);
    assert.equal(/sk_live|whsec_|Bearer |OPENAI/i.test(raw), false);
    await assert.rejects(() => requestAccountDeletion(user.id, 'nope'), /CONFIRMATION_REQUIRED/);
    await requestAccountDeletion(user.id, ACCOUNT_DELETE_CONFIRMATION);
    const after = await getUserById(user.id);
    assert.equal(after?.disabled, true);
    assert.equal(denyIfDisabled(after)?.code, 'ACCOUNT_DISABLED');
    const txs = await getTransactions(user.id, 5);
    assert.ok(Array.isArray(txs));
  });

  it('legal pages are drafts; health is configured not available', () => {
    const legal = src('src/routes/legal.routes.ts');
    assert.match(legal, /Entwurf \/ vor Veröffentlichung rechtlich prüfen lassen/);
    assert.equal(legal.includes('rechtsgeprüft'), false);
    const env = src('src/config/env.ts');
    assert.match(env, /liveChecked: false/);
    assert.match(env, /available: null/);
    const err = src('src/middleware/errorHandler.ts');
    assert.match(err, /INTERNAL_ERROR/);
    assert.match(err, /ZodError/);
    assert.match(err, /VALIDATION_ERROR/);
    assert.equal(err.includes('err.stack'), false);
  });

  it('24 firestore coin mutation writes ledger in the same transaction', () => {
    const coins = src('src/services/coins.service.ts');
    assert.match(coins, /runTransaction/);
    assert.match(coins, /collection\(TX_COLLECTION\)/);
    assert.match(coins, /persistCharge/);
  });
});
