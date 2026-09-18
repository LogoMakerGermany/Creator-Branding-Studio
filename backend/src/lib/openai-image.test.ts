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
import {
  arePaymentsEnabled,
  getDefaultFreeCoins,
  hasImageAiProvider,
  hasMusicAiProvider,
  hasVideoAiProvider,
  isElevenLabsTtsLiveEnabled,
  isNexterChatProviderAvailable,
  isTtsGenerationEnabled,
} from '../config/env.js';
import { ServiceError } from './errors.js';
import { IMAGE_PROVIDER_FAILED_MESSAGE, isPaidProviderTestBlocked } from './media-providers.js';
import {
  OPENAI_GPT_IMAGE_MODEL,
  OPENAI_GPT_IMAGE_N,
  OPENAI_GPT_IMAGE_OUTPUT_FORMAT,
  OPENAI_GPT_IMAGE_TIMEOUT_MS,
  buildGptImageRequest,
  decodeGptImagePngBase64,
  generateGptImage,
  mapGptImageBackground,
  mapGptImageQuality,
  mapGptImageSize,
  setOpenAiImageFetchForTests,
} from './openai-image.js';
import { MAX_PROVIDER_IMAGE_BYTES } from './upload-validation.js';
import { getOrCreateUser } from '../services/user.service.js';
import { getUserFile, issueFileDownloadUrl, saveGeneratedAssetFromBuffer, setSaveGeneratedAssetTestHooks } from '../services/file-cloud.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BUFFER = Buffer.from(PNG_B64, 'base64');

