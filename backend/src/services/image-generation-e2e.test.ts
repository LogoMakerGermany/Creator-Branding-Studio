import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_THREE_PART_COIN_COST,
  STREAMSET_THREE_PART_SLOT_IDS,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions, addCoins } from './coins.service.js';
import { getUserFile, setSaveGeneratedAssetTestHooks } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { dsSet } from '../lib/data-store.js';
import { isPaidProviderTestBlocked, IMAGE_GENERATION_UNAVAILABLE_CODE, IMAGE_GENERATION_UNAVAILABLE_MESSAGE } from '../lib/media-providers.js';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import { isSafeAssetUrl } from '../lib/upload-validation.js';
import { setLogoTestHooks } from './logo.service.js';
import { downloadLogo, generateLogoAsset, getLogo } from './logo.service.js';
import { createQuote, confirmQuote, quoteStreamsetDraft, confirmStreamsetQuote } from './nexter/quotes.service.js';
import { previewStreamsetDraft, setStreamsetTestHooks } from './streamset.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

function frontend(rel: string): string {
  return readFileSync(join(dir, '../../../frontend/src', rel), 'utf8');
}

afterEach(() => {
  setLogoTestHooks(null);
  setStreamsetTestHooks(null);
  setSaveGeneratedAssetTestHooks(null);
});

