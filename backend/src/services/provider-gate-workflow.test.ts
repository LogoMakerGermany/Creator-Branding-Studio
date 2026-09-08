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
import { deductAmount, getCoinBalance } from './coins.service.js';
import { saveUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { AppError } from '../middleware/errorHandler.js';
import { dsSet } from '../lib/data-store.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import { createTinyTestVideo } from '../lib/video-processing.js';
import {
  attachVideoSource,
  createVideoProject,
  executeQuotedCaptions,
  generateSubtitles,
  getVideoProject,
  setCaptionTestHooks,
} from './media.service.js';
import { setLogoTestHooks } from './logo.service.js';
import { setAnimationTestHooks, getAnimation } from './animation.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { transcribeNexterAudio } from './nexter/listen.service.js';
import { speakNexterReply } from './voice.service.js';
import { updateSystemSettings } from './system-settings.service.js';
import { analyzeImageWithVision } from './dna-analysis.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

function frontend(rel: string): string {
  return readFileSync(join(dir, '../../../frontend/src', rel), 'utf8');
}

afterEach(async () => {
  setLogoTestHooks(null);
  setAnimationTestHooks(null);
  setCaptionTestHooks(null);
  await updateSystemSettings({ generationsEnabled: true });
});

async function seedUser(tag: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.test`, 'Gate');
  const dna = await upsertDna({
    userId: user.id,
    name: 'GateWolf',
    mascot: 'Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
  });
  const project = await createProject(user.id, { name: 'Gate Brand', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

async function seedVideo() {
  const seeded = await seedUser('gate-video');
  const video = await createVideoProject(seeded.user.id, 'Gate Cut', 30, 'shorts', undefined, seeded.project.id);
  const buf = await createTinyTestVideo(8);
  const attached = await attachVideoSource(
    video.id,
    seeded.user.id,
    `data:video/mp4;base64,${buf.toString('base64')}`,
    undefined,
    'clip.mp4'
  );
  return { ...seeded, video: attached };
}

describe('provider confirmation gate — legacy and listen/speak/captions', () => {
  it('legacy image and video generate routes are quote-gated', () => {
    const image = src('../routes/ai.routes.ts');
    assert.match(image, /IMAGE_REQUIRES_QUOTE/);
    assert.equal(image.includes('runGenerationJob'), false);
    const video = src('../routes/ai-media.routes.ts');
    assert.match(video, /VIDEO_REQUIRES_QUOTE/);
    assert.equal(video.includes('runMediaJob'), false);
    const intro = src('../routes/intro-outro.routes.ts');
    assert.match(intro, /INTRO_REQUIRES_QUOTE/);
    const vtuber = src('../routes/vtuber.routes.ts');
    assert.match(vtuber, /VTUBER_REQUIRES_QUOTE/);
    const branding = src('../routes/auth.routes.ts');
    assert.match(branding, /BRANDING_REQUIRES_QUOTE/);
    const ultimate = src('../routes/ultimate-creator.routes.ts');
    assert.match(ultimate, /ULTIMATE_REQUIRES_QUOTE/);
  });

  it('Nexter listen cannot call Whisper without an approved cost policy', async () => {
    const listen = src('nexter/listen.service.ts');
    assert.equal(listen.includes('api.openai.com'), false);
    await assert.rejects(
      () => transcribeNexterAudio('AAAA', 'audio/webm'),
      (err: unknown) => err instanceof ServiceError && err.code === 'AUDIO_INVALID'
    );
    const audio = Buffer.alloc(128, 1).toString('base64');
    await assert.rejects(
      () => transcribeNexterAudio(audio, 'audio/webm'),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
  });

  it('Nexter speak stays coin-gated, refunds on provider failure, and has a cost guard', async () => {
    const { user } = await seedUser('gate-speak');
    const before = await getCoinBalance(user.id);
    await assert.rejects(() => speakNexterReply(user.id, 'Hallo Nexter, bitte vorlesen.'));
    assert.equal(await getCoinBalance(user.id), before);
    const voice = src('voice.service.ts');
    assert.match(voice, /withCoinCharge/);
    assert.match(voice, /nexter-speak:/);
    assert.match(voice, /SPEAK_RATE_LIMIT/);
    const panel = frontend('components/nexter/NexterPanel.tsx');
    assert.match(panel, /speakingRef/);
    assert.equal(/async function send[\s\S]*speakLast/.test(panel.split('async function speakLast')[0] ?? ''), false);
  });

  it('automatic subtitles direct provider is blocked; confirmed caption quote can use mock', async () => {
    const { user, video } = await seedVideo();
    await assert.rejects(
      () => generateSubtitles(video.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
    setCaptionTestHooks({
      transcript: [
        { start: 1, end: 3, text: 'Caption A' },
        { start: 4, end: 6, text: 'Caption B' },
      ],
    });
    const quote = await createQuote(user.id, 'captions', video.id, { videoProjectId: video.id });
    const result = await confirmQuote(user.id, quote.id);
    assert.equal(result.jobIds.length, 1);
    const loaded = await getVideoProject(video.id, user.id);
    assert.equal(loaded?.subtitles[0]?.text, 'Caption A');
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@gate-vid-b.test`, 'B');
    await assert.rejects(
      () => generateSubtitles(video.id, other.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'NOT_FOUND'
    );
  });
});

