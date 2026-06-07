import type { AssetType } from '@cbs/shared';
import { VIDEO_ASSET_TYPES } from '@cbs/shared';
import { env } from '../config.js';
import * as openai from './openai.js';
import * as replicate from './replicate.js';
import * as runway from './runway.js';

export type ImageProvider = 'openai' | 'replicate';
export type VideoProviderName = 'replicate' | 'runway' | 'openai';

export function getAvailableImageProvider(): ImageProvider {
  if (env.openaiApiKey) return 'openai';
  if (env.replicateApiToken) return 'replicate';
  throw new Error('Kein Bild-API-Schlüssel konfiguriert. Setze OPENAI_API_KEY oder REPLICATE_API_TOKEN in .env');
}

export function getAvailableVideoProvider(): VideoProviderName {
  if (env.runwayApiKey) return 'runway';
  if (env.replicateApiToken) return 'replicate';
  if (env.openaiApiKey) return 'openai';
  throw new Error('Kein Video-API-Schlüssel konfiguriert. Setze RUNWAY_API_KEY, REPLICATE_API_TOKEN oder OPENAI_API_KEY in .env');
}

export async function generateImage(prompt: string, assetType: AssetType): Promise<{ buffer: Buffer; provider: string }> {
  const provider = getAvailableImageProvider();
  const size = ['banner', 'offline', 'starting_soon', 'brb', 'ending', 'overlay'].includes(assetType)
    ? '1792x1024' as const
    : '1024x1024' as const;

  if (provider === 'openai') {
    return { buffer: await openai.generateImage(prompt, size), provider: 'openai' };
  }
  return { buffer: await replicate.generateImageReplicate(prompt), provider: 'replicate' };
}

export async function generateVideo(prompt: string, duration: number): Promise<{ buffer: Buffer; provider: string }> {
  const provider = getAvailableVideoProvider();
  if (provider === 'runway') {
    return { buffer: await runway.generateVideoRunway(prompt, duration), provider: 'runway' };
  }
  if (provider === 'replicate') {
    return { buffer: await replicate.generateVideoReplicate(prompt, duration), provider: 'replicate' };
  }
  throw new Error('OpenAI Video noch nicht verfügbar. Nutze RUNWAY_API_KEY oder REPLICATE_API_TOKEN.');
}

export function isVideoAsset(assetType: AssetType): boolean {
  return VIDEO_ASSET_TYPES.includes(assetType);
}
