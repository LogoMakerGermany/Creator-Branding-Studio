/** Phase G — Social & Text content. No publishing APIs. */

export const CONTENT_PLATFORMS = [
  {
    id: 'tiktok',
    displayName: 'TikTok',
    supportedContentFields: ['hook', 'caption', 'hashtags', 'callToAction'] as const,
    supportedMediaTypes: ['video', 'short', 'image'] as const,
    publishingAvailable: false,
  },
  {
    id: 'youtube',
    displayName: 'YouTube',
    supportedContentFields: ['title', 'description', 'hashtags'] as const,
    supportedMediaTypes: ['video', 'image'] as const,
    publishingAvailable: false,
  },
  {
    id: 'youtube-shorts',
    displayName: 'YouTube Shorts',
    supportedContentFields: ['title', 'description', 'hashtags'] as const,
    supportedMediaTypes: ['short', 'video'] as const,
    publishingAvailable: false,
  },
  {
    id: 'instagram',
    displayName: 'Instagram',
    supportedContentFields: ['caption', 'hashtags', 'callToAction'] as const,
    supportedMediaTypes: ['image', 'short', 'video'] as const,
    publishingAvailable: false,
  },
  {
    id: 'twitch',
    displayName: 'Twitch',
    supportedContentFields: ['title', 'description'] as const,
    supportedMediaTypes: ['image'] as const,
    publishingAvailable: false,
  },
  {
    id: 'discord',
    displayName: 'Discord',
    supportedContentFields: ['caption'] as const,
    supportedMediaTypes: ['image', 'video'] as const,
    publishingAvailable: false,
  },
] as const;

export type ContentPlatformId = (typeof CONTENT_PLATFORMS)[number]['id'];

export function getContentPlatform(id: string) {
  return CONTENT_PLATFORMS.find((p) => p.id === id) ?? null;
}

export const TEXT_KINDS = [
  'package',
  'video-title',
  'video-description',
  'tiktok-caption',
  'hook',
  'hashtags',
  'twitch-title',
  'bio',
  'script',
  'ideas',
] as const;

export type TextKind = (typeof TEXT_KINDS)[number];

export type ContentSourceType =
  | 'topic'
  | 'project'
  | 'video'
  | 'short'
  | 'highlight'
  | 'transcript'
  | 'image'
  | 'logo'
  | 'file';

export interface PlatformVariant {
  hook?: string;
  title?: string;
  caption?: string;
  description?: string;
  hashtags?: string[];
  callToAction?: string;
}

export interface ContentRevision {
  at: string;
  field: string;
  instruction: string;
  before: string;
  after: string;
}

