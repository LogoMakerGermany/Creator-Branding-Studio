import {
  CoinSpendCategory,
  applyFacecamChangeRequest,
  applyFacecamPlatformPreset,
  facecamConfigFromDna,
  facecamConfigToGenerationOptions,
  facecamDownloadFilename,
  facecamProviderSize,
  buildFacecamDesignSummary,
  defaultFacecamConfig,
  parseFacecamIntent,
  validateFacecamDimensions,
  validateFacecamFormat,
  FACECAM_PLATFORM_SPECS,
  FACECAM_REFERENCE_MIMES,
  MAX_FACECAM_PROMPT_CHARS,
  MAX_FACECAM_REFERENCES,
  FACECAM_FRAME_SHAPES,
  FACECAM_FRAME_THICKNESSES,
  FACECAM_LOGO_POSITIONS,
  type FacecamConfig,
  type FacecamGenerationOptions,
  type FacecamPlatform,
  type FacecamFrameShape,
  type FacecamFrameThickness,
  type FacecamLogoPosition,
  type CreatorDNA,
  type StyleDirection,
} from '@ucbs/shared';
import { withCoinCharge } from '../lib/billable-job.js';
import { ServiceError } from '../lib/errors.js';
import { MAX_UPLOAD_BYTES } from '../lib/upload-validation.js';
import { AppError } from '../middleware/errorHandler.js';
import { resolveDnaForRequest, getActiveDna } from './dna.service.js';
import { getUserFile, issueFileDownloadUrl } from './file-cloud.service.js';
import { getVersionsForJob } from './change-request.service.js';
import { getProject } from './project.service.js';
import { requireOwnedLogoJob } from './streamset.service.js';
import { buildFacecamPrompt } from './studio-prompt.service.js';
import {
  getJob,
  getJobsByUser,
  runGenerationJob,
  setFacecamTestHooks,
  assertImageProviderReadyForStudio,
  type GenerationJob,
} from './ai.service.js';

export { setFacecamTestHooks };

export interface FacecamJobView extends GenerationJob {
  fileMissing?: boolean;
  config?: FacecamConfig;
  downloadName?: string;
  previewUrl?: string;
  version?: number;
  platform?: FacecamPlatform;
}

function asRecord(payload?: Record<string, unknown>): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload : {};
}

function ephemeralFacecamDna(userId: string, config: FacecamConfig): CreatorDNA {
  const now = new Date().toISOString();
  const style = (config.style || 'gaming').toLowerCase();
  const styleDirection = (
    ['gaming', 'streaming', 'esports', 'minimal', 'cinematic', 'neon', 'anime', 'cyberpunk', 'clean', 'cartoon'].includes(
      style
    )
      ? style
      : 'gaming'
  ) as StyleDirection;
  return {
    id: `ephemeral-facecam-${userId}`,
    userId,
    name: 'Creator',
    type: 'creator',
    primaryColors: config.colors.slice(0, 3),
    secondaryColors: config.colors.slice(3, 5),
    accentColors: [],
    styleDirection,
    favoriteGenres: [],
    gamingStyle: '',
    brandingStyle: config.style,
    promptStyle: '',
    visualLanguage: '',
    animations: [],
    personalGuidelines: '',
    fonts: [],
    brandingRules: [],
    platformOptimization: [],
    targetAudience: {
      ageRange: '',
      interests: [],
      platforms: [config.platform],
      tone: '',
      description: '',
    },
    designLanguage: { mood: [], keywords: [], visualElements: [], doNotUse: [] },
    sourceAssets: [],
    version: 0,
    isActive: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function assertOwnedFacecamReference(userId: string, fileId: string): Promise<void> {
  const file = await getUserFile(fileId, userId);
  if (!file) {
    throw new ServiceError(403, 'FOREIGN_REFERENCE', 'Referenzbild gehört nicht zu diesem Account');
  }
  if (!FACECAM_REFERENCE_MIMES.includes(file.mimeType as (typeof FACECAM_REFERENCE_MIMES)[number])) {
    throw new ServiceError(400, 'INVALID_REFERENCE_MIME', 'Referenzbild muss PNG, JPEG oder WEBP sein');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ServiceError(413, 'REFERENCE_TOO_LARGE', 'Referenzbild ist zu groß');
  }
}

export async function requireOwnedFacecamJob(userId: string, jobId: string): Promise<GenerationJob> {
  const job = await getJob(jobId);
  if (!job || job.userId !== userId || job.module !== 'facecam') {
    throw new ServiceError(404, 'FACECAM_NOT_FOUND', 'Facecam nicht gefunden');
  }
  return job;
}

function rejectExternalUrls(payload: Record<string, unknown>): void {
  const suspects = [payload.referenceUrl, payload.imageUrl, payload.designUrl, payload.logoUrl];
  for (const value of suspects) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
      throw new ServiceError(400, 'NO_EXTERNAL_URL', 'Externe Bild-URLs werden nicht als Provider-Input akzeptiert');
    }
  }
}

