import {
  CoinSpendCategory,
  applyBannerChangeRequest,
  applyBannerPlatformPreset,
  bannerConfigFromDna,
  bannerConfigFromGenerationOptions,
  bannerConfigToGenerationOptions,
  bannerDownloadFilename,
  bannerProviderSize,
  buildBannerDesignSummary,
  defaultBannerConfig,
  parseBannerIntent,
  validateBannerDimensions,
  validateBannerFormat,
  BANNER_PLATFORM_SPECS,
  BANNER_REFERENCE_MIMES,
  MAX_BANNER_PROMPT_CHARS,
  MAX_BANNER_REFERENCES,
  type BannerConfig,
  type BannerGenerationOptions,
  type BannerPlatform,
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
import { buildBannerPrompt } from './studio-prompt.service.js';
import {
  getJob,
  getJobsByUser,
  runGenerationJob,
  setBannerTestHooks,
  assertImageProviderReadyForStudio,
  type GenerationJob,
} from './ai.service.js';

export { setBannerTestHooks };

export interface BannerJobView extends GenerationJob {
  fileMissing?: boolean;
  config?: BannerConfig;
  downloadName?: string;
  previewUrl?: string;
  version?: number;
  platform?: BannerPlatform;
}

function asRecord(payload?: Record<string, unknown>): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload : {};
}

