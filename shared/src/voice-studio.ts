import {
  DEFAULT_NEXTER_LANGUAGE,
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  NEXTER_LANGUAGES,
  NEXTER_VOICE_FEMALE_ID,
  NEXTER_VOICE_MALE_ID,
  isNexterLanguage,
  type NexterVoiceCatalogEntry,
} from './nexter-preferences';

/** ElevenLabs multilingual TTS via existing generateSpeech adapter — billed studio jobs. */
export const MAX_VOICE_STUDIO_CHARS = 2000;
/** Nexter speak enhancement; chat text is independent. */
export const MAX_NEXTER_SPEAK_CHARS = 500;
/** Rough spoken duration for quotes only — not used for pricing. */
export const VOICE_CHARS_PER_SEC = 15;

export const VOICE_SETTING_LIMITS = {
  stability: { min: 0, max: 1, default: 0.5 },
  similarity: { min: 0, max: 1, default: 0.75 },
  style: { min: 0, max: 1, default: 0 },
  speed: { min: 0.7, max: 1.2, default: 1 },
} as const;

export type VoiceSettingKey = keyof typeof VOICE_SETTING_LIMITS;

export interface VoiceSettings {
  stability: number;
  similarity: number;
  style: number;
  speed: number;
}

export interface VoiceConfig {
  text: string;
  voiceCatalogId: string;
  language: string;
  title?: string;
  settings: VoiceSettings;
  summary: string;
  estimatedDurationSec: number;
}

export interface VoiceGenerationSettings {
  type: 'voice';
  text: string;
  voiceCatalogId?: string;
  language?: string;
  title?: string;
  settings: VoiceSettings;
  summary: string;
  estimatedDurationSec: number;
  missing: string[];
  followUpQuestion: string | null;
}

export function defaultVoiceSettings(): VoiceSettings {
  return {
    stability: VOICE_SETTING_LIMITS.stability.default,
    similarity: VOICE_SETTING_LIMITS.similarity.default,
    style: VOICE_SETTING_LIMITS.style.default,
    speed: VOICE_SETTING_LIMITS.speed.default,
  };
}

export function clampVoiceSetting(key: VoiceSettingKey, value: unknown): number {
  const spec = VOICE_SETTING_LIMITS[key];
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return spec.default;
  return Math.min(spec.max, Math.max(spec.min, n));
}

export function parseVoiceSettings(raw?: Record<string, unknown> | VoiceSettings): VoiceSettings {
  const base = defaultVoiceSettings();
  if (!raw || typeof raw !== 'object') return base;
  return {
    stability: clampVoiceSetting('stability', (raw as VoiceSettings).stability),
    similarity: clampVoiceSetting('similarity', (raw as VoiceSettings).similarity),
    style: clampVoiceSetting('style', (raw as VoiceSettings).style),
    speed: clampVoiceSetting('speed', (raw as VoiceSettings).speed),
  };
}

export function validateVoiceText(
  raw: unknown,
  maxChars = MAX_VOICE_STUDIO_CHARS
): { ok: true; text: string } | { ok: false; code: 'EMPTY_TEXT' | 'TEXT_TOO_LONG'; message: string } {
  if (typeof raw !== 'string') {
    return { ok: false, code: 'EMPTY_TEXT', message: 'Text fehlt.' };
  }
  const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (!text) {
    return { ok: false, code: 'EMPTY_TEXT', message: 'Text darf nicht leer sein.' };
  }
  if (text.length > maxChars) {
    return {
      ok: false,
      code: 'TEXT_TOO_LONG',
      message: `Maximal ${maxChars} Zeichen pro Sprach-Job.`,
    };
  }
  return { ok: true, text };
}

export function estimateVoiceDurationSec(text: string): number {
  return Math.max(1, Math.round(text.length / VOICE_CHARS_PER_SEC));
}

export function normalizeVoiceLanguage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase().slice(0, 2);
  return isNexterLanguage(code) ? code : null;
}

export function voiceSupportsLanguage(
  entry: Pick<NexterVoiceCatalogEntry, 'languages' | 'language' | 'germanAvailable'> | undefined,
  language: string
): boolean {
  if (!entry) return false;
  const lang = language.trim().toLowerCase().slice(0, 2);
  if (!isNexterLanguage(lang)) return false;
  if (entry.languages?.length) {
    return entry.languages.some((l) => l.toLowerCase().slice(0, 2) === lang);
  }
  if (lang === 'de' && entry.germanAvailable) return true;
  if (entry.language && entry.language.toLowerCase().slice(0, 2) === lang) return true;
  return false;
}

