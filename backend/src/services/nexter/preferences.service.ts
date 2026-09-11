import {
  NEXTER_LANGUAGES,
  NEXTER_UI_THEMES,
  NEXTER_PLATFORM_IDS,
  NEXTER_CREATION_INTEREST_IDS,
  NEXTER_STYLE_PREFERENCE_IDS,
  NEXTER_CREATOR_GOAL_IDS,
  isNexterAccentPresetId,
  isNexterPreferenceMetadataKey,
  normalizeHexColor,
  resolveNexterPreferences,
  type NexterPreferences,
  type NexterPreferencesPatch,
  type NexterPlatformId,
  type NexterCreationInterestId,
  type NexterStylePreferenceId,
  type NexterCreatorGoalId,
} from '@ucbs/shared';
import { ServiceError } from '../../lib/errors.js';
import { getUserById, updateUser, type UserProfile } from '../user.service.js';
import { isKnownVoiceCatalogId } from './voice-catalog.service.js';

const PATCHABLE = new Set([
  'language',
  'addressAs',
  'voiceCatalogId',
  'voiceOutputEnabled',
  'uiTheme',
  'accentPreset',
  'customPrimary',
  'customAccent',
  'platforms',
  'creationInterests',
  'stylePreferences',
  'creatorGoals',
  'personalizationCompleted',
]);

const FORBIDDEN_IDENTITY_FIELDS = new Set(['coinBalance', 'role', 'id', 'email', 'userId', 'uid']);

function parseAllowedList<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  code: string,
  message: string
): T[] {
  if (!Array.isArray(raw)) {
    throw new ServiceError(400, code, message);
  }
  const allowedSet = new Set<string>(allowed);
  const out: T[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !allowedSet.has(item)) {
      throw new ServiceError(400, code, message);
    }
    if (out.includes(item as T)) continue;
    out.push(item as T);
    if (out.length > 16) {
      throw new ServiceError(400, code, message);
    }
  }
  return out;
}

