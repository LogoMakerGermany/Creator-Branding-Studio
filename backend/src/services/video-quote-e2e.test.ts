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
  parseAnimationIntent,
  parseOverlayIntent,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { getUserFile, saveUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import {
  isPaidProviderTestBlocked,
  VIDEO_PROVIDER_UNAVAILABLE_CODE,
  VIDEO_PROVIDER_UNAVAILABLE_MESSAGE,
} from '../lib/media-providers.js';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import { dsSet } from '../lib/data-store.js';
import { setAnimationTestHooks, downloadAnimation, getAnimation } from './animation.service.js';
import {
  setAiVideoTestHooks,
  downloadAiVideo,
  getAiVideo,
} from './ai-video.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { coinCostForKind, detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { LEGACY_VIDEO_GENERATE_MESSAGE } from '../lib/provider-gate.js';

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

afterEach(() => {
  setAnimationTestHooks(null);
  setAiVideoTestHooks(null);
});

async function seed(tag: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.video-quote.test`, tag);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
  });
  const project = await createProject(user.id, { name: 'Video Quote', type: 'streamset', dnaId: dna.id });
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

function spendCount(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'spend').length);
}

function refundCount(userId: string) {
  return getTransactions(userId).then((rows) => rows.filter((t) => t.type === 'refund').length);
}

function lastAssistant(session: { messages: Array<{ role: string; content: string; actions?: Array<{ tool: string; requiresConfirmation?: boolean; coinCost?: number; payload?: Record<string, unknown> }> }> }) {
  return session.messages.filter((m) => m.role === 'assistant').at(-1);
}

describe('Block B — intro/outro/animation/AI-video quote E2E', () => {
  it('preserves welcome 50, logo 15, streamset 75/200, animation 25, AI video 25', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(coinCostForKind('animation'), 25);
    assert.equal(coinCostForKind('ai-video'), 25);
    assert.equal(arePaymentsEnabled(), false);
  });

  it('1-4 intro/outro/animation/KI-video chat create quotes without auto-confirm', async () => {
    const { user } = await seed('chat');
    for (const [message, kind, type] of [
      ['Mach mir ein Intro', 'animation', 'intro'],
      ['Mach mir ein Outro', 'animation', 'outro'],
      ['Mach mir eine Animation', 'animation', 'intro'],
      ['Mach mir ein KI-Video', 'ai-video', undefined],
    ] as const) {
      assert.equal(detectQuoteKind(message), kind);
      if (kind === 'animation') {
        assert.equal(parseAnimationIntent(message).type, type);
      }
      const session = await nexterChat(user.id, message);
      const last = lastAssistant(session);
      assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), true);
      assert.equal(
        (last?.actions ?? []).some((a) => a.tool === 'start_generation' && a.requiresConfirmation === true),
        true
      );
      assert.equal((last?.actions ?? []).some((a) => a.tool === 'start_generation' && a.coinCost === 25), true);
      assert.equal((last?.actions ?? []).some((a) => a.tool === 'start_generation' && a.requiresConfirmation !== true), false);
      assert.match(last?.content ?? '', /25 Coins|Es startet erst/i);
    }
  });

  it('5-8 static screens stay overlay; animated screens are animation jobs', () => {
    assert.equal(detectQuoteKind('Mach mir einen normalen Starting-Soon-Screen.'), 'overlay');
    assert.equal(parseOverlayIntent('Mach mir einen normalen Starting-Soon-Screen.').config.overlayType, 'starting-soon');
    assert.equal(detectQuoteKind('Mach mir einen normalen Ending-Screen.'), 'overlay');
    assert.equal(parseOverlayIntent('Mach mir einen normalen Ending-Screen.').config.overlayType, 'ending');
    assert.equal(detectQuoteKind('Mach mir einen animierten Starting-Soon-Screen.'), 'animation');
    assert.equal(parseAnimationIntent('Mach mir einen animierten Starting-Soon-Screen.').type, 'stream-start');
    assert.equal(detectQuoteKind('Mach mir einen animierten Endscreen.'), 'animation');
    assert.equal(parseAnimationIntent('Mach mir einen animierten Endscreen.').type, 'stream-end');
  });

  it('9 direct AI video generate stays VIDEO_REQUIRES_QUOTE', () => {
    const routes = src('../routes/ai-media.routes.ts');
    assert.match(routes, /VIDEO_REQUIRES_QUOTE/);
    assert.match(src('../lib/provider-gate.ts'), new RegExp(LEGACY_VIDEO_GENERATE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const page = frontend('pages/ai/AIVideoPage.tsx');
    assert.equal(page.includes('api.aiVideo.generate'), false);
    assert.match(page, /Erstelle ein KI-Video/);
    assert.equal(page.includes('Öffne das Video Studio'), false);
  });

  it('10-11 video provider unavailable is 0 debit with a safe user message', async () => {
    const { user, project, file } = await seed('unavailable');
    const before = await getCoinBalance(user.id);
    const animQuote = await createQuote(user.id, 'animation', project.id, {
      sourceFileId: file.id,
      type: 'intro',
    });
    await assert.rejects(
      () => confirmQuote(user.id, animQuote.id),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === VIDEO_PROVIDER_UNAVAILABLE_CODE &&
        err.message === VIDEO_PROVIDER_UNAVAILABLE_MESSAGE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await spendCount(user.id), 0);

    const videoQuote = await createQuote(user.id, 'ai-video', project.id, { message: 'Erstelle ein KI-Video.' });
    await assert.rejects(
      () => confirmQuote(user.id, videoQuote.id),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.code === VIDEO_PROVIDER_UNAVAILABLE_CODE &&
        err.message === VIDEO_PROVIDER_UNAVAILABLE_MESSAGE
    );
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await spendCount(user.id), 0);
    const api = frontend('services/api.ts');
    assert.match(api, /VIDEO_PROVIDER_UNAVAILABLE/);
    assert.match(api, /keine Coins abgebucht/);
  });

  it('12 insufficient balance starts no video provider job', async () => {
    const { user, project } = await seed('poor');
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    setAiVideoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'ai-video', project.id, { message: 'Erstelle ein KI-Video.' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal(await getCoinBalance(user.id), 0);
    assert.equal((await getTransactions(user.id)).filter((t) => t.sourceType === 'generation').length, 0);
  });

  it('13-14 duplicate confirm and double click debit once', async () => {
    const { user, project } = await seed('dup');
    setAiVideoTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'ai-video', project.id, { message: 'Erstelle ein KI-Video.' });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    const parallel = await Promise.all([
      confirmQuote(user.id, quote.id),
      confirmQuote(user.id, quote.id),
    ]);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(parallel[0].jobIds[0], first.jobIds[0]);
    assert.equal(parallel[1].jobIds[0], first.jobIds[0]);
    assert.equal(await getCoinBalance(user.id), before - COIN_COSTS[CoinSpendCategory.AI_VIDEO]);
    assert.equal(await spendCount(user.id), 1);
  });

  it('15 provider failure after mocked debit refunds exactly once', async () => {
    const { user, project } = await seed('fail');
    setAiVideoTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'ai-video', project.id, { message: 'Erstelle ein KI-Video.' });
    await assert.rejects(() => confirmQuote(user.id, quote.id));
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await refundCount(user.id), 1);
  });

  it('16 mocked success persists owned result with download metadata', async () => {
    const { user, project, file } = await seed('ok');
    setAiVideoTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'ai-video', project.id, { message: 'Erstelle ein KI-Video.' });
    const result = await confirmQuote(user.id, quote.id);
    assert.equal(result.coinsSpent, 25);
    assert.equal(await getCoinBalance(user.id), before - 25);
    const job = await getAiVideo(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.type, 'ai-video');
    assert.equal(job?.userId, user.id);
    assert.ok(job?.metadata?.fileId);
    const dl = await downloadAiVideo(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    assert.ok(dl.expiresAt);
    assert.equal(dl.fileId, job!.metadata!.fileId);
    assert.ok(await getUserFile(String(job!.metadata!.fileId), user.id));
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@video-other.test`, 'Other');
    await assert.rejects(() => downloadAiVideo(job!.id, other.id));

    setAnimationTestHooks({ result: 'success' });
    const introQuote = await createQuote(user.id, 'animation', project.id, {
      sourceFileId: file.id,
      type: 'intro',
      message: 'Mach mir ein Intro',
    });
    const intro = await confirmQuote(user.id, introQuote.id);
    const introJob = await getAnimation(intro.jobIds[0]!, user.id);
    assert.equal(introJob?.type, 'intro');
    const introDl = await downloadAnimation(introJob!.id, user.id);
    assert.ok(introDl.downloadUrl);
  });

  it('17 local FFmpeg and shorts stay outside the AI video provider gate', () => {
    const videoRoutes = src('../routes/video.routes.ts');
    assert.equal(videoRoutes.includes('requireVideoProvider'), false);
    const media = src('./media.service.ts');
    const shortsFn = media.split('export async function exportShortClip')[1]?.split('export async function')[0] ?? '';
    assert.equal(shortsFn.includes('requireVideoProvider'), false);
    assert.equal(shortsFn.includes('withCoinCharge'), false);
    const anim = src('./animation.service.ts');
    const generateAnim = anim.slice(anim.indexOf('export async function generateAnimation'));
    assert.ok(generateAnim.indexOf('requireVideoProvider()') < generateAnim.indexOf('withCoinCharge'));
    const aiVideo = src('./ai-video.service.ts');
    const generateVideo = aiVideo.slice(aiVideo.indexOf('export async function generateAiVideo'));
    assert.ok(generateVideo.indexOf('requireVideoProvider()') < generateVideo.indexOf('withCoinCharge'));
  });

  it('18-19 Block A image prices and provider-before-debit stay intact', () => {
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(getDefaultFreeCoins(), 50);
    const logo = src('./logo.service.ts');
    const generateLogo = logo.slice(logo.indexOf('export async function generateLogoAsset'));
    assert.match(generateLogo, /assertImageProviderReadyForStudio\('logo'\)/);
    assert.ok(generateLogo.indexOf("assertImageProviderReadyForStudio('logo')") < generateLogo.indexOf('withCoinCharge'));
    assert.equal(isPaidProviderTestBlocked(), true);
  });

  it('20 IntroOutro has no active stale 20/50 generate prices', () => {
    const intro = frontend('pages/intro-outro/IntroOutroPage.tsx');
    assert.equal(intro.includes('formatCoins(20)'), false);
    assert.equal(intro.includes('formatCoins(50)'), false);
    assert.equal(intro.includes('Generieren (20 Coins)'), false);
    assert.equal(intro.includes('Komplett-Paket (50 Coins)'), false);
    assert.match(intro, /ANIMATION_GENERATION/);
    assert.match(intro, /OVERLAY_GENERATION/);
    assert.match(intro, /Erstelle ein Intro für meinen Stream/);
    assert.match(intro, /animierten Starting-Soon-Screen/);
    assert.match(intro, /normalen Starting-Soon-Screen/);
    assert.equal(intro.includes('api.introOutro.generate'), false);
  });

  it('production mocks stay test-hook only; no real video calls in tests', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    const anim = src('./animation.service.ts');
    assert.match(anim, /animationTestHooks\?\.result === 'success'/);
    assert.equal(anim.includes('runwayml.com'), false);
    const video = src('./ai-video.service.ts');
    assert.match(video, /aiVideoTestHooks\?\.result === 'success'/);
    assert.equal(video.includes('runwayml.com'), false);
    assert.equal(video.includes('api.stripe.com'), false);
  });
});
