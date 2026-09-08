import { createHash } from 'node:crypto';
import type { NexterVoiceCatalogEntry } from '@ucbs/shared';
import {
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  NEXTER_VOICE_FEMALE_ID,
  NEXTER_VOICE_MALE_ID,
  isInternalNexterVoiceId,
} from '@ucbs/shared';
import { getElevenLabsApiKey, getElevenLabsVoiceId, getNexterVoiceCatalogExtra } from '../../config/env.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CATALOG_ID_RE = /^el-[a-f0-9]{16}$/;

export interface VoiceCatalogInternalEntry extends NexterVoiceCatalogEntry {
  providerVoiceId: string;
  previewUrl?: string;
}

type ElevenLabsVoiceRaw = {
  voice_id?: unknown;
  name?: unknown;
  category?: unknown;
  preview_url?: unknown;
  labels?: unknown;
  verified_languages?: unknown;
  gender?: unknown;
};

type VoiceListLoader = () => Promise<ElevenLabsVoiceRaw[]>;

let cache: { at: number; remote: VoiceCatalogInternalEntry[] } | null = null;
let testLoader: VoiceListLoader | null = null;

export function catalogIdForProviderVoice(providerVoiceId: string): string {
  return `el-${createHash('sha256').update(`nexter-voice-catalog:${providerVoiceId}`).digest('hex').slice(0, 16)}`;
}

export function __setElevenLabsVoicesLoaderForTests(loader: VoiceListLoader | null): void {
  testLoader = loader;
  cache = null;
}

export function __resetVoiceCatalogCacheForTests(): void {
  cache = null;
}

function parseExtraCatalog(raw: string | undefined): VoiceCatalogInternalEntry[] {
  if (!raw) return [];
  const out: VoiceCatalogInternalEntry[] = [];
  for (const chunk of raw.split('|')) {
    const parts = chunk.split(':').map((p) => p.trim());
    const catalogId = parts[0];
    const providerVoiceId = parts[1];
    const label = parts[2];
    const genderRaw = parts[3];
    const language = parts[4];
    if (!catalogId || !providerVoiceId || isInternalNexterVoiceId(catalogId)) continue;
    const gender =
      genderRaw === 'female' || genderRaw === 'male' || genderRaw === 'neutral' ? genderRaw : undefined;
    out.push({
      catalogId,
      label: label || catalogId,
      gender,
      language: language || undefined,
      languages: language ? [language] : undefined,
      germanAvailable: language === 'de',
      hasPreview: false,
      active: true,
      voiceType: gender || 'custom',
      providerVoiceId,
    });
  }
  return out;
}

function defaultEntry(): VoiceCatalogInternalEntry {
  return {
    catalogId: DEFAULT_NEXTER_VOICE_CATALOG_ID,
    label: 'Nexter Standard',
    gender: 'neutral',
    style: 'standard',
    language: 'de',
    languages: ['de', 'en'],
    germanAvailable: true,
    hasPreview: false,
    active: true,
    voiceType: 'standard',
    providerVoiceId: getElevenLabsVoiceId(),
  };
}

function internalGenderEntries(): VoiceCatalogInternalEntry[] {
  const providerVoiceId = getElevenLabsVoiceId();
  return [
    {
      catalogId: NEXTER_VOICE_MALE_ID,
      label: 'Männlich',
      gender: 'male',
      style: 'preference',
      language: 'de',
      languages: ['de', 'en'],
      germanAvailable: true,
      hasPreview: false,
      active: true,
      voiceType: 'preference',
      providerVoiceId,
    },
    {
      catalogId: NEXTER_VOICE_FEMALE_ID,
      label: 'Weiblich',
      gender: 'female',
      style: 'preference',
      language: 'de',
      languages: ['de', 'en'],
      germanAvailable: true,
      hasPreview: false,
      active: true,
      voiceType: 'preference',
      providerVoiceId,
    },
  ];
}

