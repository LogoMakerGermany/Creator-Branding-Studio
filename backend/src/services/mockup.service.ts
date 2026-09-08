import { randomUUID } from 'node:crypto';
import {
  CoinSpendCategory,
  MOCKUP_MODELS,
  MOCKUP_OUTPUT_PX,
  MOCKUP_REFERENCE_MIMES,
  MAX_MOCKUP_PROMPT_CHARS,
  PRODUCT_LABEL,
  applyMockupChangeRequest,
  buildMockupDesignSummary,
  defaultMockupConfig,
  mockupColorHex,
  mockupDownloadFilename,
  mockupPromptComposition,
  mockupPromptConstraints,
  validateMockupDimensions,
  validateMockupFormat,
  validateMockupPlacement,
  validateMockupScale,
  type MockupConfig,
  type MockupGenerateInput,
  type MockupJob,
  type MockupMode,
  type MockupProductCategory,
  type StyleDirection,
  type CreatorDNA,
} from '@ucbs/shared';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { withCoinCharge } from '../lib/billable-job.js';
import { resolveDnaForRequest, getActiveDna } from './dna.service.js';
import { getJob, runGenerationJob, setMockupTestHooks, assertImageProviderReadyForStudio } from './ai.service.js';
import { ServiceError } from '../lib/errors.js';
import { MAX_UPLOAD_BYTES } from '../lib/upload-validation.js';
import { saveGeneratedAsset, getUserFile, issueFileDownloadUrl } from './file-cloud.service.js';
import { getProject } from './project.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { recordJobVersion, getVersionsForJob } from './change-request.service.js';
import { requireOwnedLogoJob } from './streamset.service.js';
import { requireOwnedStickerJob } from './sticker.service.js';
import { requireOwnedBannerJob } from './banner.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { buildMockupPrompt } from './studio-prompt.service.js';

export { setMockupTestHooks };

