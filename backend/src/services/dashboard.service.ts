import type { CoinTransaction, NexterPreferences } from '@ucbs/shared';
import { nexterAddressName } from '@ucbs/shared';
import { getUserById } from './user.service.js';
import { getActiveDna } from './dna.service.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { listProjects } from './project.service.js';
import { issueFileDownloadUrl, queryUserFilesForClient, type UserFile } from './file-cloud.service.js';
import { getJobsByUser, type GenerationJob } from './ai.service.js';
import { listMediaJobs, type MediaJob } from './media.service.js';
import { listTodayPlanningItems, getUpcomingPlanningItems } from './planning.service.js';
import { ServiceError } from '../lib/errors.js';

export const DASHBOARD_PROJECT_LIMIT = 5;
export const DASHBOARD_FILE_LIMIT = 6;
export const DASHBOARD_JOB_LIMIT = 8;
export const DASHBOARD_JOB_FETCH_LIMIT = 40;
export const DASHBOARD_COIN_TX_LIMIT = 5;
export const DASHBOARD_UPCOMING_LIMIT = 5;
export const DASHBOARD_ACTIVITY_LIMIT = 8;

export type DashboardJobKind = 'generation' | 'media' | 'streamset';

export interface DashboardJobItem {
  id: string;
  kind: DashboardJobKind;
  module: string;
  status: string;
  label: string;
  createdAt: string;
  error?: string;
  fileId?: string;
  href: string;
  progressKnown: false;
}

export interface DashboardActivityItem {
  id: string;
  kind: 'project' | 'file' | 'job' | 'planning';
  title: string;
  at: string;
  href: string;
}

export interface DashboardSummary {
  greetingName: string;
  coinBalance: number;
  coinHistory: Array<{
    id: string;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
  }>;
  dna: {
    id: string;
    name: string;
    styleDirection?: string;
    primaryColors: string[];
  } | null;
  setup: {
    hasDna: boolean;
    hasNexterPersonalization: boolean;
    hasProject: boolean;
    hasFile: boolean;
  };
  projects: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    updatedAt: string;
    continuePath: string;
  }>;
  projectCount: number;
  files: Array<{
    id: string;
    name: string;
    category: string;
    createdAt: string;
    mimeType: string;
    downloadUrl?: string;
    expiresAt?: string;
    available?: boolean;
  }>;
  fileCount: number;
  activeJobs: DashboardJobItem[];
  recentCompletedJobs: DashboardJobItem[];
  failedJobs: DashboardJobItem[];
  activeJobCount: number;
  streamset: { completed: number; total: number; status: string; href: string } | null;
  today: Array<{
    id: string;
    title: string;
    platform?: string;
    scheduledAt?: string;
    plannerLabel?: string;
    status?: string;
  }>;
  upcoming: Array<{
    id: string;
    title: string;
    platform?: string;
    scheduledAt?: string;
    plannerLabel?: string;
    status?: string;
  }>;
  plannedCount: number;
  activity: DashboardActivityItem[];
  errors: {
    coins?: string;
    dna?: string;
    projects?: string;
    files?: string;
    jobs?: string;
    calendar?: string;
  };
}

const ACTIVE_STATUSES = new Set(['queued', 'processing', 'pending', 'running', 'partial']);
const FAILED_STATUSES = new Set(['failed']);
const DONE_STATUSES = new Set(['completed']);

async function settle<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const message = err instanceof ServiceError ? err.message : err instanceof Error ? err.message : 'Abschnitt nicht verfügbar';
    return { ok: false, error: message };
  }
}

export function dashboardGreetingName(user: {
  displayName?: string;
  nexterPreferences?: NexterPreferences;
} | null): string {
  if (!user) return 'Creator';
  if (user.nexterPreferences) {
    const named = nexterAddressName(user.nexterPreferences, user.displayName);
    if (named.trim()) return named.trim();
  }
  return user.displayName?.trim() || 'Creator';
}

export function studioPathForProjectType(type: string): string {
  switch (type) {
    case 'logo':
      return '/logo-studio';
    case 'banner':
      return '/banner-studio';
    case 'overlay':
      return '/overlay-studio';
    case 'streamset':
      return '/streamset-studio';
    case 'video':
      return '/video-studio';
    case 'shorts':
      return '/shorts-studio';
    case 'mockup':
      return '/mockup-studio';
    case 'social':
      return '/social-studio';
    case 'text':
      return '/text-studio';
    case 'intro':
      return '/intro-outro';
    default:
      return '/projects';
  }
}

