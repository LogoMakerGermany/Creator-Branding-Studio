import type {
  CreatorDNA,
  StyleDirection,
  DNAAnalysis,
  DNAVersion,
  FontConfig,
  BrandingRule,
  DnaCharacter,
  DnaTypography,
  DnaAtmosphere,
  DnaOutputPrefs,
} from '@ucbs/shared';
import { DNA_PLATFORMS, applyDnaLocks, mergeAnalysisIntoDna, pickDnaForRequest } from '@ucbs/shared';
import { devStore, isDevMode } from '../lib/dev-store.js';
import { getFirestore } from '../config/firebase.js';
import { randomUUID } from 'node:crypto';
import { analyzeCreatorAssets } from './dna-analysis.service.js';
import { getCharacterDna, saveCharacterDna } from './creator-dna-engine/ccd-storage.service.js';

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
    locks: raw.locks ?? {},
    lightingStyle: raw.lightingStyle,
    dimension: raw.dimension,
    projectId: raw.projectId,
    slogan: raw.slogan ?? '',
    usagePurpose: raw.usagePurpose ?? '',
    backgroundColors: raw.backgroundColors ?? [],
    character: raw.character ?? { present: Boolean(raw.mascot) },
    typography: raw.typography,
    atmosphere: raw.atmosphere,
    outputPrefs: raw.outputPrefs,
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
    return Promise.all(
      (devStore.getDnaByUser(userId) as unknown as CreatorDNA[]).map((d) => hydrateDnaCharacter(normalizeDna(d)))
    );
  }

  const db = getFirestore();
  const snap = await db
    .collection('creator_dna')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  return Promise.all(
    snap.docs.map((doc) => hydrateDnaCharacter(normalizeDna({ id: doc.id, ...doc.data() } as CreatorDNA)))
  );
}

export async function getDnaById(id: string, userId: string): Promise<CreatorDNA | null> {
  if (isDevMode()) {
    const dna = devStore.getDna(id);
    if (!dna || dna.userId !== userId) return null;
    return hydrateDnaCharacter(normalizeDna(dna as unknown as CreatorDNA));
  }

  const db = getFirestore();
  const doc = await db.collection('creator_dna').doc(id).get();
  if (!doc.exists || doc.data()?.userId !== userId) return null;
  return hydrateDnaCharacter(normalizeDna({ id: doc.id, ...doc.data() } as CreatorDNA));
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
  backgroundColors?: string[];
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
  locks?: CreatorDNA['locks'];
  lightingStyle?: string;
  dimension?: '2d' | '3d';
  projectId?: string;
  slogan?: string;
  usagePurpose?: string;
  character?: DnaCharacter;
  typography?: DnaTypography;
  atmosphere?: DnaAtmosphere;
  outputPrefs?: DnaOutputPrefs;
}

function characterFromCcd(ccd: Awaited<ReturnType<typeof getCharacterDna>>, existing?: DnaCharacter): DnaCharacter {
  if (!ccd) return existing ?? { present: false };
  return {
    present: true,
    type: existing?.type ?? ccd.figure,
    description: existing?.description || ccd.figure,
    clothing: existing?.clothing || ccd.visual.armor || ccd.visual.clothing,
    hair: existing?.hair || ccd.visual.hair,
    face: existing?.face || ccd.visual.mask || ccd.visual.helmet || ccd.visual.expression,
    accessories: existing?.accessories || ccd.visual.jewelry,
    traits: existing?.traits?.length
      ? existing.traits
      : [ccd.figure, ccd.subFigure, ccd.personality].filter((v): v is string => Boolean(v)),
    ccdCharacterId: ccd.id,
  };
}

