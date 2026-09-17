import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  LEGAL_TEXT_STATUS,
  NEXTER_STUDIO_PATHS,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_THREE_PART_COIN_COST,
  keysForStreamsetThreePart,
  currentDraftLegalAcceptanceInput,
  type RegistrationMode,
} from '@ucbs/shared';
import { ServiceError } from '../lib/errors.js';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import {
  IMAGE_GENERATION_UNAVAILABLE_CODE,
  isPaidProviderTestBlocked,
  MUSIC_PROVIDER_UNAVAILABLE_CODE,
  VIDEO_PROVIDER_UNAVAILABLE_CODE,
} from '../lib/media-providers.js';
import { withCoinCharge } from '../lib/billable-job.js';
import { dsGet } from '../lib/data-store.js';
import {
  PRODUCTION_FIREBASE_PROJECT_ID,
  assertNoProductionWritesFromTests,
} from '../lib/production-write-guard.js';
import { consumeNexterChatProviderSlot, NEXTER_CHAT_MAX_PER_WINDOW } from '../lib/provider-gate.js';
import { safeErrorDetails } from '../lib/observability.js';
import { getOrCreateUser, getUserById } from './user.service.js';
import { upsertDna, getActiveDna } from './dna.service.js';
import { createProject, getProject } from './project.service.js';
import {
  deductAmount,
  deductCoins,
  getCoinBalance,
  getTransactions,
} from './coins.service.js';
import { createInviteCode, getInviteByCode } from './invite.service.js';
import { getSystemSettings, updateSystemSettings } from './system-settings.service.js';
import { syncAuthenticatedAppUser } from './auth-registration.service.js';
import { createQuote, confirmQuote, getQuote } from './nexter/quotes.service.js';
import { nexterChat, getOrCreateNexterSession } from './nexter/conversation.service.js';
import { resolveNexterConversationIntent } from './nexter/conversation-intent.js';
import { updateNexterPreferencesForUser, getNexterPreferencesForUser } from './nexter/preferences.service.js';
import { setLogoTestHooks } from './logo.service.js';
import {
  deleteUserFile,
  issueFileDownloadUrl,
  saveUserFile,
  setSaveGeneratedAssetTestHooks,
} from './file-cloud.service.js';
import { getBillableCharge, refundBillableChargeOnce } from './billable-charge.service.js';
import { dispatchTransactionalEmail, setTestEmailTransport } from './email.service.js';
import { getJobsByUser } from './ai.service.js';
import { coinCostForKind } from './nexter/tools.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function src(rel: string): string {
  return readFileSync(join(dir, '..', rel), 'utf8');
}

afterEach(() => {
  setLogoTestHooks(null);
  setSaveGeneratedAssetTestHooks(null);
  setTestEmailTransport(null);
});

async function withRegistrationMode<T>(mode: RegistrationMode, fn: () => Promise<T>): Promise<T> {
  const prev = (await getSystemSettings()).registrationMode;
  await updateSystemSettings({ registrationMode: mode }, 'block-l');
  try {
    return await fn();
  } finally {
    await updateSystemSettings({ registrationMode: prev }, 'block-l');
  }
}

