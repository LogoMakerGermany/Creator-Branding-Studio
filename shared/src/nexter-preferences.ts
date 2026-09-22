/** Per-user Nexter personalization (app chrome + assistant). Distinct from Creator DNA. */

export const PERSONALIZATION_STORE = {
  creatorDna: 'creator_dna',
  nexterPreferences: 'nexter_preferences',
  ccdSidecar: 'ccd_sidecar',
} as const;

export type PersonalizationStore = (typeof PERSONALIZATION_STORE)[keyof typeof PERSONALIZATION_STORE];

/**
 * Explicit map: do not merge Nexter prefs into Creator DNA.
 * Visual identity stays on DNA; assistant/app chrome stays on the user document.
 */
export const NEXTER_PREF_STORE: Record<string, PersonalizationStore> = {
  language: PERSONALIZATION_STORE.nexterPreferences,
  addressAs: PERSONALIZATION_STORE.nexterPreferences,
  uiTheme: PERSONALIZATION_STORE.nexterPreferences,
  accentPreset: PERSONALIZATION_STORE.nexterPreferences,
  customPrimary: PERSONALIZATION_STORE.nexterPreferences,
  customAccent: PERSONALIZATION_STORE.nexterPreferences,
  voiceCatalogId: PERSONALIZATION_STORE.nexterPreferences,
  voiceOutputEnabled: PERSONALIZATION_STORE.nexterPreferences,
  creatorGoals: PERSONALIZATION_STORE.nexterPreferences,
  creationInterests: PERSONALIZATION_STORE.nexterPreferences,
  stylePreferences: PERSONALIZATION_STORE.nexterPreferences,
  platforms: PERSONALIZATION_STORE.nexterPreferences,
  name: PERSONALIZATION_STORE.creatorDna,
  primaryColors: PERSONALIZATION_STORE.creatorDna,
  secondaryColors: PERSONALIZATION_STORE.creatorDna,
  styleDirection: PERSONALIZATION_STORE.creatorDna,
  mascot: PERSONALIZATION_STORE.creatorDna,
  platformOptimization: PERSONALIZATION_STORE.creatorDna,
};

export function personalizationStoreFor(field: string): PersonalizationStore | undefined {
  return NEXTER_PREF_STORE[field];
}

export const NEXTER_UI_THEMES = ['dark', 'light', 'system'] as const;
export type NexterUiTheme = (typeof NEXTER_UI_THEMES)[number];

export const NEXTER_LANGUAGES = ['de', 'en'] as const;
export type NexterLanguage = (typeof NEXTER_LANGUAGES)[number];

export const DEFAULT_NEXTER_LANGUAGE: NexterLanguage = 'de';
export const DEFAULT_NEXTER_UI_THEME: NexterUiTheme = 'dark';
export const DEFAULT_NEXTER_ACCENT_PRESET = 'nexter-standard';
export const DEFAULT_NEXTER_VOICE_CATALOG_ID = 'nexter-default';
/** Stable internal preference IDs — not provider voice ids. */
export const NEXTER_VOICE_MALE_ID = 'nexter-voice-male';
export const NEXTER_VOICE_FEMALE_ID = 'nexter-voice-female';
export const NEXTER_INTERNAL_VOICE_IDS = [
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  NEXTER_VOICE_MALE_ID,
  NEXTER_VOICE_FEMALE_ID,
] as const;

export function isInternalNexterVoiceId(value: unknown): boolean {
  return typeof value === 'string' && (NEXTER_INTERNAL_VOICE_IDS as readonly string[]).includes(value);
}

export const NEXTER_LANGUAGE_LABELS: Record<NexterLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
};

export interface NexterAccentPreset {
  id: string;
  label: string;
  cyan: string;
  purple: string;
  green: string;
}

