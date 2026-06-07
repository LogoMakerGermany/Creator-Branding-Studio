import type { BrandDNA, WizardPayload } from '@cbs/shared';
import {
  analyzeBrandDna,
  buildBrandingStyleFromWizard,
  suggestColorsForWizard,
  type BrandDnaAnalysis,
} from '@cbs/shared';
import { createDefaultDNA } from '@cbs/shared';

export function applyWizardToDna(projectId: string, wizard: WizardPayload): BrandDNA {
  const analysis = analyzeBrandDna(wizard);
  const creatorName = wizard.creatorName.trim();
  const suggested = wizard.useDefaultColors !== false && (!wizard.primaryColors?.length)
    ? suggestColorsForWizard(wizard.niche, wizard.visualStyle)
    : null;

  const dna = createDefaultDNA(projectId, creatorName);
  dna.brandingStyle = buildBrandingStyleFromWizard(wizard);
  dna.primaryColors = analysis.colorPalette.primary;
  dna.secondaryColors = analysis.colorPalette.secondary;
  dna.accentColors = analysis.colorPalette.accent;
  dna.fonts = analysis.fonts;
  dna.lightBehavior = analysis.lightStyle;
  dna.textureBehavior = analysis.effectStyle;
  dna.platformPreferences = [wizard.platform];
  dna.niche = wizard.niche;
  dna.visualStyle = wizard.visualStyle;
  dna.clanName = wizard.clanName;
  dna.targetAudience = analysis.targetAudience;
  dna.effectStyle = analysis.effectStyle;
  dna.threeDStyle = analysis.threeDStyle;
  dna.animationStyle = analysis.animationStyle;
  dna.brandDnaSummary = analysis.brandDnaSummary;
  dna.characters = wizard.clanName
    ? [`${creatorName} mascot`, `${wizard.clanName} clan identity`]
    : [`${creatorName} mascot`];
  if (wizard.slogan) dna.symbols = [...dna.symbols, 'slogan motif'];
  dna.extractedFrom = { type: 'name', sourceRef: creatorName };

  if (!wizard.primaryColors?.length && suggested) {
    dna.primaryColors = suggested.primary;
    dna.accentColors = suggested.accent;
  } else if (wizard.primaryColors?.length) {
    dna.primaryColors = wizard.primaryColors;
    dna.accentColors = wizard.accentColors?.length ? wizard.accentColors : dna.accentColors;
  }

  return dna;
}

export { analyzeBrandDna, type BrandDnaAnalysis };
