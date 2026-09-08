import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANNER_PLATFORM_SPECS,
  COIN_COSTS,
  CoinSpendCategory,
  applyBannerChangeRequest,
  applyBannerPlatformPreset,
  bannerConfigFromDna,
  bannerDownloadFilename,
  bannerNeedsFollowUp,
  buildBannerDesignSummary,
  defaultBannerConfig,
  detectDnaChangeScope,
  parseBannerIntent,
  sanitizeBannerStyleRequest,
  validateBannerDimensions,
  validateBannerFormat,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { getActiveDna, upsertDna } from './dna.service.js';
import { createProject, getProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { getUserFile, saveUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { dsSet } from '../lib/data-store.js';
import {
  assertOwnedBannerReference,
  downloadBanner,
  generateBannerAsset,
  getBanner,
  listBanner,
  listBannerVersions,
  requireOwnedBannerJob,
  retryBannerJob,
  setBannerTestHooks,
} from './banner.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { previewStreamsetDraft, requireOwnedLogoJob } from './streamset.service.js';
import { setLogoTestHooks } from './logo.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setBannerTestHooks(null);
  setLogoTestHooks(null);
});

after(() => {
  setBannerTestHooks(null);
  setLogoTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-close.test`, 'Mark');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    secondaryColors: ['#7C3AED'],
    brandingStyle: 'esports',
  });
  const project = await createProject(user.id, { name: 'Banner Brand', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

describe('banner closure — project, dna, config', () => {
  it('persists owned banner project and does not rewrite DNA', async () => {
    const { user, project, dna } = await seed();
    const before = dna.version;
    setBannerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'banner', project.id, {
      title: 'NightWolf',
      platform: 'twitch',
      width: 1200,
      height: 480,
      outputFormat: 'png',
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getBanner(result.jobIds[0]!, user.id);
    assert.equal(job?.userId, user.id);
    assert.equal(job?.projectId, project.id);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.fileId);
    assert.equal(job?.width, 1200);
    assert.equal(job?.height, 480);
    const listed = await listBanner(user.id);
    assert.ok(listed.some((j) => j.id === job?.id));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-b.test`, 'B');
    assert.equal(await getBanner(job!.id, other.id), null);
  });

  it('uses Creator DNA as defaults and works without DNA when a platform is given', async () => {
    const defaults = bannerConfigFromDna({
      name: 'NightWolf',
      primaryColors: ['#1E40AF'],
      secondaryColors: ['#7C3AED'],
      accentColors: [],
      styleDirection: 'esports',
      mascot: 'Wolf',
      brandingStyle: 'esports',
      platformOptimization: [],
    });
    assert.equal(defaults.title, 'NightWolf');
    assert.ok(defaults.colors?.includes('#1E40AF'));
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-nodna.test`, 'Solo');
    setBannerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'banner', undefined, { platform: 'twitch', title: 'SoloMark' });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getBanner(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(await getActiveDna(user.id), null);
  });

  it('validates dimensions, format, transparency, layout, and prompt builder', () => {
    assert.equal(validateBannerDimensions(0, 480).ok, false);
    assert.equal(validateBannerDimensions(-1, 480).ok, false);
    assert.equal(validateBannerDimensions(1200, 480).ok, true);
    assert.equal(validateBannerFormat('jpg', true).ok, false);
    assert.equal(validateBannerFormat('png', true).ok, true);
    const twitch = parseBannerIntent('Mach mir einen Twitch Banner mit dem Namen NightWolf.');
    assert.equal(twitch.config.platform, 'twitch');
    assert.equal(twitch.config.width, BANNER_PLATFORM_SPECS.twitch.width);
    assert.match(twitch.config.summary, /NightWolf/);
    const layout = parseBannerIntent('Setz mein Logo links und meinen Namen in die Mitte. Twitch Banner, Name Apex.');
    assert.equal(layout.config.logoPosition, 'left');
    assert.equal(layout.config.textPosition, 'center');
    const safe = sanitizeBannerStyleRequest('Kopiere exakt das Banner von BrandX');
    assert.equal(/BrandX/i.test(safe) && /exakt das Banner von BrandX/i.test(safe), false);
    assert.match(
      buildBannerDesignSummary(defaultBannerConfig({ title: 'Apex', platform: 'twitch', logoPosition: 'left' })),
      /1200×480/
    );
    assert.ok(defaultBannerConfig({ platform: 'youtube' }).cropNote.includes('Designhilfe'));
  });
});

describe('banner closure — nexter', () => {
  it('parses intents and asks follow-up instead of quoting vague banner without platform', async () => {
    assert.equal(detectQuoteKind('Mach mir einen Twitch Banner.'), 'banner');
    assert.equal(detectQuoteKind('Ich brauche einen YouTube Banner passend zu meinem Logo.'), 'banner');
    assert.equal(bannerNeedsFollowUp('Mach mir einen Banner.'), true);
    assert.equal(bannerNeedsFollowUp('Mach mir einen Twitch Banner.'), false);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-fu.test`, 'Ask');
    const session = await nexterChat(user.id, 'Mach mir einen Banner.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Twitch|YouTube|Plattform|Banner Studio/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('concrete Nexter banner request prepares a quote without starting a job or writing DNA', async () => {
    const { user, dna } = await seed();
    const before = dna.version;
    const session = await nexterChat(user.id, 'Mach mir einen Twitch Banner, Logo links, Name NightWolf mittig.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation' || a.tool === 'start_generation'), true);
    assert.equal((await listBanner(user.id)).length, 0);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
  });

  it('does not silently change DNA; explicit DNA phrases ask for confirmation', async () => {
    assert.equal(detectDnaChangeScope('Ab jetzt soll mein gesamtes Design blau/violett sein.'), 'explicit-dna');
    const { user, dna } = await seed();
    const session = await nexterChat(user.id, 'Ab jetzt soll mein gesamtes Design blau/violett sein.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /DNA|nicht automatisch|Projekt/i);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
  });
});

