import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  MOCKUP_CATEGORIES,
  applyMockupChangeRequest,
  buildMockupDesignSummary,
  defaultMockupConfig,
  detectDnaChangeScope,
  isLifestyleMockupRequest,
  mockupDownloadFilename,
  mockupNeedsFollowUp,
  parseMockupIntent,
  validateMockupDimensions,
  validateMockupFormat,
  validateMockupPlacement,
  validateMockupScale,
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
  assertOwnedMockupSource,
  downloadMockup,
  generateCompositeMockup,
  generateLifestyleMockup,
  getMockup,
  listMockups,
  listMockupVersions,
  requireOwnedMockupJob,
  retryMockupJob,
  setMockupTestHooks,
} from './mockup.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { setLogoTestHooks } from './logo.service.js';
import { setStickerTestHooks } from './sticker.service.js';
import { requireOwnedLogoJob } from './streamset.service.js';
import { buildMockupPrompt } from './studio-prompt.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setMockupTestHooks(null);
  setLogoTestHooks(null);
  setStickerTestHooks(null);
});

after(() => {
  setMockupTestHooks(null);
  setLogoTestHooks(null);
  setStickerTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@mockup-close.test`, 'Mark');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    brandingStyle: 'esports',
    targetPlatforms: ['twitch'],
  });
  const project = await createProject(user.id, { name: 'Mockup Brand', type: 'streamset', dnaId: dna.id });
  setLogoTestHooks({ result: 'success' });
  const logoQuote = await createQuote(user.id, 'logo', project.id, { logoName: 'NightWolf', width: 400, height: 400 });
  const logoRes = await confirmQuote(user.id, logoQuote.id);
  const logo = await requireOwnedLogoJob(user.id, logoRes.jobIds[0]!);
  return { user, dna, project, logo };
}

describe('mockup closure — config, types, validation', () => {
  it('keeps the seven supported product types and validates config', () => {
    assert.deepEqual(
      MOCKUP_CATEGORIES.map((c) => c.id),
      ['mug', 'tshirt', 'hoodie', 'cap', 'phone', 'poster', 'tote']
    );
    assert.equal(validateMockupScale(0).ok, false);
    assert.equal(validateMockupScale(Number.NaN).ok, false);
    assert.equal(validateMockupScale(Number.POSITIVE_INFINITY).ok, false);
    assert.equal(validateMockupScale(100).ok, true);
    assert.equal(validateMockupPlacement('top').ok, false);
    assert.equal(validateMockupPlacement('center').ok, true);
    assert.equal(validateMockupDimensions(0, 800).ok, false);
    assert.equal(validateMockupDimensions(800, 800).ok, true);
    assert.equal(validateMockupFormat('jpg', 'local').ok, false);
    assert.equal(validateMockupFormat('svg', 'local').ok, true);
    assert.equal(validateMockupFormat('png', 'lifestyle').ok, true);
    const cfg = defaultMockupConfig({ category: 'hoodie', colorId: 'black', scalePercent: 70, placement: 'center' });
    assert.match(buildMockupDesignSummary(cfg), /Hoodie/i);
    assert.equal(
      mockupDownloadFilename({ creatorName: 'Night Wolf!', sourceKind: 'logo', category: 'hoodie', version: 1, ext: 'svg' }),
      'night-wolf-logo-hoodie-mockup-v1.svg'
    );
    assert.equal(mockupDownloadFilename({ creatorName: '../etc/passwd', category: 'mug', version: 1 }).includes('..'), false);
    const changed = applyMockupChangeRequest(cfg, 'Logo kleiner. Hoodie schwarz. Setz es etwas höher.');
    assert.equal(changed.scalePercent < cfg.scalePercent, true);
    assert.equal(changed.placement, 'corner');
    assert.equal(changed.colorId, 'black');
  });
});

describe('mockup closure — nexter', () => {
  it('parses local vs lifestyle intents and asks follow-ups', async () => {
    assert.equal(detectQuoteKind('Zeig mir schwarze Tasse'), 'mockup');
    assert.equal(detectQuoteKind('Zeig mein Logo auf einem Hoodie.'), 'mockup');
    assert.equal(isLifestyleMockupRequest('Mach mir eine realistische Lifestyle-Version.'), true);
    assert.equal(isLifestyleMockupRequest('Zeig mein Logo auf einem Hoodie.'), false);
    assert.equal(mockupNeedsFollowUp('Mach ein Mockup.'), true);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@mockup-fu.test`, 'Ask');
    const session = await nexterChat(user.id, 'Mach ein Mockup.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Produkt|Asset|Lifestyle|Tasse|Hoodie/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('uses own last logo for hoodie composite without quoting', async () => {
    const { user, dna, logo } = await seed();
    const before = dna.version;
    const session = await nexterChat(user.id, 'Zeig mein Logo auf einem Hoodie.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
    const listed = await listMockups(user.id);
    assert.equal(listed.length >= 1, true);
    assert.equal(listed[0]?.lifestyle, false);
    assert.equal(listed[0]?.category, 'hoodie');
    assert.equal(listed[0]?.sourceLogoJobId, logo.id);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
  });

  it('lifestyle request prepares a quote without starting a job or writing DNA', async () => {
    const { user, dna } = await seed();
    const before = dna.version;
    const session = await nexterChat(user.id, 'Mach mir eine realistische Lifestyle-Version auf einer schwarzen Tasse.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation' || a.tool === 'start_generation'), true);
    assert.equal((await listMockups(user.id)).filter((j) => j.lifestyle).length, 0);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
  });

  it('does not silently change DNA', async () => {
    assert.equal(detectDnaChangeScope('Ab jetzt soll mein gesamtes Design blau/violett sein.'), 'explicit-dna');
    const { user, dna } = await seed();
    const session = await nexterChat(user.id, 'Ab jetzt soll mein gesamtes Design blau/violett sein.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /DNA|nicht automatisch|Projekt/i);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
  });
});

