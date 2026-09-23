import type { NexterContextSnapshot } from '@ucbs/shared';
import { buildCreatorProfileContext, missingStreamsetLabels, nexterAddressName, presentStreamsetLabels } from '@ucbs/shared';
import { resolveDnaForRequest } from '../dna.service.js';
import { listProjects } from '../project.service.js';
import { getJobsByUser, type GenerationJob } from '../ai.service.js';
import { listUserFiles } from '../file-cloud.service.js';
import { listLayouts } from '../layout.service.js';
import { getUserById } from '../user.service.js';
import { getCoinBalance } from '../coins.service.js';
import { listOwnedQuotes } from './quotes.service.js';
import { listVideoProjects } from '../media.service.js';
import { listTextJobs, findLastOwnedShort } from '../text.service.js';
import { listMockups } from '../mockup.service.js';
import { listAnimations } from '../animation.service.js';
import { listMusic } from '../music.service.js';
import { listVoice } from '../voice.service.js';

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
  const [user, resolved, projects, jobs, files, coinBalance, videoProjects, textJobs, lastShort, mockups, animations, musicJobs, voiceJobs, layouts, quotes] =
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
      listMusic(userId).catch(() => []),
      listVoice(userId).catch(() => []),
      listLayouts(userId).catch(() => []),
      listOwnedQuotes(userId, 8).catch(() => []),
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

  const projectMusic = projectId ? musicJobs.filter((m) => m.projectId === projectId) : musicJobs;
  const musicPool = projectMusic.length ? projectMusic : musicJobs;
  const lastMusic = musicPool.find((m) => m.status === 'completed' && (m.audioUrl || m.metadata?.fileId));

  const projectVoice = projectId ? voiceJobs.filter((v) => v.projectId === projectId) : voiceJobs;
  const voicePool = projectVoice.length ? projectVoice : voiceJobs;
  const lastVoice = voicePool.find((v) => v.status === 'completed' && (v.audioUrl || v.metadata?.fileId));

  const inventory: string[] = [];
  if (logo.count) inventory.push(`${logo.count} Logo(s)`);
  if (banner.count) inventory.push(`${banner.count} Banner`);
  if (overlay.count) inventory.push(`${overlay.count} Overlay(s)`);
  if (facecam.count) inventory.push(`${facecam.count} Facecam`);
  if (sticker.count) inventory.push(`${sticker.count} Sticker`);
  if (mockupPool.filter((m) => m.imageUrl).length) inventory.push('Mockup');
  if (animPool.some((a) => a.status === 'completed')) inventory.push('Animation');
  if (musicPool.some((m) => m.status === 'completed')) inventory.push('Musik');
  if (voicePool.some((v) => v.status === 'completed')) inventory.push('Voice');
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
    addressAs: user ? nexterAddressName(user.nexterPreferences, user.displayName) : undefined,
    language: user?.nexterPreferences?.language ?? user?.locale,
    preferredPlatforms: user?.nexterPreferences?.platforms,
    creationInterests: user?.nexterPreferences?.creationInterests,
    stylePreferences: user?.nexterPreferences?.stylePreferences,
    creatorGoals: user?.nexterPreferences?.creatorGoals,
    uiTheme: user?.nexterPreferences?.uiTheme,
    accentPreset: user?.nexterPreferences?.accentPreset,
    customPrimary: user?.nexterPreferences?.customPrimary ?? null,
    customAccent: user?.nexterPreferences?.customAccent ?? null,
    visualLanguage: dna?.visualLanguage,
    brandingStyle: dna?.brandingStyle,
    typographySummary: dna?.typography?.character || dna?.typography?.nameTreatment,
    dimension: dna?.dimension,
    fontNames: (dna?.fonts ?? []).map((f) => f.name).filter(Boolean).slice(0, 3),
    characterType: dna?.character?.type,
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
    mascot: dna?.mascot === '' ? '' : dna?.mascot || dna?.character?.description,
    characterDescription: dna?.mascot === '' ? undefined : dna?.character?.description || dna?.mascot,
    slogan: dna?.slogan,
    dnaAlias: dna?.identity?.alias,
    brandingName: dna?.identity?.alias || dna?.name,
    creatorCategory: dna?.identity?.creatorCategory,
    contentCategories: dna?.contentCategories,
    favoriteGenres: dna?.favoriteGenres,
    visualStyles: dna?.visualStyles,
    dnaPlatforms: [
      ...(dna?.outputPrefs?.platform ? [dna.outputPrefs.platform] : []),
      ...(dna?.platformOptimization?.map((p) => p.platform) ?? []),
    ].filter((p, i, arr) => p && arr.indexOf(p) === i),
    dislikedColors: dna?.dislikedColors,
    excludedElements: dna?.designLanguage?.doNotUse,
    preferredAspectRatios: dna?.video?.preferredAspectRatios ?? dna?.outputPrefs?.aspectRatios,
    facecamPreference: dna?.stream?.facecamPreference,
    streamLayout: dna?.stream?.preferredLayout,
    assistantTone: dna?.assistant?.assistantTone,
    assistantVerbosity: dna?.assistant?.assistantVerbosity,
    dnaProfile: dna ? buildCreatorProfileContext(dna, { consumer: 'chat', maxChars: 700 }) : undefined,
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
    presentAssets: presentStreamsetLabels(scopedJobs),
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
    lastMusicId: lastMusic?.id,
    lastVoiceId: lastVoice?.id,
    lastLayoutId: layouts[0]?.id,
    lastLayoutName: layouts[0]?.name,
    layoutCount: layouts.length,
    layoutPlatform: layouts[0]?.platform,
    layoutElementCount: layouts[0]?.elements.length,
    logoCount: logo.count,
    bannerCount: banner.count,
    overlayCount: overlay.count,
    facecamCount: facecam.count,
    stickerCount: sticker.count,
    assetInventory: inventory,
    voiceOutputEnabled: user?.nexterPreferences?.voiceOutputEnabled,
    voiceCatalogId: user?.nexterPreferences?.voiceCatalogId ?? null,
    pendingQuotes: quotes
      .filter((q) => q.status === 'pending')
      .slice(0, 5)
      .map((q) => ({
        kind: q.kind,
        coinCost: q.coinCost,
        expiresAt: q.expiresAt,
        expired: Date.parse(q.expiresAt) <= Date.now(),
      })),
  };
}

export { formatContextForPrompt } from './tools.service.js';
