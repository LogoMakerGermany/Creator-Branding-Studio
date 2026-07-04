import type { LogoGenerationOptions } from '../studio';
import { applyLogoBackgroundSelection, type LogoStudioBackgroundId } from './logo-backgrounds';
import { DEFAULT_LOGO_AI_SETTINGS } from './logo-ai-settings';
import { DEFAULT_LOGO_CAMERA } from './logo-camera';
import { DEFAULT_LOGO_DETAILS } from './logo-details';
import { DEFAULT_LOGO_LIGHTING } from './logo-lighting';
import { DEFAULT_LOGO_TYPOGRAPHY } from './logo-typography';
import type { LogoEffectId } from './logo-effects';
import type { LogoMaterialId } from './logo-materials';
import type { LogoStudioStylePreset } from './logo-style-presets';

export interface LogoStudioTemplate {
  id: string;
  label: string;
  description: string;
  game: string;
  promptPhrase: string;
  accent: string;
  magikStyle: LogoStudioStylePreset;
  magikLogoArt: LogoGenerationOptions['magikLogoArt'];
  colors: [string, string, string];
  logoMaterial: LogoMaterialId;
  logoMaterialIntensity: number;
  logoEffects: LogoEffectId[];
  logoBackground: LogoStudioBackgroundId;
  logoSubtitle?: string;
  logoLighting?: Partial<typeof DEFAULT_LOGO_LIGHTING>;
  logoCamera?: Partial<typeof DEFAULT_LOGO_CAMERA>;
  logoDetails?: Partial<typeof DEFAULT_LOGO_DETAILS>;
  logoTypography?: Partial<typeof DEFAULT_LOGO_TYPOGRAPHY>;
  logoAiSettings?: Partial<typeof DEFAULT_LOGO_AI_SETTINGS>;
}