describe('mockup closure — local composite', () => {
  it('persists owned local composite without DNA, coins, or provider', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@mockup-nodna.test`, 'Solo');
    setLogoTestHooks({ result: 'success' });
    const logoQuote = await createQuote(user.id, 'logo', undefined, { logoName: 'Solo', width: 400, height: 400 });
    const logoRes = await confirmQuote(user.id, logoQuote.id);
    const before = await getCoinBalance(user.id);
    const job = await generateCompositeMockup(user.id, {
      category: 'hoodie',
      colorId: 'black',
      modelLabel: 'Pullover',
      placement: 'center',
      scalePercent: 80,
      sourceLogoJobId: logoRes.jobIds[0],
    });
    assert.equal(job.userId, user.id);
    assert.equal(job.status, 'completed');
    assert.equal(job.lifestyle, false);
    assert.equal(job.provider, 'composite');
    assert.ok(job.fileId);
    assert.equal(await getCoinBalance(user.id), before);
    assert.equal(await getActiveDna(user.id), null);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@mockup-b.test`, 'B');
    assert.equal(await getMockup(job.id, other.id), null);
    const srcComposite = src('./mockup.service.ts');
    const start = srcComposite.indexOf('export async function generateCompositeMockup');
    const end = srcComposite.indexOf('export async function generateLifestyleMockup');
    const composite = srcComposite.slice(start, end);
    assert.equal(composite.includes('generateImage'), false);
    assert.equal(composite.includes('withCoinCharge'), false);
  });

  it('accepts owned logo/sticker/file and rejects foreign, missing, invalid MIME, and URLs', async () => {
    const { user, project, logo } = await seed();
    setStickerTestHooks({ result: 'success' });
    const stickerQuote = await createQuote(user.id, 'sticker', project.id, { platform: 'twitch' });
    const stickerRes = await confirmQuote(user.id, stickerQuote.id);
    const fromSticker = await generateCompositeMockup(user.id, {
      category: 'tshirt',
      colorId: 'white',
      modelLabel: 'Unisex Classic',
      placement: 'front',
      scalePercent: 100,
      sourceStickerJobId: stickerRes.jobIds[0],
      projectId: project.id,
    });
    assert.equal(fromSticker.status, 'completed');
    const owned = await saveUserFile(user.id, {
      name: 'ref.png',
      mimeType: 'image/png',
      category: 'other',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await assertOwnedMockupSource(user.id, { sourceFileId: owned.id });
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@mockup-ref.test`, 'X');
    await assert.rejects(
      () => generateCompositeMockup(other.id, {
        category: 'mug',
        colorId: 'white',
        modelLabel: 'Classic 11oz',
        placement: 'front',
        scalePercent: 100,
        sourceLogoJobId: logo.id,
      }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'LOGO_NOT_FOUND' || err.code === 'FOREIGN_REFERENCE')
    );
    await assert.rejects(
      () => generateCompositeMockup(user.id, {
        category: 'mug',
        colorId: 'white',
        modelLabel: 'Classic 11oz',
        placement: 'front',
        scalePercent: 100,
        designUrl: 'https://evil.example/x.png',
      }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NO_EXTERNAL_URL'
    );
    await assert.rejects(
      () => generateCompositeMockup(user.id, {
        category: 'mug',
        colorId: 'white',
        modelLabel: 'Classic 11oz',
        placement: 'front',
        scalePercent: 100,
        sourceFileId: randomUUID(),
      }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'FOREIGN_REFERENCE' || err.code === 'SOURCE_MISSING')
    );
    const svgId = randomUUID();
    await dsSet('files', svgId, {
      id: svgId,
      userId: user.id,
      name: 'x.txt',
      mimeType: 'text/plain',
      size: 12,
      category: 'other',
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => assertOwnedMockupSource(user.id, { sourceFileId: svgId }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_REFERENCE_MIME'
    );
    const deletedFile = await saveUserFile(user.id, {
      name: 'gone.png',
      mimeType: 'image/png',
      category: 'other',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await dsSet('files', deletedFile.id, { ...deletedFile, userId: 'deleted' });
    await assert.rejects(
      () => assertOwnedMockupSource(user.id, { sourceFileId: deletedFile.id }),
      (err: unknown) => err instanceof ServiceError && (err.code === 'FOREIGN_REFERENCE' || err.code === 'SOURCE_MISSING')
    );
    const projectRow = await getProject(project.id, user.id);
    assert.ok(projectRow?.assets.some((a) => a.jobId === fromSticker.id || a.module === 'mockup'));
  });

  it('versions local changes without mutating DNA', async () => {
    const { user, project, dna, logo } = await seed();
    const first = await generateCompositeMockup(user.id, {
      category: 'mug',
      colorId: 'white',
      modelLabel: 'Classic 11oz',
      placement: 'front',
      scalePercent: 100,
      sourceLogoJobId: logo.id,
      projectId: project.id,
    });
    const second = await generateCompositeMockup(user.id, {
      category: 'mug',
      colorId: 'black',
      modelLabel: 'Classic 11oz',
      placement: 'corner',
      scalePercent: 70,
      sourceLogoJobId: logo.id,
      parentJobId: first.id,
      request: 'Logo kleiner. Tasse schwarz.',
      projectId: project.id,
    });
    assert.equal(second.parentJobId, first.id);
    const versions = await listMockupVersions(second.id, user.id);
    assert.ok(versions.length >= 2);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
    const dl = await downloadMockup(second.id, user.id);
    assert.ok(dl.downloadUrl);
    const again = await downloadMockup(second.id, user.id);
    assert.ok(again.downloadUrl);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@mockup-dl.test`, 'D');
    await assert.rejects(() => downloadMockup(second.id, other.id));
    const reloaded = await getMockup(second.id, user.id);
    assert.equal(reloaded?.id, second.id);
    assert.equal(reloaded?.category, 'mug');
    assert.equal(reloaded?.colorId, 'black');
    assert.equal(reloaded?.parentJobId, first.id);
    const missingSource = await generateCompositeMockup(user.id, {
      category: 'poster',
      colorId: 'white',
      modelLabel: 'A3 Hochformat',
      placement: 'front',
      scalePercent: 100,
      sourceLogoJobId: logo.id,
      projectId: project.id,
    });
    await dsSet('generationJobs', logo.id, { id: logo.id, userId: 'gone', module: 'logo' });
    const afterDelete = await getMockup(missingSource.id, user.id);
    assert.equal(afterDelete?.sourceMissing, true);
    assert.ok(afterDelete?.imageUrl || afterDelete?.fileId);
  });
});

