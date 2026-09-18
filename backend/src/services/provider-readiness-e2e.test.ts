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
  getPaidGenerationAvailability,
  hasImageAiProvider,
  hasMusicAiProvider,
  hasVideoAiProvider,
  isElevenLabsTtsLiveEnabled,
  isNexterChatProviderAvailable,
  isOpenAiImageGenerationLiveEnabled,
  isTtsGenerationEnabled,
} from '../config/env.js';
import { ServiceError } from '../lib/errors.js';
import {
  ELEVENLABS_TTS_TIMEOUT_MS,
  IMAGE_GENERATION_UNAVAILABLE_CODE,
  isPaidProviderTestBlocked,
  MUSIC_PROVIDER_UNAVAILABLE_CODE,
  requireImageProvider,
  requireMusicProvider,
  requireVideoProvider,
  VIDEO_PROVIDER_UNAVAILABLE_CODE,
} from '../lib/media-providers.js';
import { DNA_VISION_BLOCKED_MESSAGE } from '../lib/provider-gate.js';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
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

const NOT_TRUE_FLAG_VALUES: Array<string | undefined> = [
  undefined,
  '',
  'false',
  'FALSE',
  '0',
  'yes',
  'on',
  '1',
  'enabled',
];

describe('Block N.1 — provider kill-switch hardening (fail-closed)', () => {
  it('1-2. OpenAI key + image unset/false/non-true → image blocked', async () => {
    for (const value of NOT_TRUE_FLAG_VALUES) {
      await withEnv(
        {
          GENERATIONS_ENABLED: 'true',
          OPENAI_API_KEY: 'sk-test-not-real-openai',
          REPLICATE_API_TOKEN: undefined,
          IMAGE_GENERATIONS_ENABLED: value,
        },
        () => {
          assert.equal(hasImageAiProvider(), false);
          assert.equal(getPaidGenerationAvailability().image, false);
          assert.throws(
            () => requireImageProvider(),
            (err: unknown) => err instanceof ServiceError && err.code === IMAGE_GENERATION_UNAVAILABLE_CODE
          );
        }
      );
    }
  });

  it('3. OpenAI key + IMAGE_GENERATIONS_ENABLED=true → mocked image availability allowed', async () => {
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        REPLICATE_API_TOKEN: undefined,
        IMAGE_GENERATIONS_ENABLED: 'true',
      },
      () => {
        assert.equal(hasImageAiProvider(), true);
        assert.equal(getPaidGenerationAvailability().image, true);
      }
    );
  });

  it('4. Chat enabled + image disabled → chat allowed / image blocked', async () => {
    await withEnv(
      {
        NEXTER_CHAT_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        IMAGE_GENERATIONS_ENABLED: 'false',
        REPLICATE_API_TOKEN: undefined,
      },
      () => {
        assert.equal(isNexterChatProviderAvailable(), true);
        assert.equal(getPaidGenerationAvailability().chat, true);
        assert.equal(hasImageAiProvider(), false);
        assert.equal(getPaidGenerationAvailability().image, false);
      }
    );
  });

  it('5-8. shared Replicate token is isolated per feature flag', async () => {
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
        OPENAI_API_KEY: undefined,
        RUNWAY_API_KEY: undefined,
        IMAGE_GENERATIONS_ENABLED: undefined,
        MUSIC_GENERATIONS_ENABLED: undefined,
        VIDEO_GENERATIONS_ENABLED: undefined,
      },
      () => {
        const avail = getPaidGenerationAvailability();
        assert.equal(avail.image, false);
        assert.equal(avail.music, false);
        assert.equal(avail.video, false);
      }
    );
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
        OPENAI_API_KEY: undefined,
        RUNWAY_API_KEY: undefined,
        IMAGE_GENERATIONS_ENABLED: 'true',
        MUSIC_GENERATIONS_ENABLED: 'false',
        VIDEO_GENERATIONS_ENABLED: 'false',
      },
      () => {
        const avail = getPaidGenerationAvailability();
        assert.equal(avail.image, true);
        assert.equal(avail.music, false);
        assert.equal(avail.video, false);
        assert.throws(() => requireMusicProvider(), (err: unknown) => err instanceof ServiceError && err.code === MUSIC_PROVIDER_UNAVAILABLE_CODE);
        assert.throws(() => requireVideoProvider(), (err: unknown) => err instanceof ServiceError && err.code === VIDEO_PROVIDER_UNAVAILABLE_CODE);
      }
    );
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
        OPENAI_API_KEY: undefined,
        RUNWAY_API_KEY: undefined,
        IMAGE_GENERATIONS_ENABLED: 'false',
        MUSIC_GENERATIONS_ENABLED: 'true',
        VIDEO_GENERATIONS_ENABLED: 'false',
      },
      () => {
        const avail = getPaidGenerationAvailability();
        assert.equal(avail.image, false);
        assert.equal(avail.music, true);
        assert.equal(avail.video, false);
      }
    );
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
        OPENAI_API_KEY: undefined,
        RUNWAY_API_KEY: undefined,
        IMAGE_GENERATIONS_ENABLED: 'false',
        MUSIC_GENERATIONS_ENABLED: 'false',
        VIDEO_GENERATIONS_ENABLED: 'true',
      },
      () => {
        const avail = getPaidGenerationAvailability();
        assert.equal(avail.image, false);
        assert.equal(avail.music, false);
        assert.equal(avail.video, true);
      }
    );
  });

  it('9-11. Runway key alone does not enable video; exact true allows mocked availability', async () => {
    for (const value of [undefined, 'false', 'yes', 'on'] as const) {
      await withEnv(
        {
          GENERATIONS_ENABLED: 'true',
          RUNWAY_API_KEY: 'rw_test_not_real',
          REPLICATE_API_TOKEN: undefined,
          VIDEO_GENERATIONS_ENABLED: value,
        },
        () => {
          assert.equal(hasVideoAiProvider(), false);
          assert.throws(
            () => requireVideoProvider(),
            (err: unknown) => err instanceof ServiceError && err.code === VIDEO_PROVIDER_UNAVAILABLE_CODE
          );
        }
      );
    }
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        RUNWAY_API_KEY: 'rw_test_not_real',
        REPLICATE_API_TOKEN: undefined,
        VIDEO_GENERATIONS_ENABLED: 'true',
      },
      () => {
        assert.equal(hasVideoAiProvider(), true);
        assert.equal(getPaidGenerationAvailability().video, true);
      }
    );
  });

  it('12-14. Replicate token alone does not enable MusicGen; exact true allows mocked availability', async () => {
    for (const value of [undefined, 'false', 'yes'] as const) {
      await withEnv(
        {
          GENERATIONS_ENABLED: 'true',
          REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
          MUSIC_PROVIDER: undefined,
          MUSIC_GENERATIONS_ENABLED: value,
        },
        () => {
          assert.equal(hasMusicAiProvider(), false);
          assert.throws(
            () => requireMusicProvider(),
            (err: unknown) => err instanceof ServiceError && err.code === MUSIC_PROVIDER_UNAVAILABLE_CODE
          );
        }
      );
    }
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
        MUSIC_PROVIDER: undefined,
        MUSIC_GENERATIONS_ENABLED: 'true',
      },
      () => {
        assert.equal(hasMusicAiProvider(), true);
        assert.equal(getPaidGenerationAvailability().music, true);
      }
    );
  });

  it('15-17. ElevenLabs key alone does not enable Voice Studio; exact true allows mocked availability', async () => {
    for (const value of [undefined, 'false', 'on'] as const) {
      await withEnv(
        {
          GENERATIONS_ENABLED: 'true',
          ELEVENLABS_API_KEY: 'sk_test_not_a_real_elevenlabs_key',
          TTS_GENERATION_ENABLED: value,
        },
        () => {
          assert.equal(isTtsGenerationEnabled(), false);
          assert.equal(isElevenLabsTtsLiveEnabled(), false);
          assert.equal(getPaidGenerationAvailability().tts, false);
        }
      );
    }
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        ELEVENLABS_API_KEY: 'sk_test_not_a_real_elevenlabs_key',
        TTS_GENERATION_ENABLED: 'true',
      },
      () => {
        assert.equal(isTtsGenerationEnabled(), true);
        assert.equal(isElevenLabsTtsLiveEnabled(), true);
        assert.equal(getPaidGenerationAvailability().tts, true);
      }
    );
  });

  it('18. browser TTS stays 0 coins and independent of ElevenLabs', () => {
    assert.match(src('services/nexter-tts-e2e.test.ts'), /0 Coins|kostenlos|Browser/i);
    const tts = repo('shared/src/nexter-tts.ts');
    assert.doesNotMatch(tts, /withCoinCharge/);
    assert.doesNotMatch(tts, /ELEVENLABS/);
  });

  it('19. global GENERATIONS_ENABLED=false blocks image/video/music/TTS even if feature flags are true', async () => {
    await withEnv(
      {
        GENERATIONS_ENABLED: 'false',
        IMAGE_GENERATIONS_ENABLED: 'true',
        VIDEO_GENERATIONS_ENABLED: 'true',
        MUSIC_GENERATIONS_ENABLED: 'true',
        TTS_GENERATION_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
        RUNWAY_API_KEY: 'rw_test_not_real',
        ELEVENLABS_API_KEY: 'sk_test_not_a_real_elevenlabs_key',
      },
      () => {
        const avail = getPaidGenerationAvailability();
        assert.equal(avail.image, false);
        assert.equal(avail.video, false);
        assert.equal(avail.music, false);
        assert.equal(avail.tts, false);
        assert.equal(isTtsGenerationEnabled(), false);
      }
    );
  });

  it('20-22. feature disabled → 0 debit, 0 provider path, no refund', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@n1.debit.test`, 'N1');
    const dna = await upsertDna({
      userId: user.id,
      name: 'N1',
      styleDirection: 'neon',
      primaryColors: ['#111111'],
    });
    const project = await createProject(user.id, { name: 'N1', type: 'logo', dnaId: dna.id });
    await withEnv(
      {
        GENERATIONS_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        REPLICATE_API_TOKEN: 'r8_test_not_real_replicate_token',
        IMAGE_GENERATIONS_ENABLED: undefined,
      },
      async () => {
        assert.equal(hasImageAiProvider(), false);
        const before = await getCoinBalance(user.id);
        const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'N1' });
        await assert.rejects(
          () => confirmQuote(user.id, quote.id),
          (err: unknown) => err instanceof ServiceError && err.code === IMAGE_GENERATION_UNAVAILABLE_CODE
        );
        assert.equal(await getCoinBalance(user.id), before);
        const tx = await getTransactions(user.id);
        assert.equal(tx.filter((row) => row.type === 'spend').length, 0);
        assert.equal(tx.filter((row) => row.type === 'refund').length, 0);
      }
    );
  });

  it('23-26. rights gate, duplicate confirm, and refund-once paths stay before debit/provider', () => {
    const billable = src('lib/billable-job.ts');
    const chargeFn = billable.slice(billable.indexOf('export async function withCoinCharge'));
    assert.ok(chargeFn.indexOf('assertCurrentContentRightsAck') < chargeFn.indexOf('deductCoins'));
    assert.ok(chargeFn.indexOf('assertChargeAllowed') < chargeFn.indexOf('deductCoins'));
    assert.match(src('services/image-generation-e2e.test.ts'), /exactly one refund|refundCount|STORAGE_ERROR/);
    assert.match(src('services/video-quote-e2e.test.ts'), /requireVideoProvider\(\)/);
    assert.match(src('services/music-quote-e2e.test.ts'), /requireMusicProvider\(\)/);
    const logo = src('services/logo.service.ts');
    const generateLogo = logo.slice(logo.indexOf('export async function generateLogoAsset'));
    assert.ok(generateLogo.indexOf("assertImageProviderReadyForStudio('logo')") < generateLogo.indexOf('withCoinCharge'));
  });

  it('27-35. pricing, welcome, browser TTS, and payments stay frozen', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(arePaymentsEnabled(), false);
    assert.match(src('services/nexter-tts-e2e.test.ts'), /0 Coins|kostenlos|Browser/i);
  });

  it('36-37. fail-closed env helper is central; Block N tests and Suno stay preserved', () => {
    const env = src('config/env.ts');
    assert.match(env, /function isEnvFlagTrue/);
    assert.match(env, /isEnvFlagTrue\('VIDEO_GENERATIONS_ENABLED'\)/);
    assert.match(env, /isEnvFlagTrue\('MUSIC_GENERATIONS_ENABLED'\)/);
    assert.match(env, /isEnvFlagTrue\('IMAGE_GENERATIONS_ENABLED'\)/);
    assert.match(env, /isEnvFlagTrue\('TTS_GENERATION_ENABLED'\)/);
    assert.match(env, /isEnvFlagTrue\('NEXTER_CHAT_ENABLED'\)/);
    assert.match(env, /isEnvFlagTrue\('PAYMENTS_ENABLED'\)/);
    assert.doesNotMatch(env, /VIDEO_GENERATIONS_ENABLED'\) !== 'false'/);
    assert.doesNotMatch(env, /MUSIC_GENERATIONS_ENABLED'\) !== 'false'/);
    assert.doesNotMatch(env, /IMAGE_GENERATIONS_ENABLED'\) !== 'false'/);
    assert.match(src('routes/status.routes.ts'), /getPaidGenerationAvailability\(\)/);
    assert.match(src('lib/media-providers.ts'), /areMusicGenerationsEnabled\(\)/);
    assert.match(src('lib/media-providers.ts'), /UNOFFICIAL_SUNO_DISABLED/);
    assert.match(repo('backend/.env.example'), /VIDEO_GENERATIONS_ENABLED=false/);
    assert.match(repo('backend/.env.example'), /MUSIC_GENERATIONS_ENABLED=false/);
    assert.equal(isPaidProviderTestBlocked(), true);
  });
});
