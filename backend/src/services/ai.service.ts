import type { CreatorDNA, StudioExportUrls } from '@ucbs/shared';
import { CoinSpendCategory, applyLockedDnaToGeneration, buildDnaPromptContext } from '@ucbs/shared';
import { randomUUID } from 'node:crypto';
import { getOpenAiApiKey, getReplicateApiToken } from '../config/env.js';
import { getActiveDna, resolveDnaForRequest } from './dna.service.js';
import { withCoinCharge, withCoinChargePack } from '../lib/billable-job.js';
import { requireImageProvider } from '../lib/media-providers.js';
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

export interface GenerationJob {
  id: string;
  userId: string;
  module: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  prompt: string;
  imageUrl?: string;
  provider?: string;
  exports?: StudioExportUrls;
  dnaId?: string;
  assetKey?: string;
  projectId?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
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
  const prompt = options.customPrompt ?? buildPromptFromDNA(options.dna, options.module);
  const size = options.size ?? (options.module === 'banner' ? '1792x1024' : '1024x1024');
  const quality = options.hd ? 'hd' : 'standard';

  if (getOpenAiApiKey()) {
    try {
      const url = await generateWithOpenAI(prompt, size, quality);
      return { imageUrl: url, provider: 'openai', exports: buildExports(url, options.module) };
    } catch (err) {
      console.warn('[AI] OpenAI failed, trying Replicate:', err);
    }
  }

  if (getReplicateApiToken()) {
    try {
      const url = await generateWithReplicate(prompt);
      return { imageUrl: url, provider: 'replicate', exports: buildExports(url, options.module) };
    } catch (err) {
      console.warn('[AI] Replicate failed:', err);
    }
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
    const err = await res.text();
    throw new Error(`OpenAI API error: ${err}`);
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

export async function getJobsByUser(userId: string): Promise<GenerationJob[]> {
  const jobs = await dsList(JOBS_COLLECTION, { userId, orderBy: 'createdAt', order: 'desc' });
  return jobs as unknown as GenerationJob[];
}

export async function runGenerationJob(
  userId: string,
  module: string,
  dna: CreatorDNA,
  customPrompt?: string,
  genOptions?: { size?: GenerateImageOptions['size']; hd?: boolean; assetKey?: string; projectId?: string }
): Promise<GenerationJob> {
  const job: GenerationJob = {
    id: randomUUID(),
    userId,
    module,
    status: 'processing',
    prompt: customPrompt ?? buildPromptFromDNA(dna, module),
    dnaId: dna.id,
    assetKey: genOptions?.assetKey,
    projectId: genOptions?.projectId,
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
    });
    const durableUrl = persisted?.downloadUrl || imageUrl;

    job.status = 'completed';
    job.imageUrl = durableUrl;
    job.provider = provider;
    job.exports = {
      png: durableUrl,
      hd: durableUrl,
      svg: buildSvgExportFromImage(durableUrl, module),
    };
    job.completedAt = new Date().toISOString();
    const { recordApiCost } = await import('../lib/api-cost.js');
    await recordApiCost({
      userId,
      module,
      provider: provider ?? 'unknown',
      internalCostCents: 4,
    });
    void rawExports;

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
