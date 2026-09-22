import { randomUUID } from 'node:crypto';
import {
  CoinSpendCategory,
  ANIMATION_SOURCE_MIMES,
  ANIMATION_TYPES,
  applyAnimationChangeRequest,
  buildAnimationPreviewState,
  buildDnaPromptContext,
  defaultAnimationPlan,
  GENERATED_VIDEO_DURATION_DEFAULT_SEC,
  generatedVideoDurationFollowUpMessage,
  isSupportedAnimationEffect,
  isSupportedAnimationType,
  parseAnimationIntent,
  validateAnimationDuration,
  type AnimationConfig,
  type AnimationTypeId,
  type CreatorDNA,
  type ParsedAnimationIntent,
} from '@ucbs/shared';
import { withCoinCharge } from '../lib/billable-job.js';
import { ServiceError } from '../lib/errors.js';
import { requireVideoProvider } from '../lib/media-providers.js';
import { isRunwayVideoTestFetchActive } from '../lib/runway-video.js';
import { resolveDnaForRequest } from './dna.service.js';
import { getJobsByUser } from './ai.service.js';
import {
  getUserFile,
  issueFileDownloadUrl,
  listUserFiles,
  saveUserFile,
  type UserFile,
} from './file-cloud.service.js';
import { getMediaJob, listMediaJobs, runMediaJob, type MediaJob, type MediaJobType } from './media.service.js';
import { recordJobVersion, getVersionsForJob } from './change-request.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { MAX_UPLOAD_BYTES } from '../lib/upload-validation.js';
import { createTinyTestVideo } from '../lib/video-processing.js';

const ANIMATION_JOB_TYPES: MediaJobType[] = [
  'intro',
  'outro',
  'stinger',
  'alert',
  'logo-loop',
  'stream-start',
  'stream-end',
];

function asJobType(type: AnimationTypeId): MediaJobType {
  return type;
}

export interface AnimationJobView extends MediaJob {
  fileMissing?: boolean;
  preview?: ReturnType<typeof buildAnimationPreviewState>;
}

let animationTestHooks: { result?: 'success' | 'fail'; videoDataUrl?: string } | undefined;

export function setAnimationTestHooks(hooks: typeof animationTestHooks | null): void {
  animationTestHooks = hooks ?? undefined;
}

export async function listAnimations(userId: string): Promise<AnimationJobView[]> {
  const jobs = await listMediaJobs(userId);
  const list = jobs.filter((j) => ANIMATION_JOB_TYPES.includes(j.type));
  return Promise.all(list.map((j) => hydrateAnimationJob(j, userId)));
}

export async function getAnimation(id: string, userId: string): Promise<AnimationJobView | null> {
  const job = await getMediaJob(id, userId);
  if (!job || !ANIMATION_JOB_TYPES.includes(job.type)) return null;
  return hydrateAnimationJob(job, userId);
}

export async function hydrateAnimationJob(job: MediaJob, userId: string): Promise<AnimationJobView> {
  const plan = planFromJob(job);
  const next: AnimationJobView = {
    ...job,
    preview: buildAnimationPreviewState(plan),
  };
  const fileId = typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined;
  if (!fileId) return next;
  try {
    const issued = await issueFileDownloadUrl(fileId, userId);
    if (!issued) {
      next.fileMissing = true;
      next.videoUrl = undefined;
      return next;
    }
    next.videoUrl = issued.downloadUrl;
    next.fileMissing = false;
  } catch (err) {
    if (err instanceof ServiceError && err.code === 'FILE_MISSING') {
      next.fileMissing = true;
      next.videoUrl = undefined;
      return next;
    }
    throw err;
  }
  return next;
}

export async function downloadAnimation(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string }> {
  const job = await getMediaJob(jobId, userId);
  if (!job || !ANIMATION_JOB_TYPES.includes(job.type)) {
    throw new ServiceError(404, 'NOT_FOUND', 'Animation nicht gefunden');
  }
  const fileId = typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined;
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Animations-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return { downloadUrl: issued.downloadUrl, expiresAt: issued.expiresAt, fileId };
}

