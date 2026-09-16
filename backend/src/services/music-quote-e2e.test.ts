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
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { getUserFile, setSaveGeneratedAssetTestHooks } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { dsSet } from '../lib/data-store.js';
import {
  isPaidProviderTestBlocked,
  MUSIC_PROVIDER_UNAVAILABLE_CODE,
  MUSIC_PROVIDER_UNAVAILABLE_MESSAGE,
  IMAGE_GENERATION_UNAVAILABLE_CODE,
  VIDEO_PROVIDER_UNAVAILABLE_CODE,
} from '../lib/media-providers.js';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import {
  assertSafeProviderAudioUrl,
  fetchProviderAudio,
  MAX_PROVIDER_AUDIO_BYTES,
  MUSIC_DOWNLOAD_TIMEOUT_CODE,
  MUSIC_INVALID_AUDIO_CODE,
  MUSIC_PROVIDER_FAILED_CODE,
  MUSIC_STORAGE_ERROR_CODE,
  PROVIDER_AUDIO_FETCH_TIMEOUT_MS,
  setProviderAudioFetchTestHooks,
} from '../lib/safe-provider-fetch.js';
import { createTinyTestAudio } from '../lib/audio-test.js';
import {
  downloadMusic,
  getMusic,
  listMusic,
  setMusicTestHooks,
} from './music.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { coinCostForKind } from './nexter/tools.service.js';

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
  setMusicTestHooks(null);
  setProviderAudioFetchTestHooks(null);
  setSaveGeneratedAssetTestHooks(null);
});