describe('provider confirmation gate — quotes, coins, ownership, isolation', () => {
  it('confirmed image and animation quotes reach mock providers', async () => {
    const { user, project } = await seedUser('gate-confirm');
    const file = await saveUserFile(user.id, {
      name: 'logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    setLogoTestHooks({ result: 'success' });
    const imageQuote = await createQuote(user.id, 'logo', project.id);
    const image = await confirmQuote(user.id, imageQuote.id);
    assert.equal(image.jobIds.length, 1);
    setAnimationTestHooks({ result: 'success' });
    const videoQuote = await createQuote(user.id, 'animation', project.id, {
      type: 'intro',
      effect: 'fade-in',
      durationSec: 4,
      sourceFileId: file.id,
    });
    const video = await confirmQuote(user.id, videoQuote.id);
    assert.equal(video.jobIds.length, 1);
    assert.ok(await getAnimation(video.jobIds[0]!, user.id));
  });

  it('insufficient coins, expired quote, price change, confirm idempotency and failure refund', async () => {
    const { user, project } = await seedUser('gate-coins');
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const poor = await createQuote(user.id, 'logo', project.id);
    await assert.rejects(
      () => confirmQuote(user.id, poor.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );

    const funded = await seedUser('gate-funded');
    const expired = await createQuote(funded.user.id, 'logo', funded.project.id);
    await dsSet('nexterQuotes', expired.id, {
      ...expired,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await assert.rejects(
      () => confirmQuote(funded.user.id, expired.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'QUOTE_EXPIRED'
    );

    const priced = await createQuote(funded.user.id, 'logo', funded.project.id, undefined, 1);
    await assert.rejects(
      () => confirmQuote(funded.user.id, priced.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );

    setLogoTestHooks({ result: 'success' });
    const before = await getCoinBalance(funded.user.id);
    const quote = await createQuote(funded.user.id, 'logo', funded.project.id);
    const first = await confirmQuote(funded.user.id, quote.id);
    const second = await confirmQuote(funded.user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    assert.equal(before - (await getCoinBalance(funded.user.id)), COIN_COSTS[CoinSpendCategory.LOGO_GENERATION]);

    setLogoTestHooks({ result: 'fail' });
    const failUser = await seedUser('gate-fail');
    const failBefore = await getCoinBalance(failUser.user.id);
    const failQuote = await createQuote(failUser.user.id, 'logo', failUser.project.id);
    await assert.rejects(() => confirmQuote(failUser.user.id, failQuote.id));
    assert.equal(await getCoinBalance(failUser.user.id), failBefore);
    await assert.rejects(() => confirmQuote(failUser.user.id, failQuote.id));
    assert.equal(await getCoinBalance(failUser.user.id), failBefore);
  });

  it('foreign project and file stay blocked; kill switch and rate-limit wiring stay in place', async () => {
    const a = await seedVideo();
    const b = await getOrCreateUser(randomUUID(), `${randomUUID()}@gate-own.test`, 'Other');
    assert.equal(await getVideoProject(a.video.id, b.id), null);
    const foreignFile = await saveUserFile(b.id, {
      name: 'other.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    setAnimationTestHooks({ result: 'success' });
    const quote = await createQuote(a.user.id, 'animation', a.project.id, {
      type: 'intro',
      sourceFileId: foreignFile.id,
    });
    await assert.rejects(() => confirmQuote(a.user.id, quote.id));

    await updateSystemSettings({ generationsEnabled: false });
    setLogoTestHooks({ result: 'success' });
    const killed = await createQuote(a.user.id, 'logo', a.project.id);
    await assert.rejects(
      () => confirmQuote(a.user.id, killed.id),
      (err: unknown) =>
        (err instanceof ServiceError || err instanceof AppError) && err.code === 'GENERATIONS_DISABLED'
    );
    await updateSystemSettings({ generationsEnabled: true });

    const index = src('../index.ts');
    assert.match(index, /apiLimiter/);
    assert.match(index, /app\.use\('\/api\/v1', apiLimiter\)/);
    const chat = src('../routes/nexter.routes.ts');
    assert.match(chat, /z\.string\(\)\.min\(1\)\.max\(4000\)|max\(4000\)/);
  });

  it('NODE_TEST isolation, fail-closed missing providers, mock still works, coins unchanged', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.NEXTER_VOICE], 3);
    const env = src('../config/env.ts');
    assert.match(env, /if \(!raw\) return 50;/);
    assert.equal(env.includes('DEFAULT_FREE_COINS=500'), false);

    await assert.rejects(
      () => analyzeImageWithVision(PIXEL, 'neon'),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );

    const providers = src('../lib/media-providers.ts');
    assert.match(providers, /isPaidProviderTestBlocked/);
    assert.match(providers, /AI_NOT_CONFIGURED/);
    assert.equal(providers.includes('[Media] Runway video failed:'), false);

    setLogoTestHooks({ result: 'success' });
    const { user, project } = await seedUser('gate-mock');
    const quote = await createQuote(user.id, 'logo', project.id);
    const result = await confirmQuote(user.id, quote.id);
    assert.equal(result.jobIds.length, 1);
  });
});

describe('provider confirmation gate — frontend and local Nexter intents', () => {
  it('frontend does not call unsafe legacy generate or direct subtitles', () => {
    const image = frontend('pages/ai/AIImagePage.tsx');
    assert.equal(image.includes('api.ai.generate'), false);
    assert.match(image, /Nexter nach Bestätigung/);
    const video = frontend('pages/ai/AIVideoPage.tsx');
    assert.equal(video.includes('api.aiVideo.generate'), false);
    const studio = frontend('pages/video/VideoStudioPage.tsx');
    assert.equal(studio.includes('generateSubtitles'), false);
    assert.match(studio, /Nexter nach Bestätigung/);
    const intro = frontend('pages/intro-outro/IntroOutroPage.tsx');
    assert.equal(intro.includes('api.introOutro.generate'), false);
    const vtuber = frontend('pages/vtuber/VTuberStudioPage.tsx');
    assert.equal(vtuber.includes('api.vtuber.generate'), false);
    const branding = frontend('pages/branding/BrandingGeneratorPage.tsx');
    assert.equal(branding.includes('generateBrandingPack'), false);
    const ultimate = frontend('pages/ultimate/UltimateCreatorPage.tsx');
    assert.equal(ultimate.includes('ultimateCreator.create'), false);
  });

  it('local Nexter intents and quote creation do not require a provider; confirm is required before provider', async () => {
    const { user } = await seedUser('gate-nexter');
    const before = await getCoinBalance(user.id);
    const support = await nexterChat(user.id, 'Ich habe ein Problem.');
    assert.match(support.messages.at(-1)?.content ?? '', /Support/i);
    const calendar = await nexterChat(user.id, 'Mach mir einen Contentplan für nächste Woche.');
    assert.match(calendar.messages.at(-1)?.content ?? '', /Plan|Kalender|Woche/i);
    const quoteChat = await nexterChat(user.id, 'Mach mir ein Logo.');
    assert.equal(quoteChat.messages.at(-1)?.actions?.some((a) => a.tool === 'start_generation'), true);
    assert.equal(await getCoinBalance(user.id), before);
    const convo = src('nexter/conversation.service.ts');
    assert.match(convo, /isPaidProviderTestBlocked/);
    assert.match(convo, /consumeNexterChatProviderSlot/);
    assert.equal(convo.includes('confirmQuote'), false);
  });
});
