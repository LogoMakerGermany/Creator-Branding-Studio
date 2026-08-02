import type { CreatorDNA } from '@ucbs/shared';
import {
  BANNER_PLATFORM_SPECS,
  buildDnaPromptContext,
  buildLogoPrompt,
  type BannerGenerationOptions,
  type FacecamGenerationOptions,
  type OverlayGenerationOptions,
  type StickerGenerationOptions,
} from '@ucbs/shared';

export { buildLogoPrompt, buildDnaPromptContext };

function colorList(dna: CreatorDNA, custom?: string[]): string {
  const fromDna = [...dna.primaryColors, ...dna.secondaryColors, ...dna.accentColors].filter(Boolean);
  const merged = [...(custom ?? []), ...fromDna].slice(0, 6);
  return merged.length ? merged.join(', ') : 'brand accent colors';
}

function dnaTail(dna: CreatorDNA): string {
  return buildDnaPromptContext(dna);
}

export function buildBannerPrompt(dna: CreatorDNA, opts: BannerGenerationOptions): string {
  const spec = BANNER_PLATFORM_SPECS[opts.platform];
  return [
    `Professional ${spec.label} profile banner`,
    `exact aspect ratio ${spec.aspect} (${spec.width}x${spec.height}px composition)`,
    opts.title ? `headline theme: ${opts.title}` : `creator: ${dna.name}`,
    opts.subtitle ? `subtitle mood: ${opts.subtitle}` : null,
    opts.style ? `style: ${opts.style}` : `style: ${dna.styleDirection}`,
    `colors: ${colorList(dna)}`,
    dna.visualLanguage ? `visual language: ${dna.visualLanguage}` : null,
    dna.fonts[0] ? `typography feel: ${dna.fonts[0].name}` : null,
    'wide header graphic, readable at small sizes, no watermark',
    dnaTail(dna),
  ]
    .filter(Boolean)
    .join('. ');
}

export function buildFacecamPrompt(dna: CreatorDNA, opts: FacecamGenerationOptions = {}): string {
  const shape =
    opts.shape === 'circle'
      ? 'circular webcam frame'
      : opts.shape === 'hexagon'
        ? 'hexagonal webcam frame'
        : 'rectangular webcam overlay frame';

  return [
    `${opts.style || dna.styleDirection} live stream facecam overlay`,
    shape,
    opts.transparentBackground !== false ? 'transparent background outside frame, PNG-ready' : null,
    opts.animated || dna.animations?.length
      ? `motion cues: ${(dna.animations?.length ? dna.animations : ['dynamic accent lines']).join(', ')}`
      : 'clean static overlay',
    `colors: ${colorList(dna)}`,
    'leave center clear for webcam feed, decorative border only, no watermark',
    dnaTail(dna),
  ]
    .filter(Boolean)
    .join('. ');
}

const OVERLAY_TYPE_LABELS: Record<NonNullable<OverlayGenerationOptions['overlayType']>, string> = {
  hud: 'stream HUD overlay with info widgets',
  alert: 'donation/sub alert box overlay',
  panel: 'info panel overlay for schedule or social links',
  'starting-soon': 'starting soon full-screen overlay',
  brb: 'be right back stream overlay',
  offline: 'stream offline full-screen graphic',
  ending: 'stream ending thank you full-screen graphic',
  'full-scene': 'full scene stream overlay composition',
};

export function buildOverlayPrompt(dna: CreatorDNA, opts: OverlayGenerationOptions = {}): string {
  const typeLabel = opts.overlayType ? OVERLAY_TYPE_LABELS[opts.overlayType] : 'general stream overlay';
  return [
    `${opts.style || dna.styleDirection} ${typeLabel}`,
    opts.transparentBackground !== false ? 'transparent background, PNG-ready alpha' : null,
    opts.animated || dna.animations?.length
      ? `animation style: ${(dna.animations ?? ['glow accents']).join(', ')}`
      : 'clean static design',
    `creator brand: ${dna.name}`,
    `colors: ${colorList(dna)}`,
    'OBS/Streamlabs compatible layout, no watermark, no mockup',
    dnaTail(dna),
  ]
    .filter(Boolean)
    .join('. ');
}

export function buildStickerPrompt(dna: CreatorDNA, opts: StickerGenerationOptions = {}): string {
  const shape =
    opts.shape === 'circle'
      ? 'circular sticker'
      : opts.shape === 'die-cut'
        ? 'die-cut sticker with custom outline'
        : 'square sticker';

  return [
    `Creator sticker/emote design${opts.name ? ` for "${opts.name}"` : ''}`,
    shape,
    opts.multicolor !== false ? 'multicolor vibrant design' : 'limited color palette',
    opts.style ? `style: ${opts.style}` : `style: ${dna.styleDirection}`,
    opts.transparentBackground !== false ? 'transparent background, isolated sticker' : null,
    `colors: ${colorList(dna)}`,
    dna.mascot ? `featuring mascot motif: ${dna.mascot}` : null,
    'bold readable at small sizes, emoji/emote suitable, no watermark',
    dnaTail(dna),
  ]
    .filter(Boolean)
    .join('. ');
}

export function buildBrandingPackPrompt(dna: CreatorDNA, module: string): string {
  const prompts: Record<string, string> = {
    'profile-pic': `Square creator profile avatar icon for ${dna.name}, ${dna.styleDirection} style, bold recognizable, colors: ${colorList(dna)}. ${dnaTail(dna)}`,
    banner: buildBannerPrompt(dna, { platform: 'twitch', title: dna.name }),
    facecam: buildFacecamPrompt(dna, { transparentBackground: true }),
    overlay: buildOverlayPrompt(dna, { overlayType: 'hud', transparentBackground: true }),
    'stream-start': buildOverlayPrompt(dna, { overlayType: 'starting-soon', transparentBackground: false }),
    'stream-end': [
      `${dna.styleDirection} stream ending / thank you screen`,
      `creator brand: ${dna.name}`,
      `colors: ${colorList(dna)}`,
      'full-screen endcard, farewell message area, social handles space, no watermark',
      dnaTail(dna),
    ].join('. '),
    offline: [
      `${dna.styleDirection} stream offline screen`,
      `creator brand: ${dna.name}`,
      `colors: ${colorList(dna)}`,
      'full-screen offline graphic, clear OFFLINE status, schedule placeholder area, no watermark',
      dnaTail(dna),
    ].join('. '),
    panel: buildOverlayPrompt(dna, { overlayType: 'panel', transparentBackground: true }),
    alert: buildOverlayPrompt(dna, { overlayType: 'alert', transparentBackground: true }),
  };
  return prompts[module] ?? `${dna.styleDirection} creator branding asset for ${module}, colors: ${colorList(dna)}. ${dnaTail(dna)}`;
}

export function bannerOpenAiSize(platform: BannerGenerationOptions['platform']): '1792x1024' | '1024x1792' {
  const spec = BANNER_PLATFORM_SPECS[platform];
  return spec.height > spec.width ? '1024x1792' : '1792x1024';
}