export const LOGO_STUDIO_TEMPLATES: LogoStudioTemplate[] = [
  {
    id: 'cod',
    label: 'Call of Duty',
    description: 'Militärisch, rauchig, taktisch — Modern Warfare Energy',
    game: 'Call of Duty',
    promptPhrase: 'Call of Duty modern military tactical warfare aesthetic, gritty spec-ops emblem',
    accent: '#c4a035',
    magikStyle: 'Military',
    magikLogoArt: 'ultra-cinematic-3d',
    colors: ['#3d4f2f', '#1a1a1a', '#c4a035'],
    logoMaterial: 'titan',
    logoMaterialIntensity: 88,
    logoEffects: ['smoke', 'sparks'],
    logoBackground: 'black',
    logoSubtitle: 'Gaming',
    logoLighting: { glow: 40, shadow: 80, light: 75, rimLight: 70, bloom: 45 },
    logoTypography: { fontFamily: 'military', weight: 88, outline: 60 },
    logoAiSettings: { promptStrength: 82, styleAdherence: 80, qualityFocus: 85 },
  },
  {
    id: 'fortnite',
    label: 'Fortnite',
    description: 'Bunt, dynamisch, cartoonig — Battle Royale Pop',
    game: 'Fortnite',
    promptPhrase: 'Fortnite vibrant battle royale cartoon style, playful bold shapes and energy',
    accent: '#7c3aed',
    magikStyle: 'Cartoon',
    magikLogoArt: 'ultra-3d',
    colors: ['#22d3ee', '#7c3aed', '#fbbf24'],
    logoMaterial: 'neon',
    logoMaterialIntensity: 75,
    logoEffects: ['energy', 'particles'],
    logoBackground: 'gradient',
    logoSubtitle: 'Gaming',
    logoLighting: { glow: 85, bloom: 80, light: 70, rimLight: 75 },
    logoTypography: { fontFamily: 'display', size: 70, glow: 65 },
    logoAiSettings: { creativity: 70, variation: 60 },
  },
  {
    id: 'gta',
    label: 'GTA',
    description: 'Urban, dunkel, street — Los Santos Vibe',
    game: 'GTA',
    promptPhrase: 'GTA urban crime open-world aesthetic, street luxury and neon city grit',
    accent: '#f97316',
    magikStyle: 'Dark',
    magikLogoArt: 'ultra-cinematic-3d',
    colors: ['#7c3aed', '#0f172a', '#f97316'],
    logoMaterial: 'metall',
    logoMaterialIntensity: 80,
    logoEffects: ['smoke', 'sparks'],
    logoBackground: 'city',
    logoSubtitle: 'Gaming',
    logoLighting: { shadow: 70, glow: 55, hdr: 65 },
    logoTypography: { fontFamily: 'script', weight: 82, outline: 50 },
  },
  {
    id: 'valorant',
    label: 'Valorant',
    description: 'Clean Esports, scharf, futuristisch — Agent Style',
    game: 'Valorant',
    promptPhrase: 'Valorant clean tactical esports aesthetic, sharp angles and neon accents',
    accent: '#ff4655',
    magikStyle: 'Esports',
    magikLogoArt: 'ultra-cinematic-3d',
    colors: ['#ff4655', '#0f1923', '#ece8e1'],
    logoMaterial: 'carbon',
    logoMaterialIntensity: 82,
    logoEffects: ['laser', 'energy'],
    logoBackground: 'black',
    logoSubtitle: 'Esports',
    logoLighting: { glow: 60, rimLight: 80, reflections: 75 },
    logoTypography: { fontFamily: 'futuristic', weight: 75 },
    logoDetails: { sharpness: 80 },
    logoAiSettings: { styleAdherence: 85, coherence: 80 },
  },
  {
    id: 'cs2',
    label: 'Counter-Strike',
    description: 'Minimal, präzise, metallic — Pro Esports',
    game: 'Counter-Strike',
    promptPhrase: 'Counter-Strike professional esports emblem, precise minimal tactical read',
    accent: '#de9b35',
    magikStyle: 'Esports',
    magikLogoArt: '3d',
    colors: ['#de9b35', '#1b2838', '#2a475e'],
    logoMaterial: 'metall',
    logoMaterialIntensity: 90,
    logoEffects: ['sparks'],
    logoBackground: 'transparent',
    logoSubtitle: 'Esports',
    logoDetails: { sharpness: 88, contrast: 75, detail: 65 },
    logoTypography: { fontFamily: 'esports', weight: 85, outline: 45 },
  },
  {
    id: 'lol',
    label: 'League of Legends',
    description: 'Fantasy, magisch, premium — Summoner\'s Rift',
    game: 'League of Legends',
    promptPhrase: 'League of Legends epic fantasy MOBA aesthetic, magical runes and premium gold',
    accent: '#c89b3c',
    magikStyle: 'Fantasy',
    magikLogoArt: 'ultra-cinematic-3d',
    colors: ['#c89b3c', '#091428', '#0ac8b9'],
    logoMaterial: 'gold',
    logoMaterialIntensity: 85,
    logoEffects: ['magic', 'energy'],
    logoBackground: 'galaxy',
    logoSubtitle: 'Esports',
    logoLighting: { glow: 70, bloom: 65, rimLight: 72 },
    logoTypography: { fontFamily: 'gothic', weight: 80, glow: 55 },
  },
  {
    id: 'minecraft',
    label: 'Minecraft',
    description: 'Blockig, natur, verspielt — Crafting World',
    game: 'Minecraft',
    promptPhrase: 'Minecraft blocky voxel crafting aesthetic, natural wood and stone charm',
    accent: '#5d8c2e',
    magikStyle: 'Cartoon',
    magikLogoArt: '3d',
    colors: ['#5d8c2e', '#8b5a2b', '#3b3b3b'],
    logoMaterial: 'wood',
    logoMaterialIntensity: 70,
    logoEffects: ['particles'],
    logoBackground: 'forest',
    logoSubtitle: 'Gaming',
    logoDetails: { realism: 40, detail: 55 },
    logoTypography: { fontFamily: 'retro', size: 62, weight: 70 },
    logoAiSettings: { creativity: 60, styleAdherence: 75 },
  },
  {
    id: 'apex',
    label: 'Apex Legends',
    description: 'Sci-Fi, holografisch, speed — Legend Badge',
    game: 'Apex Legends',
    promptPhrase: 'Apex Legends futuristic hero shooter aesthetic, holographic tech and speed',
    accent: '#da292a',
    magikStyle: 'Sci-Fi',
    magikLogoArt: 'ultra-cinematic-3d',
    colors: ['#da292a', '#111111', '#00ffc8'],
    logoMaterial: 'hologram',
    logoMaterialIntensity: 78,
    logoEffects: ['energy', 'laser', 'particles'],
    logoBackground: 'space',
    logoSubtitle: 'Esports',
    logoLighting: { glow: 75, lensFlare: 60, bloom: 70 },
    logoTypography: { fontFamily: 'futuristic', glow: 70, letterSpacing: 55 },
  },
  {
    id: 'rust',
    label: 'Rust',
    description: 'Survival, rau, apokalyptisch — Wasteland',
    game: 'Rust',
    promptPhrase: 'Rust survival wasteland aesthetic, rough metal rust and brutal atmosphere',
    accent: '#cd412b',
    magikStyle: 'Dark',
    magikLogoArt: '3d',
    colors: ['#cd412b', '#3d2914', '#6b6b6b'],
    logoMaterial: 'stone',
    logoMaterialIntensity: 85,
    logoEffects: ['smoke', 'sparks', 'fog'],
    logoBackground: 'fog',
    logoSubtitle: 'Gaming',
    logoDetails: { texture: 80, realism: 70, contrast: 72 },
    logoTypography: { fontFamily: 'horror', weight: 90, outline: 55 },
  },
  {
    id: 'r6',
    label: 'Rainbow Six',
    description: 'Taktisch, präzise, Operator — Siege Style',
    game: 'Rainbow Six',
    promptPhrase: 'Rainbow Six Siege tactical operator aesthetic, precise military tech emblem',
    accent: '#00b4ff',
    magikStyle: 'Military',
    magikLogoArt: 'ultra-cinematic-3d',
    colors: ['#00b4ff', '#1a1a2e', '#e94560'],
    logoMaterial: 'carbon',
    logoMaterialIntensity: 86,
    logoEffects: ['laser', 'smoke'],
    logoBackground: 'black',
    logoSubtitle: 'Esports',
    logoCamera: { zoom: 68, angle: 38, depthOfField: 60 },
    logoTypography: { fontFamily: 'military', weight: 82, letterSpacing: 52 },
    logoAiSettings: { promptStrength: 88, coherence: 78 },
  },
  {
    id: 'pubg',
    label: 'PUBG',
    description: 'Battle Royale, military, gritty — Drop Zone',
    game: 'PUBG',
    promptPhrase: 'PUBG battle royale military survival aesthetic, gritty parachute drop energy',
    accent: '#f2a900',
    magikStyle: 'Military',
    magikLogoArt: 'ultra-3d',
    colors: ['#f2a900', '#2d2d2d', '#4a6741'],
    logoMaterial: 'metall',
    logoMaterialIntensity: 82,
    logoEffects: ['smoke', 'fog'],
    logoBackground: 'fog',
    logoSubtitle: 'Gaming',
  },
  {
    id: 'freefire',
    label: 'Free Fire',
    description: 'Mobile BR, neon, aggressive — Fast Action',
    game: 'Free Fire',
    promptPhrase: 'Free Fire mobile battle royale aesthetic, aggressive neon action emblem',
    accent: '#ff6b00',
    magikStyle: 'Neon',
    magikLogoArt: 'ultra-3d',
    colors: ['#ff6b00', '#1a0a00', '#ffd700'],
    logoMaterial: 'neon',
    logoMaterialIntensity: 80,
    logoEffects: ['fire', 'energy'],
    logoBackground: 'fire',
    logoSubtitle: 'Gaming',
    logoLighting: { glow: 90, bloom: 85 },
    logoTypography: { fontFamily: 'neon', glow: 85 },
  },
  {
    id: 'eafc',
    label: 'EA FC',
    description: 'Sport, premium, clean — Football Club',
    game: 'EA FC',
    promptPhrase: 'EA FC football club premium sports branding aesthetic, clean crest design',
    accent: '#00ff87',
    magikStyle: 'Premium',
    magikLogoArt: '3d',
    colors: ['#00ff87', '#0a1628', '#ffffff'],
    logoMaterial: 'gold',
    logoMaterialIntensity: 75,
    logoEffects: ['energy'],
    logoBackground: 'gradient',
    logoSubtitle: 'Creator',
    logoDetails: { sharpness: 75, contrast: 65, saturation: 55 },
    logoTypography: { fontFamily: 'display', weight: 72, letterSpacing: 40 },
  },
];