const COLLECTION = 'mockupJobs';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function productSvg(
  category: MockupProductCategory,
  fill: string,
  designUrl: string,
  scale: number,
  placement: string
): string {
  const s = Math.max(0.4, Math.min(1.4, scale / 100));
  const pos =
    placement === 'corner'
      ? { x: 520, y: 180 }
      : placement === 'wrap'
        ? { x: 400, y: 280 }
        : { x: 400, y: 250 };
  const w = 220 * s;
  const h = 220 * s;

  const body =
    category === 'mug'
      ? `<rect x="250" y="180" width="300" height="320" rx="24" fill="${fill}" stroke="#222" stroke-width="8"/>
         <path d="M550 240 h80 a50 50 0 0 1 0 160 h-80" fill="none" stroke="${fill}" stroke-width="28"/>
         <ellipse cx="400" cy="180" rx="150" ry="28" fill="#ddd"/>`
      : category === 'cap'
        ? `<ellipse cx="400" cy="340" rx="220" ry="90" fill="${fill}"/>
           <path d="M200 340 Q400 80 600 340" fill="${fill}" stroke="#111" stroke-width="6"/>`
        : category === 'phone'
          ? `<rect x="300" y="80" width="200" height="420" rx="36" fill="${fill}" stroke="#111" stroke-width="10"/>
             <rect x="330" y="120" width="140" height="300" rx="8" fill="#111"/>`
          : category === 'poster'
            ? `<rect x="180" y="60" width="440" height="560" fill="${fill}" stroke="#111" stroke-width="12"/>`
            : category === 'hoodie'
              ? `<path d="M220 200 L280 160 L400 140 L520 160 L580 200 L560 280 L520 260 L520 720 L280 720 L280 260 L240 280 Z" fill="${fill}" stroke="#111" stroke-width="8"/>`
              : category === 'tote'
                ? `<path d="M250 240 L290 240 L310 160 L490 160 L510 240 L550 240 L550 700 L250 700 Z" fill="${fill}" stroke="#111" stroke-width="8"/>
           <line x1="310" y1="160" x2="250" y2="240" stroke="#111" stroke-width="8"/>
           <line x1="490" y1="160" x2="550" y2="240" stroke="#111" stroke-width="8"/>`
                : `<path d="M250 160 L550 160 L620 720 L180 720 Z" fill="${fill}" stroke="#111" stroke-width="8"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${MOCKUP_OUTPUT_PX}" height="${MOCKUP_OUTPUT_PX}" viewBox="0 0 ${MOCKUP_OUTPUT_PX} ${MOCKUP_OUTPUT_PX}">
  <rect width="${MOCKUP_OUTPUT_PX}" height="${MOCKUP_OUTPUT_PX}" fill="#1a1a1e"/>
  ${body}
  <image href="${escapeXml(designUrl)}" xlink:href="${escapeXml(designUrl)}" x="${pos.x - w / 2}" y="${pos.y - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

async function embedDesign(designUrl: string): Promise<string> {
  if (designUrl.startsWith('data:')) return designUrl;
  try {
    const res = await fetch(designUrl);
    if (!res.ok) return designUrl;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type')?.split(';')[0] || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return designUrl;
  }
}

export function buildCompositeDataUrl(input: {
  category: MockupProductCategory;
  colorId: string;
  placement: string;
  scalePercent: number;
  designUrl: string;
}): string {
  const svg = productSvg(
    input.category,
    mockupColorHex(input.colorId),
    input.designUrl,
    input.scalePercent,
    input.placement
  );
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function ephemeralMockupDna(userId: string, config: MockupConfig): CreatorDNA {
  const now = new Date().toISOString();
  return {
    id: `ephemeral-mockup-${userId}`,
    userId,
    name: 'Creator',
    type: 'creator',
    primaryColors: [mockupColorHex(config.colorId)],
    secondaryColors: [],
    accentColors: [],
    styleDirection: 'gaming' as StyleDirection,
    favoriteGenres: [],
    gamingStyle: '',
    brandingStyle: 'gaming',
    promptStyle: '',
    visualLanguage: '',
    animations: [],
    personalGuidelines: '',
    fonts: [],
    brandingRules: [],
    platformOptimization: [],
    targetAudience: { ageRange: '', interests: [], platforms: [], tone: '', description: '' },
    designLanguage: { mood: [], keywords: [], visualElements: [], doNotUse: [] },
    sourceAssets: [],
    version: 0,
    isActive: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function assertOwnedMockupSource(
  userId: string,
  input: {
    sourceLogoJobId?: string;
    sourceStickerJobId?: string;
    sourceBannerJobId?: string;
    sourceFileId?: string;
    designUrl?: string;
  }
): Promise<{ designUrl: string; kind: MockupConfig['sourceKind']; sourceId: string }> {
  if (typeof input.designUrl === 'string' && /^https?:\/\//i.test(input.designUrl.trim())) {
    throw new ServiceError(400, 'NO_EXTERNAL_URL', 'Externe Bild-URLs werden nicht als Mockup-Vorlage akzeptiert');
  }

  if (input.sourceLogoJobId) {
    const logo = await requireOwnedLogoJob(userId, input.sourceLogoJobId);
    if (!logo.imageUrl && !logo.fileId) throw new ServiceError(400, 'SOURCE_MISSING', 'Logo hat kein Result');
    const url = logo.fileId ? (await issueFileDownloadUrl(logo.fileId, userId))?.downloadUrl : logo.imageUrl;
    if (!url) throw new ServiceError(400, 'SOURCE_MISSING', 'Logo-Datei fehlt');
    return { designUrl: url, kind: 'logo', sourceId: logo.id };
  }
  if (input.sourceStickerJobId) {
    const sticker = await requireOwnedStickerJob(userId, input.sourceStickerJobId);
    if (!sticker.imageUrl && !sticker.fileId) throw new ServiceError(400, 'SOURCE_MISSING', 'Sticker hat kein Result');
    const url = sticker.fileId ? (await issueFileDownloadUrl(sticker.fileId, userId))?.downloadUrl : sticker.imageUrl;
    if (!url) throw new ServiceError(400, 'SOURCE_MISSING', 'Sticker-Datei fehlt');
    return { designUrl: url, kind: 'sticker', sourceId: sticker.id };
  }
  if (input.sourceBannerJobId) {
    const banner = await requireOwnedBannerJob(userId, input.sourceBannerJobId);
    if (!banner.imageUrl && !banner.fileId) throw new ServiceError(400, 'SOURCE_MISSING', 'Banner hat kein Result');
    const url = banner.fileId ? (await issueFileDownloadUrl(banner.fileId, userId))?.downloadUrl : banner.imageUrl;
    if (!url) throw new ServiceError(400, 'SOURCE_MISSING', 'Banner-Datei fehlt');
    return { designUrl: url, kind: 'banner', sourceId: banner.id };
  }
  if (input.sourceFileId) {
    const file = await getUserFile(input.sourceFileId, userId);
    if (!file) throw new ServiceError(403, 'FOREIGN_REFERENCE', 'Quelldatei gehört nicht zu diesem Account');
    if (!MOCKUP_REFERENCE_MIMES.includes(file.mimeType as (typeof MOCKUP_REFERENCE_MIMES)[number])) {
      throw new ServiceError(400, 'INVALID_REFERENCE_MIME', 'Quelldatei muss PNG, JPEG, WEBP oder SVG sein');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ServiceError(413, 'REFERENCE_TOO_LARGE', 'Quelldatei ist zu groß');
    }
    const issued = await issueFileDownloadUrl(file.id, userId);
    if (!issued) throw new ServiceError(400, 'SOURCE_MISSING', 'Quelldatei fehlt');
    return { designUrl: issued.downloadUrl, kind: 'file', sourceId: file.id };
  }
  if (input.designUrl?.trim().startsWith('data:image/')) {
    return { designUrl: input.designUrl.trim(), kind: 'file', sourceId: 'inline' };
  }

  const { getJobsByUser } = await import('./ai.service.js');
  const jobs = await getJobsByUser(userId);
  const logo = jobs.find((j) => j.module === 'logo' && j.status === 'completed' && (j.imageUrl || j.fileId) && j.userId === userId);
  if (logo) {
    const url = logo.fileId ? (await issueFileDownloadUrl(logo.fileId, userId))?.downloadUrl : logo.imageUrl;
    if (url) return { designUrl: url, kind: 'logo', sourceId: logo.id };
  }
  throw new ServiceError(400, 'NO_DESIGN', 'Wähle zuerst ein eigenes Design / Logo');
}

function planConfig(input: MockupGenerateInput, mode: MockupMode): MockupConfig {
  const scale = validateMockupScale(input.scalePercent);
  if (!scale.ok) throw new ServiceError(400, 'MOCKUP_SCALE_INVALID', scale.message);
  const placement = validateMockupPlacement(input.placement);
  if (!placement.ok) throw new ServiceError(400, 'MOCKUP_PLACEMENT_INVALID', placement.message);
  const fmt = validateMockupFormat(mode === 'local' ? 'svg' : 'png', mode);
  if (!fmt.ok) throw new ServiceError(400, 'MOCKUP_FORMAT_INVALID', fmt.message);
  const dims = validateMockupDimensions(MOCKUP_OUTPUT_PX, MOCKUP_OUTPUT_PX);
  if (!dims.ok) throw new ServiceError(400, 'MOCKUP_DIMENSION_INVALID', dims.message);
  if (!MOCKUP_MODELS[input.category]) {
    throw new ServiceError(400, 'MOCKUP_TYPE_INVALID', 'Unbekannter Mockup-Typ');
  }
  return defaultMockupConfig({
    mode,
    category: input.category,
    colorId: input.colorId,
    modelLabel: input.modelLabel || MOCKUP_MODELS[input.category][0],
    placement: placement.placement,
    scalePercent: scale.scale,
    sourceLogoJobId: input.sourceLogoJobId,
    sourceStickerJobId: input.sourceStickerJobId,
    sourceBannerJobId: input.sourceBannerJobId,
    sourceFileId: input.sourceFileId,
    outputFormat: fmt.format,
    outputWidth: dims.width,
    outputHeight: dims.height,
  });
}

export async function listMockups(userId: string): Promise<MockupJob[]> {
  const rows = await dsList(COLLECTION, { userId, orderBy: 'createdAt', order: 'desc', limit: 40 });
  return Promise.all((rows as unknown as MockupJob[]).map((j) => hydrateMockup(j, userId)));
}

export async function getMockup(id: string, userId: string): Promise<MockupJob | null> {
  const row = await dsGet(COLLECTION, id);
  if (!row || row.userId !== userId) return null;
  return hydrateMockup(row as unknown as MockupJob, userId);
}

export async function requireOwnedMockupJob(userId: string, jobId: string): Promise<MockupJob> {
  const job = await getMockup(jobId, userId);
  if (!job) throw new ServiceError(404, 'MOCKUP_NOT_FOUND', 'Mockup nicht gefunden');
  return job;
}

async function hydrateMockup(job: MockupJob, userId: string): Promise<MockupJob> {
  const mode: MockupMode = job.lifestyle ? 'lifestyle' : job.mode ?? 'local';
  const config =
    job.config ??
    defaultMockupConfig({
      mode,
      category: job.category,
      colorId: job.colorId,
      modelLabel: job.modelLabel,
      placement: job.placement,
      scalePercent: job.scalePercent,
      sourceLogoJobId: job.sourceLogoJobId,
      sourceStickerJobId: job.sourceStickerJobId,
      sourceBannerJobId: job.sourceBannerJobId,
      sourceFileId: job.sourceFileId,
    });
  const next: MockupJob = { ...job, config, mode };
  const versions = await getVersionsForJob(job.parentJobId || job.id, userId).catch(() => []);
  next.version = versions.length || job.version || 1;
  next.downloadName = mockupDownloadFilename({
    creatorName: 'creator',
    sourceKind: config.sourceKind || 'logo',
    category: config.category,
    version: next.version,
    ext: mode === 'local' ? 'svg' : 'png',
  });
  if (job.sourceLogoJobId) {
    const logo = await getJob(job.sourceLogoJobId);
    if (!logo || logo.userId !== userId) next.sourceMissing = true;
  } else if (job.sourceStickerJobId) {
    const sticker = await getJob(job.sourceStickerJobId);
    if (!sticker || sticker.userId !== userId) next.sourceMissing = true;
  } else if (job.sourceBannerJobId) {
    const banner = await getJob(job.sourceBannerJobId);
    if (!banner || banner.userId !== userId) next.sourceMissing = true;
  } else if (job.sourceFileId) {
    const file = await getUserFile(job.sourceFileId, userId);
    if (!file) next.sourceMissing = true;
  }
  if (job.fileId) {
    try {
      const issued = await issueFileDownloadUrl(job.fileId, userId);
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
  } else if (job.status === 'completed' && !job.imageUrl) {
    next.fileMissing = true;
  }
  return next;
}

export async function downloadMockup(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }> {
  const job = await getMockup(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Mockup nicht gefunden');
  const fileId = job.fileId;
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Mockup-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return {
    downloadUrl: issued.downloadUrl,
    expiresAt: issued.expiresAt,
    fileId,
    filename: job.downloadName || 'mockup.svg',
  };
}

export async function listMockupVersions(jobId: string, userId: string) {
  const job = await getMockup(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Mockup nicht gefunden');
  const rootId = job.parentJobId || jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export async function retryMockupJob(jobId: string, userId: string): Promise<never> {
  const job = await getMockup(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Mockup nicht gefunden');
  if (job.status !== 'failed' || !job.lifestyle) {
    throw new ServiceError(409, 'JOB_NOT_RETRYABLE', 'Nur fehlgeschlagene Lifestyle-Jobs können wiederholt werden');
  }
  throw new ServiceError(
    402,
    'MOCKUP_REQUIRES_QUOTE',
    'Nach einem endgültigen Fehlschlag und Refund braucht der nächste Lifestyle-Versuch ein neues Angebot.'
  );
}

async function persistMockupFile(userId: string, job: MockupJob, imageUrl: string, config: MockupConfig) {
  const stored = await saveGeneratedAsset(userId, 'mockup', imageUrl, {
    projectId: job.projectId,
    sourceJobId: job.id,
    name: mockupDownloadFilename({
      creatorName: 'creator',
      sourceKind: config.sourceKind || 'logo',
      category: config.category,
      version: 1,
      ext: config.mode === 'local' ? 'svg' : 'png',
    }),
  });
  job.fileId = stored?.id;
  if (job.designUrl?.startsWith('data:')) {
    job.designUrl = `owned:${config.sourceKind || 'file'}`;
  }
  const durableUrl = stored?.downloadUrl || imageUrl;
  if (job.projectId && durableUrl) {
    await attachAssetToProject(userId, job.projectId, {
      name: `Mockup ${PRODUCT_LABEL[job.category]}`,
      type: 'mockup',
      url: durableUrl,
      jobId: job.id,
      fileId: stored?.id,
      module: 'mockup',
      sourceType: 'mockup',
      sourceId: job.id,
      mimeType: stored?.mimeType ?? (config.mode === 'local' ? 'image/svg+xml' : 'image/png'),
    }).catch(() => undefined);
  }
  const version = await recordJobVersion(
    userId,
    job.parentJobId || job.id,
    stored?.id || durableUrl || job.id,
    job.parentJobId ? 'Variante' : 'Original'
  );
  job.version = version.version;
}

export async function generateCompositeMockup(userId: string, input: MockupGenerateInput): Promise<MockupJob> {
  if (input.lifestyle) {
    throw new ServiceError(
      400,
      'LIFESTYLE_REQUIRES_QUOTE',
      'Lifestyle-AI startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
  }
  let config = planConfig(input, 'local');
  if (input.parentJobId) {
    const parent = await getMockup(input.parentJobId, userId);
    if (!parent) throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Mockup nicht gefunden');
    const parentConfig = parent.config ?? planConfig(parent, parent.lifestyle ? 'lifestyle' : 'local');
    if (parentConfig.mode === 'lifestyle' || parent.lifestyle) {
      throw new ServiceError(
        400,
        'LIFESTYLE_REQUIRES_QUOTE',
        'Lifestyle-Änderungen brauchen ein neues Angebot.'
      );
    }
    config = input.request ? applyMockupChangeRequest(parentConfig, input.request) : { ...parentConfig, mode: 'local' };
    config.summary = buildMockupDesignSummary(config);
  }

  const source = await assertOwnedMockupSource(userId, {
    sourceLogoJobId: input.sourceLogoJobId || config.sourceLogoJobId,
    sourceStickerJobId: input.sourceStickerJobId || config.sourceStickerJobId,
    sourceBannerJobId: input.sourceBannerJobId || config.sourceBannerJobId,
    sourceFileId: input.sourceFileId || config.sourceFileId,
    designUrl: input.designUrl,
  });
  config.sourceKind = source.kind;
  if (source.kind === 'logo') config.sourceLogoJobId = source.sourceId;
  if (source.kind === 'sticker') config.sourceStickerJobId = source.sourceId;
  if (source.kind === 'banner') config.sourceBannerJobId = source.sourceId;
  if (source.kind === 'file' && source.sourceId !== 'inline') config.sourceFileId = source.sourceId;
  config.summary = buildMockupDesignSummary(config);

  const embedded = await embedDesign(source.designUrl);
  const job: MockupJob = {
    id: randomUUID(),
    userId,
    status: 'processing',
    category: config.category,
    colorId: config.colorId,
    modelLabel: config.modelLabel,
    placement: config.placement,
    scalePercent: config.scalePercent,
    designUrl: source.designUrl,
    lifestyle: false,
    mode: 'local',
    projectId: input.projectId,
    parentJobId: input.parentJobId,
    sourceLogoJobId: config.sourceLogoJobId,
    sourceStickerJobId: config.sourceStickerJobId,
    sourceBannerJobId: config.sourceBannerJobId,
    sourceFileId: config.sourceFileId,
    config,
    createdAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, job.id, job as unknown as Record<string, unknown>);

  const imageUrl = buildCompositeDataUrl({
    category: config.category,
    colorId: config.colorId,
    placement: config.placement,
    scalePercent: config.scalePercent,
    designUrl: embedded,
  });
  job.status = 'completed';
  job.provider = 'composite';
  job.completedAt = new Date().toISOString();
  await persistMockupFile(userId, job, imageUrl, config);
  await dsSet(COLLECTION, job.id, job as unknown as Record<string, unknown>);
  return hydrateMockup(job, userId);
}

export async function generateLifestyleMockup(
  userId: string,
  projectId?: string,
  payload?: Record<string, unknown>
): Promise<{ job: MockupJob; coinsSpent: number; newBalance: number }> {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const quoteId = typeof raw.quoteId === 'string' ? raw.quoteId.trim() : '';
  if (!quoteId) {
    throw new ServiceError(
      400,
      'MOCKUP_REQUIRES_QUOTE',
      'Lifestyle-AI startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
  }
  if (typeof raw.designUrl === 'string' && /^https?:\/\//i.test(raw.designUrl.trim())) {
    throw new ServiceError(400, 'NO_EXTERNAL_URL', 'Externe Bild-URLs werden nicht als Mockup-Vorlage akzeptiert');
  }

  const parentJobId = typeof raw.parentJobId === 'string' ? raw.parentJobId : undefined;
  let config = planConfig(
    {
      category: (typeof raw.category === 'string' ? raw.category : 'mug') as MockupProductCategory,
      colorId: typeof raw.colorId === 'string' ? raw.colorId : 'white',
      modelLabel: typeof raw.modelLabel === 'string' ? raw.modelLabel : PRODUCT_LABEL.mug,
      placement: (typeof raw.placement === 'string' ? raw.placement : 'front') as MockupGenerateInput['placement'],
      scalePercent: typeof raw.scalePercent === 'number' ? raw.scalePercent : 100,
      sourceLogoJobId: typeof raw.sourceLogoJobId === 'string' ? raw.sourceLogoJobId : undefined,
      sourceStickerJobId: typeof raw.sourceStickerJobId === 'string' ? raw.sourceStickerJobId : undefined,
      sourceBannerJobId: typeof raw.sourceBannerJobId === 'string' ? raw.sourceBannerJobId : undefined,
      sourceFileId: typeof raw.sourceFileId === 'string' ? raw.sourceFileId : undefined,
      lifestyle: true,
      projectId,
    },
    'lifestyle'
  );
  config.mode = 'lifestyle';
  if (parentJobId) {
    const parent = await getMockup(parentJobId, userId);
    if (!parent) throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Mockup nicht gefunden');
    const parentConfig = parent.config ?? planConfig(parent, 'lifestyle');
    const request = typeof raw.request === 'string' ? raw.request : typeof raw.message === 'string' ? raw.message : '';
    config = request ? applyMockupChangeRequest(parentConfig, request) : { ...parentConfig, mode: 'lifestyle' };
  }
  config.mode = 'lifestyle';
  config.summary = buildMockupDesignSummary(config);

  const source = await assertOwnedMockupSource(userId, {
    sourceLogoJobId: config.sourceLogoJobId,
    sourceStickerJobId: config.sourceStickerJobId,
    sourceBannerJobId: config.sourceBannerJobId,
    sourceFileId: config.sourceFileId,
    designUrl: typeof raw.designUrl === 'string' ? raw.designUrl : undefined,
  });
  config.sourceKind = source.kind;

  const { dna: resolved } = await resolveDnaForRequest(userId, projectId);
  const dna = resolved ?? (await getActiveDna(userId)) ?? ephemeralMockupDna(userId, config);
  const prompt = buildMockupPrompt(dna, config).slice(0, MAX_MOCKUP_PROMPT_CHARS);

  assertImageProviderReadyForStudio('mockup');

  const queued: MockupJob = {
    id: randomUUID(),
    userId,
    status: 'queued',
    category: config.category,
    colorId: config.colorId,
    modelLabel: config.modelLabel,
    placement: config.placement,
    scalePercent: config.scalePercent,
    designUrl: source.designUrl,
    lifestyle: true,
    mode: 'lifestyle',
    projectId,
    parentJobId,
    sourceLogoJobId: config.sourceLogoJobId,
    sourceStickerJobId: config.sourceStickerJobId,
    sourceBannerJobId: config.sourceBannerJobId,
    sourceFileId: config.sourceFileId,
    config,
    createdAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);

  try {
    const result = await withCoinCharge(
      userId,
      CoinSpendCategory.MOCKUP_GENERATION,
      'Lifestyle-Mockup',
      async () => {
        queued.status = 'processing';
        await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);
        const gen = await runGenerationJob(userId, 'mockup', dna, prompt, {
          size: '1024x1024',
          hd: true,
          projectId,
          quoteId,
          width: config.outputWidth,
          height: config.outputHeight,
          mimeType: 'image/png',
          mockupConfig: config,
          creatorName: dna.name,
          downloadName: mockupDownloadFilename({
            creatorName: dna.name,
            sourceKind: config.sourceKind || 'logo',
            category: config.category,
            version: 1,
            ext: 'png',
          }),
        });
        queued.generationJobId = gen.id;
        queued.status = gen.status === 'failed' ? 'failed' : 'completed';
        queued.error = gen.error;
        queued.provider = gen.provider;
        queued.fileId = gen.fileId;
        queued.imageUrl = gen.imageUrl;
        queued.completedAt = new Date().toISOString();
        if (queued.status === 'completed') {
          const version = await recordJobVersion(
            userId,
            parentJobId || queued.id,
            gen.fileId || gen.imageUrl || gen.id,
            parentJobId ? 'Variante' : 'Original'
          );
          queued.version = version.version;
          if (projectId && queued.imageUrl) {
            await attachAssetToProject(userId, projectId, {
              name: `Mockup ${PRODUCT_LABEL[queued.category]}`,
              type: 'mockup',
              url: queued.imageUrl,
              jobId: queued.id,
              fileId: queued.fileId,
              module: 'mockup',
              sourceType: 'mockup',
              sourceId: queued.id,
              mimeType: 'image/png',
            }).catch(() => undefined);
          }
        }
        await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);
        return queued;
      },
      { quoteId }
    );
    return result;
  } catch (err) {
    queued.status = 'failed';
    queued.error = err instanceof Error ? err.message : 'Lifestyle-Mockup fehlgeschlagen';
    queued.completedAt = new Date().toISOString();
    await dsSet(COLLECTION, queued.id, queued as unknown as Record<string, unknown>);
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
}

export async function saveMockupToFiles(userId: string, jobId: string) {
  const job = await getMockup(jobId, userId);
  if (!job?.fileId && !job?.imageUrl) throw new ServiceError(404, 'NOT_FOUND', 'Mockup nicht gefunden');
  if (job.fileId) {
    const file = await getUserFile(job.fileId, userId);
    if (file) return file;
  }
  throw new ServiceError(404, 'NOT_FOUND', 'Mockup-Datei nicht gefunden');
}

export async function saveMockupToProject(userId: string, jobId: string, projectId: string) {
  const job = await getMockup(jobId, userId);
  if (!job?.imageUrl) throw new ServiceError(404, 'NOT_FOUND', 'Mockup nicht gefunden');
  const project = await getProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  const asset = await attachAssetToProject(userId, projectId, {
    name: `Mockup ${PRODUCT_LABEL[job.category]}`,
    type: 'mockup',
    url: job.imageUrl,
    jobId: job.id,
    fileId: job.fileId,
    module: 'mockup',
    sourceType: 'mockup',
    sourceId: job.id,
  });
  return { project, asset };
}

export { PRODUCT_LABEL };
