import type { NexterContextSnapshot } from '@ucbs/shared';
import { missingStreamsetLabels } from '@ucbs/shared';
import { resolveDnaForRequest } from '../dna.service.js';
import { listProjects } from '../project.service.js';
import { getJobsByUser, type GenerationJob } from '../ai.service.js';
import { listUserFiles } from '../file-cloud.service.js';
import { getUserById } from '../user.service.js';
import { getCoinBalance } from '../coins.service.js';
import { listVideoProjects } from '../media.service.js';
import { listTextJobs, findLastOwnedShort } from '../text.service.js';
import { listMockups } from '../mockup.service.js';
import { listAnimations } from '../animation.service.js';

function pickJob(
  jobs: GenerationJob[],
  modules: string[],
  projectId?: string,
  assetKeyIncludes?: string
): { id?: string; count: number } {
  const match = (j: GenerationJob) =>
    j.status === 'completed' &&
    Boolean(j.imageUrl) &&
    (modules.includes(j.module) || Boolean(assetKeyIncludes && j.assetKey?.toLowerCase().includes(assetKeyIncludes)));
  if (projectId) {
    const inProject = jobs.filter((j) => match(j) && j.projectId === projectId);
    return { id: inProject[0]?.id, count: inProject.length };
  }
  const fallback = jobs.filter((j) => match(j));
  return { id: fallback[0]?.id, count: fallback.length };
}

export async function buildNexterContext(
  userId: string,
  projectId?: string
): Promise<NexterContextSnapshot> {
  const [user, resolved, projects, jobs, files, coinBalance, videoProjects, textJobs, lastShort, mockups, animations] =
    await Promise.all([
      getUserById(userId).catch(() => null),
      resolveDnaForRequest(userId, projectId).catch(() => ({
        dna: null,
        source: 'none' as const,
        projectName: undefined as string | undefined,
      })),
      listProjects(userId).catch(() => []),
      getJobsByUser(userId).catch(() => []),
      listUserFiles(userId).catch(() => []),
      getCoinBalance(userId).catch(() => 0),
      listVideoProjects(userId).catch(() => []),
      listTextJobs(userId).catch(() => []),
      findLastOwnedShort(userId).catch(() => null),
      listMockups(userId).catch(() => []),
      listAnimations(userId).catch(() => []),
    ]);

  const dna = resolved.dna;
  const boundProject = projectId ? projects.find((p) => p.id === projectId) : undefined;

  const scopedJobs = projectId ? jobs.filter((j) => j.projectId === projectId) : jobs;
  const missingAssets = missingStreamsetLabels(scopedJobs);
  const scopedPackages = projectId ? textJobs.filter((j) => j.projectId === projectId) : textJobs;
  const latestPackage = scopedPackages[0];

  const logo = pickJob(jobs, ['logo', 'profile-pic'], projectId);
  const banner = pickJob(jobs, ['banner'], projectId);
  const overlay = pickJob(jobs, ['overlay', 'stream-start', 'stream-end', 'offline', 'panel', 'alert'], projectId);
  const facecam = pickJob(jobs, ['facecam'], projectId, 'facecam');
  const sticker = pickJob(jobs, ['sticker'], projectId);

  const projectMockups = projectId ? mockups.filter((m) => m.projectId === projectId) : mockups;
  const mockupPool = projectMockups.length ? projectMockups : mockups;
  const lastMockup = mockupPool.find((m) => m.imageUrl);

  const projectAnims = projectId ? animations.filter((a) => a.projectId === projectId) : animations;
  const animPool = projectAnims.length ? projectAnims : animations;
  const lastAnim = animPool.find((a) => a.status === 'completed' && (a.videoUrl || a.imageUrl));

  const inventory: string[] = [];
  if (logo.count) inventory.push(`${logo.count} Logo(s)`);
  if (banner.count) inventory.push(`${banner.count} Banner`);
  if (overlay.count) inventory.push(`${overlay.count} Overlay(s)`);
  if (facecam.count) inventory.push(`${facecam.count} Facecam`);
  if (sticker.count) inventory.push(`${sticker.count} Sticker`);
  if (mockupPool.filter((m) => m.imageUrl).length) inventory.push('Mockup');
  if (animPool.some((a) => a.status === 'completed')) inventory.push('Animation');
  if (latestPackage) inventory.push('Content-Paket');
  if (lastShort?.short.id) inventory.push('Short');
  const boundAssets = boundProject?.assets.length ?? 0;
  if (boundAssets) inventory.push(`${boundAssets} ProjectAssets`);

  const scopedVideo = projectId
    ? videoProjects.find((v) =>
        (boundProject?.assets ?? []).some((a) => a.url && (a.url === v.renderUrl || v.shorts.some((s) => s.videoUrl === a.url)))
      ) ?? videoProjects[0]
    : videoProjects[0];

  return {
    displayName: user?.displayName,
    coinBalance,
    hasDna: Boolean(dna),
    dnaId: dna?.id,
    dnaName: dna?.name,
    dnaVersion: dna?.version,
    dnaSource: resolved.source,
    projectId: boundProject?.id,
    projectName: boundProject?.name ?? resolved.projectName,
    projectDnaId: boundProject?.dnaId,
    styleDirection: dna?.styleDirection,
    primaryColors: dna?.primaryColors ?? [],
    secondaryColors: dna?.secondaryColors,
    accentColors: dna?.accentColors,
    mascot: dna?.mascot || dna?.character?.description,
    characterDescription: dna?.character?.description || dna?.mascot,
    slogan: dna?.slogan,
    locks: dna?.locks,
    projectCount: projects.length,
    projectNames: projects.slice(0, 8).map((p) => p.name),
    fileCount: projectId ? files.filter((f) => f.projectId === projectId).length : files.length,
    recentJobs: scopedJobs.slice(0, 8).map((j) => ({
      id: j.id,
      module: j.module,
      status: j.status,
      createdAt: j.createdAt,
    })),
    missingAssets,
    lastModule: scopedJobs[0]?.module,
    videoProjectId: scopedVideo?.id,
    videoHighlights: (scopedVideo?.highlights ?? []).map((h) => ({
      start: h.start,
      end: h.end,
      label: h.label,
      score: h.score,
      reason: h.reason,
    })),
    lastShortId: lastShort?.short.id,
    lastShortVideoProjectId: lastShort?.videoProject?.id ?? scopedVideo?.id,
    contentPackageId: latestPackage?.id,
    contentPackageTitle: latestPackage?.title || latestPackage?.topic,
    lastLogoId: logo.id,
    lastBannerId: banner.id,
    lastOverlayId: overlay.id,
    lastFacecamId: facecam.id,
    lastStickerId: sticker.id,
    lastMockupId: lastMockup?.id,
    lastAnimationId: lastAnim?.id,
    logoCount: logo.count,
    bannerCount: banner.count,
    overlayCount: overlay.count,
    facecamCount: facecam.count,
    stickerCount: sticker.count,
    assetInventory: inventory,
  };
}

export { formatContextForPrompt } from './tools.service.js';
