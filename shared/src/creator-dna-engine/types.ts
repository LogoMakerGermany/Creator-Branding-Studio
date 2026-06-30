/** CCD Engine — Character & Creator DNA Typen */

export type CharacterPoseId =
  | 'attack'
  | 'defense'
  | 'heroic'
  | 'calm'
  | 'floating'
  | 'sprint'
  | 'jump'
  | 'combat-ready';

export type CharacterEnvironmentId =
  | 'ruins'
  | 'arena'
  | 'space'
  | 'temple'
  | 'jungle'
  | 'fire-world'
  | 'ice-world'
  | 'cyber-city'
  | 'abstract'
  | 'transparent';

export type CharacterEffectId =
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'fog'
  | 'particles'
  | 'magic'
  | 'toxic'
  | 'cyber'
  | 'space'
  | 'energy'
  | 'smoke'
  | 'lava'
  | 'crystals'
  | 'water'
  | 'sand';

export type CharacterPersonalityId =
  | 'aggressive'
  | 'heroic'
  | 'mysterious'
  | 'tactical'
  | 'chaotic'
  | 'royal'
  | 'dark'
  | 'playful';

/** Visuelle Character DNA — erweiterbar. */
export interface CharacterVisualDna {
  faceShape?: string;
  eyes?: string;
  gazeDirection?: string;
  expression?: string;
  horns?: string;
  wings?: string;
  fur?: string;
  skin?: string;
  scales?: string;
  teeth?: string;
  beard?: string;
  hair?: string;
  helmet?: string;
  mask?: string;
  hood?: string;
  armor?: string;
  clothing?: string;
  jewelry?: string;
  tattoos?: string;
  scars?: string;
}

export interface CharacterColorDna {
  primary: string[];
  secondary: string[];
  accent: string[];
  glow: string[];
  metal: string[];
  lighting: string[];
}

/** Persistente Markenfigur — Herzstück der CCD Engine. */
export interface CharacterDNA {
  id: string;
  userId: string;
  creatorDnaId: string;
  creatorName: string;
  clanName?: string;
  figure: string;
  subFigure?: string;
  personality: CharacterPersonalityId;
  style: string;
  game?: string;
  platform?: string;
  visual: CharacterVisualDna;
  colors: CharacterColorDna;
  effects: CharacterEffectId[];
  pose: CharacterPoseId;
  environment: CharacterEnvironmentId;
  nameAnalysisSummary?: string;
  sourceLogoJobId?: string;
  sourceImageUrl?: string;
  generationCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Creator-Präferenzen — ergänzt bestehende Creator DNA. */
export interface CreatorPreferencesDNA {
  userId: string;
  creatorDnaId: string;
  favoriteColors: string[];
  preferredLogoStyles: string[];
  preferredGames: string[];
  preferredPlatforms: string[];
  preferredFonts: string[];
  preferredBackgrounds: string[];
  preferredEffects: CharacterEffectId[];
  ringLogoPreference: 'yes' | 'no' | 'auto';
  dimensionPreference: '2d' | '3d';
  exportFormats: string[];
  updatedAt: string;
}

/** Stil-DNA für konsistente Generatoren. */
export interface StyleDNA {
  magikStyle: string;
  logoArt: string;
  qualityTier: 'premium' | 'ultra-cinematic';
  moodKeywords: string[];
  visualKeywords: string[];
}

/** Prompt-DNA — kombinierte Blöcke für MAGIK. */
export interface PromptDNABundle {
  characterBlock: string;
  creatorBlock: string;
  styleBlock: string;
  platformBlock: string;
  gameBlock: string;
  combinedPhrase: string;
}

/** Character Evolution — Nutzer entscheidet über Übernahme. */
export interface CharacterEvolutionProposal {
  id: string;
  userId: string;
  characterDnaId: string;
  description: string;
  changes: {
    visual?: Partial<CharacterVisualDna>;
    colors?: Partial<CharacterColorDna>;
    effects?: CharacterEffectId[];
    pose?: CharacterPoseId;
    environment?: CharacterEnvironmentId;
    armor?: string;
    equipment?: string;
  };
  status: 'pending' | 'accepted' | 'rejected';
  sourceJobId?: string;
  createdAt: string;
}

export interface CcdRecommendation {
  id: string;
  type: 'style' | 'color' | 'effect' | 'pose' | 'environment' | 'figure';
  title: string;
  description: string;
  confidence: number;
}

export interface CcdLearningSignal {
  eventType: 'download' | 'favorite' | 'regenerate' | 'delete';
  style?: string;
  game?: string;
  figure?: string;
  background?: string;
  effects?: string[];
}