function asShape(value: unknown): FacecamFrameShape | undefined {
  return typeof value === 'string' && FACECAM_FRAME_SHAPES.includes(value as FacecamFrameShape)
    ? (value as FacecamFrameShape)
    : undefined;
}

function asThickness(value: unknown): FacecamFrameThickness | undefined {
  return typeof value === 'string' && FACECAM_FRAME_THICKNESSES.includes(value as FacecamFrameThickness)
    ? (value as FacecamFrameThickness)
    : undefined;
}

function asLogoPos(value: unknown): FacecamLogoPosition | undefined {
  return typeof value === 'string' && FACECAM_LOGO_POSITIONS.includes(value as FacecamLogoPosition)
    ? (value as FacecamLogoPosition)
    : undefined;
}

function planFacecamFromPayload(raw: Record<string, unknown>, dna: CreatorDNA | null): FacecamConfig {
  const dnaDefaults = dna ? facecamConfigFromDna(dna) : {};
  const platformRaw = typeof raw.platform === 'string' ? raw.platform.toLowerCase() : '';
  const platform =
    platformRaw in FACECAM_PLATFORM_SPECS ? (platformRaw as FacecamPlatform) : dnaDefaults.platform ?? 'twitch';
  let config = defaultFacecamConfig({
    ...dnaDefaults,
    platform,
    style: typeof raw.style === 'string' ? raw.style : dnaDefaults.style,
    motif: typeof raw.motif === 'string' ? raw.motif : dnaDefaults.motif,
    frameShape: asShape(raw.frameShape) ?? asShape(raw.shape),
    frameThickness: asThickness(raw.frameThickness),
    logoPosition: asLogoPos(raw.logoPosition),
    logoJobId:
      typeof raw.sourceLogoJobId === 'string'
        ? raw.sourceLogoJobId
        : typeof raw.logoJobId === 'string'
          ? raw.logoJobId
          : typeof raw.logoAssetId === 'string'
            ? raw.logoAssetId
            : undefined,
    decorations: typeof raw.decorations === 'string' ? raw.decorations : undefined,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : typeof raw.message === 'string' ? raw.message : undefined,
  });

  if (raw.width != null || raw.height != null) {
    const dims = validateFacecamDimensions(raw.width ?? config.width, raw.height ?? config.height);
    if (!dims.ok) {
      throw new ServiceError(400, 'FACECAM_DIMENSION_INVALID', dims.message);
    }
    config.width = dims.width;
    config.height = dims.height;
    if (raw.aspectRatio === 'custom' || (raw.width != null && raw.height != null && raw.aspectRatio === undefined)) {
      config.aspectRatio = 'custom';
    }
  }

  const transparent =
    typeof raw.transparentBackground === 'boolean' ? raw.transparentBackground : config.transparentBackground;
  const transparentCenter =
    typeof raw.transparentCenter === 'boolean' ? raw.transparentCenter : config.transparentCenter && transparent;
  const fmt = validateFacecamFormat(raw.format ?? raw.outputFormat ?? config.format, transparent || transparentCenter);
  if (!fmt.ok) {
    throw new ServiceError(400, 'FACECAM_FORMAT_INVALID', fmt.message);
  }
  config.format = fmt.format;
  config.transparentBackground = transparent;
  config.transparentCenter = transparentCenter;
  if (config.format === 'jpg') {
    config.transparentBackground = false;
    config.transparentCenter = false;
  }

  const refs: string[] = [];
  if (typeof raw.referenceFileId === 'string' && raw.referenceFileId.trim()) refs.push(raw.referenceFileId.trim());
  if (Array.isArray(raw.referenceFileIds)) {
    for (const id of raw.referenceFileIds) {
      if (typeof id === 'string' && id.trim()) refs.push(id.trim());
    }
  }
  if (typeof raw.referenceAssetIds === 'object' && Array.isArray(raw.referenceAssetIds)) {
    for (const id of raw.referenceAssetIds) {
      if (typeof id === 'string' && id.trim()) refs.push(id.trim());
    }
  }
  if (refs.length > MAX_FACECAM_REFERENCES) {
    throw new ServiceError(400, 'TOO_MANY_REFERENCES', `Maximal ${MAX_FACECAM_REFERENCES} Referenzbilder`);
  }
  config.referenceAssetIds = refs.slice(0, MAX_FACECAM_REFERENCES);
  if (config.prompt && config.prompt.length > MAX_FACECAM_PROMPT_CHARS) {
    config.prompt = config.prompt.slice(0, MAX_FACECAM_PROMPT_CHARS);
  }

  const convertTo =
    typeof raw.convertToPlatform === 'string' && raw.convertToPlatform in FACECAM_PLATFORM_SPECS
      ? (raw.convertToPlatform as FacecamPlatform)
      : undefined;
  if (convertTo) {
    config = applyFacecamPlatformPreset(config, convertTo);
  }

  config.summary = buildFacecamDesignSummary(config);
  return config;
}