function ephemeralBannerDna(userId: string, config: BannerConfig): CreatorDNA {
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
    id: `ephemeral-banner-${userId}`,
    userId,
    name: config.title || 'Creator',
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

export async function assertOwnedBannerReference(userId: string, fileId: string): Promise<void> {
  const file = await getUserFile(fileId, userId);
  if (!file) {
    throw new ServiceError(403, 'FOREIGN_REFERENCE', 'Referenzbild gehört nicht zu diesem Account');
  }
  if (!BANNER_REFERENCE_MIMES.includes(file.mimeType as (typeof BANNER_REFERENCE_MIMES)[number])) {
    throw new ServiceError(400, 'INVALID_REFERENCE_MIME', 'Referenzbild muss PNG, JPEG oder WEBP sein');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ServiceError(413, 'REFERENCE_TOO_LARGE', 'Referenzbild ist zu groß');
  }
}

export async function requireOwnedBannerJob(userId: string, jobId: string): Promise<GenerationJob> {
  const job = await getJob(jobId);
  if (!job || job.userId !== userId || job.module !== 'banner') {
    throw new ServiceError(404, 'BANNER_NOT_FOUND', 'Banner nicht gefunden');
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

function planBannerFromPayload(raw: Record<string, unknown>, dna: CreatorDNA | null): BannerConfig {
  const dnaDefaults = dna ? bannerConfigFromDna(dna) : {};
  const platformRaw = typeof raw.platform === 'string' ? raw.platform.toLowerCase() : '';
  const platform =
    platformRaw in BANNER_PLATFORM_SPECS ? (platformRaw as BannerPlatform) : dnaDefaults.platform ?? 'twitch';
  let config = defaultBannerConfig({
    ...dnaDefaults,
    platform,
    title:
      (typeof raw.title === 'string' && raw.title.trim()) ||
      (typeof raw.name === 'string' && raw.name.trim()) ||
      dnaDefaults.title ||
      '',
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : dnaDefaults.subtitle,
    style: typeof raw.style === 'string' ? raw.style : dnaDefaults.style,
    motif: typeof raw.motif === 'string' ? raw.motif : dnaDefaults.motif,
    logoPosition:
      raw.logoPosition === 'left' || raw.logoPosition === 'center' || raw.logoPosition === 'right'
        ? raw.logoPosition
        : undefined,
    textPosition:
      raw.textPosition === 'left' || raw.textPosition === 'center' || raw.textPosition === 'right'
        ? raw.textPosition
        : undefined,
    logoJobId: typeof raw.sourceLogoJobId === 'string' ? raw.sourceLogoJobId : typeof raw.logoJobId === 'string' ? raw.logoJobId : undefined,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : typeof raw.message === 'string' ? raw.message : undefined,
  });

  if (raw.width != null || raw.height != null) {
    const dims = validateBannerDimensions(raw.width ?? config.width, raw.height ?? config.height);
    if (!dims.ok) {
      throw new ServiceError(400, 'BANNER_DIMENSION_INVALID', dims.message);
    }
    config.width = dims.width;
    config.height = dims.height;
  }

  const transparent = typeof raw.transparentBackground === 'boolean' ? raw.transparentBackground : config.transparentBackground;
  const fmt = validateBannerFormat(raw.outputFormat ?? config.outputFormat, transparent);
  if (!fmt.ok) {
    throw new ServiceError(400, 'BANNER_FORMAT_INVALID', fmt.message);
  }
  config.outputFormat = fmt.format;
  config.transparentBackground = transparent;
  config.backgroundMode = transparent ? 'transparent' : 'opaque';

  const refs: string[] = [];
  if (typeof raw.referenceFileId === 'string' && raw.referenceFileId.trim()) refs.push(raw.referenceFileId.trim());
  if (Array.isArray(raw.referenceFileIds)) {
    for (const id of raw.referenceFileIds) {
      if (typeof id === 'string' && id.trim()) refs.push(id.trim());
    }
  }
  if (refs.length > MAX_BANNER_REFERENCES) {
    throw new ServiceError(400, 'TOO_MANY_REFERENCES', `Maximal ${MAX_BANNER_REFERENCES} Referenzbilder`);
  }
  config.referenceFileIds = refs.slice(0, MAX_BANNER_REFERENCES);
  if (config.prompt && config.prompt.length > MAX_BANNER_PROMPT_CHARS) {
    config.prompt = config.prompt.slice(0, MAX_BANNER_PROMPT_CHARS);
  }

  const convertTo =
    typeof raw.convertToPlatform === 'string' && raw.convertToPlatform in BANNER_PLATFORM_SPECS
      ? (raw.convertToPlatform as BannerPlatform)
      : undefined;
  if (convertTo) {
    config = applyBannerPlatformPreset(config, convertTo);
  }

  config.summary = buildBannerDesignSummary(config);
  return config;
}

function configFromJob(job: GenerationJob): BannerConfig {
  const meta = (job.metadata ?? {}) as Record<string, unknown>;
  try {
    return planBannerFromPayload({ ...meta, width: job.width, height: job.height, platform: meta.platform }, null);
  } catch {
    return defaultBannerConfig({
      title: typeof meta.title === 'string' ? meta.title : '',
      width: typeof job.width === 'number' ? job.width : undefined,
      height: typeof job.height === 'number' ? job.height : undefined,
      platform: typeof meta.platform === 'string' && meta.platform in BANNER_PLATFORM_SPECS ? (meta.platform as BannerPlatform) : 'twitch',
    });
  }
}

export async function listBanner(userId: string): Promise<BannerJobView[]> {
  const jobs = (await getJobsByUser(userId)).filter((j) => j.module === 'banner');
  return Promise.all(jobs.map((j) => hydrateBannerJob(j, userId)));
}

export async function getBanner(id: string, userId: string): Promise<BannerJobView | null> {
  const job = await getJob(id);
  if (!job || job.userId !== userId || job.module !== 'banner') return null;
  return hydrateBannerJob(job, userId);
}

export async function hydrateBannerJob(job: GenerationJob, userId: string): Promise<BannerJobView> {
  const config = configFromJob(job);
  const next: BannerJobView = { ...job, config, platform: config.platform };
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  const versions = await getVersionsForJob(job.parentJobId || job.id, userId).catch(() => []);
  const version = versions.length || (typeof job.metadata?.version === 'number' ? job.metadata.version : 1);
  next.version = version;
  next.downloadName = bannerDownloadFilename({
    creatorName: typeof job.metadata?.creatorName === 'string' ? job.metadata.creatorName : config.title || 'creator',
    platform: config.platform,
    version,
    ext: config.outputFormat === 'jpg' ? 'jpg' : config.outputFormat === 'webp' ? 'webp' : 'png',
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

export async function downloadBanner(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }> {
  const job = await getBanner(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Banner nicht gefunden');
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Banner-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return {
    downloadUrl: issued.downloadUrl,
    expiresAt: issued.expiresAt,
    fileId,
    filename: job.downloadName || 'banner.png',
  };
}

export async function listBannerVersions(jobId: string, userId: string) {
  const job = await getBanner(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Banner nicht gefunden');
  const rootId = job.parentJobId || jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export async function retryBannerJob(jobId: string, userId: string): Promise<never> {
  const job = await getBanner(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Banner nicht gefunden');
  if (job.status !== 'failed') {
    throw new ServiceError(409, 'JOB_NOT_RETRYABLE', 'Nur fehlgeschlagene Jobs können wiederholt werden');
  }
  throw new ServiceError(
    402,
    'BANNER_REQUIRES_QUOTE',
    'Nach einem endgültigen Fehlschlag und Refund braucht der nächste Versuch ein neues Angebot.'
  );
}

export async function generateBannerAsset(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: GenerationJob; coinsSpent: number; newBalance: number }> {
  const raw = asRecord(payload);
  rejectExternalUrls(raw);

  const { dna: resolved } = await resolveDnaForRequest(userId, projectId);
  const dna = resolved ?? (await getActiveDna(userId));

  let config = planBannerFromPayload(raw, dna);
  const parentJobId = typeof raw.parentJobId === 'string' ? raw.parentJobId : undefined;
  if (parentJobId) {
    const parent = await getBanner(parentJobId, userId);
    if (!parent) throw new ServiceError(404, 'NOT_FOUND', 'Ausgangsbanner nicht gefunden');
    const parentConfig = parent.config ?? configFromJob(parent);
    const request = typeof raw.request === 'string' ? raw.request : typeof raw.message === 'string' ? raw.message : '';
    const convertTo =
      typeof raw.convertToPlatform === 'string' && raw.convertToPlatform in BANNER_PLATFORM_SPECS
        ? (raw.convertToPlatform as BannerPlatform)
        : parseBannerIntent(request).convertToPlatform;
    config = request ? applyBannerChangeRequest(parentConfig, request) : { ...parentConfig };
    if (convertTo) config = applyBannerPlatformPreset(config, convertTo);
    config.summary = buildBannerDesignSummary(config);
  }

  if (config.logoJobId) {
    await requireOwnedLogoJob(userId, config.logoJobId);
  }

  for (const refId of config.referenceFileIds) {
    await assertOwnedBannerReference(userId, refId);
  }

  const activeDna = dna ?? ephemeralBannerDna(userId, config);
  const studioOptions: BannerGenerationOptions = bannerConfigToGenerationOptions(config);
  const quoteId = typeof raw.quoteId === 'string' ? raw.quoteId : undefined;
  const prompt = buildBannerPrompt(activeDna, {
    ...studioOptions,
  }).slice(0, MAX_BANNER_PROMPT_CHARS + 800);

  assertImageProviderReadyForStudio('banner');

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.BANNER_GENERATION,
      'Banner Generierung',
      async () =>
        runGenerationJob(userId, 'banner', activeDna, prompt, {
          size: bannerProviderSize(config.width, config.height),
          hd: true,
          projectId,
          parentJobId,
          quoteId,
          width: config.width,
          height: config.height,
          mimeType:
            config.outputFormat === 'jpg'
              ? 'image/jpeg'
              : config.outputFormat === 'webp'
                ? 'image/webp'
                : 'image/png',
          transparentBackground: config.transparentBackground,
          bannerConfig: config,
          creatorName: activeDna.name,
          downloadName: bannerDownloadFilename({
            creatorName: activeDna.name,
            platform: config.platform,
            version: 1,
            ext: config.outputFormat,
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

export async function bannerProjectAssets(userId: string, projectId: string) {
  const project = await getProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  return (project.assets ?? []).filter((a) => a.module === 'banner' || a.type === 'banner');
}

export function studioOptionsFromBannerConfig(config: BannerConfig): BannerGenerationOptions {
  return bannerConfigToGenerationOptions(config);
}