export async function listOwnedAnimationSources(userId: string): Promise<UserFile[]> {
  const files = await listUserFiles(userId);
  return files.filter((f) => (ANIMATION_SOURCE_MIMES as readonly string[]).includes(f.mimeType));
}

export async function resolveAnimationSourceFile(
  userId: string,
  sourceFileId?: string | null
): Promise<UserFile | null> {
  if (!sourceFileId) return null;
  const file = await getUserFile(sourceFileId, userId);
  if (!file) throw new ServiceError(404, 'NOT_FOUND', 'Source-Asset nicht gefunden');
  if (!(ANIMATION_SOURCE_MIMES as readonly string[]).includes(file.mimeType)) {
    throw new ServiceError(400, 'INVALID_ASSET', 'Dieser Dateityp kann nicht animiert werden');
  }
  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    throw new ServiceError(413, 'FILE_TOO_LARGE', 'Source-Asset überschreitet das Upload-Limit oder ist leer');
  }
  return file;
}

export async function listOwnedLogoUrls(userId: string): Promise<Set<string>> {
  const urls = new Set<string>();
  const { dna } = await resolveDnaForRequest(userId);
  for (const a of dna?.sourceAssets ?? []) {
    if (a.url) urls.add(a.url);
  }
  const jobs = await getJobsByUser(userId);
  for (const j of jobs) {
    if (j.module === 'logo' && j.imageUrl) urls.add(j.imageUrl);
  }
  const files = await listUserFiles(userId);
  for (const f of files) {
    if (f.downloadUrl) urls.add(f.downloadUrl);
  }
  return urls;
}

export async function resolveAnimationLogo(userId: string, explicit?: string): Promise<string | undefined> {
  if (explicit?.trim()) {
    const url = explicit.trim();
    if (url.startsWith('data:image/')) return url;
    const owned = await listOwnedLogoUrls(userId);
    if (!owned.has(url)) {
      throw new ServiceError(403, 'LOGO_NOT_OWNED', 'Dieses Logo gehört nicht zu deinem Account');
    }
    return url;
  }
  const owned = [...(await listOwnedLogoUrls(userId))];
  return owned[0];
}

function planFromPayload(payload?: Record<string, unknown>, parsed?: ParsedAnimationIntent): AnimationConfig {
  const base = defaultAnimationPlan();
  const typeCandidate = String((payload?.type as string) || parsed?.type || base.type);
  if (!isSupportedAnimationType(typeCandidate)) {
    throw new ServiceError(400, 'INVALID_PRESET', 'Dieser Animationstyp wird nicht unterstützt');
  }
  const typeRaw = typeCandidate;
  const effectRaw = (payload?.effect as string) || parsed?.effect || base.effect;
  if (effectRaw && !isSupportedAnimationEffect(String(effectRaw))) {
    throw new ServiceError(400, 'INVALID_PRESET', 'Dieser Animationseffekt wird nicht unterstützt');
  }
  const rawDur = payload?.durationSec ?? payload?.duration ?? parsed?.durationSec;
  if (parsed?.durationUnsupported) {
    throw new ServiceError(400, 'INVALID_DURATION', generatedVideoDurationFollowUpMessage());
  }
  let candidate: number;
  if (rawDur !== undefined && rawDur !== null && rawDur !== '') {
    const durationCheck = validateAnimationDuration(rawDur);
    if (!durationCheck.ok) {
      throw new ServiceError(400, 'INVALID_DURATION', generatedVideoDurationFollowUpMessage());
    }
    candidate = durationCheck.durationSec;
  } else {
    candidate = ANIMATION_TYPES.find((t) => t.id === typeRaw)?.durationSec ?? GENERATED_VIDEO_DURATION_DEFAULT_SEC;
  }
  const aspectRaw = (payload?.aspectRatio as AnimationConfig['aspectRatio']) || parsed?.aspectRatio || '16:9';
  const aspectRatio: AnimationConfig['aspectRatio'] = (
    ['original', '1:1', '16:9', '9:16'] as const
  ).includes(aspectRaw)
    ? aspectRaw
    : '16:9';
  const motion = (payload?.motion as AnimationConfig['motion']) || parsed?.motion || 'medium';
  const directionRaw = (payload?.direction as string) || parsed?.direction || 'cw';
  const direction: NonNullable<AnimationConfig['direction']> = (
    ['cw', 'ccw', 'left', 'right', 'up', 'down'] as const
  ).includes(directionRaw as never)
    ? (directionRaw as NonNullable<AnimationConfig['direction']>)
    : 'cw';
  const rotations = Math.min(3, Math.max(1, Number(payload?.rotations ?? parsed?.rotations ?? 1) || 1));
  return {
    type: typeRaw,
    durationSec: candidate,
    aspectRatio,
    motion: motion === 'subtle' || motion === 'strong' ? motion : 'medium',
    loop: Boolean(payload?.loop ?? parsed?.loop ?? (typeRaw === 'logo-loop' || typeRaw === 'stream-start')),
    withAudio: Boolean(payload?.withAudio ?? parsed?.withAudio),
    effect: (effectRaw as AnimationConfig['effect']) || 'fade-in',
    rotations,
    direction,
    transparent: Boolean(payload?.transparent ?? parsed?.transparent),
    sourceFileId: typeof payload?.sourceFileId === 'string' ? payload.sourceFileId : parsed?.sourceFileId ?? null,
    logoUrl: typeof payload?.logoUrl === 'string' ? payload.logoUrl : parsed?.logoUrl,
  };
}

