import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANIMATION_EFFECTS,
  COIN_COSTS,
  CoinSpendCategory,
  animationNeedsFollowUp,
  buildAnimationPreviewState,
  parseAnimationIntent,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { saveUserFile, getUserFile } from './file-cloud.service.js';
import { dsSet } from '../lib/data-store.js';
import { MAX_UPLOAD_BYTES } from '../lib/upload-validation.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { createTinyTestVideo } from '../lib/video-processing.js';
import {
  downloadAnimation,
  generateAnimation,
  getAnimation,
  listAnimationVersions,
  listAnimations,
  resolveAnimationSourceFile,
  setAnimationTestHooks,
} from './animation.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setAnimationTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@anim-close.test`, 'Anim');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    brandingStyle: 'esports',
  });
  const project = await createProject(user.id, { name: 'Anim Brand', type: 'streamset', dnaId: dna.id });
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

describe('animation closure — source and validation', () => {
  it('accepts owned source and rejects foreign or invalid assets', async () => {
    const a = await seed();
    const b = await getOrCreateUser(randomUUID(), `${randomUUID()}@anim-b.test`, 'B');
    const foreign = await saveUserFile(b.id, {
      name: 'other.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    const owned = await resolveAnimationSourceFile(a.user.id, a.file.id);
    assert.equal(owned?.id, a.file.id);
    await assert.rejects(
      () => resolveAnimationSourceFile(a.user.id, foreign.id),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    const video = await saveUserFile(a.user.id, {
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      category: 'video',
      dataUrl: `data:video/mp4;base64,${(await createTinyTestVideo()).toString('base64')}`,
      source: 'upload',
    });
    await assert.rejects(
      () => resolveAnimationSourceFile(a.user.id, video.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_ASSET'
    );
    await assert.rejects(
      () => resolveAnimationSourceFile(a.user.id, randomUUID()),
      (err: unknown) => err instanceof ServiceError && err.code === 'NOT_FOUND'
    );
    const hugeId = randomUUID();
    await dsSet('files', hugeId, {
      id: hugeId,
      userId: a.user.id,
      name: 'huge.png',
      mimeType: 'image/png',
      size: MAX_UPLOAD_BYTES + 1,
      category: 'logo',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => resolveAnimationSourceFile(a.user.id, hugeId),
      (err: unknown) => err instanceof ServiceError && err.code === 'FILE_TOO_LARGE'
    );
  });

  it('rejects invalid duration and unsupported presets', async () => {
    const { user, project, file } = await seed();
    await assert.rejects(
      () => generateAnimation(user.id, project.id, { sourceFileId: file.id, durationSec: 0, type: 'intro' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DURATION'
    );
    await assert.rejects(
      () => generateAnimation(user.id, project.id, { sourceFileId: file.id, durationSec: 99, type: 'intro' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DURATION'
    );
    await assert.rejects(
      () => generateAnimation(user.id, project.id, { sourceFileId: file.id, type: 'explode' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_PRESET'
    );
    await assert.rejects(
      () => generateAnimation(user.id, project.id, { sourceFileId: file.id, effect: 'wipe', type: 'intro' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_PRESET'
    );
  });
});

describe('animation closure — presets, rotation, transparency, preview', () => {
  it('exposes only locally previewable effects and rotation config', () => {
    assert.deepEqual(
      ANIMATION_EFFECTS.map((e) => e.id),
      ['fade-in', 'fade-out', 'zoom', 'pulse', 'rotate', 'slide', 'logo-reveal']
    );
    const rotate = parseAnimationIntent('Lass mein Logo einmal um die eigene Achse drehen.');
    assert.equal(rotate.effect, 'rotate');
    assert.equal(rotate.rotations, 1);
    const preview = buildAnimationPreviewState({
      type: 'logo-loop',
      durationSec: 5,
      aspectRatio: '1:1',
      motion: 'medium',
      loop: true,
      withAudio: false,
      effect: 'rotate',
      rotations: 1,
      direction: 'cw',
      transparent: true,
    });
    assert.equal(preview.label, 'Vorschau');
    assert.equal(preview.animationClass, 'ucbs-anim-rotate-cw');
    assert.match(preview.alphaNote, /kein Alpha|transparent/i);
    const page = readFileSync(join(dir, '../../../frontend/src/pages/studios/AnimationStudioPage.tsx'), 'utf8');
    assert.match(page, /buildAnimationPreviewState/);
    assert.match(page, /ANIMATION_EFFECTS/);
    assert.equal(page.includes('Final Render'), false);
  });

  it('preview uses owned source file id; job config matches preview plan', async () => {
    const { user, project, file } = await seed();
    setAnimationTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'animation', project.id, {
      type: 'intro',
      effect: 'fade-in',
      durationSec: 4,
      aspectRatio: '9:16',
      sourceFileId: file.id,
      transparent: true,
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getAnimation(result.jobIds[0]!, user.id);
    assert.equal(job?.metadata?.sourceFileId, file.id);
    assert.equal(job?.preview?.durationSec, 4);
    assert.equal(job?.preview?.aspectRatio, '9:16');
    assert.equal(job?.preview?.effect, 'fade-in');
    assert.equal(job?.metadata?.transparencyClaim, false);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@anim-c.test`, 'C');
    assert.equal(await getAnimation(job!.id, other.id), null);
  });
});

describe('animation closure — nexter', () => {
  it('parses rotation, duration and transparency without auto-starting paid jobs', async () => {
    assert.equal(parseAnimationIntent('Mach daraus ein fünf Sekunden Intro.').durationSec, 5);
    assert.equal(parseAnimationIntent('Lass das Logo langsam einblenden.').effect, 'fade-in');
    assert.equal(parseAnimationIntent('Hintergrund transparent und Intro').transparent, true);
    assert.equal(detectQuoteKind('Lass mein Logo einmal um die eigene Achse drehen.'), 'animation');
    assert.equal(animationNeedsFollowUp('Animier mein Logo'), true);
    assert.equal(animationNeedsFollowUp('Mach daraus ein fünf Sekunden Intro.'), false);
    const { user, dna } = await seed();
    void dna;
    const session = await nexterChat(user.id, 'Animier mein Logo');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Rotation|Fade|Intro|lange/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('Nexter rotation command prepares a quote only after a concrete request', async () => {
    const { user } = await seed();
    const session = await nexterChat(user.id, 'Lass mein Logo einmal um die eigene Achse drehen.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), true);
  });

  it('Nexter duration and TikTok version stay on the animation quote path', async () => {
    const { user, project, file } = await seed();
    const duration = await nexterChat(user.id, 'Mach daraus ein fünf Sekunden Intro.');
    const durationLast = duration.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((durationLast?.actions ?? []).some((a) => a.tool === 'quote_generation'), true);

    setAnimationTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'animation', project.id, {
      sourceFileId: file.id,
      type: 'intro',
      effect: 'rotate',
      durationSec: 4,
    });
    await confirmQuote(user.id, quote.id);
    const tiktok = await nexterChat(user.id, 'Mach eine Version für TikTok.');
    const tiktokLast = tiktok.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((tiktokLast?.actions ?? []).some((a) => a.tool === 'quote_generation'), true);
    assert.match(tiktokLast?.content ?? '', /Änderung|Animation|Coins/i);
  });
});

describe('animation closure — quote, mock job, refund, result', () => {
  it('provider animation requires quote confirmation and ignores client prices', async () => {
    const routes = src('../routes/animation.routes.ts');
    assert.match(routes, /ANIMATION_REQUIRES_QUOTE/);
    const { user, project, file } = await seed();
    const cheap = await createQuote(user.id, 'animation', project.id, { sourceFileId: file.id, type: 'intro' }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no job', async () => {
    const { user, project, file } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'animation', project.id, { sourceFileId: file.id, type: 'intro' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listAnimations(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project, file } = await seed();
    setAnimationTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'animation', project.id, {
      sourceFileId: file.id,
      type: 'intro',
      effect: 'rotate',
      durationSec: 3,
    });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION]);
  });

  it('mock success persists owned result; mock failure refunds once', async () => {
    const { user, project, file } = await seed();
    setAnimationTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'animation', project.id, { sourceFileId: file.id, type: 'intro' });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);

    setAnimationTestHooks({ result: 'success' });
    const okQuote = await createQuote(user.id, 'animation', project.id, {
      sourceFileId: file.id,
      type: 'stinger',
      durationSec: 3,
      aspectRatio: '16:9',
    });
    const result = await confirmQuote(user.id, okQuote.id);
    const job = await getAnimation(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.metadata?.fileId);
    const fileId = String(job!.metadata!.fileId);
    assert.ok(await getUserFile(fileId, user.id));
    const dl = await downloadAnimation(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    const again = await downloadAnimation(job!.id, user.id);
    assert.ok(again.downloadUrl);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@anim-d.test`, 'D');
    await assert.rejects(() => downloadAnimation(job!.id, other.id));
    const versions = await listAnimationVersions(job!.id, user.id);
    assert.ok(versions.length >= 1);
  });

  it('change/variant reuses source without rewriting DNA; refresh reconstructs jobs', async () => {
    const { user, project, file, dna } = await seed();
    setAnimationTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'animation', project.id, {
      sourceFileId: file.id,
      type: 'intro',
      effect: 'rotate',
      durationSec: 4,
    });
    const first = await confirmQuote(user.id, quote.id);
    const change = await createQuote(user.id, 'animation', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Mach die Animation langsamer.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getAnimation(second.jobIds[0]!, user.id);
    assert.equal(variant?.metadata?.sourceFileId, file.id);
    assert.equal(variant?.dnaId, dna.id);
    assert.ok(Number(variant?.duration) > 4);
    const listed = await listAnimations(user.id);
    assert.ok(listed.some((j) => j.id === first.jobIds[0]));
    assert.ok(listed.some((j) => j.id === second.jobIds[0]));
    const versions = await listAnimationVersions(second.jobIds[0]!, user.id);
    assert.ok(versions.length >= 2);
  });
});

describe('animation closure — safety', () => {
  it('provider and payment calls stay at 0; resource limits remain', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const media = src('../lib/media-providers.ts');
    assert.match(media, /isPaidProviderTestBlocked/);
    const gen = media.split('export async function generateVideo')[1]?.split('export async function')[0] ?? '';
    assert.match(gen, /isPaidProviderTestBlocked/);
    const anim = src('animation.service.ts');
    assert.equal(anim.includes('api.openai.com'), false);
    assert.equal(anim.includes('api.stripe.com'), false);
    assert.equal(anim.includes('runwayml.com'), false);
  });
});