function mapGender(raw: unknown): 'female' | 'male' | 'neutral' | undefined {
  const g = String(raw ?? '').toLowerCase().trim();
  if (g === 'female' || g === 'weiblich' || g === 'woman') return 'female';
  if (g === 'male' || g === 'männlich' || g === 'man') return 'male';
  if (g === 'neutral' || g === 'nonbinary' || g === 'non-binary') return 'neutral';
  return undefined;
}

function verifiedLanguageCodes(raw: unknown, labels: Record<string, unknown>): string[] {
  const langs: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') langs.push(item.toLowerCase());
      else if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const code = rec.language ?? rec.locale;
        if (typeof code === 'string') langs.push(code.toLowerCase());
      }
    }
  }
  if (typeof labels.language === 'string') langs.push(labels.language.toLowerCase());
  return [...new Set(langs.filter(Boolean))];
}

function mapOfficialVoice(raw: ElevenLabsVoiceRaw): VoiceCatalogInternalEntry | null {
  const providerVoiceId = typeof raw.voice_id === 'string' ? raw.voice_id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!providerVoiceId || !name) return null;
  const labels = raw.labels && typeof raw.labels === 'object' ? (raw.labels as Record<string, unknown>) : {};
  const languages = verifiedLanguageCodes(raw.verified_languages, labels);
  const gender = mapGender(labels.gender ?? labels.sex ?? raw.gender);
  const accent = typeof labels.accent === 'string' ? labels.accent : undefined;
  const style =
    (typeof labels.descriptive === 'string' && labels.descriptive) ||
    (typeof labels.description === 'string' && labels.description) ||
    (typeof labels.use_case === 'string' && labels.use_case) ||
    undefined;
  const previewUrl = typeof raw.preview_url === 'string' && /^https:\/\//i.test(raw.preview_url) ? raw.preview_url : undefined;
  const germanAvailable = languages.includes('de');
  return {
    catalogId: catalogIdForProviderVoice(providerVoiceId),
    label: name,
    gender,
    style,
    language: germanAvailable ? 'de' : languages[0],
    languages,
    accent,
    germanAvailable,
    hasPreview: Boolean(previewUrl),
    active: true,
    voiceType: typeof raw.category === 'string' ? raw.category : style,
    providerVoiceId,
    previewUrl,
  };
}

async function fetchOfficialVoices(): Promise<ElevenLabsVoiceRaw[]> {
  if (testLoader) return testLoader();
  if (process.env.NODE_TEST) return [];
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) return [];
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    method: 'GET',
    headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`voices_http_${res.status}`);
  }
  const data = (await res.json()) as { voices?: ElevenLabsVoiceRaw[] };
  return Array.isArray(data.voices) ? data.voices : [];
}

async function loadRemoteCatalog(): Promise<VoiceCatalogInternalEntry[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.remote;
  try {
    const raw = await fetchOfficialVoices();
    const remote = raw.map(mapOfficialVoice).filter((v): v is VoiceCatalogInternalEntry => Boolean(v));
    cache = { at: now, remote };
    return remote;
  } catch {
    if (cache) return cache.remote;
    return [];
  }
}

function mergeCatalog(remote: VoiceCatalogInternalEntry[]): VoiceCatalogInternalEntry[] {
  const extras = parseExtraCatalog(getNexterVoiceCatalogExtra());
  const internals = internalGenderEntries();
  const seen = new Set<string>([DEFAULT_NEXTER_VOICE_CATALOG_ID, ...internals.map((e) => e.catalogId)]);
  const uniqueExtras = extras.filter((e) => {
    if (seen.has(e.catalogId)) return false;
    seen.add(e.catalogId);
    return true;
  });
  const uniqueRemote = remote.filter((e) => {
    if (seen.has(e.catalogId)) return false;
    seen.add(e.catalogId);
    return true;
  });
  uniqueRemote.sort((a, b) => {
    if (a.germanAvailable && !b.germanAvailable) return -1;
    if (!a.germanAvailable && b.germanAvailable) return 1;
    return a.label.localeCompare(b.label, 'de');
  });
  return [defaultEntry(), ...internals, ...uniqueExtras, ...uniqueRemote];
}

