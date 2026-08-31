import type { MagikAiPersonality, MagikAiSettings } from './types';

export const MAGIK_AI_PHASE = 'phase3' as const;

export const MAGIK_AI_ASSISTANT_ENABLED = true;

export const DEFAULT_MAGIK_AI_SETTINGS: MagikAiSettings = {
  assistantEnabled: true,
  animationsEnabled: true,
  voiceEnabled: true,
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
