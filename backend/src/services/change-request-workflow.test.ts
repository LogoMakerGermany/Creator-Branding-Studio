import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  applyBannerChangeRequest,
  applyFacecamChangeRequest,
  applyLogoChangeRequest,
  applyOverlayChangeRequest,
  applyStickerChangeRequest,
  coinCostForStreamsetSelection,
  defaultBannerConfig,
  defaultFacecamConfig,
  defaultLogoConfig,
  defaultOverlayConfig,
  defaultStickerConfig,
  detectDnaChangeScope,
  detectStudioChangeScope,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { getActiveDna, listDnaVersions, upsertDna } from './dna.service.js';
import { createProject, getProject } from './project.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import {
  deleteUserFile,
  issueFileDownloadUrl,
  listUserFiles,
  saveUserFile,
} from './file-cloud.service.js';
import { dsList, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { getJob } from './ai.service.js';
import {
  CHANGE_TEXT_MAX,
  buildChangePrompt,
  changeModuleToQuoteKind,
  compareVersions,
  executeQuotedChangeRequest,
  getOwnedJobForChange,
  getVersionsForJob,
  listChangeRequests,
  listChangeableSources,
  resolveChangeSource,
  sanitizeChangeText,
} from './change-request.service.js';
import { applyLogoToCreatorDna, getLogo, setLogoTestHooks } from './logo.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { coinCostForKind, detectChangeIntent, detectSuggestVariant, resolveChangeTarget } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

afterEach(() => {
  setLogoTestHooks(null);
});

after(() => {
  setLogoTestHooks(null);
});

async function seed(label: string) {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@cr-${label}.test`, label);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    secondaryColors: ['#7C3AED'],
    brandingStyle: 'esports',
    locks: { colors: true, name: true },
  });
  const project = await createProject(user.id, { name: `${label} Brand`, type: 'branding', dnaId: dna.id });
  return { user, dna, project };
}

async function seedJob(
  userId: string,
  module: string,
  extra?: {
    projectId?: string;
    assetKey?: string;
    imageUrl?: string;
    fileId?: string;
    batchId?: string;
    createdAt?: string;
    width?: number;
    height?: number;
    transparentBackground?: boolean;
  }
) {
  const id = randomUUID();
  const now = extra?.createdAt ?? new Date().toISOString();
  await dsSet('generationJobs', id, {
    id,
    userId,
    module,
    status: 'completed',
    imageUrl: extra?.imageUrl ?? PIXEL,
    prompt: `${module} for NightWolf`,
    projectId: extra?.projectId,
    assetKey: extra?.assetKey,
    fileId: extra?.fileId,
    batchId: extra?.batchId,
    width: extra?.width,
    height: extra?.height,
    transparentBackground: extra?.transparentBackground,
    createdAt: now,
    completedAt: now,
  });
  return id;
}

async function makeLogo(userId: string, projectId: string) {
  setLogoTestHooks({ result: 'success' });
  const quote = await createQuote(userId, 'logo', projectId, {
    logoName: 'NightWolf',
    platform: 'twitch',
    width: 400,
    height: 400,
    outputFormat: 'png',
    transparentBackground: true,
    shape: 'ring',
  });
  const result = await confirmQuote(userId, quote.id);
  const job = await getLogo(result.jobIds[0]!, userId);
  assert.ok(job);
  return job;
}

describe('change request local closure — source, ownership, text', () => {
  it('accepts own source and blocks foreign, missing, and deleted sources', async () => {
    const a = await seed('own');
    const b = await seed('foreign');
    const jobId = await seedJob(a.user.id, 'logo', { projectId: a.project.id });
    const own = await resolveChangeSource(a.user.id, { jobId, projectId: a.project.id });
    assert.equal(own.id, jobId);
    assert.equal(own.kind, 'logo');
    await assert.rejects(
      () => resolveChangeSource(b.user.id, { jobId }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NOT_FOUND'
    );

    const missingId = await seedJob(a.user.id, 'banner', { projectId: a.project.id, imageUrl: '' });
    await dsSet('generationJobs', missingId, {
      ...(await getJob(missingId))!,
      imageUrl: undefined,
    });
    await assert.rejects(
      () => resolveChangeSource(a.user.id, { jobId: missingId }),
      (err: unknown) => err instanceof ServiceError && err.code === 'SOURCE_MISSING' && err.statusCode === 410
    );
    await assert.rejects(
      () => getOwnedJobForChange(missingId, a.user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'SOURCE_MISSING'
    );

    const file = await saveUserFile(a.user.id, {
      name: 'logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'generation',
      projectId: a.project.id,
      sourceJobId: jobId,
    });
    const viaFile = await resolveChangeSource(a.user.id, { fileId: file.id });
    assert.equal(viaFile.id, jobId);
    await deleteUserFile(file.id, a.user.id);
    await assert.rejects(
      () => resolveChangeSource(a.user.id, { fileId: file.id }),
      (err: unknown) => err instanceof ServiceError && err.code === 'SOURCE_MISSING'
    );

    const upload = await saveUserFile(a.user.id, {
      name: 'upload.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
      projectId: a.project.id,
    });
    await assert.rejects(
      () => resolveChangeSource(a.user.id, { fileId: upload.id }),
      (err: unknown) => err instanceof ServiceError && err.code === 'CHANGE_NOT_SUPPORTED'
    );
  });

  it('resolves owned project assets and rejects empty or oversized change text', async () => {
    const { user, project } = await seed('asset-text');
    const jobId = await seedJob(user.id, 'logo', { projectId: project.id });
    const attached = await attachAssetToProject(user.id, project.id, {
      name: 'Logo',
      type: 'logo',
      url: PIXEL,
      jobId,
      module: 'logo',
      sourceType: 'generation',
    });
    assert.ok(attached);
    const resolved = await resolveChangeSource(user.id, { projectAssetId: attached.id });
    assert.equal(resolved.id, jobId);

    assert.equal(sanitizeChangeText('  Logo dunkler  '), 'Logo dunkler');
    assert.throws(
      () => sanitizeChangeText('   '),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_CHANGE'
    );
    assert.throws(
      () => sanitizeChangeText('ab'),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_CHANGE'
    );
    assert.throws(
      () => sanitizeChangeText('x'.repeat(CHANGE_TEXT_MAX + 1)),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_CHANGE'
    );
  });
});

describe('change request local closure — scope, DNA, original, versions', () => {
  it('default asset scope does not mutate DNA; DNA write needs confirmation and versions', async () => {
    const { user, project, dna } = await seed('scope');
    const job = await makeLogo(user.id, project.id);
    const beforeVersion = dna.version;
    const rawOriginal = await getJob(job.id);
    const originalUrl = rawOriginal?.imageUrl;
    const originalFileId = rawOriginal?.fileId ?? job.fileId;
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, {
      changeRequest: true,
      jobId: job.id,
      request: 'Mach mein Logo dunkler.',
      scope: 'asset',
    });
    assert.equal(quote.coinCost, coinCostForKind('logo'));
    assert.equal(quote.coinCost, COIN_COSTS[CoinSpendCategory.LOGO_GENERATION]);
    assert.notEqual(quote.coinCost, COIN_COSTS[CoinSpendCategory.AI_IMAGE]);
    const confirmed = await confirmQuote(user.id, quote.id);
    assert.equal(confirmed.jobIds.length, 1);
    const afterDna = await getActiveDna(user.id);
    assert.equal(afterDna?.version, beforeVersion);
    const versions = await getVersionsForJob(job.id, user.id);
    assert.ok(versions.length >= 2);
    assert.ok(versions[0]?.imageUrl);
    assert.equal(versions[1]?.parentVersionId, versions[0]?.id);
    assert.notEqual(versions[1]?.id, versions[0]?.id);
    assert.ok(originalUrl);
    const originalStill = await getJob(job.id);
    assert.ok(originalStill);
    const newJob = await getJob(confirmed.jobIds[0]!);
    assert.equal(newJob?.userId, user.id);
    assert.equal(newJob?.parentJobId, job.id);
    assert.ok(newJob?.fileId);
    assert.notEqual(newJob?.fileId, originalFileId);

    await assert.rejects(
      () => applyLogoToCreatorDna(job.id, user.id, { confirm: false }),
      (err: unknown) => err instanceof ServiceError && err.code === 'DNA_CONFIRM_REQUIRED'
    );
    const adopted = await applyLogoToCreatorDna(job.id, user.id, { confirm: true });
    const dnaVersions = await listDnaVersions(adopted.id, user.id);
    assert.ok(dnaVersions.length >= 1);

    assert.equal(detectStudioChangeScope('Mach mein Logo dunkler.'), 'asset');
    assert.equal(detectStudioChangeScope('Mach das ganze Set dunkler.'), 'set');
    assert.equal(detectStudioChangeScope('Speichere Rot dauerhaft in meiner Creator DNA.'), 'dna');
    assert.equal(detectDnaChangeScope('Dieses Logo diesmal rot.'), 'temporary');
    assert.equal(detectDnaChangeScope('Speichere Rot dauerhaft in meiner Creator DNA.'), 'explicit-dna');
  });

  it('preserves config, platform and transparency in prompt/config helpers', () => {
    const logo = applyLogoChangeRequest(
      defaultLogoConfig({ name: 'NightWolf', shape: 'ring', width: 400, height: 400, platform: 'twitch', transparentBackground: true }),
      'Mach das Blau dunkler.'
    );
    assert.equal(logo.platform, 'twitch');
    assert.equal(logo.width, 400);
    assert.equal(logo.transparentBackground, true);
    const banner = applyBannerChangeRequest(defaultBannerConfig({ platform: 'youtube', width: 2560, height: 1440 }), 'Mehr Blau');
    assert.equal(banner.platform, 'youtube');
    const facecam = applyFacecamChangeRequest(defaultFacecamConfig({ platform: 'twitch', frameThickness: 'thin', transparentBackground: true }), 'Rahmen dünner');
    assert.equal(facecam.platform, 'twitch');
    assert.equal(facecam.transparentBackground, true);
    const overlay = applyOverlayChangeRequest(defaultOverlayConfig({ platform: 'twitch' }), 'dunkler');
    assert.equal(overlay.platform, 'twitch');
    const sticker = applyStickerChangeRequest(defaultStickerConfig({ kind: 'emote', transparentBackground: true }), 'ohne Text');
    assert.equal(sticker.transparentBackground, true);
    const prompt = buildChangePrompt(
      {
        id: 'dna',
        userId: 'u',
        name: 'NightWolf',
        primaryColors: ['#1E40AF'],
        secondaryColors: [],
        accentColors: [],
        styleDirection: 'neon',
        locks: { colors: true, name: true },
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
      'dunkler',
      'original prompt'
    );
    assert.match(prompt, /dunkler/);
    assert.match(prompt, /LOCKED colors/);
    assert.match(prompt, /original prompt/);
  });
});

describe('change request local closure — quote, coins, refund, persistence', () => {
  it('requires quote, server pricing, insufficient coins, idempotency, race and refund', async () => {
    const { user, project } = await seed('quote');
    const job = await makeLogo(user.id, project.id);
    const routes = src('src/routes/change-request.routes.ts');
    assert.match(routes, /CHANGE_REQUIRES_QUOTE/);
    assert.match(routes, /DNA_CONFIRMATION_REQUIRED/);
    assert.match(routes, /createQuote/);
    assert.match(routes, /sanitizeChangeText/);

    const broke = await seed('broke');
    await makeLogo(broke.user.id, broke.project.id);
    const balance = await getCoinBalance(broke.user.id);
    if (balance > 1) {
      await deductAmount(broke.user.id, balance - 1, 'drain');
    }
    const expensive = await createQuote(broke.user.id, 'logo', broke.project.id, {
      changeRequest: true,
      jobId: (await listChangeableSources(broke.user.id))[0]!.id,
      request: 'Logo etwas dunkler',
    });
    const left = await getCoinBalance(broke.user.id);
    await assert.rejects(
      () => confirmQuote(broke.user.id, expensive.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal(await getCoinBalance(broke.user.id), left);
    assert.ok(left >= 0);

    setLogoTestHooks({ result: 'fail' });
    const beforeFail = await getCoinBalance(user.id);
    await assert.rejects(() => executeQuotedChangeRequest(user.id, job.id, 'heller machen', project.id));
    assert.equal(await getCoinBalance(user.id), beforeFail);
    const txs = await getTransactions(user.id, 80);
    const refunds = txs.filter(
      (tx) =>
        tx.type === 'refund' ||
        String(tx.description || '').includes('Rückerstattung')
    );
    assert.ok(refunds.length >= 1);

    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, {
      changeRequest: true,
      jobId: job.id,
      request: 'Schrift größer',
    });
    const first = await confirmQuote(user.id, quote.id);
    const afterFirst = await getCoinBalance(user.id);
    const replay = await confirmQuote(user.id, quote.id);
    assert.equal(await getCoinBalance(user.id), afterFirst);
    assert.deepEqual(replay.jobIds, first.jobIds);

    setLogoTestHooks({ result: 'success' });
    const raceQuote = await createQuote(user.id, 'logo', project.id, {
      changeRequest: true,
      jobId: job.id,
      request: 'Noch dunkler bitte',
    });
    const raced = await Promise.allSettled([
      confirmQuote(user.id, raceQuote.id),
      confirmQuote(user.id, raceQuote.id),
    ]);
    const ok = raced.filter((row) => row.status === 'fulfilled');
    assert.ok(
      ok.length >= 1,
      raced
        .map((row) => (row.status === 'fulfilled' ? 'ok' : String(row.reason)))
        .join(' | ')
    );
    assert.equal(await getCoinBalance(user.id), afterFirst - coinCostForKind('logo'));

    const files = await listUserFiles(user.id);
    const byNewJob = files.filter((f) => f.sourceJobId === first.jobIds[0]);
    assert.equal(byNewJob.length, 1);
    assert.equal(byNewJob[0]?.userId, user.id);
    const signed = await issueFileDownloadUrl(byNewJob[0]!.id, user.id);
    assert.ok(signed?.downloadUrl);
    const other = await seed('dl-foreign');
    assert.equal(await issueFileDownloadUrl(byNewJob[0]!.id, other.user.id), null);

    const history = await listChangeRequests(user.id);
    assert.ok(history.length >= 1);
    const again = await listChangeRequests(user.id);
    assert.equal(again.length, history.length);
    const cmp = await compareVersions(history[0]!.id, user.id);
    assert.ok(cmp);
    const reloadedProject = await getProject(project.id, user.id);
    assert.ok(reloadedProject);
    assert.ok((reloadedProject.assets ?? []).some((a) => a.jobId === job.id || a.module === 'logo'));

    const priced = await seed('price');
    const wrongPrice = await createQuote(
      priced.user.id,
      'streamset',
      priced.project.id,
      { changeRequest: true, request: 'Set dunkler', selectedKeys: ['facecam', 'hud'], scope: 'set' },
      1
    );
    await assert.rejects(
      () => confirmQuote(priced.user.id, wrongPrice.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });
});

describe('change request local closure — studios, streamset, nexter, safety', () => {
  it('lists studio sources and keeps local mockup / video paths ungated', async () => {
    const { user, project } = await seed('studios');
    await seedJob(user.id, 'logo', { projectId: project.id });
    await seedJob(user.id, 'banner', { projectId: project.id });
    await seedJob(user.id, 'facecam', { projectId: project.id, assetKey: 'facecam' });
    await seedJob(user.id, 'overlay', { projectId: project.id, assetKey: 'hud' });
    await seedJob(user.id, 'sticker', { projectId: project.id });
    const sources = await listChangeableSources(user.id);
    const kinds = new Set(sources.map((s) => s.kind));
    assert.ok(kinds.has('logo'));
    assert.ok(kinds.has('banner'));
    assert.ok(kinds.has('facecam'));
    assert.ok(kinds.has('overlay'));
    assert.ok(kinds.has('sticker'));
    assert.equal(changeModuleToQuoteKind('logo'), 'logo');
    assert.equal(changeModuleToQuoteKind('animation'), 'animation');
    assert.equal(changeModuleToQuoteKind('music'), 'music');
    assert.equal(changeModuleToQuoteKind('voice'), 'voice');

    const mockupSrc = src('src/services/mockup.service.ts');
    assert.match(mockupSrc, /generateCompositeMockup/);
    assert.match(mockupSrc, /lifestyle/);
    const conv = src('src/services/nexter/conversation.service.ts');
    assert.match(conv, /Lokale Mockup-Variante/);
    assert.match(conv, /Keine Coins, kein Provider/);
    const routes = src('src/routes/change-request.routes.ts');
    assert.match(routes, /CHANGE_NOT_SUPPORTED/);
    assert.match(routes, /captions/);
    assert.match(routes, /Lokale Videoschnitt/);
    assert.match(src('src/services/animation.service.ts'), /applyAnimationChangeRequest|parentJobId/);
    assert.match(src('src/services/music.service.ts'), /parentJobId/);
    assert.match(src('src/services/voice.service.ts'), /parentJobId/);
    assert.match(src('src/services/media.service.ts'), /ffmpeg|captions|export/);
    assert.match(repo('shared/src/video-studio.ts'), /applyAnimationChangeRequest/);
    assert.match(repo('shared/src/music.ts'), /applyMusicChangeRequest/);
    assert.match(repo('shared/src/voice-studio.ts'), /applyVoiceChangeRequest/);
    assert.match(repo('shared/src/mockup.ts'), /applyMockupChangeRequest/);
  });

  it('streamset single-asset vs set quotes and Nexter change / ambiguity / ownership', async () => {
    const { user, project } = await seed('set');
    const batchId = randomUUID();
    await seedJob(user.id, 'facecam', { projectId: project.id, assetKey: 'facecam', batchId });
    await seedJob(user.id, 'overlay', { projectId: project.id, assetKey: 'hud', batchId });
    const facecamOnly = coinCostForStreamsetSelection(['facecam']);
    const whole = coinCostForStreamsetSelection(['facecam', 'hud']);
    assert.ok(whole.total >= facecamOnly.total);

    const session = await nexterChat(user.id, 'Mach das ganze Set dunkler.', { projectId: project.id });
    const last = session.messages[session.messages.length - 1];
    assert.match(last?.content || '', /Set-Änderung/);
    assert.match(last?.content || '', /Creator DNA/);
    assert.ok(last?.actions?.some((a) => a.tool === 'confirm_quote' || a.requiresConfirmation));
    const quotes = (await dsList('nexterQuotes', { userId: user.id })) as Array<{ payload?: Record<string, unknown>; kind: string }>;
    const setQuote = quotes.find((q) => q.kind === 'streamset' && q.payload?.scope === 'set');
    assert.ok(setQuote);
    const selected = Array.isArray(setQuote.payload?.selectedKeys) ? [...(setQuote.payload.selectedKeys as string[])].sort() : [];
    assert.deepEqual(selected, ['facecam', 'hud'].sort());

    const otherBatch = randomUUID();
    await seedJob(user.id, 'banner', { projectId: project.id, assetKey: 'banner', batchId: otherBatch });
    const ask = await nexterChat(user.id, 'Mach das komplette Set dunkler.', { projectId: project.id });
    assert.match(ask.messages[ask.messages.length - 1]?.content || '', /nicht zufällig|Welches Streamset/i);

    setLogoTestHooks({ result: 'success' });
    const logoA = await makeLogo(user.id, project.id);
    await new Promise((r) => setTimeout(r, 5));
    const logoB = await makeLogo(user.id, project.id);
    assert.ok(logoA.id !== logoB.id);
    const change = await nexterChat(user.id, 'Mach das Logo dunkler.', { projectId: project.id });
    assert.match(change.messages[change.messages.length - 1]?.content || '', /Welches Logo|nicht und starte keinen Job/i);
    const latest = await nexterChat(user.id, 'Mach mein letztes Logo etwas heller.', { projectId: project.id });
    assert.match(latest.messages[latest.messages.length - 1]?.content || '', /Angebot|Coin|bestätig/i);

    const stranger = await seed('nx-foreign');
    const file = await saveUserFile(user.id, {
      name: 'secret.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'generation',
      projectId: project.id,
      sourceJobId: logoB.id,
    });
    const blocked = await nexterChat(stranger.user.id, 'Mach das Logo dunkler.', { fileId: file.id });
    assert.match(blocked.messages[blocked.messages.length - 1]?.content || '', /nicht zu deinem Konto/);

    const stolen = await createQuote(stranger.user.id, 'logo', stranger.project.id, {
      changeRequest: true,
      jobId: logoB.id,
      request: 'dunkler bitte',
    });
    await assert.rejects(
      () => confirmQuote(stranger.user.id, stolen.id),
      (err: unknown) => err instanceof ServiceError && (err.code === 'NOT_FOUND' || err.code === 'QUOTE_NOT_FOUND')
    );

    assert.ok(detectChangeIntent('Mach mein letztes Logo dunkler.'));
    const ambiguous = resolveChangeTarget(
      { lastLogoId: logoA.id, logoCount: 2 } as never,
      'logo',
      false
    );
    assert.ok('ask' in ambiguous);
    assert.equal(detectSuggestVariant('Noch eine Variante'), true);
    assert.equal(detectChangeIntent('Mach das ganze Set dunkler.'), null);
  });

  it('does not silently write DNA, add client Firestore/Storage writes, or call providers/payments', () => {
    const cr = src('src/services/change-request.service.ts');
    assert.equal(cr.includes('upsertDna('), false);
    assert.equal(cr.includes('updateDna('), false);
    const conv = src('src/services/nexter/conversation.service.ts');
    assert.equal(conv.includes('updateDna('), false);
    assert.equal(conv.includes('confirmQuote('), false);
    const page = repo('frontend/src/pages/change-request/ChangeRequestPage.tsx');
    assert.equal(page.includes("from 'firebase/firestore'"), false);
    assert.equal(page.includes("from 'firebase/storage'"), false);
    assert.equal(page.includes('generationJobId'), false);
    assert.match(page, /files\.downloadUrl/);
    assert.match(page, /change-quote-bar/);
    assert.match(page, /min-h-11/);
    assert.match(page, /Creator DNA/);
    const api = repo('frontend/src/services/api.ts');
    assert.match(api, /CHANGE_REQUIRES_QUOTE/);
    assert.match(api, /SOURCE_MISSING/);
    const firebase = repo('frontend/src/lib/firebase.ts');
    assert.equal(firebase.includes('firebase/firestore'), false);
    assert.equal(firebase.includes('firebase/storage'), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const streamset = src('src/services/streamset.service.ts');
    assert.match(streamset, /changeRequest/);
    assert.match(src('src/services/nexter/quotes.service.ts'), /confirmStreamsetQuote/);
    assert.match(src('src/lib/billable-job.ts'), /refundBillableChargeOnce/);
    assert.match(src('src/services/animation.service.ts'), /parentJobId/);
    assert.match(src('src/services/music.service.ts'), /parentJobId/);
    assert.match(src('src/services/voice.service.ts'), /parentJobId/);
    assert.match(src('src/services/media.service.ts'), /ffmpeg/);
  });
});
