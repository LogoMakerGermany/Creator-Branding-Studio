import type { CreatorDNA } from '@ucbs/shared';
import { CoinSpendCategory } from '@ucbs/shared';
import { randomUUID } from 'node:crypto';
import { getActiveDna } from './dna.service.js';
import { deductCoins } from './coins.service.js';
import { isProduction } from '../config/env.js';
import { requireImageProvider } from '../lib/media-providers.js';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';

import { ServiceError } from '../lib/errors.js';
import { saveGeneratedAsset } from './file-cloud.service.js';

const JOBS_COLLECTION = 'generationJobs';

export interface GenerationJob {
  id: string;
  userId: string;
  module: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  prompt: string;
  imageUrl?: string;
  provider?: string;
  dnaId?: string;
  error?: string;
  createdAt: string;
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
    | 'stream-start'
    | 'stream-end'
    | 'panel'
    | 'alert';
  dna: CreatorDNA;
  customPrompt?: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
}

export function buildPromptFromDNA(dna: CreatorDNA, module: string, customPrompt?: string): string {
  const colors = [...dna.primaryColors, ...dna.secondaryColors, ...dna.accentColors]
    .filter(Boolean)
    .slice(0, 4)
    .join(', ');

  const modulePrompts: Record<string, string> = {
    logo: `Professional ${dna.styleDirection} logo design, bold icon, clean vector style`,
    'profile-pic': `${dna.styleDirection} creator profile picture, square avatar, bold recognizable icon`,
    banner: `${dna.styleDirection} stream banner, wide format header graphic, dynamic composition`,
    facecam: `${dna.styleDirection} stream overlay frame for facecam, transparent-friendly border design`,
    overlay: `${dna.styleDirection} stream overlay graphic, HUD elements, transparent-friendly`,
    'stream-start': `${dna.styleDirection} stream starting soon screen, full screen graphic`,
    'stream-end': `${dna.styleDirection} stream ending screen, thank you graphic, offline screen`,
    panel: `${dna.styleDirection} stream info panel, schedule or about panel design`,
    alert: `${dna.styleDirection} stream alert box design, notification popup style`,
    'ai-image': `${dna.styleDirection} creator branding artwork, high quality digital art`,
  };

  const base = customPrompt || modulePrompts[module] || modulePrompts['ai-image'];
  return `${base}. Color palette: ${colors || 'purple, dark blue'}. Style: ${dna.styleDirection}. High quality, professional creator branding, no text, no watermarks.`;
}

function moduleImageSize(module: string): GenerateImageOptions['size'] {
  if (['banner', 'stream-start', 'stream-end', 'panel'].includes(module)) {
    return '1792x1024';
  }
  return '1024x1024';
}

export async function generateImage(options: GenerateImageOptions): Promise<{ imageUrl: string; provider: string }> {
  const prompt = buildPromptFromDNA(options.dna, options.module, options.customPrompt);
  const size = options.size ?? (options.module === 'banner' ? '1792x1024' : '1024x1024');

  if (process.env.OPENAI_API_KEY) {
    try {
      const url = await generateWithOpenAI(prompt, size);
      return { imageUrl: url, provider: 'openai' };
    } catch (err) {
      console.warn('[AI] OpenAI failed, trying Replicate:', err);
    }
  }

  if (process.env.REPLICATE_API_TOKEN) {
    try {
      const url = await generateWithReplicate(prompt);
      return { imageUrl: url, provider: 'replicate' };
    } catch (err) {
      console.warn('[AI] Replicate failed:', err);
    }
  }

  if (isProduction()) {
    requireImageProvider();
  }

  return { imageUrl: generateDevPlaceholder(options.dna, options.module), provider: 'dev-placeholder' };
}

async function generateWithOpenAI(prompt: string, size: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality: 'standard',
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
  const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
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
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
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

function generateDevPlaceholder(dna: CreatorDNA, module: string): string {
  const primary = dna.primaryColors[0] || '#7C3AED';
  const secondary = dna.secondaryColors[0] || dna.primaryColors[1] || '#1E1B4B';
  const accent = dna.accentColors[0] || dna.primaryColors[2] || '#A78BFA';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${secondary}"/>
        <stop offset="100%" style="stop-color:${primary}"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <circle cx="512" cy="400" r="180" fill="${accent}" opacity="0.8"/>
    <polygon points="512,200 612,450 412,450" fill="${primary}" opacity="0.9"/>
    <text x="512" y="700" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="48" font-weight="bold">${module.toUpperCase()}</text>
    <text x="512" y="760" text-anchor="middle" fill="${accent}" font-family="Arial,sans-serif" font-size="28">${dna.styleDirection}</text>
    <text x="512" y="820" text-anchor="middle" fill="white" opacity="0.6" font-family="Arial,sans-serif" font-size="20">${dna.name}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function saveJob(job: GenerationJob): Promise<void> {
  await dsSet(JOBS_COLLECTION, job.id, job as unknown as Record<string, unknown>);
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
  customPrompt?: string
): Promise<GenerationJob> {
  const job: GenerationJob = {
    id: randomUUID(),
    userId,
    module,
    status: 'processing',
    prompt: buildPromptFromDNA(dna, module, customPrompt),
    dnaId: dna.id,
    createdAt: new Date().toISOString(),
  };

  await saveJob(job);

  try {
    const size = moduleImageSize(module);
    const { imageUrl, provider } = await generateImage({
      module: module as GenerateImageOptions['module'],
      dna,
      customPrompt,
      size,
    });

    job.status = 'completed';
    job.imageUrl = imageUrl;
    job.provider = provider;
    job.completedAt = new Date().toISOString();
    await saveGeneratedAsset(userId, module, imageUrl);
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : 'Generation failed';
    job.completedAt = new Date().toISOString();
  }

  await saveJob(job);
  return job;
}

export async function generateStudioAsset(
  userId: string,
  module: 'logo' | 'banner' | 'facecam',
  coinCategory: CoinSpendCategory,
  moduleLabel: string,
  customPrompt?: string
) {
  const activeDna = await getActiveDna(userId);
  if (!activeDna) {
    throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
  }

  const coinResult = await deductCoins(userId, coinCategory, `${moduleLabel} Generierung`);
  if (!coinResult.success) {
    throw new ServiceError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins');
  }

  const job = await runGenerationJob(userId, module, activeDna, customPrompt);

  return {
    job,
    coinsSpent: coinResult.cost,
    newBalance: coinResult.newBalance,
  };
}
