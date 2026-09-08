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
  version?: number;
  parentPackageId?: string;
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

export const SOCIAL_TONES = ['neutral', 'funny', 'professional', 'hype'] as const;
export type SocialTone = (typeof SOCIAL_TONES)[number];

export const SOCIAL_PLANNER_PLATFORMS = ['tiktok', 'youtube', 'instagram', 'twitch', 'discord', 'twitter'] as const;
export type SocialPlannerPlatform = (typeof SOCIAL_PLANNER_PLATFORMS)[number];

export interface SocialConfig {
  platform: ContentPlatformId;
  contentType: TextKind;
  topic: string;
  goal?: string;
  tone: SocialTone;
  language?: string;
  creatorName?: string;
  keywords: string[];
  hashtags: string[];
  callToAction?: string;
  sourceType: ContentSourceType;
  sourceAssetId?: string;
  projectId?: string;
  scheduledAt?: string;
  qualityProfile: string;
  summary: string;
}

export function socialToneFromMessage(message: string): SocialTone {
  const lower = String(message ?? '').toLowerCase();
  if (/lustig|witzig|funny|humor/.test(lower)) return 'funny';
  if (/professionell|seriös|clean/.test(lower)) return 'professional';
  if (/hype|aggressiv|laut/.test(lower)) return 'hype';
  return 'neutral';
}

export function defaultSocialConfig(overrides?: Partial<SocialConfig>): SocialConfig {
  const platform =
    overrides?.platform && CONTENT_PLATFORMS.some((p) => p.id === overrides.platform)
      ? overrides.platform
      : 'tiktok';
  const contentType = overrides?.contentType && TEXT_KINDS.includes(overrides.contentType) ? overrides.contentType : 'package';
  const tone = overrides?.tone && SOCIAL_TONES.includes(overrides.tone) ? overrides.tone : 'neutral';
  const config: SocialConfig = {
    platform,
    contentType,
    topic: overrides?.topic?.trim() || '',
    goal: overrides?.goal,
    tone,
    language: overrides?.language,
    creatorName: overrides?.creatorName,
    keywords: Array.isArray(overrides?.keywords) ? overrides!.keywords.slice(0, 12) : [],
    hashtags: normalizeHashtags(overrides?.hashtags),
    callToAction: overrides?.callToAction,
    sourceType: overrides?.sourceType || 'topic',
    sourceAssetId: overrides?.sourceAssetId,
    projectId: overrides?.projectId,
    scheduledAt: overrides?.scheduledAt,
    qualityProfile: overrides?.qualityProfile || 'standard',
    summary: '',
  };
  config.summary = buildSocialContentBrief(config);
  return config;
}

export function buildSocialContentBrief(config: SocialConfig): string {
  const platform = getContentPlatform(config.platform)?.displayName || config.platform;
  const typeLabel =
    config.contentType === 'tiktok-caption'
      ? 'Caption'
      : config.contentType === 'video-description'
        ? 'Beschreibung'
        : config.contentType === 'video-title'
          ? 'Titel'
          : config.contentType === 'hashtags'
            ? 'Hashtags'
            : config.contentType === 'twitch-title'
              ? 'Twitch-Titel'
              : config.contentType === 'hook'
                ? 'Hook'
                : 'Content-Paket';
  const bits = [
    `CONTENT BRIEF / VORSCHAU — keine fertige KI-Generierung.`,
    `Plattform: ${platform}. Typ: ${typeLabel}. Ton: ${config.tone}.`,
    config.topic ? `Thema: ${config.topic}.` : 'Thema: noch offen.',
    config.goal ? `Ziel: ${config.goal}.` : null,
    config.language ? `Sprache: ${config.language}.` : null,
    config.keywords.length ? `Keywords: ${config.keywords.join(', ')}.` : null,
    config.callToAction ? `CTA: ${config.callToAction}.` : null,
    config.sourceAssetId ? `Eigenes Asset: ${config.sourceType} ${config.sourceAssetId.slice(0, 8)}.` : null,
    config.scheduledAt ? `Geplant: ${config.scheduledAt} (nur intern, kein Auto-Publish).` : null,
  ].filter(Boolean);
  return bits.join(' ');
}

export function detectSocialPlannerIntent(message: string): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (/veröffentlich|upload|post(e)? (auf|bei)/.test(lower)) return false;
  return /plane mir content|content (für|nächste) woche|in den planner|intern planen|content[- ]?kalender/.test(lower);
}

export function socialNeedsFollowUp(
  message: string,
  ctx?: { dnaName?: string; lastShortId?: string; lastLogoId?: string; preferredPlatforms?: string[]; contentPackageId?: string }
): boolean {
  if (detectSocialPlannerIntent(message)) return false;
  const parsed = parseSocialIntent(message, ctx);
  return Boolean(parsed.followUpQuestion);
}