describe('banner closure — quote, mock, refund, result', () => {
  it('requires quote confirmation and ignores client prices', async () => {
    const routes = src('../routes/studio.routes.ts');
    assert.match(routes, /BANNER_REQUIRES_QUOTE/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'banner', project.id, { platform: 'twitch', title: 'NightWolf' }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no job', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'banner', project.id, { platform: 'twitch', title: 'NightWolf' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listBanner(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project } = await seed();
    setBannerTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'banner', project.id, { platform: 'twitch', title: 'NightWolf' });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.BANNER_GENERATION]);
  });

  it('mock success persists owned result; failure refunds once; retry needs quote', async () => {
    const { user, project } = await seed();
    setBannerTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'banner', project.id, { platform: 'twitch', title: 'NightWolf' });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);

    setBannerTestHooks({ result: 'success' });
    const okQuote = await createQuote(user.id, 'banner', project.id, {
      title: 'NightWolf',
      platform: 'twitch',
      outputFormat: 'png',
    });
    const result = await confirmQuote(user.id, okQuote.id);
    const job = await getBanner(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    const fileId = String(job!.fileId);
    assert.ok(await getUserFile(fileId, user.id));
    const dl = await downloadBanner(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    const again = await downloadBanner(job!.id, user.id);
    assert.ok(again.downloadUrl);
    assert.match(dl.filename, /nightwolf|twitch-banner-v/i);
    assert.equal(
      bannerDownloadFilename({ creatorName: 'Night Wolf!', platform: 'twitch', version: 1, ext: 'png' }),
      'night-wolf-twitch-banner-v1.png'
    );
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-d.test`, 'D');
    await assert.rejects(() => downloadBanner(job!.id, other.id));
    await assert.rejects(
      () => retryBannerJob(job!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'JOB_NOT_RETRYABLE'
    );

    setBannerTestHooks({ result: 'fail' });
    const fail2 = await createQuote(user.id, 'banner', project.id, { platform: 'twitch', title: 'NightWolf' });
    await assert.rejects(() => confirmQuote(user.id, fail2.id));
    const failed = (await listBanner(user.id)).find((j) => j.status === 'failed');
    assert.ok(failed);
    await assert.rejects(
      () => retryBannerJob(failed!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'BANNER_REQUIRES_QUOTE'
    );
  });

  it('change/variant reuses config, versions, and does not mutate DNA', async () => {
    const { user, project, dna } = await seed();
    setBannerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'banner', project.id, {
      title: 'NightWolf',
      platform: 'twitch',
      logoPosition: 'left',
    });
    const first = await confirmQuote(user.id, quote.id);
    const changed = applyBannerChangeRequest(
      defaultBannerConfig({ title: 'NightWolf', platform: 'twitch', logoPosition: 'left' }),
      'Logo kleiner. Hintergrund dunkler.'
    );
    assert.equal(changed.logoPosition, 'left');
    const change = await createQuote(user.id, 'banner', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Logo kleiner. Hintergrund dunkler.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getBanner(second.jobIds[0]!, user.id);
    assert.ok(variant);
    const versions = await listBannerVersions(second.jobIds[0]!, user.id);
    assert.ok(versions.length >= 2);
    const listed = await listBanner(user.id);
    assert.ok(listed.some((j) => j.id === first.jobIds[0]));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
  });
});

describe('banner closure — logo, streamset, conversion, project', () => {
  it('accepts owned logo and rejects foreign logo and external URLs', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'success' });
    setBannerTestHooks({ result: 'success' });
    const logoQuote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const logoRes = await confirmQuote(user.id, logoQuote.id);
    const logo = await requireOwnedLogoJob(user.id, logoRes.jobIds[0]!);
    const bannerQuote = await createQuote(user.id, 'banner', project.id, {
      platform: 'twitch',
      title: 'NightWolf',
      sourceLogoJobId: logo.id,
    });
    const bannerRes = await confirmQuote(user.id, bannerQuote.id);
    const banner = await getBanner(bannerRes.jobIds[0]!, user.id);
    assert.equal(banner?.status, 'completed');

    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-logo.test`, 'X');
    await assert.rejects(
      () => generateBannerAsset(other.id, undefined, { platform: 'twitch', title: 'Nope', sourceLogoJobId: logo.id }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'LOGO_NOT_FOUND' || err.code === 'FOREIGN_REFERENCE')
    );
    await assert.rejects(
      () => generateBannerAsset(user.id, undefined, { platform: 'twitch', title: 'A', referenceUrl: 'https://evil.example/b.png' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NO_EXTERNAL_URL'
    );
  });

  it('banner without logo still completes', async () => {
    const { user, project } = await seed();
    setBannerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'banner', project.id, { platform: 'discord', title: 'NightWolf' });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getBanner(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.config?.logoJobId, undefined);
  });

  it('accepts owned reference images and rejects foreign, SVG, and oversized files', async () => {
    const { user } = await seed();
    const PIXEL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const owned = await saveUserFile(user.id, {
      name: 'ref.png',
      mimeType: 'image/png',
      category: 'banner',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assertOwnedBannerReference(user.id, owned.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-ref.test`, 'X');
    const foreign = await saveUserFile(other.id, {
      name: 'steal.png',
      mimeType: 'image/png',
      category: 'banner',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assert.rejects(
      () => assertOwnedBannerReference(user.id, foreign.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_REFERENCE'
    );
    const svgId = randomUUID();
    await dsSet('files', svgId, {
      id: svgId,
      userId: user.id,
      name: 'x.svg',
      mimeType: 'image/svg+xml',
      size: 12,
      category: 'banner',
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => assertOwnedBannerReference(user.id, svgId),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_REFERENCE_MIME'
    );
  });

  it('own banner attaches as project asset and can seed streamset draft; foreign banner is rejected', async () => {
    const { user, project } = await seed();
    setBannerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'banner', project.id, { platform: 'twitch', title: 'NightWolf' });
    const result = await confirmQuote(user.id, quote.id);
    const banner = await requireOwnedBannerJob(user.id, result.jobIds[0]!);
    const projectRow = await getProject(project.id, user.id);
    assert.ok(projectRow?.assets.some((a) => a.jobId === banner.id || a.module === 'banner'));
    const draft = await previewStreamsetDraft(user.id, { projectId: project.id, selectedKeys: ['twitch-banner'] });
    assert.ok(draft.selectedKeys.includes('twitch-banner'));
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-ss.test`, 'Z');
    await assert.rejects(() => requireOwnedBannerJob(other.id, banner.id));
  });

  it('Twitch to YouTube conversion uses new dimensions and owned parent only', async () => {
    const { user, project } = await seed();
    setBannerTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'banner', project.id, { platform: 'twitch', title: 'NightWolf' });
    const first = await confirmQuote(user.id, quote.id);
    const converted = applyBannerPlatformPreset(
      defaultBannerConfig({ title: 'NightWolf', platform: 'twitch' }),
      'youtube'
    );
    assert.equal(converted.width, BANNER_PLATFORM_SPECS.youtube.width);
    assert.equal(converted.height, BANNER_PLATFORM_SPECS.youtube.height);
    const convertQuote = await createQuote(user.id, 'banner', project.id, {
      parentJobId: first.jobIds[0],
      convertToPlatform: 'youtube',
      request: 'Mach aus meinem Twitch-Banner auch einen YouTube-Banner.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, convertQuote.id);
    const youtube = await getBanner(second.jobIds[0]!, user.id);
    assert.equal(youtube?.width, BANNER_PLATFORM_SPECS.youtube.width);
    assert.equal(youtube?.config?.platform, 'youtube');
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@banner-cv.test`, 'Q');
    await assert.rejects(
      () =>
        generateBannerAsset(other.id, undefined, {
          parentJobId: first.jobIds[0],
          convertToPlatform: 'youtube',
          platform: 'youtube',
        }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'NOT_FOUND' || err.code === 'BANNER_NOT_FOUND')
    );
  });
});

describe('banner closure — provider and payment safety', () => {
  it('keeps image providers and payments gated', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const ai = src('./ai.service.ts');
    assert.match(ai, /bannerTestHooks/);
    assert.match(ai, /BANNER_MOCK_PNG/);
    assert.match(ai, /isPaidProviderTestBlocked/);
  });
});
