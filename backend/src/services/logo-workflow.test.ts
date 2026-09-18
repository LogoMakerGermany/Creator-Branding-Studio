import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  applyLogoChangeRequest,
  buildLogoDesignSummary,
  defaultLogoConfig,
  detectDnaChangeScope,
  logoConfigFromDna,
  logoDownloadFilename,
  logoNeedsFollowUp,
  pickLatestCompletedLogoResult,
  resolveLogoStudioPreview,
  logoStudioPreviewLabel,
  LOGO_CONFIG_PREVIEW_LABEL,
  LOGO_GENERATED_RESULT_LABEL,
  LOGO_FAILED_PREVIEW_LABEL,
  parseLogoIntent,
  sanitizeLogoStyleRequest,
  validateLogoDimensions,
  validateLogoFormat,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { getActiveDna, listDnaVersions, upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { getUserFile, saveUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { dsSet } from '../lib/data-store.js';
import {
  applyLogoToCreatorDna,
  assertOwnedLogoReference,
  downloadLogo,
  generateLogoAsset,
  getLogo,
  listLogo,
  listLogoVersions,
  retryLogoJob,
  setLogoTestHooks,
} from './logo.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { previewStreamsetDraft, requireOwnedLogoJob } from './streamset.service.js';
import { generateCompositeMockup } from './mockup.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setLogoTestHooks(null);
});