async function seed(tag = 'music-c') {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.music-e2e.test`, tag);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
  });
  const project = await createProject(user.id, { name: 'Music E2E', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

function spendCount(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'spend').length);
}

function refundCount(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'refund').length);
}

const TINY_WAV = createTinyTestAudio();

function wavFetch(status = 200, init?: { location?: string; type?: string; body?: Buffer }): typeof fetch {
  return (async () =>
    new Response(init?.body ?? TINY_WAV, {
      status,
      headers: {
        ...(init?.type ? { 'content-type': init.type } : { 'content-type': 'audio/wav' }),
        ...(init?.location ? { location: init.location } : {}),
      },
    })) as unknown as typeof fetch;
}

describe('Block C — music generation E2E + provider URL persistence', () => {
  it('1 music price source of truth is 10', () => {
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(coinCostForKind('music'), 10);
    const coins = readFileSync(join(dir, '../../../shared/src/coins.ts'), 'utf8');
    assert.match(coins, /AI_MUSIC]: 10/);
    assert.equal(Object.prototype.hasOwnProperty.call(COIN_COSTS, 'MUSIC_GENERATION'), false);
  });

  it('2-3 music quote uses server price 10 and does not auto-confirm', async () => {
    const { user, project } = await seed('quote');
    const session = await nexterChat(user.id, 'Mach mir Musik für meinen Stream');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal(detectQuoteKind('Mach mir Musik für meinen Stream'), 'music');
    const quoted = (last?.actions ?? []).some((a) => a.tool === 'quote_generation');
    const start = (last?.actions ?? []).find((a) => a.tool === 'start_generation');
    assert.equal(quoted, true);
    assert.equal(start?.requiresConfirmation, true);
    assert.equal((await listMusic(user.id)).length, 0);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'stream-intro', duration: 12 });
    assert.equal(quote.coinCost, 10);
    assert.equal(quote.status, 'pending');
    assert.equal((await listMusic(user.id)).length, 0);
  });

  it('4 provider unavailable is 0 debit with a safe user message', async () => {
    const { user, project } = await seed('unavail');
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 10 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === MUSIC_PROVIDER_UNAVAILABLE_CODE &&
        err.message === MUSIC_PROVIDER_UNAVAILABLE_MESSAGE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await spendCount(user.id), 0);
    assert.equal((await listMusic(user.id)).length, 0);
    const api = frontend('services/api.ts');
    assert.match(api, /MUSIC_PROVIDER_UNAVAILABLE/);
    assert.match(api, /Die Musikgenerierung ist momentan nicht verfügbar/);
  });

  it('5 insufficient balance starts no provider call and no debit', async () => {
    const { user, project } = await seed('broke');
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    setMusicTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'jingle', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    const musicSpends = (await getTransactions(user.id)).filter(
      (t) => t.type === 'spend' && t.category === CoinSpendCategory.AI_MUSIC
    );
    assert.equal(musicSpends.length, 0);
    assert.equal((await listMusic(user.id)).length, 0);
  });

  it('6 expired quote is 0 debit', async () => {
    const { user, project } = await seed('expired');
    setMusicTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 10 });
    await dsSet('nexterQuotes', quote.id, {
      ...quote,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    } as unknown as Record<string, unknown>);
    const before = await getCoinBalance(user.id);
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'QUOTE_EXPIRED'
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await spendCount(user.id), 0);
  });

  it('7 wrong-user quote is 0 debit', async () => {
    const { user, project } = await seed('owner');
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@other.music-e2e.test`, 'Other');
    setMusicTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 10 });
    const before = await getCoinBalance(user.id);
    await assert.rejects(
      () => confirmQuote(other.id, quote.id),
      (err: unknown) => err instanceof ServiceError && (err.code === 'QUOTE_NOT_FOUND' || err.code === 'NO_DNA')
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await spendCount(user.id), 0);
  });

  it('8-9 duplicate confirmation and double click debit once', async () => {
    const { user, project } = await seed('dup');
    setMusicTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'stream-intro', duration: 12 });
    const [first, second] = await Promise.all([confirmQuote(user.id, quote.id), confirmQuote(user.id, quote.id)]);
    assert.equal(first.jobIds.length, 1);
    assert.equal(second.jobIds.length, 1);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    const third = await confirmQuote(user.id, quote.id);
    assert.equal(third.jobIds[0], first.jobIds[0]);
    assert.equal(await getCoinBalance(user.id), before - 10);
    assert.equal(await spendCount(user.id), 1);
    assert.equal((await listMusic(user.id)).filter((j) => j.status === 'completed').length, 1);
  });

  it('10 mock HTTPS audio URL is fetched safely and persisted as owned file', async () => {
    const { user, project } = await seed('https');
    setProviderAudioFetchTestHooks({ fetch: wavFetch() });
    setMusicTestHooks({
      result: 'success',
      providerOutput: 'https://replicate.delivery/pbxt/block-c-test.wav',
    });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'stream-intro', duration: 10 });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getMusic(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.userId, user.id);
    assert.equal(job?.metadata?.mimeType, 'audio/wav');
    assert.equal(job?.metadata?.outputFormat, 'wav');
    const fileId = String(job!.metadata!.fileId);
    const file = await getUserFile(fileId, user.id);
    assert.ok(file);
    assert.equal(file?.mimeType, 'audio/wav');
    assert.equal(file?.userId, user.id);
    assert.ok(!String(job?.audioUrl).includes('replicate.delivery'));
    assert.equal(await getCoinBalance(user.id), before - 10);
    assert.equal(await refundCount(user.id), 0);
  });

  it('11 valid data URL persists owned audio', async () => {
    const { user, project } = await seed('dataurl');
    setMusicTestHooks({
      result: 'success',
      audioDataUrl: `data:audio/wav;base64,${TINY_WAV.toString('base64')}`,
    });
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'jingle', duration: 6 });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getMusic(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.ok(await getUserFile(String(job!.metadata!.fileId), user.id));
  });

  it('12 invalid scheme is rejected with exactly one refund', async () => {
    const { user, project } = await seed('scheme');
    setMusicTestHooks({ result: 'success', providerOutput: 'file:///tmp/track.wav' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_INVALID_AUDIO_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
    assert.equal((await listMusic(user.id)).filter((j) => j.status === 'completed').length, 0);
  });

  it('13 localhost and private-network URLs are rejected', () => {
    const blocked = [
      'http://127.0.0.1/x.wav',
      'https://localhost/x.wav',
      'https://192.168.1.9/x.wav',
      'https://10.0.0.1/x.wav',
      'https://169.254.169.254/latest/meta-data',
      'https://metadata.google.internal/',
    ];
    for (const url of blocked) {
      assert.throws(
        () => assertSafeProviderAudioUrl(url),
        (err: unknown) => err instanceof ServiceError && err.code === MUSIC_INVALID_AUDIO_CODE
      );
    }
    assert.doesNotThrow(() => assertSafeProviderAudioUrl('https://replicate.delivery/pbxt/ok.wav'));
  });

  it('14 redirect to unsafe target is rejected with one refund', async () => {
    const { user, project } = await seed('redir');
    setProviderAudioFetchTestHooks({
      fetch: wavFetch(302, { location: 'http://127.0.0.1/secret.wav' }),
    });
    setMusicTestHooks({
      result: 'success',
      providerOutput: 'https://replicate.delivery/pbxt/start.wav',
    });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_INVALID_AUDIO_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
  });

  it('15 HTTP failure refunds exactly once', async () => {
    const { user, project } = await seed('http');
    setProviderAudioFetchTestHooks({ fetch: wavFetch(500) });
    setMusicTestHooks({
      result: 'success',
      providerOutput: 'https://replicate.delivery/pbxt/fail.wav',
    });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_PROVIDER_FAILED_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
  });

  it('16 download timeout refunds exactly once', async () => {
    const { user, project } = await seed('timeout');
    setProviderAudioFetchTestHooks({
      timeoutMs: 30,
      fetch: ((_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'TimeoutError';
            reject(err);
          });
        })) as typeof fetch,
    });
    setMusicTestHooks({
      result: 'success',
      providerOutput: 'https://replicate.delivery/pbxt/slow.wav',
    });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_DOWNLOAD_TIMEOUT_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
    assert.equal(PROVIDER_AUDIO_FETCH_TIMEOUT_MS, 30_000);
  });

  it('17 empty body refunds exactly once', async () => {
    const { user, project } = await seed('empty');
    setProviderAudioFetchTestHooks({ fetch: wavFetch(200, { body: Buffer.alloc(0) }) });
    setMusicTestHooks({
      result: 'success',
      providerOutput: 'https://replicate.delivery/pbxt/empty.wav',
    });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_INVALID_AUDIO_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
  });

  it('18 invalid content type refunds exactly once', async () => {
    const { user, project } = await seed('ctype');
    setProviderAudioFetchTestHooks({
      fetch: wavFetch(200, { type: 'text/html', body: Buffer.from('<html>nope</html>') }),
    });
    setMusicTestHooks({
      result: 'success',
      providerOutput: 'https://replicate.delivery/pbxt/page.html',
    });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_INVALID_AUDIO_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
  });

  it('19 oversized audio refunds exactly once', async () => {
    const { user, project } = await seed('size');
    const oversized = Buffer.alloc(MAX_PROVIDER_AUDIO_BYTES + 16, 1);
    setProviderAudioFetchTestHooks({ fetch: wavFetch(200, { body: oversized }) });
    setMusicTestHooks({
      result: 'success',
      providerOutput: 'https://replicate.delivery/pbxt/huge.wav',
    });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_INVALID_AUDIO_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
  });

  it('20 storage failure refunds exactly once', async () => {
    const { user, project } = await seed('storage');
    setMusicTestHooks({ result: 'success', persistFail: true });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_STORAGE_ERROR_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
    assert.equal((await listMusic(user.id)).filter((j) => j.status === 'completed').length, 0);
  });

  it('21 persistence failure does not complete an orphan job', async () => {
    const { user, project } = await seed('persist');
    setMusicTestHooks({ result: 'success', jobPersistFail: true });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_STORAGE_ERROR_CODE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
    assert.equal((await listMusic(user.id)).filter((j) => j.status === 'completed').length, 0);
  });

  it('22-23 success is one debit, one owned audio, signed download, no refund', async () => {
    const { user, project } = await seed('ok');
    setMusicTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'stream-intro', duration: 15 });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getMusic(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    const file = await getUserFile(String(job!.metadata!.fileId), user.id);
    assert.ok(file);
    const dl = await downloadMusic(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    assert.ok(dl.expiresAt);
    assert.equal(dl.fileId, file!.id);
    assert.match(dl.filename, /\.wav$/i);
    assert.equal(await getCoinBalance(user.id), before - 10);
    assert.equal(await spendCount(user.id), 1);
    assert.equal(await refundCount(user.id), 0);
  });

  it('24-25 Block A and Block B regression invariants stay intact', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    const logo = src('logo.service.ts');
    assert.match(logo, /requireImageProvider|assertImageProviderReadyForStudio/);
    const anim = src('animation.service.ts');
    const generateAnim = anim.split('export async function generateAnimation')[1]?.split('export async function')[0] ?? '';
    assert.ok(generateAnim.indexOf('requireVideoProvider()') < generateAnim.indexOf('withCoinCharge'));
    const music = src('music.service.ts');
    const generate = music.split('export async function generateMusicTrack')[1]?.split('async function resolveMusicAudio')[0] ?? '';
    assert.ok(generate.indexOf('requireMusicProvider()') < generate.indexOf('withCoinCharge'));
    assert.equal(music.includes('fetchAudioAsDataUrl'), false);
    assert.match(music, /fetchProviderAudio/);
    assert.equal(IMAGE_GENERATION_UNAVAILABLE_CODE, 'IMAGE_GENERATION_UNAVAILABLE');
    assert.equal(VIDEO_PROVIDER_UNAVAILABLE_CODE, 'VIDEO_PROVIDER_UNAVAILABLE');
    const routes = src('../routes/music.routes.ts');
    assert.match(routes, /MUSIC_REQUIRES_QUOTE/);
    const intro = frontend('pages/intro-outro/IntroOutroPage.tsx');
    assert.equal(intro.includes('formatCoins(20)'), false);
    assert.equal(intro.includes('Komplett-Paket (50 Coins)'), false);
  });

  it('data URL oversize and fetch without test hook stay closed in NODE_TEST', async () => {
    await assert.rejects(
      () => fetchProviderAudio('https://replicate.delivery/pbxt/live.wav'),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_PROVIDER_FAILED_CODE
    );
    const huge = 'A'.repeat(Math.ceil(((MAX_PROVIDER_AUDIO_BYTES + 64) * 4) / 3));
    await assert.rejects(
      () => fetchProviderAudio(`data:audio/wav;base64,${huge}`),
      (err: unknown) => err instanceof ServiceError && err.code === MUSIC_INVALID_AUDIO_CODE
    );
  });
});
