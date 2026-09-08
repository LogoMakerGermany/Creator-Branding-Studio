import {
  CoinSpendCategory,
  applyOverlayChangeRequest,
  applyOverlayLayoutPreset,
  applyOverlayPlatformPreset,
  overlayConfigFromDna,
  overlayConfigToGenerationOptions,
  overlayDownloadFilename,
  overlayProviderSize,
  buildOverlayDesignSummary,
  defaultOverlayConfig,
  parseOverlayIntent,
  validateOverlayDimensions,
  validateOverlayFormat,
  validateOverlayRegion,
  validateOverlayRegions,
  OVERLAY_PLATFORM_SPECS,
  OVERLAY_REFERENCE_MIMES,
  OVERLAY_LAYOUT_PRESETS,
  OVERLAY_LOGO_POSITIONS,
  OVERLAY_BORDER_STYLES,
  MAX_OVERLAY_PROMPT_CHARS,
  MAX_OVERLAY_REFERENCES,
  type OverlayConfig,
  type OverlayGenerationOptions,
  type OverlayPlatform,
  type OverlayLayoutPreset,
  type OverlayLogoPosition,
  type OverlayBorderStyle,
  type OverlayRegion,
  type OverlayType,
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
import { requireOwnedFacecamJob } from './facecam.service.js';
import { buildOverlayPrompt } from './studio-prompt.service.js';
import {
  getJob,
  getJobsByUser,
  runGenerationJob,
  setOverlayTestHooks,
  assertImageProviderReadyForStudio,
  type GenerationJob,
} from './ai.service.js';

export { setOverlayTestHooks };

export interface OverlayJobView extends GenerationJob {
  fileMissing?: boolean;
  config?: OverlayConfig;
  downloadName?: string;
  previewUrl?: string;
  version?: number;
  platform?: OverlayPlatform;
}

function asRecord(payload?: Record<string, unknown>): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload : {};
}

