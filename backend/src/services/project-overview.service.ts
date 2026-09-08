import type { CreatorDNA, Project, ProjectAsset, ProjectStatus } from '@ucbs/shared';
import { missingStreamsetLabels, NEXTER_STUDIO_PATHS } from '@ucbs/shared';
import { getProject } from './project.service.js';
import { getDnaById } from './dna.service.js';
import { getJobsByUser, type GenerationJob } from './ai.service.js';
import { getUserFile, issueFileDownloadUrl, queryUserFilesForClient, type UserFile } from './file-cloud.service.js';
import { listMockups } from './mockup.service.js';
import { listAnimations } from './animation.service.js';
import { listMediaJobs, listVideoProjects, type MediaJob } from './media.service.js';
import { listTextJobs } from './text.service.js';
import { listChangeRequests, getVersionsForJob, type ChangeRequestRecord, type DesignVersionRecord } from './change-request.service.js';
import { ServiceError } from '../lib/errors.js';

export const PROJECT_OVERVIEW_ASSET_LIMIT = 40;
export const PROJECT_OVERVIEW_JOB_LIMIT = 12;
export const PROJECT_OVERVIEW_ACTIVITY_LIMIT = 8;

export interface AggregatedProjectAsset {
  id: string;
  name: string;
  type: string;
  url: string;
  version: number;
  createdAt: string;
  jobId?: string;
  fileId?: string;
  module?: string;
  sourceType?: string;
  mimeType?: string;
  assetKey?: string;
  previewUrl?: string;
  downloadable: boolean;
  changeSupported: boolean;
  expiresAt?: string;
  available?: boolean;
  studioPath?: string;
}

export interface ProjectJobItem {
  id: string;
  kind: 'generation' | 'media' | 'streamset';
  module: string;
  status: string;
  label: string;
  createdAt: string;
  error?: string;
  fileId?: string;
  href: string;
  progressKnown: false;
}

export interface ProjectActivityItem {
  id: string;
  kind: 'project' | 'asset' | 'job' | 'file';
  title: string;
  at: string;
}

export interface ProjectOverview {
  project: Project;
  dna: Pick<CreatorDNA, 'id' | 'name' | 'version' | 'styleDirection' | 'primaryColors'> | null;
  assets: AggregatedProjectAsset[];
  files: UserFile[];
  videos: Array<{ id: string; title: string; renderUrl?: string; createdAt: string }>;
  shorts: Array<{ id: string; videoUrl?: string; createdAt: string }>;
  content: Array<{ id: string; title: string; createdAt: string }>;
  changeRequests: ChangeRequestRecord[];
  versionsByJob: Record<string, DesignVersionRecord[]>;
  missing: string[];
  studioPath: string;
  continuePath: string;
  activeJobs: ProjectJobItem[];
  failedJobs: ProjectJobItem[];
  completedJobs: ProjectJobItem[];
  streamset: { completed: number; total: number; status: string; href: string } | null;
  activity: ProjectActivityItem[];
  errors: {
    dna?: string;
    jobs?: string;
    files?: string;
    media?: string;
  };
}

const IMAGE_CHANGE_MODULES = new Set(['logo', 'banner', 'facecam', 'overlay', 'sticker']);
const ACTIVE_STATUSES = new Set(['queued', 'processing', 'pending', 'running', 'partial']);

export function studioPathForKind(kind: string): string {
  return NEXTER_STUDIO_PATHS[kind] || '/projects';
}

function groupType(module?: string, type?: string, assetKey?: string): string {
  const key = (assetKey || '').toLowerCase();
  const m = (module || type || '').toLowerCase();
  if (key.includes('facecam') || m.includes('facecam')) return 'facecam';
  if (m.includes('logo')) return 'logo';
  if (key.includes('banner') || m.includes('banner')) return 'banner';
  if (m.includes('sticker') || key.includes('sticker') || key.includes('emote')) return 'sticker';
  if (m.includes('layout')) return 'layout';
  if (m.includes('music')) return 'music';
  if (m.includes('voice') || m.includes('speech')) return 'voice';
  if (
    key.includes('stream') ||
    key === 'offline' ||
    key === 'alert' ||
    key === 'panel' ||
    m.includes('overlay') ||
    m.includes('stream-') ||
    m === 'offline' ||
    m === 'alert' ||
    m === 'panel'
  ) {
    return 'overlay';
  }
  if (m.includes('mockup')) return 'mockup';
  if (['intro', 'outro', 'stinger', 'logo-loop', 'alert'].includes(m) || m.includes('animation')) return 'animation';
  if (m === 'short' || m.includes('short')) return 'short';
  if (m.includes('video')) return 'video';
  if (m === 'text' || m.includes('content')) return 'text';
  return type || 'other';
}

function downloadableUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('content:')) return false;
  return url.startsWith('http') || url.startsWith('data:');
}

function withStudio(asset: AggregatedProjectAsset): AggregatedProjectAsset {
  return { ...asset, studioPath: studioPathForKind(asset.type) };
}

function fromProjectAsset(a: ProjectAsset): AggregatedProjectAsset {
  const type = groupType(a.module, a.type, a.assetKey);
  return withStudio({
    id: a.id,
    name: a.name,
    type,
    url: a.url,
    version: a.version,
    createdAt: a.createdAt,
    jobId: a.jobId,
    fileId: a.fileId,
    module: a.module,
    sourceType: a.sourceType,
    mimeType: a.mimeType,
    assetKey: a.assetKey,
    previewUrl: a.url.startsWith('content:') ? undefined : a.url,
    downloadable: downloadableUrl(a.url),
    changeSupported: Boolean(a.jobId && IMAGE_CHANGE_MODULES.has(a.module || type)),
  });
}

function fromJob(job: GenerationJob): AggregatedProjectAsset {
  const type = groupType(job.module, job.module, job.assetKey);
  return withStudio({
    id: job.id,
    name: job.assetKey || job.module,
    type,
    url: job.imageUrl || '',
    version: 1,
    createdAt: job.createdAt,
    jobId: job.id,
    module: job.module,
    sourceType: 'generation',
    assetKey: job.assetKey,
    previewUrl: job.imageUrl,
    downloadable: Boolean(job.imageUrl && downloadableUrl(job.imageUrl)),
    changeSupported: IMAGE_CHANGE_MODULES.has(job.module),
  });
}

async function settle<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const message = err instanceof ServiceError ? err.message : err instanceof Error ? err.message : 'Abschnitt nicht verfügbar';
    return { ok: false, error: message };
  }
}

async function secureAsset(userId: string, asset: AggregatedProjectAsset): Promise<AggregatedProjectAsset | null> {
  if (!asset.fileId) return asset;
  const owned = await getUserFile(asset.fileId, userId);
  if (!owned) return null;
  try {
    const issued = await issueFileDownloadUrl(asset.fileId, userId);
    if (!issued) {
      return { ...asset, previewUrl: undefined, downloadable: false, available: false };
    }
    return {
      ...asset,
      url: issued.downloadUrl,
      previewUrl: issued.downloadUrl,
      downloadable: true,
      available: true,
      expiresAt: issued.expiresAt,
    };
  } catch {
    return { ...asset, previewUrl: undefined, downloadable: false, available: false };
  }
}

function mapGenerationJob(job: GenerationJob): ProjectJobItem {
  const type = groupType(job.module, job.module, job.assetKey);
  return {
    id: job.id,
    kind: job.module === 'streamset' || job.batchId ? 'streamset' : 'generation',
    module: job.module,
    status: job.status,
    label: job.assetKey || job.module,
    createdAt: job.createdAt,
    error: job.error,
    fileId: job.fileId,
    href: studioPathForKind(type === 'other' ? job.module : type),
    progressKnown: false,
  };
}

function mapMediaJob(job: MediaJob): ProjectJobItem {
  const type = groupType(job.type, job.type);
  return {
    id: job.id,
    kind: 'media',
    module: job.type,
    status: job.status,
    label: job.title || job.type,
    createdAt: job.createdAt,
    error: job.error,
    href: studioPathForKind(type),
    progressKnown: false,
  };
}

