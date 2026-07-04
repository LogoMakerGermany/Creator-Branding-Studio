import type { CharacterEffectId, CharacterEnvironmentId, CharacterPersonalityId, CharacterPoseId } from './types';

export const CHARACTER_POSES: { id: CharacterPoseId; label: string }[] = [
  { id: 'attack', label: 'Angriff' },
  { id: 'defense', label: 'Verteidigung' },
  { id: 'heroic', label: 'Heroisch' },
  { id: 'calm', label: 'Ruhig' },
  { id: 'floating', label: 'Schwebend' },
  { id: 'sprint', label: 'Sprint' },
  { id: 'jump', label: 'Sprung' },
  { id: 'combat-ready', label: 'Kampfbereit' },
];

export const CHARACTER_ENVIRONMENTS: { id: CharacterEnvironmentId; label: string }[] = [
  { id: 'ruins', label: 'Ruinen' },
  { id: 'arena', label: 'Arena' },
  { id: 'space', label: 'Weltraum' },
  { id: 'temple', label: 'Tempel' },
  { id: 'jungle', label: 'Dschungel' },
  { id: 'fire-world', label: 'Feuerwelt' },
  { id: 'ice-world', label: 'Eiswelt' },
  { id: 'cyber-city', label: 'Cyber City' },
  { id: 'abstract', label: 'Abstrakt' },
  { id: 'transparent', label: 'Transparent' },
];

export const CHARACTER_EFFECTS: { id: CharacterEffectId; label: string }[] = [
  { id: 'fire', label: 'Feuer' },
  { id: 'ice', label: 'Eis' },
  { id: 'lightning', label: 'Blitze' },
  { id: 'fog', label: 'Nebel' },
  { id: 'particles', label: 'Partikel' },
  { id: 'magic', label: 'Magie' },
  { id: 'toxic', label: 'Gift' },
  { id: 'cyber', label: 'Cyber' },
  { id: 'space', label: 'Weltraum' },
  { id: 'energy', label: 'Energie' },
  { id: 'smoke', label: 'Rauch' },
  { id: 'lava', label: 'Lava' },
  { id: 'crystals', label: 'Kristalle' },
  { id: 'water', label: 'Wasser' },
  { id: 'sand', label: 'Sand' },
];

export const STYLE_TO_EFFECTS: Record<string, CharacterEffectId[]> = {
  Gaming: ['fire', 'smoke', 'particles', 'energy'],
  Crystal: ['ice', 'crystals', 'fog'],
  Diamond: ['crystals', 'energy', 'particles'],
  Metallic: ['energy', 'particles', 'smoke'],
  Neon: ['cyber', 'energy', 'particles'],
  Cyberpunk: ['cyber', 'energy', 'lightning'],
  'Sci-Fi': ['space', 'energy', 'particles'],
  Futuristic: ['cyber', 'energy', 'lightning'],
  Dark: ['smoke', 'fog', 'energy'],
  Horror: ['fog', 'smoke', 'particles'],
  Fantasy: ['magic', 'fog', 'particles'],
  Cinematic: ['particles', 'smoke', 'energy', 'lightning'],
  Esports: ['particles', 'energy', 'lightning'],
  Military: ['smoke', 'energy', 'particles'],
  Viking: ['energy', 'smoke', 'magic'],
  Medieval: ['magic', 'smoke', 'energy'],
  /** Legacy aliases */
  Fire: ['fire', 'smoke', 'particles', 'lava'],
  Ice: ['ice', 'crystals', 'fog'],
  Toxic: ['toxic', 'smoke', 'particles'],
  Mystisch: ['magic', 'fog', 'particles'],
  'Ultra-Cinematic': ['particles', 'smoke', 'energy', 'lightning'],
  Space: ['space', 'energy', 'particles'],
};

export const BACKGROUND_TO_ENVIRONMENT: Record<string, CharacterEnvironmentId> = {
  transparent: 'transparent',
  dark: 'abstract',
  fire: 'fire-world',
  ice: 'ice-world',
  lightning: 'arena',
  fog: 'ruins',
  space: 'space',
  ruins: 'ruins',
  abstract: 'abstract',
  arena: 'arena',
};

export const STYLE_TO_PERSONALITY: Record<string, CharacterPersonalityId> = {
  Gaming: 'aggressive',
  Crystal: 'tactical',
  Dark: 'dark',
  Horror: 'dark',
  Esports: 'aggressive',
  Fantasy: 'heroic',
  Cyberpunk: 'tactical',
  Anime: 'playful',
  Military: 'tactical',
  Viking: 'aggressive',
  Cinematic: 'heroic',
  Premium: 'heroic',
  Fire: 'aggressive',
  Ice: 'tactical',
  Mystisch: 'mysterious',
  'Ultra-Cinematic': 'heroic',
};

export const STYLE_TO_POSE: Record<string, CharacterPoseId> = {
  Gaming: 'attack',
  Crystal: 'defense',
  Esports: 'combat-ready',
  Fantasy: 'heroic',
  Horror: 'calm',
  'Sci-Fi': 'floating',
  Cinematic: 'heroic',
  Military: 'combat-ready',
  Fire: 'attack',
  Ice: 'defense',
  Space: 'floating',
  'Ultra-Cinematic': 'heroic',
};
