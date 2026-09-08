import {
  CoinSpendCategory,
  applyStickerChangeRequest,
  applyStickerPlatformPreset,
  stickerConfigFromDna,
  stickerConfigToGenerationOptions,
  stickerDownloadFilename,
  stickerProviderSize,
  buildStickerDesignSummary,
  defaultStickerConfig,
  validateStickerDimensions,
  validateStickerFormat,
  validateStickerText,
  STICKER_PLATFORM_SPECS,
  STICKER_REFERENCE_MIMES,
  STICKER_KINDS,
  STICKER_SHAPES,
  STICKER_OUTLINES,
  MAX_STICKER_PROMPT_CHARS,
  MAX_STICKER_REFERENCES,
  type StickerConfig,
  type StickerGenerationOptions,
  type StickerPlatform,
  type StickerKind,
  type StickerShape,
  type StickerOutline,
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
import { buildStickerPrompt } from './studio-prompt.service.js';
import {
  getJob,
  getJobsByUser,
  runGenerationJob,
  setStickerTestHooks,
  assertImageProviderReadyForStudio,
  type GenerationJob,
} from './ai.service.js';

export { setStickerTestHooks };

export interface StickerJobView extends GenerationJob {
  fileMissing?: boolean;
  config?: StickerConfig;
  downloadName?: string;
  previewUrl?: string;
  version?: number;
  platform?: StickerPlatform;
}

function asRecord(payload?: Record<string, unknown>): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload : {};
}

