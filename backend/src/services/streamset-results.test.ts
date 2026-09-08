import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_COSTS, CoinSpendCategory, streamsetDownloadBasename } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { getActiveDna, upsertDna } from './dna.service.js';
import { createProject, softDeleteProject } from './project.service.js';
import { getJob, getJobsByUser, saveJob } from './ai.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { parseZipArchive } from '../lib/zip-store.js';
import {
  confirmStreamsetQuote,
  quoteStreamsetDraft,
  quoteStreamsetRetry,
} from './nexter/quotes.service.js';
import {
  exportStreamsetZip,
  getStreamsetStatus,
  inspectStreamsetRetry,
  previewStreamsetDraft,
  runTechnicalStreamsetRetry,
  setStreamsetTestHooks,
} from './streamset.service.js';
import {
  getUserFile,
  issueFileDownloadUrl,
  mintDownloadUrlForOwnedFile,
} from './file-cloud.service.js';
import { getOwnedJobForChange, getVersionsForJob, changeModuleToQuoteKind } from './change-request.service.js';
import type { CoinTransaction } from '@ucbs/shared';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setStreamsetTestHooks(null);
});

async function seedCreator(label: string) {
  const id = randomUUID();
  const user = await getOrCreateUser(id, `${label}@streamset-results.test`, label);
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

async function confirmSelection(
  userId: string,
  projectId: string,
  keys: string[],
  hooks?: Parameters<typeof setStreamsetTestHooks>[0]
) {
  if (hooks) setStreamsetTestHooks(hooks);
  else setStreamsetTestHooks({ defaultResult: 'completed' });
  const draft = await previewStreamsetDraft(userId, {
    projectId,
    platform: 'twitch',
    selectedKeys: keys,
    creatorName: 'NightWolf',
  });
  const quote = await quoteStreamsetDraft(userId, draft.id);
  const result = await confirmStreamsetQuote(userId, quote.id);
  return { quote, result };
}

describe('streamset per-asset retry + result delivery', () => {
  it('successful child jobs persist owned file results', async () => {
    const { user, project } = await seedCreator('persist');
    const { result } = await confirmSelection(user.id, project.id, ['facecam']);
    const job = result.jobs[0];
    assert.equal(job.userId, user.id);
    assert.ok(job.fileId);
    const file = await getUserFile(job.fileId!, user.id);
    assert.ok(file);
    assert.equal(file.userId, user.id);
    assert.equal(file.sourceJobId, job.id);
    assert.ok(file.storagePath?.startsWith(`users/${user.id}/`));
    const issued = await issueFileDownloadUrl(file.id, user.id);
    assert.ok(issued?.downloadUrl);
    assert.equal(issued?.file.storagePath, undefined);
  });

  it('foreign result, download, and retry are blocked', async () => {
    const a = await seedCreator('own');
    const b = await seedCreator('spy');
    const { result } = await confirmSelection(a.user.id, a.project.id, ['facecam']);
    const fileId = result.jobs[0].fileId!;
    assert.equal(await getUserFile(fileId, b.user.id), null);
    assert.equal(await issueFileDownloadUrl(fileId, b.user.id), null);
    const bStatus = await getStreamsetStatus(b.user.id, b.project.id);
    assert.equal(bStatus.latestBatch?.id === result.batch.id, false);
    await assert.rejects(
      () => inspectStreamsetRetry(b.user.id, result.batch.id, 'facecam'),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
  });

  it('preview and download use file-id ownership, not a client storagePath', async () => {
    const routes = src('../routes/streamset.routes.ts');
    assert.equal(routes.includes('storagePath'), false);
    const page = readFileSync(join(dir, '../../../frontend/src/pages/studios/StreamsetStudioPage.tsx'), 'utf8');
    assert.match(page, /api\.files\.downloadUrl/);
    assert.doesNotMatch(page, /storagePath/);
    const { user, project } = await seedCreator('dl');
    const { result } = await confirmSelection(user.id, project.id, ['facecam']);
    const first = await issueFileDownloadUrl(result.jobs[0].fileId!, user.id);
    const second = await issueFileDownloadUrl(result.jobs[0].fileId!, user.id);
    assert.ok(first && second);
    assert.ok(Date.parse(second.expiresAt) >= Date.parse(first.expiresAt));
  });

  it('missing storage file is a clean error, not a signed leak', async () => {
    const { user } = await seedCreator('miss');
    const id = randomUUID();
    await dsSet('files', id, {
      id,
      userId: user.id,
      name: 'gone.png',
      mimeType: 'image/png',
      size: 1,
      category: 'overlay',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => issueFileDownloadUrl(id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'FILE_MISSING' && err.statusCode === 410
    );
    const minted = await mintDownloadUrlForOwnedFile(user.id, (await getUserFile(id, user.id))!);
    assert.equal(minted, null);
  });

  it('technical retry regenerates only the failed asset without a new charge', async () => {
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const { user, project, dna } = await seedCreator('tech');
    const now = new Date().toISOString();
    const batchId = randomUUID();
    await saveJob({
      id: batchId,
      userId: user.id,
      module: 'streamset',
      status: 'partial',
      prompt: 'batch',
      dnaId: dna.id,
      assetKey: 'streamset',
      projectId: project.id,
      batchId,
      createdAt: now,
    });
    const okId = randomUUID();
    await saveJob({
      id: okId,
      userId: user.id,
      module: 'facecam',
      status: 'completed',
      prompt: 'ok facecam',
      imageUrl: PIXEL,
      dnaId: dna.id,
      assetKey: 'facecam',
      projectId: project.id,
      batchId,
      parentJobId: batchId,
      createdAt: now,
      completedAt: now,
    });
    const failId = randomUUID();
    await saveJob({
      id: failId,
      userId: user.id,
      module: 'banner',
      status: 'failed',
      prompt: 'fail banner',
      dnaId: dna.id,
      assetKey: 'twitch-banner',
      projectId: project.id,
      batchId,
      parentJobId: batchId,
      createdAt: now,
      completedAt: now,
      error: 'provider down',
    });
    const beforeCoins = await getCoinBalance(user.id);
    const beforeOk = await getJob(okId);
    const inspected = await inspectStreamsetRetry(user.id, batchId, 'twitch-banner');
    assert.equal(inspected.policy, 'technical');
    const [first, second] = await Promise.all([
      runTechnicalStreamsetRetry(user.id, batchId, 'twitch-banner'),
      runTechnicalStreamsetRetry(user.id, batchId, 'twitch-banner'),
    ]);
    assert.equal(first.charged, false);
    assert.equal(second.job.id, first.job.id);
    assert.equal(await getCoinBalance(user.id), beforeCoins);
    const afterOk = await getJob(okId);
    assert.equal(afterOk?.imageUrl, beforeOk?.imageUrl);
    const banners = (await getJobsByUser(user.id)).filter((j) => j.batchId === batchId && j.assetKey === 'twitch-banner');
    assert.equal(banners.filter((j) => j.status === 'completed').length, 1);
    assert.equal(banners.some((j) => j.id === failId), true);
  });

  it('refunded failed asset requires a paid quote; confirm is not a free exploit', async () => {
    const { user, project } = await seedCreator('paid');
    const { quote, result } = await confirmSelection(user.id, project.id, ['facecam', 'twitch-banner'], {
      results: { facecam: 'completed', 'twitch-banner': 'failed' },
    });
    const before = await getCoinBalance(user.id);
    const inspected = await inspectStreamsetRetry(user.id, result.batch.id, 'twitch-banner');
    assert.equal(inspected.policy, 'paid_quote');
    const retryQuote = await quoteStreamsetRetry(user.id, result.batch.id, 'twitch-banner');
    assert.equal(retryQuote.coinCost, COIN_COSTS[CoinSpendCategory.BANNER_GENERATION]);
    const again = await quoteStreamsetRetry(user.id, result.batch.id, 'twitch-banner');
    assert.equal(again.id, retryQuote.id);
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const confirmed = await confirmStreamsetQuote(user.id, retryQuote.id);
    assert.equal(confirmed.jobs.length, 1);
    assert.equal(confirmed.jobs[0].assetKey, 'twitch-banner');
    assert.equal(confirmed.jobs[0].status, 'completed');
    const expected = before - retryQuote.coinCost + confirmed.refundedCoins;
    assert.equal(await getCoinBalance(user.id), expected);
    const facecam = result.jobs.find((j) => j.assetKey === 'facecam')!;
    const still = await getJob(facecam.id);
    assert.equal(still?.status, 'completed');
    const spends = ((await getTransactions(user.id, 40)) as CoinTransaction[]).filter(
      (tx) => tx.type === 'spend' && tx.quoteId === retryQuote.id
    );
    assert.equal(spends.length, 1);
    await confirmStreamsetQuote(user.id, retryQuote.id);
    assert.equal(
      ((await getTransactions(user.id, 40)) as CoinTransaction[]).filter(
        (tx) => tx.type === 'spend' && tx.quoteId === retryQuote.id
      ).length,
      1
    );
    void quote;
  });

  it('retry creates a new version and keeps the old job', async () => {
    const { user, project } = await seedCreator('ver');
    const { result } = await confirmSelection(user.id, project.id, ['facecam', 'hud'], {
      results: { facecam: 'completed', hud: 'failed' },
    });
    const failed = result.jobs.find((j) => j.assetKey === 'hud')!;
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const retryQuote = await quoteStreamsetRetry(user.id, result.batch.id, 'hud');
    const next = await confirmStreamsetQuote(user.id, retryQuote.id);
    const old = await getJob(failed.id);
    assert.equal(old?.status, 'failed');
    assert.equal(next.jobs[0].id === failed.id, false);
    const versions = await getVersionsForJob(next.jobs[0].id, user.id);
    assert.ok(versions.length >= 1);
    const status = await getStreamsetStatus(user.id, project.id);
    const hud = status.latestBatch?.jobs.find((j) => j.key === 'hud');
    assert.equal(hud?.status, 'completed');
    assert.ok((hud?.version ?? 0) >= 2);
  });

  it('change request uses existing architecture; variant does not rewrite DNA', async () => {
    const { user, project, dna } = await seedCreator('chg');
    const colors = [...dna.primaryColors];
    const { result } = await confirmSelection(user.id, project.id, ['facecam']);
    const job = await getOwnedJobForChange(result.jobs[0].id, user.id);
    assert.equal(job.userId, user.id);
    assert.equal(changeModuleToQuoteKind(job.module), 'facecam');
    const page = readFileSync(join(dir, '../../../frontend/src/pages/studios/StreamsetStudioPage.tsx'), 'utf8');
    assert.match(page, /\/change-request\?jobId=/);
    setStreamsetTestHooks({ defaultResult: 'completed' });
    const retryQuote = await quoteStreamsetRetry(user.id, result.batch.id, 'facecam');
    await confirmStreamsetQuote(user.id, retryQuote.id);
    const after = await getActiveDna(user.id);
    assert.deepEqual(after?.primaryColors, colors);
  });

  it('completed / partial / failed set status stay correct after results', async () => {
    const done = await seedCreator('done');
    const all = await confirmSelection(done.user.id, done.project.id, ['facecam', 'sticker']);
    assert.equal(all.result.batchStatus, 'completed');
    const part = await seedCreator('part');
    const mixed = await confirmSelection(part.user.id, part.project.id, ['facecam', 'hud'], {
      results: { facecam: 'completed', hud: 'failed' },
    });
    assert.equal(mixed.result.batchStatus, 'partial');
    const fail = await seedCreator('fail');
    const none = await confirmSelection(fail.user.id, fail.project.id, ['facecam', 'hud'], {
      defaultResult: 'failed',
    });
    assert.equal(none.result.batchStatus, 'failed');
  });

  it('ZIP contains only own successful assets; partial export is honest', async () => {
    const a = await seedCreator('zip-a');
    const b = await seedCreator('zip-b');
    await confirmSelection(a.user.id, a.project.id, ['facecam', 'hud'], {
      results: { facecam: 'completed', hud: 'failed' },
    });
    await confirmSelection(b.user.id, b.project.id, ['sticker']);
    const exported = await exportStreamsetZip(a.user.id, a.project.id);
    assert.equal(exported.files, 1);
    assert.equal(exported.incomplete, true);
    assert.ok(exported.missing.includes('hud'));
    assert.match(exported.fileName, /NightWolf-streamset\.zip/i);
    assert.equal(exported.completeLabel.includes('Unvollständig'), true);
    const buf = Buffer.from(exported.exportUrl.split(',')[1] || '', 'base64');
    const entries = parseZipArchive(buf);
    const names = entries.map((e) => e.name);
    assert.ok(names.some((n) => n.includes('facecam')));
    assert.equal(names.some((n) => n.includes('hud.png') || n.includes('sticker')), false);
    await assert.rejects(() => exportStreamsetZip(b.user.id, a.project.id));
    assert.equal(streamsetDownloadBasename('../Night Wolf', 'facecam').includes('..'), false);
  });

  it('refresh reconstructs results from persisted jobs; soft-delete does not wipe files', async () => {
    const { user, project } = await seedCreator('refresh');
    const { result } = await confirmSelection(user.id, project.id, ['facecam']);
    const reloaded = await getStreamsetStatus(user.id, project.id);
    assert.equal(reloaded.latestBatch?.id, result.batch.id);
    assert.equal(reloaded.latestBatch?.jobs[0]?.key, 'facecam');
    assert.equal(reloaded.latestBatch?.jobs[0]?.status, 'completed');
    await softDeleteProject(project.id, user.id);
    const file = await getUserFile(result.jobs[0].fileId!, user.id);
    assert.ok(file);
    const job = await getJob(result.jobs[0].id);
    assert.equal(job?.imageUrl, result.jobs[0].imageUrl);
  });

  it('provider and payment calls stay at 0 in this block', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const streamset = src('streamset.service.ts');
    assert.equal(streamset.includes('api.openai.com'), false);
    assert.equal(streamset.includes('stripe'), false);
    assert.equal(streamset.includes('paypal'), false);
  });
});
