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
  Fire: ['fire', 'smoke', 'particles', 'lava'],
  Ice: ['ice', 'crystals', 'fog'],
  Toxic: ['toxic', 'smoke', 'particles'],
  Neon: ['cyber', 'energy', 'particles'],
  Cyberpunk: ['cyber', 'energy', 'lightning'],
  Space: ['space', 'energy', 'particles'],
  Dark: ['smoke', 'fog', 'energy'],
  Horror: ['fog', 'smoke', 'particles'],
  Mystisch: ['magic', 'fog', 'particles'],
  'Ultra-Cinematic': ['particles', 'smoke', 'energy', 'lightning'],
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
  Fire: 'aggressive',
  Ice: 'tactical',
  Dark: 'dark',
  Horror: 'dark',
  Esports: 'aggressive',
  Fantasy: 'heroic',
  Cyberpunk: 'tactical',
  Anime: 'playful',
  Mystisch: 'mysterious',
  'Ultra-Cinematic': 'heroic',
};

export const STYLE_TO_POSE: Record<string, CharacterPoseId> = {
  Fire: 'attack',
  Ice: 'defense',
  Esports: 'combat-ready',
  Fantasy: 'heroic',
  Horror: 'calm',
  Space: 'floating',
  'Ultra-Cinematic': 'heroic',
};