after(() => {
  setLogoTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@logo-close.test`, 'Mark');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    secondaryColors: ['#7C3AED'],
    brandingStyle: 'esports',
  });
  const project = await createProject(user.id, { name: 'Logo Brand', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

describe('logo closure — project, dna, config', () => {
  it('persists owned logo project and does not rewrite DNA', async () => {
    const { user, project, dna } = await seed();
    const before = dna.version;
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, {
      logoName: 'NightWolf',
      platform: 'twitch',
      width: 400,
      height: 400,
      outputFormat: 'png',
      transparentBackground: true,
      shape: 'ring',
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getLogo(result.jobIds[0]!, user.id);
    assert.equal(job?.userId, user.id);
    assert.equal(job?.projectId, project.id);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.fileId);
    assert.equal(job?.width, 400);
    assert.equal(job?.transparentBackground, true);
    const listed = await listLogo(user.id);
    assert.ok(listed.some((j) => j.id === job?.id));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@logo-b.test`, 'B');
    assert.equal(await getLogo(job!.id, other.id), null);
  });

  it('uses Creator DNA as defaults and works without DNA when a name is given', async () => {
    const defaults = logoConfigFromDna({
      name: 'NightWolf',
      primaryColors: ['#1E40AF'],
      secondaryColors: ['#7C3AED'],
      accentColors: [],
      styleDirection: 'esports',
      mascot: 'Wolf',
      brandingStyle: 'esports',
      fonts: [],
      favoriteGenres: ['FPS'],
      platformOptimization: [],
      gamingStyle: '',
    });
    assert.equal(defaults.name, 'NightWolf');
    assert.ok(defaults.primaryColors?.includes('#1E40AF'));
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@logo-nodna.test`, 'Solo');
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', undefined, { logoName: 'SoloMark', width: 400, height: 400 });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getLogo(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(await getActiveDna(user.id), null);
  });

  it('validates dimensions, format, transparency, and prompt builder', () => {
    assert.equal(validateLogoDimensions(0, 400).ok, false);
    assert.equal(validateLogoDimensions(-1, 400).ok, false);
    assert.equal(validateLogoDimensions(400, 400).ok, true);
    assert.equal(validateLogoFormat('jpg', true).ok, false);
    assert.equal(validateLogoFormat('png', true).ok, true);
    const gamer = parseLogoIntent('Mach mir ein Gamerlogo für Twitch mit dem Namen NightWolf.');
    assert.equal(gamer.config.platform, 'twitch');
    assert.match(gamer.config.summary, /NightWolf/);
    const ring = parseLogoIntent('400 Pixel, im Ring, Hintergrund transparent. Name Apex.');
    assert.equal(ring.config.width, 400);
    assert.equal(ring.config.shape, 'ring');
    assert.equal(ring.config.transparentBackground, true);
    const safe = sanitizeLogoStyleRequest('Kopiere exakt das Logo von BrandX');
    assert.equal(/BrandX/i.test(safe) && /exakt das Logo von BrandX/i.test(safe), false);
    assert.match(buildLogoDesignSummary(defaultLogoConfig({ name: 'Apex', width: 400, height: 400, shape: 'ring' })), /400×400/);
  });
});

describe('logo closure — nexter', () => {
  it('parses intents and asks follow-up instead of quoting vague logo without name', async () => {
    assert.equal(detectQuoteKind('Mach mir ein Gamerlogo.'), 'logo');
    assert.equal(detectQuoteKind('Ich brauche ein Logo für Twitch.'), 'logo');
    assert.equal(logoNeedsFollowUp('Mach mir ein Logo.'), true);
    assert.equal(logoNeedsFollowUp('Mach mir ein Gamerlogo mit dem Namen NightWolf.'), false);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@logo-fu.test`, 'Ask');
    const session = await nexterChat(user.id, 'Mach mir ein Logo.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Namen|DNA|Logo Studio/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('concrete Nexter logo request prepares a quote without starting a job or writing DNA', async () => {
    const { user, dna } = await seed();
    const before = dna.version;
    const session = await nexterChat(user.id, 'Mach mir ein 400 Pixel Gamerlogo für Twitch, im Ring, transparent, Name NightWolf.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation' || a.tool === 'start_generation'), true);
    assert.equal((await listLogo(user.id)).length, 0);
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

describe('logo closure — quote, mock, refund, result', () => {
  it('requires quote confirmation and ignores client prices', async () => {
    const routes = src('../routes/studio.routes.ts');
    assert.match(routes, /LOGO_REQUIRES_QUOTE/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no job', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listLogo(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.LOGO_GENERATION]);
  });

  it('mock success persists owned result; failure refunds once; retry needs quote', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);

    setLogoTestHooks({ result: 'success' });
    const okQuote = await createQuote(user.id, 'logo', project.id, {
      logoName: 'NightWolf',
      width: 400,
      height: 400,
      outputFormat: 'png',
      transparentBackground: true,
    });
    const result = await confirmQuote(user.id, okQuote.id);
    const job = await getLogo(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    const fileId = String(job!.fileId);
    assert.ok(await getUserFile(fileId, user.id));
    const dl = await downloadLogo(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    const again = await downloadLogo(job!.id, user.id);
    assert.ok(again.downloadUrl);
    assert.match(dl.filename, /nightwolf|logo-v/i);
    assert.equal(
      logoDownloadFilename({ creatorName: 'Night Wolf!', version: 1, ext: 'png' }),
      'night-wolf-logo-v1.png'
    );
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@logo-d.test`, 'D');
    await assert.rejects(() => downloadLogo(job!.id, other.id));
    await assert.rejects(
      () => retryLogoJob(job!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'JOB_NOT_RETRYABLE'
    );

    setLogoTestHooks({ result: 'fail' });
    const fail2 = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    await assert.rejects(() => confirmQuote(user.id, fail2.id));
    const failed = (await listLogo(user.id)).find((j) => j.status === 'failed');
    assert.ok(failed);
    await assert.rejects(
      () => retryLogoJob(failed!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'LOGO_REQUIRES_QUOTE'
    );
  });

  it('change/variant reuses config, versions, and does not mutate DNA', async () => {
    const { user, project, dna } = await seed();
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, {
      logoName: 'NightWolf',
      width: 400,
      height: 400,
      shape: 'ring',
    });
    const first = await confirmQuote(user.id, quote.id);
    const changed = applyLogoChangeRequest(defaultLogoConfig({ name: 'NightWolf', shape: 'ring', width: 400, height: 400 }), 'Mach das Blau dunkler. Ring breiter.');
    assert.equal(changed.shape, 'ring');
    const change = await createQuote(user.id, 'logo', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Mach das Blau dunkler. Ring breiter.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getLogo(second.jobIds[0]!, user.id);
    assert.ok(variant);
    const versions = await listLogoVersions(second.jobIds[0]!, user.id);
    assert.ok(versions.length >= 2);
    const listed = await listLogo(user.id);
    assert.ok(listed.some((j) => j.id === first.jobIds[0]));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
  });
});

describe('logo closure — reference, streamset, mockup, dna adopt', () => {
  it('accepts owned reference images and rejects foreign, SVG, and external URLs', async () => {
    const { user } = await seed();
    const owned = await saveUserFile(user.id, {
      name: 'ref.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assertOwnedLogoReference(user.id, owned.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@logo-ref.test`, 'X');
    const foreign = await saveUserFile(other.id, {
      name: 'steal.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assert.rejects(
      () => assertOwnedLogoReference(user.id, foreign.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_REFERENCE'
    );
    const svgId = randomUUID();
    await dsSet('files', svgId, {
      id: svgId,
      userId: user.id,
      name: 'x.svg',
      mimeType: 'image/svg+xml',
      size: 12,
      category: 'logo',
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => assertOwnedLogoReference(user.id, svgId),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_REFERENCE_MIME'
    );
    const hugeId = randomUUID();
    await dsSet('files', hugeId, {
      id: hugeId,
      userId: user.id,
      name: 'huge.png',
      mimeType: 'image/png',
      size: 9_000_000,
      category: 'logo',
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => assertOwnedLogoReference(user.id, hugeId),
      (err: unknown) => err instanceof ServiceError && err.code === 'REFERENCE_TOO_LARGE'
    );
    await assert.rejects(
      () => generateLogoAsset(user.id, undefined, { logoName: 'A', referenceUrl: 'https://evil.example/logo.png' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NO_EXTERNAL_URL'
    );
  });

  it('own logo can seed streamset draft; foreign logo is rejected', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    const result = await confirmQuote(user.id, quote.id);
    const logo = await requireOwnedLogoJob(user.id, result.jobIds[0]!);
    const draft = await previewStreamsetDraft(user.id, { projectId: project.id, sourceLogoJobId: logo.id });
    assert.equal(draft.sourceLogoJobId, logo.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@logo-ss.test`, 'Z');
    await assert.rejects(() => requireOwnedLogoJob(other.id, logo.id));
  });

  it('own logo can be used as mockup reference; foreign logo is rejected', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf' });
    const result = await confirmQuote(user.id, quote.id);
    const mockup = await generateCompositeMockup(user.id, {
      category: 'mug',
      colorId: 'black',
      modelLabel: 'Classic 11oz',
      placement: 'front',
      scalePercent: 100,
      sourceLogoJobId: result.jobIds[0],
      projectId: project.id,
    });
    assert.equal(mockup.userId, user.id);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@logo-mk.test`, 'M');
    await upsertDna({ userId: other.id, name: 'Other', primaryColors: ['#111111'] });
    await assert.rejects(
      () =>
        generateCompositeMockup(other.id, {
          category: 'mug',
          colorId: 'black',
          modelLabel: 'Classic 11oz',
          placement: 'front',
          scalePercent: 100,
          sourceLogoJobId: result.jobIds[0],
        })
    );
    await assert.rejects(
      () =>
        generateCompositeMockup(user.id, {
          category: 'mug',
          colorId: 'black',
          modelLabel: 'Classic 11oz',
          placement: 'front',
          scalePercent: 100,
          designUrl: 'https://cdn.example/stolen.png',
          projectId: project.id,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NO_EXTERNAL_URL'
    );
  });

  it('DNA adopt requires confirmation and versions history', async () => {
    const { user, project, dna } = await seed();
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', magikStyle: 'Cinematic' });
    const result = await confirmQuote(user.id, quote.id);
    await assert.rejects(
      () => applyLogoToCreatorDna(result.jobIds[0]!, user.id, { confirm: false }),
      (err: unknown) => err instanceof ServiceError && err.code === 'DNA_CONFIRM_REQUIRED'
    );
    assert.equal((await getActiveDna(user.id))?.version, dna.version);
    const updated = await applyLogoToCreatorDna(result.jobIds[0]!, user.id, { confirm: true });
    assert.ok(updated.version > dna.version);
    const versions = await listDnaVersions(updated.id, user.id);
    assert.ok(versions.length >= 2);
  });
});

describe('logo closure — provider and payment safety', () => {
  it('keeps image providers and payments gated', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const ai = src('./ai.service.ts');
    assert.match(ai, /logoTestHooks/);
    assert.match(ai, /LOGO_MOCK_PNG/);
    const quotes = src('./nexter/quotes.service.ts');
    assert.match(quotes, /confirmLogoQuote/);
    const page = src('../../../frontend/src/pages/studios/LogoStudioPage.tsx');
    assert.match(page, /logo-nexter-chip/);
    assert.match(page, /logo-design-summary/);
    assert.match(page, /pickLatestCompletedLogoResult/);
    assert.match(page, /logo-generated-result/);
    assert.match(page, /lastCompletedQuote/);
    assert.match(page, /logoStudioPreviewLabel/);
    assert.doesNotMatch(page, /Konfigurationsvorschau — noch kein generiertes Logo/);
    const preview = src('../../../frontend/src/components/studio/LogoLivePreview.tsx');
    assert.match(preview, /logo-config-preview-badge/);
    assert.doesNotMatch(preview, /'MAGIK AI'/);
    const panel = src('../../../frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /notifyQuoteCompleted/);
    assert.match(panel, /api\.nexter\.confirmQuote/);
    const hook = src('../../../frontend/src/hooks/useStudioProjects.ts');
    assert.match(hook, /lastCompletedQuote\.kind !== module/);
    assert.doesNotMatch(hook, /api\.studio\.generate|confirmQuote/);
    const hydrate = src('./logo.service.ts');
    assert.match(hydrate, /issueFileDownloadUrl/);
    assert.match(hydrate, /fileMissing/);
  });
});

describe('logo studio result display — generated vs configuration', () => {
  it('picks completed owned results and never treats placeholders or failures as success', () => {
    const generated = pickLatestCompletedLogoResult([
      { id: 'old', status: 'completed', imageUrl: 'https://signed.example/old', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', status: 'completed', imageUrl: 'https://signed.example/new', completedAt: '2026-09-18T14:54:35.905Z' },
      { id: 'fail', status: 'failed', error: 'provider' },
      { id: 'missing', status: 'completed', fileMissing: true },
    ]);
    assert.equal(generated?.id, 'new');
    const preferred = pickLatestCompletedLogoResult(
      [
        { id: 'old', status: 'completed', imageUrl: 'https://signed.example/old', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'job-1', status: 'completed', imageUrl: 'https://signed.example/job', completedAt: '2026-09-18T14:54:35.905Z' },
      ],
      ['job-1']
    );
    assert.equal(preferred?.id, 'job-1');
    assert.equal(pickLatestCompletedLogoResult([{ id: 'fail', status: 'failed', error: 'x' }]), null);
    assert.equal(
      pickLatestCompletedLogoResult(
        [{ id: 'old', status: 'completed', imageUrl: 'https://signed.example/old' }],
        ['missing']
      ),
      null
    );
    const mixed = resolveLogoStudioPreview({
      jobs: [
        { id: 'old', status: 'completed', imageUrl: 'https://signed.example/old' },
        { id: 'job-1', status: 'failed', error: 'provider down' },
      ],
      preferredJobIds: ['job-1'],
    });
    assert.equal(mixed.mode, 'failed');
    const success = resolveLogoStudioPreview({
      jobs: [{ id: 'job-1', status: 'completed', imageUrl: 'https://signed.example/job' }],
      preferredJobIds: ['job-1'],
    });
    assert.equal(success.mode, 'generated');
    assert.equal(logoStudioPreviewLabel(success.mode), LOGO_GENERATED_RESULT_LABEL);
    const failed = resolveLogoStudioPreview({
      jobs: [{ id: 'job-1', status: 'failed', error: 'provider down' }],
      preferredJobIds: ['job-1'],
    });
    assert.equal(failed.mode, 'failed');
    assert.equal(logoStudioPreviewLabel(failed.mode), LOGO_FAILED_PREVIEW_LABEL);
    const config = resolveLogoStudioPreview({ jobs: [] });
    assert.equal(config.mode, 'configuration');
    assert.equal(logoStudioPreviewLabel(config.mode), LOGO_CONFIG_PREVIEW_LABEL);
    const missing = resolveLogoStudioPreview({
      jobs: [{ id: 'job-1', status: 'completed', fileMissing: true }],
      preferredJobIds: ['job-1'],
    });
    assert.equal(missing.mode, 'failed');
  });

  it('completed logo list hydrates owned file metadata for studio preview', async () => {
    const { user, project } = await seed();
    setLogoTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'logo', project.id, {
      logoName: 'NightWolf',
      width: 400,
      height: 400,
      outputFormat: 'png',
    });
    const result = await confirmQuote(user.id, quote.id);
    assert.equal(result.jobIds.length, 1);
    const listed = await listLogo(user.id);
    const job = listed.find((row) => row.id === result.jobIds[0]);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.userId, user.id);
    assert.ok(job?.imageUrl);
    assert.equal(job?.fileMissing, false);
    assert.ok(job?.fileId);
    const preview = pickLatestCompletedLogoResult(
      listed.map((row) => ({
        id: row.id,
        status: row.status,
        imageUrl: row.imageUrl,
        fileMissing: row.fileMissing,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
      })),
      result.jobIds
    );
    assert.equal(preview?.id, result.jobIds[0]);
  });
});