export function parseSocialIntent(
  message: string,
  ctx?: { dnaName?: string; lastShortId?: string; lastLogoId?: string; preferredPlatforms?: string[]; language?: string }
): ReturnType<typeof parseTextIntent> & {
  tone: SocialTone;
  plannerOnly?: boolean;
  followUpQuestion?: string | null;
  summary?: string;
  sourceType?: ContentSourceType;
} {
  const parsed = parseTextIntent(message);
  const tone = socialToneFromMessage(message);
  const plannerOnly = detectSocialPlannerIntent(message);
  const lower = String(message ?? '').toLowerCase();
  const sourceType: ContentSourceType | undefined = parsed.wantLastLogo
    ? 'logo'
    : parsed.wantLastShort
      ? 'short'
      : undefined;
  const platform = parsed.platform || (CONTENT_PLATFORMS.some((p) => p.id === ctx?.preferredPlatforms?.[0])
    ? (ctx!.preferredPlatforms![0] as ContentPlatformId)
    : undefined);
  const topicFromCtx = ctx?.dnaName?.trim();
  const missingPlatform = !platform && !parsed.revisionField;
  const missingTopic =
    !parsed.revisionField &&
    !parsed.wantLastShort &&
    !parsed.wantLastLogo &&
    !topicFromCtx &&
    !/raid|stream|video|spiel|game|drop|launch|heute/.test(lower) &&
    parsed.kind === 'package';
  const followUpQuestion = plannerOnly
    ? null
    : missingPlatform
      ? 'Für welche Plattform — TikTok, YouTube, Twitch, Instagram oder Discord? Thema und Ton übernehme ich aus DNA/Vorlieben, wenn bekannt.'
      : missingTopic
        ? 'Worum geht der Post — Stream, Video, Drop oder ein anderes Thema? DNA-Stil frage ich nicht erneut.'
        : null;
  const config = defaultSocialConfig({
    platform: platform || 'tiktok',
    contentType: parsed.kind,
    topic: topicFromCtx || message.slice(0, 120),
    tone,
    language: ctx?.language,
    creatorName: ctx?.dnaName,
    sourceType: sourceType || 'topic',
    sourceAssetId: parsed.wantLastLogo ? ctx?.lastLogoId : parsed.wantLastShort ? ctx?.lastShortId : undefined,
  });
  return {
    ...parsed,
    platform,
    tone,
    plannerOnly,
    sourceType,
    followUpQuestion,
    summary: config.summary,
  };
}

export function parseTextIntent(message: string): {
  kind: TextKind;
  platform?: ContentPlatformId;
  revisionField?: 'hook' | 'title' | 'caption' | 'description' | 'hashtags' | 'callToAction';
  revisionInstruction?: string;
  wantLastShort?: boolean;
  wantLastLogo?: boolean;
  variantCount?: number;
} {
  const lower = message.toLowerCase();
  const wantLastShort = /letzten?\s+short|letzter short|meinen short/i.test(lower);
  const wantLastLogo = /letzten?\s+logo|letztes logo|mein(em)? logo/i.test(lower);
  let platform: ContentPlatformId | undefined;
  if (/tiktok/.test(lower)) platform = 'tiktok';
  else if (/youtube\s*short/.test(lower)) platform = 'youtube-shorts';
  else if (/youtube/.test(lower)) platform = 'youtube';
  else if (/instagram|reel/.test(lower)) platform = 'instagram';
  else if (/twitch|going.?live|going live|stream (heute|abend)|live gehen/.test(lower)) platform = 'twitch';
  else if (/discord/.test(lower)) platform = 'discord';

  const base = { wantLastShort, wantLastLogo, platform };

  const hooks = lower.match(/(\d+)\s*(neue\s+)?hooks?/);
  if (hooks || /alternativ.*hook|hook.*alternativ/i.test(lower)) {
    return { kind: 'package', revisionField: 'hook', variantCount: hooks ? Number(hooks[1]) : 3, ...base };
  }

  if (/caption\s+k(ü|u)rzer|k(ü|u)rzere?\s+caption|mach die caption/i.test(lower)) {
    return { kind: 'package', revisionField: 'caption', revisionInstruction: message, ...base };
  }
  if (/going.?live|going live|stream[- ]?ankündigung|ankündigung.{0,40}stream|live gehen/.test(lower)) {
    return { kind: 'twitch-title', platform: 'twitch', wantLastShort, wantLastLogo };
  }
  if (/discord[- ]?(post|ankündigung)/.test(lower)) {
    return { kind: 'package', platform: 'discord', wantLastShort, wantLastLogo };
  }
  if (/tiktok[- ]?post/.test(lower)) {
    return { kind: 'package', platform: 'tiktok', wantLastShort, wantLastLogo };
  }
  if (/lustiger|witziger|mehr gaming|professioneller|mehr emojis|weniger emojis|andere hashtags/i.test(lower)) {
    const field = /hook/.test(lower)
      ? 'hook'
      : /titel|title/.test(lower)
        ? 'title'
        : /hashtag/.test(lower)
          ? 'hashtags'
          : 'caption';
    return { kind: 'package', revisionField: field, revisionInstruction: message, ...base };
  }

  if (/content[- ]?paket|titel.{0,40}caption.{0,40}hashtag|caption.{0,20}hashtag/i.test(lower)) {
    return { kind: 'package', ...base };
  }
  if (/\bbio\b/.test(lower)) return { kind: 'bio', ...base };
  if (/skript|script/.test(lower)) return { kind: 'script', ...base };
  if (/\bideen?\b/.test(lower)) return { kind: 'ideas', ...base };
  if (/hashtag/.test(lower)) return { kind: 'hashtags', ...base };
  if (/hook/.test(lower)) return { kind: 'hook', ...base };
  if (/twitch[- ]?titel/.test(lower)) return { kind: 'twitch-title', platform: 'twitch', wantLastShort, wantLastLogo };
  if (/caption/.test(lower)) return { kind: 'tiktok-caption', platform: platform ?? 'tiktok', wantLastShort, wantLastLogo };
  if (/beschreibung/.test(lower)) return { kind: 'video-description', ...base };
  if (/titel|title/.test(lower)) return { kind: 'video-title', ...base };
  return { kind: 'package', ...base };
}

