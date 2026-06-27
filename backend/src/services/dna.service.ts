import type { CreatorDNA, StyleDirection, DNAAnalysis } from '@ucbs/shared';
import { devStore, isDevMode } from '../lib/dev-store.js';
import { getFirestore } from '../config/firebase.js';
import { randomUUID } from 'node:crypto';

function generateId(): string {
  return randomUUID();
}

export async function listDnaByUser(userId: string): Promise<CreatorDNA[]> {
  if (isDevMode()) {
    return devStore.getDnaByUser(userId) as unknown as CreatorDNA[];
  }

  const db = getFirestore();
  const snap = await db
    .collection('creator_dna')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CreatorDNA);
}

export async function getDnaById(id: string, userId: string): Promise<CreatorDNA | null> {
  if (isDevMode()) {
    const dna = devStore.getDna(id);
    if (!dna || dna.userId !== userId) return null;
    return dna as unknown as CreatorDNA;
  }

  const db = getFirestore();
  const doc = await db.collection('creator_dna').doc(id).get();
  if (!doc.exists || doc.data()?.userId !== userId) return null;
  return { id: doc.id, ...doc.data() } as CreatorDNA;
}

export async function getActiveDna(userId: string): Promise<CreatorDNA | null> {
  const all = await listDnaByUser(userId);
  return all.find((d) => d.isActive) ?? null;
}

export interface CreateDnaInput {
  userId: string;
  name: string;
  styleDirection?: StyleDirection;
  primaryColors?: string[];
  secondaryColors?: string[];
  accentColors?: string[];
  targetPlatforms?: string[];
  aiAnalysis?: DNAAnalysis;
  sourceAssets?: CreatorDNA['sourceAssets'];
}

export async function createDna(input: CreateDnaInput): Promise<CreatorDNA> {
  const now = new Date().toISOString();
  const id = generateId();

  const existing = await listDnaByUser(input.userId);
  const isFirst = existing.length === 0;

  const dna: CreatorDNA = {
    id,
    userId: input.userId,
    name: input.name,
    type: 'creator',
    primaryColors: input.primaryColors ?? [],
    secondaryColors: input.secondaryColors ?? [],
    accentColors: input.accentColors ?? [],
    styleDirection: input.styleDirection ?? 'gaming',
    fonts: [
      { name: 'Inter', role: 'primary', source: 'google' },
      { name: 'Space Grotesk', role: 'secondary', source: 'google' },
    ],
    brandingRules: buildBrandingRules(input),
    platformOptimization: buildPlatformConfig(input.targetPlatforms ?? ['twitch', 'youtube']),
    targetAudience: {
      ageRange: '18-34',
      interests: ['Gaming', 'Streaming'],
      platforms: input.targetPlatforms ?? ['twitch'],
      tone: 'energetic',
      description: 'Creator-Zielgruppe',
    },
    designLanguage: {
      mood: input.styleDirection === 'neon' ? ['futuristic', 'bold'] : ['dynamic', 'modern'],
      keywords: [input.styleDirection ?? 'gaming'],
      visualElements: ['gradients', 'sharp edges'],
      doNotUse: ['cluttered layouts'],
    },
    sourceAssets: input.sourceAssets ?? [],
    aiAnalysis: input.aiAnalysis,
    version: 1,
    isActive: isFirst,
    createdAt: now,
    updatedAt: now,
  };

  if (isDevMode()) {
    if (isFirst) {
      // deactivate others not needed for first
    } else if (dna.isActive) {
      for (const d of existing) {
        if (d.isActive) {
          devStore.saveDna(d.id, { ...d, isActive: false });
        }
      }
    }
    devStore.saveDna(id, dna as unknown as Record<string, unknown>);
    return dna;
  }

  const db = getFirestore();
  if (isFirst) {
    await db.collection('creator_dna').doc(id).set(dna);
    return dna;
  }

  const batch = db.batch();
  if (dna.isActive) {
    for (const d of existing.filter((x) => x.isActive)) {
      batch.update(db.collection('creator_dna').doc(d.id), { isActive: false });
    }
  }
  batch.set(db.collection('creator_dna').doc(id), dna);
  await batch.commit();
  return dna;
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
  for (const d of all) {
    batch.update(db.collection('creator_dna').doc(d.id), {
      isActive: d.id === id,
      updatedAt: new Date().toISOString(),
    });
  }
  await batch.commit();
  return { ...dna, isActive: true };
}

export async function analyzeAssets(
  colors: string[],
  styleHint?: StyleDirection
): Promise<DNAAnalysis> {
  const palette = colors.slice(0, 6).map((hex, i) => ({
    hex,
    name: `Color ${i + 1}`,
    usage: i === 0 ? 'primary' : i < 3 ? 'secondary' : 'accent',
  }));

  const detectedStyle = styleHint ?? detectStyleFromColors(colors);

  return {
    colorPalette: palette,
    detectedStyle,
    confidence: colors.length > 0 ? 0.85 : 0.5,
    suggestions: [
      'Verwende die Primärfarbe für Logo und Akzente',
      'Sekundärfarben eignen sich für Banner-Hintergründe',
      'Halte Kontrast für Stream-Overlays hoch',
    ],
    analyzedAt: new Date().toISOString(),
  };
}

function detectStyleFromColors(colors: string[]): StyleDirection {
  if (colors.length === 0) return 'gaming';
  const hex = colors[0].replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  if (r > 200 && g < 100 && b > 200) return 'neon';
  if (r < 80 && g < 80 && b < 80) return 'horror';
  if (b > r && b > g) return 'gaming';
  if (r > 180 && g > 100 && b < 80) return 'esports';
  return 'streaming';
}

function buildBrandingRules(input: CreateDnaInput): CreatorDNA['brandingRules'] {
  return [
    {
      id: 'rule-1',
      rule: `Primärfarbe ${input.primaryColors?.[0] ?? '#7C3AED'} für Logo und CTAs`,
      category: 'color',
      priority: 'required',
    },
    {
      id: 'rule-2',
      rule: 'Maximal 3 Schriftarten verwenden',
      category: 'typography',
      priority: 'recommended',
    },
    {
      id: 'rule-3',
      rule: `${input.styleDirection ?? 'gaming'}-Stil konsistent über alle Assets`,
      category: 'imagery',
      priority: 'required',
    },
  ];
}

function buildPlatformConfig(platforms: string[]): CreatorDNA['platformOptimization'] {
  const configs: CreatorDNA['platformOptimization'] = [];
  const map: Record<string, { ratios: string[]; opts: string[] }> = {
    twitch: { ratios: ['1920x480', '800x800'], opts: ['Dark mode optimiert', 'Panel-safe zones'] },
    youtube: { ratios: ['2560x1440', '800x800'], opts: ['Banner safe area', 'Thumbnail-ready'] },
    tiktok: { ratios: ['1080x1920'], opts: ['Vertical-first', 'Bold typography'] },
    instagram: { ratios: ['1080x1080', '1080x1920'], opts: ['Feed & Stories'] },
    discord: { ratios: ['960x540', '128x128'], opts: ['Server banner', 'Icon'] },
  };

  for (const p of platforms) {
    const cfg = map[p];
    if (cfg) {
      configs.push({
        platform: p as CreatorDNA['platformOptimization'][0]['platform'],
        aspectRatios: cfg.ratios,
        optimizations: cfg.opts,
      });
    }
  }
  return configs;
}
