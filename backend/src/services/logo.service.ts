import {
  CoinSpendCategory,
  applyLockedDnaToGeneration,
  applyLogoChangeRequest,
  buildLogoDesignSummary,
  buildLogoPrompt,
  defaultLogoConfig,
  logoConfigFromDna,
  logoConfigFromGenerationOptions,
  logoConfigToGenerationOptions,
  logoDownloadFilename,
  logoProviderSize,
  parseLogoIntent,
  sanitizeLogoStyleRequest,
  validateLogoDimensions,
  validateLogoFormat,
  LOGO_REFERENCE_MIMES,
  MAX_LOGO_PROMPT_CHARS,
  MAX_LOGO_REFERENCES,
  type CreatorDNA,
  type LogoConfig,
  type LogoGenerationOptions,
  type StyleDirection,
} from '@ucbs/shared';
import { withCoinCharge } from '../lib/billable-job.js';
import { ServiceError } from '../lib/errors.js';
import { MAX_UPLOAD_BYTES } from '../lib/upload-validation.js';
import { AppError } from '../middleware/errorHandler.js';
import { resolveDnaForRequest, getActiveDna, upsertDna, updateDna } from './dna.service.js';
import { getUserFile, issueFileDownloadUrl } from './file-cloud.service.js';
import { getVersionsForJob } from './change-request.service.js';
import {
  getJob,
  getJobsByUser,
  runGenerationJob,
  setLogoTestHooks,
  assertImageProviderReadyForStudio,
  type GenerationJob,
} from './ai.service.js';

export { setLogoTestHooks };

export interface LogoJobView extends GenerationJob {
  fileMissing?: boolean;
  config?: LogoConfig;
  downloadName?: string;
  previewUrl?: string;
  version?: number;
}

function asRecord(payload?: Record<string, unknown>): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload : {};
}

function ephemeralLogoDna(userId: string, config: LogoConfig): CreatorDNA {
  const now = new Date().toISOString();
  const style = (config.style || config.magikStyle || 'gaming').toLowerCase();
  const styleDirection = (
    ['gaming', 'streaming', 'esports', 'minimal', 'cinematic', 'neon', 'anime', 'cyberpunk', 'clean', 'cartoon'].includes(
      style
    )
      ? style
      : 'gaming'
  ) as StyleDirection;
  return {
    id: `ephemeral-logo-${userId}`,
    userId,
    name: config.name,
    type: 'creator',
    primaryColors: config.primaryColors,
    secondaryColors: config.secondaryColors,
    accentColors: [],
    styleDirection,
    favoriteGenres: config.game ? [config.game] : [],
    gamingStyle: '',
    brandingStyle: config.style || config.magikStyle || '',
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
      platforms: config.platform && config.platform !== 'general' ? [config.platform] : [],
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

export async function assertOwnedLogoReference(userId: string, fileId: string): Promise<void> {
  const file = await getUserFile(fileId, userId);
  if (!file) {
    throw new ServiceError(403, 'FOREIGN_REFERENCE', 'Referenzbild gehört nicht zu diesem Account');
  }
  if (!LOGO_REFERENCE_MIMES.includes(file.mimeType as (typeof LOGO_REFERENCE_MIMES)[number])) {
    throw new ServiceError(400, 'INVALID_REFERENCE_MIME', 'Referenzbild muss PNG, JPEG oder WEBP sein');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ServiceError(413, 'REFERENCE_TOO_LARGE', 'Referenzbild ist zu groß');
  }
}

function rejectExternalUrls(payload: Record<string, unknown>): void {
  const suspects = [payload.referenceUrl, payload.imageUrl, payload.logoBackgroundUpload, payload.designUrl];
  for (const value of suspects) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
      throw new ServiceError(400, 'NO_EXTERNAL_URL', 'Externe Bild-URLs werden nicht als Provider-Input akzeptiert');
    }
  }
}