function configFromJob(job: GenerationJob): FacecamConfig {
  const meta = (job.metadata ?? {}) as Record<string, unknown>;
  try {
    return planFacecamFromPayload(
      { ...meta, width: job.width, height: job.height, platform: meta.platform, format: meta.format },
      null
    );
  } catch {
    return defaultFacecamConfig({
      width: typeof job.width === 'number' ? job.width : undefined,
      height: typeof job.height === 'number' ? job.height : undefined,
      platform:
        typeof meta.platform === 'string' && meta.platform in FACECAM_PLATFORM_SPECS
          ? (meta.platform as FacecamPlatform)
          : 'twitch',
    });
  }
}

export async function listFacecam(userId: string): Promise<FacecamJobView[]> {
  const jobs = (await getJobsByUser(userId)).filter((j) => j.module === 'facecam');
  return Promise.all(jobs.map((j) => hydrateFacecamJob(j, userId)));
}

export async function getFacecam(id: string, userId: string): Promise<FacecamJobView | null> {
  const job = await getJob(id);
  if (!job || job.userId !== userId || job.module !== 'facecam') return null;
  return hydrateFacecamJob(job, userId);
}

export async function hydrateFacecamJob(job: GenerationJob, userId: string): Promise<FacecamJobView> {
  const config = configFromJob(job);
  const next: FacecamJobView = { ...job, config, platform: config.platform };
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  const versions = await getVersionsForJob(job.parentJobId || job.id, userId).catch(() => []);
  const version = versions.length || (typeof job.metadata?.version === 'number' ? job.metadata.version : 1);
  next.version = version;
  next.downloadName = facecamDownloadFilename({
    creatorName: typeof job.metadata?.creatorName === 'string' ? job.metadata.creatorName : 'creator',
    platform: config.platform,
    version,
    ext: config.format === 'jpg' ? 'jpg' : config.format === 'webp' ? 'webp' : 'png',
  });
  if (!fileId) {
    if (job.status === 'completed') next.fileMissing = true;
    return next;
  }
  try {
    const issued = await issueFileDownloadUrl(fileId, userId);
    if (!issued) {
      next.fileMissing = true;
      next.imageUrl = undefined;
      next.previewUrl = undefined;
      return next;
    }
    next.previewUrl = issued.downloadUrl;
    next.imageUrl = issued.downloadUrl;
    next.fileMissing = false;
  } catch (err) {
    if (err instanceof ServiceError && err.code === 'FILE_MISSING') {
      next.fileMissing = true;
      next.imageUrl = undefined;
      next.previewUrl = undefined;
      return next;
    }
    throw err;
  }
  return next;
}

