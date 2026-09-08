/** Central legal versions, draft status, and operator placeholders. Never invent real operator data. */

export const LEGAL_TEXT_STATUS = 'draft' as const;

export const LEGAL_DRAFT_NOTICE = 'Entwurf / vor Veröffentlichung rechtlich prüfen lassen';

/** Bump only when a new text revision is published. Draft bumps must not force reacceptance. */
export const LEGAL_TERMS_VERSION = 'draft-terms-1';
export const LEGAL_PRIVACY_VERSION = 'draft-privacy-1';

/**
 * When true AND texts are no longer draft, missing/outdated acceptance may gate the app.
 * Must stay false while texts are DRAFT so existing beta users are not locked out.
 */
export const LEGAL_REACCEPTANCE_REQUIRED = false;

export const LEGAL_PLACEHOLDER = {
  operatorName: '[BETREIBER_NAME_EINTRAGEN]',
  companyName: '[FIRMENNAME_EINTRAGEN]',
  legalForm: '[RECHTSFORM_EINTRAGEN]',
  street: '[STRASSE_EINTRAGEN]',
  postalCode: '[PLZ_EINTRAGEN]',
  city: '[ORT_EINTRAGEN]',
  country: '[LAND_EINTRAGEN]',
  contactEmail: '[KONTAKT_EMAIL_EINTRAGEN]',
  contactPhone: '[KONTAKT_TELEFON_EINTRAGEN]',
  vatId: '[USt-IdNr._EINTRAGEN]',
  registerCourt: '[REGISTERGERICHT_EINTRAGEN]',
  registerNumber: '[REGISTERNUMMER_EINTRAGEN]',
} as const;

export type LegalOperatorField = keyof typeof LEGAL_PLACEHOLDER;

export const LEGAL_OPERATOR = { ...LEGAL_PLACEHOLDER };

export const LEGAL_PUBLIC_SLUGS = ['impressum', 'datenschutz', 'agb', 'widerruf', 'cookies'] as const;
export type LegalPublicSlug = (typeof LEGAL_PUBLIC_SLUGS)[number];

export interface LegalAcceptanceRecord {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
}

export interface LegalAcceptanceInput {
  termsVersion?: string;
  privacyVersion?: string;
}

export function currentDraftLegalAcceptanceInput(): LegalAcceptanceInput {
  return { termsVersion: LEGAL_TERMS_VERSION, privacyVersion: LEGAL_PRIVACY_VERSION };
}

export function isCurrentLegalAcceptance(input: LegalAcceptanceInput | undefined): boolean {
  return (
    input?.termsVersion === LEGAL_TERMS_VERSION && input?.privacyVersion === LEGAL_PRIVACY_VERSION
  );
}

export function shouldForceLegalReacceptance(
  record: LegalAcceptanceRecord | undefined,
  options?: { status?: typeof LEGAL_TEXT_STATUS | 'final'; reacceptanceRequired?: boolean }
): boolean {
  const status = options?.status ?? LEGAL_TEXT_STATUS;
  const required = options?.reacceptanceRequired ?? LEGAL_REACCEPTANCE_REQUIRED;
  if (status === 'draft' || !required) return false;
  if (!record) return true;
  return record.termsVersion !== LEGAL_TERMS_VERSION || record.privacyVersion !== LEGAL_PRIVACY_VERSION;
}

export function missingLegalOperatorFields(): LegalOperatorField[] {
  return (Object.keys(LEGAL_OPERATOR) as LegalOperatorField[]).filter((key) =>
    String(LEGAL_OPERATOR[key]).includes('[') && String(LEGAL_OPERATOR[key]).includes('EINTRAGEN')
  );
}