export const NEXTER_ACCENT_PRESETS: Record<string, NexterAccentPreset> = {
  'nexter-standard': {
    id: 'nexter-standard',
    label: 'Nexter Standard',
    cyan: '#22d3ee',
    purple: '#a855f7',
    green: '#34d399',
  },
  'blue-green': {
    id: 'blue-green',
    label: 'Blau/Grün',
    cyan: '#22d3ee',
    purple: '#14b8a6',
    green: '#34d399',
  },
  purple: {
    id: 'purple',
    label: 'Lila',
    cyan: '#c084fc',
    purple: '#a855f7',
    green: '#e879f9',
  },
  red: {
    id: 'red',
    label: 'Rot',
    cyan: '#fb7185',
    purple: '#f43f5e',
    green: '#fb923c',
  },
  blue: {
    id: 'blue',
    label: 'Blau',
    cyan: '#38bdf8',
    purple: '#3b82f6',
    green: '#60a5fa',
  },
  green: {
    id: 'green',
    label: 'Grün',
    cyan: '#34d399',
    purple: '#10b981',
    green: '#4ade80',
  },
};

export const NEXTER_ACCENT_PRESET_IDS = Object.keys(NEXTER_ACCENT_PRESETS) as [
  string,
  ...string[],
];

export const NEXTER_PLATFORM_IDS = [
  'tiktok',
  'twitch',
  'youtube',
  'instagram',
  'discord',
  'other',
] as const;
export type NexterPlatformId = (typeof NEXTER_PLATFORM_IDS)[number];

export const NEXTER_PLATFORM_LABELS: Record<NexterPlatformId, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  instagram: 'Instagram',
  discord: 'Discord',
  other: 'Sonstige',
};

export const NEXTER_CREATION_INTEREST_IDS = [
  'logo',
  'facecam',
  'overlay',
  'streamset',
  'banner',
  'intro',
  'outro',
  'animation',
  'sticker',
  'shorts',
  'video',
  'music',
] as const;
export type NexterCreationInterestId = (typeof NEXTER_CREATION_INTEREST_IDS)[number];

export const NEXTER_CREATION_INTEREST_LABELS: Record<NexterCreationInterestId, string> = {
  logo: 'Logo',
  facecam: 'Facecam-Rahmen',
  overlay: 'Overlay',
  streamset: 'Streamset',
  banner: 'Banner',
  intro: 'Intro',
  outro: 'Outro',
  animation: 'Animation',
  sticker: 'Sticker / Badges',
  shorts: 'Shorts / Clips',
  video: 'Videos',
  music: 'Musik / Audio',
};

export const NEXTER_STYLE_PREFERENCE_IDS = [
  'ultra-cinematic',
  '3d',
  'gaming',
  'realistic',
  'futuristic',
  'minimal',
  'comic',
  'fantasy',
  'dark',
  'neon',
] as const;
export type NexterStylePreferenceId = (typeof NEXTER_STYLE_PREFERENCE_IDS)[number];

export const NEXTER_STYLE_PREFERENCE_LABELS: Record<NexterStylePreferenceId, string> = {
  'ultra-cinematic': 'Ultra-Cinematic',
  '3d': '3D',
  gaming: 'Gaming / Esports',
  realistic: 'Realistisch',
  futuristic: 'Futuristisch',
  minimal: 'Minimalistisch',
  comic: 'Comic',
  fantasy: 'Fantasy',
  dark: 'Dark',
  neon: 'Neon',
};

export const NEXTER_CREATOR_GOAL_IDS = [
  'hobby',
  'community',
  'reach',
  'professional',
  'brand',
  'streaming',
  'regular-content',
] as const;
export type NexterCreatorGoalId = (typeof NEXTER_CREATOR_GOAL_IDS)[number];

export const NEXTER_CREATOR_GOAL_LABELS: Record<NexterCreatorGoalId, string> = {
  hobby: 'Hobby',
  community: 'Community aufbauen',
  reach: 'Reichweite steigern',
  professional: 'Professioneller Creator werden',
  brand: 'Marke aufbauen',
  streaming: 'Streaming verbessern',
  'regular-content': 'Content regelmäßig produzieren',
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;

/** Accepts #RGB or #RRGGBB. Rejects everything else (no rgb()/url() injection). */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let hex = value.trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (HEX3.test(hex)) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (!HEX6.test(hex)) return null;
  return hex.toLowerCase();
}

function sanitizeIdList<T extends string>(raw: unknown, allowed: readonly T[], max = 16): T[] {
  if (!Array.isArray(raw)) return [];
  const allowedSet = new Set<string>(allowed);
  const out: T[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!allowedSet.has(id) || out.includes(id as T)) continue;
    out.push(id as T);
    if (out.length >= max) break;
  }
  return out;
}

