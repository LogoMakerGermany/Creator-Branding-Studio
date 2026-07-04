export const LOGO_STUDIO_MODE_STORAGE_KEY = 'ucbs-logo-studio-mode';

export type LogoStudioMode = 'beginner' | 'pro';

export const DEFAULT_LOGO_STUDIO_MODE: LogoStudioMode = 'beginner';

export function isLogoStudioProMode(mode: LogoStudioMode): boolean {
  return mode === 'pro';
}

export function readLogoStudioMode(): LogoStudioMode {
  try {
    const stored = localStorage.getItem(LOGO_STUDIO_MODE_STORAGE_KEY);
    return stored === 'pro' ? 'pro' : 'beginner';
  } catch {
    return DEFAULT_LOGO_STUDIO_MODE;
  }
}

export function writeLogoStudioMode(mode: LogoStudioMode) {
  try {
    localStorage.setItem(LOGO_STUDIO_MODE_STORAGE_KEY, mode);
  } catch {
    /* storage blocked */
  }
}

/** Abschnitte, die nur im Profi-Modus sichtbar sind */
export const LOGO_PRO_ONLY_SECTIONS = [
  'lighting',
  'material',
  'effects',
  'camera',
  'details',
  'typography',
  'ai-settings',
  'live-prompt',
  'magik-advanced',
  'improvement-chips',
] as const;

export type LogoProOnlySection = (typeof LOGO_PRO_ONLY_SECTIONS)[number];

export function isLogoProSectionVisible(section: LogoProOnlySection, mode: LogoStudioMode): boolean {
  return isLogoStudioProMode(mode);
}
