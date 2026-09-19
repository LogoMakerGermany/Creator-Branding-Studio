import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_COSTS, CoinSpendCategory } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { downloadAiVideo, generateAiVideo, getAiVideo, listAiVideos, setAiVideoTestHooks } from './ai-video.service.js';
import { getUserFile, issueFileDownloadUrl, setSaveGeneratedAssetTestHooks } from './file-cloud.service.js';
import { setVideoPersistTestHooks } from './media.service.js';
import { ServiceError } from '../lib/errors.js';
import { dsList } from '../lib/data-store.js';
import {
  arePaymentsEnabled,
  hasMusicAiProvider,
  isElevenLabsTtsLiveEnabled,
} from '../config/env.js';
import {
  IMAGE_PROVIDER_FAILED_MESSAGE,
  VIDEO_PROVIDER_UNAVAILABLE_CODE,
  generateVideo,
  isPaidProviderTestBlocked,
} from '../lib/media-providers.js';
import {
  RUNWAY_CREDITS_PER_SECOND,
  RUNWAY_VIDEO_MODEL,
  VIDEO_PROVIDER_FAILED_MESSAGE,
  generateVideoWithRunway,
  setRunwayFetchForTests,
  setRunwayPollForTests,
} from '../lib/runway-video.js';
import {
  MAX_PROVIDER_VIDEO_BYTES,
  PROVIDER_VIDEO_FETCH_TIMEOUT_MS,
  PROVIDER_VIDEO_MAX_REDIRECTS,
  VIDEO_DOWNLOAD_TIMEOUT_CODE,
  VIDEO_DOWNLOAD_TIMEOUT_MESSAGE,
  VIDEO_INVALID_PAYLOAD_CODE,
  VIDEO_INVALID_PAYLOAD_MESSAGE,
  VIDEO_STORAGE_ERROR_CODE,
  VIDEO_STORAGE_ERROR_MESSAGE,
  assertProviderImageBytes,
  assertProviderVideoBytes,
  hasSafeMp4Ftyp,
} from '../lib/upload-validation.js';
import {
  assertSafeProviderVideoUrl,
  fetchProviderVideo,
  setProviderVideoFetchTestHooks,
} from '../lib/safe-provider-fetch.js';
import { createTinyTestVideo } from '../lib/video-processing.js';
import { API_COST_KIND_ESTIMATE } from '../lib/api-cost.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(dir, '../../..', rel), 'utf8');
}

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const keys = Object.keys(patch);
  const prev: Record<string, string | undefined> = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mp4Ftyp(totalBytes = 32): Buffer {
  const buf = Buffer.alloc(Math.max(totalBytes, 24));
  buf.writeUInt32BE(24, 0);
  buf.write('ftyp', 4);
  buf.write('isom', 8);
  buf.writeUInt32BE(0, 12);
  buf.write('isom', 16);
  buf.write('iso2', 20);
  return buf;
}

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

let tinyMp4: Buffer | undefined;
async function fixtureMp4(): Promise<Buffer> {
  if (!tinyMp4) tinyMp4 = await createTinyTestVideo(2.2);
  return tinyMp4;
}

function videoFetch(status = 200, init?: { location?: string; type?: string; body?: Buffer }): typeof fetch {
  return (async () =>
    new Response(init?.body ?? mp4Ftyp(), {
      status,
      headers: {
        ...(init?.type ? { 'content-type': init.type } : { 'content-type': 'video/mp4' }),
        ...(init?.location ? { location: init.location } : {}),
      },
    })) as unknown as typeof fetch;
}

function mockRunwaySuccess(taskId = 'task_q4c'): { creates: () => number } {
  let creates = 0;
  setRunwayPollForTests({ intervalMs: 1, maxPolls: 5 });
  setRunwayFetchForTests(async (input, init) => {
    const url = String(input);
    if (url.includes('replicate.com') || url.includes('openai.com') || url.includes('api.elevenlabs')) {
      throw new Error('forbidden provider call');
    }
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'POST') {
      creates += 1;
      return jsonResponse({ id: taskId });
    }
    return jsonResponse({
      status: 'SUCCEEDED',
      output: ['https://dncdn.example.runway.test/out.mp4'],
    });
  });
  return { creates: () => creates };
}