function ephemeralOverlayDna(userId: string, config: OverlayConfig): CreatorDNA {
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
    id: `ephemeral-overlay-${userId}`,
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

export async function assertOwnedOverlayReference(userId: string, fileId: string): Promise<void> {
  const file = await getUserFile(fileId, userId);
  if (!file) {
    throw new ServiceError(403, 'FOREIGN_REFERENCE', 'Referenzbild gehört nicht zu diesem Account');
  }
  if (!OVERLAY_REFERENCE_MIMES.includes(file.mimeType as (typeof OVERLAY_REFERENCE_MIMES)[number])) {
    throw new ServiceError(400, 'INVALID_REFERENCE_MIME', 'Referenzbild muss PNG, JPEG oder WEBP sein');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ServiceError(413, 'REFERENCE_TOO_LARGE', 'Referenzbild ist zu groß');
  }
}

export async function requireOwnedOverlayJob(userId: string, jobId: string): Promise<GenerationJob> {
  const job = await getJob(jobId);
  if (!job || job.userId !== userId || job.module !== 'overlay') {
    throw new ServiceError(404, 'OVERLAY_NOT_FOUND', 'Overlay nicht gefunden');
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

function asLayout(value: unknown): OverlayLayoutPreset | undefined {
  return typeof value === 'string' && OVERLAY_LAYOUT_PRESETS.includes(value as OverlayLayoutPreset)
    ? (value as OverlayLayoutPreset)
    : undefined;
}

function asLogoPos(value: unknown): OverlayLogoPosition | undefined {
  return typeof value === 'string' && OVERLAY_LOGO_POSITIONS.includes(value as OverlayLogoPosition)
    ? (value as OverlayLogoPosition)
    : undefined;
}

function asBorder(value: unknown): OverlayBorderStyle | undefined {
  return typeof value === 'string' && OVERLAY_BORDER_STYLES.includes(value as OverlayBorderStyle)
    ? (value as OverlayBorderStyle)
    : undefined;
}

function parseRegion(raw: unknown, fallback: OverlayRegion): OverlayRegion {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  return {
    visible: typeof r.visible === 'boolean' ? r.visible : fallback.visible,
    x: typeof r.x === 'number' ? r.x : fallback.x,
    y: typeof r.y === 'number' ? r.y : fallback.y,
    width: typeof r.width === 'number' ? r.width : fallback.width,
    height: typeof r.height === 'number' ? r.height : fallback.height,
    transparent: typeof r.transparent === 'boolean' ? r.transparent : fallback.transparent,
  };
}

function planOverlayFromPayload(raw: Record<string, unknown>, dna: CreatorDNA | null): OverlayConfig {
  const dnaDefaults = dna ? overlayConfigFromDna(dna) : {};
  const platformRaw = typeof raw.platform === 'string' ? raw.platform.toLowerCase() : '';
  const platform =
    platformRaw in OVERLAY_PLATFORM_SPECS ? (platformRaw as OverlayPlatform) : dnaDefaults.platform ?? 'twitch';
  let config = defaultOverlayConfig({
    ...dnaDefaults,
    platform,
    style: typeof raw.style === 'string' ? raw.style : dnaDefaults.style,
    motif: typeof raw.motif === 'string' ? raw.motif : dnaDefaults.motif,
    layoutPreset: asLayout(raw.layoutPreset),
    overlayType: typeof raw.overlayType === 'string' ? (raw.overlayType as OverlayType) : undefined,
    logoPosition: asLogoPos(raw.logoPosition),
    borderStyle: asBorder(raw.borderStyle),
    logoJobId:
      typeof raw.sourceLogoJobId === 'string'
        ? raw.sourceLogoJobId
        : typeof raw.logoJobId === 'string'
          ? raw.logoJobId
          : typeof raw.logoAssetId === 'string'
            ? raw.logoAssetId
            : undefined,
    facecamJobId:
      typeof raw.sourceFacecamJobId === 'string'
        ? raw.sourceFacecamJobId
        : typeof raw.facecamJobId === 'string'
          ? raw.facecamJobId
          : typeof raw.facecamAssetId === 'string'
            ? raw.facecamAssetId
            : undefined,
    decorations: typeof raw.decorations === 'string' ? raw.decorations : undefined,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : typeof raw.message === 'string' ? raw.message : undefined,
  });

  if (raw.layoutPreset && asLayout(raw.layoutPreset)) {
    config = applyOverlayLayoutPreset(config, asLayout(raw.layoutPreset)!);
  }

  if (raw.width != null || raw.height != null) {
    const dims = validateOverlayDimensions(raw.width ?? config.width, raw.height ?? config.height);
    if (!dims.ok) {
      throw new ServiceError(400, 'OVERLAY_DIMENSION_INVALID', dims.message);
    }
    config.width = dims.width;
    config.height = dims.height;
    if (raw.aspectRatio === 'custom' || (raw.width != null && raw.height != null && raw.aspectRatio === undefined)) {
      config.aspectRatio = 'custom';
    }
  }

  if (raw.gameplayRegion) config.gameplayRegion = parseRegion(raw.gameplayRegion, config.gameplayRegion);
  if (raw.facecamRegion) config.facecamRegion = parseRegion(raw.facecamRegion, config.facecamRegion);
  if (raw.chatRegion) config.chatRegion = parseRegion(raw.chatRegion, config.chatRegion);
  if (raw.alertRegion) config.alertRegion = parseRegion(raw.alertRegion, config.alertRegion);
  const explicitCustomRegions =
    Boolean(raw.gameplayRegion || raw.facecamRegion || raw.chatRegion || raw.alertRegion) &&
    !asLayout(raw.layoutPreset);
  if (explicitCustomRegions || asLayout(raw.layoutPreset) === 'custom') {
    config.layoutPreset = 'custom';
  }

  const regions = validateOverlayRegions(config);
  if (!regions.ok) {
    throw new ServiceError(400, 'OVERLAY_REGION_INVALID', regions.message);
  }

  const transparent =
    typeof raw.transparentBackground === 'boolean' ? raw.transparentBackground : config.transparentBackground;
  const anyHole =
    (config.gameplayRegion.visible && config.gameplayRegion.transparent) ||
    (config.facecamRegion.visible && config.facecamRegion.transparent) ||
    (config.chatRegion.visible && config.chatRegion.transparent);
  const fmt = validateOverlayFormat(raw.format ?? raw.outputFormat ?? config.format, transparent || anyHole);
  if (!fmt.ok) {
    throw new ServiceError(400, 'OVERLAY_FORMAT_INVALID', fmt.message);
  }
  config.format = fmt.format;
  config.transparentBackground = transparent;
  if (config.format === 'jpg') {
    config.transparentBackground = false;
    config.gameplayRegion = { ...config.gameplayRegion, transparent: false };
    config.facecamRegion = { ...config.facecamRegion, transparent: false };
    config.chatRegion = { ...config.chatRegion, transparent: false };
  }

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
  if (refs.length > MAX_OVERLAY_REFERENCES) {
    throw new ServiceError(400, 'TOO_MANY_REFERENCES', `Maximal ${MAX_OVERLAY_REFERENCES} Referenzbilder`);
  }
  config.referenceAssetIds = refs.slice(0, MAX_OVERLAY_REFERENCES);
  if (config.prompt && config.prompt.length > MAX_OVERLAY_PROMPT_CHARS) {
    config.prompt = config.prompt.slice(0, MAX_OVERLAY_PROMPT_CHARS);
  }

  const convertTo =
    typeof raw.convertToPlatform === 'string' && raw.convertToPlatform in OVERLAY_PLATFORM_SPECS
      ? (raw.convertToPlatform as OverlayPlatform)
      : undefined;
  if (convertTo) {
    config = applyOverlayPlatformPreset(config, convertTo);
  }

  config.summary = buildOverlayDesignSummary(config);
  return config;
}

function configFromJob(job: GenerationJob): OverlayConfig {
  const meta = (job.metadata ?? {}) as Record<string, unknown>;
  try {
    return planOverlayFromPayload(
      { ...meta, width: job.width, height: job.height, platform: meta.platform, format: meta.format },
      null
    );
  } catch {
    return defaultOverlayConfig({
      width: typeof job.width === 'number' ? job.width : undefined,
      height: typeof job.height === 'number' ? job.height : undefined,
      platform:
        typeof meta.platform === 'string' && meta.platform in OVERLAY_PLATFORM_SPECS
          ? (meta.platform as OverlayPlatform)
          : 'twitch',
    });
  }
}

export async function listOverlay(userId: string): Promise<OverlayJobView[]> {
  const jobs = (await getJobsByUser(userId)).filter((j) => j.module === 'overlay');
  return Promise.all(jobs.map((j) => hydrateOverlayJob(j, userId)));
}

export async function getOverlay(id: string, userId: string): Promise<OverlayJobView | null> {
  const job = await getJob(id);
  if (!job || job.userId !== userId || job.module !== 'overlay') return null;
  return hydrateOverlayJob(job, userId);
}

export async function hydrateOverlayJob(job: GenerationJob, userId: string): Promise<OverlayJobView> {
  const config = configFromJob(job);
  const next: OverlayJobView = { ...job, config, platform: config.platform };
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  const versions = await getVersionsForJob(job.parentJobId || job.id, userId).catch(() => []);
  const version = versions.length || (typeof job.metadata?.version === 'number' ? job.metadata.version : 1);
  next.version = version;
  next.downloadName = overlayDownloadFilename({
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

export async function downloadOverlay(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }> {
  const job = await getOverlay(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Overlay nicht gefunden');
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Overlay-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return {
    downloadUrl: issued.downloadUrl,
    expiresAt: issued.expiresAt,
    fileId,
    filename: job.downloadName || 'overlay.png',
  };
}

export async function listOverlayVersions(jobId: string, userId: string) {
  const job = await getOverlay(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Overlay nicht gefunden');
  const rootId = job.parentJobId || jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export async function retryOverlayJob(jobId: string, userId: string): Promise<never> {
  const job = await getOverlay(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Overlay nicht gefunden');
  if (job.status !== 'failed') {
    throw new ServiceError(409, 'JOB_NOT_RETRYABLE', 'Nur fehlgeschlagene Jobs können wiederholt werden');
  }
  throw new ServiceError(
    402,
    'OVERLAY_REQUIRES_QUOTE',
    'Nach einem endgültigen Fehlschlag und Refund braucht der nächste Versuch ein neues Angebot.'
  );
}

export async function generateOverlayAsset(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: GenerationJob; coinsSpent: number; newBalance: number }> {
  const raw = asRecord(payload);
  rejectExternalUrls(raw);

  const { dna: resolved } = await resolveDnaForRequest(userId, projectId);
  const dna = resolved ?? (await getActiveDna(userId));

  let config = planOverlayFromPayload(raw, dna);
  const parentJobId = typeof raw.parentJobId === 'string' ? raw.parentJobId : undefined;
  if (parentJobId) {
    const parent = await getOverlay(parentJobId, userId);
    if (!parent) throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Overlay nicht gefunden');
    const parentConfig = parent.config ?? configFromJob(parent);
    const request = typeof raw.request === 'string' ? raw.request : typeof raw.message === 'string' ? raw.message : '';
    const convertTo =
      typeof raw.convertToPlatform === 'string' && raw.convertToPlatform in OVERLAY_PLATFORM_SPECS
        ? (raw.convertToPlatform as OverlayPlatform)
        : parseOverlayIntent(request).convertToPlatform;
    config = request ? applyOverlayChangeRequest(parentConfig, request) : { ...parentConfig };
    if (convertTo) config = applyOverlayPlatformPreset(config, convertTo);
    const regions = validateOverlayRegions(config);
    if (!regions.ok) throw new ServiceError(400, 'OVERLAY_REGION_INVALID', regions.message);
    config.summary = buildOverlayDesignSummary(config);
  }

  if (config.logoJobId) {
    await requireOwnedLogoJob(userId, config.logoJobId);
  }
  if (config.facecamJobId) {
    await requireOwnedFacecamJob(userId, config.facecamJobId);
  }
  for (const refId of config.referenceAssetIds) {
    await assertOwnedOverlayReference(userId, refId);
  }

  const activeDna = dna ?? ephemeralOverlayDna(userId, config);
  const studioOptions: OverlayGenerationOptions = overlayConfigToGenerationOptions(config);
  const quoteId = typeof raw.quoteId === 'string' ? raw.quoteId : undefined;
  const prompt = buildOverlayPrompt(activeDna, {
    ...studioOptions,
  }).slice(0, MAX_OVERLAY_PROMPT_CHARS + 800);

  assertImageProviderReadyForStudio('overlay');

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.OVERLAY_GENERATION,
      'Overlay Generierung',
      async () =>
        runGenerationJob(userId, 'overlay', activeDna, prompt, {
          size: overlayProviderSize(config.width, config.height),
          hd: true,
          projectId,
          parentJobId,
          quoteId,
          width: config.width,
          height: config.height,
          mimeType:
            config.format === 'jpg' ? 'image/jpeg' : config.format === 'webp' ? 'image/webp' : 'image/png',
          transparentBackground: config.transparentBackground || config.gameplayRegion.transparent,
          overlayConfig: config,
          creatorName: activeDna.name,
          downloadName: overlayDownloadFilename({
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

export async function overlayProjectAssets(userId: string, projectId: string) {
  const project = await getProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  return (project.assets ?? []).filter((a) => a.module === 'overlay' || a.type === 'overlay');
}

export { validateOverlayRegion };
