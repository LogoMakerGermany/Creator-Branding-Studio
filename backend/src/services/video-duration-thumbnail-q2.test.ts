import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANIMATION_TYPES,
  COIN_COSTS,
  CoinSpendCategory,
  GENERATED_VIDEO_DURATION_DEFAULT_SEC,
  GENERATED_VIDEO_DURATION_MAX_SEC,
  GENERATED_VIDEO_DURATION_MIN_SEC,
  applyAnimationChangeRequest,
  defaultAnimationPlan,
  inspectGeneratedVideoQuoteDuration,
  parseAnimationIntent,
  parseGeneratedVideoDurationFromMessage,
  validateGeneratedVideoDuration,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { getCoinBalance } from './coins.service.js';
import { saveUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import {
  generateVideoThumbnail,
  isPaidProviderTestBlocked,
} from '../lib/media-providers.js';
import {
  arePaymentsEnabled,
  hasMusicAiProvider,
  isElevenLabsTtsLiveEnabled,
} from '../config/env.js';
import { MAX_VIDEO_DURATION_SEC } from '../lib/upload-validation.js';
import {
  VIDEO_THUMBNAIL_TIMEOUT_MS,
  createTinyTestVideo,
  extractStillThumbnailJpegFromDataUrl,
  extractVideoThumbnailJpeg,
} from '../lib/video-processing.js';
import { setAnimationTestHooks, generateAnimation } from './animation.service.js';
import { setAiVideoTestHooks, generateAiVideo } from './ai-video.service.js';
import { createQuote, listOwnedQuotes } from './nexter/quotes.service.js';
import { coinCostForKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { RUNWAY_VIDEO_MODEL } from '../lib/runway-video.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(dir, '../../..', rel), 'utf8');
}

function lastContent(session: { messages: Array<{ content: string }> }): string {
  return session.messages.at(-1)?.content || '';
}

function hasStartGeneration(session: { messages: Array<{ actions?: Array<{ tool: string }> }> }): boolean {
  return (session.messages.at(-1)?.actions ?? []).some((a) => a.tool === 'start_generation');
}

afterEach(() => {
  setAnimationTestHooks(null);
  setAiVideoTestHooks(null);
});

async function seed(tag: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.q2.test`, tag);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
  });
  const project = await createProject(user.id, { name: 'Q2 Video', type: 'streamset', dnaId: dna.id });
  const file = await saveUserFile(user.id, {
    name: 'logo.png',
    mimeType: 'image/png',
    category: 'logo',
    dataUrl: PIXEL,
    source: 'upload',
    projectId: project.id,
  });
  return { user, dna, project, file };
}

describe('Block Q.2 — generated video duration 2–10 integer, default 5', () => {
  it('1-3. duration 2, 5, 10 accepted', () => {
    for (const value of [2, 5, 10]) {
      const check = validateGeneratedVideoDuration(value);
      assert.equal(check.ok, true);
      if (check.ok) assert.equal(check.durationSec, value);
    }
  });

  it('4-10. 1, 11, 15, 2.5, NaN, Infinity, invalid string rejected (no silent clamp)', () => {
    for (const value of [1, 11, 15, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '15', 'abc']) {
      assert.equal(validateGeneratedVideoDuration(value).ok, false);
    }
    const fifteen = parseAnimationIntent('Mach mir ein 15-Sekunden Intro');
    assert.equal(fifteen.durationUnsupported, true);
    assert.equal(fifteen.durationSec, ANIMATION_TYPES.find((t) => t.id === 'intro')?.durationSec);
    assert.equal(parseGeneratedVideoDurationFromMessage('Mach mir ein 1-Sekunden Intro').ok, false);
    assert.equal(inspectGeneratedVideoQuoteDuration({ durationSec: 15, message: 'Intro' }).ok, false);
    assert.equal(inspectGeneratedVideoQuoteDuration({ message: 'Mach mir ein 15-Sekunden AI Video' }).ok, false);
  });

  it('11. missing duration defaults to 5', async () => {
    assert.equal(GENERATED_VIDEO_DURATION_DEFAULT_SEC, 5);
    assert.equal(defaultAnimationPlan().durationSec, 5);
    const { user, project } = await seed('default-dur');
    setAiVideoTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const result = await generateAiVideo(user.id, project.id, { message: 'Erstelle ein KI-Video: Hype' });
    assert.equal(result.job.duration, 5);
    assert.equal(result.coinsSpent, 25);
    assert.equal(await getCoinBalance(user.id), before - 25);
  });

  it('12-14. UI min=2 max=10 default=5', () => {
    const page = repo('frontend/src/pages/studios/AnimationStudioPage.tsx');
    assert.match(page, /data-testid="animation-duration"/);
    assert.match(page, /min=\{GENERATED_VIDEO_DURATION_MIN_SEC\}/);
    assert.match(page, /max=\{GENERATED_VIDEO_DURATION_MAX_SEC\}/);
    assert.match(page, /GENERATED_VIDEO_DURATION_DEFAULT_SEC/);
    assert.equal(page.includes('max={15}'), false);
    assert.equal(GENERATED_VIDEO_DURATION_MIN_SEC, 2);
    assert.equal(GENERATED_VIDEO_DURATION_MAX_SEC, 10);
    assert.equal(GENERATED_VIDEO_DURATION_DEFAULT_SEC, 5);
    const aiVideo = repo('frontend/src/pages/ai/AIVideoPage.tsx');
    assert.match(aiVideo, /GENERATED_VIDEO_DURATION_MIN_SEC/);
  });

  it('15-16. Nexter valid duration quotes; invalid duration does not quote', async () => {
    const { user } = await seed('nexter-dur');
    const valid = await nexterChat(user.id, 'Mach daraus ein fünf Sekunden Intro.');
    assert.equal(hasStartGeneration(valid), true);
    assert.match(lastContent(valid), /25 Coins/);
    const quotesAfterValid = await listOwnedQuotes(user.id);
    assert.ok(quotesAfterValid.some((q) => q.kind === 'animation' && q.status === 'pending'));

    const invalidIntro = await nexterChat(user.id, 'Mach mir ein 1-Sekunden Intro');
    assert.equal(hasStartGeneration(invalidIntro), false);
    assert.match(lastContent(invalidIntro), /2–10/);
    assert.match(lastContent(invalidIntro), /Keine? Job/i);

    const invalidVideo = await nexterChat(user.id, 'Mach mir ein 15-Sekunden KI-Video');
    assert.equal(hasStartGeneration(invalidVideo), false);
    assert.match(lastContent(invalidVideo), /2–10/);

    const pending = (await listOwnedQuotes(user.id)).filter((q) => q.status === 'pending');
    assert.equal(
      pending.some((q) => q.payload && (q.payload.duration === 1 || q.payload.durationSec === 1 || q.payload.duration === 15 || q.payload.durationSec === 15)),
      false
    );
  });

  it('17. backend is authoritative: generate rejects invalid duration before debit', async () => {
    const { user, project, file } = await seed('auth-dur');
    const before = await getCoinBalance(user.id);
    setAnimationTestHooks({ result: 'success' });
    setAiVideoTestHooks({ result: 'success' });
    for (const durationSec of [1, 11, 15, 2.5, Number.NaN]) {
      await assert.rejects(
        () => generateAnimation(user.id, project.id, { sourceFileId: file.id, durationSec, type: 'intro' }),
        (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DURATION'
      );
      await assert.rejects(
        () => generateAiVideo(user.id, project.id, { duration: durationSec, message: 'KI-Video' }),
        (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DURATION'
      );
    }
    await assert.rejects(
      () => generateAiVideo(user.id, project.id, { duration: 'abc', message: 'KI-Video' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DURATION'
    );
    await assert.rejects(
      () => createQuote(user.id, 'ai-video', project.id, { duration: 15, message: 'KI-Video' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DURATION'
    );
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('18. local FFmpeg edit/export limits stay 7200s', () => {
    assert.equal(MAX_VIDEO_DURATION_SEC, 7200);
    const upload = src('../lib/upload-validation.ts');
    assert.match(upload, /MAX_VIDEO_DURATION_SEC = 7200/);
    const videoStudio = repo('frontend/src/pages/video/VideoStudioPage.tsx');
    assert.equal(videoStudio.includes('GENERATED_VIDEO_DURATION_MAX_SEC'), false);
  });
});

describe('Block Q.2 — pricing stays 25, no per-second price', () => {
  it('19-25. animation family and AI video are 25; duration does not change price', () => {
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(coinCostForKind('animation'), 25);
    assert.equal(coinCostForKind('ai-video'), 25);
    const coins = repo('shared/src/coins.ts');
    assert.equal(coins.includes('duration *'), false);
    assert.equal(coins.includes('perSecond'), false);
    const quotes = src('./nexter/quotes.service.ts');
    const create = quotes.slice(quotes.indexOf('export async function createQuote'));
    assert.match(create, /inspectGeneratedVideoQuoteDuration/);
    assert.equal(create.includes('duration *'), false);
  });
});

describe('Block Q.2 — local thumbnails, zero extra provider calls', () => {
  it('26-31. thumbnail path is local FFmpeg only', async () => {
    const media = src('./media.service.ts');
    const videoBranch =
      media.split("type === 'ai-video'")[1]?.split("type.startsWith('vtuber')")[0] ?? '';
    assert.match(videoBranch, /attachLocalVideoThumbnail/);
    assert.equal(videoBranch.includes('generateImage('), false);
    assert.equal(videoBranch.includes('generateVideoThumbnail'), false);
    assert.match(videoBranch, /thumbnailProviderCalls: 0|attachLocalVideoThumbnail/);
    const providers = src('../lib/media-providers.ts');
    const thumbFn = providers.split('export async function generateVideoThumbnail')[1]?.split('export function')[0] ?? '';
    assert.equal(thumbFn.includes('flux-schnell'), false);
    assert.equal(thumbFn.includes('openai.com'), false);
    assert.equal(thumbFn.includes('api.replicate.com'), false);
    assert.match(thumbFn, /VIDEO_THUMBNAIL_LOCAL_ONLY/);
    await assert.rejects(
      () => generateVideoThumbnail('should not call a provider'),
      (err: unknown) => err instanceof ServiceError && err.code === 'VIDEO_THUMBNAIL_LOCAL_ONLY'
    );

    const mp4 = await createTinyTestVideo(2.2);
    const frame = await extractVideoThumbnailJpeg(mp4);
    assert.ok(frame.length > 32);
    assert.equal(frame[0], 0xff);
    assert.equal(frame[1], 0xd8);

    const fromStart = await extractStillThumbnailJpegFromDataUrl(PIXEL);
    assert.ok(fromStart.length > 32);
    assert.equal(fromStart[0], 0xff);
  });

  it('32-34. thumbnail failure is secondary and does not spawn another video or refund path', () => {
    const media = src('./media.service.ts');
    const attach = media.split('async function attachLocalVideoThumbnail')[1]?.split('async function persistGeneratedImage')[0] ?? '';
    assert.match(attach, /thumbnailStatus: 'unavailable'/);
    assert.equal(attach.includes('generateVideo('), false);
    assert.equal(attach.includes('withCoinCharge'), false);
    assert.equal(attach.includes('generateImage('), false);
    assert.match(media, /Must never fail a paid video job/);
    const preview = repo('frontend/src/components/media/MediaJobPreview.tsx');
    assert.match(preview, /video-thumbnail-unavailable/);
    assert.match(preview, /Vorschaubild nicht verfügbar/);
  });

  it('35-40. private storage, bounded FFmpeg, malformed media fails safely, temp cleanup via withTempDir', async () => {
    const storage = src('../lib/firebase-storage.ts');
    assert.match(storage, /public: false/);
    assert.match(storage, /ownerId: userId/);
    assert.match(storage, /users\/\$\{userId\}\/\$\{folder\}/);
    assert.equal(VIDEO_THUMBNAIL_TIMEOUT_MS, 15_000);
    const proc = src('../lib/video-processing.ts');
    assert.match(proc, /withTempDir/);
    assert.match(proc, /VIDEO_THUMBNAIL_TIMEOUT_MS/);
    assert.match(proc, /spawn\(bin, args/);
    assert.equal(proc.includes('execSync'), false);
    assert.equal(proc.includes('shell: true'), false);
    await assert.rejects(() => extractVideoThumbnailJpeg(Buffer.from('not-a-video')));
    await assert.rejects(() => extractStillThumbnailJpegFromDataUrl('not-an-image'));
    await assert.rejects(() => extractStillThumbnailJpegFromDataUrl('data:text/plain;base64,YQ=='));
  });
});

describe('Block Q.2 — provider isolation and Q.1 regressions', () => {
  it('41-49. video flag / missing keys keep providers off; OpenAI image studios untouched', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(hasMusicAiProvider(), false);
    assert.equal(isElevenLabsTtsLiveEnabled(), false);
    assert.equal(RUNWAY_VIDEO_MODEL, 'gen4.5');
    const media = src('../lib/media-providers.ts');
    assert.match(media, /areVideoGenerationsEnabled/);
    assert.match(media, /Once a Runway create is submitted, do not fall through to Replicate/);
    const openai = src('../lib/openai-image.ts');
    assert.match(openai, /gpt-image-2.5-flare/);
    const env = src('../config/env.ts');
    assert.match(env, /areImageGenerationsEnabled/);
    assert.match(env, /PAYMENTS_ENABLED/);
  });

  it('50-55. relative animation changes stay in range; explicit 15s is not clamped into a quote', () => {
    const plan = defaultAnimationPlan();
    plan.durationSec = 8;
    const slower = applyAnimationChangeRequest(plan, 'langsamer');
    assert.ok(slower.durationSec >= 2 && slower.durationSec <= 10);
    const explicit = applyAnimationChangeRequest({ ...plan, durationSec: 5 }, 'nur 15 sek');
    assert.equal(explicit.durationSec, 5);
    const validExplicit = applyAnimationChangeRequest({ ...plan, durationSec: 5 }, 'nur 8 sek');
    assert.equal(validExplicit.durationSec, 8);
    const conversation = src('./nexter/conversation.service.ts');
    assert.equal(conversation.includes('1–15 Sekunden'), false);
    assert.match(conversation, /2–10 Sekunden/);
    assert.match(conversation, /generatedVideoDurationNeedsFollowUp/);
  });

  it('secret scan of Q.2 files has no live provider tokens', () => {
    const files = [
      src('./media.service.ts'),
      src('./ai-video.service.ts'),
      src('./animation.service.ts'),
      src('../lib/media-providers.ts'),
      src('../lib/video-processing.ts'),
      repo('shared/src/video-studio.ts'),
    ];
    for (const body of files) {
      assert.equal(/sk-[a-zA-Z0-9]{20,}/.test(body), false);
      assert.equal(/r8_[a-zA-Z0-9]{20,}/.test(body), false);
      assert.equal(/rw_[a-zA-Z0-9]{20,}/.test(body), false);
    }
  });
});
