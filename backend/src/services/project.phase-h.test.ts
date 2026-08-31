import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_COSTS, CoinSpendCategory } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna } from './dna.service.js';
import {
  createProject,
  duplicateProject,
  getProject,
  importProjectZip,
  purgeProject,
  softDeleteProject,
  updateProject,
} from './project.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { getProjectOverview } from './project-overview.service.js';
import { exportProjectZip } from './project-export.service.js';
import { saveUserFile, listUserFiles, getUserFile, deleteUserFile } from './file-cloud.service.js';
import { dsSet } from '../lib/data-store.js';
import { parseZipArchive } from '../lib/zip-store.js';
import { extractStoragePathFromUrl, isOwnedStoragePath } from '../lib/firebase-storage.js';
import { getCoinBalance } from './coins.service.js';
import { getJob } from './ai.service.js';
import {
  buildChangePrompt,
  changeModuleToQuoteKind,
  executeQuotedChangeRequest,
  getOwnedJobForChange,
  getVersionsForJob,
  restoreVersion,
} from './change-request.service.js';
import { restoreContentRevision } from './text.service.js';
import { createQuote, confirmQuote, cancelQuote, getQuote } from './nexter/quotes.service.js';
import { buildNexterContext } from './nexter/context.service.js';
import { coinCostForKind } from './nexter/tools.service.js';
import { ServiceError } from '../lib/errors.js';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function seedUser(label: string) {
  const id = randomUUID();
  await getOrCreateUser(id, `${label}@phase-h.test`, label);
  const dna = await upsertDna({
    userId: id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'gaming',
    primaryColors: ['#1E40AF', '#7C3AED'],
    locks: { colors: true, character: true, mascot: true, name: true },
  });
  const project = await createProject(id, {
    name: 'NightWolf',
    type: 'branding',
    dnaId: dna.id,
  });
  return { id, dna, project };
}

async function seedJob(
  userId: string,
  module: string,
  extra?: { projectId?: string; assetKey?: string; imageUrl?: string; createdAt?: string }
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
    createdAt: now,
    completedAt: now,
  });
  return id;
}

function zipFromDataUrl(url: string) {
  const b64 = url.split(',')[1];
  assert.ok(b64, 'export is a data URL zip in dev');
  return parseZipArchive(Buffer.from(b64, 'base64'));
}

describe('phase H — project ownership and detail', () => {
  it('own project overview is readable with DNA; foreign project is 404', async () => {
    const a = await seedUser('owner');
    const b = await seedUser('other');
    const overview = await getProjectOverview(a.project.id, a.id);
    assert.equal(overview.project.id, a.project.id);
    assert.equal(overview.dna?.id, a.dna.id);
    assert.equal(overview.dna?.name, 'NightWolf');
    await assert.rejects(() => getProjectOverview(a.project.id, b.id), /nicht gefunden/);
    await assert.rejects(() => getProjectOverview(b.project.id, a.id), /nicht gefunden/);
  });

  it('status change persists across reload', async () => {
    const { id, project } = await seedUser('status');
    const updated = await updateProject(project.id, id, { status: 'in_progress' });
    assert.equal(updated.status, 'in_progress');
    const reloaded = await getProject(project.id, id);
    assert.equal(reloaded?.status, 'in_progress');
  });

  it('asset list aggregates owned project assets and never foreign jobs', async () => {
    const a = await seedUser('agg');
    const b = await seedUser('agg-other');
    const logoId = await seedJob(a.id, 'logo', { projectId: a.project.id });
    await attachAssetToProject(a.id, a.project.id, {
      name: 'Logo',
      type: 'logo',
      url: PIXEL,
      jobId: logoId,
      module: 'logo',
      sourceType: 'generation',
    });
    await seedJob(b.id, 'logo', { projectId: b.project.id, imageUrl: PIXEL });
    const overview = await getProjectOverview(a.project.id, a.id);
    assert.ok(overview.assets.some((x) => x.jobId === logoId));
    assert.equal(
      overview.assets.some((x) => x.jobId && x.jobId !== logoId && x.module === 'logo'),
      false
    );
    assert.ok(overview.assets.every((x) => x.url === PIXEL || x.jobId === logoId || Boolean(x.id)));
  });

  it('soft delete keeps jobs and files; duplicate copies structure not assets', async () => {
    const { id, project } = await seedUser('soft');
    const jobId = await seedJob(id, 'logo', { projectId: project.id });
    await attachAssetToProject(id, project.id, {
      name: 'Logo',
      type: 'logo',
      url: PIXEL,
      jobId,
      module: 'logo',
    });
    const file = await saveUserFile(id, {
      name: 'keep.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: project.id,
      sourceJobId: jobId,
    });
    await softDeleteProject(project.id, id);
    assert.ok(await getJob(jobId));
    assert.ok(await getUserFile(file.id, id));
    const restoredShape = await duplicateProject(
      (await createProject(id, { name: 'WithAssets', type: 'logo', dnaId: project.dnaId })).id,
      id
    );
    assert.equal(restoredShape.assets.length, 0);
    assert.match(restoredShape.name, /Kopie/);
  });

  it('duplicate of a project with assets does not copy asset binaries', async () => {
    const { id, project } = await seedUser('dup');
    await attachAssetToProject(id, project.id, {
      name: 'Logo',
      type: 'logo',
      url: PIXEL,
      jobId: await seedJob(id, 'logo', { projectId: project.id }),
      module: 'logo',
    });
    const copy = await duplicateProject(project.id, id);
    assert.equal(copy.assets.length, 0);
    assert.equal((await getProject(project.id, id))?.assets.length, 1);
  });
});

