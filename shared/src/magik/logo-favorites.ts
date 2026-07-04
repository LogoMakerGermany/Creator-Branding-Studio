import type { LogoGenerationOptions } from '../studio';

export const LOGO_FAVORITES_MAX = 32;

export interface SavedLogoFavorite {
  id: string;
  name: string;
  options: LogoGenerationOptions;
  createdAt: string;
  updatedAt: string;
}

/** Entfernt große Upload-Daten vor dem Speichern */
export function sanitizeLogoFavoriteOptions(opts: LogoGenerationOptions): LogoGenerationOptions {
  const copy = { ...opts };
  if (copy.logoBackgroundUpload) {
    copy.logoBackgroundUpload = undefined;
    copy.logoBackgroundUploadName = undefined;
    if (copy.logoBackground === 'custom') {
      copy.logoBackground = 'gradient';
      copy.magikBackground = 'abstract';
    }
  }
  if (copy.customPromptOverride && copy.customPromptOverride.length > 4000) {
    copy.customPromptOverride = copy.customPromptOverride.slice(0, 4000);
  }
  return copy;
}

export function buildLogoFavoriteName(form: LogoGenerationOptions): string {
  const name = form.logoName?.trim();
  if (name) return `${name} · Favorit`;
  if (form.logoTemplate) return `Vorlage · ${form.logoTemplate}`;
  return `Logo-Favorit · ${new Date().toLocaleDateString('de-DE')}`;
}
