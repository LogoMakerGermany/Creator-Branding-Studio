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
  STREAMSET_PACK_ITEMS,
  coinCostForStreamsetSelection,
  refundSharesForSelection,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { getJobsByUser } from './ai.service.js';
import { deductAmount, getCoinBalance, getTransactions, refundOnce } from './coins.service.js';
import { dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { confirmQuote, confirmStreamsetQuote, quoteStreamsetDraft } from './nexter/quotes.service.js';
import {
  executeQuotedStreamset,
  generateStreamsetPack,
  getStreamsetStatus,
  previewStreamsetDraft,
  setStreamsetTestHooks,
} from './streamset.service.js';
import type { CoinTransaction } from '@ucbs/shared';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

const SELECTED = ['facecam', 'twitch-banner', 'starting-soon'] as const;

afterEach(() => {
  setStreamsetTestHooks(null);
});

async function seedCreator(label: string) {
  const id = randomUUID();
  const user = await getOrCreateUser(id, `${label}@streamset-confirm.test`, label);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF', '#111827'],
    accentColors: ['#22D3EE'],
    brandingStyle: 'esports',
    visualLanguage: 'sharp neon edges',
    fonts: [{ name: 'Orbitron', role: 'primary', source: 'google' }],
  });
  const project = await createProject(user.id, {
    name: 'NightWolf Stream',
    type: 'streamset',
    dnaId: dna.id,
  });
  return { user, dna, project };
}

async function quoteSelection(userId: string, projectId: string, keys: string[] = [...SELECTED]) {
  const draft = await previewStreamsetDraft(userId, {
    projectId,
    platform: 'twitch',
    selectedKeys: keys,
    creatorName: 'NightWolf',
    includeCreatorName: true,
  });
  return quoteStreamsetDraft(userId, draft.id);
}

function txsOf(rows: Awaited<ReturnType<typeof getTransactions>>, type: CoinTransaction['type'], quoteId?: string) {
  return (rows as CoinTransaction[]).filter(
    (tx) => tx.type === type && (!quoteId || tx.quoteId === quoteId)
  );
}