async function seed(tag: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.block-l.test`, tag);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
  });
  const project = await createProject(user.id, { name: 'Block L', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

function spendGeneration(userId: string) {
  return getTransactions(userId).then((rows) =>
    rows.filter((t) => t.type === 'spend' && t.sourceType === 'generation')
  );
}

function refundsOf(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'refund'));
}

function welcomesOf(userId: string) {
  return getTransactions(userId).then((rows) =>
    rows.filter((t) => t.type === 'bonus' && t.description === 'Willkommensbonus')
  );
}

async function assertLedgerInvariants(userId: string) {
  const balance = await getCoinBalance(userId);
  assert.equal(Number.isFinite(balance), true);
  assert.equal(Number.isInteger(balance), true);
  assert.ok(balance >= 0);
  assert.notEqual(Number.isNaN(balance), true);
  const txs = await getTransactions(userId, 200);
  for (const tx of txs) {
    assert.equal(Number.isFinite(tx.amount), true);
    assert.equal(Number.isInteger(tx.amount), true);
    assert.equal(Number.isFinite(tx.balanceAfter), true);
  }
  const spends = txs.filter((t) => t.type === 'spend');
  const refundRows = txs.filter((t) => t.type === 'refund');
  const refundTotal = refundRows.reduce((sum, t) => sum + t.amount, 0);
  const spendAbs = spends.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  assert.ok(refundTotal <= spendAbs + 0);
  assert.equal((await welcomesOf(userId)).length <= 1, true);
}

describe('Block L — production write guard, emulator, pricing freeze', () => {
  it('fail-closes test writes when Dev Store is off / production project would be targeted', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => assertNoProductionWritesFromTests(),
        (err: unknown) => err instanceof Error && err.message.includes('PRODUCTION_WRITE_GUARD')
      );
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
    assertNoProductionWritesFromTests();
    assert.equal(PRODUCTION_FIREBASE_PROJECT_ID, 'nexter-creator-studio');
    const ds = src('lib/data-store.ts');
    assert.match(ds, /assertNoProductionWritesFromTests/);
    const coins = src('services/coins.service.ts');
    assert.match(coins, /assertNoProductionWritesFromTests/);
  });

  it('does not configure a Firebase emulator; isolated tests use Dev Store', () => {
    const firebase = JSON.parse(repo('firebase.json')) as { emulators?: unknown };
    assert.equal(firebase.emulators, undefined);
    assert.match(src('lib/dev-store.ts'), /ucbs-dev-store-/);
  });

  it('keeps launch pricing and payments off', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(coinCostForKind('logo'), 15);
    assert.equal(coinCostForKind('music'), 10);
    assert.equal(coinCostForKind('animation'), 25);
    assert.equal(coinCostForKind('ai-video'), 25);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(LEGAL_TEXT_STATUS, 'draft');
    assert.equal(Object.values(COIN_COSTS).includes(135), false);
    assert.equal(isPaidProviderTestBlocked(), true);
  });
});

describe('Block L — core journeys 1-20', () => {
  it('invite registration, welcome once, and auth sync retry stay at 50', async () => {
    await withRegistrationMode('invite_only', async () => {
      const invite = await createInviteCode({ description: 'l-reg', grantRole: 'tester', maximumUses: 1 }, 'admin-l');
      const uid = `l-reg-${randomUUID()}`;
      const first = await syncAuthenticatedAppUser({
        uid,
        email: `${uid}@ok.test`,
        displayName: 'Invited',
        inviteCode: invite.code,
        authProvider: 'email',
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      });
      assert.equal(first.created, true);
      assert.equal(await getCoinBalance(uid), 50);
      const again = await syncAuthenticatedAppUser({
        uid,
        email: `${uid}@ok.test`,
        inviteCode: invite.code,
        authProvider: 'email',
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      });
      assert.equal(again.created, false);
      assert.equal(await getCoinBalance(uid), 50);
      assert.equal((await welcomesOf(uid)).length, 1);
      assert.equal((await getInviteByCode(invite.code))?.currentUses, 1);
      assert.equal(await getUserById(uid) !== null, true);
      await assertLedgerInvariants(uid);
    });
  });

  it('onboarding preferences and Creator DNA persist without NaN/undefined', async () => {
    const { user, dna, project } = await seed('onboard');
    await updateNexterPreferencesForUser(user.id, { language: 'de', addressAs: 'NightWolf' });
    const prefs = await getNexterPreferencesForUser(user.id);
    assert.equal(prefs.language, 'de');
    assert.equal(prefs.addressAs, 'NightWolf');
    const reloaded = await getActiveDna(user.id);
    assert.equal(reloaded?.id, dna.id);
    assert.equal(reloaded?.name, 'NightWolf');
    assert.equal(Number.isNaN(reloaded?.name as unknown as number), false);
    const owned = await getProject(project.id, user.id);
    assert.ok(owned);
    const other = await seed('other-proj');
    assert.equal(await getProject(project.id, other.user.id), null);
    await assertLedgerInvariants(user.id);
  });

  it('smalltalk, creator advice, project analysis, and navigation do not debit or quote', async () => {
    const { user } = await seed('intent');
    const before = await getCoinBalance(user.id);
    assert.equal(resolveNexterConversationIntent('Wie geht es dir?').intent, 'SMALLTALK');
    const smalltalk = await nexterChat(user.id, 'Wie geht es dir?');
    assert.equal((smalltalk.messages.at(-1)?.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal(await getCoinBalance(user.id), before);

    assert.equal(resolveNexterConversationIntent('Welche Farben passen zu meinem Kanal?').intent, 'CREATOR_ADVICE');
    const advice = await nexterChat(user.id, 'Welche Farben passen zu meinem Kanal?');
    assert.equal((advice.messages.at(-1)?.actions ?? []).some((a) => a.tool === 'start_generation'), false);

    assert.equal(resolveNexterConversationIntent('Was fehlt meinem Streamset?').intent, 'PROJECT_ANALYSIS');
    const analysis = await nexterChat(user.id, 'Was fehlt meinem Streamset?');
    assert.equal((analysis.messages.at(-1)?.actions ?? []).some((a) => a.tool === 'start_generation'), false);

    assert.equal(resolveNexterConversationIntent('Öffne das Logo Studio.').intent, 'NAVIGATION_ACTION');
    const nav = await nexterChat(user.id, 'Öffne das Logo Studio.');
    const open = (nav.messages.at(-1)?.actions ?? []).find((a) => a.tool === 'open_studio');
    assert.equal(open?.path, NEXTER_STUDIO_PATHS.logo);
    assert.equal(NEXTER_STUDIO_PATHS.logo, '/logo-studio');
    assert.equal((nav.messages.at(-1)?.actions ?? []).some((a) => a.tool === 'start_generation'), false);
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await spendGeneration(user.id)).length, 0);
    await getOrCreateNexterSession(user.id);
    await assertLedgerInvariants(user.id);
  });

  it('logo quote is 15, no-confirm is 0 debit, confirm with simulated provider lands at 35', async () => {
    const { user, project } = await seed('logo');
    const before = await getCoinBalance(user.id);
    assert.equal(before, 50);
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    assert.equal(quote.coinCost, 15);
    assert.equal(await getCoinBalance(user.id), 50);
    assert.equal((await spendGeneration(user.id)).length, 0);

    setLogoTestHooks({ result: 'success' });
    const confirmed = await confirmQuote(user.id, quote.id);
    assert.equal(confirmed.coinsSpent, 15);
    assert.equal(await getCoinBalance(user.id), 35);
    assert.equal((await spendGeneration(user.id)).length, 1);
    await assertLedgerInvariants(user.id);
  });

  it('insufficient balance and provider-unavailable never debit', async () => {
    const poor = await seed('poor');
    const bal = await getCoinBalance(poor.user.id);
    if (bal > 0) await deductAmount(poor.user.id, bal, 'drain', { sourceType: 'admin' });
    setLogoTestHooks({ result: 'success' });
    const q = await createQuote(poor.user.id, 'logo', poor.project.id, { logoName: 'NightWolf' });
    await assert.rejects(
      () => confirmQuote(poor.user.id, q.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal(await getCoinBalance(poor.user.id), 0);
    assert.equal((await spendGeneration(poor.user.id)).length, 0);

    const gated = await seed('gate');
    setLogoTestHooks(null);
    const quote = await createQuote(gated.user.id, 'logo', gated.project.id, { logoName: 'NightWolf' });
    await assert.rejects(
      () => confirmQuote(gated.user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === IMAGE_GENERATION_UNAVAILABLE_CODE
    );
    assert.equal(await getCoinBalance(gated.user.id), 50);
    await assertLedgerInvariants(gated.user.id);
  });

  it('provider failure and storage failure refund exactly once', async () => {
    const { user, project } = await seed('fail');
    setLogoTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    await assert.rejects(() => confirmQuote(user.id, quote.id));
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await refundsOf(user.id)).length, 1);

    setLogoTestHooks({ result: 'success' });
    setSaveGeneratedAssetTestHooks({ fail: true });
    const storageQuote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    await assert.rejects(() => confirmQuote(user.id, storageQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await refundsOf(user.id)).length, 2);
    await assertLedgerInvariants(user.id);
  });

  it('streamset 75/200, animation 25, AI video 25, music 10 stay authoritative and gated', async () => {
    const { user, project } = await seed('prices');
    const three = await createQuote(user.id, 'streamset', project.id, {
      selectedKeys: keysForStreamsetThreePart('twitch'),
    });
    assert.equal(three.coinCost, 75);
    const pack = await createQuote(user.id, 'streamset', project.id);
    assert.equal(pack.coinCost, 200);
    const anim = await createQuote(user.id, 'animation', project.id);
    assert.equal(anim.coinCost, 25);
    const video = await createQuote(user.id, 'ai-video', project.id, { message: 'Erstelle ein KI-Video.' });
    assert.equal(video.coinCost, 25);
    const music = await createQuote(user.id, 'music', project.id);
    assert.equal(music.coinCost, 10);
    const before = await getCoinBalance(user.id);
    await assert.rejects(() => confirmQuote(user.id, anim.id));
    await assert.rejects(
      () => confirmQuote(user.id, video.id),
      (err: unknown) =>
        err instanceof ServiceError &&
        (err.code === VIDEO_PROVIDER_UNAVAILABLE_CODE || err.code === 'VIDEO_PROVIDER_UNAVAILABLE' || err.code === IMAGE_GENERATION_UNAVAILABLE_CODE)
    );
    await assert.rejects(
      () => confirmQuote(user.id, music.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_PROVIDER_UNAVAILABLE_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.match(src('routes/ai-media.routes.ts'), /VIDEO_REQUIRES_QUOTE/);
    await assertLedgerInvariants(user.id);
  });

  it('browser TTS stays 0 coins; owned files, deletes, and foreign access stay safe', async () => {
    const tts = repo('frontend/src/lib/nexter-tts.ts');
    assert.doesNotMatch(tts, /deductAmount|confirmQuote|dsSet\(|elevenlabs/i);
    const { user } = await seed('files');
    const other = await seed('files-other');
    const file = await saveUserFile(user.id, {
      name: 'owned.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    assert.equal(await issueFileDownloadUrl(file.id, other.user.id), null);
    const issued = await issueFileDownloadUrl(file.id, user.id);
    assert.ok(issued?.downloadUrl);
    assert.equal(await deleteUserFile(file.id, user.id), true);
    assert.equal(await issueFileDownloadUrl(file.id, user.id), null);
    assert.equal(await deleteUserFile(file.id, user.id), true);
    const stored = await dsGet('files', file.id);
    assert.equal(stored?.deletionState, 'deleted');
    const jobs = await getJobsByUser(other.user.id, 20);
    assert.equal(jobs.every((j) => j.userId === other.user.id), true);
    await assertLedgerInvariants(user.id);
  });
});

describe('Block L — concurrency 1-15', () => {
  it('welcome bonus survives 10 parallel syncs', async () => {
    await withRegistrationMode('invite_only', async () => {
      const invite = await createInviteCode({ description: 'l-welcome', maximumUses: 1 }, 'admin-l');
      const uid = `l-w-${randomUUID()}`;
      const input = {
        uid,
        email: `${uid}@ok.test`,
        inviteCode: invite.code,
        authProvider: 'email' as const,
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      };
      const results = await Promise.all(Array.from({ length: 10 }, () => syncAuthenticatedAppUser(input)));
      assert.equal(results.filter((r) => r.created).length, 1);
      assert.equal(await getCoinBalance(uid), 50);
      assert.equal((await welcomesOf(uid)).length, 1);
      await assertLedgerInvariants(uid);
    });
  });

  it('invite maxUses=1: same-user retry is idempotent; two users do not oversubscribe', async () => {
    await withRegistrationMode('invite_only', async () => {
      const invite = await createInviteCode({ description: 'l-same', maximumUses: 1 }, 'admin-l');
      const uid = `l-same-${randomUUID()}`;
      const input = {
        uid,
        email: `${uid}@ok.test`,
        inviteCode: invite.code,
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      };
      await Promise.all(Array.from({ length: 8 }, () => syncAuthenticatedAppUser(input)));
      assert.equal(await getCoinBalance(uid), 50);
      assert.equal((await getInviteByCode(invite.code))?.currentUses, 1);

      const race = await createInviteCode({ description: 'l-race', maximumUses: 1 }, 'admin-l');
      const a = `l-a-${randomUUID()}`;
      const b = `l-b-${randomUUID()}`;
      const settled = await Promise.allSettled([
        syncAuthenticatedAppUser({
          uid: a,
          email: `${a}@race.test`,
          inviteCode: race.code,
          legalAcceptance: currentDraftLegalAcceptanceInput(),
        }),
        syncAuthenticatedAppUser({
          uid: b,
          email: `${b}@race.test`,
          inviteCode: race.code,
          legalAcceptance: currentDraftLegalAcceptanceInput(),
        }),
      ]);
      assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1);
      assert.equal([await getUserById(a), await getUserById(b)].filter(Boolean).length, 1);
      assert.equal((await getInviteByCode(race.code))?.currentUses, 1);
    });
  });

  it('10 parallel quote confirms debit once', async () => {
    const { user, project } = await seed('dbl');
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const before = await getCoinBalance(user.id);
    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, () => confirmQuote(user.id, quote.id))
    );
    const ok = settled.filter((s) => s.status === 'fulfilled') as PromiseFulfilledResult<{
      jobIds: string[];
      coinsSpent: number;
    }>[];
    assert.ok(ok.length >= 1);
    const jobId = ok[0]!.value.jobIds[0];
    assert.ok(ok.every((s) => s.value.jobIds[0] === jobId));
    assert.equal(before - (await getCoinBalance(user.id)), 15);
    assert.equal((await spendGeneration(user.id)).length, 1);
    const stored = await getQuote(user.id, quote.id);
    assert.ok(stored?.status === 'confirmed' || stored?.status === 'completed');
    await assertLedgerInvariants(user.id);
  });

  it('two 15-coin quotes against balance 20 cannot overspend', async () => {
    const { user, project } = await seed('over');
    const bal = await getCoinBalance(user.id);
    if (bal > 20) await deductAmount(user.id, bal - 20, 'trim', { sourceType: 'admin' });
    assert.equal(await getCoinBalance(user.id), 20);
    setLogoTestHooks({ result: 'success' });
    const a = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const b = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const settled = await Promise.allSettled([confirmQuote(user.id, a.id), confirmQuote(user.id, b.id)]);
    const wins = settled.filter((s) => s.status === 'fulfilled').length;
    assert.ok(wins <= 1);
    const end = await getCoinBalance(user.id);
    assert.ok(end >= 0);
    assert.ok(end <= 20);
    assert.equal((await spendGeneration(user.id)).length, wins);
    await assertLedgerInvariants(user.id);
  });

  it('same debit idempotency key and same refund fire once', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@idemp.block-l.test`, 'idemp');
    const before = await getCoinBalance(user.id);
    const chargeId = `l-charge-${randomUUID()}`;
    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        withCoinCharge(
          user.id,
          CoinSpendCategory.LOGO_GENERATION,
          'idempotent debit',
          async () => ({ status: 'completed', id: `job-${chargeId}` }),
          { chargeId }
        )
      )
    );
    assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1);
    assert.equal(settled.filter((s) => s.status === 'rejected').length, 9);
    assert.equal(await getCoinBalance(user.id), before - 15);

    const refundChargeId = `l-refund-${randomUUID()}`;
    const chargedResult = await deductCoins(user.id, CoinSpendCategory.LOGO_GENERATION, 'refund-race', {
      idempotencyKey: `charge:${refundChargeId}`,
      persistCharge: {
        id: refundChargeId,
        category: CoinSpendCategory.LOGO_GENERATION,
        description: 'refund-race',
      },
    });
    assert.equal(chargedResult.success, true);
    const charged = await getBillableCharge(refundChargeId);
    assert.ok(charged);
    const afterDebit = await getCoinBalance(user.id);
    const refunded = await Promise.all(
      Array.from({ length: 10 }, () => refundBillableChargeOnce(charged, 'parallel refund'))
    );
    assert.equal(refunded.filter((r) => r.refunded && !r.duplicate).length, 1);
    assert.equal(await getCoinBalance(user.id), afterDebit + 15);
    assert.ok((await getCoinBalance(user.id)) <= before);
    await assertLedgerInvariants(user.id);
  });

  it('parallel provider/storage failure refunds stay single; file delete is idempotent', async () => {
    const { user, project } = await seed('race-fail');
    setLogoTestHooks({ result: 'fail' });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    const before = await getCoinBalance(user.id);
    await assert.rejects(() => confirmQuote(user.id, quote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const chargeRows = (await getTransactions(user.id)).filter((t) => t.sourceType === 'generation' && t.type === 'spend');
    assert.ok(chargeRows.length <= 1);
    if (chargeRows[0]?.sourceId) {
      const charge = await getBillableCharge(String(chargeRows[0].sourceId));
      if (charge) {
        const again = await Promise.all(
          Array.from({ length: 8 }, () => refundBillableChargeOnce(charge, 'failure-race'))
        );
        assert.ok(again.filter((r) => r.refunded && !r.duplicate).length <= 1);
      }
    }
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await refundsOf(user.id)).length, 1);

    const file = await saveUserFile(user.id, {
      name: 'race.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const deletes = await Promise.all(Array.from({ length: 8 }, () => deleteUserFile(file.id, user.id)));
    assert.equal(deletes.every(Boolean), true);
    assert.equal((await dsGet('files', file.id))?.deletionState, 'deleted');

    const live = await saveUserFile(user.id, {
      name: 'vs.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    await Promise.allSettled([issueFileDownloadUrl(live.id, user.id), deleteUserFile(live.id, user.id)]);
    assert.equal((await dsGet('files', live.id))?.deletionState, 'deleted');
    const afterDelete = await issueFileDownloadUrl(live.id, user.id).catch(() => null);
    assert.equal(afterDelete, null);
    await assertLedgerInvariants(user.id);
  });

  it('Creator DNA last-write-wins stays valid; chat budget is serialized', async () => {
    const { user } = await seed('dna-race');
    await Promise.all([
      upsertDna({ userId: user.id, name: 'Alpha', mascot: 'Wolf', styleDirection: 'neon', primaryColors: ['#111111'] }),
      upsertDna({ userId: user.id, name: 'Beta', mascot: 'Fox', styleDirection: 'clean', primaryColors: ['#222222'] }),
    ]);
    const dna = await getActiveDna(user.id);
    assert.ok(dna);
    assert.ok(dna.name === 'Alpha' || dna.name === 'Beta');
    assert.equal(typeof dna.name, 'string');
    assert.notEqual(dna.name, 'undefined');

    const uid = user.id;
    const slots = await Promise.all(Array.from({ length: 12 }, () => consumeNexterChatProviderSlot(uid)));
    assert.equal(slots.filter((s) => s.ok).length, 12);
    const more = await Promise.all(Array.from({ length: NEXTER_CHAT_MAX_PER_WINDOW }, () => consumeNexterChatProviderSlot(uid)));
    const okTotal = slots.filter((s) => s.ok).length + more.filter((s) => s.ok).length;
    assert.ok(okTotal <= NEXTER_CHAT_MAX_PER_WINDOW);
    const chats = await Promise.all(Array.from({ length: 6 }, () => nexterChat(user.id, 'Wie geht es dir?')));
    assert.equal(chats.length, 6);
    assert.equal(await getCoinBalance(user.id), 50);
    const conv = src('services/nexter/conversation.service.ts');
    assert.match(conv, /liveNexterChatInFlight/);
    assert.match(src('index.ts'), /express-rate-limit/);
    await assertLedgerInvariants(user.id);
  });

  it('OAuth replay, email dispatch retry, error leakage, and RBAC stay fail-closed', async () => {
    assert.match(repo('backend/src/services/oauth-invite-e2e.test.ts'), /oauth_error=replay/);
    let sends = 0;
    setTestEmailTransport(async () => {
      sends += 1;
      return { sent: true, provider: 'mock' };
    });
    const key = `welcome:l-${randomUUID()}`;
    const payload = { to: 'block-l@example.test', kind: 'welcome' as const, subject: 'Hi', text: 'Hi' };
    const results = await Promise.all(Array.from({ length: 8 }, () => dispatchTransactionalEmail(key, payload)));
    assert.equal(results.filter((r) => r.sent && !r.duplicate).length, 1);
    assert.equal(results.filter((r) => r.duplicate).length, 7);
    assert.ok(sends <= 2);
    const leaked = safeErrorDetails({
      stack: 'Error: boom\n    at firebase',
      privateKey: 'should-be-stripped',
      apiKey: 'should-be-stripped',
      message: 'ok',
    });
    assert.equal(leaked?.stack, undefined);
    assert.equal(leaked?.privateKey, undefined);
    assert.equal(leaked?.apiKey, undefined);
    assert.match(src('middleware/errorHandler.ts'), /Ein interner Fehler ist aufgetreten/);
    assert.match(src('routes/admin.routes.ts'), /requireRole\(UserRole\.ADMIN, UserRole\.SUPER_ADMIN\)/);
    const mutex = src('lib/dev-mutex.ts');
    assert.match(mutex, /Process-local mutex/);
    assert.match(src('lib/provider-gate.ts'), /withDevLock\(`nexter-chat-budget:/);
  });
});

describe('Block L — closed-block regression freeze', () => {
  it('keeps Blocks A–K and M in the isolated suite', () => {
    const pkg = repo('backend/package.json');
    for (const file of [
      'image-generation-e2e.test.ts',
      'video-quote-e2e.test.ts',
      'music-quote-e2e.test.ts',
      'legal-operator-e2e.test.ts',
      'oauth-invite-e2e.test.ts',
      'email-production-e2e.test.ts',
      'storage-lifecycle-e2e.test.ts',
      'firestore-id-nan-e2e.test.ts',
      'nexter-branding-e2e.test.ts',
      'railway-config-e2e.test.ts',
      'nexter-tts-e2e.test.ts',
      'nexter-orphans-e2e.test.ts',
      'nexter-live-e2e.test.ts',
    ]) {
      assert.match(pkg, new RegExp(file.replace(/\./g, '\\.')));
    }
    assert.doesNotMatch(repo('frontend/src/components/nexter/NexterPanel.tsx'), /\bUCBS\b|\bNexa\b/);
    assert.match(src('lib/firebase-storage.ts'), /ignoreNotFound: true/);
  });
});