function continuePath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

function hrefForGeneration(module: string): string {
  if (module === 'logo' || module === 'profile-pic') return '/logo-studio';
  if (module === 'banner') return '/banner-studio';
  if (module === 'facecam') return '/facecam-studio';
  if (module === 'overlay' || module === 'stream-start' || module === 'stream-end' || module === 'offline' || module === 'panel' || module === 'alert') {
    return '/overlay-studio';
  }
  if (module === 'sticker') return '/sticker-studio';
  if (module === 'streamset') return '/streamset-studio';
  if (module === 'mockup') return '/mockup-studio';
  return '/file-cloud';
}

function hrefForMedia(type: string): string {
  if (type.includes('music')) return '/ai-music';
  if (type.includes('voice') || type.includes('speech')) return '/ai-voice';
  if (type.includes('anim') || type === 'intro' || type === 'outro' || type === 'stinger') return '/animation-studio';
  if (type === 'short') return '/shorts-studio';
  return '/video-studio';
}

function mapGenerationJob(job: GenerationJob): DashboardJobItem {
  return {
    id: job.id,
    kind: job.module === 'streamset' || job.batchId ? 'streamset' : 'generation',
    module: job.module,
    status: job.status,
    label: job.assetKey || job.module,
    createdAt: job.createdAt,
    error: job.error,
    fileId: job.fileId,
    href: hrefForGeneration(job.module),
    progressKnown: false,
  };
}

function mapMediaJob(job: MediaJob): DashboardJobItem {
  return {
    id: job.id,
    kind: 'media',
    module: job.type,
    status: job.status,
    label: job.title || job.type,
    createdAt: job.createdAt,
    error: job.error,
    href: hrefForMedia(job.type),
    progressKnown: false,
  };
}

