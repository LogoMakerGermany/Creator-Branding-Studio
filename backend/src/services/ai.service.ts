import type { BannerConfig, CreatorDNA, FacecamConfig, LogoConfig, MockupConfig, OverlayConfig, StickerConfig, StudioExportUrls } from '@ucbs/shared';
import { CoinSpendCategory, applyLockedDnaToGeneration, buildDnaPromptContext } from '@ucbs/shared';
import { randomUUID } from 'node:crypto';
import {
  getOpenAiApiKey,
  getReplicateApiToken,
  areImageGenerationsEnabled,
  isOpenAiImageGenerationLiveEnabled,
} from '../config/env.js';
import { getActiveDna, resolveDnaForRequest } from './dna.service.js';
import { withCoinCharge, withCoinChargePack } from '../lib/billable-job.js';
import { requireImageProvider, isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { buildSvgExportFromImage } from '../lib/studio-export.js';
import {
  buildBannerPrompt,
  buildBrandingPackPrompt,
  buildFacecamPrompt,
  buildLogoPrompt,
  buildOverlayPrompt,
  buildStickerPrompt,
  bannerOpenAiSize,
} from './studio-prompt.service.js';
import type {
  BannerGenerationOptions,
  FacecamGenerationOptions,
  LogoGenerationOptions,
  OverlayGenerationOptions,
  StickerGenerationOptions,
  StudioModuleKey,
} from '@ucbs/shared';
import { buildMagikLogoPrompts } from '@ucbs/shared';
import { getMagikLearningHints } from './magik-learning.service.js';
import { recordMagikLogoContexts } from './magik-ai/logo-context.service.js';
import {
  getCcdPromptContext,
  processLogoGenerationCcd,
  appendCcdToPrompt,
} from './creator-dna-engine/index.js';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { saveGeneratedAsset } from './file-cloud.service.js';
import { attachAssetToProject } from './project-assets.service.js';

const JOBS_COLLECTION = 'generationJobs';

export const LOGO_MOCK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const BANNER_MOCK_PNG = LOGO_MOCK_PNG;
export const FACECAM_MOCK_PNG = LOGO_MOCK_PNG;
export const OVERLAY_MOCK_PNG = LOGO_MOCK_PNG;
export const STICKER_MOCK_PNG = LOGO_MOCK_PNG;
export const MOCKUP_MOCK_PNG = LOGO_MOCK_PNG;

let logoTestHooks: { result?: 'success' | 'fail' } | undefined;
let bannerTestHooks: { result?: 'success' | 'fail' } | undefined;
let facecamTestHooks: { result?: 'success' | 'fail' } | undefined;
let overlayTestHooks: { result?: 'success' | 'fail' } | undefined;
let stickerTestHooks: { result?: 'success' | 'fail' } | undefined;
let mockupTestHooks: { result?: 'success' | 'fail' } | undefined;

export function setLogoTestHooks(hooks: typeof logoTestHooks | null): void {
  logoTestHooks = hooks ?? undefined;
}

export function setBannerTestHooks(hooks: typeof bannerTestHooks | null): void {
  bannerTestHooks = hooks ?? undefined;
}

export function setFacecamTestHooks(hooks: typeof facecamTestHooks | null): void {
  facecamTestHooks = hooks ?? undefined;
}

export function setOverlayTestHooks(hooks: typeof overlayTestHooks | null): void {
  overlayTestHooks = hooks ?? undefined;
}

export function setStickerTestHooks(hooks: typeof stickerTestHooks | null): void {
  stickerTestHooks = hooks ?? undefined;
}

export function setMockupTestHooks(hooks: typeof mockupTestHooks | null): void {
  mockupTestHooks = hooks ?? undefined;
}

export function assertImageProviderReadyForStudio(module: StudioModuleKey): void {
  const hook =
    module === 'logo'
      ? logoTestHooks
      : module === 'banner'
        ? bannerTestHooks
        : module === 'facecam'
          ? facecamTestHooks
          : module === 'overlay'
            ? overlayTestHooks
            : module === 'sticker'
              ? stickerTestHooks
              : module === 'mockup'
                ? mockupTestHooks
                : undefined;
  if (hook) return;
  requireImageProvider();
}

export interface GenerationJob {
  id: string;
  userId: string;
  module: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial';
  prompt: string;
  imageUrl?: string;
  provider?: string;
  exports?: StudioExportUrls;
  dnaId?: string;
  assetKey?: string;
  projectId?: string;
  batchId?: string;
  parentJobId?: string;
  quoteId?: string;
  fileId?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  transparentBackground?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GenerateImageOptions {
  module:
    | 'logo'
    | 'banner'
    | 'facecam'
    | 'ai-image'
    | 'profile-pic'
    | 'overlay'
    | 'sticker'
    | 'mockup'
    | 'stream-start'
    | 'stream-end'
    | 'panel'
    | 'alert';
  dna: CreatorDNA;
  customPrompt?: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  hd?: boolean;
}

export function buildPromptFromDNA(dna: CreatorDNA, module: string, customPrompt?: string): string {
  const dnaCtx = buildDnaPromptContext(dna);

  const modulePrompts: Record<string, string> = {
    logo: `Professional ${dna.styleDirection} logo design, bold icon, clean vector style`,
    'profile-pic': `${dna.styleDirection} creator profile picture, square avatar, bold recognizable icon`,
    banner: `${dna.styleDirection} stream banner, wide format header graphic, dynamic composition`,
    facecam: `${dna.styleDirection} stream overlay frame for facecam, transparent-friendly border design`,
    overlay: `${dna.styleDirection} stream overlay graphic, HUD elements, transparent-friendly`,
    sticker: `${dna.styleDirection} creator sticker/emote, bold multicolor, transparent background`,
    mockup: `${dna.styleDirection} photorealistic merch mockup, lifestyle product photography`,
    'stream-start': `${dna.styleDirection} stream starting soon screen, full screen graphic`,
    'stream-end': `${dna.styleDirection} stream ending screen, thank you graphic`,
    offline: `${dna.styleDirection} stream offline screen, clear offline status`,
    panel: `${dna.styleDirection} stream info panel, schedule or about panel design`,
    alert: `${dna.styleDirection} stream alert box design, notification popup style`,
    'ai-image': `${dna.styleDirection} creator branding artwork, high quality digital art`,
  };

  const base = customPrompt || modulePrompts[module] || modulePrompts['ai-image'];
  return `${base}. ${dnaCtx} High quality, professional creator branding, no watermarks.`;
}

function moduleImageSize(module: string): GenerateImageOptions['size'] {
  if (['banner', 'stream-start', 'stream-end', 'offline', 'panel', 'overlay'].includes(module)) {
    return '1792x1024';
  }
  return '1024x1024';
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<{ imageUrl: string; provider: string; exports: StudioExportUrls }> {
  const testBlocked = isPaidProviderTestBlocked();
  if (options.module === 'logo' && logoTestHooks?.result === 'fail') {
    throw new ServiceError(503, 'AI_GENERATION_FAILED', 'mock-fail');
  }
  if (options.module === 'logo' && logoTestHooks?.result === 'success') {
    return { imageUrl: LOGO_MOCK_PNG, provider: 'mock', exports: buildExports(LOGO_MOCK_PNG, 'logo') };
  }
  if (options.module === 'banner' && bannerTestHooks?.result === 'fail') {
    throw new ServiceError(503, 'AI_GENERATION_FAILED', 'mock-fail');
  }
  if (options.module === 'banner' && bannerTestHooks?.result === 'success') {
    return { imageUrl: BANNER_MOCK_PNG, provider: 'mock', exports: buildExports(BANNER_MOCK_PNG, 'banner') };
  }
  if (options.module === 'facecam' && facecamTestHooks?.result === 'fail') {
    throw new ServiceError(503, 'AI_GENERATION_FAILED', 'mock-fail');
  }
  if (options.module === 'facecam' && facecamTestHooks?.result === 'success') {
    return { imageUrl: FACECAM_MOCK_PNG, provider: 'mock', exports: buildExports(FACECAM_MOCK_PNG, 'facecam') };
  }
  if (options.module === 'overlay' && overlayTestHooks?.result === 'fail') {
    throw new ServiceError(503, 'AI_GENERATION_FAILED', 'mock-fail');
  }
  if (options.module === 'overlay' && overlayTestHooks?.result === 'success') {
    return { imageUrl: OVERLAY_MOCK_PNG, provider: 'mock', exports: buildExports(OVERLAY_MOCK_PNG, 'overlay') };
  }
  if (options.module === 'sticker' && stickerTestHooks?.result === 'fail') {
    throw new ServiceError(503, 'AI_GENERATION_FAILED', 'mock-fail');
  }
  if (options.module === 'sticker' && stickerTestHooks?.result === 'success') {
    return { imageUrl: STICKER_MOCK_PNG, provider: 'mock', exports: buildExports(STICKER_MOCK_PNG, 'sticker') };
  }
  if (options.module === 'mockup' && mockupTestHooks?.result === 'fail') {
    throw new ServiceError(503, 'AI_GENERATION_FAILED', 'mock-fail');
  }
  if (options.module === 'mockup' && mockupTestHooks?.result === 'success') {
    return { imageUrl: MOCKUP_MOCK_PNG, provider: 'mock', exports: buildExports(MOCKUP_MOCK_PNG, 'mockup') };
  }
  if (testBlocked) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Bild-Generierung benötigt OPENAI_API_KEY oder REPLICATE_API_TOKEN'
    );
  }
  if (!areImageGenerationsEnabled()) {
    throw new ServiceError(503, 'GENERATIONS_DISABLED', 'KI-Generierung ist deaktiviert.');
  }
  const liveOpenAiImages = Boolean(getOpenAiApiKey()) && isOpenAiImageGenerationLiveEnabled();
  if (
    (options.module === 'logo' ||
      options.module === 'banner' ||
      options.module === 'facecam' ||
      options.module === 'overlay' ||
      options.module === 'sticker' ||
      options.module === 'mockup') &&
    !liveOpenAiImages &&
    !getReplicateApiToken()
  ) {
    const mock =
      options.module === 'banner'
        ? BANNER_MOCK_PNG
        : options.module === 'facecam'
          ? FACECAM_MOCK_PNG
          : options.module === 'overlay'
            ? OVERLAY_MOCK_PNG
            : options.module === 'sticker'
              ? STICKER_MOCK_PNG
              : options.module === 'mockup'
                ? MOCKUP_MOCK_PNG
              : LOGO_MOCK_PNG;
    return { imageUrl: mock, provider: 'mock', exports: buildExports(mock, options.module) };
  }
  const prompt = options.customPrompt ?? buildPromptFromDNA(options.dna, options.module);
  const size = options.size ?? (options.module === 'banner' ? '1792x1024' : '1024x1024');
  const quality = options.hd ? 'hd' : 'standard';

  if (liveOpenAiImages) {
    const url = await generateWithOpenAI(prompt, size, quality);
    return { imageUrl: url, provider: 'openai', exports: buildExports(url, options.module) };
  }

  if (getReplicateApiToken()) {
    const url = await generateWithReplicate(prompt);
    return { imageUrl: url, provider: 'replicate', exports: buildExports(url, options.module) };
  }

  requireImageProvider();
  throw new ServiceError(503, 'AI_GENERATION_FAILED', 'Bild-Generierung fehlgeschlagen — kein Provider verfügbar');
}

function buildExports(imageUrl: string, module: string): StudioExportUrls {
  return {
    png: imageUrl,
    hd: imageUrl,
    svg: buildSvgExportFromImage(imageUrl, module),
  };
}

async function generateWithOpenAI(
  prompt: string,
  size: string,
  quality: 'standard' | 'hd' = 'standard'
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error (${res.status})`);
  }

  const data = (await res.json()) as { data: { url: string }[] };
  return data.data[0].url;
}

async function generateWithReplicate(prompt: string): Promise<string> {
  const token = getReplicateApiToken()!;
  const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      input: { prompt, num_outputs: 1, aspect_ratio: '1:1' },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Replicate create error: ${await createRes.text()}`);
  }

  let prediction = (await createRes.json()) as {
    id: string;
    status: string;
    output?: string | string[];
    error?: string;
  };

  let attempts = 0;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 60) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    prediction = await pollRes.json();
    attempts++;
  }

  if (prediction.status === 'failed') {
    throw new Error(prediction.error || 'Replicate generation failed');
  }

  const output = prediction.output;
  if (Array.isArray(output)) return output[0];
  if (typeof output === 'string') return output;
  throw new Error('No output from Replicate');
}