/** Prefer Creator DNA character; fill from CCD sidecar without deleting CCD. */
export async function hydrateDnaCharacter(dna: CreatorDNA): Promise<CreatorDNA> {
  const hasCharacter =
    Boolean(dna.character?.description) ||
    Boolean(dna.character?.present) ||
    Boolean(dna.mascot);
  if (hasCharacter && dna.character?.ccdCharacterId) return dna;
  try {
    const ccd = await getCharacterDna(dna.userId);
    if (!ccd) return dna;
    if (dna.character?.description || dna.mascot) {
      return {
        ...dna,
        character: {
          ...(dna.character ?? { present: Boolean(dna.mascot) }),
          ccdCharacterId: dna.character?.ccdCharacterId ?? ccd.id,
        },
      };
    }
    return { ...dna, character: characterFromCcd(ccd, dna.character), mascot: dna.mascot || ccd.figure };
  } catch {
    return dna;
  }
}

async function syncCharacterSidecar(dna: CreatorDNA): Promise<void> {
  if (!dna.character?.present && !dna.mascot) return;
  try {
    const existing = await getCharacterDna(dna.userId);
    const now = new Date().toISOString();
    await saveCharacterDna({
      id: existing?.id ?? dna.character?.ccdCharacterId ?? dna.id,
      userId: dna.userId,
      creatorDnaId: dna.id,
      creatorName: dna.name,
      clanName: dna.clanName,
      figure: dna.character?.description || dna.mascot || existing?.figure || dna.name,
      subFigure: dna.character?.type || existing?.subFigure,
      personality: existing?.personality ?? 'heroic',
      style: dna.styleDirection,
      visual: {
        ...(existing?.visual ?? {}),
        clothing: dna.character?.clothing ?? existing?.visual.clothing,
        armor: dna.character?.clothing ?? existing?.visual.armor,
        hair: dna.character?.hair ?? existing?.visual.hair,
        mask: dna.character?.face ?? existing?.visual.mask,
        jewelry: dna.character?.accessories ?? existing?.visual.jewelry,
      },
      colors: existing?.colors ?? {
        primary: dna.primaryColors,
        secondary: dna.secondaryColors,
        accent: dna.accentColors,
        glow: [],
        metal: [],
        lighting: dna.atmosphere?.lighting ? [dna.atmosphere.lighting] : [],
      },
      effects: existing?.effects ?? [],
      pose: existing?.pose ?? 'heroic',
      environment: existing?.environment ?? 'abstract',
      generationCount: existing?.generationCount ?? 0,
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  } catch {
    /* sidecar must not fail DNA writes */
  }
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
    locks: input.locks ?? existing?.locks ?? {},
    lightingStyle: input.lightingStyle ?? existing?.lightingStyle ?? input.aiAnalysis?.lightingStyle,
    dimension: input.dimension ?? existing?.dimension ?? input.aiAnalysis?.dimension,
    projectId: input.projectId ?? existing?.projectId,
    slogan: input.slogan ?? existing?.slogan ?? '',
    usagePurpose: input.usagePurpose ?? existing?.usagePurpose ?? '',
    backgroundColors: input.backgroundColors ?? existing?.backgroundColors ?? [],
    character: input.character ?? existing?.character ?? { present: Boolean(input.mascot ?? existing?.mascot) },
    typography: input.typography ?? existing?.typography,
    atmosphere: input.atmosphere ?? existing?.atmosphere ?? (input.lightingStyle || existing?.lightingStyle
      ? { lighting: input.lightingStyle ?? existing?.lightingStyle }
      : undefined),
    outputPrefs: input.outputPrefs ?? existing?.outputPrefs,
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

async function persistDnaDocument(dna: CreatorDNA, userId: string): Promise<void> {
  const all = await listDnaByUser(userId);

  if (isDevMode()) {
    for (const d of all) {
      if (d.id !== dna.id) {
        devStore.saveDna(d.id, { ...d, isActive: false });
      }
    }
    devStore.saveDna(dna.id, dna as unknown as Record<string, unknown>);
    return;
  }

  const db = getFirestore();
  const batch = db.batch();
  for (const d of all) {
    if (d.id !== dna.id) {
      batch.update(db.collection('creator_dna').doc(d.id), {
        isActive: false,
        updatedAt: dna.updatedAt,
      });
    }
  }
  batch.set(db.collection('creator_dna').doc(dna.id), dna);
  await batch.commit();
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
    await syncCharacterSidecar(dna);
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
  await syncCharacterSidecar(dna);
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

  const proposed: Partial<CreatorDNA> = {
    name: input.name ?? existing.name,
    clanName: input.clanName ?? existing.clanName,
    mascot: input.mascot ?? existing.mascot,
    styleDirection: input.styleDirection ?? existing.styleDirection,
    primaryColors: input.primaryColors ?? existing.primaryColors,
    secondaryColors: input.secondaryColors ?? existing.secondaryColors,
    accentColors: input.accentColors ?? existing.accentColors,
    backgroundColors: input.backgroundColors ?? existing.backgroundColors,
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
    locks: input.locks ?? existing.locks,
    lightingStyle: input.lightingStyle ?? existing.lightingStyle,
    dimension: input.dimension ?? existing.dimension,
    projectId: input.projectId ?? existing.projectId,
    slogan: input.slogan ?? existing.slogan,
    usagePurpose: input.usagePurpose ?? existing.usagePurpose,
    character: input.character ?? existing.character,
    typography: input.typography ?? existing.typography,
    atmosphere: input.atmosphere ?? existing.atmosphere,
    outputPrefs: input.outputPrefs ?? existing.outputPrefs,
  };

  const locked = applyDnaLocks(existing, proposed);

  const merged: DnaWriteInput = {
    userId,
    name: locked.name ?? existing.name,
    clanName: locked.clanName ?? existing.clanName,
    mascot: locked.mascot ?? existing.mascot,
    styleDirection: locked.styleDirection ?? existing.styleDirection,
    primaryColors: locked.primaryColors ?? existing.primaryColors,
    secondaryColors: locked.secondaryColors ?? existing.secondaryColors,
    accentColors: locked.accentColors ?? existing.accentColors,
    backgroundColors: locked.backgroundColors ?? existing.backgroundColors,
    targetPlatforms:
      input.targetPlatforms ?? existing.platformOptimization.map((p) => p.platform),
    favoriteGenres: locked.favoriteGenres ?? existing.favoriteGenres,
    gamingStyle: locked.gamingStyle ?? existing.gamingStyle,
    brandingStyle: locked.brandingStyle ?? existing.brandingStyle,
    promptStyle: locked.promptStyle ?? existing.promptStyle,
    visualLanguage: locked.visualLanguage ?? existing.visualLanguage,
    animations: locked.animations ?? existing.animations,
    personalGuidelines: locked.personalGuidelines ?? existing.personalGuidelines,
    fonts: locked.fonts ?? existing.fonts,
    brandingRules: locked.brandingRules ?? existing.brandingRules,
    aiAnalysis: locked.aiAnalysis ?? existing.aiAnalysis,
    sourceAssets: locked.sourceAssets ?? existing.sourceAssets,
    targetAudience: locked.targetAudience ?? existing.targetAudience,
    designLanguage: locked.designLanguage ?? existing.designLanguage,
    locks: locked.locks ?? existing.locks,
    lightingStyle: locked.lightingStyle ?? existing.lightingStyle,
    dimension: locked.dimension ?? existing.dimension,
    projectId: locked.projectId ?? existing.projectId,
    slogan: locked.slogan ?? existing.slogan,
    usagePurpose: locked.usagePurpose ?? existing.usagePurpose,
    character: locked.character ?? existing.character,
    typography: locked.typography ?? existing.typography,
    atmosphere: locked.atmosphere ?? existing.atmosphere,
    outputPrefs: locked.outputPrefs ?? existing.outputPrefs,
  };

  const dna = buildDnaDocument(id, merged, existing);
  await persistDnaDocument(dna, userId);
  await saveVersionSnapshot(dna, changeDescription);
  await syncCharacterSidecar(dna);
  return dna;
}

export async function listDnaVersions(dnaId: string, userId: string): Promise<DNAVersion[]> {
  const dna = await getDnaById(dnaId, userId);
  if (!dna) return [];

  if (isDevMode()) {
    return Object.values(devStore.getDnaList())
      .filter((row) => row.dnaId === dnaId)
      .map((row) => row as unknown as DNAVersion)
      .sort((a, b) => b.version - a.version);
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

export async function restoreDnaVersion(
  dnaId: string,
  versionId: string,
  userId: string
): Promise<CreatorDNA> {
  const current = await getDnaById(dnaId, userId);
  if (!current) throw new Error('DNA not found');

  const versions = await listDnaVersions(dnaId, userId);
  const found = versions.find((v) => v.id === versionId);
  if (!found?.snapshot) throw new Error('Version not found');

  const snap = normalizeDna(found.snapshot);
  if (snap.userId !== userId) throw new Error('DNA not found');

  const restored: CreatorDNA = {
    ...snap,
    id: dnaId,
    userId,
    version: current.version + 1,
    isActive: true,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await persistDnaDocument(restored, userId);
  await saveVersionSnapshot(restored, `Wiederhergestellt aus Version ${found.version}`);
  await syncCharacterSidecar(restored);
  return restored;
}

export async function resolveDnaForRequest(
  userId: string,
  projectId?: string
): Promise<{ dna: CreatorDNA | null; source: 'project' | 'active' | 'none'; projectName?: string }> {
  let project: { ownerId: string; dnaId?: string; name?: string } | null = null;
  if (projectId) {
    const { getProject } = await import('./project.service.js');
    const row = await getProject(projectId, userId);
    if (row) project = { ownerId: row.ownerId, dnaId: row.dnaId, name: row.name };
  }

  const projectDna =
    project?.dnaId && project.ownerId === userId ? await getDnaById(project.dnaId, userId) : null;
  const activeDna = await getActiveDna(userId);
  const picked = pickDnaForRequest({ userId, project, projectDna, activeDna });
  return { ...picked, projectName: project?.name };
}

export async function applyAnalysisToDna(
  dnaId: string,
  userId: string,
  analysis: DNAAnalysis
): Promise<CreatorDNA> {
  const existing = await getDnaById(dnaId, userId);
  if (!existing) throw new Error('DNA not found');
  const hexes = analysis.colorPalette.map((c) => c.hex).filter(Boolean);
  const primary = analysis.colorPalette.filter((c) => c.usage === 'primary').map((c) => c.hex);
  const secondary = analysis.colorPalette.filter((c) => c.usage === 'secondary').map((c) => c.hex);
  const accent = analysis.colorPalette.filter((c) => c.usage === 'accent').map((c) => c.hex);
  const patch = mergeAnalysisIntoDna(existing, {
    styleDirection: analysis.detectedStyle,
    ...(hexes.length
      ? {
          primaryColors: primary.length ? primary : hexes.slice(0, 2),
          secondaryColors: secondary.length ? secondary : hexes.slice(2, 4),
          accentColors: accent.length ? accent : hexes.slice(4, 6),
        }
      : {}),
    mascot: analysis.character,
    character: analysis.characterStructured ?? (analysis.character
      ? { present: true, description: analysis.character, traits: analysis.recurringTraits }
      : undefined),
    typography: analysis.typography ?? (analysis.typographyStyle
      ? { character: analysis.typographyStyle }
      : undefined),
    lightingStyle: analysis.lightingStyle,
    dimension: analysis.dimension,
    atmosphere: analysis.atmosphere ?? (analysis.lightingStyle
      ? { lighting: analysis.lightingStyle }
      : undefined),
    aiAnalysis: analysis,
  });
  return updateDna(dnaId, userId, { userId, name: existing.name, ...patch }, 'Logo-Analyse übernommen');
}

export async function analyzeAssets(
  colors: string[],
  styleHint?: StyleDirection,
  imageDataUrl?: string
): Promise<DNAAnalysis> {
  return analyzeCreatorAssets({ colors, imageDataUrl, styleHint });
}