async function seed(tag: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.img-e2e.test`, tag);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
  });
  const project = await createProject(user.id, { name: 'Image E2E', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

function spendCount(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'spend').length);
}

function refundCount(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'refund').length);
}

describe('Block A — paid image generation E2E + kill-switch safety', () => {
  it('preserves welcome 50, logo 15, streamset 75/200, and never reactivates 135', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(arePaymentsEnabled(), false);
    const coins = readFileSync(join(dir, '../../../shared/src/coins.ts'), 'utf8');
    assert.match(coins, /Obsolete 135 must not be reused/);
    assert.equal(Object.values(COIN_COSTS).includes(135), false);
  });

  it('never silently falls back to production mock images', () => {
    const ai = src('./ai.service.ts');
    assert.match(ai, /logoTestHooks/);
    assert.match(ai, /LOGO_MOCK_PNG/);
    assert.doesNotMatch(ai, /!liveOpenAiImages/);
    assert.match(ai, /throwImageProviderUnavailableAfterDebit/);
    assert.equal(isPaidProviderTestBlocked(), true);
  });

  it('1-2 provider disabled/missing stops before debit with a safe user message', async () => {
    const { user, project } = await seed('disabled');
    assert.equal(await getCoinBalance(user.id), 50);
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === IMAGE_GENERATION_UNAVAILABLE_CODE &&
        err.message === IMAGE_GENERATION_UNAVAILABLE_MESSAGE
    );
    assert.equal(await getCoinBalance(user.id), 50);
    assert.equal(await spendCount(user.id), 0);
    await assert.rejects(
      () => generateLogoAsset(user.id, project.id, { name: 'NightWolf' }),
      (err: unknown) => err instanceof ServiceError && err.code === IMAGE_GENERATION_UNAVAILABLE_CODE
    );
    assert.equal(await getCoinBalance(user.id), 50);
    for (const kind of ['banner', 'facecam', 'overlay', 'sticker'] as const) {
      const q = await createQuote(user.id, kind, project.id);
      const before = await getCoinBalance(user.id);
      await assert.rejects(
        () => confirmQuote(user.id, q.id),
        (err: unknown) => err instanceof ServiceError && err.code === IMAGE_GENERATION_UNAVAILABLE_CODE
      );
      assert.equal(await getCoinBalance(user.id), before);
    }
  });

  it('3 insufficient balance never calls a provider and never debits', async () => {
    const { user, project } = await seed('poor');
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal(await getCoinBalance(user.id), 0);
    assert.equal(await spendCount(user.id), 1);
    assert.equal((await getTransactions(user.id)).filter((t) => t.sourceType === 'generation').length, 0);
  });

  it('4-5 expired and wrong-user quotes never debit', async () => {
    const a = await seed('owner');
    const b = await seed('other');
    const expired = await createQuote(a.user.id, 'logo', a.project.id, { logoName: 'NightWolf' });
    await dsSet('nexterQuotes', expired.id, {
      ...expired,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const beforeA = await getCoinBalance(a.user.id);
    await assert.rejects(
      () => confirmQuote(a.user.id, expired.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'QUOTE_EXPIRED'
    );
    assert.equal(await getCoinBalance(a.user.id), beforeA);

    const quote = await createQuote(a.user.id, 'logo', a.project.id, { logoName: 'NightWolf' });
    const beforeB = await getCoinBalance(b.user.id);
    await assert.rejects(
      () => confirmQuote(b.user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'QUOTE_NOT_FOUND'
    );
    assert.equal(await getCoinBalance(a.user.id), beforeA);
    assert.equal(await getCoinBalance(b.user.id), beforeB);
  });

  it('6-7 duplicate confirmation and double click debit once', async () => {
    const { user, project } = await seed('dup');
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const before = await getCoinBalance(user.id);
    const [first, second] = await Promise.all([
      confirmQuote(user.id, quote.id),
      confirmQuote(user.id, quote.id),
    ]);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    assert.equal(before - (await getCoinBalance(user.id)), 15);
    const third = await confirmQuote(user.id, quote.id);
    assert.equal(third.jobIds[0], first.jobIds[0]);
    assert.equal(before - (await getCoinBalance(user.id)), 15);
    assert.equal((await getTransactions(user.id)).filter((t) => t.type === 'spend' && t.sourceType === 'generation').length, 1);
  });

  it('8-10 provider timeout, HTTP failure, and invalid payload after debit refund exactly once', async () => {
    for (const result of ['timeout', 'http', 'invalid'] as const) {
      const { user, project } = await seed(`fail-${result}`);
      setLogoTestHooks({ result });
      const before = await getCoinBalance(user.id);
      const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
      await assert.rejects(() => confirmQuote(user.id, quote.id));
      assert.equal(await getCoinBalance(user.id), before);
      assert.equal(await refundCount(user.id), 1);
      await assert.rejects(() => confirmQuote(user.id, quote.id));
      assert.equal(await getCoinBalance(user.id), before);
      assert.ok((await refundCount(user.id)) >= 1);
    }
  });

  it('11 storage failure after provider result refunds exactly once', async () => {
    const { user, project } = await seed('storage');
    setLogoTestHooks({ result: 'success' });
    setSaveGeneratedAssetTestHooks({ fail: true });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) =>
        err instanceof ServiceError && (err.code === 'STORAGE_ERROR' || err.code === 'AI_GENERATION_FAILED')
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
  });

  it('12-13 persistence stays charge-safe; mocked success is one debit, one owned downloadable result', async () => {
    const { user, project } = await seed('ok');
    setLogoTestHooks({ result: 'success' });
    assert.equal(await getCoinBalance(user.id), 50);
    const quote = await createQuote(user.id, 'logo', project.id, {
      logoName: 'NightWolf',
      width: 400,
      height: 400,
    });
    assert.equal(quote.coinCost, 15);
    assert.equal(await getCoinBalance(user.id), 50);
    const result = await confirmQuote(user.id, quote.id);
    assert.equal(await getCoinBalance(user.id), 35);
    assert.equal(result.coinsSpent, 15);
    assert.equal(result.jobIds.length, 1);
    const job = await getLogo(result.jobIds[0]!, user.id);
    assert.equal(job?.userId, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.quoteId, quote.id);
    assert.ok(job?.fileId);
    const file = await getUserFile(String(job.fileId), user.id);
    assert.ok(file);
    assert.equal(file?.userId, user.id);
    assert.equal(file?.source, 'generation');
    const dl = await downloadLogo(job.id, user.id);
    assert.ok(dl.downloadUrl);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@img-e2e-other.test`, 'Other');
    assert.equal(await getLogo(job.id, other.id), null);
    await assert.rejects(() => downloadLogo(job.id, other.id));
    assert.equal(await refundCount(user.id), 0);
  });

  it('streamset package: unavailable is 0 debit; mocked pack is one debit with per-asset refunds', async () => {
    const blocked = await seed('ss-block');
    await addCoins(blocked.user.id, 250, 'test-topup', 'bonus', { sourceType: 'admin' });
    const draft = await previewStreamsetDraft(blocked.user.id, {
      projectId: blocked.project.id,
      platform: 'twitch',
      selectedSlotIds: [...STREAMSET_THREE_PART_SLOT_IDS],
      creatorName: 'NightWolf',
      includeCreatorName: true,
    });
    const quote = await quoteStreamsetDraft(blocked.user.id, draft.id);
    assert.equal(quote.coinCost, 75);
    const before = await getCoinBalance(blocked.user.id);
    await assert.rejects(
      () => confirmStreamsetQuote(blocked.user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === IMAGE_GENERATION_UNAVAILABLE_CODE
    );
    assert.equal(await getCoinBalance(blocked.user.id), before);

    const pack = await seed('ss-pack');
    await addCoins(pack.user.id, 250, 'test-topup', 'bonus', { sourceType: 'admin' });
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const packDraft = await previewStreamsetDraft(pack.user.id, {
      projectId: pack.project.id,
      platform: 'twitch',
      selectedSlotIds: [...STREAMSET_THREE_PART_SLOT_IDS],
      creatorName: 'NightWolf',
      includeCreatorName: true,
    });
    const packQuote = await quoteStreamsetDraft(pack.user.id, packDraft.id);
    const packBefore = await getCoinBalance(pack.user.id);
    const done = await confirmStreamsetQuote(pack.user.id, packQuote.id);
    assert.equal(done.batchStatus, 'completed');
    assert.equal(packBefore - done.newBalance, 75);
    assert.equal(done.refundedCoins, 0);

    const partial = await seed('ss-partial');
    await addCoins(partial.user.id, 250, 'test-topup', 'bonus', { sourceType: 'admin' });
    setStreamsetTestHooks({
      defaultResult: 'completed',
      results: { facecam: 'failed' },
    });
    const partDraft = await previewStreamsetDraft(partial.user.id, {
      projectId: partial.project.id,
      platform: 'twitch',
      selectedSlotIds: [...STREAMSET_THREE_PART_SLOT_IDS],
      creatorName: 'NightWolf',
      includeCreatorName: true,
    });
    const partQuote = await quoteStreamsetDraft(partial.user.id, partDraft.id);
    const partBefore = await getCoinBalance(partial.user.id);
    const part = await confirmStreamsetQuote(partial.user.id, partQuote.id);
    assert.ok(part.refundedCoins > 0);
    assert.ok(part.refundedCoins < 75);
    assert.equal(partBefore - part.newBalance, 75 - part.refundedCoins);
    assert.equal(await refundCount(partial.user.id), 1);
  });

  it('maps image errors without ENV names and keeps server-authoritative quote price', () => {
    const providers = src('../lib/media-providers.ts');
    assert.match(providers, /IMAGE_GENERATION_UNAVAILABLE/);
    assert.match(providers, /Es wurden keine Coins abgebucht/);
    assert.doesNotMatch(providers, /Bild-Generierung benötigt OPENAI_API_KEY/);
    const api = frontend('services/api.ts');
    assert.match(api, /IMAGE_GENERATION_UNAVAILABLE/);
    assert.match(api, /PROVIDER_TIMEOUT/);
    assert.match(api, /STORAGE_ERROR/);
    assert.doesNotMatch(api, /OPENAI_API_KEY/);
    const nexter = src('../routes/nexter.routes.ts');
    assert.match(nexter, /IMAGE_GENERATION_UNAVAILABLE/);
    const quotes = src('./nexter/quotes.service.ts');
    assert.match(quotes, /serverCost = coinCostForKind\('logo'\)/);
    const streamset = src('./streamset.service.ts');
    assert.match(streamset, /Live image provider/);
    assert.match(streamset, /requireImageProvider\(\)/);
    assert.ok(streamset.indexOf('requireImageProvider()') < streamset.indexOf('deductAmount('));
    const hint = frontend('components/studio/StudioBanners.tsx');
    assert.match(hint, /image-generation-unavailable-hint/);
    assert.equal(isSafeAssetUrl('javascript:alert(1)'), false);
    assert.equal(isSafeAssetUrl('http://example.com/x.png'), false);
    assert.equal(isSafeAssetUrl('https://cdn.openai.com/x.png'), true);
    assert.equal(isSafeAssetUrl('data:image/png;base64,aaa'), true);
  });
});