export function buildPromptForStudioModule(
  dna: CreatorDNA,
  module: StudioModuleKey,
  options?: LogoGenerationOptions | BannerGenerationOptions | FacecamGenerationOptions | OverlayGenerationOptions | StickerGenerationOptions
): { prompt: string; size?: GenerateImageOptions['size']; hd?: boolean } {
  if (module === 'logo') {
    return {
      prompt: buildLogoPrompt(dna, (options ?? {}) as LogoGenerationOptions),
      size: '1024x1024',
      hd: true,
    };
  }
  if (module === 'banner') {
    const raw = (options ?? { platform: 'twitch' }) as BannerGenerationOptions;
    const bannerOpts: BannerGenerationOptions = raw.platform ? raw : { ...raw, platform: 'twitch' };
    return {
      prompt: buildBannerPrompt(dna, bannerOpts),
      size: bannerOpenAiSize(bannerOpts.platform),
      hd: true,
    };
  }
  if (module === 'facecam') {
    return {
      prompt: buildFacecamPrompt(dna, (options ?? {}) as FacecamGenerationOptions),
      size: '1024x1024',
      hd: false,
    };
  }
  if (module === 'overlay') {
    return {
      prompt: buildOverlayPrompt(dna, (options ?? {}) as OverlayGenerationOptions),
      size: '1792x1024',
      hd: true,
    };
  }
  return {
    prompt: buildStickerPrompt(dna, (options ?? {}) as StickerGenerationOptions),
    size: '1024x1024',
    hd: true,
  };
}