function streamsetSummary(jobs: GenerationJob[]): DashboardSummary['streamset'] {
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

function publicFile(file: UserFile) {
  return {
    id: file.id,
    name: file.name,
    category: file.category,
    createdAt: file.createdAt,
    mimeType: file.mimeType,
    downloadUrl: file.downloadUrl,
    expiresAt: file.expiresAt,
    available: file.available,
  };
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const user = await getUserById(userId);
  if (!user) {
    throw new ServiceError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');
  }

  const errors: DashboardSummary['errors'] = {};

  const coins = await settle(async () => ({
    balance: await getCoinBalance(userId),
    history: await getTransactions(userId, DASHBOARD_COIN_TX_LIMIT),
  }));
  if (!coins.ok) errors.coins = coins.error;

  const dnaRes = await settle(() => getActiveDna(userId));
  if (!dnaRes.ok) errors.dna = dnaRes.error;

  const projectsRes = await settle(() => listProjects(userId));
  if (!projectsRes.ok) errors.projects = projectsRes.error;

  const filesRes = await settle(() => queryUserFilesForClient(userId, { sort: 'newest', limit: DASHBOARD_FILE_LIMIT }));
  if (!filesRes.ok) errors.files = filesRes.error;

  const jobsRes = await settle(async () => {
    const [generation, media] = await Promise.all([
      getJobsByUser(userId, DASHBOARD_JOB_FETCH_LIMIT),
      listMediaJobs(userId),
    ]);
    return { generation, media };
  });
  if (!jobsRes.ok) errors.jobs = jobsRes.error;

  const calendarRes = await settle(async () => {
    const [today, upcoming] = await Promise.all([
      listTodayPlanningItems(userId),
      getUpcomingPlanningItems(userId, DASHBOARD_UPCOMING_LIMIT),
    ]);
    return { today, upcoming };
  });
  if (!calendarRes.ok) errors.calendar = calendarRes.error;

  const projects = projectsRes.ok ? projectsRes.value : [];
  const filesPage = filesRes.ok ? filesRes.value : { files: [] as UserFile[], total: 0 };
  const filesWithUrls: UserFile[] = [];
  for (const file of filesPage.files) {
    if (file.available === false) {
      filesWithUrls.push(file);
      continue;
    }
    try {
      const issued = await issueFileDownloadUrl(file.id, userId);
      filesWithUrls.push(
        issued
          ? { ...file, downloadUrl: issued.downloadUrl, expiresAt: issued.expiresAt, available: true }
          : { ...file, available: false, downloadUrl: undefined }
      );
    } catch {
      filesWithUrls.push({ ...file, available: false, downloadUrl: undefined });
    }
  }
  const generation = jobsRes.ok ? jobsRes.value.generation : [];
  const media = jobsRes.ok ? jobsRes.value.media : [];
  const allJobs: DashboardJobItem[] = [
    ...generation.map(mapGenerationJob),
    ...media.map(mapMediaJob),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const activeJobs = allJobs.filter((j) => ACTIVE_STATUSES.has(j.status)).slice(0, DASHBOARD_JOB_LIMIT);
  const recentCompletedJobs = allJobs.filter((j) => DONE_STATUSES.has(j.status)).slice(0, 4);
  const failedJobs = allJobs.filter((j) => FAILED_STATUSES.has(j.status)).slice(0, 3);

  const today = calendarRes.ok ? calendarRes.value.today : [];
  const upcoming = calendarRes.ok ? calendarRes.value.upcoming : [];
  const dna = dnaRes.ok ? dnaRes.value : null;

  const activity: DashboardActivityItem[] = [];
  for (const p of projects.slice(0, 3)) {
    activity.push({
      id: `project:${p.id}`,
      kind: 'project',
      title: `Projekt „${p.name}“`,
      at: p.updatedAt,
      href: continuePath(p.id),
    });
  }
  for (const f of filesPage.files.slice(0, 3)) {
    activity.push({
      id: `file:${f.id}`,
      kind: 'file',
      title: `Datei „${f.name}“`,
      at: f.createdAt,
      href: '/file-cloud',
    });
  }
  for (const j of recentCompletedJobs.slice(0, 3)) {
    activity.push({
      id: `job:${j.id}`,
      kind: 'job',
      title: `${j.label} fertig`,
      at: j.createdAt,
      href: j.href,
    });
  }
  for (const item of [...today, ...upcoming].slice(0, 3)) {
    activity.push({
      id: `plan:${item.id}`,
      kind: 'planning',
      title: `Geplant: ${item.title}`,
      at: item.scheduledAt || item.id,
      href: '/content-calendar',
    });
  }
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  const mapPlan = (item: (typeof today)[number]) => ({
    id: item.id,
    title: item.title,
    platform: item.platform,
    scheduledAt: item.scheduledAt,
    plannerLabel: item.plannerLabel,
    status: item.plannerStatus,
  });

  return {
    greetingName: dashboardGreetingName(user),
    coinBalance: coins.ok ? coins.value.balance : user.coinBalance ?? 0,
    coinHistory: coins.ok
      ? (coins.value.history as CoinTransaction[]).map((tx) => ({
          id: String(tx.id),
          type: String(tx.type),
          amount: Number(tx.amount) || 0,
          description: String(tx.description || tx.reason || tx.type),
          createdAt: String(tx.createdAt),
        }))
      : [],
    dna: dna
      ? {
          id: dna.id,
          name: dna.name,
          styleDirection: dna.styleDirection,
          primaryColors: dna.primaryColors?.slice(0, 6) ?? [],
        }
      : null,
    setup: {
      hasDna: Boolean(dna),
      hasNexterPersonalization: user.nexterPreferences?.personalizationCompleted === true,
      hasProject: projects.length > 0,
      hasFile: (filesPage.total ?? 0) > 0,
    },
    projects: projects.slice(0, DASHBOARD_PROJECT_LIMIT).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      status: p.status,
      updatedAt: p.updatedAt,
      continuePath: continuePath(p.id),
    })),
    projectCount: projects.length,
    files: filesWithUrls.map(publicFile),
    fileCount: filesPage.total,
    activeJobs,
    recentCompletedJobs,
    failedJobs,
    activeJobCount: allJobs.filter((j) => ACTIVE_STATUSES.has(j.status)).length,
    streamset: streamsetSummary(generation),
    today: today.map(mapPlan),
    upcoming: upcoming.map(mapPlan),
    plannedCount: upcoming.length + today.length,
    activity: activity.slice(0, DASHBOARD_ACTIVITY_LIMIT),
    errors,
  };
}