export function claimsExternalPublish(text: string): boolean {
  return /auf (tiktok|youtube|instagram|twitch) (veröffentlicht|hochgeladen)|instagram verbunden|twitch verbunden|post erfolgreich veröffentlicht/i.test(
    text
  );
}

export type CalendarPlanningKind = 'today' | 'week' | 'upcoming' | 'schedule' | 'reschedule' | 'plan-proposal' | 'open';

export type PlanningItemSource = 'social' | 'event';

export interface PlanningItem {
  id: string;
  source: PlanningItemSource;
  socialPostId?: string;
  eventId?: string;
  title: string;
  content: string;
  platform?: string;
  contentType?: string;
  scheduledAt?: string;
  plannerStatus: PlannerStatus;
  plannerLabel: string;
  projectId?: string;
  packageId?: string;
  mediaAssetId?: string;
  mediaUrl?: string;
  version?: number;
  publishingAvailable: false;
}

const WEEKDAY_INDEX: Record<string, number> = {
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
};

export function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalValueToIso(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function localDayBoundsIso(ref = new Date()): { start: string; end: string } {
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function localWeekBoundsIso(ref = new Date()): { start: string; end: string } {
  const start = new Date(ref);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Past dates are allowed and stored as-is. Never silently rewrite. */
export function parseRelativePlanningTime(message: string, now = new Date()): string | null {
  const lower = String(message ?? '').toLowerCase();
  const hourMatch = lower.match(/um\s+(\d{1,2})(?::(\d{2}))?\s*uhr/);
  const hour = hourMatch ? Number(hourMatch[1]) : 18;
  const minute = hourMatch?.[2] ? Number(hourMatch[2]) : 0;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }
  const applyTime = (d: Date) => {
    const next = new Date(d);
    next.setHours(hour, minute, 0, 0);
    return next.toISOString();
  };
  if (/heute/.test(lower) && /uhr|plane|termin/.test(lower)) return applyTime(now);
  if (/morgen/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return applyTime(d);
  }
  for (const [name, index] of Object.entries(WEEKDAY_INDEX)) {
    if (lower.includes(name)) {
      const d = new Date(now);
      const diff = (index + 7 - d.getDay()) % 7;
      d.setDate(d.getDate() + (diff === 0 && d.getHours() >= hour ? 7 : diff));
      return applyTime(d);
    }
  }
  return null;
}

export function detectCalendarPlanningIntent(message: string): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (/veröffentlich|upload|post(e)? (auf|bei) (tiktok|youtube|instagram|twitch|discord)/.test(lower)) return false;
  if (detectSocialPlannerIntent(message)) return true;
  return /was (habe ich|steht).{0,48}(woche|heute|an)|diese woche geplant|nächste woche geplant|tiktok-posts? für (nächste|diese) woche|verschiebe .{0,60}(auf|auf den)|plane meinen letzten|contentplan|drei tiktok|was steht heute|nächste woche drei/.test(
    lower
  );
}

export function parseCalendarPlanningIntent(message: string): {
  kind: CalendarPlanningKind;
  platform?: SocialPlannerPlatform;
  followUpQuestion?: string | null;
  scheduledAt?: string | null;
  count?: number;
  wantsLastPost?: boolean;
  proposal?: string;
} {
  const lower = String(message ?? '').toLowerCase();
  let platform: SocialPlannerPlatform | undefined;
  if (/tiktok/.test(lower)) platform = 'tiktok';
  else if (/youtube/.test(lower)) platform = 'youtube';
  else if (/instagram/.test(lower)) platform = 'instagram';
  else if (/twitch/.test(lower)) platform = 'twitch';
  else if (/discord/.test(lower)) platform = 'discord';
  else if (/twitter|\bx\b/.test(lower)) platform = 'twitter';

  const scheduledAt = parseRelativePlanningTime(message);
  const wantsLastPost = /letzten?\s+(tiktok|youtube|instagram|twitch|discord)?-?post|letzten post|mein(en)? letzten/.test(lower);
  const countMatch = lower.match(/(\d+)\s*(tiktok|posts?)/);
  const count = countMatch ? Math.min(7, Number(countMatch[1])) : undefined;

  if (/contentplan|plane mir (content|nächste woche)|drei tiktok|nächste woche drei/.test(lower) && !wantsLastPost) {
    return {
      kind: 'plan-proposal',
      platform,
      count: count ?? 3,
      proposal: buildWeeklyContentPlanProposal(platform ? [platform] : undefined),
      followUpQuestion: null,
    };
  }
  if (/verschiebe/.test(lower)) {
    return {
      kind: 'reschedule',
      platform,
      scheduledAt,
      followUpQuestion: !scheduledAt
        ? 'Auf welchen Tag und welche Uhrzeit soll ich den bestehenden Post intern verschieben?'
        : !platform && !wantsLastPost
          ? 'Welchen geplanten Post soll ich intern verschieben?'
          : null,
    };
  }
  if (wantsLastPost || (/plane meinen|plane den/.test(lower) && scheduledAt)) {
    return {
      kind: 'schedule',
      platform,
      scheduledAt,
      wantsLastPost: true,
      followUpQuestion: !scheduledAt
        ? 'Für welchen Tag und welche Uhrzeit soll ich intern planen? NEXTER veröffentlicht nichts automatisch.'
        : null,
    };
  }
  if (/was steht heute|heute an|heute geplant/.test(lower)) {
    return { kind: 'today', platform, followUpQuestion: null };
  }
  if (/diese woche|nächste woche geplant|was habe ich .{0,40}woche|tiktok-posts? für (nächste|diese) woche/.test(lower)) {
    return { kind: 'week', platform, followUpQuestion: null };
  }
  if (/anstehend|upcoming|nächsten posts/.test(lower)) {
    return { kind: 'upcoming', platform, followUpQuestion: null };
  }
  return { kind: 'open', platform, followUpQuestion: null };
}

export function buildWeeklyContentPlanProposal(preferredPlatforms?: string[]): string {
  const platforms = (preferredPlatforms ?? []).filter((p) =>
    SOCIAL_PLANNER_PLATFORMS.includes(p as SocialPlannerPlatform)
  );
  const primary = (platforms[0] as SocialPlannerPlatform | undefined) || 'tiktok';
  const secondary = (platforms[1] as SocialPlannerPlatform | undefined) || (primary === 'twitch' ? 'tiktok' : 'twitch');
  const yt = platforms.includes('youtube') ? 'youtube' : primary === 'youtube' ? 'youtube' : 'youtube';
  return [
    'CONTENT BRIEF / VORSCHAU — interner Wochenplan, keine KI-Generierung, kein Auto-Publish.',
    `Montag: ${primary} Short / Caption`,
    `Mittwoch: ${secondary} Stream-Ankündigung`,
    `Freitag: ${yt} Post / Beschreibung`,
    'Vorhandene Drafts können intern terminiert werden. Neuer AI-Text nur nach Angebot und Bestätigung.',
  ].join('\n');
}

export function planningItemFromSocial(post: {
  id: string;
  content: string;
  platform: string;
  contentType?: string;
  scheduledAt?: string;
  plannerStatus?: PlannerStatus;
  status?: string;
  projectId?: string;
  packageId?: string;
  mediaAssetId?: string;
  mediaUrl?: string;
  version?: number;
}): PlanningItem {
  const plannerStatus = normalizePlannerStatus(post.plannerStatus ?? post.status);
  return {
    id: `social:${post.id}`,
    source: 'social',
    socialPostId: post.id,
    title: post.content.slice(0, 80) || `${post.platform} Post`,
    content: post.content,
    platform: post.platform,
    contentType: post.contentType,
    scheduledAt: post.scheduledAt,
    plannerStatus,
    plannerLabel: plannerStatusLabel(plannerStatus),
    projectId: post.projectId,
    packageId: post.packageId,
    mediaAssetId: post.mediaAssetId,
    mediaUrl: post.mediaUrl,
    version: post.version,
    publishingAvailable: false,
  };
}