describe('mockup closure — lifestyle quote', () => {
  it('blocks direct lifestyle generate and ignores client prices', async () => {
    const routes = src('../routes/mockup.routes.ts');
    assert.match(routes, /LIFESTYLE_REQUIRES_QUOTE/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'mockup', project.id, { category: 'mug', colorId: 'black' }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no lifestyle job', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'mockup', project.id, { category: 'mug', colorId: 'black' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listMockups(user.id)).filter((j) => j.lifestyle).length, 0);
  });

  it('double confirm is one charge and one job; mock success and fail+refund', async () => {
    const { user, project, logo } = await seed();
    setMockupTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'mockup', project.id, {
      category: 'mug',
      colorId: 'black',
      sourceLogoJobId: logo.id,
    });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);

    setMockupTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'mockup', project.id, {
      category: 'mug',
      colorId: 'black',
      sourceLogoJobId: logo.id,
    });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.MOCKUP_GENERATION]);
    const job = await getMockup(first.jobIds[0]!, user.id);
    assert.equal(job?.lifestyle, true);
    assert.equal(job?.status, 'completed');
    assert.ok(job?.fileId);
    assert.ok(await getUserFile(job!.fileId!, user.id));
    const projectRow = await getProject(project.id, user.id);
    assert.ok(projectRow?.assets.some((a) => a.module === 'mockup' || a.type === 'mockup'));
    await assert.rejects(
      () => retryMockupJob(job!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'JOB_NOT_RETRYABLE'
    );

    setMockupTestHooks({ result: 'fail' });
    const fail2 = await createQuote(user.id, 'mockup', project.id, { category: 'mug', sourceLogoJobId: logo.id });
    await assert.rejects(() => confirmQuote(user.id, fail2.id));
    const failed = (await listMockups(user.id)).find((j) => j.status === 'failed' && j.lifestyle);
    assert.ok(failed);
    await assert.rejects(
      () => retryMockupJob(failed!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'MOCKUP_REQUIRES_QUOTE'
    );
  });

  it('lifestyle change requires quote; prompt builder uses central config', async () => {
    const { user, project, logo } = await seed();
    setMockupTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'mockup', project.id, {
      category: 'mug',
      colorId: 'black',
      sourceLogoJobId: logo.id,
    });
    const first = await confirmQuote(user.id, quote.id);
    const change = await createQuote(user.id, 'mockup', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Ändere mein Mockup: hellerer Hintergrund.',
      changeRequest: true,
      sourceLogoJobId: logo.id,
      category: 'mug',
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getMockup(second.jobIds[0]!, user.id);
    assert.ok(variant?.lifestyle);
    const cfg = defaultMockupConfig({ mode: 'lifestyle', category: 'hoodie', colorId: 'black' });
    const prompt = buildMockupPrompt(
      {
        id: 'dna',
        userId: user.id,
        name: 'NightWolf',
        type: 'creator',
        primaryColors: ['#1E40AF'],
        secondaryColors: [],
        accentColors: [],
        styleDirection: 'neon',
        favoriteGenres: [],
        gamingStyle: '',
        brandingStyle: 'esports',
        promptStyle: '',
        visualLanguage: '',
        animations: [],
        personalGuidelines: '',
        fonts: [],
        brandingRules: [],
        platformOptimization: [],
        targetAudience: { ageRange: '', interests: [], platforms: [], tone: '', description: '' },
        designLanguage: { mood: [], keywords: [], visualElements: [], doNotUse: [] },
        sourceAssets: [],
        version: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      cfg
    );
    assert.match(prompt, /hoodie|Hoodie|merch/i);
    await assert.rejects(
      () =>
        generateLifestyleMockup(user.id, project.id, {
          category: 'mug',
          sourceLogoJobId: logo.id,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'MOCKUP_REQUIRES_QUOTE'
    );
  });
});

describe('mockup closure — provider and payment safety', () => {
  it('keeps image providers and payments gated', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const ai = src('./ai.service.ts');
    assert.match(ai, /mockupTestHooks/);
    assert.match(ai, /MOCKUP_MOCK_PNG/);
    const page = readFileSync(join(dir, '../../../frontend/src/pages/studios/MockupStudioPage.tsx'), 'utf8');
    assert.match(page, /mockup-nexter-chip|mockup-save-composite/);
    assert.match(page, /mockup-preview/);
    assert.match(page, /min-h-11/);
    assert.match(page, /aria-label/);
  });
});
