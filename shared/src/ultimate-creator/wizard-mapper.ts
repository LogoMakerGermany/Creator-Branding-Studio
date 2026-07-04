import type { LogoGenerationOptions } from '../studio';
import type { UltimateCreatorWizardInput } from './types';
import { DEFAULT_MAGIK_LOGO_ART, DEFAULT_MAGIK_STYLE } from '../magik/constants';

export function wizardToLogoOptions(input: UltimateCreatorWizardInput): LogoGenerationOptions {
  const colors = input.colors.filter(Boolean).slice(0, 6);
  return {
    logoName: input.name.trim(),
    clanName: input.clanName?.trim(),
    game: input.game?.trim(),
    platform: input.platforms[0],
    magikMode: 'name',
    magikStyle: input.style || DEFAULT_MAGIK_STYLE,
    magikLogoArt: DEFAULT_MAGIK_LOGO_ART,
    ringLogoMode: 'auto',
    magikBackground: 'transparent',
    transparentBackground: true,
    primaryColor: colors[0] ?? '#22d3ee',
    secondaryColor: colors[1] ?? '#a855f7',
    accentColor: colors[2] ?? '#34d399',
    selectedColors: colors.length ? colors : ['#22d3ee', '#a855f7', '#34d399'],
  };
}

export function buildStyleToken(input: UltimateCreatorWizardInput): string {
  return [input.style, input.game, ...input.colors.slice(0, 3)].filter(Boolean).join('|').toLowerCase();
}
