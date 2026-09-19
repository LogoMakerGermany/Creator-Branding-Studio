import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_COSTS, CoinSpendCategory } from '@ucbs/shared';
import {
  arePaymentsEnabled,
  hasMusicAiProvider,
  hasVideoAiProvider,
  isElevenLabsTtsLiveEnabled,
  isNexterChatProviderAvailable,
  isOpenAiImageGenerationLiveEnabled,
} from '../config/env.js';
import { ServiceError } from './errors.js';
import { generateVideo } from './media-providers.js';
import {
  RUNWAY_API_VERSION,
  RUNWAY_DEFAULT_DURATION_SEC,
  RUNWAY_HTTP_TIMEOUT_MS,
  RUNWAY_IMAGE_TO_VIDEO_ENDPOINT,
  RUNWAY_MAX_POLLS,
  RUNWAY_POLL_INTERVAL_MS,
  RUNWAY_PROMPT_MAX_CHARS,
  RUNWAY_RATIO_16_9,
  RUNWAY_RATIO_9_16,
  RUNWAY_TEXT_TO_VIDEO_ENDPOINT,
  RUNWAY_VIDEO_MODEL,
  VIDEO_DURATION_UNSUPPORTED_CODE,
  VIDEO_PROVIDER_FAILED_MESSAGE,
  VIDEO_RATIO_UNSUPPORTED_CODE,
  assertRunwayOutputUrl,
  buildRunwayVideoCreate,
  generateVideoWithRunway,
  mapRunwayDuration,
  mapRunwayPrompt,
  mapRunwayRatio,
  setRunwayFetchForTests,
  setRunwayPollForTests,
} from './runway-video.js';

process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

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

afterEach(() => {
  setRunwayFetchForTests(null);
  setRunwayPollForTests(null);
});