export interface ContentPackage {
  id: string;
  userId: string;
  projectId?: string;
  sourceType: ContentSourceType;
  sourceAssetId?: string;
  sourceLabel?: string;
  topic: string;
  kind: TextKind;
  hook: string;
  title: string;
  caption: string;
  description: string;
  hashtags: string[];
  callToAction: string;
  platformVariants: Partial<Record<ContentPlatformId, PlatformVariant>>;
  alternatives?: string[];
  usedTranscript: boolean;
  transcriptMissingNote?: string;
  output: string;
  status: 'completed' | 'failed';
  dnaId?: string;
  dnaVersion?: number;
  revisions: ContentRevision[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** Internal planner only — never means a platform received the post. */
export type PlannerStatus = 'draft' | 'scheduled' | 'ready';

export function normalizePlannerStatus(raw: string | undefined): PlannerStatus {
  if (raw === 'scheduled') return 'scheduled';
  if (raw === 'published' || raw === 'ready') return 'ready';
  return 'draft';
}

export function plannerStatusLabel(status: PlannerStatus): string {
  if (status === 'scheduled') return 'Intern geplant';
  if (status === 'ready') return 'Bereit (nicht veröffentlicht)';
  return 'Entwurf';
}

export function normalizeHashtags(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input.map((h) => String(h))
    : String(input ?? '')
        .split(/[\s,]+/)
        .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const tag = item.replace(/^#+/, '').trim().replace(/\s+/g, '');
    if (tag.length < 2) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 30) break;
  }
  return out;
}

export function packageToPlainText(pkg: Pick<
  ContentPackage,
  'hook' | 'title' | 'caption' | 'description' | 'hashtags' | 'callToAction'
>): string {
  const tags = pkg.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  return [
    pkg.title && `Titel: ${pkg.title}`,
    pkg.hook && `Hook: ${pkg.hook}`,
    pkg.caption && `Caption: ${pkg.caption}`,
    pkg.description && `Beschreibung: ${pkg.description}`,
    tags && `Hashtags: ${tags}`,
    pkg.callToAction && `CTA: ${pkg.callToAction}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseTextIntent(message: string): {
  kind: TextKind;
  platform?: ContentPlatformId;
  revisionField?: 'hook' | 'title' | 'caption' | 'description' | 'hashtags' | 'callToAction';
  revisionInstruction?: string;
  wantLastShort?: boolean;
  variantCount?: number;
} {
  const lower = message.toLowerCase();
  const wantLastShort = /letzten?\s+short|letzter short|meinen short/i.test(lower);
  let platform: ContentPlatformId | undefined;
  if (/tiktok/.test(lower)) platform = 'tiktok';
  else if (/youtube\s*short/.test(lower)) platform = 'youtube-shorts';
  else if (/youtube/.test(lower)) platform = 'youtube';
  else if (/instagram|reel/.test(lower)) platform = 'instagram';
  else if (/twitch/.test(lower)) platform = 'twitch';
  else if (/discord/.test(lower)) platform = 'discord';

  const hooks = lower.match(/(\d+)\s*(neue\s+)?hooks?/);
  if (hooks || /alternativ.*hook|hook.*alternativ/i.test(lower)) {
    return { kind: 'package', revisionField: 'hook', variantCount: hooks ? Number(hooks[1]) : 3, wantLastShort, platform };
  }

  if (/caption\s+k(ü|u)rzer|k(ü|u)rzere?\s+caption|mach die caption/i.test(lower)) {
    return { kind: 'package', revisionField: 'caption', revisionInstruction: message, wantLastShort, platform };
  }
  if (/lustiger|witziger|mehr gaming/i.test(lower) && /caption|hook|titel|text/i.test(lower)) {
    const field = /hook/.test(lower)
      ? 'hook'
      : /titel|title/.test(lower)
        ? 'title'
        : /hashtag/.test(lower)
          ? 'hashtags'
          : 'caption';
    return { kind: 'package', revisionField: field, revisionInstruction: message, wantLastShort, platform };
  }

  if (/content[- ]?paket|titel.{0,40}caption.{0,40}hashtag|caption.{0,20}hashtag/i.test(lower)) {
    return { kind: 'package', platform, wantLastShort };
  }
  if (/\bbio\b/.test(lower)) return { kind: 'bio', platform, wantLastShort };
  if (/skript|script/.test(lower)) return { kind: 'script', platform, wantLastShort };
  if (/\bideen?\b/.test(lower)) return { kind: 'ideas', platform, wantLastShort };
  if (/hashtag/.test(lower)) return { kind: 'hashtags', platform, wantLastShort };
  if (/hook/.test(lower)) return { kind: 'hook', platform, wantLastShort };
  if (/twitch[- ]?titel/.test(lower)) return { kind: 'twitch-title', platform: 'twitch', wantLastShort };
  if (/caption/.test(lower)) return { kind: 'tiktok-caption', platform: platform ?? 'tiktok', wantLastShort };
  if (/beschreibung/.test(lower)) return { kind: 'video-description', platform, wantLastShort };
  if (/titel|title/.test(lower)) return { kind: 'video-title', platform, wantLastShort };
  return { kind: 'package', platform, wantLastShort };
}

export function claimsExternalPublish(text: string): boolean {
  return /auf (tiktok|youtube|instagram|twitch) (veröffentlicht|hochgeladen)|instagram verbunden|twitch verbunden|post erfolgreich veröffentlicht/i.test(
    text
  );
}