describe('phase H — project assets as references', () => {
  it('logo/banner/overlay/facecam/sticker/streamset/mockup/animation/video/content attach without a second copy', async () => {
    const { id, project } = await seedUser('attach');
    const modules = [
      { module: 'logo', type: 'logo' },
      { module: 'banner', type: 'banner' },
      { module: 'overlay', type: 'overlay' },
      { module: 'facecam', type: 'facecam' },
      { module: 'sticker', type: 'sticker' },
    ];
    for (const m of modules) {
      const jobId = await seedJob(id, m.module, { projectId: project.id, assetKey: m.module === 'facecam' ? 'facecam' : undefined });
      const first = await attachAssetToProject(id, project.id, {
        name: m.module,
        type: m.type,
        url: PIXEL,
        jobId,
        module: m.module,
        sourceType: 'generation',
        assetKey: m.module === 'facecam' ? 'facecam' : undefined,
      });
      const second = await attachAssetToProject(id, project.id, {
        name: m.module,
        type: m.type,
        url: PIXEL,
        jobId,
        module: m.module,
      });
      assert.equal(first?.id, second?.id);
    }
    const streamJob = await seedJob(id, 'overlay', { projectId: project.id, assetKey: 'stream-start' });
    await attachAssetToProject(id, project.id, {
      name: 'stream-start',
      type: 'overlay',
      url: PIXEL,
      jobId: streamJob,
      module: 'overlay',
      assetKey: 'stream-start',
      sourceType: 'generation',
    });
    const mockupId = randomUUID();
    await dsSet('mockupJobs', mockupId, {
      id: mockupId,
      userId: id,
      category: 'mug',
      status: 'completed',
      imageUrl: PIXEL,
      projectId: project.id,
      createdAt: new Date().toISOString(),
    });
    await attachAssetToProject(id, project.id, {
      name: 'Mockup mug',
      type: 'mockup',
      url: PIXEL,
      jobId: mockupId,
      module: 'mockup',
      sourceType: 'mockup',
    });
    const animId = randomUUID();
    await dsSet('mediaJobs', animId, {
      id: animId,
      userId: id,
      type: 'intro',
      status: 'completed',
      imageUrl: PIXEL,
      projectId: project.id,
      title: 'Intro',
      createdAt: new Date().toISOString(),
    });
    await attachAssetToProject(id, project.id, {
      name: 'Intro',
      type: 'animation',
      url: PIXEL,
      jobId: animId,
      module: 'intro',
      sourceType: 'animation',
    });
    await attachAssetToProject(id, project.id, {
      name: 'Render',
      type: 'video',
      url: PIXEL,
      module: 'video',
      sourceType: 'video',
      sourceId: randomUUID(),
    });
    const pkgId = randomUUID();
    await dsSet('textJobs', pkgId, {
      id: pkgId,
      userId: id,
      projectId: project.id,
      status: 'completed',
      topic: 'raid',
      kind: 'caption',
      hook: 'go',
      title: 'Wolf Launch',
      caption: 'long caption',
      description: 'd',
      hashtags: ['wolf'],
      callToAction: 'follow',
      platformVariants: {},
      usedTranscript: false,
      output: 'text',
      revisions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await attachAssetToProject(id, project.id, {
      name: 'Wolf Launch',
      type: 'text',
      url: `content:${pkgId}`,
      module: 'text',
      sourceType: 'content',
      sourceId: pkgId,
    });
    const overview = await getProjectOverview(project.id, id);
    const types = new Set(overview.assets.map((a) => a.type));
    for (const t of ['logo', 'banner', 'overlay', 'facecam', 'sticker', 'mockup', 'animation', 'video', 'text']) {
      assert.ok(types.has(t), `missing aggregated type ${t}`);
    }
    assert.ok(overview.content.some((c) => c.id === pkgId));
    const reloaded = await getProject(project.id, id);
    assert.equal(reloaded?.assets.filter((a) => a.jobId === streamJob).length, 1);
  });
});

describe('phase H — change request quote, locks, restore', () => {
  it('direct POST source requires quote; module price is not AI_IMAGE', () => {
    const src = readFileSync(join(dir, '../routes/change-request.routes.ts'), 'utf8');
    assert.match(src, /CHANGE_REQUIRES_QUOTE/);
    assert.match(src, /createQuote/);
    assert.equal(changeModuleToQuoteKind('logo'), 'logo');
    assert.equal(coinCostForKind('logo'), COIN_COSTS[CoinSpendCategory.LOGO_GENERATION]);
    assert.equal(coinCostForKind('banner'), COIN_COSTS[CoinSpendCategory.BANNER_GENERATION]);
    assert.equal(coinCostForKind('facecam'), COIN_COSTS[CoinSpendCategory.FACECAM_GENERATION]);
    assert.notEqual(coinCostForKind('logo'), COIN_COSTS[CoinSpendCategory.AI_IMAGE]);
  });

  it('own image job is accepted; foreign job is rejected', async () => {
    const a = await seedUser('cr-own');
    const b = await seedUser('cr-other');
    const own = await seedJob(a.id, 'logo', { projectId: a.project.id });
    const foreign = await seedJob(b.id, 'logo', { projectId: b.project.id });
    const job = await getOwnedJobForChange(own, a.id);
    assert.equal(job.id, own);
    await assert.rejects(() => getOwnedJobForChange(foreign, a.id), ServiceError);
  });

  it('DNA lock lines are applied to the change prompt', async () => {
    const { dna } = await seedUser('locks');
    const prompt = buildChangePrompt(dna, 'Mach den Hintergrund dunkler.', 'original prompt');
    assert.match(prompt, /LOCKED colors/);
    assert.match(prompt, /#1E40AF/);
    assert.match(prompt, /LOCKED character/);
    assert.match(prompt, /LOCKED name NightWolf/);
    assert.match(prompt, /AI variation/);
  });

  it('quote then cancel spends 0; confirm without provider refunds once and consumes quote', async () => {
    const { id, project } = await seedUser('cr-quote');
    const jobId = await seedJob(id, 'logo', { projectId: project.id });
    const start = await getCoinBalance(id);
    const quote = await createQuote(id, 'logo', project.id, {
      changeRequest: true,
      jobId,
      request: 'Hintergrund dunkler',
    });
    assert.equal(quote.coinCost, COIN_COSTS[CoinSpendCategory.LOGO_GENERATION]);
    assert.equal(await getCoinBalance(id), start);
    await cancelQuote(id, quote.id);
    assert.equal(await getCoinBalance(id), start);
    const cancelled = await getQuote(id, quote.id);
    assert.equal(cancelled?.status, 'cancelled');

    const prevOpen = process.env.OPENAI_API_KEY;
    const prevRep = process.env.REPLICATE_API_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
    const quote2 = await createQuote(id, 'logo', project.id, {
      changeRequest: true,
      jobId,
      request: 'Hintergrund dunkler',
    });
    try {
      await assert.rejects(() => confirmQuote(id, quote2.id));
      assert.equal(await getCoinBalance(id), start);
      const used = await getQuote(id, quote2.id);
      assert.equal(used?.status, 'cancelled');
      await assert.rejects(() => confirmQuote(id, quote2.id), /verwendet|abgebrochen|QUOTE_USED/i);
      assert.equal(await getCoinBalance(id), start);
    } finally {
      if (prevOpen) process.env.OPENAI_API_KEY = prevOpen;
      else delete process.env.OPENAI_API_KEY;
      if (prevRep) process.env.REPLICATE_API_TOKEN = prevRep;
      else delete process.env.REPLICATE_API_TOKEN;
    }
  });

  it('designVersions persist and restore costs 0 coins without a provider', async () => {
    const { id, project } = await seedUser('restore');
    const jobId = await seedJob(id, 'logo', { projectId: project.id, imageUrl: PIXEL });
    const v1 = randomUUID();
    const v2 = randomUUID();
    const url2 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await dsSet('designVersions', v1, {
      id: v1,
      userId: id,
      jobId,
      version: 1,
      imageUrl: PIXEL,
      changeRequest: 'Original',
      createdAt: new Date().toISOString(),
    });
    await dsSet('designVersions', v2, {
      id: v2,
      userId: id,
      jobId,
      version: 2,
      imageUrl: url2,
      changeRequest: 'dunkler',
      parentVersionId: v1,
      createdAt: new Date().toISOString(),
    });
    await dsSet('generationJobs', jobId, {
      ...(await getJob(jobId)),
      imageUrl: url2,
    });
    const before = await getCoinBalance(id);
    const restored = await restoreVersion(v1, id);
    assert.equal(restored?.id, v1);
    assert.equal((await getJob(jobId))?.imageUrl, PIXEL);
    assert.equal(await getCoinBalance(id), before);
    const versions = await getVersionsForJob(jobId, id);
    assert.equal(versions.length, 2);
  });

  it('content revision restore is 0 coins and uses the text system', async () => {
    const { id, project } = await seedUser('text-restore');
    const pkgId = randomUUID();
    await dsSet('textJobs', pkgId, {
      id: pkgId,
      userId: id,
      projectId: project.id,
      status: 'completed',
      topic: 'raid',
      kind: 'caption',
      hook: 'go',
      title: 'Wolf',
      caption: 'short',
      description: 'd',
      hashtags: ['wolf'],
      callToAction: 'follow',
      platformVariants: {},
      usedTranscript: false,
      output: 'short',
      revisions: [
        {
          at: new Date().toISOString(),
          field: 'caption',
          instruction: 'kürzer',
          before: 'very long caption about the raid',
          after: 'short',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const before = await getCoinBalance(id);
    const restored = await restoreContentRevision(pkgId, id, 0);
    assert.equal(restored.caption, 'very long caption about the raid');
    assert.equal(await getCoinBalance(id), before);
  });

  it('executeQuotedChangeRequest without provider does not persist a fake design version', async () => {
    const { id, project, dna } = await seedUser('no-fake');
    const jobId = await seedJob(id, 'logo', { projectId: project.id });
    const prevOpen = process.env.OPENAI_API_KEY;
    const prevRep = process.env.REPLICATE_API_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
    try {
      await assert.rejects(() => executeQuotedChangeRequest(id, jobId, 'dunkler', project.id));
      const versions = await getVersionsForJob(jobId, id);
      assert.ok(versions.length <= 1);
      assert.ok(versions.every((v) => v.changeRequest === 'Original' || v.version === 1));
      assert.ok(dna.locks?.colors);
    } finally {
      if (prevOpen) process.env.OPENAI_API_KEY = prevOpen;
      else delete process.env.OPENAI_API_KEY;
      if (prevRep) process.env.REPLICATE_API_TOKEN = prevRep;
      else delete process.env.REPLICATE_API_TOKEN;
    }
  });
});

describe('phase H — nexter project context', () => {
  it('project context wins over another project logo; foreign ids are omitted', async () => {
    const a = await seedUser('nx-a');
    const other = await createProject(a.id, { name: 'OtherBrand', type: 'logo', dnaId: a.dna.id });
    const nightLogo = await seedJob(a.id, 'logo', {
      projectId: a.project.id,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const otherLogo = await seedJob(a.id, 'logo', {
      projectId: other.id,
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    const banner = await seedJob(a.id, 'banner', { projectId: a.project.id });
    const facecam = await seedJob(a.id, 'facecam', { projectId: a.project.id, assetKey: 'facecam' });
    const b = await seedUser('nx-b');
    const stranger = await seedJob(b.id, 'logo', { projectId: b.project.id });

    const ctx = await buildNexterContext(a.id, a.project.id);
    assert.equal(ctx.lastLogoId, nightLogo);
    assert.notEqual(ctx.lastLogoId, otherLogo);
    assert.equal(ctx.lastBannerId, banner);
    assert.equal(ctx.lastFacecamId, facecam);
    assert.equal(ctx.logoCount, 1);
    assert.ok(ctx.assetInventory?.some((line) => /Logo/i.test(line)));
    assert.equal(ctx.lastLogoId === stranger, false);

    const global = await buildNexterContext(a.id);
    assert.ok(global.lastLogoId === otherLogo || global.lastLogoId === nightLogo);
  });

  it('does not leak another user id into context', async () => {
    const a = await seedUser('iso-a');
    const b = await seedUser('iso-b');
    const bid = await seedJob(b.id, 'logo', { projectId: b.project.id });
    const ctx = await buildNexterContext(a.id, a.project.id);
    assert.notEqual(ctx.lastLogoId, bid);
    assert.equal(ctx.logoCount ?? 0, 0);
  });
});

describe('phase H — export zip and files', () => {
  it('project zip is real, project-scoped, deduped, and marks missing assets', async () => {
    const { id, project } = await seedUser('zip');
    const jobId = await seedJob(id, 'logo', { projectId: project.id });
    await attachAssetToProject(id, project.id, {
      name: 'Logo',
      type: 'logo',
      url: PIXEL,
      jobId,
      module: 'logo',
      sourceType: 'generation',
    });
    const file = await saveUserFile(id, {
      name: 'same-logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: project.id,
      sourceJobId: jobId,
    });
    await attachAssetToProject(id, project.id, {
      name: 'Logo file',
      type: 'logo',
      url: file.downloadUrl || PIXEL,
      fileId: file.id,
      module: 'logo',
      sourceType: 'file',
    });
    await attachAssetToProject(id, project.id, {
      name: 'Gone',
      type: 'banner',
      url: 'https://example.invalid/missing-phase-h.png',
      module: 'banner',
      sourceType: 'generation',
    });
    const globalFile = await saveUserFile(id, {
      name: 'global-not-in-project.png',
      mimeType: 'image/png',
      category: 'other',
      dataUrl: PIXEL,
    });
    const result = await exportProjectZip(project.id, id);
    assert.ok(result.exportUrl.startsWith('data:application/zip'));
    assert.equal(result.manifest.projectId, project.id);
    assert.equal(result.manifest.projectName, 'NightWolf');
    assert.ok(result.manifest.dna?.id);
    assert.ok(result.missingCount >= 1);
    assert.ok(result.manifest.assets.some((a) => a.missing));
    const entries = zipFromDataUrl(result.exportUrl);
    const names = entries.map((e) => e.name);
    assert.ok(names.includes('manifest.json'));
    assert.equal(names.some((n) => n.includes('..')), false);
    assert.equal(
      names.filter((n) => n !== 'manifest.json' && (n.startsWith('assets/') || n.startsWith('files/') || n.startsWith('jobs/'))).length >= 1,
      true
    );
    const pngEntries = entries.filter((e) => e.name.endsWith('.png'));
    assert.equal(pngEntries.length, 1);
    assert.equal(
      JSON.stringify(result.manifest).includes(globalFile.id),
      false
    );
    const manifest = JSON.parse(entries.find((e) => e.name === 'manifest.json')!.data.toString('utf8'));
    assert.equal(manifest.projectId, project.id);
    assert.equal(manifest.exportVersion, 1);
  });

  it('foreign project zip is denied; zip names are sanitized', async () => {
    const a = await seedUser('zip-a');
    const b = await seedUser('zip-b');
    await assert.rejects(() => exportProjectZip(a.project.id, b.id));
    const { sanitizeZipEntryName, zipEntryPath } = await import('../lib/zip-store.js');
    assert.equal(sanitizeZipEntryName('../etc/passwd').includes('..'), false);
    assert.equal(zipEntryPath('assets', '../../../secret.png').startsWith('assets/'), true);
    assert.equal(zipEntryPath('assets', '../../../secret.png').includes('..'), false);
  });

  it('today project types import instead of falling back to custom', async () => {
    const { id } = await seedUser('import');
    const { buildZipArchive } = await import('../lib/zip-store.js');
    for (const type of ['streamset', 'mockup', 'shorts', 'social', 'text'] as const) {
      const zip = buildZipArchive([
        {
          name: 'manifest.json',
          data: Buffer.from(
            JSON.stringify({
              exportVersion: 1,
              projectId: 'old',
              projectName: type,
              projectType: type,
              exportedAt: new Date().toISOString(),
              dna: null,
              assets: [],
              project: { name: `Imported ${type}`, type },
            }),
            'utf8'
          ),
        },
      ]);
      const imported = await importProjectZip(id, `data:application/zip;base64,${zip.toString('base64')}`, {
        importDna: false,
        importCloud: false,
      });
      assert.equal(imported.project.type, type, type);
    }
  });

  it('own file is readable, foreign 404, projectId filter and persist, unsafe delete does not guess a path', async () => {
    const a = await seedUser('files-a');
    const b = await seedUser('files-b');
    const owned = await saveUserFile(a.id, {
      name: 'proj.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: a.project.id,
    });
    assert.equal(owned.projectId, a.project.id);
    assert.ok(owned.storagePath?.startsWith(`users/${a.id}/`));
    assert.equal((await getUserFile(owned.id, a.id))?.id, owned.id);
    assert.equal(await getUserFile(owned.id, b.id), null);
    const listed = await listUserFiles(a.id, { projectId: a.project.id });
    assert.ok(listed.some((f) => f.id === owned.id));
    const other = await saveUserFile(a.id, {
      name: 'unscoped.png',
      mimeType: 'image/png',
      category: 'other',
      dataUrl: PIXEL,
    });
    assert.equal(
      (await listUserFiles(a.id, { projectId: a.project.id })).some((f) => f.id === other.id),
      false
    );

    assert.equal(extractStoragePathFromUrl(PIXEL), null);
    assert.equal(extractStoragePathFromUrl('https://cdn.example/not-ours.png'), null);
    assert.equal(isOwnedStoragePath(a.id, 'users/someone-else/logo/x.png'), false);
    assert.equal(isOwnedStoragePath(a.id, `users/${a.id}/../secret.png`), false);

    const guessed = randomUUID();
    await dsSet('files', guessed, {
      id: guessed,
      userId: a.id,
      name: 'external.png',
      mimeType: 'image/png',
      size: 10,
      category: 'other',
      downloadUrl: 'https://cdn.example/external.png',
      createdAt: new Date().toISOString(),
    });
    assert.equal(await deleteUserFile(guessed, a.id), true);
    assert.equal(await getUserFile(guessed, a.id), null);

    await purgeProject(a.project.id, a.id);
    assert.ok(await getUserFile(owned.id, a.id));
  });
});