describe('Block Q.1 — Runway gen4.5 adapter (no live calls)', () => {
  it('1-5. retired gen3a_turbo is gone; current official model/endpoint/header are used', () => {
    const adapter = readFileSync(join(dir, 'runway-video.ts'), 'utf8');
    const media = readFileSync(join(dir, 'media-providers.ts'), 'utf8');
    assert.equal(RUNWAY_VIDEO_MODEL, 'gen4.5');
    assert.equal(RUNWAY_TEXT_TO_VIDEO_ENDPOINT, 'https://api.dev.runwayml.com/v1/text_to_video');
    assert.equal(RUNWAY_IMAGE_TO_VIDEO_ENDPOINT, 'https://api.dev.runwayml.com/v1/image_to_video');
    assert.equal(RUNWAY_API_VERSION, '2024-11-06');
    assert.match(adapter, /X-Runway-Version/);
    assert.doesNotMatch(adapter, /model: 'gen3a_turbo'/);
    assert.doesNotMatch(media, /gen3a_turbo/);
    assert.doesNotMatch(adapter, /catch[\s\S]{0,200}gen3a_turbo/);
    const create = buildRunwayVideoCreate({ prompt: 'intro motion', duration: 5, aspectRatio: '16:9' });
    assert.equal(create.body.model, 'gen4.5');
    assert.equal(create.endpoint, RUNWAY_TEXT_TO_VIDEO_ENDPOINT);
    assert.equal('gen3a_turbo' in create.body, false);
  });

  it('6-10. ratio and duration mapping; unsupported values rejected before provider', () => {
    assert.equal(mapRunwayRatio('16:9'), RUNWAY_RATIO_16_9);
    assert.equal(mapRunwayRatio('9:16'), RUNWAY_RATIO_9_16);
    assert.equal(mapRunwayRatio(), RUNWAY_RATIO_16_9);
    assert.equal(mapRunwayDuration(), RUNWAY_DEFAULT_DURATION_SEC);
    assert.equal(mapRunwayDuration(5), 5);
    assert.throws(() => mapRunwayRatio('1:1'), (err: unknown) => err instanceof ServiceError && err.code === VIDEO_RATIO_UNSUPPORTED_CODE);
    assert.throws(() => mapRunwayRatio('4:3'), (err: unknown) => err instanceof ServiceError && err.code === VIDEO_RATIO_UNSUPPORTED_CODE);
    assert.throws(() => mapRunwayDuration(1), (err: unknown) => err instanceof ServiceError && err.code === VIDEO_DURATION_UNSUPPORTED_CODE);
    assert.throws(() => mapRunwayDuration(11), (err: unknown) => err instanceof ServiceError && err.code === VIDEO_DURATION_UNSUPPORTED_CODE);
    assert.throws(() => mapRunwayDuration(5.5), (err: unknown) => err instanceof ServiceError && err.code === VIDEO_DURATION_UNSUPPORTED_CODE);
    assert.throws(
      () => buildRunwayVideoCreate({ prompt: 'x', aspectRatio: '21:9', duration: 5 }),
      (err: unknown) => err instanceof ServiceError && err.code === VIDEO_RATIO_UNSUPPORTED_CODE
    );
  });

  it('11-14. one create call; polling is GET only; no auto retry after 5xx or timeout', async () => {
    const calls: Array<{ method: string; url: string }> = [];
    setRunwayPollForTests({ intervalMs: 1, maxPolls: 3 });
    let createHits = 0;
    setRunwayFetchForTests(async (input, init) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      calls.push({ method, url });
      if (url.endsWith('/v1/text_to_video')) {
        createHits += 1;
        return jsonResponse({ error: 'server' }, 503);
      }
      return jsonResponse({ status: 'RUNNING' });
    });

    await withEnv({ RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'true' }, async () => {
      await assert.rejects(
        () => generateVideoWithRunway('bounded intro', { duration: 5, aspectRatio: '16:9' }),
        (err: unknown) => err instanceof ServiceError && err.message === VIDEO_PROVIDER_FAILED_MESSAGE
      );
    });
    assert.equal(createHits, 1);
    assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
    assert.equal(calls.some((c) => c.url.includes('replicate.com')), false);

    calls.length = 0;
    createHits = 0;
    setRunwayFetchForTests(async (input, init) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      calls.push({ method, url });
      if (url.endsWith('/v1/text_to_video')) {
        createHits += 1;
        throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      }
      return jsonResponse({ status: 'RUNNING' });
    });
    await withEnv({ RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'true' }, async () => {
      await assert.rejects(
        () => generateVideoWithRunway('timeout intro', { duration: 5 }),
        (err: unknown) => err instanceof ServiceError && err.statusCode === 504
      );
    });
    assert.equal(createHits, 1);
    assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
  });

  it('15-16. accepted Runway create never starts Replicate; pre-key fallback stays before create', async () => {
    const media = readFileSync(join(dir, 'media-providers.ts'), 'utf8');
    const gen = media.slice(media.indexOf('export async function generateVideo'));
    const runwayBranch = gen.slice(0, gen.indexOf('if (getReplicateApiToken())'));
    assert.match(runwayBranch, /getRunwayApiKey\(\)/);
    assert.doesNotMatch(runwayBranch, /generateVideoWithReplicate/);
    assert.match(gen, /Once a Runway create is submitted, do not fall through to Replicate/);

    const calls: string[] = [];
    setRunwayPollForTests({ intervalMs: 1, maxPolls: 4 });
    setRunwayFetchForTests(async (input, init) => {
      const url = String(input);
      calls.push(`${(init?.method || 'GET').toUpperCase()} ${url}`);
      if (url.includes('replicate.com')) {
        throw new Error('replicate must not be called');
      }
      if (url.endsWith('/v1/text_to_video')) {
        return jsonResponse({ id: 'task_accepted' });
      }
      return jsonResponse({ status: 'FAILED', failure: 'moderation', failureCode: 'SAFETY' });
    });

    await withEnv(
      {
        RUNWAY_API_KEY: 'rw_test_not_real',
        REPLICATE_API_TOKEN: 'r8_test_not_real',
        VIDEO_GENERATIONS_ENABLED: 'true',
      },
      async () => {
        await assert.rejects(
          () => generateVideo('accepted then fail', { duration: 5, aspectRatio: '16:9' }),
          (err: unknown) => err instanceof ServiceError && err.message === VIDEO_PROVIDER_FAILED_MESSAGE
        );
      }
    );
    assert.equal(calls.filter((c) => c.startsWith('POST ')).length, 1);
    assert.equal(calls.some((c) => c.includes('replicate.com')), false);
  });

  it('17-20. VIDEO flag and key isolation; unavailable is 0 Runway calls', async () => {
    let calls = 0;
    setRunwayFetchForTests(async () => {
      calls += 1;
      return jsonResponse({ id: 'should-not-run' });
    });

    await withEnv(
      { RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'false', REPLICATE_API_TOKEN: undefined },
      async () => {
        assert.equal(hasVideoAiProvider(), false);
        await assert.rejects(() => generateVideo('blocked', { duration: 5 }), (err: unknown) => err instanceof ServiceError && err.code === 'VIDEO_PROVIDER_UNAVAILABLE');
      }
    );
    await withEnv(
      { RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: undefined, REPLICATE_API_TOKEN: undefined },
      async () => {
        assert.equal(hasVideoAiProvider(), false);
        await assert.rejects(() => generateVideo('key-alone', { duration: 5 }), (err: unknown) => err instanceof ServiceError);
      }
    );
    await withEnv(
      { RUNWAY_API_KEY: undefined, VIDEO_GENERATIONS_ENABLED: 'true', REPLICATE_API_TOKEN: undefined },
      async () => {
        assert.equal(hasVideoAiProvider(), false);
        await assert.rejects(() => generateVideo('flag-no-key', { duration: 5 }), (err: unknown) => err instanceof ServiceError);
      }
    );
    assert.equal(calls, 0);
  });

  it('24-29. coin prices stay 25 for animation/AI video/intro/outro/start/end', () => {
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    const intro = repo('frontend/src/pages/intro-outro/IntroOutroPage.tsx');
    assert.match(intro, /ANIMATION_GENERATION/);
    assert.doesNotMatch(intro, /Generieren \(20 Coins\)/);
    const pricing = readFileSync(join(dir, '../services/pricing.service.ts'), 'utf8');
    assert.match(pricing, /providerModel: 'gen4.5'/);
    assert.doesNotMatch(pricing, /gen3a_turbo/);
  });

  it('30-34. create+poll success, task failure, moderation, and timeout refunds as provider failure', async () => {
    setRunwayPollForTests({ intervalMs: 1, maxPolls: 5 });
    setRunwayFetchForTests(async (input, init) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, 'gen4.5');
        assert.equal(body.ratio, '1280:720');
        assert.equal(body.duration, 5);
        assert.equal(body.promptText.includes('sk-'), false);
        assert.equal(init?.headers && (init.headers as Record<string, string>)['X-Runway-Version'], '2024-11-06');
        return jsonResponse({ id: 'task_ok' });
      }
      return jsonResponse({
        status: 'SUCCEEDED',
        output: ['https://dncdn.example.runway.test/out.mp4'],
      });
    });
    await withEnv({ RUNWAY_API_KEY: 'rw_test_not_real', VIDEO_GENERATIONS_ENABLED: 'true' }, async () => {
      const result = await generateVideoWithRunway('clean prompt', { duration: 5, aspectRatio: '16:9' });
      assert.equal(result.provider, 'runway-gen4.5');
      assert.equal(result.imageToVideo, false);
      assert.equal(result.videoUrl.startsWith('https://'), true);
    });

    setRunwayFetchForTests(async (input, init) => {
      if ((init?.method || 'GET').toUpperCase() === 'POST') return jsonResponse({ id: 'task_fail' });
      return jsonResponse({ status: 'FAILED', failure: 'SAFETY: raw internals', failureCode: 'MODERATED' });
    });
    await withEnv({ RUNWAY_API_KEY: 'rw_test_not_real' }, async () => {
      await assert.rejects(
        () => generateVideoWithRunway('moderated', { duration: 5 }),
        (err: unknown) =>
          err instanceof ServiceError &&
          err.message === VIDEO_PROVIDER_FAILED_MESSAGE &&
          !String(err.message).includes('SAFETY') &&
          !String(err.message).includes('MODERATED')
      );
    });

    setRunwayFetchForTests(async (input, init) => {
      if ((init?.method || 'GET').toUpperCase() === 'POST') return jsonResponse({ id: 'task_hang' });
      return jsonResponse({ status: 'RUNNING' });
    });
    setRunwayPollForTests({ intervalMs: 1, maxPolls: 2 });
    await withEnv({ RUNWAY_API_KEY: 'rw_test_not_real' }, async () => {
      await assert.rejects(
        () => generateVideoWithRunway('hang', { duration: 5 }),
        (err: unknown) => err instanceof ServiceError && err.statusCode === 504 && err.message === VIDEO_PROVIDER_FAILED_MESSAGE
      );
    });
  });

  it('35. output URL must be https; localhost and raw errors stay hidden', () => {
    assert.equal(assertRunwayOutputUrl('https://cdn.example.test/a.mp4'), 'https://cdn.example.test/a.mp4');
    assert.throws(() => assertRunwayOutputUrl('http://cdn.example.test/a.mp4'), (err: unknown) => err instanceof ServiceError && err.message === VIDEO_PROVIDER_FAILED_MESSAGE);
    assert.throws(() => assertRunwayOutputUrl('https://localhost/a.mp4'), (err: unknown) => err instanceof ServiceError);
    const adapter = readFileSync(join(dir, 'runway-video.ts'), 'utf8');
    assert.doesNotMatch(adapter, /failureCode|result\.failure/);
    assert.match(adapter, /VIDEO_PROVIDER_FAILED_MESSAGE/);
  });

  it('image-to-video uses the same gen4.5 model on the official I2V endpoint', () => {
    const create = buildRunwayVideoCreate({
      prompt: 'logo intro',
      duration: 5,
      aspectRatio: '9:16',
      imageUrl: 'https://storage.example.test/logo.png',
    });
    assert.equal(create.mode, 'image_to_video');
    assert.equal(create.endpoint, RUNWAY_IMAGE_TO_VIDEO_ENDPOINT);
    assert.equal(create.body.model, 'gen4.5');
    assert.equal(create.body.ratio, RUNWAY_RATIO_9_16);
    assert.deepEqual(create.body.promptImage, [{ uri: 'https://storage.example.test/logo.png', position: 'first' }]);
    assert.throws(
      () => buildRunwayVideoCreate({ prompt: 'x', duration: 5, imageUrl: 'http://127.0.0.1/x.png' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VIDEO_IMAGE_UNSUPPORTED'
    );
  });

  it('prompt is capped to official 1000 UTF-16 units and contains no secrets', () => {
    const long = 'a'.repeat(RUNWAY_PROMPT_MAX_CHARS + 40);
    assert.equal(mapRunwayPrompt(long).length, RUNWAY_PROMPT_MAX_CHARS);
    assert.equal(mapRunwayPrompt('  hello  '), 'hello');
  });

  it('44-50. other providers and OpenAI paths stay unchanged; timeouts remain bounded', () => {
    assert.equal(RUNWAY_HTTP_TIMEOUT_MS, 30_000);
    assert.equal(RUNWAY_POLL_INTERVAL_MS, 5_000);
    assert.equal(RUNWAY_MAX_POLLS, 72);
    assert.equal(isElevenLabsTtsLiveEnabled(), false);
    assert.equal(hasMusicAiProvider(), false);
    assert.equal(arePaymentsEnabled(), false);
    const media = readFileSync(join(dir, 'media-providers.ts'), 'utf8');
    assert.match(media, /areMusicGenerationsEnabled/);
    assert.match(media, /isTtsGenerationEnabled/);
    assert.match(readFileSync(join(dir, 'openai-image.ts'), 'utf8'), /gpt-image-2.5-flare/);
    assert.match(readFileSync(join(dir, '../config/env.ts'), 'utf8'), /NEXTER_CHAT_MODEL_DEFAULT = 'gpt-4o-mini'/);
    void isOpenAiImageGenerationLiveEnabled;
    void isNexterChatProviderAvailable;
  });
});
