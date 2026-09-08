import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna, getActiveDna } from './dna.service.js';
import { createProject, updateProject, listProjects } from './project.service.js';
import { saveUserFile, getUserFile, issueFileDownloadUrl } from './file-cloud.service.js';
import { getCoinBalance } from './coins.service.js';
import { createSocialPost } from './social.service.js';
import { dsSet } from '../lib/data-store.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { buildNexterContext } from './nexter/context.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import {
  DASHBOARD_FILE_LIMIT,
  DASHBOARD_PROJECT_LIMIT,
  dashboardGreetingName,
  getDashboardSummary,
  studioPathForProjectType,
} from './dashboard.service.js';

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
  return getOrCreateUser(`${prefix}-${randomUUID()}`, `${randomUUID()}@dash.test`, prefix, {
    role: UserRole.USER,
  });
}

async function seedJob(
  userId: string,
  module: string,
  status: string,
  extra?: { batchId?: string; imageUrl?: string; createdAt?: string }
) {
  const id = randomUUID();
  const now = extra?.createdAt ?? new Date().toISOString();
  await dsSet('generationJobs', id, {
    id,
    userId,
    module,
    status,
    prompt: module,
    imageUrl: extra?.imageUrl,
    batchId: extra?.batchId,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

describe('dashboard local closure — isolation and real data', () => {
  it('shows only own projects, files, jobs, social, calendar and DNA', async () => {
    const a = await seed('own');
    const b = await seed('foreign');
    const projectA = await createProject(a.id, { name: 'Alpha Own', type: 'logo' });
    const projectB = await createProject(b.id, { name: 'Secret Beta', type: 'banner' });
    const fileA = await saveUserFile(a.id, {
      name: 'own-logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const fileB = await saveUserFile(b.id, {
      name: 'foreign-banner.png',
      mimeType: 'image/png',
      category: 'banner',
      dataUrl: PIXEL,
    });
    const jobA = await seedJob(a.id, 'logo', 'processing');
    const jobB = await seedJob(b.id, 'banner', 'processing');
    await upsertDna({ userId: a.id, name: 'OwnDNA', styleDirection: 'gaming', primaryColors: ['#22d3ee'] });
    await upsertDna({ userId: b.id, name: 'ForeignDNA', styleDirection: 'anime', primaryColors: ['#ff0000'] });
    await createSocialPost(a.id, {
      platform: 'tiktok',
      content: 'Own post',
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await createSocialPost(b.id, {
      platform: 'youtube',
      content: 'Foreign secret post',
      scheduledAt: new Date(Date.now() + 7200_000).toISOString(),
    });

    const dash = await getDashboardSummary(a.id);
    assert.equal(dash.projects.some((p) => p.id === projectA.id), true);
    assert.equal(dash.projects.some((p) => p.id === projectB.id), false);
    assert.equal(dash.files.some((f) => f.id === fileA.id), true);
    assert.equal(dash.files.some((f) => f.id === fileB.id), false);
    assert.equal(dash.activeJobs.some((j) => j.id === jobA), true);
    assert.equal(dash.activeJobs.some((j) => j.id === jobB), false);
    assert.equal(dash.dna?.name, 'OwnDNA');
    assert.equal(dash.dna?.name === 'ForeignDNA', false);
    const blob = JSON.stringify(dash);
    assert.equal(blob.includes('Secret Beta'), false);
    assert.equal(blob.includes('foreign-banner.png'), false);
    assert.equal(blob.includes('Foreign secret post'), false);
    assert.equal(blob.includes('ForeignDNA'), false);
    assert.equal(await getUserFile(fileB.id, a.id), null);
  });

  it('uses server coin balance as read-only and personalized greeting with fallback', async () => {
    const named = await seed('Lars');
    const dash = await getDashboardSummary(named.id);
    assert.equal(dash.coinBalance, await getCoinBalance(named.id));
    assert.ok(Array.isArray(dash.coinHistory));
    assert.ok(dash.coinHistory.length <= 5);
    assert.equal(dash.greetingName.includes('Lars'), true);
    assert.equal(dashboardGreetingName({ displayName: 'Lars', nexterPreferences: named.nexterPreferences }), 'Lars');

    const blank = await seed('x');
    await dsSet('users', blank.id, {
      ...blank,
      displayName: '',
      nexterPreferences: { ...blank.nexterPreferences, addressAs: '' },
    });
    const fallback = await getDashboardSummary(blank.id);
    assert.equal(fallback.greetingName, 'Creator');

    const src = repo('backend/src/services/dashboard.service.ts');
    assert.equal(src.includes('addCoins'), false);
    assert.equal(src.includes('deductCoins'), false);
    assert.equal(src.includes("dsSet('users'"), false);
  });

  it('shows DNA when present and a CTA state without DNA', async () => {
    const withDna = await seed('dna-yes');
    await upsertDna({
      userId: withDna.id,
      name: 'NeonFox',
      styleDirection: 'cyberpunk',
      primaryColors: ['#7C3AED'],
    });
    const yes = await getDashboardSummary(withDna.id);
    assert.equal(yes.dna?.name, 'NeonFox');
    assert.equal(yes.setup.hasDna, true);
    assert.equal((await getActiveDna(withDna.id))?.name, 'NeonFox');

    const none = await seed('dna-no');
    const no = await getDashboardSummary(none.id);
    assert.equal(no.dna, null);
    assert.equal(no.setup.hasDna, false);
  });
});

describe('dashboard local closure — lists, jobs, calendar, counts', () => {
  it('limits and orders recent projects and files', async () => {
    const user = await seed('lists');
    const first = await createProject(user.id, { name: 'Older', type: 'logo' });
    await new Promise((r) => setTimeout(r, 15));
    const second = await createProject(user.id, { name: 'Newer', type: 'banner' });
    await updateProject(second.id, user.id, { name: 'Newer' });
    for (let i = 0; i < 6; i += 1) {
      await createProject(user.id, { name: `P${i}`, type: 'custom' });
    }
    const listed = await listProjects(user.id);
    assert.ok(listed.length > DASHBOARD_PROJECT_LIMIT);
    const dash = await getDashboardSummary(user.id);
    assert.equal(dash.projects.length, DASHBOARD_PROJECT_LIMIT);
    assert.equal(dash.projectCount, listed.length);
    assert.equal(dash.projects[0]?.id, listed[0]?.id);
    assert.ok(dash.projects[0]?.updatedAt >= (dash.projects.at(-1)?.updatedAt ?? ''));
    assert.equal(dash.projects.some((p) => p.id === first.id) || dash.projectCount > DASHBOARD_PROJECT_LIMIT, true);
    assert.match(dash.projects[0]?.continuePath || '', /^\/projects\//);
    assert.equal(studioPathForProjectType('logo'), '/logo-studio');

    for (let i = 0; i < 8; i += 1) {
      await saveUserFile(user.id, {
        name: `file-${i}.png`,
        mimeType: 'image/png',
        category: 'logo',
        dataUrl: PIXEL,
      });
    }
    const withFiles = await getDashboardSummary(user.id);
    assert.equal(withFiles.files.length, DASHBOARD_FILE_LIMIT);
    assert.equal(withFiles.fileCount >= 8, true);
    const newest = withFiles.files[0];
    const oldestShown = withFiles.files.at(-1);
    assert.ok(newest && oldestShown && newest.createdAt >= oldestShown.createdAt);
    assert.equal(newest?.available, true);
    assert.ok(newest?.downloadUrl);
    const renewed = await issueFileDownloadUrl(newest!.id, user.id);
    assert.ok(renewed?.downloadUrl);
    assert.equal(renewed?.file.id, newest!.id);
  });

  it('shows active, completed, failed jobs without fake percentages and streamset partial', async () => {
    const user = await seed('jobs');
    await seedJob(user.id, 'logo', 'processing');
    const done = await seedJob(user.id, 'banner', 'completed', { imageUrl: PIXEL });
    await seedJob(user.id, 'sticker', 'failed');
    const parent = await seedJob(user.id, 'streamset', 'partial');
    await seedJob(user.id, 'overlay', 'completed', { batchId: parent, imageUrl: PIXEL });
    await seedJob(user.id, 'overlay', 'completed', { batchId: parent, imageUrl: PIXEL });
    await seedJob(user.id, 'overlay', 'failed', { batchId: parent });

    const dash = await getDashboardSummary(user.id);
    assert.equal(dash.activeJobCount >= 1, true);
    assert.equal(dash.activeJobs.every((j) => j.progressKnown === false), true);
    assert.equal(dash.recentCompletedJobs.some((j) => j.id === done), true);
    assert.equal(dash.failedJobs.length >= 1, true);
    assert.ok(dash.streamset);
    assert.equal(dash.streamset?.total, 3);
    assert.equal(dash.streamset?.completed, 2);
    assert.equal(dash.streamset?.status, 'partial');
    const dump = JSON.stringify(
      dash.activeJobs.map(({ status, progressKnown, href, label, module }) => ({
        status,
        progressKnown,
        href,
        label,
        module,
      }))
    );
    assert.equal(dump.includes('%'), false);
    assert.equal(dash.activeJobs.every((j) => !('progress' in j) && j.progressKnown === false), true);
    assert.match(repo('frontend/src/v2/pages/DashboardV2Page.tsx'), /Wird erstellt …/);
    assert.equal(repo('frontend/src/v2/pages/DashboardV2Page.tsx').includes('73 %'), false);
  });

  it('shows today/upcoming own planning and empty calendar copy', async () => {
    const emptyUser = await seed('cal-empty');
    const empty = await getDashboardSummary(emptyUser.id);
    assert.equal(empty.today.length, 0);
    assert.equal(empty.upcoming.length, 0);

    const user = await seed('cal-own');
    const other = await seed('cal-other');
    await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'Heute live',
      scheduledAt: new Date().toISOString(),
    });
    await createSocialPost(user.id, {
      platform: 'youtube',
      content: 'Nächste Woche',
      scheduledAt: new Date(Date.now() + 86400_000 * 3).toISOString(),
    });
    await createSocialPost(other.id, {
      platform: 'twitch',
      content: 'Fremder Stream',
      scheduledAt: new Date().toISOString(),
    });
    const dash = await getDashboardSummary(user.id);
    const titles = [...dash.today, ...dash.upcoming].map((i) => i.title).join(' ');
    assert.match(titles, /Heute live|Nächste Woche/);
    assert.equal(titles.includes('Fremder Stream'), false);
  });
});

describe('dashboard local closure — nexter, ui, safety', () => {
  it('reuses Nexter context for user, DNA, projects and assets', async () => {
    const user = await seed('nx');
    await upsertDna({ userId: user.id, name: 'CtxDNA', styleDirection: 'gaming', primaryColors: ['#111111'] });
    await createProject(user.id, { name: 'Ctx Project', type: 'logo' });
    await saveUserFile(user.id, { name: 'ctx-logo.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    const ctx = await buildNexterContext(user.id);
    assert.equal(ctx.hasDna, true);
    assert.equal(ctx.dnaName, 'CtxDNA');
    assert.ok(ctx.projectNames.includes('Ctx Project'));
    assert.equal(ctx.fileCount >= 1, true);
    const session = await nexterChat(user.id, 'Zeig mir meine letzten Dateien');
    assert.match(session.messages.at(-1)?.content || '', /ctx-logo|Dateien/i);
  });

  it('does not add client storage writes, fake analytics, providers or payments', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const page = repo('frontend/src/v2/pages/DashboardV2Page.tsx');
    const service = repo('backend/src/services/dashboard.service.ts');
    const routes = repo('frontend/src/routes/index.tsx');
    const gate = repo('frontend/src/components/auth/ProtectedRoute.tsx');
    assert.equal(page.includes("from 'firebase/firestore'"), false);
    assert.equal(page.includes("from 'firebase/storage'"), false);
    assert.equal(page.includes('uploadBytes'), false);
    assert.equal(page.includes('stripe.checkout'), false);
    assert.equal(page.includes('paypal.checkout'), false);
    assert.equal(page.includes('Reichweite'), false);
    assert.equal(page.includes('Follower'), false);
    assert.equal(page.includes('+27'), false);
    assert.equal(page.includes('dnaProgress'), false);
    assert.equal(service.includes('openai.com'), false);
    assert.equal(service.includes('api.stripe.com'), false);
    assert.match(page, /Noch keine Projekte/);
    assert.match(page, /Noch keine Dateien/);
    assert.match(page, /Aktuell keine laufenden Generierungen/);
    assert.match(page, /Heute ist nichts geplant/);
    assert.match(page, /Creator DNA einrichten/);
    assert.match(page, /queueNexterPrompt/);
    assert.match(page, /\/nexter/);
    assert.match(page, /var\(--ucbs-/);
    assert.match(page, /min-h-11/);
    assert.match(page, /aria-labelledby/);
    assert.match(page, /upcomingItems/);
    assert.match(page, /Weiterarbeiten/);
    assert.match(page, /dashboard-summary', user\?\.id/);
    assert.match(page, /refetchInterval/);
    assert.match(page, /visibilitychange/);
    assert.match(page, /api\.files\.downloadUrl/);
    assert.match(page, /Letzte Coin-Bewegungen/);
    assert.equal(page.includes('/admin'), false);
    assert.match(gate, /resolveAuthGate/);
    assert.match(repo('frontend/src/lib/auth-gates.ts'), /onboardingCompleted/);
    for (const path of [
      '/logo-studio',
      '/streamset-studio',
      '/facecam-studio',
      '/banner-studio',
      '/sticker-studio',
      '/video-studio',
      '/layout-studio',
      '/social-studio',
      '/content-calendar',
      '/file-cloud',
      '/projects',
      '/creator-dna',
      '/settings',
    ]) {
      assert.ok(routes.includes(path), path);
      assert.ok(page.includes(path), path);
    }
    assert.match(service, /DASHBOARD_FILE_LIMIT/);
    assert.match(service, /DASHBOARD_PROJECT_LIMIT/);
    assert.match(service, /DASHBOARD_JOB_FETCH_LIMIT/);
    assert.match(service, /errors\.calendar/);
    assert.match(service, /errors\.projects/);
    assert.match(service, /errors\.files/);
    assert.match(service, /errors\.jobs/);
    assert.equal(service.includes('dsList(') && service.includes('limit: DASHBOARD_FILE_LIMIT') || service.includes('limit: DASHBOARD_FILE_LIMIT'), true);
  });

  it('empty dashboard still returns counts of zero', async () => {
    const user = await seed('empty');
    const dash = await getDashboardSummary(user.id);
    assert.equal(dash.projectCount, 0);
    assert.equal(dash.fileCount, 0);
    assert.equal(dash.activeJobCount, 0);
    assert.equal(dash.projects.length, 0);
    assert.equal(dash.files.length, 0);
    assert.equal(dash.setup.hasProject, false);
    assert.equal(dash.setup.hasFile, false);
    assert.equal(Object.keys(dash.errors).length, 0);
  });
});
