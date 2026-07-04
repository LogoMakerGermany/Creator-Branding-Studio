import type { LogoGenerationOptions, LogoAiSettings } from '../studio';

export type LogoAiSettingsKey = keyof LogoAiSettings;

export const LOGO_AI_CONTROLS: {
  key: LogoAiSettingsKey;
  label: string;
  hint: string;
}[] = [
  { key: 'creativity', label: 'Kreativität', hint: 'Experimentierfreude & Überraschung' },
  { key: 'promptStrength', label: 'Prompt-Stärke', hint: 'Wie strikt der Prompt befolgt wird' },
  { key: 'styleAdherence', label: 'Stiltreue', hint: 'Treue zum gewählten Stil' },
  { key: 'variation', label: 'Variation', hint: 'Unterschied zwischen Generierungen' },
  { key: 'coherence', label: 'Kohärenz', hint: 'Marken-Konsistenz & Einheitlichkeit' },
  { key: 'qualityFocus', label: 'Qualitätsfokus', hint: 'AAA-Qualität vs. Speed/Kreativität' },
];

export const DEFAULT_LOGO_AI_SETTINGS: LogoAiSettings = {
  creativity: 55,
  promptStrength: 72,
  styleAdherence: 68,
  variation: 48,
  coherence: 62,
  qualityFocus: 75,
};

function intensityLabel(value: number): string {
  if (value <= 20) return 'low';
  if (value <= 45) return 'moderate';
  if (value <= 70) return 'high';
  if (value <= 85) return 'very high';
  return 'maximum';
}

function creativityPhrase(value: number): string {
  if (value <= 25) return 'safe conservative interpretation, minimal creative deviation';
  if (value <= 45) return 'balanced creative interpretation within brand bounds';
  if (value <= 70) return 'bold creative exploration with fresh visual ideas';
  if (value <= 85) return 'highly experimental creative direction, unexpected fusion';
  return 'maximum creative freedom, wild artistic interpretation';
}

function promptStrengthPhrase(value: number): string {
  if (value <= 25) return 'loose prompt guidance, AI interprets freely';
  if (value <= 45) return 'moderate prompt adherence';
  if (value <= 70) return 'strong prompt adherence, follow instructions closely';
  if (value <= 85) return 'very strict prompt following, precise execution';
  return 'maximum prompt fidelity, exact instruction compliance';
}

function styleAdherencePhrase(value: number): string {
  if (value <= 25) return 'flexible style mixing allowed';
  if (value <= 45) return 'soft style guidance with some freedom';
  if (value <= 70) return 'strong adherence to selected visual style';
  if (value <= 85) return 'strict style lock, no style drift';
  return 'absolute style fidelity, zero deviation from chosen aesthetic';
}

function variationPhrase(value: number): string {
  if (value <= 25) return 'consistent repeatable results, minimal variation';
  if (value <= 45) return 'subtle variation between generations';
  if (value <= 70) return 'noticeable creative variation each generation';
  if (value <= 85) return 'high variation, distinct alternatives each time';
  return 'maximum variation, radically different outputs';
}

function coherencePhrase(value: number): string {
  if (value <= 25) return 'artistic freedom over brand consistency';
  if (value <= 45) return 'balanced coherence with creative room';
  if (value <= 70) return 'strong brand coherence across all elements';
  if (value <= 85) return 'tight unified brand identity, all elements harmonize';
  return 'maximum brand coherence, perfectly unified identity system';
}

function qualityFocusPhrase(value: number): string {
  if (value <= 25) return 'fast sketch quality, prioritize concept speed';
  if (value <= 45) return 'good quality with efficiency balance';
  if (value <= 70) return 'high AAA production quality focus';
  if (value <= 85) return 'ultra premium AAA cinematic quality priority';
  return 'maximum quality at all costs, no compromises';
}

export function resolveLogoAiSettings(opts: LogoGenerationOptions): LogoAiSettings {
  return { ...DEFAULT_LOGO_AI_SETTINGS, ...opts.logoAiSettings };
}

/** KI-Einstellungs-Phrase für MAGIK Prompts */
export function buildLogoAiSettingsPromptPhrase(opts: LogoGenerationOptions): string {
  const ai = resolveLogoAiSettings(opts);
  const parts = [
    `${intensityLabel(ai.creativity)} creativity: ${creativityPhrase(ai.creativity)}`,
    `${intensityLabel(ai.promptStrength)} prompt strength: ${promptStrengthPhrase(ai.promptStrength)}`,
    `${intensityLabel(ai.styleAdherence)} style adherence: ${styleAdherencePhrase(ai.styleAdherence)}`,
    `${intensityLabel(ai.variation)} variation: ${variationPhrase(ai.variation)}`,
    `${intensityLabel(ai.coherence)} coherence: ${coherencePhrase(ai.coherence)}`,
    `${intensityLabel(ai.qualityFocus)} quality focus: ${qualityFocusPhrase(ai.qualityFocus)}`,
  ];
  return `AI GENERATION SETTINGS: ${parts.join('; ')}`;
}

/** 0–1 Faktoren für UI-Vorschau */
export function logoAiSettingsPreviewFactors(opts: LogoGenerationOptions) {
  const ai = resolveLogoAiSettings(opts);
  return {
    creativity: ai.creativity / 100,
    promptStrength: ai.promptStrength / 100,
    styleAdherence: ai.styleAdherence / 100,
    variation: ai.variation / 100,
    coherence: ai.coherence / 100,
    qualityFocus: ai.qualityFocus / 100,
  };
}

/** Kurz-Label für Badge in der Vorschau */
export function logoAiSettingsPreviewLabel(opts: LogoGenerationOptions): string {
  const ai = resolveLogoAiSettings(opts);
  if (ai.creativity >= 75 && ai.variation >= 65) return 'Kreativ';
  if (ai.promptStrength >= 80 && ai.styleAdherence >= 75) return 'Präzise';
  if (ai.qualityFocus >= 80) return 'AAA Fokus';
  if (ai.coherence >= 75) return 'Kohärent';
  return 'Balanced';
}

export function randomLogoAiSettings(): LogoAiSettings {
  const rand = () => Math.floor(Math.random() * 81) + 20;
  return {
    creativity: rand(),
    promptStrength: rand(),
    styleAdherence: rand(),
    variation: rand(),
    coherence: rand(),
    qualityFocus: rand(),
  };
}