const TEMPLATE_BY_ID = Object.fromEntries(LOGO_STUDIO_TEMPLATES.map((t) => [t.id, t])) as Record<
  string,
  LogoStudioTemplate
>;

export function getLogoTemplate(id: string): LogoStudioTemplate | undefined {
  return TEMPLATE_BY_ID[id];
}

export function resolveLogoTemplate(opts: LogoGenerationOptions): string | null {
  const id = opts.logoTemplate;
  if (!id || !(id in TEMPLATE_BY_ID)) return null;
  return id;
}

/** Wendet eine Vorlage auf das Formular an */
export function applyLogoTemplate(templateId: string, form: LogoGenerationOptions): LogoGenerationOptions {
  if (!templateId.trim()) {
    return { ...form, logoTemplate: undefined };
  }

  const template = getLogoTemplate(templateId);
  if (!template) return form;

  const [primary, secondary, accent] = template.colors;
  const bgPatch = applyLogoBackgroundSelection(template.logoBackground, form);

  return {
    ...form,
    ...bgPatch,
    logoTemplate: templateId,
    game: template.game,
    logoSubtitle: template.logoSubtitle ?? form.logoSubtitle,
    magikStyle: template.magikStyle,
    magikLogoArt: template.magikLogoArt,
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: accent,
    glowColor: accent,
    backgroundColor: secondary,
    logoGradientFrom: primary,
    logoGradientTo: secondary,
    selectedColors: [primary, secondary, accent, accent, secondary],
    logoMaterial: template.logoMaterial,
    logoMaterialIntensity: template.logoMaterialIntensity,
    logoEffects: [...template.logoEffects],
    logoLighting: { ...DEFAULT_LOGO_LIGHTING, ...template.logoLighting },
    logoCamera: { ...DEFAULT_LOGO_CAMERA, ...template.logoCamera },
    logoDetails: { ...DEFAULT_LOGO_DETAILS, ...template.logoDetails },
    logoTypography: { ...DEFAULT_LOGO_TYPOGRAPHY, ...template.logoTypography },
    logoAiSettings: { ...DEFAULT_LOGO_AI_SETTINGS, ...template.logoAiSettings },
    customPromptOverride: undefined,
  };
}

/** Franchise-Phrase für MAGIK Prompts */
export function buildLogoTemplatePromptPhrase(opts: LogoGenerationOptions): string | null {
  const id = resolveLogoTemplate(opts);
  if (!id) return null;
  const template = getLogoTemplate(id);
  if (!template) return null;
  return `FRANCHISE TEMPLATE (${template.label}): ${template.promptPhrase}`;
}

export function randomLogoTemplate(): string {
  return LOGO_STUDIO_TEMPLATES[Math.floor(Math.random() * LOGO_STUDIO_TEMPLATES.length)]!.id;
}