export function assertSafePreferencesPatch(raw: Record<string, unknown>): NexterPreferencesPatch {
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_IDENTITY_FIELDS.has(key)) {
      throw new ServiceError(400, 'FORBIDDEN_FIELD', 'Dieses Feld darf nicht über Preferences geändert werden');
    }
    if (isNexterPreferenceMetadataKey(key)) continue;
    if (!PATCHABLE.has(key)) {
      throw new ServiceError(400, 'UNKNOWN_FIELD', `Unbekanntes Preferences-Feld: ${key}`);
    }
  }

  const patch: NexterPreferencesPatch = {};

  if (raw.language !== undefined) {
    if (typeof raw.language !== 'string' || !(NEXTER_LANGUAGES as readonly string[]).includes(raw.language)) {
      throw new ServiceError(400, 'INVALID_LANGUAGE', 'Sprache wird nicht unterstützt');
    }
    patch.language = raw.language;
  }

  if (raw.addressAs !== undefined) {
    if (typeof raw.addressAs !== 'string' || raw.addressAs.trim().length < 1 || raw.addressAs.trim().length > 40) {
      throw new ServiceError(400, 'INVALID_ADDRESS', 'Ansprache muss 1–40 Zeichen haben');
    }
    patch.addressAs = raw.addressAs.trim();
  }

  if (raw.voiceCatalogId !== undefined) {
    if (raw.voiceCatalogId !== null && typeof raw.voiceCatalogId !== 'string') {
      throw new ServiceError(400, 'INVALID_VOICE', 'Ungültige Stimme');
    }
    const id = raw.voiceCatalogId === null ? null : raw.voiceCatalogId.trim();
    if (id && !isKnownVoiceCatalogId(id)) {
      throw new ServiceError(400, 'UNKNOWN_VOICE', 'Diese Stimme ist nicht verfügbar');
    }
    patch.voiceCatalogId = id || null;
  }

  if (raw.voiceOutputEnabled !== undefined) {
    if (typeof raw.voiceOutputEnabled !== 'boolean') {
      throw new ServiceError(400, 'INVALID_FLAG', 'voiceOutputEnabled muss boolean sein');
    }
    patch.voiceOutputEnabled = raw.voiceOutputEnabled;
  }

  if (raw.uiTheme !== undefined) {
    if (typeof raw.uiTheme !== 'string' || !(NEXTER_UI_THEMES as readonly string[]).includes(raw.uiTheme)) {
      throw new ServiceError(400, 'INVALID_THEME', 'Theme muss dark, light oder system sein');
    }
    patch.uiTheme = raw.uiTheme as NexterPreferences['uiTheme'];
  }

  if (raw.accentPreset !== undefined) {
    if (!isNexterAccentPresetId(raw.accentPreset)) {
      throw new ServiceError(400, 'INVALID_ACCENT', 'Unbekanntes App-Farbprofil');
    }
    patch.accentPreset = raw.accentPreset;
  }

  if (raw.customPrimary !== undefined) {
    if (raw.customPrimary === null || raw.customPrimary === '') {
      patch.customPrimary = null;
    } else {
      const hex = normalizeHexColor(raw.customPrimary);
      if (!hex) throw new ServiceError(400, 'INVALID_COLOR', 'Hauptfarbe muss ein gültiger Hex-Wert sein');
      patch.customPrimary = hex;
    }
  }

  if (raw.customAccent !== undefined) {
    if (raw.customAccent === null || raw.customAccent === '') {
      patch.customAccent = null;
    } else {
      const hex = normalizeHexColor(raw.customAccent);
      if (!hex) throw new ServiceError(400, 'INVALID_COLOR', 'Akzentfarbe muss ein gültiger Hex-Wert sein');
      patch.customAccent = hex;
    }
  }

  if (raw.platforms !== undefined) {
    patch.platforms = parseAllowedList(
      raw.platforms,
      NEXTER_PLATFORM_IDS,
      'INVALID_PLATFORMS',
      'Ungültige Plattform-Auswahl'
    ) as NexterPlatformId[];
  }

  if (raw.creationInterests !== undefined) {
    patch.creationInterests = parseAllowedList(
      raw.creationInterests,
      NEXTER_CREATION_INTEREST_IDS,
      'INVALID_INTERESTS',
      'Ungültige Interessen-Auswahl'
    ) as NexterCreationInterestId[];
  }

  if (raw.stylePreferences !== undefined) {
    patch.stylePreferences = parseAllowedList(
      raw.stylePreferences,
      NEXTER_STYLE_PREFERENCE_IDS,
      'INVALID_STYLES',
      'Ungültige Stil-Auswahl'
    ) as NexterStylePreferenceId[];
  }

  if (raw.creatorGoals !== undefined) {
    patch.creatorGoals = parseAllowedList(
      raw.creatorGoals,
      NEXTER_CREATOR_GOAL_IDS,
      'INVALID_GOALS',
      'Ungültige Ziel-Auswahl'
    ) as NexterCreatorGoalId[];
  }

  if (raw.personalizationCompleted !== undefined) {
    if (typeof raw.personalizationCompleted !== 'boolean') {
      throw new ServiceError(400, 'INVALID_FLAG', 'personalizationCompleted muss boolean sein');
    }
    patch.personalizationCompleted = raw.personalizationCompleted;
  }

  return patch;
}

export async function getNexterPreferencesForUser(uid: string): Promise<NexterPreferences> {
  const user = await getUserById(uid);
  if (!user) throw new ServiceError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');
  return user.nexterPreferences;
}

export async function updateNexterPreferencesForUser(
  uid: string,
  rawPatch: Record<string, unknown>
): Promise<UserProfile> {
  const user = await getUserById(uid);
  if (!user) throw new ServiceError(404, 'NOT_FOUND', 'Nutzer nicht gefunden');
  const patch = assertSafePreferencesPatch(rawPatch);
  if (patch.personalizationCompleted === true && user.nexterPreferences.personalizationCompleted !== true) {
    const hasSetupPayload =
      patch.addressAs !== undefined ||
      patch.language !== undefined ||
      patch.voiceCatalogId !== undefined ||
      patch.platforms !== undefined;
    if (!hasSetupPayload) {
      throw new ServiceError(
        400,
        'INCOMPLETE_PERSONALIZATION',
        'Personalization kann erst nach Speichern der Setup-Daten abgeschlossen werden'
      );
    }
  }
  const now = new Date().toISOString();
  const merged: NexterPreferences = resolveNexterPreferences(
    { ...user.nexterPreferences, ...patch, updatedAt: now },
    { locale: user.locale, displayName: user.displayName }
  );
  if (patch.personalizationCompleted === true) merged.personalizationCompleted = true;
  if (patch.personalizationCompleted === false) merged.personalizationCompleted = false;

  const updates: Partial<UserProfile> = { nexterPreferences: merged };
  if (patch.language) updates.locale = patch.language;
  return updateUser(uid, updates);
}
