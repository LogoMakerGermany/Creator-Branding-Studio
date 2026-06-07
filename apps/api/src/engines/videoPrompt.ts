import type { BrandDNA, AssetType } from '@cbs/shared';

export type VideoProvider = 'pixverse' | 'kling' | 'veo' | 'runway' | 'openai';

export interface VideoPromptContext {
  dna: BrandDNA;
  assetType: AssetType;
  duration: number;
  provider: VideoProvider;
  customText?: string;
}

const PROVIDER_PREFIX: Record<VideoProvider, string> = {
  pixverse: 'Cinematic motion graphics, smooth camera,',
  kling: 'High quality video animation, dynamic motion,',
  veo: 'Professional video, cinematic lighting,',
  runway: 'Creative video generation, fluid transitions,',
  openai: 'Generate video animation,',
};

export function buildVideoPrompt(ctx: VideoPromptContext): string {
  const { dna, assetType, duration, provider, customText } = ctx;
  const prefix = PROVIDER_PREFIX[provider];
  const styleLock = dna.styleLocked ? `Locked style: ${dna.brandingStyle}.` : '';

  const typeMap: Record<string, string> = {
    intro: 'brand logo intro animation reveal',
    outro: 'brand logo outro animation fade',
    stinger: 'stream stinger transition burst',
    transition: 'scene transition effect',
    loading: 'loading screen animation loop',
    social_reveal: 'social media reveal animation',
    product_reveal: 'product reveal cinematic',
    clan_intro: 'clan team intro epic',
    team_intro: 'esports team intro cinematic',
  };

  return [
    prefix,
    typeMap[assetType] || `${assetType} animation`,
    `Duration: ${duration} seconds.`,
    `Brand colors: ${dna.primaryColors.join(', ')}.`,
    `Style: ${dna.brandingStyle}, neon glow ${dna.neonStrength}, ${dna.lightBehavior}.`,
    `Elements: ${dna.characters.join(', ')}, ${dna.symbols.join(', ')}.`,
    customText ? `Text overlay: "${customText}".` : '',
    'Transparent or dark alpha-friendly background. Premium esports aesthetic.',
    styleLock,
  ].filter(Boolean).join(' ');
}