function streamsetSummary(jobs: GenerationJob[]): ProjectOverview['streamset'] {
  const parents = jobs
    .filter((j) => j.module === 'streamset')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const parent = parents[0];
  if (!parent) return null;
  const children = jobs.filter((j) => j.batchId === parent.id && j.id !== parent.id);
  const pool = children.length ? children : [parent];
  const completed = pool.filter((j) => j.status === 'completed' && Boolean(j.imageUrl)).length;
  const failed = pool.filter((j) => j.status === 'failed').length;
  const active = pool.filter((j) => ACTIVE_STATUSES.has(j.status)).length;
  const status =
    parent.status === 'partial' || (completed > 0 && (failed > 0 || active > 0 || completed < pool.length))
      ? 'partial'
      : parent.status;
  return { completed, total: pool.length, status, href: '/streamset-studio' };
}

export async function getProjectOverview(projectId: string, userId: string): Promise<ProjectOverview> {
  const project = await getProject(projectId, userId);
  if (!project || project.deletedAt) {
    throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }

  const errors: ProjectOverview['errors'] = {};

  const dnaRes = await settle(() =>
    project.dnaId ? getDnaById(project.dnaId, userId) : Promise.resolve(null)
  );
  if (!dnaRes.ok) errors.dna = dnaRes.error;
  const dna = dnaRes.ok ? dnaRes.value : null;

  const jobsRes = await settle(() => getJobsByUser(userId));
  if (!jobsRes.ok) errors.jobs = jobsRes.error;
  const jobs = jobsRes.ok ? jobsRes.value : [];

  const filesRes = await settle(() => queryUserFilesForClient(userId, { projectId, sort: 'newest', limit: 20 }));
  if (!filesRes.ok) errors.files = filesRes.error;
  const files = filesRes.ok ? filesRes.value.files : [];

  const mediaRes = await settle(async () => {
    const [mockups, animations, videos, textJobs, changeRequests, mediaJobs] = await Promise.all([
      listMockups(userId),
      listAnimations(userId),
      listVideoProjects(userId),
      listTextJobs(userId),
      listChangeRequests(userId),
      listMediaJobs(userId),
    ]);
    return { mockups, animations, videos, textJobs, changeRequests, mediaJobs };
  });
  if (!mediaRes.ok) errors.media = mediaRes.error;
  const mockups = mediaRes.ok ? mediaRes.value.mockups : [];
  const animations = mediaRes.ok ? mediaRes.value.animations : [];
  const videos = mediaRes.ok ? mediaRes.value.videos : [];
  const textJobs = mediaRes.ok ? mediaRes.value.textJobs : [];
  const changeRequests = mediaRes.ok ? mediaRes.value.changeRequests : [];
  const mediaJobs = mediaRes.ok ? mediaRes.value.mediaJobs : [];

  const seen = new Set<string>();
  const assets: AggregatedProjectAsset[] = [];

  const push = (item: AggregatedProjectAsset) => {
    const key = item.jobId || item.fileId || item.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    assets.push(item);
  };

  for (const a of project.assets) push(fromProjectAsset(a));

  for (const job of jobs) {
    if (job.projectId !== projectId) continue;
    if (job.status !== 'completed' || !job.imageUrl) continue;
    push(fromJob(job));
  }

  for (const m of mockups) {
    if (m.projectId !== projectId || !m.imageUrl) continue;
    push(
      withStudio({
        id: m.id,
        name: `Mockup ${m.category}`,
        type: 'mockup',
        url: m.imageUrl,
        version: 1,
        createdAt: m.createdAt,
        jobId: m.id,
        module: 'mockup',
        sourceType: 'mockup',
        previewUrl: m.imageUrl,
        downloadable: true,
        changeSupported: false,
      })
    );
  }

  for (const a of animations) {
    if (a.projectId !== projectId || a.status !== 'completed') continue;
    const url = a.videoUrl || a.imageUrl || '';
    if (!url) continue;
    push(
      withStudio({
        id: a.id,
        name: a.title || a.type,
        type: 'animation',
        url,
        version: 1,
        createdAt: a.createdAt,
        jobId: a.id,
        module: a.type,
        sourceType: 'animation',
        previewUrl: a.thumbnailUrl || a.imageUrl,
        downloadable: Boolean(url),
        changeSupported: false,
      })
    );
  }

  const secured: AggregatedProjectAsset[] = [];
  for (const asset of assets) {
    const next = await secureAsset(userId, asset);
    if (next) secured.push(next);
  }
  const limitedAssets = secured.slice(0, PROJECT_OVERVIEW_ASSET_LIMIT);

  const projectVideos = videos.filter((v) =>
    project.assets.some((a) => a.url && (a.url === v.renderUrl || v.shorts.some((s) => s.videoUrl === a.url))) ||
    v.brandProjectId === projectId
  );

  const shorts = [
    ...videos.flatMap((v) =>
      v.shorts
        .filter((s) => s.videoUrl && project.assets.some((a) => a.url === s.videoUrl))
        .map((s) => ({ id: s.id, videoUrl: s.videoUrl, createdAt: v.updatedAt }))
    ),
  ];

  const content = textJobs
    .filter((t) => t.projectId === projectId && t.status === 'completed')
    .map((t) => ({ id: t.id, title: t.title || t.hook || t.topic, createdAt: t.createdAt }));

  const jobIds = [...new Set(limitedAssets.map((a) => a.jobId).filter(Boolean))] as string[];
  const versionsByJob: Record<string, DesignVersionRecord[]> = {};
  await Promise.all(
    jobIds.map(async (jobId) => {
      try {
        versionsByJob[jobId] = await getVersionsForJob(jobId, userId);
      } catch {
        versionsByJob[jobId] = [];
      }
    })
  );

  const projectJobs = jobs.filter((j) => j.projectId === projectId);
  const projectMedia = mediaJobs.filter((j) => j.projectId === projectId);
  const mappedJobs: ProjectJobItem[] = [
    ...projectJobs.map(mapGenerationJob),
    ...projectMedia.map(mapMediaJob),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const activeJobs = mappedJobs.filter((j) => ACTIVE_STATUSES.has(j.status)).slice(0, PROJECT_OVERVIEW_JOB_LIMIT);
  const failedJobs = mappedJobs.filter((j) => j.status === 'failed').slice(0, 4);
  const completedJobs = mappedJobs.filter((j) => j.status === 'completed').slice(0, 4);

  const projectCrs = changeRequests.filter(
    (cr) => jobIds.includes(cr.jobId) || projectJobs.some((j) => j.id === cr.jobId)
  );

  const activity: ProjectActivityItem[] = [
    { id: `project:${project.id}`, kind: 'project' as const, title: `Projekt „${project.name}“`, at: project.createdAt },
    ...limitedAssets.slice(0, 3).map((a) => ({
      id: `asset:${a.id}`,
      kind: 'asset' as const,
      title: `Asset „${a.name}“`,
      at: a.createdAt,
    })),
    ...completedJobs.slice(0, 3).map((j) => ({
      id: `job:${j.id}`,
      kind: 'job' as const,
      title: `${j.label} fertig`,
      at: j.createdAt,
    })),
    ...files.slice(0, 2).map((f) => ({
      id: `file:${f.id}`,
      kind: 'file' as const,
      title: `Datei „${f.name}“`,
      at: f.createdAt,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    project,
    dna: dna
      ? {
          id: dna.id,
          name: dna.name,
          version: dna.version,
          styleDirection: dna.styleDirection,
          primaryColors: dna.primaryColors,
        }
      : null,
    assets: limitedAssets,
    files,
    videos: projectVideos.map((v) => ({
      id: v.id,
      title: v.title,
      renderUrl: v.renderUrl,
      createdAt: v.createdAt,
    })),
    shorts,
    content,
    changeRequests: projectCrs,
    versionsByJob,
    missing: missingStreamsetLabels(projectJobs),
    studioPath: studioPathForKind(project.type === 'intro' ? 'animation' : project.type),
    continuePath: `/projects/${encodeURIComponent(project.id)}`,
    activeJobs,
    failedJobs,
    completedJobs,
    streamset: streamsetSummary(projectJobs),
    activity: activity.slice(0, PROJECT_OVERVIEW_ACTIVITY_LIMIT),
    errors,
  };
}

export const PROJECT_STATUSES: ProjectStatus[] = [
  'draft',
  'in_progress',
  'review',
  'revision',
  'completed',
  'archived',
];