function src(rel: string): string {
  return readFileSync(join(dir, '..', rel), 'utf8');
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

afterEach(() => {
  setOpenAiImageFetchForTests(null);
  setSaveGeneratedAssetTestHooks(null);
});

describe('Block O.1 — OpenAI GPT Image adapter (no live calls)', () => {
  it('1-7. production path uses gpt-image-2.5-flare, n=1, mapped quality/size, png', () => {
    assert.equal(OPENAI_GPT_IMAGE_MODEL, 'gpt-image-2.5-flare');
    assert.equal(OPENAI_GPT_IMAGE_N, 1);
    assert.equal(OPENAI_GPT_IMAGE_OUTPUT_FORMAT, 'png');
    assert.doesNotMatch(src('lib/openai-image.ts'), /dall-e-3/);
    assert.doesNotMatch(src('services/ai.service.ts'), /dall-e-3/);
    assert.doesNotMatch(src('services/ai.service.ts'), /generateWithOpenAI/);
    assert.match(src('services/ai.service.ts'), /generateGptImage/);
    const req = buildGptImageRequest({
      prompt: 'original plasma orb logo',
      size: '1792x1024',
      hd: true,
      module: 'banner',
    });
    assert.equal(req.model, 'gpt-image-2.5-flare');
    assert.equal(req.n, 1);
    assert.equal(req.quality, 'high');
    assert.equal(req.size, '1536x1024');
    assert.equal(req.output_format, 'png');
    assert.equal(req.background, 'opaque');
    assert.equal(mapGptImageQuality(false), 'medium');
    assert.equal(mapGptImageQuality('standard'), 'medium');
    assert.equal(mapGptImageQuality('hd'), 'high');
  });

  it('8. b64_json success returns png buffer without using data[0].url', async () => {
    let calls = 0;
    setOpenAiImageFetchForTests(async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      assert.equal(body.model, 'gpt-image-2.5-flare');
      assert.equal(body.n, 1);
      assert.equal(body.output_format, 'png');
      assert.notEqual(body.quality, 'hd');
      assert.notEqual(body.quality, 'standard');
      assert.equal(body.size, '1024x1024');
      return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64, url: 'https://example.invalid/ignore.png' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await withEnv({ OPENAI_API_KEY: 'sk-test-not-real-openai' }, async () => {
      const result = await generateGptImage({ prompt: 'orb', module: 'logo', size: '1024x1024', hd: true });
      assert.equal(result.provider, 'openai');
      assert.equal(result.mimeType, 'image/png');
      assert.ok(result.buffer.equals(PNG_BUFFER));
    });
    assert.equal(calls, 1);
  });

  it('9-12. invalid, empty, missing, and oversized base64 are rejected', () => {
    assert.throws(() => decodeGptImagePngBase64('!!!!'), (err: unknown) => err instanceof ServiceError && err.code === 'PROVIDER_INVALID_PAYLOAD');
    assert.throws(() => decodeGptImagePngBase64(''), (err: unknown) => err instanceof ServiceError);
    assert.throws(() => decodeGptImagePngBase64(undefined), (err: unknown) => err instanceof ServiceError);
    const tooLong = 'A'.repeat(Math.ceil((MAX_PROVIDER_IMAGE_BYTES * 4) / 3) + 16);
    assert.throws(() => decodeGptImagePngBase64(tooLong), (err: unknown) => err instanceof ServiceError && err.code === 'PROVIDER_INVALID_PAYLOAD');
  });

  it('10-11. empty data and missing b64_json are rejected even if a url is present', async () => {
    setOpenAiImageFetchForTests(async () => {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    await withEnv({ OPENAI_API_KEY: 'sk-test-not-real-openai' }, async () => {
      await assert.rejects(
        () => generateGptImage({ prompt: 'orb', module: 'logo' }),
        (err: unknown) => err instanceof ServiceError && err.code === 'PROVIDER_INVALID_PAYLOAD'
      );
    });
    setOpenAiImageFetchForTests(async () => {
      return new Response(JSON.stringify({ data: [{ url: 'https://example.invalid/dalle.png' }] }), { status: 200 });
    });
    await withEnv({ OPENAI_API_KEY: 'sk-test-not-real-openai' }, async () => {
      await assert.rejects(
        () => generateGptImage({ prompt: 'orb', module: 'logo' }),
        (err: unknown) => err instanceof ServiceError && err.code === 'PROVIDER_INVALID_PAYLOAD'
      );
    });
  });

  it('13-14. base64 is not logged and not attached to user errors', () => {
    const adapter = src('lib/openai-image.ts');
    assert.doesNotMatch(adapter, /console\.(log|info|debug|error)\(.*b64/i);
    try {
      decodeGptImagePngBase64(PNG_B64 + 'not-valid-extra');
      assert.fail('expected throw');
    } catch (err) {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.message, IMAGE_PROVIDER_FAILED_MESSAGE);
      assert.equal(err.message.includes(PNG_B64), false);
      assert.doesNotMatch(err.message, /sk-/);
    }
  });

  it('15-17. buffer persistence creates an owned file with a download URL', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@o1.persist.test`, 'O1');
    const file = await saveGeneratedAssetFromBuffer(user.id, 'logo', PNG_BUFFER, {
      mimeType: 'image/png',
      name: 'nexter-test.png',
    });
    assert.ok(file?.id);
    assert.equal(file?.userId, user.id);
    assert.equal(file?.source, 'generation');
    const owned = await getUserFile(file!.id, user.id);
    assert.ok(owned);
    const download = await issueFileDownloadUrl(file!.id, user.id);
    assert.ok(download?.downloadUrl);
  });

  it('18. buffer storage failure throws STORAGE_ERROR before a completed file', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@o1.storage.test`, 'O1s');
    setSaveGeneratedAssetTestHooks({ fail: true });
    await assert.rejects(
      () => saveGeneratedAssetFromBuffer(user.id, 'logo', PNG_BUFFER, { mimeType: 'image/png' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'STORAGE_ERROR'
    );
  });

  it('20-23. provider HTTP error, timeout, and invalid payload do not retry', async () => {
    let calls = 0;
    setOpenAiImageFetchForTests(async () => {
      calls += 1;
      return new Response('{"error":{"message":"secret-should-not-leak"}}', { status: 500 });
    });
    await withEnv({ OPENAI_API_KEY: 'sk-test-not-real-openai' }, async () => {
      await assert.rejects(
        () => generateGptImage({ prompt: 'orb', module: 'logo' }),
        (err: unknown) =>
          err instanceof ServiceError &&
          err.code === 'PROVIDER_ERROR' &&
          err.message === IMAGE_PROVIDER_FAILED_MESSAGE &&
          !err.message.includes('secret-should-not-leak')
      );
    });
    assert.equal(calls, 1);

    calls = 0;
    setOpenAiImageFetchForTests(async () => {
      calls += 1;
      const err = new Error('aborted');
      err.name = 'TimeoutError';
      throw err;
    });
    await withEnv({ OPENAI_API_KEY: 'sk-test-not-real-openai' }, async () => {
      await assert.rejects(
        () => generateGptImage({ prompt: 'orb', module: 'logo' }),
        (err: unknown) => err instanceof ServiceError && err.code === 'PROVIDER_TIMEOUT'
      );
    });
    assert.equal(calls, 1);
  });

  it('42-45. transparent/opaque mapping and unsupported size/quality cannot escape mapper', () => {
    assert.equal(mapGptImageBackground('logo', true), 'transparent');
    assert.equal(mapGptImageBackground('facecam', true), 'transparent');
    assert.equal(mapGptImageBackground('overlay', true), 'transparent');
    assert.equal(mapGptImageBackground('sticker', true), 'transparent');
    assert.equal(mapGptImageBackground('banner', true), 'opaque');
    assert.equal(mapGptImageBackground('logo', false), 'opaque');
    assert.equal(mapGptImageSize('1792x1024'), '1536x1024');
    assert.equal(mapGptImageSize('1024x1792'), '1024x1536');
    assert.equal(mapGptImageSize('1920x1080'), '1536x1024');
    assert.equal(mapGptImageSize('nope'), '1024x1024');
    assert.equal(mapGptImageQuality('xhigh'), 'medium');
    assert.equal(mapGptImageQuality('auto'), 'medium');
    const escaped = buildGptImageRequest({ prompt: 'x', size: '99999x1', hd: 'standard', module: 'banner', transparentBackground: true });
    assert.ok(['1024x1024', '1536x1024', '1024x1536'].includes(escaped.size));
    assert.ok(escaped.quality === 'medium' || escaped.quality === 'high');
    assert.equal(escaped.background, 'opaque');
  });

  it('46-47. timeout is bounded; raw provider errors stay hidden', () => {
    assert.equal(OPENAI_GPT_IMAGE_TIMEOUT_MS, 130_000);
    assert.ok(OPENAI_GPT_IMAGE_TIMEOUT_MS > 30_000);
    assert.ok(OPENAI_GPT_IMAGE_TIMEOUT_MS <= 180_000);
    assert.match(src('lib/openai-image.ts'), /AbortSignal\.timeout\(OPENAI_GPT_IMAGE_TIMEOUT_MS\)/);
    assert.doesNotMatch(src('lib/openai-image.ts'), /res\.text\(\)/);
  });

  it('26-41. kill-switch isolation, pricing freeze, and other providers stay off', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        IMAGE_GENERATIONS_ENABLED: undefined,
        NEXTER_CHAT_ENABLED: 'true',
        REPLICATE_API_TOKEN: undefined,
        RUNWAY_API_KEY: undefined,
        ELEVENLABS_API_KEY: undefined,
      },
      () => {
        assert.equal(hasImageAiProvider(), false);
        assert.equal(isNexterChatProviderAvailable(), true);
        assert.equal(hasVideoAiProvider(), false);
        assert.equal(hasMusicAiProvider(), false);
        assert.equal(isTtsGenerationEnabled(), false);
        assert.equal(isElevenLabsTtsLiveEnabled(), false);
      }
    );
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.BANNER_GENERATION], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.FACECAM_GENERATION], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.OVERLAY_GENERATION], 12);
    assert.equal(COIN_COSTS[CoinSpendCategory.STICKER_GENERATION], 8);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.match(src('services/nexter-tts-e2e.test.ts'), /0 Coins|kostenlos|Browser/i);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.match(src('services/image-generation-e2e.test.ts'), /exactly one refund|refundCount|STORAGE_ERROR/);
    assert.match(src('lib/billable-job.ts'), /assertCurrentContentRightsAck/);
    assert.match(src('services/logo.service.ts'), /retryLogoJob[\s\S]*never/);
    assert.match(repo('backend/.env.example'), /IMAGE_GENERATIONS_ENABLED=false/);
  });
});