async function seed(tag: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.q4c.test`, tag);
  const dna = await upsertDna({
    userId: user.id,
    name: `Q4c ${tag}`,
    mascot: 'Orb',
    styleDirection: 'neon',
    primaryColors: ['#7C3AED'],
  });
  const project = await createProject(user.id, { name: `Q4c ${tag}`, type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

function spendCount(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'spend').length);
}

function refundCount(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'refund').length);
}

afterEach(() => {
  setRunwayFetchForTests(null);
  setRunwayPollForTests(null);
  setProviderVideoFetchTestHooks(null);
  setSaveGeneratedAssetTestHooks(null);
  setVideoPersistTestHooks(null);
  setAiVideoTestHooks(null);
});

describe('Q.4c — video validation', () => {
  it('1-9. video validator accepts mp4/ftyp and rejects image/html/json/empty/oversized/invalid', () => {
    const valid = mp4Ftyp();
    assert.equal(hasSafeMp4Ftyp(valid), true);
    assert.doesNotThrow(() => assertProviderVideoBytes(valid, 'video/mp4'));
    assert.throws(
      () => assertProviderImageBytes(valid, 'video/mp4'),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.message.includes('Bildinhalt') &&
        !err.message.includes('KI-Video')
    );
    assert.throws(
      () => assertProviderVideoBytes(PNG, 'image/png'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );
    assert.throws(
      () => assertProviderVideoBytes(Buffer.from('<html>nope</html>'), 'text/html'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );
    assert.throws(
      () => assertProviderVideoBytes(Buffer.from('{"ok":true}'), 'application/json'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );
    assert.throws(
      () => assertProviderVideoBytes(Buffer.alloc(0), 'video/mp4'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );
    const oversized = Buffer.alloc(MAX_PROVIDER_VIDEO_BYTES + 1);
    oversized.writeUInt32BE(24, 0);
    oversized.write('ftyp', 4);
    oversized.write('isom', 8);
    assert.throws(
      () => assertProviderVideoBytes(oversized, 'video/mp4'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );
    const invalidSig = Buffer.from('not-an-mp4-container!!!!');
    assert.throws(
      () => assertProviderVideoBytes(invalidSig, 'video/mp4'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );
    const badBox = Buffer.alloc(32);
    badBox.writeUInt32BE(4, 0);
    badBox.write('ftyp', 4);
    badBox.write('isom', 8);
    assert.throws(
      () => assertProviderVideoBytes(badBox, 'video/mp4'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );
    assert.equal(MAX_PROVIDER_VIDEO_BYTES, 50 * 1024 * 1024);
  });

  it('10-14. HTTPS/SSRF/redirect/timeout bounds are preserved', async () => {
    assert.throws(
      () => assertSafeProviderVideoUrl('http://cdn.example.test/a.mp4'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );
    for (const url of [
      'https://localhost/a.mp4',
      'https://127.0.0.1/a.mp4',
      'https://192.168.1.9/a.mp4',
      'https://10.0.0.1/a.mp4',
      'https://169.254.169.254/latest',
    ]) {
      assert.throws(
        () => assertSafeProviderVideoUrl(url),
        (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
      );
    }
    assert.doesNotThrow(() => assertSafeProviderVideoUrl('https://dncdn.example.runway.test/out.mp4'));

    setProviderVideoFetchTestHooks({
      fetch: videoFetch(302, { location: 'http://127.0.0.1/secret.mp4' }),
    });
    await assert.rejects(
      () => fetchProviderVideo('https://dncdn.example.runway.test/start.mp4'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_INVALID_PAYLOAD_CODE
    );

    setProviderVideoFetchTestHooks({
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
    await assert.rejects(
      () => fetchProviderVideo('https://dncdn.example.runway.test/slow.mp4'),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_DOWNLOAD_TIMEOUT_CODE
    );
    assert.equal(PROVIDER_VIDEO_FETCH_TIMEOUT_MS, 45_000);
    assert.equal(PROVIDER_VIDEO_MAX_REDIRECTS, 3);
  });
});

describe('Q.4c — persist + audit + coins', () => {
  it('15-20, 23-32, 35-36, 40, 42, 45-48. successful Runway result persists private mp4 with audit', async () => {
    const { user, project } = await seed('ok');
    const mp4 = await fixtureMp4();
    const runway = mockRunwaySuccess('task_persist_ok');
    setProviderVideoFetchTestHooks({
      fetch: videoFetch(200, { type: 'video/mp4', body: mp4 }),
    });
    const before = await getCoinBalance(user.id);
    const result = await withEnv(
      { RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'true', REPLICATE_API_TOKEN: undefined },
      () => generateAiVideo(user.id, project.id, { prompt: 'safe persist clip', duration: 5, aspectRatio: '16:9' })
    );
    const job = await getAiVideo(result.job.id, user.id);
    assert.ok(job);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.userId, user.id);
    assert.equal(job?.provider, 'runway-gen4.5');
    assert.equal(job?.metadata?.providerName, 'runway');
    assert.equal(job?.metadata?.providerModel, 'gen4.5');
    assert.equal(job?.metadata?.providerTaskId, 'task_persist_ok');
    assert.equal(job?.metadata?.providerTaskStatus, 'SUCCEEDED');
    assert.equal(job?.metadata?.mimeType, 'video/mp4');
    assert.equal(job?.metadata?.estimatedCredits, 60);
    assert.equal(job?.metadata?.estimatedCreditsKind, 'estimate');
    assert.equal(job?.metadata?.actualProviderCredits, 'not-claimed');
    assert.equal(String(job?.videoUrl ?? '').includes('dncdn.example.runway.test'), false);
    assert.equal(JSON.stringify(job).includes('rw_test_not_real'), false);
    assert.equal(JSON.stringify(job).includes('Authorization'), false);
    assert.equal(runway.creates(), 1);
    assert.equal(await spendCount(user.id), 1);
    assert.equal(await refundCount(user.id), 0);
    assert.equal(await getCoinBalance(user.id), before - COIN_COSTS[CoinSpendCategory.AI_VIDEO]);

    const fileId = String(job!.metadata!.fileId);
    const file = await getUserFile(fileId, user.id);
    assert.ok(file);
    assert.equal(file?.userId, user.id);
    assert.equal(file?.mimeType, 'video/mp4');
    assert.equal(file?.category, 'video');
    assert.equal(file?.storagePath?.startsWith(`users/${user.id}/videos/`), true);
    const issued = await issueFileDownloadUrl(fileId, user.id);
    assert.ok(issued?.downloadUrl);
    const dl = await downloadAiVideo(job!.id, user.id);
    assert.equal(dl.fileId, fileId);
    assert.ok(dl.downloadUrl);

    assert.equal(job?.metadata?.thumbnailStatus === 'extracted' || job?.metadata?.thumbnailStatus === 'unavailable', true);
    assert.equal(job?.metadata?.thumbnailProviderCalls, 0);
    if (job?.thumbnailUrl) {
      assert.equal(String(job.thumbnailUrl).includes('dncdn.example.runway.test'), false);
    }

    const costs = (await dsList('api_costs', { orderBy: 'createdAt', order: 'desc', limit: 50 })).filter(
      (row) => row.jobId === job!.id
    );
    assert.equal(costs.length, 1);
    assert.equal(costs[0]?.provider, 'runway');
    assert.equal(costs[0]?.model, RUNWAY_VIDEO_MODEL);
    assert.equal(costs[0]?.estimatedCredits, 60);
    assert.equal(costs[0]?.costKind, API_COST_KIND_ESTIMATE);
    assert.equal(costs[0]?.actualProviderCostUnknown, true);
    assert.equal(costs[0]?.internalCostCents, 0);
    assert.match(String(costs[0]?.estimatedCreditsNote ?? ''), /Estimate only/i);
    assert.equal(RUNWAY_CREDITS_PER_SECOND, 12);
  });

  it('21. storage failure refunds once and keeps provider audit', async () => {
    const { user, project } = await seed('storefail');
    const mp4 = await fixtureMp4();
    mockRunwaySuccess('task_store_fail');
    setProviderVideoFetchTestHooks({ fetch: videoFetch(200, { type: 'video/mp4', body: mp4 }) });
    setSaveGeneratedAssetTestHooks({ fail: true });
    const before = await getCoinBalance(user.id);
    await assert.rejects(
      () =>
        withEnv({ RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'true' }, () =>
          generateAiVideo(user.id, project.id, { prompt: 'store fail', duration: 5 })
        ),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === VIDEO_STORAGE_ERROR_CODE &&
        err.message === VIDEO_STORAGE_ERROR_MESSAGE
    );
    assert.equal(await spendCount(user.id), 1);
    assert.equal(await refundCount(user.id), 1);
    assert.equal(await getCoinBalance(user.id), before);
    const failed = (await listAiVideos(user.id)).find((j) => j.status === 'failed');
    assert.ok(failed);
    assert.equal(failed?.metadata?.providerTaskId, 'task_store_fail');
    assert.equal(failed?.metadata?.providerTaskStatus, 'SUCCEEDED');
    const costs = (await dsList('api_costs', { orderBy: 'createdAt', order: 'desc', limit: 50 })).filter(
      (row) => row.jobId === failed!.id
    );
    assert.equal(costs.length, 1);
    assert.equal(costs[0]?.costKind, API_COST_KIND_ESTIMATE);
  });

  it('22. metadata failure refunds once after provider completion evidence', async () => {
    const { user, project } = await seed('meta');
    const mp4 = await fixtureMp4();
    mockRunwaySuccess('task_meta_fail');
    setProviderVideoFetchTestHooks({ fetch: videoFetch(200, { type: 'video/mp4', body: mp4 }) });
    setVideoPersistTestHooks({ failMetadata: true });
    const before = await getCoinBalance(user.id);
    await assert.rejects(
      () =>
        withEnv({ RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'true' }, () =>
          generateAiVideo(user.id, project.id, { prompt: 'meta fail', duration: 5 })
        ),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_STORAGE_ERROR_CODE
    );
    assert.equal(await refundCount(user.id), 1);
    assert.equal(await getCoinBalance(user.id), before);
    const failed = (await listAiVideos(user.id)).find((j) => j.status === 'failed');
    assert.equal(failed?.metadata?.providerTaskId, 'task_meta_fail');
    const costs = (await dsList('api_costs', { orderBy: 'createdAt', order: 'desc', limit: 50 })).filter(
      (row) => row.jobId === failed!.id
    );
    assert.equal(costs.length, 1);
  });

  it('25-28, 44. thumbnail failure leaves video successful with no refund', async () => {
    const { user, project } = await seed('thumb');
    const mp4 = await fixtureMp4();
    mockRunwaySuccess('task_thumb_fail');
    setProviderVideoFetchTestHooks({ fetch: videoFetch(200, { type: 'video/mp4', body: mp4 }) });
    setVideoPersistTestHooks({ failThumbnail: true });
    const before = await getCoinBalance(user.id);
    const result = await withEnv({ RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'true' }, () =>
      generateAiVideo(user.id, project.id, { prompt: 'thumb fail', duration: 5 })
    );
    const job = await getAiVideo(result.job.id, user.id);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.videoUrl);
    assert.equal(job?.metadata?.thumbnailStatus, 'unavailable');
    assert.equal(job?.metadata?.thumbnailProviderCalls, 0);
    assert.equal(await refundCount(user.id), 0);
    assert.equal(await getCoinBalance(user.id), before - 25);
    const file = await getUserFile(String(job!.metadata!.fileId), user.id);
    assert.equal(file?.userId, user.id);
  });

  it('37, 39, 43. AI_VIDEO persistence failure uses video copy and hides raw provider errors', async () => {
    const { user, project } = await seed('copy');
    mockRunwaySuccess('task_html');
    setProviderVideoFetchTestHooks({
      fetch: videoFetch(200, { type: 'text/html', body: Buffer.from('<html>runway-raw-error</html>') }),
    });
    await assert.rejects(
      () =>
        withEnv({ RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'true' }, () =>
          generateAiVideo(user.id, project.id, { prompt: 'html body', duration: 5 })
        ),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === VIDEO_INVALID_PAYLOAD_CODE &&
        err.message === VIDEO_INVALID_PAYLOAD_MESSAGE &&
        !err.message.includes('runway-raw-error') &&
        !err.message.includes('Bildinhalt')
    );
    assert.equal(await refundCount(user.id), 1);
    assert.equal(VIDEO_DOWNLOAD_TIMEOUT_MESSAGE.includes('KI-Video'), true);
  });
});

describe('Q.4c — provider safety and regressions', () => {
  it('38. image failure still uses image copy', () => {
    assert.throws(
      () => assertProviderImageBytes(Buffer.from('<html>x</html>'), 'text/html'),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.message.includes('Bildinhalt') &&
        err.message === 'Die Bildgenerierung lieferte keinen Bildinhalt. Coins wurden erstattet.'
    );
    assert.equal(IMAGE_PROVIDER_FAILED_MESSAGE.includes('Bildgenerierung'), true);
    const api = repo('frontend/src/services/api.ts');
    assert.match(api, /PROVIDER_INVALID_PAYLOAD: 'Die Bildgenerierung lieferte kein gültiges Bild/);
    assert.match(api, /VIDEO_INVALID_PAYLOAD: 'Das KI-Video konnte nicht verarbeitet werden/);
  });

  it('46-51. one Runway create, no auto retry, no Replicate/OpenAI thumbnail, flags block provider', async () => {
    const media = src('../lib/media-providers.ts');
    const gen = media.slice(media.indexOf('export async function generateVideo'));
    assert.match(gen, /Once a Runway create is submitted, do not fall through to Replicate/);
    const persist = src('./media.service.ts');
    const persistFn = persist.slice(persist.indexOf('async function persistGeneratedVideo'));
    assert.match(persistFn, /fetchProviderVideo/);
    assert.equal(persistFn.includes('assertProviderImageBytes'), false);
    assert.equal(persistFn.includes('uploadAssetFromUrl'), false);
    const attach = persist.split('async function attachLocalVideoThumbnail')[1]?.split('async function persistGeneratedImage')[0] ?? '';
    assert.equal(attach.includes('generateImage('), false);
    assert.equal(attach.includes('openai.com'), false);
    assert.equal(attach.includes('api.replicate.com'), false);

    setRunwayFetchForTests(async () => {
      throw new Error('provider must not be called');
    });
    await withEnv(
      { VIDEO_GENERATIONS_ENABLED: 'false', RUNWAY_API_KEY: 'rw_test_not_real' },
      async () => {
        await assert.rejects(
          () => generateVideo('blocked', { duration: 5 }),
          (err: unknown) => err instanceof ServiceError && err.code === VIDEO_PROVIDER_UNAVAILABLE_CODE
        );
      }
    );
    await withEnv(
      { VIDEO_GENERATIONS_ENABLED: 'true', RUNWAY_API_KEY: undefined, REPLICATE_API_TOKEN: undefined },
      async () => {
        await assert.rejects(
          () => generateVideoWithRunway('no-key', { duration: 5 }),
          (err: unknown) => err instanceof ServiceError && err.message === VIDEO_PROVIDER_FAILED_MESSAGE
        );
      }
    );
  });

  it('52-60. Q.1/Q.2/Q.4a/Q.4b/G/N/R/O/music persistence remain unchanged', () => {
    const runway = src('../lib/runway-video.ts');
    assert.match(runway, /RUNWAY_VIDEO_MODEL = 'gen4\.5'/);
    assert.match(runway, /text_to_video/);
    assert.match(runway, /Retired gen3a_turbo is not used/);
    assert.match(runway, /assertActiveRunwayModel/);
    const media = src('./media.service.ts');
    assert.match(media, /Must never fail a paid video job/);
    assert.match(media, /thumbnailStatus: 'unavailable'/);
    const conversation = src('./nexter/conversation.service.ts');
    assert.match(conversation, /isAiVideoQuoteIntent/);
    const tools = src('./nexter/tools.service.ts');
    assert.match(tools, /parseVideoStudioPrep/);
    const intelligence = repo('shared/src/nexter-intelligence.ts');
    assert.match(intelligence, /parseExplicitAspectFromMessage/);
    assert.match(intelligence, /applyExplicitAspectToFormatHint/);
    const g = src('./content.phase-g.test.ts');
    assert.match(g, /withCoinCharge/);
    const persistImage = media.slice(media.indexOf('async function persistImage'));
    assert.match(persistImage, /uploadAssetFromUrl/);
    const persistAudio = media.slice(media.indexOf('async function persistAudio'));
    assert.match(persistAudio, /fetchProviderAudio/);
    assert.equal(persistAudio.includes('assertProviderImageBytes'), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(hasMusicAiProvider(), false);
    assert.equal(isElevenLabsTtsLiveEnabled(), false);
    const firebase = src('../lib/firebase-storage.ts');
    assert.match(firebase, /assertProviderImageBytes/);
    assert.match(firebase, /public: false/);
    assert.match(firebase, /ownerId: userId/);
  });

  it('secret scan of Q.4c files has no live provider tokens', () => {
    const files = [
      src('./media.service.ts'),
      src('./ai-video.service.ts'),
      src('./file-cloud.service.ts'),
      src('../lib/safe-provider-fetch.ts'),
      src('../lib/upload-validation.ts'),
      src('../lib/runway-video.ts'),
      src('../lib/api-cost.ts'),
      repo('frontend/src/services/api.ts'),
    ];
    for (const body of files) {
      assert.equal(/sk-[a-zA-Z0-9]{20,}/.test(body), false);
      assert.equal(/r8_[a-zA-Z0-9]{20,}/.test(body), false);
      assert.equal(/rw_[a-zA-Z0-9]{20,}/.test(body), false);
      assert.equal(body.includes('RUNWAY_API_KEY='), false);
    }
  });
});
