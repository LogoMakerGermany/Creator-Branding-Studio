import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  FACECAM_ASPECT_PRESETS,
  FACECAM_PLATFORM_SPECS,
  applyFacecamChangeRequest,
  applyFacecamPlatformPreset,
  facecamConfigFromDna,
  facecamDownloadFilename,
  facecamNeedsFollowUp,
  buildFacecamDesignSummary,
  defaultFacecamConfig,
  detectDnaChangeScope,
  parseFacecamIntent,
  sanitizeFacecamStyleRequest,
  validateFacecamDimensions,
  validateFacecamFormat,
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
  assertOwnedFacecamReference,
  downloadFacecam,
  generateFacecamAsset,
  getFacecam,
  listFacecam,
  listFacecamVersions,
  requireOwnedFacecamJob,
  retryFacecamJob,
  setFacecamTestHooks,
} from './facecam.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { previewStreamsetDraft, requireOwnedLogoJob } from './streamset.service.js';
import { setLogoTestHooks } from './logo.service.js';
import { createLayout } from './layout.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setFacecamTestHooks(null);
  setLogoTestHooks(null);
});

after(() => {
  setFacecamTestHooks(null);
  setLogoTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-close.test`, 'Mark');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    secondaryColors: ['#7C3AED'],
    brandingStyle: 'esports',
    targetPlatforms: ['twitch'],
  });
  const project = await createProject(user.id, { name: 'Facecam Brand', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

describe('facecam closure — project, dna, config', () => {
  it('persists owned facecam project and does not rewrite DNA', async () => {
    const { user, project, dna } = await seed();
    const before = dna.version;
    setFacecamTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'facecam', project.id, {
      platform: 'twitch',
      width: 1920,
      height: 1080,
      format: 'png',
      transparentBackground: true,
      transparentCenter: true,
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getFacecam(result.jobIds[0]!, user.id);
    assert.equal(job?.userId, user.id);
    assert.equal(job?.projectId, project.id);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.fileId);
    assert.equal(job?.width, 1920);
    assert.equal(job?.height, 1080);
    assert.equal(job?.transparentBackground, true);
    const listed = await listFacecam(user.id);
    assert.ok(listed.some((j) => j.id === job?.id));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-b.test`, 'B');
    assert.equal(await getFacecam(job!.id, other.id), null);
  });

  it('uses Creator DNA as defaults and works without DNA when a platform is given', async () => {
    const defaults = facecamConfigFromDna({
      name: 'NightWolf',
      primaryColors: ['#1E40AF'],
      secondaryColors: ['#7C3AED'],
      accentColors: [],
      styleDirection: 'esports',
      mascot: 'Wolf',
      brandingStyle: 'esports',
      platformOptimization: [{ platform: 'twitch', aspectRatios: ['16:9'], optimizations: [] }],
    });
    assert.equal(defaults.platform, 'twitch');
    assert.ok(defaults.colors?.includes('#1E40AF'));
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-nodna.test`, 'Solo');
    setFacecamTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'facecam', undefined, { platform: 'twitch' });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getFacecam(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(await getActiveDna(user.id), null);
  });

  it('validates dimensions, format, transparency, shapes, thickness, and prompt builder', () => {
    assert.equal(validateFacecamDimensions(0, 1080).ok, false);
    assert.equal(validateFacecamDimensions(-1, 1080).ok, false);
    assert.equal(validateFacecamDimensions(1920, 1080).ok, true);
    assert.equal(validateFacecamFormat('jpg', true).ok, false);
    assert.equal(validateFacecamFormat('png', true).ok, true);
    assert.equal(validateFacecamFormat('webp', true).ok, true);
    assert.equal('17:9' in FACECAM_ASPECT_PRESETS, false);
    const twitch = parseFacecamIntent('Mach mir einen transparenten Facecam-Rahmen für Twitch.');
    assert.equal(twitch.config.platform, 'twitch');
    assert.equal(twitch.config.width, FACECAM_ASPECT_PRESETS['16:9'].width);
    assert.equal(twitch.config.transparentCenter, true);
    assert.match(twitch.config.summary, /Twitch/);
    const layout = parseFacecamIntent('Setz mein Logo unten rechts. Blau und violett. Dünner runder Facecam-Rahmen für Twitch.');
    assert.equal(layout.config.logoPosition, 'bottom-right');
    assert.equal(layout.config.frameThickness, 'thin');
    assert.equal(layout.config.frameShape, 'circle');
    const safe = sanitizeFacecamStyleRequest('Kopiere exakt den Facecam von BrandX');
    assert.equal(/BrandX/i.test(safe) && /exakt den Facecam von BrandX/i.test(safe), false);
    assert.match(
      buildFacecamDesignSummary(defaultFacecamConfig({ platform: 'twitch', frameThickness: 'thin', logoJobId: 'x' })),
      /transparenter Kamerabereich/i
    );
    assert.equal(FACECAM_PLATFORM_SPECS.tiktok.defaultAspect, '9:16');
    assert.equal(applyFacecamPlatformPreset(defaultFacecamConfig({ platform: 'twitch' }), 'tiktok').aspectRatio, '9:16');
  });
});

describe('facecam closure — nexter', () => {
  it('parses intents and asks follow-up instead of quoting vague facecam without platform', async () => {
    assert.equal(detectQuoteKind('Mach mir einen Facecam-Rahmen.'), 'facecam');
    assert.equal(detectQuoteKind('Ich brauche eine Facecam passend zu meinem Logo.'), 'facecam');
    assert.equal(detectQuoteKind('Mach mir einen transparenten Facecam-Rahmen für Twitch.'), 'facecam');
    assert.equal(facecamNeedsFollowUp('Mach mir einen Facecam-Rahmen.'), true);
    assert.equal(facecamNeedsFollowUp('Mach mir einen Facecam-Rahmen für Twitch.'), false);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-fu.test`, 'Ask');
    const session = await nexterChat(user.id, 'Mach mir einen Facecam-Rahmen.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Twitch|TikTok|Plattform|Facecam Studio/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('concrete Nexter facecam request prepares a quote without starting a job or writing DNA', async () => {
    const { user, dna } = await seed();
    const before = dna.version;
    const session = await nexterChat(
      user.id,
      'Mach mir einen transparenten Facecam-Rahmen für Twitch, dünn, blau und violett, Logo unten rechts.'
    );
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation' || a.tool === 'start_generation'), true);
    assert.equal((await listFacecam(user.id)).length, 0);
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

describe('facecam closure — quote, mock, refund, result', () => {
  it('requires quote confirmation and ignores client prices', async () => {
    const routes = src('../routes/studio.routes.ts');
    assert.match(routes, /FACECAM_REQUIRES_QUOTE/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no job', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listFacecam(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project } = await seed();
    setFacecamTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.FACECAM_GENERATION]);
  });

  it('mock success persists owned result; failure refunds once; retry needs quote', async () => {
    const { user, project } = await seed();
    setFacecamTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);

    setFacecamTestHooks({ result: 'success' });
    const okQuote = await createQuote(user.id, 'facecam', project.id, {
      platform: 'twitch',
      format: 'png',
      transparentBackground: true,
    });
    const result = await confirmQuote(user.id, okQuote.id);
    const job = await getFacecam(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    const fileId = String(job!.fileId);
    assert.ok(await getUserFile(fileId, user.id));
    const dl = await downloadFacecam(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    const again = await downloadFacecam(job!.id, user.id);
    assert.ok(again.downloadUrl);
    assert.match(dl.filename, /nightwolf|twitch-facecam-v/i);
    assert.equal(
      facecamDownloadFilename({ creatorName: 'Night Wolf!', platform: 'twitch', version: 1, ext: 'png' }),
      'night-wolf-twitch-facecam-v1.png'
    );
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-d.test`, 'D');
    await assert.rejects(() => downloadFacecam(job!.id, other.id));
    await assert.rejects(
      () => retryFacecamJob(job!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'JOB_NOT_RETRYABLE'
    );

    setFacecamTestHooks({ result: 'fail' });
    const fail2 = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' });
    await assert.rejects(() => confirmQuote(user.id, fail2.id));
    const failed = (await listFacecam(user.id)).find((j) => j.status === 'failed');
    assert.ok(failed);
    await assert.rejects(
      () => retryFacecamJob(failed!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'FACECAM_REQUIRES_QUOTE'
    );
  });

  it('rejects JPG transparency and accepts PNG/WebP', async () => {
    const { user, project } = await seed();
    setFacecamTestHooks({ result: 'success' });
    await assert.rejects(
      () =>
        generateFacecamAsset(user.id, project.id, {
          platform: 'twitch',
          format: 'jpg',
          transparentBackground: true,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'FACECAM_FORMAT_INVALID'
    );
    const quote = await createQuote(user.id, 'facecam', project.id, {
      platform: 'twitch',
      format: 'webp',
      transparentBackground: true,
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getFacecam(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.mimeType, 'image/webp');
  });

  it('change/variant reuses config, versions, and does not mutate DNA', async () => {
    const { user, project, dna } = await seed();
    setFacecamTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'facecam', project.id, {
      platform: 'twitch',
      frameThickness: 'medium',
      logoPosition: 'bottom-right',
    });
    const first = await confirmQuote(user.id, quote.id);
    const changed = applyFacecamChangeRequest(
      defaultFacecamConfig({ platform: 'twitch', frameThickness: 'medium', logoPosition: 'bottom-right' }),
      'Rahmen dünner. Mehr Blau. Logo kleiner.'
    );
    assert.equal(changed.frameThickness, 'thin');
    const change = await createQuote(user.id, 'facecam', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Rahmen dünner. Mehr Blau. Logo kleiner.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getFacecam(second.jobIds[0]!, user.id);
    assert.ok(variant);
    const versions = await listFacecamVersions(second.jobIds[0]!, user.id);
    assert.ok(versions.length >= 2);
    const listed = await listFacecam(user.id);
    assert.ok(listed.some((j) => j.id === first.jobIds[0]));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
  });
});

describe('facecam closure — logo, streamset, conversion, layout, project', () => {
  it('accepts owned logo and rejects foreign logo and external URLs', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'success' });
    setFacecamTestHooks({ result: 'success' });
    const logoQuote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const logoRes = await confirmQuote(user.id, logoQuote.id);
    const logo = await requireOwnedLogoJob(user.id, logoRes.jobIds[0]!);
    const facecamQuote = await createQuote(user.id, 'facecam', project.id, {
      platform: 'twitch',
      sourceLogoJobId: logo.id,
    });
    const facecamRes = await confirmQuote(user.id, facecamQuote.id);
    const facecam = await getFacecam(facecamRes.jobIds[0]!, user.id);
    assert.equal(facecam?.status, 'completed');

    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-logo.test`, 'X');
    await assert.rejects(
      () => generateFacecamAsset(other.id, undefined, { platform: 'twitch', sourceLogoJobId: logo.id }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'LOGO_NOT_FOUND' || err.code === 'FOREIGN_REFERENCE')
    );
    await assert.rejects(
      () => generateFacecamAsset(user.id, undefined, { platform: 'twitch', referenceUrl: 'https://evil.example/f.png' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NO_EXTERNAL_URL'
    );
  });

  it('facecam without logo still completes', async () => {
    const { user, project } = await seed();
    setFacecamTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'facecam', project.id, { platform: 'general' });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getFacecam(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.config?.logoJobId, undefined);
  });

  it('accepts owned reference images and rejects foreign and SVG files', async () => {
    const { user } = await seed();
    const PIXEL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const owned = await saveUserFile(user.id, {
      name: 'ref.png',
      mimeType: 'image/png',
      category: 'facecam',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assertOwnedFacecamReference(user.id, owned.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-ref.test`, 'X');
    const foreign = await saveUserFile(other.id, {
      name: 'steal.png',
      mimeType: 'image/png',
      category: 'facecam',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assert.rejects(
      () => assertOwnedFacecamReference(user.id, foreign.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_REFERENCE'
    );
    const svgId = randomUUID();
    await dsSet('files', svgId, {
      id: svgId,
      userId: user.id,
      name: 'x.svg',
      mimeType: 'image/svg+xml',
      size: 12,
      category: 'facecam',
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => assertOwnedFacecamReference(user.id, svgId),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_REFERENCE_MIME'
    );
  });

  it('own facecam attaches as project asset and can seed streamset draft; foreign facecam is rejected', async () => {
    const { user, project } = await seed();
    setFacecamTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' });
    const result = await confirmQuote(user.id, quote.id);
    const facecam = await requireOwnedFacecamJob(user.id, result.jobIds[0]!);
    const projectRow = await getProject(project.id, user.id);
    assert.ok(projectRow?.assets.some((a) => a.jobId === facecam.id || a.module === 'facecam'));
    const draft = await previewStreamsetDraft(user.id, { projectId: project.id, selectedKeys: ['facecam'] });
    assert.ok(draft.selectedKeys.includes('facecam'));
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-ss.test`, 'Z');
    await assert.rejects(() => requireOwnedFacecamJob(other.id, facecam.id));
  });

  it('Twitch to TikTok conversion uses new dimensions and owned parent only', async () => {
    const { user, project } = await seed();
    setFacecamTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' });
    const first = await confirmQuote(user.id, quote.id);
    const converted = applyFacecamPlatformPreset(defaultFacecamConfig({ platform: 'twitch' }), 'tiktok');
    assert.equal(converted.width, FACECAM_ASPECT_PRESETS['9:16'].width);
    assert.equal(converted.height, FACECAM_ASPECT_PRESETS['9:16'].height);
    const convertQuote = await createQuote(user.id, 'facecam', project.id, {
      parentJobId: first.jobIds[0],
      convertToPlatform: 'tiktok',
      request: 'Mach aus meiner Twitch-Facecam eine TikTok-Version.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, convertQuote.id);
    const tiktok = await getFacecam(second.jobIds[0]!, user.id);
    assert.equal(tiktok?.width, FACECAM_ASPECT_PRESETS['9:16'].width);
    assert.equal(tiktok?.config?.platform, 'tiktok');
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-cv.test`, 'Q');
    await assert.rejects(
      () =>
        generateFacecamAsset(other.id, undefined, {
          parentJobId: first.jobIds[0],
          convertToPlatform: 'tiktok',
          platform: 'tiktok',
        }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'NOT_FOUND' || err.code === 'FACECAM_NOT_FOUND')
    );
  });

  it('layout studio accepts owned facecam and rejects foreign facecam', async () => {
    const { user, project } = await seed();
    setFacecamTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'facecam', project.id, { platform: 'twitch' });
    const result = await confirmQuote(user.id, quote.id);
    const facecam = await requireOwnedFacecamJob(user.id, result.jobIds[0]!);
    const layout = await createLayout(user.id, {
      name: 'Obs Scene',
      platform: 'obs',
      canvas: { width: 1920, height: 1080 },
      elements: [
        {
          id: randomUUID(),
          type: 'facecam',
          x: 40,
          y: 40,
          width: 320,
          height: 240,
          sourceFacecamJobId: facecam.id,
        },
      ],
    });
    assert.equal(layout.elements[0]?.sourceFacecamJobId, facecam.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@facecam-lo.test`, 'L');
    await assert.rejects(
      () =>
        createLayout(other.id, {
          name: 'Steal',
          platform: 'obs',
          canvas: { width: 1920, height: 1080 },
          elements: [
            {
              id: randomUUID(),
              type: 'facecam',
              x: 0,
              y: 0,
              width: 320,
              height: 240,
              sourceFacecamJobId: facecam.id,
            },
          ],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'FACECAM_NOT_FOUND'
    );
  });
});

describe('facecam closure — provider and payment safety', () => {
  it('keeps image providers and payments gated', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const ai = src('./ai.service.ts');
    assert.match(ai, /facecamTestHooks/);
    assert.match(ai, /FACECAM_MOCK_PNG/);
    assert.match(ai, /isPaidProviderTestBlocked/);
  });
});
