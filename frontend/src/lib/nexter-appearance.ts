import {
  NEXTER_ACCENT_PRESETS,
  DEFAULT_NEXTER_ACCENT_PRESET,
  DEFAULT_NEXTER_UI_THEME,
  normalizeHexColor,
  type NexterPreferences,
  type NexterUiTheme,
} from '@ucbs/shared';

function resolvedTheme(uiTheme: NexterUiTheme): 'dark' | 'light' {
  if (uiTheme === 'light') return 'light';
  if (uiTheme === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export type AppearanceDraft = Pick<
  NexterPreferences,
  'uiTheme' | 'accentPreset' | 'customPrimary' | 'customAccent'
>;

export function applyNexterAppearance(prefs?: Partial<AppearanceDraft> | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const uiTheme = prefs?.uiTheme ?? DEFAULT_NEXTER_UI_THEME;
  const accentId =
    prefs?.accentPreset && prefs.accentPreset in NEXTER_ACCENT_PRESETS
      ? prefs.accentPreset
      : DEFAULT_NEXTER_ACCENT_PRESET;
  const preset = NEXTER_ACCENT_PRESETS[accentId] ?? NEXTER_ACCENT_PRESETS[DEFAULT_NEXTER_ACCENT_PRESET];
  const customPrimary = normalizeHexColor(prefs?.customPrimary);
  const customAccent = normalizeHexColor(prefs?.customAccent);
  const cyan = customPrimary ?? preset.cyan;
  const purple = customAccent ?? preset.purple;
  const green = customAccent ?? preset.green;
  const theme = resolvedTheme(uiTheme);

  root.dataset.theme = theme;
  root.dataset.accent = customPrimary || customAccent ? 'custom' : accentId;
  root.style.setProperty('--ucbs-accent-cyan', cyan);
  root.style.setProperty('--ucbs-accent-purple', purple);
  root.style.setProperty('--ucbs-accent-green', green);
  root.style.setProperty('--color-ucbs-accent-cyan', cyan);
  root.style.setProperty('--color-ucbs-accent-purple', purple);
  root.style.setProperty('--color-ucbs-accent-green', green);
  root.style.setProperty('--color-neon-cyan', cyan);
  root.style.setProperty('--color-neon-purple', purple);
}

export function resetNexterAppearance(): void {
  applyNexterAppearance(null);
}
