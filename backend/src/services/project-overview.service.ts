import type { CreatorDNA, Project, ProjectAsset, ProjectStatus } from '@ucbs/shared';
import { missingStreamsetLabels } from '@ucbs/shared';
import { getProject } from './project.service.js';
import { getDnaById } from './dna.service.js';
import { getJobsByUser, type GenerationJob } from './ai.service.js';
import { listUserFiles, type UserFile } from './file-cloud.service.js';
import { listMockups } from './mockup.service.js';
import { listAnimations } from './animation.service.js';
import { listVideoProjects } from './media.service.js';
import { listTextJobs } from './text.service.js';
import { listChangeRequests, getVersionsForJob, type ChangeRequestRecord, type DesignVersionRecord } from './change-request.service.js';
import { ServiceError } from '../lib/errors.js';

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
}

const IMAGE_CHANGE_MODULES = new Set(['logo', 'banner', 'facecam', 'overlay', 'sticker']);

function groupType(module?: string, type?: string, assetKey?: string): string {
  const key = (assetKey || '').toLowerCase();
  const m = (module || type || '').toLowerCase();
  if (key.includes('facecam') || m.includes('facecam')) return 'facecam';
  if (m.includes('logo')) return 'logo';
  if (key.includes('banner') || m.includes('banner')) return 'banner';
  if (m.includes('sticker') || key.includes('sticker') || key.includes('emote')) return 'sticker';
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

function fromProjectAsset(a: ProjectAsset): AggregatedProjectAsset {
  const type = groupType(a.module, a.type, a.assetKey);
  return {
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
  };
}

function fromJob(job: GenerationJob): AggregatedProjectAsset {
  const type = groupType(job.module, job.module, job.assetKey);
  return {
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
  };
}

export async function getProjectOverview(projectId: string, userId: string): Promise<ProjectOverview> {
  const project = await getProject(projectId, userId);
  if (!project || project.deletedAt) {
    throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }

  const [dna, jobs, files, mockups, animations, videos, textJobs, changeRequests] = await Promise.all([
    project.dnaId ? getDnaById(project.dnaId, userId).catch(() => null) : Promise.resolve(null),
    getJobsByUser(userId),
    listUserFiles(userId, { projectId }),
    listMockups(userId),
    listAnimations(userId),
    listVideoProjects(userId),
    listTextJobs(userId),
    listChangeRequests(userId),
  ]);

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
    push({
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
    });
  }

  for (const a of animations) {
    if (a.projectId !== projectId || a.status !== 'completed') continue;
    const url = a.videoUrl || a.imageUrl || '';
    if (!url) continue;
    push({
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
    });
  }

  const projectVideos = videos.filter((v) =>
    project.assets.some((a) => a.url && (a.url === v.renderUrl || v.shorts.some((s) => s.videoUrl === a.url)))
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

  const jobIds = [...new Set(assets.map((a) => a.jobId).filter(Boolean))] as string[];
  const versionsByJob: Record<string, DesignVersionRecord[]> = {};
  await Promise.all(
    jobIds.map(async (jobId) => {
      versionsByJob[jobId] = await getVersionsForJob(jobId, userId);
    })
  );

  const projectCrs = changeRequests.filter((cr) => jobIds.includes(cr.jobId) || jobs.some((j) => j.id === cr.jobId && j.projectId === projectId));

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
    assets,
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
    missing: missingStreamsetLabels(jobs.filter((j) => j.projectId === projectId)),
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