export async function getNexterVoiceCatalog(): Promise<VoiceCatalogInternalEntry[]> {
  const remote = await loadRemoteCatalog();
  return mergeCatalog(remote);
}

function toPublic(entry: VoiceCatalogInternalEntry): NexterVoiceCatalogEntry {
  return {
    catalogId: entry.catalogId,
    label: entry.label,
    gender: entry.gender,
    style: entry.style,
    language: entry.language,
    languages: entry.languages,
    accent: entry.accent,
    germanAvailable: entry.germanAvailable,
    hasPreview: entry.hasPreview,
    active: entry.active !== false,
    voiceType: entry.voiceType || entry.style,
  };
}

export async function listPublicNexterVoices(): Promise<NexterVoiceCatalogEntry[]> {
  const catalog = await getNexterVoiceCatalog();
  return catalog.filter((e) => e.active !== false).map(toPublic);
}

export async function getVoiceCatalogEntry(
  catalogId: string
): Promise<VoiceCatalogInternalEntry | undefined> {
  const catalog = await getNexterVoiceCatalog();
  return catalog.find((e) => e.catalogId === catalogId && e.active !== false);
}

export function isKnownVoiceCatalogId(catalogId: string | null | undefined): boolean {
  if (!catalogId) return true;
  if (isInternalNexterVoiceId(catalogId)) return true;
  if (CATALOG_ID_RE.test(catalogId)) return true;
  return parseExtraCatalog(getNexterVoiceCatalogExtra()).some((e) => e.catalogId === catalogId);
}

/** Resolves a user catalog id to the provider voice. Unknown/empty/unavailable → existing fallback. */
export async function resolveProviderVoiceId(voiceCatalogId: string | null | undefined): Promise<string> {
  const fallback = getElevenLabsVoiceId();
  if (!voiceCatalogId || isInternalNexterVoiceId(voiceCatalogId)) return fallback;
  const catalog = await getNexterVoiceCatalog();
  const match = catalog.find((e) => e.catalogId === voiceCatalogId);
  return match?.providerVoiceId || fallback;
}

type PreviewFetcher = (url: string) => Promise<{ buffer: Buffer; contentType: string } | null>;

let testPreviewFetcher: PreviewFetcher | null = null;

export function __setVoicePreviewFetcherForTests(fetcher: PreviewFetcher | null): void {
  testPreviewFetcher = fetcher;
}

function isSafeCatalogId(catalogId: string): boolean {
  if (!catalogId || catalogId.length > 64) return false;
  if (/[:/\\?#[\]@]/.test(catalogId) || catalogId.includes('..')) return false;
  return true;
}

export async function getOfficialVoicePreview(
  catalogId: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isSafeCatalogId(catalogId)) return null;
  const catalog = await getNexterVoiceCatalog();
  const match = catalog.find((e) => e.catalogId === catalogId && e.active !== false);
  if (!match?.previewUrl || !match.hasPreview) return null;
  if (!/^https:\/\//i.test(match.previewUrl)) return null;
  try {
    if (process.env.NODE_TEST) {
      if (!testPreviewFetcher) return null;
      return testPreviewFetcher(match.previewUrl);
    }
    const res = await fetch(match.previewUrl, { method: 'GET', redirect: 'error' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'audio/mpeg';
    if (!contentType.startsWith('audio/') && contentType !== 'application/octet-stream') return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 64 || buffer.length > 4 * 1024 * 1024) return null;
    return { buffer, contentType: contentType.startsWith('audio/') ? contentType : 'audio/mpeg' };
  } catch {
    return null;
  }
}
