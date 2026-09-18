import { describe, it } from 'node:test';
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
  isNexterChatProviderAvailable,
  isOpenAiImageGenerationLiveEnabled,
  isTtsGenerationEnabled,
} from '../config/env.js';
import { ServiceError } from '../lib/errors.js';
import {
  ELEVENLABS_TTS_TIMEOUT_MS,
  IMAGE_GENERATION_UNAVAILABLE_CODE,
  isPaidProviderTestBlocked,
  requireImageProvider,
  requireMusicProvider,
  requireVideoProvider,
  VIDEO_PROVIDER_UNAVAILABLE_CODE,
} from '../lib/media-providers.js';
import { DNA_VISION_BLOCKED_MESSAGE } from '../lib/provider-gate.js';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { getCoinBalance } from './coins.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { analyzeImageWithVision } from './dna-analysis.service.js';
import { generateVoiceTrack, setVoiceTestHooks } from './voice.service.js';
import { afterEach } from 'node:test';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(dir, '..', rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
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
  setVoiceTestHooks(null);
});

describe('Block N — production provider readiness (no live calls)', () => {
  it('1-2. chat key+flag does not enable images; image flag false blocks OpenAI images', async () => {
    await withEnv(
      {
        NEXTER_CHAT_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        IMAGE_GENERATIONS_ENABLED: 'false',
        REPLICATE_API_TOKEN: undefined,
      },
      () => {
        assert.equal(isNexterChatProviderAvailable(), true);
        assert.equal(isOpenAiImageGenerationLiveEnabled(), false);
        assert.equal(hasImageAiProvider(), false);
      }
    );
  });

  it('3. image key/token present + image flag false → 0 provider availability', async () => {
    await withEnv(
      {
        IMAGE_GENERATIONS_ENABLED: 'false',
        GENERATIONS_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
      },
      () => {
        assert.equal(hasImageAiProvider(), false);
        assert.throws(
          () => requireImageProvider(),
          (err: unknown) => err instanceof ServiceError && err.code === IMAGE_GENERATION_UNAVAILABLE_CODE
        );
      }
    );
  });

  it('4/9. missing image provider or missing rights ack → 0 debit', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@n.blockn.test`, 'N', {
      skipContentRightsAck: true,
    });
    const dna = await upsertDna({
      userId: user.id,
      name: 'BlockN',
      styleDirection: 'neon',
      primaryColors: ['#111111'],
    });
    const project = await createProject(user.id, { name: 'N', type: 'logo', dnaId: dna.id });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'BlockN' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => {
        const code = err instanceof ServiceError || (err && typeof err === 'object' && 'code' in err)
          ? String((err as { code: string }).code)
          : '';
        assert.equal(code, 'RIGHTS_ACK_REQUIRED');
        return true;
      }
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(isPaidProviderTestBlocked(), true);
  });

  it('5-8/12-16. quote+confirm safety remains in existing Block A/B/C tests; costs unchanged', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(arePaymentsEnabled(), false);
    assert.match(src('services/image-generation-e2e.test.ts'), /exactly one refund|refundCount|STORAGE_ERROR/);
    assert.match(src('services/video-quote-e2e.test.ts'), /requireVideoProvider\(\)/);
    assert.match(src('services/music-quote-e2e.test.ts'), /requireMusicProvider\(\)/);
  });

  it('10-11. video disabled or provider missing → 0 debit path', async () => {
    await withEnv({ VIDEO_GENERATIONS_ENABLED: 'false', RUNWAY_API_KEY: 'rw_test', REPLICATE_API_TOKEN: 'r8_test' }, () => {
      assert.equal(hasVideoAiProvider(), false);
      assert.throws(
        () => requireVideoProvider(),
        (err: unknown) => err instanceof ServiceError && err.code === VIDEO_PROVIDER_UNAVAILABLE_CODE
      );
    });
    await withEnv({ VIDEO_GENERATIONS_ENABLED: 'true', RUNWAY_API_KEY: undefined, REPLICATE_API_TOKEN: undefined }, () => {
      assert.equal(hasVideoAiProvider(), false);
    });
  });

  it('14. music missing token → unavailable before debit', async () => {
    await withEnv({ REPLICATE_API_TOKEN: undefined, MUSIC_PROVIDER: undefined, MUSIC_GENERATIONS_ENABLED: 'true' }, () => {
      assert.equal(hasMusicAiProvider(), false);
      assert.throws(() => requireMusicProvider(), (err: unknown) => err instanceof ServiceError);
    });
  });

  it('17. music HTTPS persistence, SSRF and size limits stay in safe-provider-fetch', () => {
    const fetchSrc = src('lib/safe-provider-fetch.ts');
    assert.match(fetchSrc, /assertSafeProviderAudioUrl/);
    assert.match(fetchSrc, /https:/);
    assert.match(fetchSrc, /MAX_PROVIDER_AUDIO_BYTES = 20 \* 1024 \* 1024/);
    assert.match(fetchSrc, /PROVIDER_AUDIO_FETCH_TIMEOUT_MS = 30_000/);
    assert.match(src('services/music.service.ts'), /fetchProviderAudio/);
  });

  it('18-20. browser TTS stays free; ElevenLabs fail-closed; voice clone unavailable before debit', async () => {
    assert.match(src('services/nexter-tts-e2e.test.ts'), /0 Coins|kostenlos|Browser/i);
    assert.equal(isTtsGenerationEnabled(), false);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@n.voice.blockn.test`, 'NV');
    const dna = await upsertDna({
      userId: user.id,
      name: 'VoiceN',
      styleDirection: 'neon',
      primaryColors: ['#111111'],
    });
    const project = await createProject(user.id, { name: 'VoiceN', type: 'logo', dnaId: dna.id });
    const before = await getCoinBalance(user.id);
    await assert.rejects(
      () =>
        generateVoiceTrack(user.id, project.id, {
          text: 'Hallo Welt',
          voiceClone: true,
          referenceAudioDataUrl: 'data:audio/wav;base64,AAAA',
        }),
      (err: unknown) =>
        err instanceof ServiceError &&
        (err.code === 'VOICE_CLONE_CONSENT_REQUIRED' || err.code === 'VOICE_CLONE_NOT_AVAILABLE')
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.match(src('services/voice.service.ts'), /VOICE_CLONE_NOT_AVAILABLE/);
    const voiceFn = src('services/voice.service.ts').slice(src('services/voice.service.ts').indexOf('export async function generateVoiceTrack'));
    assert.ok(voiceFn.indexOf('assertVoiceCloneConsent') < voiceFn.indexOf('withCoinCharge'));
  });

  it('21. provider errors do not leak response bodies or keys', () => {
    const media = src('lib/media-providers.ts');
    assert.doesNotMatch(media, /createRes\.text\(\)|pollRes\.text\(\)/);
    assert.match(media, /throwProviderFailed/);
    const billable = src('lib/billable-job.ts');
    const chargeFn = billable.slice(billable.indexOf('export async function withCoinCharge'));
    assert.doesNotMatch(chargeFn.slice(0, chargeFn.indexOf('export async function withCoinChargePack')), /err\.message : description/);
    assert.match(src('services/text.service.ts'), /AI_PROVIDER_ERROR', 'OpenAI-Fehler'/);
    assert.doesNotMatch(repo('frontend/src/services/api.ts'), /VITE_OPENAI|VITE_REPLICATE|VITE_ELEVENLABS|VITE_RUNWAY/);
    assert.doesNotMatch(src('services/client-config.service.ts'), /OPENAI_API_KEY|ELEVENLABS_API_KEY/);
  });

  it('22-23. bounded timeouts exist; paid retry is quote-gated not auto', () => {
    assert.equal(ELEVENLABS_TTS_TIMEOUT_MS, 30_000);
    const media = src('lib/media-providers.ts');
    assert.match(media, /AbortSignal\.timeout/);
    assert.match(media, /REPLICATE_MUSIC_CREATE_TIMEOUT_MS = 130_000/);
    assert.match(media, /REPLICATE_VIDEO_CREATE_TIMEOUT_MS = 190_000/);
    assert.match(src('services/ai.service.ts'), /AbortSignal\.timeout\(30_000\)/);
    assert.match(src('services/logo.service.ts'), /retryLogoJob[\s\S]*never/);
    assert.match(src('lib/media-providers.ts'), /attempts < 90|attempts < 120/);
  });

  it('24-26. ownership, signed download, and Block R rights gate stay in place', () => {
    assert.match(src('lib/billable-job.ts'), /assertCurrentContentRightsAck/);
    const chargeFn = src('lib/billable-job.ts').slice(src('lib/billable-job.ts').indexOf('export async function withCoinCharge'));
    assert.ok(chargeFn.indexOf('assertChargeAllowed') < chargeFn.indexOf('deductCoins'));
    assert.match(src('services/file-cloud.service.ts'), /issueFileDownloadUrl/);
    assert.match(src('services/content-rights.service.ts'), /adminTakedownReportedFile/);
    assert.match(src('services/ai.service.ts'), /saveGeneratedAsset|saveUserFile/);
  });

  it('image routing: OpenAI primary when live, else Replicate; Suno stays disabled', () => {
    const ai = src('services/ai.service.ts');
    const openaiIdx = ai.indexOf('liveOpenAiImages');
    const replicateIdx = ai.indexOf('generateWithReplicate');
    assert.ok(openaiIdx >= 0 && replicateIdx > openaiIdx);
    assert.match(src('lib/media-providers.ts'), /if \(getRunwayApiKey\(\)\)/);
    const runwayIdx = src('lib/media-providers.ts').indexOf('generateVideoWithRunway');
    const repVidIdx = src('lib/media-providers.ts').indexOf('generateVideoWithReplicate');
    assert.ok(runwayIdx >= 0 && src('lib/media-providers.ts').indexOf('if (getRunwayApiKey())') < src('lib/media-providers.ts').indexOf('if (getReplicateApiToken())'));
    assert.match(src('lib/media-providers.ts'), /UNOFFICIAL_SUNO_DISABLED/);
    assert.match(src('lib/media-providers.ts'), /MUSIC_PROVIDER_DISABLED/);
    void replicateIdx;
    void repVidIdx;
  });

  it('Creator DNA vision stays provider-gated and does not call OpenAI', async () => {
    await assert.rejects(
      () =>
        analyzeImageWithVision(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'neon'
        ),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === 'AI_NOT_CONFIGURED' &&
        (err.message === DNA_VISION_BLOCKED_MESSAGE || /OPENAI_API_KEY/.test(err.message))
    );
    assert.match(src('services/dna-analysis.service.ts'), /DNA_VISION_BLOCKED_MESSAGE/);
    assert.doesNotMatch(src('services/dna-analysis.service.ts'), /api\.openai\.com/);
  });

  it('Gemini is status-only; no generation adapter in media-providers', () => {
    assert.match(src('config/env.ts'), /getGeminiApiKey/);
    assert.doesNotMatch(src('lib/media-providers.ts'), /gemini|generativelanguage/i);
    assert.equal(src('services/ai.service.ts').toLowerCase().includes('gemini'), false);
  });

  it('34-35. payments off, tests remain NODE_TEST blocked from live providers', () => {
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.match(src('lib/media-providers.ts'), /isPaidProviderTestBlocked/);
  });
});