/** Server-owned fields stored with preferences. Never accepted from client patches. */
export const NEXTER_PREFERENCE_METADATA_KEYS = [
  'updatedAt',
  'createdAt',
  'version',
  'timestamps',
] as const;
export type NexterPreferenceMetadataKey = (typeof NEXTER_PREFERENCE_METADATA_KEYS)[number];

export function isNexterPreferenceMetadataKey(value: string): value is NexterPreferenceMetadataKey {
  return (NEXTER_PREFERENCE_METADATA_KEYS as readonly string[]).includes(value);
}

export interface NexterPreferences {
  language: string;
  addressAs: string;
  voiceCatalogId: string | null;
  uiTheme: NexterUiTheme;
  accentPreset: string;
  /** When set with customAccent, overrides accentPreset for app chrome. */
  customPrimary: string | null;
  customAccent: string | null;
  platforms: NexterPlatformId[];
  creationInterests: NexterCreationInterestId[];
  stylePreferences: NexterStylePreferenceId[];
  creatorGoals: NexterCreatorGoalId[];
  /** When true, Nexter may auto-speak completed chat replies in the browser. Missing defaults to false. */
  voiceOutputEnabled: boolean;
  personalizationCompleted: boolean;
  /** Server-managed write stamp. Clients may read it; patches must not set it. */
  updatedAt: string;
}

export interface NexterVoiceCatalogEntry {
  catalogId: string;
  label: string;
  gender?: 'female' | 'male' | 'neutral';
  style?: string;
  language?: string;
  languages?: string[];
  accent?: string;
  /** ElevenLabs lists `de` as a verified language — not a quality claim. */
  germanAvailable?: boolean;
  hasPreview?: boolean;
  /** Catalog entries served to the client are active unless explicitly false. */
  active?: boolean;
  voiceType?: string;
}

export interface NexterPreferencesPatch {
  language?: string;
  addressAs?: string;
  voiceCatalogId?: string | null;
  uiTheme?: NexterUiTheme;
  accentPreset?: string;
  customPrimary?: string | null;
  customAccent?: string | null;
  platforms?: NexterPlatformId[];
  creationInterests?: NexterCreationInterestId[];
  stylePreferences?: NexterStylePreferenceId[];
  creatorGoals?: NexterCreatorGoalId[];
  voiceOutputEnabled?: boolean;
  personalizationCompleted?: boolean;
}

export function isNexterLanguage(value: unknown): value is NexterLanguage {
  return typeof value === 'string' && (NEXTER_LANGUAGES as readonly string[]).includes(value);
}

export function isNexterUiTheme(value: unknown): value is NexterUiTheme {
  return typeof value === 'string' && (NEXTER_UI_THEMES as readonly string[]).includes(value);
}

export function isNexterAccentPresetId(value: unknown): value is string {
  return typeof value === 'string' && value in NEXTER_ACCENT_PRESETS;
}

export function whisperLanguageCode(language: string): string {
  return isNexterLanguage(language) ? language : DEFAULT_NEXTER_LANGUAGE;
}

export function nexterReplyLanguageInstruction(language: string): string {
  if (language === 'en') {
    return 'Reply in English, concise and actionable. Do not address the user by name in every reply — only in greetings.';
  }
  return 'Antworte auf Deutsch, knapp und actionable. Sprich den Nutzer nicht in jeder Antwort mit Namen an — nur in der Begrüßung.';
}

export function buildNexterGreeting(input: {
  addressAs?: string;
  language?: string;
  contextLine: string;
}): string {
  const name = input.addressAs?.trim();
  const en = input.language === 'en';
  if (en) {
    const hello = name ? `Hi ${name}, I'm Nexter` : `Hi, I'm Nexter`;
    return `${hello} — your Creator OS. ${input.contextLine} Tell me what you want to start with.`;
  }
  const hello = name ? `Hallo ${name}, ich bin Nexter` : `Hallo, ich bin Nexter`;
  return `${hello} — dein Creator-OS. ${input.contextLine} Sag mir, womit du starten willst.`;
}

