import type {
  CreatorDNA,
  StyleDirection,
  DNAAnalysis,
  DNAVersion,
  FontConfig,
  BrandingRule,
} from '@ucbs/shared';
import { DNA_PLATFORMS } from '@ucbs/shared';
import { devStore, isDevMode } from '../lib/dev-store.js';
import { getFirestore } from '../config/firebase.js';
import { randomUUID } from 'node:crypto';
import { analyzeCreatorAssets } from './dna-analysis.service.js';

function generateId(): string {
  return randomUUID();
}

/** Ensure older Firestore docs satisfy the current CreatorDNA shape. */
export function normalizeDna(raw: CreatorDNA): CreatorDNA {
  return {
    ...raw,
    type: raw.type ?? 'creator',
    clanName: raw.clanName ?? '',
    mascot: raw.mascot ?? '',
    favoriteGenres: raw.favoriteGenres ?? [],
    gamingStyle: raw.gamingStyle ?? '',
    brandingStyle: raw.brandingStyle ?? raw.styleDirection ?? '',
    promptStyle: raw.promptStyle ?? '',
    visualLanguage: raw.visualLanguage || raw.designLanguage?.keywords?.join(', ') || '',
    animations: raw.animations ?? [],
    personalGuidelines: raw.personalGuidelines ?? '',
    fonts: raw.fonts ?? [],
    brandingRules: raw.brandingRules ?? [],
    platformOptimization: raw.platformOptimization ?? [],
    sourceAssets: raw.sourceAssets ?? [],
    aiAnalysis: raw.aiAnalysis
      ? { ...raw.aiAnalysis, source: raw.aiAnalysis.source ?? 'colors' }
      : undefined,
    designLanguage: raw.designLanguage ?? {
      mood: [],
      keywords: [],
      visualElements: [],
      doNotUse: [],
    },
    targetAudience: raw.targetAudience ?? {
      ageRange: '',
      interests: [],
      platforms: [],
      tone: '',
      description: '',
    },
  };
}

export async function listDnaByUser(userId: string): Promise<CreatorDNA[]> {
  if (isDevMode()) {
    return (devStore.getDnaByUser(userId) as unknown as CreatorDNA[]).map(normalizeDna);
  }

  const db = getFirestore();
  const snap = await db
    .collection('creator_dna')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map((doc) => normalizeDna({ id: doc.id, ...doc.data() } as CreatorDNA));
}

export async function getDnaById(id: string, userId: string): Promise<CreatorDNA | null> {
  if (isDevMode()) {
    const dna = devStore.getDna(id);
    if (!dna || dna.userId !== userId) return null;
    return normalizeDna(dna as unknown as CreatorDNA);
  }

  const db = getFirestore();
  const doc = await db.collection('creator_dna').doc(id).get();
  if (!doc.exists || doc.data()?.userId !== userId) return null;
  return normalizeDna({ id: doc.id, ...doc.data() } as CreatorDNA);
}

export async function getActiveDna(userId: string): Promise<CreatorDNA | null> {
  const all = await listDnaByUser(userId);
  const creators = all.filter((d) => d.type === 'creator' || !d.type);
  return creators.find((d) => d.isActive) ?? creators[0] ?? null;
}

export interface DnaWriteInput {
  userId: string;
  name: string;
  clanName?: string;
  mascot?: string;
  styleDirection?: StyleDirection;
  primaryColors?: string[];
  secondaryColors?: string[];
  accentColors?: string[];
  targetPlatforms?: string[];
  favoriteGenres?: string[];
  gamingStyle?: string;
  brandingStyle?: string;
  promptStyle?: string;
  visualLanguage?: string;
  animations?: string[];
  personalGuidelines?: string;
  fonts?: FontConfig[];
  brandingRules?: BrandingRule[];
  aiAnalysis?: DNAAnalysis;
  sourceAssets?: CreatorDNA['sourceAssets'];
  targetAudience?: CreatorDNA['targetAudience'];
  designLanguage?: CreatorDNA['designLanguage'];
}

function buildBrandingRules(input: DnaWriteInput): BrandingRule[] {
  if (input.brandingRules?.length) return input.brandingRules;

  const rules: BrandingRule[] = [];
  const primary = input.primaryColors?.[0];
  if (primary) {
    rules.push({
      id: 'rule-color',
      rule: `Primärfarbe ${primary} konsequent für Logo und CTAs verwenden`,
      category: 'color',
      priority: 'required',
    });
  }
  if (input.styleDirection) {
    rules.push({
      id: 'rule-style',
      rule: `${input.styleDirection}-Stil über alle Assets beibehalten`,
      category: 'imagery',
      priority: 'required',
    });
  }
  if (input.personalGuidelines?.trim()) {
    rules.push({
      id: 'rule-personal',
      rule: input.personalGuidelines.trim(),
      category: 'tone',
      priority: 'required',
    });
  }
  return rules;
}