export function buildBrandingModulePrompt(dna: CreatorDNA, module: string): string {
  return buildBrandingPackPrompt(dna, module);
}

export async function saveJob(job: GenerationJob): Promise<void> {
  const row = { ...job, updatedAt: new Date().toISOString() };
  await dsSet(JOBS_COLLECTION, job.id, row as unknown as Record<string, unknown>);
}

export async function getJob(jobId: string): Promise<GenerationJob | null> {
  const job = await dsGet(JOBS_COLLECTION, jobId);
  return job ? (job as unknown as GenerationJob) : null;
}

export async function getJobsByUser(userId: string, limit?: number): Promise<GenerationJob[]> {
  const jobs = await dsList(JOBS_COLLECTION, {
    userId,
    orderBy: 'createdAt',
    order: 'desc',
    ...(typeof limit === 'number' ? { limit } : {}),
  });
  return jobs as unknown as GenerationJob[];
}

export async function runGenerationJob(
  userId: string,
  module: string,
  dna: CreatorDNA,
  customPrompt?: string,
  genOptions?: {
    size?: GenerateImageOptions['size'];
    hd?: boolean;
    assetKey?: string;
    projectId?: string;
    batchId?: string;
    parentJobId?: string;
    quoteId?: string;
    width?: number;
    height?: number;
    mimeType?: string;
    transparentBackground?: boolean;
    logoConfig?: Record<string, unknown> | LogoConfig;
    bannerConfig?: Record<string, unknown> | BannerConfig;
    facecamConfig?: Record<string, unknown> | FacecamConfig;
    overlayConfig?: Record<string, unknown> | OverlayConfig;
    stickerConfig?: Record<string, unknown> | StickerConfig;
    mockupConfig?: Record<string, unknown> | MockupConfig;
    creatorName?: string;
    downloadName?: string;
  }
): Promise<GenerationJob> {
  const job: GenerationJob = {
    id: randomUUID(),
    userId,
    module,
    status: 'processing',
    prompt: customPrompt ?? buildPromptFromDNA(dna, module),
    dnaId: dna.id.startsWith('ephemeral-') ? undefined : dna.id,
    assetKey: genOptions?.assetKey,
    projectId: genOptions?.projectId,
    batchId: genOptions?.batchId,
    parentJobId: genOptions?.parentJobId,
    quoteId: genOptions?.quoteId,
    width: genOptions?.width,
    height: genOptions?.height,
    mimeType: genOptions?.mimeType,
    transparentBackground: genOptions?.transparentBackground,
    metadata: {
      ...(genOptions?.logoConfig ?? {}),
      ...(genOptions?.bannerConfig ?? {}),
      ...(genOptions?.facecamConfig ?? {}),
      ...(genOptions?.overlayConfig ?? {}),
      ...(genOptions?.stickerConfig ?? {}),
      ...(genOptions?.mockupConfig ?? {}),
      creatorName: genOptions?.creatorName ?? dna.name,
    },
    createdAt: new Date().toISOString(),
  };

  await saveJob(job);

  try {
    const size = genOptions?.size ?? moduleImageSize(module);
    const { imageUrl, provider, exports: rawExports } = await generateImage({
      module: module as GenerateImageOptions['module'],
      dna,
      customPrompt,
      size,
      hd: genOptions?.hd,
    });

    const persisted = await saveGeneratedAsset(userId, module, imageUrl, {
      projectId: genOptions?.projectId,
      sourceJobId: job.id,
      name: genOptions?.downloadName,
    });
    const durableUrl = persisted?.downloadUrl || imageUrl;

    job.status = 'completed';
    job.imageUrl = durableUrl;
    job.fileId = persisted?.id;
    job.provider = provider;
    job.exports = {
      png: durableUrl,
      hd: durableUrl,
      svg: buildSvgExportFromImage(durableUrl, module),
    };
    job.completedAt = new Date().toISOString();
    job.metadata = {
      ...(job.metadata ?? {}),
      fileId: persisted?.id,
      mimeType: persisted?.mimeType ?? genOptions?.mimeType,
    };
    const { recordApiCost } = await import('../lib/api-cost.js');
    await recordApiCost({
      userId,
      module,
      provider: provider ?? 'unknown',
      internalCostCents: 4,
    });
    void rawExports;

    if (
      (module === 'logo' || module === 'banner' || module === 'facecam' || module === 'overlay' || module === 'sticker') &&
      (durableUrl || persisted?.id)
    ) {
      const { recordJobVersion } = await import('./change-request.service.js');
      const rootId = genOptions?.parentJobId || job.id;
      const version = await recordJobVersion(
        userId,
        rootId,
        persisted?.id || durableUrl,
        genOptions?.parentJobId ? 'Variante' : 'Original'
      );
      job.metadata = { ...(job.metadata ?? {}), version: version.version, parentJobId: rootId };
    }

    if (genOptions?.projectId && durableUrl) {
      await attachAssetToProject(userId, genOptions.projectId, {
        name: genOptions.assetKey || module,
        type: module,
        url: durableUrl,
        jobId: job.id,
        fileId: persisted?.id,
        module,
        sourceType: 'generation',
        sourceId: job.id,
        mimeType: persisted?.mimeType,
        assetKey: genOptions.assetKey,
        parentAssetId: genOptions.parentJobId ?? genOptions.batchId,
      }).catch(() => undefined);
    }
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : 'Generation failed';
    job.completedAt = new Date().toISOString();
  }

  await saveJob(job);
  return job;
}