export function planLogoFromPayload(payload?: Record<string, unknown>, dna?: CreatorDNA | null): LogoConfig {
  const raw = asRecord(payload);
  rejectExternalUrls(raw);
  const message = typeof raw.message === 'string' ? sanitizeLogoStyleRequest(raw.message) : '';
  const parsed = parseLogoIntent(message, {
    dnaName: dna?.name,
    primaryColors: dna?.primaryColors,
    styleDirection: dna?.styleDirection,
    mascot: dna?.mascot,
  });
  const dnaDefaults = dna ? logoConfigFromDna(dna) : {};
  const config = defaultLogoConfig({
    ...dnaDefaults,
    ...parsed.config,
    name:
      (typeof raw.logoName === 'string' && raw.logoName.trim()) ||
      (typeof raw.name === 'string' && raw.name.trim()) ||
      parsed.config.name ||
      dnaDefaults.name ||
      '',
    primaryColors: Array.isArray(raw.primaryColors)
      ? (raw.primaryColors as string[]).filter((c) => typeof c === 'string')
      : parsed.config.primaryColors,
    secondaryColors: Array.isArray(raw.secondaryColors)
      ? (raw.secondaryColors as string[]).filter((c) => typeof c === 'string')
      : parsed.config.secondaryColors,
    magikStyle: typeof raw.magikStyle === 'string' ? raw.magikStyle : parsed.config.magikStyle,
    magikLogoArt:
      raw.magikLogoArt === '2d' ||
      raw.magikLogoArt === '3d' ||
      raw.magikLogoArt === 'ultra-3d' ||
      raw.magikLogoArt === 'ultra-cinematic-3d'
        ? raw.magikLogoArt
        : parsed.config.magikLogoArt,
    magikMode: raw.magikMode === 'character' || raw.magikMode === 'name' ? raw.magikMode : parsed.config.magikMode,
    magikCharacter: typeof raw.magikCharacter === 'string' ? raw.magikCharacter : parsed.config.magikCharacter,
    platform:
      raw.platform === 'twitch' ||
      raw.platform === 'tiktok' ||
      raw.platform === 'youtube' ||
      raw.platform === 'discord' ||
      raw.platform === 'general'
        ? raw.platform
        : parsed.config.platform,
    shape: raw.shape === 'free' || raw.shape === 'ring' || raw.shape === 'badge' ? raw.shape : parsed.config.shape,
    game: typeof raw.game === 'string' ? raw.game : parsed.config.game,
    subject: typeof raw.subject === 'string' ? raw.subject : parsed.config.subject,
    prompt:
      typeof raw.customPromptOverride === 'string'
        ? sanitizeLogoStyleRequest(raw.customPromptOverride)
        : parsed.config.prompt,
  });

  const dims = validateLogoDimensions(raw.width ?? parsed.config.width, raw.height ?? parsed.config.height);
  if (!dims.ok) {
    throw new ServiceError(400, 'LOGO_DIMENSION_INVALID', dims.message);
  }
  config.width = dims.width;
  config.height = dims.height;

  const transparent =
    typeof raw.transparentBackground === 'boolean' ? raw.transparentBackground : config.transparentBackground;
  const fmt = validateLogoFormat(raw.outputFormat ?? config.outputFormat, transparent);
  if (!fmt.ok) {
    throw new ServiceError(400, 'LOGO_FORMAT_INVALID', fmt.message);
  }
  config.outputFormat = fmt.format;
  config.transparentBackground = transparent;
  config.backgroundMode = transparent ? 'transparent' : 'dark';

  const refs: string[] = [];
  if (typeof raw.referenceFileId === 'string' && raw.referenceFileId.trim()) refs.push(raw.referenceFileId.trim());
  if (Array.isArray(raw.referenceFileIds)) {
    for (const id of raw.referenceFileIds) {
      if (typeof id === 'string' && id.trim()) refs.push(id.trim());
    }
  }
  if (refs.length > MAX_LOGO_REFERENCES) {
    throw new ServiceError(400, 'TOO_MANY_REFERENCES', `Maximal ${MAX_LOGO_REFERENCES} Referenzbild`);
  }
  config.referenceFileIds = refs.slice(0, MAX_LOGO_REFERENCES);
  if (config.prompt && config.prompt.length > MAX_LOGO_PROMPT_CHARS) {
    config.prompt = config.prompt.slice(0, MAX_LOGO_PROMPT_CHARS);
  }
  config.summary = buildLogoDesignSummary(config);
  return config;
}

