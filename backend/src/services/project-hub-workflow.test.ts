import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna, getActiveDna } from './dna.service.js';
import {
  createProject,
  getProject,
  listProjects,
  queryProjects,
  sanitizeProjectName,
  softDeleteProject,
  updateProject,
  PROJECT_LIST_DEFAULT_LIMIT,
} from './project.service.js';
import { attachAssetToProject, detachAssetFromProject } from './project-assets.service.js';
import { getProjectOverview, studioPathForKind } from './project-overview.service.js';
import { saveUserFile, getUserFile, issueFileDownloadUrl, deleteUserFile } from './file-cloud.service.js';
import { dsSet } from '../lib/data-store.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { buildNexterContext } from './nexter/context.service.js';
import { ServiceError } from '../lib/errors.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

async function seed(prefix: string) {
  return getOrCreateUser(`${prefix}-${randomUUID()}`, `${randomUUID()}@hub.test`, prefix, {
    role: UserRole.USER,
  });
}

async function seedJob(
  userId: string,
  module: string,
  extra?: { projectId?: string; status?: string; batchId?: string; imageUrl?: string; error?: string }
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  await dsSet('generationJobs', id, {
    id,
    userId,
    module,
    status: extra?.status ?? 'completed',
    prompt: module,
    imageUrl: extra?.imageUrl,
    projectId: extra?.projectId,
    batchId: extra?.batchId,
    error: extra?.error,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

describe('projects hub local closure — ownership, crud, list', () => {
  it('lists only own projects and blocks foreign read/rename/delete', async () => {
    const a = await seed('own');
    const b = await seed('foreign');
    const mine = await createProject(a.id, { name: 'Alpha Hub', type: 'logo' });
    const theirs = await createProject(b.id, { name: 'Secret Hub', type: 'banner' });
    const listed = await queryProjects(a.id, { sort: 'updated', limit: 50 });
    assert.equal(listed.projects.some((p) => p.id === mine.id), true);
    assert.equal(listed.projects.some((p) => p.id === theirs.id), false);
    assert.equal(await getProject(theirs.id, a.id), null);
    await assert.rejects(() => updateProject(theirs.id, a.id, { name: 'Hacked' }));
    await assert.rejects(() => softDeleteProject(theirs.id, a.id));
    await assert.rejects(() => getProjectOverview(theirs.id, a.id), /nicht gefunden/);
  });

  it('validates names, renames owned projects, and keeps assets', async () => {
    assert.equal(sanitizeProjectName('  Lars  '), 'Lars');
    assert.throws(() => sanitizeProjectName('   '), /erforderlich/);
    assert.throws(() => sanitizeProjectName('\u0000'), /erforderlich/);
    const user = await seed('rename');
    const project = await createProject(user.id, { name: 'Alt', type: 'banner' });
    await attachAssetToProject(user.id, project.id, {
      name: 'Banner',
      type: 'banner',
      url: PIXEL,
      module: 'banner',
    });
    const renamed = await updateProject(project.id, user.id, { name: 'Neu' });
    assert.equal(renamed.name, 'Neu');
    assert.ok(renamed.updatedAt >= project.updatedAt);
    assert.equal(renamed.assets.length, 1);
    await assert.rejects(() => createProject(user.id, { name: '  ', type: 'logo' }), ServiceError);
  });

  it('soft-deletes own projects from the active list without deleting files', async () => {
    const user = await seed('del');
    const project = await createProject(user.id, { name: 'TrashMe', type: 'logo' });
    const file = await saveUserFile(user.id, {
      name: 'keep-hub.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: project.id,
    });
    await softDeleteProject(project.id, user.id);
    const active = await queryProjects(user.id, { filter: 'active' });
    assert.equal(active.projects.some((p) => p.id === project.id), false);
    const archived = await queryProjects(user.id, { filter: 'archived' });
    assert.equal(archived.projects.some((p) => p.id === project.id), true);
    assert.ok(await getUserFile(file.id, user.id));
    assert.ok(await getActiveDna(user.id).then((d) => d === null || d.userId === user.id));
  });

  it('searches, sorts, filters and limits the project list', async () => {
    const user = await seed('list');
    const first = await createProject(user.id, { name: 'Zebra Logo', type: 'logo' });
    await new Promise((r) => setTimeout(r, 15));
    const second = await createProject(user.id, { name: 'Alpha Banner', type: 'banner' });
    await updateProject(second.id, user.id, { name: 'Alpha Banner' });
    for (let i = 0; i < 6; i += 1) {
      await createProject(user.id, { name: `Extra ${i}`, type: 'custom' });
    }
    const all = await listProjects(user.id);
    const page = await queryProjects(user.id, { sort: 'updated', limit: 5 });
    assert.equal(page.projects.length, 5);
    assert.equal(page.total, all.length);
    assert.ok(page.total > PROJECT_LIST_DEFAULT_LIMIT || page.total >= 8);
    const named = await queryProjects(user.id, { sort: 'name', q: 'zebra' });
    assert.equal(named.projects.some((p) => p.id === first.id), true);
    assert.equal(named.projects.some((p) => p.id === second.id), false);
    const banners = await queryProjects(user.id, { type: 'banner' });
    assert.ok(banners.projects.every((p) => p.type === 'banner'));
    const newest = await queryProjects(user.id, { sort: 'newest' });
    const oldest = await queryProjects(user.id, { sort: 'oldest' });
    assert.ok(newest.projects[0]?.createdAt >= (newest.projects.at(-1)?.createdAt ?? ''));
    assert.ok(oldest.projects[0]?.createdAt <= (oldest.projects.at(-1)?.createdAt ?? ''));
  });
});

describe('projects hub local closure — detail, assets, jobs, nexter', () => {
  it('shows own detail, assets, versions and blocks foreign assets and missing ids', async () => {
    const a = await seed('detail');
    const b = await seed('other');
    const project = await createProject(a.id, { name: 'Detail', type: 'logo' });
    const file = await saveUserFile(a.id, {
      name: 'own.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: project.id,
    });
    const foreignFile = await saveUserFile(b.id, {
      name: 'foreign.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const attached = await attachAssetToProject(a.id, project.id, {
      name: 'Logo file',
      type: 'logo',
      url: file.downloadUrl || PIXEL,
      fileId: file.id,
      module: 'logo',
      sourceType: 'file',
    });
    assert.ok(attached);
    assert.equal(
      await attachAssetToProject(a.id, project.id, {
        name: 'Stolen',
        type: 'logo',
        url: PIXEL,
        fileId: foreignFile.id,
        module: 'logo',
        sourceType: 'file',
      }),
      null
    );
    const overview = await getProjectOverview(project.id, a.id);
    assert.equal(overview.project.id, project.id);
    assert.equal(overview.assets.some((x) => x.fileId === file.id), true);
    assert.equal(overview.assets.some((x) => x.fileId === foreignFile.id), false);
    assert.ok(overview.assets.find((x) => x.fileId === file.id)?.previewUrl);
    const issued = await issueFileDownloadUrl(file.id, a.id);
    assert.ok(issued?.downloadUrl);
    assert.equal(await issueFileDownloadUrl(foreignFile.id, a.id), null);
    await assert.rejects(() => getProjectOverview(randomUUID(), a.id), /nicht gefunden/);
  });

  it('removes an asset link without deleting the file', async () => {
    const user = await seed('detach');
    const project = await createProject(user.id, { name: 'Detach', type: 'sticker' });
    const file = await saveUserFile(user.id, {
      name: 'sticker.png',
      mimeType: 'image/png',
      category: 'sticker',
      dataUrl: PIXEL,
      projectId: project.id,
    });
    const asset = await attachAssetToProject(user.id, project.id, {
      name: 'Sticker',
      type: 'sticker',
      url: PIXEL,
      fileId: file.id,
      module: 'sticker',
    });
    assert.ok(asset);
    const next = await detachAssetFromProject(user.id, project.id, asset!.id);
    assert.equal(next.assets.some((x) => x.id === asset!.id), false);
    assert.ok(await getUserFile(file.id, user.id));
    await deleteUserFile(file.id, user.id);
    assert.equal(await getUserFile(file.id, user.id), null);
  });

  it('shows project jobs, streamset partial and no fake progress', async () => {
    const user = await seed('jobs');
    const project = await createProject(user.id, { name: 'Jobs', type: 'streamset' });
    await seedJob(user.id, 'logo', { projectId: project.id, status: 'processing' });
    const done = await seedJob(user.id, 'banner', {
      projectId: project.id,
      status: 'completed',
      imageUrl: PIXEL,
    });
    await seedJob(user.id, 'sticker', { projectId: project.id, status: 'failed', error: 'mock fail' });
    const parent = await seedJob(user.id, 'streamset', { projectId: project.id, status: 'partial' });
    await seedJob(user.id, 'overlay', { projectId: project.id, status: 'completed', batchId: parent, imageUrl: PIXEL });
    await seedJob(user.id, 'overlay', { projectId: project.id, status: 'failed', batchId: parent });
    const foreign = await seed('job-b');
    await seedJob(foreign.id, 'logo', { projectId: (await createProject(foreign.id, { name: 'F', type: 'logo' })).id, status: 'processing' });

    const overview = await getProjectOverview(project.id, user.id);
    assert.equal(overview.activeJobs.some((j) => j.status === 'processing'), true);
    assert.equal(overview.failedJobs.length >= 1, true);
    assert.equal(overview.completedJobs.some((j) => j.id === done), true);
    assert.equal(overview.activeJobs.every((j) => j.progressKnown === false), true);
    assert.ok(overview.streamset);
    assert.equal(overview.streamset?.status, 'partial');
    assert.ok(overview.streamset && overview.streamset.total >= 2);
    const dump = JSON.stringify(overview.activeJobs.map(({ status, progressKnown, label }) => ({ status, progressKnown, label })));
    assert.equal(dump.includes('%'), false);
    const blob = JSON.stringify(overview);
    assert.equal(blob.includes(foreign.id), false);
  });

  it('reuses Nexter project/DNA/asset context and omits foreign projects', async () => {
    const user = await seed('nx');
    const dna = await upsertDna({ userId: user.id, name: 'HubDNA', styleDirection: 'gaming', primaryColors: ['#111'] });
    const project = await createProject(user.id, { name: 'Nexter Brand', type: 'logo', dnaId: dna.id });
    await saveUserFile(user.id, { name: 'hub-logo.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL, projectId: project.id });
    const ctx = await buildNexterContext(user.id, project.id);
    assert.equal(ctx.projectId, project.id);
    assert.equal(ctx.hasDna, true);
    assert.equal(ctx.dnaName, 'HubDNA');
    assert.ok((ctx.fileCount ?? 0) >= 1);
    const other = await seed('nx-b');
    const foreign = await createProject(other.id, { name: 'NoLeak', type: 'logo' });
    const leaked = await buildNexterContext(user.id, foreign.id);
    assert.notEqual(leaked.projectId, foreign.id);
  });

  it('project without DNA still loads and DNA is not rewritten by hub services', async () => {
    const user = await seed('nodna');
    const project = await createProject(user.id, { name: 'Plain', type: 'custom' });
    const overview = await getProjectOverview(project.id, user.id);
    assert.equal(overview.dna, null);
    const src = repo('backend/src/services/project-overview.service.ts');
    assert.equal(src.includes('upsertDna'), false);
    assert.equal(src.includes('addCoins'), false);
  });
});

describe('projects hub local closure — routes, ui, safety', () => {
  it('continue routes exist and hub/detail stay on the existing project system', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const hub = repo('frontend/src/v2/pages/ProjectsHubPage.tsx');
    const detail = repo('frontend/src/v2/pages/ProjectDetailPage.tsx');
    const routes = repo('frontend/src/routes/index.tsx');
    const dash = repo('frontend/src/v2/pages/DashboardV2Page.tsx');
    const gate = repo('frontend/src/components/auth/ProtectedRoute.tsx');
    assert.equal(hub.includes("from 'firebase/firestore'"), false);
    assert.equal(hub.includes("from 'firebase/storage'"), false);
    assert.equal(detail.includes('uploadBytes'), false);
    assert.equal(hub.includes('stripe.checkout'), false);
    assert.equal(detail.includes('api.stripe.com'), false);
    assert.match(hub, /Noch keine Projekte/);
    assert.match(hub, /Erstes Projekt erstellen/);
    assert.match(hub, /role="dialog"/);
    assert.match(hub, /Umbenennen/);
    assert.match(hub, /Suche/);
    assert.match(detail, /Dieses Projekt hat noch keine Assets/);
    assert.match(detail, /Keine laufenden Generierungen/);
    assert.match(detail, /Aus Projekt entfernen/);
    assert.match(detail, /Änderung anfordern/);
    assert.match(detail, /queueNexterPrompt/);
    assert.match(detail, /api\.files\.downloadUrl/);
    assert.match(detail, /var\(--ucbs-/);
    assert.match(hub, /min-h-11/);
    assert.match(gate, /resolveAuthGate/);
    assert.match(repo('frontend/src/lib/auth-gates.ts'), /onboardingCompleted/);
    assert.match(dash, /\/projects/);
    for (const path of [
      '/logo-studio',
      '/banner-studio',
      '/facecam-studio',
      '/overlay-studio',
      '/sticker-studio',
      '/mockup-studio',
      '/video-studio',
      '/layout-studio',
      '/ai-music',
      '/ai-voice',
      '/animation-studio',
      '/change-request',
      '/file-cloud',
      '/nexter',
      '/creator-dna',
    ]) {
      assert.ok(routes.includes(path), path);
    }
    assert.equal(studioPathForKind('logo'), '/logo-studio');
    assert.equal(studioPathForKind('banner'), '/banner-studio');
    assert.equal(studioPathForKind('facecam'), '/facecam-studio');
    assert.equal(studioPathForKind('overlay'), '/overlay-studio');
    assert.equal(studioPathForKind('sticker'), '/sticker-studio');
    assert.equal(studioPathForKind('mockup'), '/mockup-studio');
    assert.equal(studioPathForKind('video'), '/video-studio');
    assert.equal(studioPathForKind('layout'), '/layout-studio');
    assert.equal(studioPathForKind('music'), '/ai-music');
    assert.equal(studioPathForKind('voice'), '/ai-voice');
    assert.equal(studioPathForKind('animation'), '/animation-studio');
    const overviewSrc = repo('backend/src/services/project-overview.service.ts');
    assert.match(overviewSrc, /PROJECT_OVERVIEW_ASSET_LIMIT/);
    assert.match(overviewSrc, /errors\.jobs/);
    const service = repo('backend/src/services/project.service.ts');
    assert.match(service, /PROJECT_LIST_DEFAULT_LIMIT/);
    assert.equal(service.includes('openai.com'), false);
  });

  it('empty hub still returns zero counts', async () => {
    const user = await seed('empty');
    const listed = await queryProjects(user.id);
    assert.equal(listed.total, 0);
    assert.equal(listed.projects.length, 0);
  });
});