export function defaultNexterPreferences(input?: {
  locale?: string;
  displayName?: string;
  now?: string;
}): NexterPreferences {
  const language = isNexterLanguage(input?.locale) ? input.locale : DEFAULT_NEXTER_LANGUAGE;
  return {
    language,
    addressAs: (input?.displayName ?? '').trim(),
    voiceCatalogId: null,
    uiTheme: DEFAULT_NEXTER_UI_THEME,
    accentPreset: DEFAULT_NEXTER_ACCENT_PRESET,
    customPrimary: null,
    customAccent: null,
    platforms: [],
    creationInterests: [],
    stylePreferences: [],
    creatorGoals: [],
    voiceOutputEnabled: false,
    personalizationCompleted: false,
    updatedAt: input?.now ?? new Date(0).toISOString(),
  };
}

export function resolveNexterPreferences(
  raw: unknown,
  fallback?: { locale?: string; displayName?: string }
): NexterPreferences {
  const defaults = defaultNexterPreferences(fallback);
  if (!raw || typeof raw !== 'object') return defaults;
  const data = raw as Record<string, unknown>;

  const language = isNexterLanguage(data.language)
    ? data.language
    : defaults.language;
  const addressAs =
    typeof data.addressAs === 'string' ? data.addressAs.trim().slice(0, 40) : defaults.addressAs;
  const voiceCatalogId =
    data.voiceCatalogId === null
      ? null
      : typeof data.voiceCatalogId === 'string' && data.voiceCatalogId.trim()
        ? data.voiceCatalogId.trim().slice(0, 64)
        : null;
  const uiTheme = isNexterUiTheme(data.uiTheme) ? data.uiTheme : defaults.uiTheme;
  const accentPreset = isNexterAccentPresetId(data.accentPreset)
    ? data.accentPreset
    : defaults.accentPreset;
  const customPrimary = data.customPrimary == null ? null : normalizeHexColor(data.customPrimary);
  const customAccent = data.customAccent == null ? null : normalizeHexColor(data.customAccent);
  const platforms = sanitizeIdList(data.platforms, NEXTER_PLATFORM_IDS);
  const creationInterests = sanitizeIdList(data.creationInterests, NEXTER_CREATION_INTEREST_IDS);
  const stylePreferences = sanitizeIdList(data.stylePreferences, NEXTER_STYLE_PREFERENCE_IDS);
  const creatorGoals = sanitizeIdList(data.creatorGoals, NEXTER_CREATOR_GOAL_IDS);
  const voiceOutputEnabled = data.voiceOutputEnabled === true;
  const personalizationCompleted = data.personalizationCompleted === true;
  const updatedAt =
    typeof data.updatedAt === 'string' && data.updatedAt ? data.updatedAt : defaults.updatedAt;

  return {
    language,
    addressAs,
    voiceCatalogId,
    uiTheme,
    accentPreset,
    customPrimary,
    customAccent,
    platforms,
    creationInterests,
    stylePreferences,
    creatorGoals,
    voiceOutputEnabled,
    personalizationCompleted,
    updatedAt,
  };
}

export function nexterAddressName(prefs: NexterPreferences, displayName?: string): string {
  return prefs.addressAs.trim() || (displayName ?? '').trim();
}

export function formatNexterCreatorProfile(prefs: NexterPreferences): string {
  const bits: string[] = [];
  if (prefs.platforms.length) {
    bits.push(`Plattformen: ${prefs.platforms.map((id) => NEXTER_PLATFORM_LABELS[id]).join(', ')}`);
  }
  if (prefs.creationInterests.length) {
    bits.push(
      `Interessen: ${prefs.creationInterests.map((id) => NEXTER_CREATION_INTEREST_LABELS[id]).join(', ')}`
    );
  }
  if (prefs.stylePreferences.length) {
    bits.push(`Stil: ${prefs.stylePreferences.map((id) => NEXTER_STYLE_PREFERENCE_LABELS[id]).join(', ')}`);
  }
  if (prefs.creatorGoals.length) {
    bits.push(`Ziele: ${prefs.creatorGoals.map((id) => NEXTER_CREATOR_GOAL_LABELS[id]).join(', ')}`);
  }
  return bits.join('. ');
}
