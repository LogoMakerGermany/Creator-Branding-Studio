/** Central legal versions, draft/publish gate, and operator placeholders. Never invent real operator data. */

export const LEGAL_TEXT_STATUS = 'draft' as const;

export const LEGAL_DRAFT_NOTICE = 'Entwurf / vor Veröffentlichung rechtlich prüfen lassen';

export const LEGAL_INCOMPLETE_NOTICE =
  'Entwurf / unvollständig — Pflichtangaben zum Betreiber fehlen. Keine verbindliche Finalfassung.';

/** Bump only when a new text revision is published. Draft bumps must not force reacceptance. */
export const LEGAL_TERMS_VERSION = 'draft-terms-1';
export const LEGAL_PRIVACY_VERSION = 'draft-privacy-1';

/** Technical content date only. Not a legal-review or publication date. */
export const LEGAL_LAST_UPDATED = '2026-09-18';

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

export const LEGAL_OPERATOR_FIELD_LABELS: Record<LegalOperatorField, string> = {
  operatorName: 'Name / Betreiber',
  companyName: 'Geschäfts-/Projektname',
  legalForm: 'Rechtsform',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Ort',
  country: 'Land',
  contactEmail: 'E-Mail',
  contactPhone: 'Telefon',
  vatId: 'USt-IdNr.',
  registerCourt: 'Registergericht',
  registerNumber: 'Registernummer',
};

/**
 * Fields that must be real values before the publish gate may open.
 * Empty VAT / register / phone / legal form are not invented legal duties.
 */
export const LEGAL_PUBLISH_REQUIRED_FIELDS: readonly LegalOperatorField[] = [
  'operatorName',
  'companyName',
  'street',
  'postalCode',
  'city',
  'country',
  'contactEmail',
];

export const LEGAL_OPTIONAL_OPERATOR_FIELDS: readonly LegalOperatorField[] = [
  'legalForm',
  'contactPhone',
  'vatId',
  'registerCourt',
  'registerNumber',
];

export const LEGAL_MISSING_DISPLAY = 'noch nicht hinterlegt';

/**
 * Confirmed operator facts only. Empty string = not provided / missing.
 * Never invent street, e-mail, phone, VAT or register data.
 */
export const LEGAL_OPERATOR: Record<LegalOperatorField, string> = {
  operatorName: 'Lars Gaube',
  companyName: 'NEXTER',
  legalForm: '',
  street: '',
  postalCode: '',
  city: 'Hamburg',
  country: 'Deutschland',
  contactEmail: '',
  contactPhone: '',
  vatId: '',
  registerCourt: '',
  registerNumber: '',
};

export const LEGAL_PUBLIC_SLUGS = ['impressum', 'datenschutz', 'agb', 'widerruf', 'cookies'] as const;
export type LegalPublicSlug = (typeof LEGAL_PUBLIC_SLUGS)[number];

export const LEGAL_DOCUMENT_VERSIONS: Record<LegalPublicSlug, string> = {
  impressum: 'draft-impressum-1',
  datenschutz: LEGAL_PRIVACY_VERSION,
  agb: LEGAL_TERMS_VERSION,
  widerruf: 'draft-widerruf-1',
  cookies: 'draft-cookies-1',
};

export type LegalPublicationStatus = 'draft' | 'incomplete' | 'published';

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
  options?: { status?: LegalPublicationStatus | 'final'; reacceptanceRequired?: boolean }
): boolean {
  const status = options?.status ?? LEGAL_TEXT_STATUS;
  const required = options?.reacceptanceRequired ?? LEGAL_REACCEPTANCE_REQUIRED;
  if (status === 'draft' || status === 'incomplete' || !required) return false;
  if (!record) return true;
  return record.termsVersion !== LEGAL_TERMS_VERSION || record.privacyVersion !== LEGAL_PRIVACY_VERSION;
}

export function isLegalPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return true;
  return /\[[^\]]*EINTRAGEN[^\]]*\]/i.test(trimmed);
}

export function isLegalPublishRequiredField(field: LegalOperatorField): boolean {
  return LEGAL_PUBLISH_REQUIRED_FIELDS.includes(field);
}

export function hasActiveLegalPlaceholderToken(text: string): boolean {
  return /\[[^\]]*EINTRAGEN[^\]]*\]/i.test(text) || /Lorem ipsum/i.test(text);
}

export function missingLegalOperatorFields(
  operator: Record<LegalOperatorField, string> = LEGAL_OPERATOR
): LegalOperatorField[] {
  return LEGAL_PUBLISH_REQUIRED_FIELDS.filter((key) => isLegalPlaceholderValue(operator[key]));
}

export function displayOperatorValue(value: string | undefined | null): string {
  if (value === undefined || value === null || isLegalPlaceholderValue(value)) {
    return LEGAL_MISSING_DISPLAY;
  }
  return String(value).trim();
}

export interface LegalPublishGateInput {
  intendedStatus: 'draft' | 'final';
  operator: Record<LegalOperatorField, string>;
  lastUpdated?: string;
  termsVersion?: string;
  privacyVersion?: string;
  contentPresent: boolean;
  userFacingHtml: string;
}

export interface LegalPublishGateResult {
  status: LegalPublicationStatus;
  publishable: boolean;
  missingOperatorFields: LegalOperatorField[];
  reasons: string[];
}

export function evaluateLegalPublishGate(input: LegalPublishGateInput): LegalPublishGateResult {
  const missingOperatorFields = missingLegalOperatorFields(input.operator);
  const reasons: string[] = [];
  if (input.intendedStatus !== 'final') reasons.push('intended_draft');
  if (missingOperatorFields.length) reasons.push('missing_operator_data');
  if (!input.lastUpdated?.trim()) reasons.push('missing_lastUpdated');
  if (!input.termsVersion?.trim() || !input.privacyVersion?.trim()) reasons.push('missing_version');
  if (!input.contentPresent) reasons.push('missing_content');
  if (hasActiveLegalPlaceholderToken(input.userFacingHtml)) reasons.push('placeholder_in_content');

  if (input.intendedStatus !== 'final') {
    return { status: 'draft', publishable: false, missingOperatorFields, reasons };
  }
  if (reasons.length) {
    return { status: 'incomplete', publishable: false, missingOperatorFields, reasons };
  }
  return { status: 'published', publishable: true, missingOperatorFields: [], reasons: [] };
}

export function currentLegalIntendedStatus(): 'draft' | 'final' {
  return LEGAL_TEXT_STATUS === 'draft' ? 'draft' : 'final';
}