function ephemeralStickerDna(userId: string, config: StickerConfig): CreatorDNA {
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
    id: `ephemeral-sticker-${userId}`,
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

export async function assertOwnedStickerReference(userId: string, fileId: string): Promise<void> {
  const file = await getUserFile(fileId, userId);
  if (!file) {
    throw new ServiceError(403, 'FOREIGN_REFERENCE', 'Referenzbild gehört nicht zu diesem Account');
  }
  if (!STICKER_REFERENCE_MIMES.includes(file.mimeType as (typeof STICKER_REFERENCE_MIMES)[number])) {
    throw new ServiceError(400, 'INVALID_REFERENCE_MIME', 'Referenzbild muss PNG, JPEG oder WEBP sein');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ServiceError(413, 'REFERENCE_TOO_LARGE', 'Referenzbild ist zu groß');
  }
}

export async function requireOwnedStickerJob(userId: string, jobId: string): Promise<GenerationJob> {
  const job = await getJob(jobId);
  if (!job || job.userId !== userId || job.module !== 'sticker') {
    throw new ServiceError(404, 'STICKER_NOT_FOUND', 'Sticker nicht gefunden');
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

function asKind(value: unknown): StickerKind | undefined {
  return typeof value === 'string' && STICKER_KINDS.includes(value as StickerKind) ? (value as StickerKind) : undefined;
}
function asShape(value: unknown): StickerShape | undefined {
  return typeof value === 'string' && STICKER_SHAPES.includes(value as StickerShape) ? (value as StickerShape) : undefined;
}
function asOutline(value: unknown): StickerOutline | undefined {
  return typeof value === 'string' && STICKER_OUTLINES.includes(value as StickerOutline)
    ? (value as StickerOutline)
    : undefined;
}

function planStickerFromPayload(raw: Record<string, unknown>, dna: CreatorDNA | null): StickerConfig {
  const dnaDefaults = dna ? stickerConfigFromDna(dna) : {};
  const platformRaw = typeof raw.platform === 'string' ? raw.platform.toLowerCase() : '';
  const platform =
    platformRaw in STICKER_PLATFORM_SPECS ? (platformRaw as StickerPlatform) : dnaDefaults.platform ?? 'twitch';
  const textCheck = validateStickerText(raw.text ?? raw.name);
  if (!textCheck.ok) throw new ServiceError(400, 'STICKER_TEXT_INVALID', textCheck.message);

  const colors = Array.isArray(raw.colors)
    ? raw.colors.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 4)
    : undefined;

  let config = defaultStickerConfig({
    ...dnaDefaults,
    platform,
    kind: asKind(raw.kind) ?? asKind(raw.stickerType),
    style: typeof raw.style === 'string' ? raw.style : dnaDefaults.style,
    motif: typeof raw.motif === 'string' ? raw.motif : dnaDefaults.motif,
    shape: asShape(raw.shape),
    outline: asOutline(raw.outline),
    text: textCheck.text,
    colors: colors?.length ? colors : dnaDefaults.colors,
    qualityProfile: typeof raw.qualityProfile === 'string' ? raw.qualityProfile : undefined,
    logoJobId:
      typeof raw.sourceLogoJobId === 'string'
        ? raw.sourceLogoJobId
        : typeof raw.logoJobId === 'string'
          ? raw.logoJobId
          : typeof raw.logoAssetId === 'string'
            ? raw.logoAssetId
            : undefined,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : typeof raw.message === 'string' ? raw.message : undefined,
    multicolor: typeof raw.multicolor === 'boolean' ? raw.multicolor : undefined,
  });

  if (raw.width != null || raw.height != null) {
    const dims = validateStickerDimensions(raw.width ?? config.width, raw.height ?? config.height);
    if (!dims.ok) throw new ServiceError(400, 'STICKER_DIMENSION_INVALID', dims.message);
    config.width = dims.width;
    config.height = dims.height;
    config.sizePreset = 'custom';
  }

  const transparent =
    typeof raw.transparentBackground === 'boolean' ? raw.transparentBackground : config.transparentBackground;
  const fmt = validateStickerFormat(raw.format ?? raw.outputFormat ?? config.format, transparent);
  if (!fmt.ok) throw new ServiceError(400, 'STICKER_FORMAT_INVALID', fmt.message);
  config.format = fmt.format;
  config.transparentBackground = transparent && config.format !== 'jpg';

  const refs: string[] = [];
  if (typeof raw.referenceFileId === 'string' && raw.referenceFileId.trim()) refs.push(raw.referenceFileId.trim());
  if (Array.isArray(raw.referenceFileIds)) {
    for (const id of raw.referenceFileIds) {
      if (typeof id === 'string' && id.trim()) refs.push(id.trim());
    }
  }
  if (Array.isArray(raw.referenceAssetIds)) {
    for (const id of raw.referenceAssetIds) {
      if (typeof id === 'string' && id.trim()) refs.push(id.trim());
    }
  }
  if (refs.length > MAX_STICKER_REFERENCES) {
    throw new ServiceError(400, 'TOO_MANY_REFERENCES', `Maximal ${MAX_STICKER_REFERENCES} Referenzbilder`);
  }
  config.referenceAssetIds = refs.slice(0, MAX_STICKER_REFERENCES);
  if (config.prompt && config.prompt.length > MAX_STICKER_PROMPT_CHARS) {
    config.prompt = config.prompt.slice(0, MAX_STICKER_PROMPT_CHARS);
  }
  config.requestedCount = 1;
  config.summary = buildStickerDesignSummary(config);
  return config;
}

function configFromJob(job: GenerationJob): StickerConfig {
  const meta = (job.metadata ?? {}) as Record<string, unknown>;
  try {
    return planStickerFromPayload(
      { ...meta, width: job.width, height: job.height, platform: meta.platform, format: meta.format },
      null
    );
  } catch {
    return defaultStickerConfig({
      width: typeof job.width === 'number' ? job.width : undefined,
      height: typeof job.height === 'number' ? job.height : undefined,
      platform:
        typeof meta.platform === 'string' && meta.platform in STICKER_PLATFORM_SPECS
          ? (meta.platform as StickerPlatform)
          : 'twitch',
    });
  }
}

export async function listSticker(userId: string): Promise<StickerJobView[]> {
  const jobs = (await getJobsByUser(userId)).filter((j) => j.module === 'sticker');
  return Promise.all(jobs.map((j) => hydrateStickerJob(j, userId)));
}

export async function getSticker(id: string, userId: string): Promise<StickerJobView | null> {
  const job = await getJob(id);
  if (!job || job.userId !== userId || job.module !== 'sticker') return null;
  return hydrateStickerJob(job, userId);
}

export async function hydrateStickerJob(job: GenerationJob, userId: string): Promise<StickerJobView> {
  const config = configFromJob(job);
  const next: StickerJobView = { ...job, config, platform: config.platform };
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  const versions = await getVersionsForJob(job.parentJobId || job.id, userId).catch(() => []);
  const version = versions.length || (typeof job.metadata?.version === 'number' ? job.metadata.version : 1);
  next.version = version;
  next.downloadName = stickerDownloadFilename({
    creatorName: typeof job.metadata?.creatorName === 'string' ? job.metadata.creatorName : 'creator',
    platform: config.platform,
    kind: config.kind,
    text: config.text,
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

export async function downloadSticker(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }> {
  const job = await getSticker(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Sticker nicht gefunden');
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Sticker-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return {
    downloadUrl: issued.downloadUrl,
    expiresAt: issued.expiresAt,
    fileId,
    filename: job.downloadName || 'sticker.png',
  };
}

export async function listStickerVersions(jobId: string, userId: string) {
  const job = await getSticker(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Sticker nicht gefunden');
  const rootId = job.parentJobId || jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export async function retryStickerJob(jobId: string, userId: string): Promise<never> {
  const job = await getSticker(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Sticker nicht gefunden');
  if (job.status !== 'failed') {
    throw new ServiceError(409, 'JOB_NOT_RETRYABLE', 'Nur fehlgeschlagene Jobs können wiederholt werden');
  }
  throw new ServiceError(
    402,
    'STICKER_REQUIRES_QUOTE',
    'Nach einem endgültigen Fehlschlag und Refund braucht der nächste Versuch ein neues Angebot.'
  );
}

export async function generateStickerAsset(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: GenerationJob; coinsSpent: number; newBalance: number }> {
  const raw = asRecord(payload);
  rejectExternalUrls(raw);
  if (typeof raw.requestedCount === 'number' && raw.requestedCount > 1) {
    throw new ServiceError(
      400,
      'STICKER_BATCH_NOT_SUPPORTED',
      'Mehrere Sticker in einem Auftrag starte ich nicht automatisch. Bitte einzeln bestätigen.'
    );
  }

  const { dna: resolved } = await resolveDnaForRequest(userId, projectId);
  const dna = resolved ?? (await getActiveDna(userId));

  let config = planStickerFromPayload(raw, dna);
  const parentJobId = typeof raw.parentJobId === 'string' ? raw.parentJobId : undefined;
  if (parentJobId) {
    const parent = await getSticker(parentJobId, userId);
    if (!parent) throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Sticker nicht gefunden');
    const parentConfig = parent.config ?? configFromJob(parent);
    const request = typeof raw.request === 'string' ? raw.request : typeof raw.message === 'string' ? raw.message : '';
    config = request ? applyStickerChangeRequest(parentConfig, request) : { ...parentConfig };
    const convertTo =
      typeof raw.convertToPlatform === 'string' && raw.convertToPlatform in STICKER_PLATFORM_SPECS
        ? (raw.convertToPlatform as StickerPlatform)
        : undefined;
    if (convertTo) config = applyStickerPlatformPreset(config, convertTo);
    config.summary = buildStickerDesignSummary(config);
  }

  if (config.logoJobId) {
    await requireOwnedLogoJob(userId, config.logoJobId);
  }
  for (const refId of config.referenceAssetIds) {
    await assertOwnedStickerReference(userId, refId);
  }

  const activeDna = dna ?? ephemeralStickerDna(userId, config);
  const studioOptions: StickerGenerationOptions = stickerConfigToGenerationOptions(config);
  const quoteId = typeof raw.quoteId === 'string' ? raw.quoteId : undefined;
  const prompt = buildStickerPrompt(activeDna, studioOptions).slice(0, MAX_STICKER_PROMPT_CHARS + 800);

  assertImageProviderReadyForStudio('sticker');

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.STICKER_GENERATION,
      'Sticker Generierung',
      async () =>
        runGenerationJob(userId, 'sticker', activeDna, prompt, {
          size: stickerProviderSize(),
          hd: true,
          projectId,
          parentJobId,
          quoteId,
          width: config.width,
          height: config.height,
          mimeType: config.format === 'jpg' ? 'image/jpeg' : config.format === 'webp' ? 'image/webp' : 'image/png',
          transparentBackground: config.transparentBackground,
          stickerConfig: config,
          creatorName: activeDna.name,
          downloadName: stickerDownloadFilename({
            creatorName: activeDna.name,
            platform: config.platform,
            kind: config.kind,
            text: config.text,
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

export async function stickerProjectAssets(userId: string, projectId: string) {
  const project = await getProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  return (project.assets ?? []).filter((a) => a.module === 'sticker' || a.type === 'sticker' || a.type === 'badge');
}