async function buildMagikPromptPair(userId: string, activeDna: CreatorDNA, studioOptions: LogoGenerationOptions) {
  const { variantA, variantB } = buildMagikLogoPrompts(activeDna, studioOptions, await getCcdPromptContext(userId));
  const hints = await getMagikLearningHints({
    magikMode: studioOptions.magikMode,
    magikStyle: studioOptions.magikStyle,
    game: studioOptions.game,
    magikCharacter: studioOptions.magikCharacter,
    magikLogoArt: studioOptions.magikLogoArt,
    magikBackground: studioOptions.magikBackground,
  });

  const baseA = studioOptions.customPromptOverride?.trim() || variantA;
  const baseB = studioOptions.customPromptOverride?.trim()
    ? `${studioOptions.customPromptOverride.trim()}. VARIANT B design-focused: maximize visual impact, extra particles, smoke, energy, creative AAA detail.`
    : variantB;

  const promptA = hints.variantA ? `${baseA}. ${hints.variantA}` : baseA;
  const promptB = hints.variantB ? `${baseB}. ${hints.variantB}` : baseB;
  return { promptA, promptB };
}

/** MAGIK Logo-Jobs ohne Coin-Abzug (Ultimate Creator Pack). */
export async function runMagikLogoJobs(
  userId: string,
  studioOptions: LogoGenerationOptions,
  activeDna?: CreatorDNA,
  extra?: { projectId?: string }
) {
  const dna = activeDna ?? (await resolveDnaForRequest(userId, extra?.projectId)).dna ?? (await getActiveDna(userId));
  if (!dna) {
    throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
  }

  const { promptA, promptB } = await buildMagikPromptPair(userId, dna, studioOptions);
  const genOpts = { size: '1024x1024' as const, hd: true, projectId: extra?.projectId };
  const jobA = await runGenerationJob(userId, 'logo', dna, promptA, genOpts);
  const jobB = await runGenerationJob(userId, 'logo', dna, promptB, genOpts);

  void recordMagikLogoContexts(userId, studioOptions, [
    { jobId: jobA.id, variant: 'a', prompt: promptA, imageUrl: jobA.imageUrl },
    { jobId: jobB.id, variant: 'b', prompt: promptB, imageUrl: jobB.imageUrl },
  ]).catch(() => {});

  void processLogoGenerationCcd(userId, dna, studioOptions, jobA.id, jobA.imageUrl).catch(() => {});

  return { jobs: [jobA, jobB], prompts: { a: promptA, b: promptB } };
}

