/** Entwicklungsphase des MAGIK AI Assistant — aktuell nur Vorbereitung. */
export type MagikAiPhase = 'preparation' | 'phase2' | 'phase3' | 'phase4';

export type MagikAiPersonalityId =
  | 'mentor'
  | 'hype'
  | 'strategist'
  | 'creative'
  | 'custom';

export type MagikAiAnimationState = 'idle' | 'hidden' | 'disabled';

export type MagikAiMemoryStatus = 'empty' | 'seeding' | 'active' | 'paused';

/** Zukünftiger Begleiter-Avatar — aus Logo-Kontext ableitbar. */
export interface MagikAiAvatar {
  id: string;
  userId: string;
  name: string;
  figure: string;
  sourceLogoContextId?: string;
  imageUrl?: string;
  personalityId?: MagikAiPersonalityId;
  animationState: MagikAiAnimationState;
  memoryStatus: MagikAiMemoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MagikAiPersonality {
  id: MagikAiPersonalityId;
  label: string;
  description: string;
  traits: string[];
}

export interface MagikAiAnimationConfig {
  enabled: boolean;
  idleLoop: boolean;
  reactions: boolean;
}

/** Benutzer-Einstellungen — vorerst größtenteils deaktiviert. */
export interface MagikAiSettings {
  assistantEnabled: boolean;
  animationsEnabled: boolean;
  voiceEnabled: boolean;
  personalityId: MagikAiPersonalityId;
  language: string;
  updatedAt?: string;
}

/** Nach Logo-Generierung gespeichert — Grundlage für Phase 2. */
export interface MagikLogoContextRecord {
  id: string;
  userId: string;
  jobId: string;
  variant: 'a' | 'b';
  logoName: string;
  style: string;
  colors: string[];
  figure: string;
  background: string;
  prompt: string;
  imageUrl?: string;
  game?: string;
  logoArt?: string;
  magikMode?: string;
  createdAt: string;
}

/** Platzhalter für zukünftige Konversationen. */
export interface MagikAiConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface MagikAiConversationSession {
  id: string;
  userId: string;
  messages: MagikAiConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

/** Platzhalter für Gedächtnis-Einträge. */
export interface MagikAiMemoryEntry {
  id: string;
  userId: string;
  key: string;
  value: string;
  source: 'logo' | 'interaction' | 'preference';
  createdAt: string;
}

/** Platzhalter für Empfehlungen. */
export interface MagikAiRecommendation {
  id: string;
  type: 'style' | 'color' | 'figure' | 'generator';
  title: string;
  description: string;
  confidence: number;
}

export interface MagikAiStatusResponse {
  phase: MagikAiPhase;
  enabled: boolean;
  message: string;
}