describe('streamset quote confirm + selective generation', () => {
  it('1. own pending quote can be confirmed', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('own');
    const quote = await quoteSelection(user.id, project.id);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    assert.equal(result.quote.status, 'completed');
    assert.equal(result.jobs.length, SELECTED.length);
    assert.equal(result.batchStatus, 'completed');
    assert.equal(result.coinsSpent, coinCostForStreamsetSelection([...SELECTED]).total);
  });

  it('2. foreign quote is rejected', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const a = await seedCreator('own-a');
    const b = await seedCreator('own-b');
    const quote = await quoteSelection(a.user.id, a.project.id);
    const before = await getCoinBalance(b.user.id);
    await assert.rejects(() => confirmStreamsetQuote(b.user.id, quote.id), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'QUOTE_NOT_FOUND');
      return true;
    });
    assert.equal(await getCoinBalance(b.user.id), before);
    assert.equal((await getJobsByUser(b.user.id)).length, 0);
  });

  it('3. expired quote is rejected', async () => {
    const { user, project } = await seedCreator('exp');
    const quote = await quoteSelection(user.id, project.id);
    const beforeCoins = await getCoinBalance(user.id);
    const beforeJobs = (await getJobsByUser(user.id)).length;
    await dsSet('nexterQuotes', quote.id, {
      ...quote,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await assert.rejects(() => confirmStreamsetQuote(user.id, quote.id), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, 'QUOTE_EXPIRED');
      assert.equal(err.statusCode, 410);
      return true;
    });
    assert.equal(await getCoinBalance(user.id), beforeCoins);
    assert.equal((await getJobsByUser(user.id)).length, beforeJobs);
  });

  it('4. manipulated client costs have no effect', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('tamper');
    const quote = await quoteSelection(user.id, project.id);
    const before = await getCoinBalance(user.id);
    await assert.rejects(
      () =>
        executeQuotedStreamset(user.id, {
          quoteId: quote.id,
          projectId: project.id,
          selectedKeys: [...SELECTED],
          expectedCost: 1,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ServiceError);
        assert.equal(err.code, 'PRICE_CHANGED');
        return true;
      }
    );
    assert.equal(await getCoinBalance(user.id), before);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    assert.equal(result.coinsSpent, quote.coinCost);
    assert.equal(result.coinsSpent !== 1, true);
  });

  it('5. price change requires a new confirmation', async () => {
    const { user, project } = await seedCreator('price');
    const quote = await quoteSelection(user.id, project.id);
    const before = await getCoinBalance(user.id);
    await dsSet('nexterQuotes', quote.id, { ...quote, coinCost: quote.coinCost + 7 });
    await assert.rejects(() => confirmStreamsetQuote(user.id, quote.id), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, 'PRICE_CHANGED');
      assert.equal(err.details?.currentCost, quote.coinCost);
      return true;
    });
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal((await getJobsByUser(user.id)).length, 0);
    const stored = await quoteStreamsetDraft(user.id, (await previewStreamsetDraft(user.id, {
      projectId: project.id,
      selectedKeys: [...SELECTED],
    })).id);
    assert.equal(stored.status, 'pending');
  });

  it('6-7. insufficient coins → 0 charges and 0 jobs', async () => {
    const { user, project } = await seedCreator('poor');
    const quote = await quoteSelection(user.id, project.id);
    const bal = await getCoinBalance(user.id);
    if (bal > 0) {
      await deductAmount(user.id, bal, 'drain', { sourceType: 'admin', idempotencyKey: `drain:${user.id}` });
    }
    assert.equal(await getCoinBalance(user.id), 0);
    await assert.rejects(() => confirmStreamsetQuote(user.id, quote.id), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, 'INSUFFICIENT_COINS');
      assert.equal(err.statusCode, 402);
      return true;
    });
    const txs = await getTransactions(user.id, 50);
    assert.equal(txsOf(txs, 'spend', quote.id).length, 0);
    assert.equal((await getJobsByUser(user.id)).filter((j) => j.batchId === quote.id).length, 0);
  });

  it('8. successful confirm charges exactly once', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('once');
    const quote = await quoteSelection(user.id, project.id);
    const before = await getCoinBalance(user.id);
    await confirmStreamsetQuote(user.id, quote.id);
    const txs = await getTransactions(user.id, 50);
    assert.equal(txsOf(txs, 'spend', quote.id).length, 1);
    assert.equal(await getCoinBalance(user.id), before - quote.coinCost);
  });

  it('9. double click charges exactly once', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('dbl');
    const quote = await quoteSelection(user.id, project.id);
    const first = await confirmStreamsetQuote(user.id, quote.id);
    const second = await confirmStreamsetQuote(user.id, quote.id);
    assert.deepEqual(second.jobIds.slice().sort(), first.jobIds.slice().sort());
    const txs = await getTransactions(user.id, 50);
    assert.equal(txsOf(txs, 'spend', quote.id).length, 1);
  });

  it('10. parallel confirm charges exactly once', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('race');
    const quote = await quoteSelection(user.id, project.id);
    const [a, b] = await Promise.all([
      confirmStreamsetQuote(user.id, quote.id),
      confirmStreamsetQuote(user.id, quote.id),
    ]);
    assert.equal(a.coinsSpent, b.coinsSpent);
    const txs = await getTransactions(user.id, 50);
    assert.equal(txsOf(txs, 'spend', quote.id).length, 1);
    const children = (await getJobsByUser(user.id)).filter((j) => j.batchId === quote.id && j.module !== 'streamset');
    assert.equal(children.length, SELECTED.length);
  });

  it('11. confirmed quote cannot start another paid run', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('replay');
    const quote = await quoteSelection(user.id, project.id);
    await confirmStreamsetQuote(user.id, quote.id);
    await confirmQuote(user.id, quote.id);
    const txs = await getTransactions(user.id, 50);
    assert.equal(txsOf(txs, 'spend', quote.id).length, 1);
  });

  it('12-13. only selected assets start and unselected cost 0', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('sel');
    const quote = await quoteSelection(user.id, project.id);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    const keys = result.jobs.map((j) => j.assetKey).sort();
    assert.deepEqual(keys, [...SELECTED].sort());
    assert.equal(result.jobs.some((j) => j.assetKey === 'hud' || j.assetKey === 'brb'), false);
    assert.equal(result.coinsSpent, coinCostForStreamsetSelection([...SELECTED]).total);
    assert.ok(result.coinsSpent < STREAMSET_PACK_COIN_COST || SELECTED.length === STREAMSET_PACK_ITEMS.length);
  });

  it('14. DNA context is copied onto child jobs', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project, dna } = await seedCreator('dna');
    const quote = await quoteSelection(user.id, project.id);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    for (const job of result.jobs) {
      assert.equal(job.dnaId, dna.id);
      assert.match(job.prompt, /NightWolf|Cyber-Wolf|#1E40AF|neon/i);
      assert.match(job.prompt, /twitch/i);
    }
  });

  it('15. asset prompts stay asset-specific', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('prompt');
    const quote = await quoteSelection(user.id, project.id);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    const facecam = result.jobs.find((j) => j.assetKey === 'facecam')!;
    const start = result.jobs.find((j) => j.assetKey === 'starting-soon')!;
    const banner = result.jobs.find((j) => j.assetKey === 'twitch-banner')!;
    assert.notEqual(facecam.prompt, start.prompt);
    assert.notEqual(facecam.prompt, banner.prompt);
    assert.match(facecam.prompt, /facecam|transparent/i);
    assert.match(start.prompt, /starting soon|full-bleed|opaque/i);
    assert.match(banner.prompt, /banner|horizontal/i);
  });

  it('16. child jobs belong to the quote owner', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('kids');
    const quote = await quoteSelection(user.id, project.id);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    assert.ok(result.batch);
    for (const job of result.jobs) {
      assert.equal(job.userId, user.id);
      assert.equal(job.batchId, result.batch?.id);
      assert.equal(job.parentJobId, result.batch?.id);
    }
  });

  it('17. foreign jobs stay protected', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const a = await seedCreator('job-a');
    const b = await seedCreator('job-b');
    const quote = await quoteSelection(a.user.id, a.project.id);
    const result = await confirmStreamsetQuote(a.user.id, quote.id);
    const bJobs = await getJobsByUser(b.user.id);
    assert.equal(bJobs.some((j) => result.jobIds.includes(j.id)), false);
    const bStatus = await getStreamsetStatus(b.user.id, b.project.id);
    assert.equal(bStatus.latestBatch?.id === result.batch?.id, false);
    assert.equal(
      bStatus.assets.filter((asset) => result.jobs.some((j) => j.assetKey === asset.key && asset.present)).length,
      0
    );
  });

  it('18. partial failure is not full success', async () => {
    setStreamsetTestHooks({
      results: { facecam: 'completed', 'twitch-banner': 'completed', 'starting-soon': 'failed' },
    });
    const { user, project } = await seedCreator('partial');
    const quote = await quoteSelection(user.id, project.id);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    assert.equal(result.batchStatus, 'partial');
    assert.equal(result.quote.status, 'confirmed');
    assert.equal(result.batch?.status, 'partial');
    assert.equal(result.jobs.filter((j) => j.status === 'completed').length, 2);
    assert.equal(result.jobs.filter((j) => j.status === 'failed').length, 1);
  });

  it('19. single asset failure refunds that asset only', async () => {
    setStreamsetTestHooks({
      results: { facecam: 'completed', 'twitch-banner': 'completed', 'starting-soon': 'failed' },
    });
    const { user, project } = await seedCreator('onefail');
    const quote = await quoteSelection(user.id, project.id);
    const before = await getCoinBalance(user.id);
    const pricing = coinCostForStreamsetSelection([...SELECTED]);
    const shares = refundSharesForSelection(pricing.itemCosts, pricing.total);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    assert.equal(result.refundedCoins, shares['starting-soon']);
    assert.equal(await getCoinBalance(user.id), before - pricing.total + shares['starting-soon']);
  });

  it('20. refund happens exactly once', async () => {
    setStreamsetTestHooks({
      results: { facecam: 'completed', 'twitch-banner': 'completed', 'starting-soon': 'failed' },
    });
    const { user, project } = await seedCreator('ref1');
    const quote = await quoteSelection(user.id, project.id);
    const first = await confirmStreamsetQuote(user.id, quote.id);
    const second = await confirmStreamsetQuote(user.id, quote.id);
    assert.equal(second.refundedCoins, first.refundedCoins);
    const failed = first.jobs.find((j) => j.status === 'failed')!;
    const spend = txsOf(await getTransactions(user.id, 50), 'spend', quote.id)[0];
    await refundOnce({
      userId: user.id,
      chargeTransactionId: spend.id,
      amount: first.refundedCoins || 1,
      description: 'dup',
      quoteId: quote.id,
      jobId: failed.id,
      idempotencyKey: `refund:streamset:${quote.id}:starting-soon`,
    });
    assert.equal(txsOf(await getTransactions(user.id, 50), 'refund', quote.id).length, 1);
  });

  it('21. full failure refunds the charged amount', async () => {
    setStreamsetTestHooks({ defaultResult: 'failed' });
    const { user, project } = await seedCreator('full');
    const quote = await quoteSelection(user.id, project.id);
    const before = await getCoinBalance(user.id);
    const result = await confirmStreamsetQuote(user.id, quote.id);
    assert.equal(result.batchStatus, 'failed');
    assert.equal(result.refundedCoins, quote.coinCost);
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('22. job-creation failure compensates coins', async () => {
    setStreamsetTestHooks({ throwOnCreate: true });
    const { user, project } = await seedCreator('createfail');
    const quote = await quoteSelection(user.id, project.id);
    const before = await getCoinBalance(user.id);
    await assert.rejects(() => confirmStreamsetQuote(user.id, quote.id), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, 'AI_GENERATION_FAILED');
      return true;
    });
    assert.equal(await getCoinBalance(user.id), before);
    const children = (await getJobsByUser(user.id)).filter((j) => j.batchId === quote.id && j.module !== 'streamset');
    assert.equal(children.length, 0);
    assert.equal(txsOf(await getTransactions(user.id, 50), 'spend', quote.id).length, 1);
    assert.equal(txsOf(await getTransactions(user.id, 50), 'refund', quote.id).length, 1);
  });

  it('23. retry does not charge a second time', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project } = await seedCreator('retry-c');
    const quote = await quoteSelection(user.id, project.id);
    await confirmStreamsetQuote(user.id, quote.id);
    await confirmStreamsetQuote(user.id, quote.id);
    assert.equal(txsOf(await getTransactions(user.id, 50), 'spend', quote.id).length, 1);
  });

  it('24. retry does not refund a second time', async () => {
    setStreamsetTestHooks({ defaultResult: 'failed' });
    const { user, project } = await seedCreator('retry-r');
    const quote = await quoteSelection(user.id, project.id);
    await confirmStreamsetQuote(user.id, quote.id);
    await confirmStreamsetQuote(user.id, quote.id);
    await executeQuotedStreamset(user.id, {
      quoteId: quote.id,
      projectId: project.id,
      selectedKeys: [...SELECTED],
      expectedCost: quote.coinCost,
    });
    assert.equal(txsOf(await getTransactions(user.id, 50), 'refund', quote.id).length, SELECTED.length);
  });

  it('25. provider calls during tests = 0', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    const image = src('ai.service.ts').split('export async function generateImage')[1]?.split('export async function')[0] ?? '';
    assert.match(image, /isPaidProviderTestBlocked/);
    const streamset = src('streamset.service.ts');
    assert.equal(streamset.includes('api.openai.com'), false);
    assert.equal(streamset.includes('api.replicate.com'), false);
    assert.match(streamset, /setStreamsetTestHooks/);
  });

  it('26. payment calls during tests = 0', async () => {
    assert.equal(arePaymentsEnabled(), false);
    const confirmSrc = src('nexter/quotes.service.ts');
    assert.equal(confirmSrc.includes('stripe'), false);
    assert.equal(confirmSrc.includes('paypal'), false);
    const streamset = src('streamset.service.ts');
    assert.equal(streamset.includes('stripe'), false);
    assert.equal(streamset.includes('paypal'), false);
  });

  it('legacy pack uses the same executor and refunds a full failure', async () => {
    setStreamsetTestHooks({ defaultResult: 'failed' });
    const { user, project } = await seedCreator('pack');
    const before = await getCoinBalance(user.id);
    assert.ok(before >= STREAMSET_PACK_COIN_COST);
    await assert.rejects(() => generateStreamsetPack(user.id, project.id), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, 'AI_GENERATION_FAILED');
      return true;
    });
    assert.equal(await getCoinBalance(user.id), before);
    assert.match(src('streamset.service.ts').split('export async function generateStreamsetPack')[1] ?? '', /executeQuotedStreamset/);
    assert.equal(COIN_COSTS[CoinSpendCategory.STREAMSET_PACK], 50);
  });
});