function configFromJob(job: GenerationJob): LogoConfig {
  const meta = (job.metadata ?? {}) as Record<string, unknown>;
  try {
    return planLogoFromPayload({ ...meta, width: job.width, height: job.height });
  } catch {
    return defaultLogoConfig({
      name: typeof meta.logoName === 'string' ? meta.logoName : '',
      width: typeof job.width === 'number' ? job.width : undefined,
      height: typeof job.height === 'number' ? job.height : undefined,
    });
  }
}

export async function listLogo(userId: string): Promise<LogoJobView[]> {
  const jobs = (await getJobsByUser(userId)).filter((j) => j.module === 'logo');
  return Promise.all(jobs.map((j) => hydrateLogoJob(j, userId)));
}

export async function getLogo(id: string, userId: string): Promise<LogoJobView | null> {
  const job = await getJob(id);
  if (!job || job.userId !== userId || job.module !== 'logo') return null;
  return hydrateLogoJob(job, userId);
}

export async function hydrateLogoJob(job: GenerationJob, userId: string): Promise<LogoJobView> {
  const config = configFromJob(job);
  const next: LogoJobView = { ...job, config };
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  const versions = await getVersionsForJob(job.parentJobId || job.id, userId).catch(() => []);
  const version = versions.length || (typeof job.metadata?.version === 'number' ? job.metadata.version : 1);
  next.version = version;
  next.downloadName = logoDownloadFilename({
    creatorName: typeof job.metadata?.creatorName === 'string' ? job.metadata.creatorName : config.name || 'creator',
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

export async function downloadLogo(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }> {
  const job = await getLogo(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Logo nicht gefunden');
  const fileId = job.fileId || (typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined);
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Logo-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return {
    downloadUrl: issued.downloadUrl,
    expiresAt: issued.expiresAt,
    fileId,
    filename: job.downloadName || 'logo.png',
  };
}

export async function listLogoVersions(jobId: string, userId: string) {
  const job = await getLogo(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Logo nicht gefunden');
  const rootId = job.parentJobId || jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export async function retryLogoJob(jobId: string, userId: string): Promise<never> {
  const job = await getLogo(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Logo nicht gefunden');
  if (job.status !== 'failed') {
    throw new ServiceError(409, 'JOB_NOT_RETRYABLE', 'Nur fehlgeschlagene Jobs können wiederholt werden');
  }
  throw new ServiceError(
    402,
    'LOGO_REQUIRES_QUOTE',
    'Nach einem endgültigen Fehlschlag und Refund braucht der nächste Versuch ein neues Angebot.'
  );
}

export async function applyLogoToCreatorDna(
  jobId: string,
  userId: string,
  input: { confirm?: boolean }
): Promise<CreatorDNA> {
  if (!input.confirm) {
    throw new ServiceError(
      400,
      'DNA_CONFIRM_REQUIRED',
      'Creator DNA wird nur nach ausdrücklicher Bestätigung aus dem Logo übernommen.'
    );
  }
  const job = await getLogo(jobId, userId);
  if (!job || job.status !== 'completed') {
    throw new ServiceError(404, 'NOT_FOUND', 'Kein abgeschlossenes eigenes Logo');
  }
  const config = job.config ?? configFromJob(job);
  const existing = await getActiveDna(userId);
  const sourceAssets = [
    ...(existing?.sourceAssets ?? []).filter((a) => a.type !== 'logo'),
    {
      id: job.id,
      type: 'logo' as const,
      url: job.fileId ? `file:${job.fileId}` : job.imageUrl || '',
      fileId: job.fileId,
      analyzedAt: new Date().toISOString(),
    },
  ];
  if (existing) {
    return updateDna(
      existing.id,
      userId,
      {
        name: config.name || existing.name,
        primaryColors: config.primaryColors.length ? config.primaryColors : existing.primaryColors,
        secondaryColors: config.secondaryColors.length ? config.secondaryColors : existing.secondaryColors,
        mascot: config.subject || existing.mascot,
        brandingStyle: config.magikStyle || config.style || existing.brandingStyle,
        sourceAssets,
      },
      'Logo als Creator-DNA-Basis übernommen'
    );
  }
  return upsertDna({
    userId,
    name: config.name || 'Creator',
    primaryColors: config.primaryColors,
    secondaryColors: config.secondaryColors,
    mascot: config.subject,
    brandingStyle: config.magikStyle || config.style,
    sourceAssets,
  });
}

export async function generateLogoAsset(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: GenerationJob; coinsSpent: number; newBalance: number }> {
  const raw = asRecord(payload);
  rejectExternalUrls(raw);
  if (typeof raw.logoBackgroundUpload === 'string' && raw.logoBackgroundUpload.startsWith('data:')) {
    throw new ServiceError(
      400,
      'REFERENCE_MUST_BE_FILE',
      'Referenzbilder zuerst hochladen. Nur eigene File-IDs werden akzeptiert.'
    );
  }

  const { dna: resolved } = await resolveDnaForRequest(userId, projectId);
  const dna = resolved ?? (await getActiveDna(userId));

  let config = planLogoFromPayload(raw, dna);
  const parentJobId = typeof raw.parentJobId === 'string' ? raw.parentJobId : undefined;
  if (parentJobId) {
    const parent = await getLogo(parentJobId, userId);
    if (!parent) throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Logo nicht gefunden');
    const parentConfig = parent.config ?? configFromJob(parent);
    const request = typeof raw.request === 'string' ? raw.request : typeof raw.message === 'string' ? raw.message : '';
    config = request
      ? applyLogoChangeRequest(parentConfig, request)
      : { ...parentConfig, summary: buildLogoDesignSummary(parentConfig) };
  }

  if (!config.name.trim()) {
    throw new ServiceError(400, 'LOGO_NAME_REQUIRED', 'Für ein Logo brauche ich mindestens den Namen');
  }

  for (const refId of config.referenceFileIds) {
    await assertOwnedLogoReference(userId, refId);
  }

  const activeDna = dna ?? ephemeralLogoDna(userId, config);
  const studioOptions = applyLockedDnaToGeneration(activeDna, logoConfigToGenerationOptions(config));
  const quoteId = typeof raw.quoteId === 'string' ? raw.quoteId : undefined;
  const rightsSafe =
    typeof raw.rightsSafePrompt === 'string' && raw.rightsSafePrompt.trim() ? raw.rightsSafePrompt.trim() : '';
  const prompt = `${buildLogoPrompt(activeDna, {
    ...studioOptions,
    customPromptOverride: config.prompt || studioOptions.customPromptOverride,
  })}${rightsSafe ? `\n${rightsSafe}` : ''}`.slice(0, MAX_LOGO_PROMPT_CHARS + 800);

  assertImageProviderReadyForStudio('logo');

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.LOGO_GENERATION,
      'Logo Generierung',
      async () =>
        runGenerationJob(userId, 'logo', activeDna, prompt, {
          size: logoProviderSize(config.width, config.height),
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
          logoConfig: config,
          creatorName: activeDna.name,
          downloadName: logoDownloadFilename({
            creatorName: activeDna.name,
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

export function studioOptionsFromLogoConfig(config: LogoConfig): LogoGenerationOptions {
  return logoConfigToGenerationOptions(config);
}

export function logoConfigFromStudioOptions(
  opts: LogoGenerationOptions,
  extras?: Partial<LogoConfig>
): LogoConfig {
  return logoConfigFromGenerationOptions(opts, extras);
}