function planFromJob(job: MediaJob): AnimationConfig {
  const meta = job.metadata ?? {};
  try {
    return planFromPayload(meta);
  } catch {
    return defaultAnimationPlan();
  }
}

export async function generateAnimation(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: MediaJob; coinsSpent: number; newBalance: number }> {
  const { dna } = await resolveDnaForRequest(userId, projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  const parsed = parseAnimationIntent(typeof payload?.message === 'string' ? payload.message : '');
  let plan = planFromPayload(payload, parsed);

  const parentJobId = typeof payload?.parentJobId === 'string' ? payload.parentJobId : undefined;
  if (parentJobId) {
    const parent = await getMediaJob(parentJobId, userId);
    if (!parent || !ANIMATION_JOB_TYPES.includes(parent.type)) {
      throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Animation nicht gefunden');
    }
    const parentPlan = planFromJob(parent);
    const request = typeof payload?.request === 'string' ? payload.request : typeof payload?.message === 'string' ? payload.message : '';
    plan = applyAnimationChangeRequest(
      {
        ...parentPlan,
        sourceFileId:
          typeof parent.metadata?.sourceFileId === 'string' ? parent.metadata.sourceFileId : parentPlan.sourceFileId,
      },
      request
    );
    if (!plan.sourceFileId && typeof parent.metadata?.sourceFileId === 'string') {
      plan.sourceFileId = parent.metadata.sourceFileId;
    }
  }

  const source = await resolveAnimationSourceFile(userId, plan.sourceFileId);
  if (plan.logoUrl) {
    await resolveAnimationLogo(userId, plan.logoUrl);
  }
  if (!source && !plan.logoUrl) {
    const fallback = await listOwnedAnimationSources(userId);
    if (fallback[0]) {
      plan.sourceFileId = fallback[0].id;
    }
  }
  const ownedSource = source ?? (plan.sourceFileId ? await resolveAnimationSourceFile(userId, plan.sourceFileId) : null);
  if (!ownedSource && !plan.logoUrl) {
    throw new ServiceError(400, 'NO_SOURCE', 'Bitte ein eigenes Logo- oder Bild-Asset wählen');
  }

  const dnaCtx = buildDnaPromptContext(dna, { consumer: 'overlay' });
  const preview = buildAnimationPreviewState(plan);
  const prompt = [
    `${plan.type} animation for ${dna.name}`,
    dnaCtx,
    `effect ${plan.effect}`,
    `motion ${plan.motion}`,
    plan.loop ? 'seamless loop, logo stays centered and unchanged' : null,
    plan.transparent ? 'transparent background if the output format supports alpha' : 'opaque background',
    plan.aspectRatio === '9:16' ? 'vertical 9:16' : plan.aspectRatio === '1:1' ? 'square 1:1' : '16:9 widescreen',
    ownedSource ? 'use the provided brand logo as the hero mark — do not invent a different mascot' : null,
  ]
    .filter(Boolean)
    .join('. ');

  const quoteId = typeof payload?.quoteId === 'string' ? payload.quoteId : undefined;

  if (!animationTestHooks && !isRunwayVideoTestFetchActive()) {
    requireVideoProvider();
  }

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.ANIMATION_GENERATION,
      `Animation ${plan.type}`,
      async () => {
        if (animationTestHooks?.result === 'fail') {
          const job: MediaJob = {
            id: randomUUID(),
            userId,
            type: asJobType(plan.type),
            status: 'failed',
            prompt,
            title: `${dna.name} ${plan.type}`,
            duration: plan.durationSec,
            dnaId: dna.id,
            projectId,
            error: 'mock-fail',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            metadata: { ...plan, preview, sourceFileId: ownedSource?.id ?? null },
          };
          const { dsSet } = await import('../lib/data-store.js');
          await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
          return job;
        }

        if (animationTestHooks?.result === 'success') {
          const dataUrl =
            animationTestHooks.videoDataUrl ??
            `data:video/mp4;base64,${(await createTinyTestVideo(Math.min(2.2, plan.durationSec))).toString('base64')}`;
          return persistMockAnimationResult(userId, dna, plan, prompt, projectId, ownedSource, parentJobId, dataUrl);
        }

        const videoAspect = plan.aspectRatio === '9:16' ? '9:16' : '16:9';
        return runMediaJob(userId, asJobType(plan.type), dna, {
          customPrompt: prompt,
          title: `${dna.name} ${plan.type}`,
          duration: plan.durationSec,
          projectId,
          metadata: {
            ...plan,
            preview,
            aspectRatio: videoAspect,
            requestedAspect: plan.aspectRatio,
            sourceFileId: ownedSource?.id ?? null,
            logoUrl: plan.logoUrl,
            imageToVideoAttempted: Boolean(ownedSource || plan.logoUrl),
            parentJobId,
            transparencyClaim: false,
          },
        });
      },
      { quoteId }
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
}

async function persistMockAnimationResult(
  userId: string,
  dna: CreatorDNA,
  plan: AnimationConfig,
  prompt: string,
  projectId: string | undefined,
  ownedSource: UserFile | null,
  parentJobId: string | undefined,
  dataUrl: string
): Promise<MediaJob> {
  const id = randomUUID();
  const file = await saveUserFile(userId, {
    name: `${dna.name} ${plan.type}`,
    mimeType: 'video/mp4',
    category: 'video',
    dataUrl,
    source: 'generation',
    projectId,
    sourceJobId: id,
    sourceAssetId: ownedSource?.id,
  });
  const version = await recordJobVersion(userId, parentJobId || id, file.id, parentJobId ? 'Variante' : 'Original');
  const job: MediaJob = {
    id,
    userId,
    type: asJobType(plan.type),
    status: 'completed',
    prompt,
    title: `${dna.name} ${plan.type}`,
    duration: plan.durationSec,
    dnaId: dna.id,
    projectId,
    provider: 'mock',
    videoUrl: file.downloadUrl,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    metadata: {
      ...plan,
      fileId: file.id,
      version: version.version,
      sourceFileId: ownedSource?.id ?? null,
      parentJobId,
      transparencyClaim: false,
      outputFormat: 'mp4',
      preview: buildAnimationPreviewState(plan),
    },
  };
  const { dsSet } = await import('../lib/data-store.js');
  await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
  return job;
}

export async function listAnimationVersions(jobId: string, userId: string) {
  const job = await getMediaJob(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Animation nicht gefunden');
  const rootId = typeof job.metadata?.parentJobId === 'string' ? job.metadata.parentJobId : jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export function animationUsesDna(dna: CreatorDNA, job: MediaJob): boolean {
  return job.dnaId === dna.id || Boolean(job.prompt?.includes(dna.name));
}