function buildPlatformConfig(platforms: string[]): CreatorDNA['platformOptimization'] {
  const configs: CreatorDNA['platformOptimization'] = [];
  const map: Record<string, { ratios: string[]; opts: string[] }> = {
    twitch: { ratios: ['1920x480', '800x800'], opts: ['Dark mode optimiert', 'Panel-safe zones'] },
    youtube: { ratios: ['2560x1440', '800x800'], opts: ['Banner safe area', 'Thumbnail-ready'] },
    tiktok: { ratios: ['1080x1920'], opts: ['Vertical-first', 'Bold typography'] },
    instagram: { ratios: ['1080x1080', '1080x1920'], opts: ['Feed & Stories'] },
    discord: { ratios: ['960x540', '128x128'], opts: ['Server banner', 'Icon'] },
    facebook: { ratios: ['1640x856', '180x180'], opts: ['Cover photo', 'Profile'] },
  };

  for (const p of platforms) {
    const cfg = map[p];
    if (cfg && (DNA_PLATFORMS as readonly string[]).includes(p)) {
      configs.push({
        platform: p as CreatorDNA['platformOptimization'][0]['platform'],
        aspectRatios: cfg.ratios,
        optimizations: cfg.opts,
      });
    }
  }
  return configs;
}

function buildDnaDocument(
  id: string,
  input: DnaWriteInput,
  existing?: CreatorDNA,
  type: CreatorDNA['type'] = 'creator'
): CreatorDNA {
  const now = new Date().toISOString();
  const platforms = input.targetPlatforms ?? existing?.platformOptimization.map((p) => p.platform) ?? [
    'twitch',
    'youtube',
  ];
  const style = input.styleDirection ?? existing?.styleDirection ?? 'gaming';
  const genres = input.favoriteGenres ?? existing?.favoriteGenres ?? [];

  return {
    id,
    userId: input.userId,
    name: input.name,
    type,
    clanName: input.clanName ?? existing?.clanName ?? '',
    mascot: input.mascot ?? existing?.mascot ?? '',
    primaryColors: input.primaryColors ?? existing?.primaryColors ?? [],
    secondaryColors: input.secondaryColors ?? existing?.secondaryColors ?? [],
    accentColors: input.accentColors ?? existing?.accentColors ?? [],
    styleDirection: style,
    favoriteGenres: genres,
    gamingStyle: input.gamingStyle ?? existing?.gamingStyle ?? '',
    brandingStyle: input.brandingStyle ?? existing?.brandingStyle ?? style,
    promptStyle: input.promptStyle ?? existing?.promptStyle ?? '',
    visualLanguage: input.visualLanguage ?? existing?.visualLanguage ?? '',
    animations: input.animations ?? existing?.animations ?? [],
    personalGuidelines: input.personalGuidelines ?? existing?.personalGuidelines ?? '',
    fonts: input.fonts ?? existing?.fonts ?? [],
    brandingRules: buildBrandingRules(input),
    platformOptimization: buildPlatformConfig(platforms),
    targetAudience: input.targetAudience ??
      existing?.targetAudience ?? {
        ageRange: '',
        interests: genres,
        platforms,
        tone: '',
        description: '',
      },
    designLanguage: input.designLanguage ??
      existing?.designLanguage ?? {
        mood: [],
        keywords: [style, ...genres.slice(0, 3)],
        visualElements: [],
        doNotUse: [],
      },
    sourceAssets: input.sourceAssets ?? existing?.sourceAssets ?? [],
    aiAnalysis: input.aiAnalysis ?? existing?.aiAnalysis,
    version: existing ? existing.version + 1 : 1,
    isActive: type === 'creator',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function saveVersionSnapshot(dna: CreatorDNA, changeDescription?: string): Promise<void> {
  const version: DNAVersion = {
    id: generateId(),
    dnaId: dna.id,
    version: dna.version,
    snapshot: dna,
    changeDescription,
    createdAt: new Date().toISOString(),
  };

  if (isDevMode()) {
    const key = `dna_version:${version.id}`;
    devStore.saveDna(key, version as unknown as Record<string, unknown>);
    return;
  }

  const db = getFirestore();
  await db.collection('dna_versions').doc(version.id).set(version);
}

/**
 * Exactly one personal Creator DNA per user (type: creator).
 * Creates if none exists; otherwise updates the existing personal DNA.
 */
export async function upsertDna(input: DnaWriteInput): Promise<CreatorDNA> {
  const existing = await getActiveDna(input.userId);
  if (existing) {
    return updateDna(existing.id, input.userId, input, 'DNA aktualisiert');
  }

  const id = generateId();
  const dna = buildDnaDocument(id, input, undefined, 'creator');

  if (isDevMode()) {
    const all = await listDnaByUser(input.userId);
    for (const d of all) {
      if ((d.type === 'creator' || !d.type) && d.isActive) {
        devStore.saveDna(d.id, { ...d, isActive: false });
      }
    }
    devStore.saveDna(id, dna as unknown as Record<string, unknown>);
    await saveVersionSnapshot(dna, 'DNA erstellt');
    return dna;
  }

  const db = getFirestore();
  const all = await listDnaByUser(input.userId);
  const batch = db.batch();
  for (const d of all) {
    if (d.type === 'creator' || !d.type) {
      batch.update(db.collection('creator_dna').doc(d.id), {
        isActive: false,
        updatedAt: dna.updatedAt,
      });
    }
  }
  batch.set(db.collection('creator_dna').doc(id), dna);
  await batch.commit();
  await saveVersionSnapshot(dna, 'DNA erstellt');
  return dna;
}

/** Create a linked team/agency DNA without replacing the personal Creator DNA. */
export async function createLinkedDna(
  input: DnaWriteInput,
  type: 'team' | 'agency'
): Promise<CreatorDNA> {
  const id = generateId();
  const dna = buildDnaDocument(id, input, undefined, type);

  if (isDevMode()) {
    devStore.saveDna(id, dna as unknown as Record<string, unknown>);
    return dna;
  }

  const db = getFirestore();
  await db.collection('creator_dna').doc(id).set(dna);
  return dna;
}

/** @deprecated Prefer upsertDna for personal DNA or createLinkedDna for team/agency. */
export async function createDna(input: DnaWriteInput): Promise<CreatorDNA> {
  return upsertDna(input);
}

export async function updateDna(
  id: string,
  userId: string,
  input: Partial<DnaWriteInput> & { name?: string },
  changeDescription = 'DNA aktualisiert'
): Promise<CreatorDNA> {
  const existing = await getDnaById(id, userId);
  if (!existing) throw new Error('DNA not found');

  const merged: DnaWriteInput = {
    userId,
    name: input.name ?? existing.name,
    clanName: input.clanName ?? existing.clanName,
    mascot: input.mascot ?? existing.mascot,
    styleDirection: input.styleDirection ?? existing.styleDirection,
    primaryColors: input.primaryColors ?? existing.primaryColors,
    secondaryColors: input.secondaryColors ?? existing.secondaryColors,
    accentColors: input.accentColors ?? existing.accentColors,
    targetPlatforms:
      input.targetPlatforms ?? existing.platformOptimization.map((p) => p.platform),
    favoriteGenres: input.favoriteGenres ?? existing.favoriteGenres,
    gamingStyle: input.gamingStyle ?? existing.gamingStyle,
    brandingStyle: input.brandingStyle ?? existing.brandingStyle,
    promptStyle: input.promptStyle ?? existing.promptStyle,
    visualLanguage: input.visualLanguage ?? existing.visualLanguage,
    animations: input.animations ?? existing.animations,
    personalGuidelines: input.personalGuidelines ?? existing.personalGuidelines,
    fonts: input.fonts ?? existing.fonts,
    brandingRules: input.brandingRules ?? existing.brandingRules,
    aiAnalysis: input.aiAnalysis ?? existing.aiAnalysis,
    sourceAssets: input.sourceAssets ?? existing.sourceAssets,
    targetAudience: input.targetAudience ?? existing.targetAudience,
    designLanguage: input.designLanguage ?? existing.designLanguage,
  };

  const dna = buildDnaDocument(id, merged, existing);

  // Deactivate any other DNAs — enforce single active DNA
  const all = await listDnaByUser(userId);

  if (isDevMode()) {
    for (const d of all) {
      if (d.id !== id) {
        devStore.saveDna(d.id, { ...d, isActive: false });
      }
    }
    devStore.saveDna(id, dna as unknown as Record<string, unknown>);
    await saveVersionSnapshot(dna, changeDescription);
    return dna;
  }

  const db = getFirestore();
  const batch = db.batch();
  for (const d of all) {
    if (d.id !== id) {
      batch.update(db.collection('creator_dna').doc(d.id), {
        isActive: false,
        updatedAt: dna.updatedAt,
      });
    }
  }
  batch.set(db.collection('creator_dna').doc(id), dna);
  await batch.commit();
  await saveVersionSnapshot(dna, changeDescription);
  return dna;
}

export async function listDnaVersions(dnaId: string, userId: string): Promise<DNAVersion[]> {
  const dna = await getDnaById(dnaId, userId);
  if (!dna) return [];

  if (isDevMode()) {
    return [];
  }

  const db = getFirestore();
  const snap = await db
    .collection('dna_versions')
    .where('dnaId', '==', dnaId)
    .orderBy('version', 'desc')
    .limit(50)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as DNAVersion);
}

export async function activateDna(id: string, userId: string): Promise<CreatorDNA> {
  const dna = await getDnaById(id, userId);
  if (!dna) throw new Error('DNA not found');

  const all = await listDnaByUser(userId);

  if (isDevMode()) {
    for (const d of all) {
      devStore.saveDna(d.id, { ...d, isActive: d.id === id });
    }
    return { ...dna, isActive: true };
  }

  const db = getFirestore();
  const batch = db.batch();
  const now = new Date().toISOString();
  for (const d of all) {
    batch.update(db.collection('creator_dna').doc(d.id), {
      isActive: d.id === id,
      updatedAt: now,
    });
  }
  await batch.commit();
  return { ...dna, isActive: true };
}

export async function analyzeAssets(
  colors: string[],
  styleHint?: StyleDirection,
  imageDataUrl?: string
): Promise<DNAAnalysis> {
  return analyzeCreatorAssets({ colors, imageDataUrl, styleHint });
}
