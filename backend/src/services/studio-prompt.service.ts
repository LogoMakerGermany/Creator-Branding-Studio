import type { CreatorDNA } from '@ucbs/shared';
import {
  BANNER_PLATFORM_SPECS,
  type BannerGenerationOptions,
  type FacecamGenerationOptions,
  type LogoGenerationOptions,
  type OverlayGenerationOptions,
  type StickerGenerationOptions,
} from '@ucbs/shared';

function colorList(dna: CreatorDNA, custom?: string[]): string {
  const fromDna = [...dna.primaryColors, ...dna.secondaryColors, ...dna.accentColors].filter(Boolean);
  const merged = [...(custom ?? []), ...fromDna].slice(0, 6);
  return merged.length ? merged.join(', ') : 'purple, dark blue, cyan accents';
}

export function buildLogoPrompt(dna: CreatorDNA, opts: LogoGenerationOptions = {}): string {
  const styles: string[] = [];
  if (opts.style) styles.push(opts.style);
  if (opts.threeD || opts.style === '3D') styles.push('3D rendered');
  if (opts.realistic || opts.style === 'Realistisch') styles.push('photorealistic');
  if (opts.cartoon || opts.style === 'Cartoon') styles.push('cartoon');
  if (opts.anime || opts.style === 'Anime') styles.push('anime');
  if (opts.neon || opts.style === 'Neon') styles.push('neon glow');
  if (opts.ultraCinematic || opts.style === 'Ultra Cinematic') styles.push('ultra cinematic, dramatic lighting');

  const name = opts.logoName || opts.clanName || dna.name;
  const parts = [
    `Professional creator logo for "${name}"`,
    opts.clanName && opts.clanName !== name ? `clan/team name: ${opts.clanName}` : null,
    opts.slogan ? `incorporating tagline mood: "${opts.slogan}"` : null,
    opts.game ? `themed for game: ${opts.game}` : null,
    opts.platform ? `optimized for platform: ${opts.platform}` : null,
    opts.ringLogo ? 'circular ring logo emblem, centered icon inside ring' : 'strong iconic mark',
    opts.transparentBackground ? 'transparent background, isolated logo, no backdrop fill' : 'clean solid or gradient backdrop',
    styles.length ? `visual style: ${styles.join(', ')}` : `style: ${dna.styleDirection}`,
    `color palette: ${colorList(dna, opts.customColors)}`,
    'vector-friendly shapes, sharp edges, high contrast, no watermark, no mockup frame',
  ];

  return parts.filter(Boolean).join('. ') + '.';
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
    'wide header graphic, readable at small sizes, no watermark',
  ]
    .filter(Boolean)
    .join('. ') + '.';
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
    opts.animated ? 'dynamic accent lines suggesting motion' : 'clean static overlay',
    `colors: ${colorList(dna)}`,
    'leave center clear for webcam feed, decorative border only, no watermark',
  ]
    .filter(Boolean)
    .join('. ') + '.';
}

const OVERLAY_TYPE_LABELS: Record<NonNullable<OverlayGenerationOptions['overlayType']>, string> = {
  hud: 'stream HUD overlay with info widgets',
  alert: 'donation/sub alert box overlay',
  panel: 'info panel overlay for schedule or social links',
  'starting-soon': 'starting soon full-screen overlay',
  brb: 'be right back stream overlay',
  'full-scene': 'full scene stream overlay composition',
};

export function buildOverlayPrompt(dna: CreatorDNA, opts: OverlayGenerationOptions = {}): string {
  const typeLabel = opts.overlayType ? OVERLAY_TYPE_LABELS[opts.overlayType] : 'general stream overlay';
  return [
    `${opts.style || dna.styleDirection} ${typeLabel}`,
    opts.transparentBackground !== false ? 'transparent background, PNG-ready alpha' : null,
    opts.animated ? 'motion-ready accent lines and glow' : 'clean static design',
    `creator brand: ${dna.name}`,
    `colors: ${colorList(dna)}`,
    'OBS/Streamlabs compatible layout, no watermark, no mockup',
  ]
    .filter(Boolean)
    .join('. ') + '.';
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
    'bold readable at small sizes, emoji/emote suitable, no watermark',
  ]
    .filter(Boolean)
    .join('. ') + '.';
}

export function buildBrandingPackPrompt(dna: CreatorDNA, module: string): string {
  const prompts: Record<string, string> = {
    'profile-pic': `Square creator profile avatar icon for ${dna.name}, ${dna.styleDirection} style, bold recognizable, colors: ${colorList(dna)}`,
    banner: buildBannerPrompt(dna, { platform: 'twitch', title: dna.name }),
    facecam: buildFacecamPrompt(dna, { transparentBackground: true }),
    overlay: buildOverlayPrompt(dna, { overlayType: 'hud', transparentBackground: true }),
    'stream-start': buildOverlayPrompt(dna, { overlayType: 'starting-soon', transparentBackground: false }),
    'stream-end': buildOverlayPrompt(dna, { overlayType: 'brb', transparentBackground: false }),
    panel: buildOverlayPrompt(dna, { overlayType: 'panel', transparentBackground: true }),
    alert: buildOverlayPrompt(dna, { overlayType: 'alert', transparentBackground: true }),
  };
  return prompts[module] ?? `${dna.styleDirection} creator branding asset for ${module}, colors: ${colorList(dna)}`;
}

export function bannerOpenAiSize(platform: BannerGenerationOptions['platform']): '1792x1024' | '1024x1792' {
  const spec = BANNER_PLATFORM_SPECS[platform];
  return spec.height > spec.width ? '1024x1792' : '1792x1024';
}