export async function downloadFacecam(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }> {
  const job = await getFacecam(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Facecam nicht gefunden');
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Facecam-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return {
    downloadUrl: issued.downloadUrl,
    expiresAt: issued.expiresAt,
    fileId,
    filename: job.downloadName || 'facecam.png',
  };
}

export async function listFacecamVersions(jobId: string, userId: string) {
  const job = await getFacecam(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Facecam nicht gefunden');
  const rootId = job.parentJobId || jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export async function retryFacecamJob(jobId: string, userId: string): Promise<never> {
  const job = await getFacecam(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Facecam nicht gefunden');
  if (job.status !== 'failed') {
    throw new ServiceError(409, 'JOB_NOT_RETRYABLE', 'Nur fehlgeschlagene Jobs können wiederholt werden');
  }
  throw new ServiceError(
    402,
    'FACECAM_REQUIRES_QUOTE',
    'Nach einem endgültigen Fehlschlag und Refund braucht der nächste Versuch ein neues Angebot.'
  );
}

export async function generateFacecamAsset(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: GenerationJob; coinsSpent: number; newBalance: number }> {
  const raw = asRecord(payload);
  rejectExternalUrls(raw);

  const { dna: resolved } = await resolveDnaForRequest(userId, projectId);
  const dna = resolved ?? (await getActiveDna(userId));

  let config = planFacecamFromPayload(raw, dna);
  const parentJobId = typeof raw.parentJobId === 'string' ? raw.parentJobId : undefined;
  if (parentJobId) {
    const parent = await getFacecam(parentJobId, userId);
    if (!parent) throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Facecam nicht gefunden');
    const parentConfig = parent.config ?? configFromJob(parent);
    const request = typeof raw.request === 'string' ? raw.request : typeof raw.message === 'string' ? raw.message : '';
    const convertTo =
      typeof raw.convertToPlatform === 'string' && raw.convertToPlatform in FACECAM_PLATFORM_SPECS
        ? (raw.convertToPlatform as FacecamPlatform)
        : parseFacecamIntent(request).convertToPlatform;
    config = request ? applyFacecamChangeRequest(parentConfig, request) : { ...parentConfig };
    if (convertTo) config = applyFacecamPlatformPreset(config, convertTo);
    config.summary = buildFacecamDesignSummary(config);
  }

  if (config.logoJobId) {
    await requireOwnedLogoJob(userId, config.logoJobId);
  }

  for (const refId of config.referenceAssetIds) {
    await assertOwnedFacecamReference(userId, refId);
  }

  const activeDna = dna ?? ephemeralFacecamDna(userId, config);
  const studioOptions: FacecamGenerationOptions = facecamConfigToGenerationOptions(config);
  const quoteId = typeof raw.quoteId === 'string' ? raw.quoteId : undefined;
  const prompt = buildFacecamPrompt(activeDna, {
    ...studioOptions,
  }).slice(0, MAX_FACECAM_PROMPT_CHARS + 800);

  assertImageProviderReadyForStudio('facecam');

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.FACECAM_GENERATION,
      'Facecam Generierung',
      async () =>
        runGenerationJob(userId, 'facecam', activeDna, prompt, {
          size: facecamProviderSize(config.width, config.height),
          hd: true,
          projectId,
          parentJobId,
          quoteId,
          width: config.width,
          height: config.height,
          mimeType:
            config.format === 'jpg' ? 'image/jpeg' : config.format === 'webp' ? 'image/webp' : 'image/png',
          transparentBackground: config.transparentBackground || config.transparentCenter,
          facecamConfig: config,
          creatorName: activeDna.name,
          downloadName: facecamDownloadFilename({
            creatorName: activeDna.name,
            platform: config.platform,
            version: 1,
            ext: config.format,
          }),
        }),
      { quoteId }
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
}

export async function facecamProjectAssets(userId: string, projectId: string) {
  const project = await getProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  return (project.assets ?? []).filter((a) => a.module === 'facecam' || a.type === 'facecam');
}

export function studioOptionsFromFacecamConfig(config: FacecamConfig): FacecamGenerationOptions {
  return facecamConfigToGenerationOptions(config);
}