export async function generateMagikLogoPair(
  userId: string,
  coinCategory: CoinSpendCategory,
  moduleLabel: string,
  studioOptions: LogoGenerationOptions,
  extra?: { projectId?: string }
) {
  const { dna: resolved } = await resolveDnaForRequest(userId, extra?.projectId);
  const activeDna = resolved ?? (await getActiveDna(userId));
  if (!activeDna) {
    throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
  }

  const lockedOptions = applyLockedDnaToGeneration(activeDna, studioOptions);

  try {
    const billed = await withCoinChargePack(
      userId,
      coinCategory,
      `${moduleLabel} MAGIK (2 Varianten)`,
      async () => {
        const result = await runMagikLogoJobs(userId, lockedOptions, activeDna, extra);
        return result.jobs;
      }
    );
    const prompts = {
      a: billed.jobs[0]?.prompt ?? '',
      b: billed.jobs[1]?.prompt ?? '',
    };
    return {
      jobs: billed.jobs,
      prompts,
      coinsSpent: billed.coinsSpent,
      newBalance: billed.newBalance,
    };
  } catch (err) {
    throw mapBillableError(err);
  }
}

export async function generateStudioAsset(
  userId: string,
  module: StudioModuleKey,
  coinCategory: CoinSpendCategory,
  moduleLabel: string,
  studioOptions?: LogoGenerationOptions | BannerGenerationOptions | FacecamGenerationOptions | OverlayGenerationOptions | StickerGenerationOptions,
  extra?: { projectId?: string; assetKey?: string }
) {
  const { dna: resolved } = await resolveDnaForRequest(userId, extra?.projectId);
  const activeDna = resolved ?? (await getActiveDna(userId));
  if (!activeDna) {
    throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
  }

  const lockedOptions = studioOptions
    ? applyLockedDnaToGeneration(activeDna, studioOptions as LogoGenerationOptions)
    : studioOptions;

  assertImageProviderReadyForStudio(module);

  try {
    return await withCoinCharge(userId, coinCategory, `${moduleLabel} Generierung`, async () => {
      const { prompt, size, hd } = buildPromptForStudioModule(activeDna, module, lockedOptions);
      const { characterDna } = await getCcdPromptContext(userId);
      const enrichedPrompt = appendCcdToPrompt(prompt, characterDna);
      return runGenerationJob(userId, module, activeDna, enrichedPrompt, {
        size,
        hd,
        assetKey: extra?.assetKey,
        projectId: extra?.projectId,
      }).then((job) => {
        if (job.status !== 'completed' || !job.imageUrl) {
          return {
            ...job,
            status: 'failed' as const,
            error: job.error || `${moduleLabel}-Generierung fehlgeschlagen`,
          };
        }
        return job;
      });
    });
  } catch (err) {
    throw mapBillableError(err);
  }
}

function mapBillableError(err: unknown): ServiceError {
  if (err instanceof ServiceError) return err;
  if (err && typeof err === 'object' && 'statusCode' in err && 'code' in err) {
    const e = err as { statusCode: number; code: string; message: string };
    return new ServiceError(e.statusCode, e.code, e.message);
  }
  return new ServiceError(
    503,
    'AI_GENERATION_FAILED',
    err instanceof Error ? err.message : 'Generierung fehlgeschlagen'
  );
}
