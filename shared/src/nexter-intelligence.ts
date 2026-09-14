import { analyzeMagikName } from './magik/name-parser';
import { BANNER_PLATFORM_SPECS } from './studio';
import { VIDEO_FORMAT_PRESETS, getVideoFormatPreset } from './video-formats';
import type { NexterContextSnapshot, NexterQuoteKind } from './nexter';
import { NEXTER_PLATFORM_LABELS, NEXTER_STYLE_PREFERENCE_LABELS } from './nexter-preferences';

export function parseCssColor(input: unknown): { r: number; g: number; b: number } | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const rgbFn = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (rgbFn) {
    const r = Number(rgbFn[1]);
    const g = Number(rgbFn[2]);
    const b = Number(rgbFn[3]);
    if ([r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return { r, g, b };
    return null;
  }
  let hex = raw.replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  return parseCssColor(hex);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hueFamily(h: number): string {
  if (h < 15 || h >= 345) return 'Rot';
  if (h < 40) return 'Orange';
  if (h < 65) return 'Gelb';
  if (h < 90) return 'Lindgrün';
  if (h < 150) return 'Grün';
  if (h < 172) return 'Mint';
  if (h < 196) return 'Türkis/Cyan';
  if (h < 215) return 'Hellblau';
  if (h < 255) return 'Blau';
  if (h < 280) return 'Violett';
  if (h < 325) return 'Magenta';
  return 'Pink';
}

export function normalizeCssHex(input: unknown): string | null {
  const rgb = parseCssColor(input);
  if (!rgb) return null;
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/** Conversational German color name. HEX stays source of truth; this is display-only. */
export function humanColorName(input: unknown): string {
  const rgb = parseCssColor(input);
  if (!rgb) {
    const t = String(input ?? '').trim();
    return t || 'unbenannte Farbe';
  }
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (s < 0.1) {
    if (l < 0.08) return 'Schwarz';
    if (l < 0.22) return 'sehr dunkles Grau';
    if (l < 0.4) return 'Dunkelgrau';
    if (l < 0.62) return 'Grau';
    if (l < 0.85) return 'Hellgrau';
    return 'Weiß';
  }
  const family = hueFamily(h);
  if ((family === 'Rot' || family === 'Blau' || family === 'Gelb') && s > 0.75 && l >= 0.42 && l <= 0.58) {
    return family;
  }
  if (family === 'Grün' && s > 0.75 && l >= 0.42 && l <= 0.58) return 'Grün';
  let modifier = '';
  if (l < 0.22) modifier = 'sehr dunkles';
  else if (l < 0.38) modifier = 'dunkles';
  else if (l > 0.82) modifier = 'sehr helles';
  else if (l > 0.72) modifier = 'helles';
  else if (s > 0.7 && l >= 0.45 && l <= 0.68 && /Türkis|Cyan|Mint|Magenta|Pink/.test(family)) {
    modifier = 'leuchtendes';
  }
  return modifier ? `${modifier} ${family}` : family;
}

export function formatColorsForNexter(colors: unknown, opts?: { includeHex?: boolean }): string {
  if (!Array.isArray(colors) || colors.length === 0) return '';
  return colors
    .map((value) => {
      const name = humanColorName(value);
      if (!opts?.includeHex) return name;
      const hex = normalizeCssHex(value);
      return hex ? `${name} (${hex})` : name;
    })
    .join(', ');
}

export function messageAsksExactColorCode(message: string): boolean {
  return /\bhex\b|hexadezimal|farbcodes?|farbwert|exakt(e[rn])? farb|\brgb\b/i.test(String(message ?? ''));
}

export function colorFamilyLabel(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '';
  return humanColorName(hex).replace(/^(sehr dunkles|dunkles|sehr helles|helles|leuchtendes|gedecktes)\s+/i, '');
}

export function describeKnownColors(ctx: Pick<NexterContextSnapshot, 'primaryColors' | 'secondaryColors' | 'accentColors'>): string {
  const hexes = [...(ctx.primaryColors ?? []), ...(ctx.secondaryColors ?? []), ...(ctx.accentColors ?? [])];
  const labels = [...new Set(hexes.map(colorFamilyLabel).filter(Boolean))];
  return labels.slice(0, 3).join('-') || (hexes.length ? 'gespeicherten Farben' : '');
}

export function describeDnaContinuity(
  ctx: Pick<
    NexterContextSnapshot,
    'hasDna' | 'dnaName' | 'mascot' | 'styleDirection' | 'primaryColors' | 'secondaryColors' | 'accentColors'
  >,
  nextAsset: string
): string | null {
  if (!ctx.hasDna) return null;
  const color = describeKnownColors(ctx);
  const motif = ctx.mascot || ctx.dnaName || 'deinen Look';
  const style = ctx.styleDirection || 'bestehenden Stil';
  const look = [motif, color, style].filter(Boolean).join('/');
  return `Ich kann deinen bestehenden ${look}-Stil für ${nextAsset} übernehmen, damit alles zusammenpasst.`;
}

export function detectNameBasedLogoHelp(message: string): boolean {
  return /wei(ss|ß) (gar )?nicht.{0,40}logo|was (f(ü|u)r ein |f(ü|u)r\'n )?logo.{0,30}(name|passen)|logo.{0,20}zu meinem namen|welches logo passt/i.test(
    message
  );
}

export function suggestLogoDirections(input: {
  name: string;
  platforms?: string[];
  stylePreferences?: string[];
  creatorGoals?: string[];
  dnaStyle?: string;
  dnaColors?: string[];
  mascot?: string;
}): { intro: string; directions: Array<{ title: string; why: string }> } {
  const name = input.name.trim() || 'deinen Creator-Namen';
  const analysis = analyzeMagikName(name);
  const stylePref = input.stylePreferences?.[0];
  const styleLabel =
    (stylePref && NEXTER_STYLE_PREFERENCE_LABELS[stylePref as keyof typeof NEXTER_STYLE_PREFERENCE_LABELS]) ||
    input.dnaStyle ||
    analysis.suggestedStyle;
  const platform = input.platforms?.[0];
  const platformLabel = platform
    ? NEXTER_PLATFORM_LABELS[platform as keyof typeof NEXTER_PLATFORM_LABELS] || platform
    : null;
  const colorHint = input.dnaColors?.length
    ? describeKnownColors({ primaryColors: input.dnaColors })
    : '';

  const directions: Array<{ title: string; why: string }> = [];
  if (input.mascot || analysis.motifs[0]) {
    directions.push({
      title: input.mascot ? `Figur aus deiner DNA (${input.mascot})` : `Namensmotiv (${analysis.summary.replace(/^MAGIK AI:\s*/i, '')})`,
      why: `Direkt aus „${name}“ lesbar, stark als Icon.`,
    });
  }
  if (styleLabel) {
    directions.push({
      title: `${styleLabel}-Emblem`,
      why: input.creatorGoals?.includes('brand')
        ? 'Passt zu deinem Ziel, eine wiedererkennbare Marke aufzubauen.'
        : 'Trifft deinen bevorzugten Stil, ohne ein neues Universum zu erfinden.',
    });
  }
  if (platformLabel) {
    directions.push({
      title: `${platformLabel}-taugliches Zeichen`,
      why: 'Bleibt klein auf Overlay, Facecam und Profilbild lesbar.',
    });
  }
  if (directions.length < 2) {
    directions.push({
      title: 'Reduziertes Lettermark',
      why: `Die Buchstaben von „${name}“ als klares Markenzeichen — gut, wenn das Motiv noch offen ist.`,
    });
  }
  const unique = directions.slice(0, 3);
  const extras = [colorHint ? `Farben: ${colorHint}` : null, platformLabel ? `Plattform: ${platformLabel}` : null]
    .filter(Boolean)
    .join('. ');
  return {
    intro: `Zu deinem Namen „${name}“ könnten wir in ${unique.length} Richtungen gehen.${extras ? ` ${extras}.` : ''}`,
    directions: unique,
  };
}

export function formatLogoDirectionReply(help: ReturnType<typeof suggestLogoDirections>): string {
  const lines = help.directions.map((d, i) => `${i + 1}. ${d.title} — ${d.why}`);
  return `${help.intro}\n${lines.join('\n')}\nEs wird noch nichts generiert. Sag mir, welche Richtung du willst.`;
}

export function detectKnownFactFollowUp(
  message: string,
  ctx: Pick<
    NexterContextSnapshot,
    | 'primaryColors'
    | 'secondaryColors'
    | 'styleDirection'
    | 'stylePreferences'
    | 'mascot'
    | 'characterDescription'
    | 'hasDna'
  >
): string | null {
  const t = message.toLowerCase();
  const asksColors = /welche farben m(ö|o)chtest du|was f(ü|u)r farben soll|farben m(ö|o)chtest du|welche farbpalette soll/.test(
    t
  );
  const knownColors = describeKnownColors(ctx);
  if (asksColors && knownColors) {
    return `Sollen wir bei deinem ${knownColors}-Stil bleiben oder möchtest du diesmal etwas anderes?`;
  }
  const asksStyle = /welchen stil|was f(ü|u)r ein(en)? stil|stil m(ö|o)chtest du/.test(t);
  const style = ctx.styleDirection || ctx.stylePreferences?.[0];
  if (asksStyle && style) {
    return `Sollen wir bei deinem ${style}-Stil bleiben oder möchtest du diesmal etwas anderes?`;
  }
  const asksFigure = /soll die figur|menschlich.*tierisch|tierisch oder|abstrakt sein/.test(t);
  if (asksFigure && (ctx.mascot || ctx.characterDescription)) {
    return `Deine Figur ist schon gesetzt (${ctx.mascot || ctx.characterDescription}). Soll ich dabei bleiben?`;
  }
  const wantsLogoOrCharacter = /\blogo\b|figur|charakter|maskottchen/.test(t);
  if (
    wantsLogoOrCharacter &&
    !ctx.hasDna &&
    !ctx.mascot &&
    !/wolf|drache|mensch|tier|abstrakt|phoenix|schädel/.test(t) &&
    /unsicher|wei(ss|ß) nicht|keine ahnung|was f(ü|u)r eine figur/.test(t)
  ) {
    return 'Soll die Figur eher menschlich, tierisch oder komplett abstrakt sein?';
  }
  return null;
}

export type DnaChangeScope = 'ask-confirm' | 'explicit-dna';

export type StudioChangeScope = 'asset' | 'set' | 'dna';

export function detectStudioChangeScope(message: string): StudioChangeScope | null {
  const t = message.toLowerCase();
  if (detectDnaChangeScope(message) === 'explicit-dna') return 'dna';
  if (/daraus ein.*streamset|komplettes?\s+streamset|vollst(ä|a)ndiges?\s+(stream)?set/.test(t)) {
    return null;
  }
  if (
    /ganze[sn]? (stream)?set|komplette[sn]? set|alle (streamset[- ]?)?(assets|teile)|überall (dunkler|heller)|das ganze (stream)?set/.test(
      t
    )
  ) {
    return 'set';
  }
  if (
    /änder|kleiner|gr(ö|oe)sser|dunkler|heller|transparent|weniger neon|mehr blau|ring dicker|name kleiner|figur/.test(
      t
    )
  ) {
    return 'asset';
  }
  return null;
}

export function targetsForStudioChange(
  scope: StudioChangeScope,
  opts: { selectedAssetKey?: string; selectedKeys?: string[] } = {}
): string[] {
  if (scope === 'dna') return [];
  if (scope === 'set') return [...(opts.selectedKeys ?? [])];
  return opts.selectedAssetKey ? [opts.selectedAssetKey] : [];
}

export function detectDnaChangeScope(message: string): DnaChangeScope | null {
  const t = message.toLowerCase();
  if (
    /in meiner (creator.? )?dna|dauerhaft (speichern|ändern)|ab jetzt immer|ab jetzt soll|ab jetzt überall|sollen ab jetzt|als bevorzugte farbe|in die dna|gesamtes design/.test(t)
  ) {
    return 'explicit-dna';
  }
  if (
    /diesmal (rot|blau|grün|lila|schwarz)|nur f(ü|u)r dieses (projekt|logo|design)|f(ü|u)r dieses projekt/.test(t) ||
    /(änder|mach).{0,24}(farb|stil|figur)|mach (es|das|den hintergrund)/.test(t)
  ) {
    return 'ask-confirm';
  }
  return null;
}

export function dnaUpdateConfirmationPrompt(message: string): string {
  const color = message.match(/\b(rot|blau|grün|lila|schwarz|wei(ss|ß)|neon|orange)\b/i)?.[1];
  const topic = color ? color : 'diese Änderung';
  return `Soll ich ${topic} nur für dieses Projekt verwenden oder als neue bevorzugte Einstellung in deiner Creator-DNA speichern? Ich ändere die DNA nicht automatisch.`;
}

export function platformFormatHint(platform: string, assetType?: string): string | null {
  const p = platform.toLowerCase();
  if (assetType === 'banner' && p in BANNER_PLATFORM_SPECS) {
    const spec = BANNER_PLATFORM_SPECS[p as keyof typeof BANNER_PLATFORM_SPECS];
    return `${spec.label}-Banner ${spec.aspect} (${spec.width}×${spec.height}px).`;
  }
  if (p === 'tiktok' || p === 'shorts' || assetType === 'short') {
    const spec = VIDEO_FORMAT_PRESETS.tiktok;
    return `TikTok/Shorts ${spec.aspectRatio} (${spec.width}×${spec.height}px).`;
  }
  if (p === 'youtube' && (assetType === 'video' || assetType === 'banner')) {
    if (assetType === 'video') {
      const spec = VIDEO_FORMAT_PRESETS.youtube;
      return `YouTube ${spec.aspectRatio} (${spec.width}×${spec.height}px).`;
    }
  }
  if (p === 'twitch') {
    return 'Twitch-Overlay 1920×1080, Banner 1200×480, Facecam als Rahmen ohne Webcam-Inhalt.';
  }
  if (p === 'discord') {
    const spec = BANNER_PLATFORM_SPECS.discord;
    return `Discord ${spec.aspect} (${spec.width}×${spec.height}px) für Banner/Icon-Assets.`;
  }
  if (p === 'instagram') {
    const spec = getVideoFormatPreset('instagram');
    return `Instagram ${spec.aspectRatio} (${spec.width}×${spec.height}px).`;
  }
  if (p in VIDEO_FORMAT_PRESETS) {
    const spec = getVideoFormatPreset(p);
    return `${spec.label} ${spec.aspectRatio} (${spec.width}×${spec.height}px).`;
  }
  if (p in BANNER_PLATFORM_SPECS) {
    const spec = BANNER_PLATFORM_SPECS[p as keyof typeof BANNER_PLATFORM_SPECS];
    return `${spec.label} ${spec.aspect} (${spec.width}×${spec.height}px).`;
  }
  return null;
}

export function followOnAssetLabel(kind: NexterQuoteKind | string): string {
  const labels: Record<string, string> = {
    facecam: 'einen Facecam-Rahmen',
    overlay: 'ein Overlay',
    banner: 'ein Banner',
    streamset: 'ein Streamset',
    sticker: 'Sticker/Badges',
    mockup: 'ein Mockup',
    animation: 'Intro/Outro',
    music: 'einen Musik-Track',
    voice: 'ein Voiceover',
    logo: 'ein Logo',
  };
  return labels[kind] ?? kind;
}