export function detectVoiceQuoteIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (/öffne|open|geh(e)? zu/.test(lower) && /voice|stimme|sprecher|tts/.test(lower)) {
    return false;
  }
  if (/\b(musik|hintergrundmusik|song|jingle|bgm|soundtrack)\b/.test(lower)) {
    return false;
  }
  if (/voiceover|sprecherstimme|\btts\b|sprachausgabe|text[- ]to[- ]speech|ki[- ]stimme/.test(lower)) {
    return true;
  }
  if (/\bsprecher\b/.test(lower) && /(erstell|mach|generier|sprich|lies)/.test(lower)) {
    return true;
  }
  if (/lies (mir )?(das|den|folgenden)|sprich (mir )?(das|den|folgenden|diesen text)/.test(lower)) {
    return true;
  }
  return false;
}

export function detectVoiceChangeIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (/\b(musik|song|jingle|bgm|track)\b/.test(lower)) return false;
  return (
    /etwas langsamer|langsamer sprechen|andere stimme|mehr energie|text kürzer|männliche stimme|weibliche stimme|stimme ändern|neue variante (der |des )?(stimme|voice|sprechers|voiceovers)/.test(
      lower
    ) || /nimm die (männliche|weibliche) stimme/.test(lower)
  );
}

function extractSpokenText(message: string): string {
  const quoted = message.match(/[„"]([^"„”\n]{2,})[“"]/);
  if (quoted?.[1]) return quoted[1].trim();
  const labeled = message.match(
    /(?:sprich|lies|text|skript|voiceover)\s*[:]\s*([\s\S]+)$/i
  );
  if (labeled?.[1]) return labeled[1].trim();
  const following = message.match(
    /(?:folgenden text|diesen text|als voiceover)\s*[:.]?\s*([\s\S]+)$/i
  );
  if (following?.[1]) return following[1].trim();
  return '';
}

export function parseVoiceIntent(
  message: string,
  ctx?: { language?: string; voiceCatalogId?: string | null }
): VoiceGenerationSettings {
  const original = String(message ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const lower = original.toLowerCase();
  const extracted = extractSpokenText(original);
  const textCheck = validateVoiceText(extracted || ' ', MAX_VOICE_STUDIO_CHARS);
  const text = extracted && textCheck.ok ? textCheck.text : extracted.trim();

  let language = normalizeVoiceLanguage(ctx?.language) ?? DEFAULT_NEXTER_LANGUAGE;
  if (/\benglish\b|\ben\b|auf englisch/.test(lower)) language = 'en';
  if (/\bdeutsch\b|\bde\b|auf deutsch/.test(lower)) language = 'de';

  let voiceCatalogId = ctx?.voiceCatalogId || undefined;
  if (/männlich|male/.test(lower) && !/weiblich|female/.test(lower)) {
    voiceCatalogId = NEXTER_VOICE_MALE_ID;
  } else if (/weiblich|female/.test(lower)) {
    voiceCatalogId = NEXTER_VOICE_FEMALE_ID;
  }

  const titleMatch = original.match(/titel[:\s]+[„"]?([^"„”\n]+)[“"]?/i);
  const title = titleMatch?.[1]?.trim().slice(0, 80) || undefined;

  const settings = defaultVoiceSettings();
  if (/langsamer/.test(lower)) settings.speed = 0.85;
  if (/mehr energie|energetisch/.test(lower)) {
    settings.style = 0.35;
    settings.speed = 1.08;
  }

  const missing: string[] = [];
  if (!text) missing.push('Text');

  const estimatedDurationSec = text ? estimateVoiceDurationSec(text) : 0;
  const summary = buildVoicePreviewSummary({
    text,
    language,
    voiceCatalogId: voiceCatalogId || DEFAULT_NEXTER_VOICE_CATALOG_ID,
    estimatedDurationSec,
  });

  return {
    type: 'voice',
    text,
    voiceCatalogId,
    language,
    title,
    settings,
    summary,
    estimatedDurationSec,
    missing,
    followUpQuestion: missing.length ? 'Welchen Text soll ich sprechen? Ich starte keine kostenpflichtige Generierung, bis der Text da ist und du bestätigst.' : null,
  };
}

export function voiceNeedsFollowUp(message: string): boolean {
  if (!detectVoiceQuoteIntent(message)) return false;
  return !parseVoiceIntent(message).text;
}

export function buildVoicePreviewSummary(input: {
  text: string;
  language: string;
  voiceCatalogId: string;
  estimatedDurationSec: number;
}): string {
  const chars = input.text.trim().length;
  const lang = input.language === 'en' ? 'Englisch' : 'Deutsch';
  const dur = input.estimatedDurationSec ? `ca. ${input.estimatedDurationSec}s` : '';
  return [`${chars} Zeichen`, lang, input.voiceCatalogId, dur].filter(Boolean).join(' · ');
}

export function defaultVoiceConfig(input?: {
  language?: string;
  voiceCatalogId?: string | null;
}): VoiceConfig {
  const language = normalizeVoiceLanguage(input?.language) ?? DEFAULT_NEXTER_LANGUAGE;
  const voiceCatalogId = input?.voiceCatalogId || DEFAULT_NEXTER_VOICE_CATALOG_ID;
  const text = language === 'en' ? 'Welcome to my stream.' : 'Willkommen auf meinem Stream.';
  const settings = defaultVoiceSettings();
  const estimatedDurationSec = estimateVoiceDurationSec(text);
  return {
    text,
    voiceCatalogId,
    language,
    settings,
    estimatedDurationSec,
    summary: buildVoicePreviewSummary({ text, language, voiceCatalogId, estimatedDurationSec }),
  };
}

export function applyVoiceChangeRequest(config: VoiceConfig, request: string): VoiceConfig {
  const lower = request.toLowerCase();
  const next: VoiceConfig = {
    ...config,
    settings: { ...config.settings },
  };
  if (/langsamer/.test(lower)) {
    next.settings.speed = clampVoiceSetting('speed', next.settings.speed - 0.15);
  }
  if (/mehr energie|energetisch/.test(lower)) {
    next.settings.style = clampVoiceSetting('style', Math.max(next.settings.style, 0.35));
    next.settings.speed = clampVoiceSetting('speed', Math.max(next.settings.speed, 1.08));
  }
  if (/männliche stimme/.test(lower)) next.voiceCatalogId = NEXTER_VOICE_MALE_ID;
  if (/weibliche stimme/.test(lower)) next.voiceCatalogId = NEXTER_VOICE_FEMALE_ID;
  if (/text kürzer|kürzer/.test(lower) && next.text.length > 40) {
    const cut = Math.max(20, Math.floor(next.text.length * 0.7));
    const slice = next.text.slice(0, cut);
    const lastStop = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
    next.text = (lastStop > 20 ? slice.slice(0, lastStop + 1) : slice).trim();
  }
  const extracted = extractSpokenText(request);
  if (extracted) {
    const check = validateVoiceText(extracted);
    if (check.ok) next.text = check.text;
  }
  next.estimatedDurationSec = estimateVoiceDurationSec(next.text);
  next.summary = buildVoicePreviewSummary(next);
  return next;
}

export function voiceDownloadFilename(input: {
  title?: string;
  version: number;
  ext?: string;
}): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'voice';
  const version = Math.max(1, Math.floor(input.version) || 1);
  const ext = (input.ext || 'wav').replace(/^\./, '').replace(/[^a-z0-9]/gi, '') || 'wav';
  return `nexter-voice-${slug(input.title || 'intro')}-v${version}.${ext}`;
}

export function voiceStudioPath(plan: Partial<VoiceConfig>): string {
  const params = new URLSearchParams();
  if (plan.language) params.set('language', plan.language);
  if (plan.voiceCatalogId) params.set('voice', plan.voiceCatalogId);
  const q = params.toString();
  return q ? `/ai-voice?${q}` : '/ai-voice';
}

export function settingsToVoiceConfig(
  s: VoiceGenerationSettings,
  fallbacks?: { language?: string; voiceCatalogId?: string | null }
): VoiceConfig {
  const language = normalizeVoiceLanguage(s.language) ?? normalizeVoiceLanguage(fallbacks?.language) ?? DEFAULT_NEXTER_LANGUAGE;
  const voiceCatalogId = s.voiceCatalogId || fallbacks?.voiceCatalogId || DEFAULT_NEXTER_VOICE_CATALOG_ID;
  return {
    text: s.text,
    voiceCatalogId,
    language,
    title: s.title,
    settings: s.settings,
    estimatedDurationSec: s.estimatedDurationSec || estimateVoiceDurationSec(s.text),
    summary: s.summary || buildVoicePreviewSummary({
      text: s.text,
      language,
      voiceCatalogId,
      estimatedDurationSec: s.estimatedDurationSec,
    }),
  };
}
