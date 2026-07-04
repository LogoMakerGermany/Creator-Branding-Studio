import type { LogoGenerationOptions } from '../studio';

export const LOGO_MATERIAL_PRESETS = [
  { id: 'gold', label: 'Gold', description: 'Luxuriöses Gold, warm & premium', promptPhrase: 'luxury polished gold metal material with rich reflections' },
  { id: 'silver', label: 'Silber', description: 'Chrom-Silber, clean & sharp', promptPhrase: 'brushed silver chrome metal with crisp highlights' },
  { id: 'titan', label: 'Titan', description: 'Schweres Titan, industrial premium', promptPhrase: 'heavy titanium metal material, industrial premium finish' },
  { id: 'metall', label: 'Metall', description: 'Klassisches Esports-Metall', promptPhrase: 'premium metallic esports material with beveled edges' },
  { id: 'carbon', label: 'Carbon', description: 'Carbon-Fiber, sportlich & tech', promptPhrase: 'carbon fiber weave material with glossy clearcoat' },
  { id: 'glass', label: 'Glas', description: 'Transparentes Glas, refraktiv', promptPhrase: 'transparent glass material with refraction and caustics' },
  { id: 'crystal', label: 'Kristall', description: 'Facettierter Kristall', promptPhrase: 'faceted crystal material with prismatic light split' },
  { id: 'diamond', label: 'Diamant', description: 'Brillant & hochwertig', promptPhrase: 'diamond gemstone material with brilliant specular sparkle' },
  { id: 'wood', label: 'Holz', description: 'Natürliche Holzmaserung', promptPhrase: 'natural wood grain material with carved depth' },
  { id: 'stone', label: 'Stein', description: 'Granit / Fels, massiv', promptPhrase: 'rough stone granite material with chiseled weight' },
  { id: 'lava', label: 'Lava', description: 'Glühende Lava, vulkanisch', promptPhrase: 'molten lava material with emissive cracks and heat glow' },
  { id: 'ice', label: 'Eis', description: 'Gefroren, kristallklar', promptPhrase: 'frozen ice material with frost and cold refraction' },
  { id: 'neon', label: 'Neon', description: 'Leuchtendes Neon-Material', promptPhrase: 'neon emissive material with electric glow tubes' },
  { id: 'hologram', label: 'Hologramm', description: 'Futuristisches Hologramm', promptPhrase: 'holographic iridescent material with scanline shimmer' },
] as const;

export type LogoMaterialId = (typeof LOGO_MATERIAL_PRESETS)[number]['id'];

export const LOGO_MATERIAL_GROUPS: { id: string; label: string; materials: LogoMaterialId[] }[] = [
  { id: 'precious', label: 'Edel & Premium', materials: ['gold', 'silver', 'diamond'] },
  { id: 'metal', label: 'Metall & Tech', materials: ['titan', 'metall', 'carbon'] },
  { id: 'glass', label: 'Glas & Kristall', materials: ['glass', 'crystal', 'hologram'] },
  { id: 'nature', label: 'Natur & Elemente', materials: ['wood', 'stone', 'lava', 'ice'] },
  { id: 'energy', label: 'Energy', materials: ['neon'] },
];

export const DEFAULT_LOGO_MATERIAL: LogoMaterialId = 'metall';

const MATERIAL_BY_ID = Object.fromEntries(LOGO_MATERIAL_PRESETS.map((m) => [m.id, m])) as Record<
  LogoMaterialId,
  (typeof LOGO_MATERIAL_PRESETS)[number]
>;

export function resolveLogoMaterial(opts: LogoGenerationOptions): LogoMaterialId {
  const id = opts.logoMaterial as LogoMaterialId | undefined;
  if (id && id in MATERIAL_BY_ID) return id;
  return DEFAULT_LOGO_MATERIAL;
}

export function getLogoMaterialPreset(id: LogoMaterialId) {
  return MATERIAL_BY_ID[id];
}

/** Material-Phrase für MAGIK Prompts */
export function buildLogoMaterialPromptPhrase(opts: LogoGenerationOptions): string {
  const id = resolveLogoMaterial(opts);
  const preset = getLogoMaterialPreset(id);
  const blend = opts.logoMaterialIntensity ?? 100;
  const intensity =
    blend <= 25 ? 'subtle accent' : blend <= 50 ? 'balanced' : blend <= 75 ? 'dominant' : 'full material takeover';
  return `MATERIAL LIBRARY: ${preset.promptPhrase}, ${intensity} material presence (${blend}%)`;
}

export function randomLogoMaterial(): LogoMaterialId {
  const idx = Math.floor(Math.random() * LOGO_MATERIAL_PRESETS.length);
  return LOGO_MATERIAL_PRESETS[idx]!.id;
}

/** Vorschau-Styling-Hinweise */
export function logoMaterialPreviewStyle(materialId: LogoMaterialId) {
  switch (materialId) {
    case 'gold':
      return { borderStyle: 'solid', sheen: 'linear-gradient(135deg, #fcd34d, #b45309)' };
    case 'silver':
      return { borderStyle: 'solid', sheen: 'linear-gradient(135deg, #e5e7eb, #6b7280)' };
    case 'glass':
    case 'crystal':
    case 'hologram':
      return { borderStyle: 'dashed', sheen: 'linear-gradient(135deg, rgba(255,255,255,0.35), rgba(34,211,238,0.25))' };
    case 'neon':
      return { borderStyle: 'solid', sheen: 'linear-gradient(135deg, #ec4899, #22d3ee)' };
    case 'lava':
      return { borderStyle: 'solid', sheen: 'linear-gradient(135deg, #ef4444, #f97316)' };
    case 'ice':
      return { borderStyle: 'solid', sheen: 'linear-gradient(135deg, #bae6fd, #38bdf8)' };
    default:
      return { borderStyle: 'solid', sheen: undefined };
  }
}
