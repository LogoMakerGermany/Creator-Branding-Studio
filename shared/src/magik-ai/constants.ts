import type { MagikAiPersonality, MagikAiSettings } from './types';

export const MAGIK_AI_PHASE = 'preparation' as const;

/** Global deaktiviert bis Phase 2. */
export const MAGIK_AI_ASSISTANT_ENABLED = false;

export const DEFAULT_MAGIK_AI_SETTINGS: MagikAiSettings = {
  assistantEnabled: false,
  animationsEnabled: false,
  voiceEnabled: false,
  personalityId: 'mentor',
  language: 'de',
};

export const MAGIK_AI_PERSONALITIES: MagikAiPersonality[] = [
  {
    id: 'mentor',
    label: 'Mentor',
    description: 'Ruhig, strategisch, unterstützend',
    traits: ['klar', 'motivierend', 'fokussiert'],
  },
  {
    id: 'hype',
    label: 'Hype',
    description: 'Energiegeladen und esports-orientiert',
    traits: ['dynamisch', 'begeistert', 'direkt'],
  },
  {
    id: 'strategist',
    label: 'Strategist',
    description: 'Analytisch und markenbewusst',
    traits: ['präzise', 'markenstark', 'strukturiert'],
  },
  {
    id: 'creative',
    label: 'Creative',
    description: 'Visuell und ideenreich',
    traits: ['inspirierend', 'kreativ', 'mutig'],
  },
  {
    id: 'custom',
    label: 'Individuell',
    description: 'Später personalisierbar',
    traits: ['anpassbar'],
  },
];
