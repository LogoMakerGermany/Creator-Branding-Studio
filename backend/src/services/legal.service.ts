import {
  LEGAL_DOCUMENT_VERSIONS,
  LEGAL_DRAFT_NOTICE,
  LEGAL_INCOMPLETE_NOTICE,
  LEGAL_LAST_UPDATED,
  LEGAL_OPERATOR,
  LEGAL_OPERATOR_FIELD_LABELS,
  LEGAL_PRIVACY_VERSION,
  LEGAL_PUBLIC_SLUGS,
  LEGAL_REACCEPTANCE_REQUIRED,
  LEGAL_TERMS_VERSION,
  currentLegalIntendedStatus,
  displayOperatorValue,
  evaluateLegalPublishGate,
  isCurrentLegalAcceptance,
  isLegalPlaceholderValue,
  missingLegalOperatorFields,
  shouldForceLegalReacceptance,
  type LegalAcceptanceInput,
  type LegalAcceptanceRecord,
  type LegalOperatorField,
  type LegalPublicationStatus,
  type LegalPublicSlug,
} from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';

export const DRAFT_NOTICE = LEGAL_DRAFT_NOTICE;

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'note'; text: string }
  | { type: 'links'; items: { href: string; label: string }[] };

export interface LegalPagePayload {
  slug: LegalPublicSlug;
  title: string;
  draft: boolean;
  status: LegalPublicationStatus;
  publicationStatus: LegalPublicationStatus;
  publishable: boolean;
  notice: string;
  termsVersion: string;
  privacyVersion: string;
  documentVersion: string;
  lastUpdated: string;
  missingOperatorFields: LegalOperatorField[];
  seoTitle: string;
  seoDescription: string;
  blocks: LegalBlock[];
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blocksToHtml(blocks: LegalBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'p') return `<p>${escapeHtml(block.text)}</p>`;
      if (block.type === 'h2') return `<h2>${escapeHtml(block.text)}</h2>`;
      if (block.type === 'h3') return `<h3>${escapeHtml(block.text)}</h3>`;
      if (block.type === 'note') return `<p><em>${escapeHtml(block.text)}</em></p>`;
      if (block.type === 'ul') {
        const items = block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      const links = block.items
        .map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
        .join(' · ');
      return `<p>${links}</p>`;
    })
    .join('');
}

function operatorLine(label: string, field: LegalOperatorField): string {
  return `${label}: ${displayOperatorValue(LEGAL_OPERATOR[field])}`;
}

function providedOperatorValue(field: LegalOperatorField): string | null {
  return isLegalPlaceholderValue(LEGAL_OPERATOR[field]) ? null : LEGAL_OPERATOR[field].trim();
}

function publicOperatorItems(): string[] {
  const items = [
    operatorLine('Name / Betreiber', 'operatorName'),
    operatorLine('Geschäfts-/Projektname', 'companyName'),
  ];
  const legalForm = providedOperatorValue('legalForm');
  if (legalForm) items.push(`${LEGAL_OPERATOR_FIELD_LABELS.legalForm}: ${legalForm}`);
  items.push(operatorAddressLine());
  items.push(operatorLine('E-Mail', 'contactEmail'));
  const phone = providedOperatorValue('contactPhone');
  if (phone) items.push(`${LEGAL_OPERATOR_FIELD_LABELS.contactPhone}: ${phone}`);
  const vatId = providedOperatorValue('vatId');
  if (vatId) items.push(`${LEGAL_OPERATOR_FIELD_LABELS.vatId}: ${vatId}`);
  const registerCourt = providedOperatorValue('registerCourt');
  if (registerCourt) items.push(`${LEGAL_OPERATOR_FIELD_LABELS.registerCourt}: ${registerCourt}`);
  const registerNumber = providedOperatorValue('registerNumber');
  if (registerNumber) items.push(`${LEGAL_OPERATOR_FIELD_LABELS.registerNumber}: ${registerNumber}`);
  return items;
}

function operatorAddressLine(): string {
  const street = providedOperatorValue('street');
  const postal = providedOperatorValue('postalCode');
  const city = providedOperatorValue('city');
  const country = providedOperatorValue('country');
  const known: string[] = [];
  if (street) known.push(street);
  const locality = [postal, city].filter(Boolean).join(' ').trim();
  if (locality) known.push(locality);
  if (country) known.push(country);
  if (!street && !postal) {
    if (!known.length) return 'Anschrift: noch nicht hinterlegt';
    return `Anschrift: ${known.join(', ')} (Straße und PLZ noch nicht hinterlegt)`;
  }
  if (!known.length) return 'Anschrift: noch nicht hinterlegt';
  return `Anschrift: ${known.join(', ')}`;
}

function pageNotice(status: LegalPublicationStatus, missing: LegalOperatorField[]): string {
  if (status === 'published') return '';
  if (missing.length || status === 'incomplete') return LEGAL_INCOMPLETE_NOTICE;
  return DRAFT_NOTICE;
}

function page(
  slug: LegalPublicSlug,
  title: string,
  seoDescription: string,
  blocks: LegalBlock[]
): LegalPagePayload {
  const html = blocksToHtml(blocks);
  const gate = evaluateLegalPublishGate({
    intendedStatus: currentLegalIntendedStatus(),
    operator: LEGAL_OPERATOR,
    lastUpdated: LEGAL_LAST_UPDATED,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    contentPresent: blocks.length > 0 && html.length > 0,
    userFacingHtml: html,
  });
  const published = gate.status === 'published';
  const notice = pageNotice(gate.status, gate.missingOperatorFields);
  return {
    slug,
    title,
    draft: !published,
    status: gate.status,
    publicationStatus: gate.status,
    publishable: gate.publishable,
    notice,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    documentVersion: LEGAL_DOCUMENT_VERSIONS[slug],
    lastUpdated: LEGAL_LAST_UPDATED,
    missingOperatorFields: gate.missingOperatorFields,
    seoTitle: published ? `${title} — NEXTER Creator Studio` : `${title} (Entwurf) — NEXTER Creator Studio`,
    seoDescription,
    blocks,
    html,
  };
}

function impressumBlocks(): LegalBlock[] {
  const missing = missingLegalOperatorFields();
  const blocks: LegalBlock[] = [
    {
      type: 'note',
      text: 'Technischer Entwurf. Keine anwaltliche Prüfung, keine rechtsverbindliche Finalfassung, keine Launch-Freigabe.',
    },
    { type: 'h2', text: 'Anbieter' },
    {
      type: 'p',
      text: 'NEXTER Creator Studio ist der Produktname der Anwendung. Bestätigt sind derzeit Betreiber, Geschäfts-/Projektname, Ort und Land. Ladungsfähige Anschrift und geschäftliche E-Mail fehlen noch. Optionale Angaben wie Telefon, USt-IdNr. oder Handelsregister werden nur gezeigt, wenn sie hinterlegt sind — ein leeres Feld begründet keine rechtliche Pflicht. Es werden keine erfundenen Adressen oder Registerdaten verwendet.',
    },
    {
      type: 'ul',
      items: publicOperatorItems(),
    },
  ];
  if (missing.length) {
    blocks.push(
      { type: 'h2', text: 'Fehlende Pflichtangaben' },
      {
        type: 'p',
        text: 'Diese Felder sind für eine Veröffentlichung technisch erforderlich und derzeit nicht hinterlegt. USt-IdNr., Handelsregister und Telefon werden dadurch nicht zu erfundenen Pflichten. Es werden keine Platzhalter als echte Angaben dargestellt.',
      },
      {
        type: 'ul',
        items: missing.map((field) => LEGAL_OPERATOR_FIELD_LABELS[field]),
      }
    );
  }
  blocks.push(
    { type: 'h2', text: 'Status des Dienstes' },
    {
      type: 'p',
      text: 'Der Dienst wird als geschlossene Creator-Beta betrieben. Der Zugang ist in der Regel einladungsbasiert und nicht uneingeschränkt öffentlich.',
    },
    { type: 'h2', text: 'Weitere Hinweise' },
    {
      type: 'p',
      text: 'Verantwortliche nach Medienrecht, Datenschutzbeauftragte und Aufsichtsbehörden werden hier nicht genannt, weil dazu keine belegten Angaben im Projekt hinterlegt sind.',
    },
    {
      type: 'p',
      text: 'Eine Production-Domain der App ist eine technische Erreichbarkeitsadresse, keine rechtliche Geschäftsanschrift und kein Ersatz für fehlende Kontaktdaten.',
    },
    {
      type: 'links',
      items: [
        { href: '/legal/datenschutz', label: 'Datenschutz' },
        { href: '/legal/agb', label: 'Nutzungsbedingungen' },
      ],
    }
  );
  return blocks;
}

function responsiblePartyText(): string {
  const missing = missingLegalOperatorFields();
  const known = [
    providedOperatorValue('operatorName'),
    providedOperatorValue('companyName'),
    providedOperatorValue('city'),
    providedOperatorValue('country'),
  ].filter((value): value is string => Boolean(value));
  if (missing.length) {
    const knownLine = known.length ? ` Bekannte Angaben: ${known.join(', ')}.` : '';
    return `Die verantwortliche Stelle ist der Betreiber von NEXTER Creator Studio.${knownLine} Ladungsfähige Anschrift und geschäftliche Kontakt-E-Mail sind noch nicht hinterlegt. Siehe Impressum. Es werden keine erfundenen Betreiberdaten verwendet.`;
  }
  const legalForm = providedOperatorValue('legalForm');
  const street = providedOperatorValue('street');
  const postal = providedOperatorValue('postalCode');
  const locality = [postal, providedOperatorValue('city')].filter(Boolean).join(' ');
  return `Verantwortlich für die Verarbeitung ist der Betreiber: ${known.join(', ')}${legalForm ? `, ${legalForm}` : ''}${street ? `, ${street}` : ''}${locality ? `, ${locality}` : ''}, ${displayOperatorValue(LEGAL_OPERATOR.contactEmail)}.`;
}

function privacyBlocks(): LegalBlock[] {
  const responsible = responsiblePartyText();
  return [
    {
      type: 'note',
      text: 'Technischer Entwurf auf Basis des aktuellen Codes. Keine Aussage zur DSGVO-Zertifizierung, vollständigen Rechtskonformität oder anwaltlichen Prüfung.',
    },
    { type: 'h2', text: 'Verantwortliche Stelle' },
    { type: 'p', text: responsible },
    { type: 'h2', text: 'Welche Daten verarbeitet werden' },
    {
      type: 'p',
      text: 'Soweit aus dem Code bestimmbar, können insbesondere folgende Datenklassen verarbeitet werden:',
    },
    {
      type: 'ul',
      items: [
        'Accountdaten: Firebase-UID, E-Mail, Anzeigename, Avatar-URL, Rolle, Login-Provider, Locale, Onboarding-Status, Einladungscode-Referenz, Sperrstatus, Zeitstempel',
        'E-Mail-Verifizierungsstatus aus Firebase Authentication (Token), nicht als eigene frei erfundene Datenbank',
        'Creator-Präferenzen und Nexter-Präferenzen (Sprache, Anrede, Stimme, Theme, Plattformen, Interessen)',
        'Creator DNA (Markenmerkmale, Farben, Stil, Plattformen, optionale Referenzangaben)',
        'Projekte, Generierungsaufträge, Change Requests',
        'Dateien und Uploads (Bilder, Audio, Video und weitere unterstützte Typen) inklusive Metadaten',
        'Nexter-Sitzungen, Nachrichten, Quotes sowie Kontext aus DNA, Projekten und Dateien',
        'Social-Planungen und Kalenderdaten',
        'Coin-Guthaben, Transaktionshistorie, Welcome-Bonus, Generierungskosten, Erstattungen',
        'Rechtliche Versionsbestätigung (Terms-/Privacy-Version und Zeitpunkt), sofern bei der Registrierung erfasst',
      ],
    },
    { type: 'h2', text: 'Firebase' },
    {
      type: 'p',
      text: 'Tatsächlich genutzt werden Firebase Authentication, Firestore (serverseitig) und Firebase Storage (serverseitig, inklusive zeitlich begrenzter Download-URLs). Firebase Hosting wird in der aktuellen Auslieferung nicht als Betriebsweg behauptet.',
    },
    { type: 'h3', text: 'Google-Anmeldung' },
    {
      type: 'p',
      text: 'Google Login über Firebase Authentication ist vorhanden. Es werden keine zusätzlichen Google-Marketingdienste erfunden.',
    },
    { type: 'h2', text: 'Hosting' },
    {
      type: 'p',
      text: 'Die Anwendung wird in der aktuellen Auslieferung auf Railway betrieben. Die Production-URL ist eine technische App-Adresse, keine rechtliche Geschäftsanschrift.',
    },
    { type: 'h2', text: 'Anmeldedienste (technischer Stand)' },
    {
      type: 'p',
      text: 'Die folgende Einordnung beschreibt Code und Konfigurationsgating. Sie ist keine Aussage, dass ein Anbieter rechtlich zulässig, unzulässig oder dauerhaft aktiv ist.',
    },
    {
      type: 'ul',
      items: [
        'E-Mail/Passwort (Firebase Authentication): ACTIVE IN PRODUCTION, soweit Firebase Auth konfiguriert ist',
        'Google Login (Firebase Authentication): ACTIVE IN PRODUCTION, soweit Firebase Auth konfiguriert ist',
        'Discord OAuth: IMPLEMENTED; nur aktiv, wenn Client-ID und Secret gesetzt sind',
        'Twitch OAuth: IMPLEMENTED BUT ENV-GATED — nicht behauptet als dauerhaft aktiv und nicht als „niemals verwendet“',
        'TikTok OAuth: IMPLEMENTED BUT ENV-GATED — nicht behauptet als dauerhaft aktiv und nicht als „niemals verwendet“',
        'Microsoft OAuth: IMPLEMENTED BUT ENV-GATED — nicht behauptet als dauerhaft aktiv und nicht als „niemals verwendet“',
        'GitHub-Login: NOT USED (kein Anmeldepfad im aktuellen Code)',
        'Apple-Login: NOT USED (kein Anmeldepfad im aktuellen Code)',
      ],
    },
    { type: 'h2', text: 'E-Mail' },
    {
      type: 'p',
      text: 'Firebase Authentication kann Verifizierungs- und Zurücksetzungsmails versenden, soweit der Firebase-E-Mail-Dienst verfügbar ist. Transaktionale App-Mails über Resend sind im Code vorbereitet, derzeit aber nicht konfiguriert (UNAVAILABLE). Es wird weder behauptet, dass Resend aktiv versendet, noch dass Resend niemals verwendet wird.',
    },
    { type: 'h2', text: 'KI- und Medienanbieter' },
    {
      type: 'p',
      text: 'Im Code sind Integrationen vorbereitet, die nur greifen, wenn sie konfiguriert und die jeweilige Funktion genutzt wird. Ein Request geht nicht automatisch an jeden Anbieter. Image-, Video- und Musikgenerierung sind derzeit deaktiviert. Es wird weder ein Live-Betrieb dieser Anbieter behauptet noch, dass sie niemals verwendet werden.',
    },
    {
      type: 'ul',
      items: [
        'OpenAI, Google Gemini, Replicate, Runway, ElevenLabs: IMPLEMENTED / provider-gated; nur bei vorhandener Konfiguration und Funktionsaufruf',
        'Lokal/Test: Mock- und Gating-Pfade, ohne echte Provider-Aufrufe in der Testumgebung',
        'Suno: im Code erwähnt; der inoffizielle Endpunkt ist deaktiviert',
        'Voice: Stimmenpräferenz, lokale Preview und TTS-Generierung sind zu unterscheiden; TTS ist provider-gated',
        'Musik/Bild/Video: Verarbeitung nur, wenn der jeweilige Pfad aktiviert ist (aktuell DISABLED)',
      ],
    },
    {
      type: 'p',
      text: 'Prompts, Referenzdateien, Spracheingaben oder generierte Medien können an den jeweils aktivierten Anbieter übermittelt werden, soweit das für die angeforderte Funktion nötig ist.',
    },
    { type: 'h2', text: 'Nexter' },
    {
      type: 'p',
      text: 'Nexter speichert Sitzungen und Nachrichten und kann Creator-DNA, Projektkontext, Dateiübersichten, Coin-Quotes und Präferenzen als Kontext nutzen. Das ist Teil der Assistentenfunktion, kein separates zweites Konto.',
    },
    { type: 'h2', text: 'Uploads und Dateizugriff' },
    {
      type: 'p',
      text: 'Hochgeladene Bilder, Audio, Video und andere unterstützte Dateien werden zur Leistungserbringung gespeichert und können für Generierung, Analyse oder Assistentenkontext verarbeitet werden. Dateien sind nicht pauschal öffentlich; technische Zugriffsdetails werden hier nicht offengelegt.',
    },
    { type: 'h2', text: 'Zahlungen und Coins' },
    {
      type: 'p',
      text: 'Zahlungen sind derzeit deaktiviert. Stripe- und PayPal-Code kann vorbereitet sein (CONFIGURED BUT DISABLED bzw. implementiert ohne Live-Checkout), ohne dass aktuell Zahlungsaufrufe stattfinden. Coins sind internes App-Guthaben (Welcome-Bonus 50, Generierungskosten laut App-Katalog, Erstattungen). Coins sind keine Kryptowährung und begründen keine Auszahlung. Es wird nicht behauptet, dass Live-Käufe verfügbar sind.',
    },
    { type: 'h2', text: 'Export und Löschung' },
    {
      type: 'p',
      text: 'Der bestehende Datenexport kann Kontoprofil (ohne Secrets), Projekte, Dateimetadaten, Coin-Transaktionen, Nexter-Sitzungen, Quotes und Generierungsjobs enthalten. Die Kontolöschung deaktiviert und anonymisiert das Konto, räumt zugehörige Inhalte soweit der bestehende Flow das tut, und erhält Zahlungs-/Ledger-/Auditdaten technisch. Es wird nicht behauptet, dass jede Sicherung sofort physisch verschwindet.',
    },
    { type: 'h2', text: 'Speicherdauer' },
    {
      type: 'p',
      text: 'Konkrete Aufbewahrungsfristen sind technisch nicht festgelegt. Fristen bleiben rechtlich zu klären und werden hier nicht erfunden.',
    },
    { type: 'h2', text: 'Cookies, lokale Speicher, Analyse' },
    {
      type: 'ul',
      items: [
        'Eigene Marketing-Cookies oder ein Tracking-Pixel (Google Analytics, Meta Pixel) sind im aktuellen Code nicht aktiv',
        'Firebase Authentication kann sitzungsbezogene Speichertechniken des SDKs nutzen',
        'localStorage: u. a. Theme/UI, Logo-Prompt-Favoriten, PWA-Hinweis; ein auth_token-Schlüssel existiert als Dev-/Altbestand und ist im Firebase-Pfad nicht die bevorzugte Anmeldung',
        'sessionStorage: Einladungscode, Auth-Fehler, Onboarding-/Setup-Entwürfe, E-Mail-Bestätigung-Cooldown, optionale Legal-Versionsbestätigung vor Sync',
        'Es wird nicht behauptet, dass keinerlei Cookies verwendet werden',
      ],
    },
    { type: 'h3', text: 'Externe Schriften' },
    {
      type: 'p',
      text: 'Die Oberfläche lädt derzeit Google Fonts von fonts.googleapis.com / fonts.gstatic.com. Dabei kann der Schriftanbieter technisch eine Verbindung sehen.',
    },
    {
      type: 'p',
      text: 'Ein Cookie-Banner wird nicht angezeigt, weil aktuell keine optionalen Tracking-/Marketing-Techniken gesteuert werden müssten.',
    },
    {
      type: 'links',
      items: [
        { href: '/legal/impressum', label: 'Impressum' },
        { href: '/legal/agb', label: 'Nutzungsbedingungen' },
        { href: '/legal/cookies', label: 'Speicher & Cookies' },
      ],
    },
  ];
}

function termsBlocks(): LegalBlock[] {
  return [
    {
      type: 'note',
      text: 'Technischer Entwurf. Keine rechtsverbindlichen AGB, keine Eigentums- oder Urheberrechtsgarantie, keine Launch-Freigabe.',
    },
    { type: 'h2', text: 'Geltungsbereich' },
    {
      type: 'p',
      text: 'Diese Nutzungsbedingungen beschreiben den technischen Zugang zu NEXTER Creator Studio in der geschlossenen Creator-Beta. Sie gelten für registrierte Nutzerinnen und Nutzer, soweit der Dienst genutzt wird.',
    },
    { type: 'h2', text: 'Account' },
    {
      type: 'p',
      text: 'Ein Konto entsteht über Firebase Authentication (E-Mail/Passwort oder Google) und die serverseitige App-Synchronisation. Weitere OAuth-Anbieter können verfügbar sein, wenn sie konfiguriert sind. Der Zugang ist in der Regel nur mit Einladung möglich. Login-Daten sind geheim zu halten.',
    },
    { type: 'h2', text: 'Beta-Status' },
    {
      type: 'p',
      text: 'Der Dienst ist eine geschlossene Creator-Beta. Funktionen können sich ändern, eingeschränkt oder vorübergehend nicht verfügbar sein. Es wird nicht zugesichert, dass der Dienst uneingeschränkt öffentlich oder ununterbrochen verfügbar ist.',
    },
    { type: 'h2', text: 'Zulässige Nutzung' },
    {
      type: 'p',
      text: 'Die Plattform darf nur für rechtmäßige Creator- und Branding-Zwecke genutzt werden. Technische Schutzmaßnahmen, fremde Konten und die Umgehung von Zugangsbeschränkungen sind unzulässig.',
    },
    { type: 'h2', text: 'Uploads und Creator-Inhalte' },
    {
      type: 'p',
      text: 'Es dürfen nur Inhalte hochgeladen oder eingegeben werden, für die die erforderlichen Rechte vorliegen. Es findet keine automatische Rechteprüfung statt. Der Dienst übernimmt keine Garantie, dass Uploads rechtmäßig sind.',
    },
    { type: 'h2', text: 'KI-generierte Inhalte' },
    {
      type: 'p',
      text: 'Generierte Ergebnisse hängen von Prompts, Referenzen, Creator DNA und ggf. Drittanbietern ab. Es wird nicht pauschal zugesichert, dass Nutzerinnen und Nutzer automatisch weltweit alle exklusiven Urheberrechte an jedem KI-Ergebnis besitzen. Rechtefragen bleiben provider- und rechtsabhängig und sind später juristisch zu klären.',
    },
    {
      type: 'h2',
      text: 'Content Rights — technischer Entwurf (LEGAL REVIEW REQUIRED)',
    },
    {
      type: 'note',
      text: 'DRAFT / REVIEW REQUIRED. Keine anwaltliche Prüfung. Keine DMCA-Pflichtbehauptung. Keine Garantie für Urheber-, Marken- oder kommerzielle Nutzungsfreiheit. NEXTER ersetzt keine individuelle Rechtsberatung.',
    },
    {
      type: 'p',
      text: 'TODO — User Content Rights: Nutzende müssen die erforderlichen Rechte bzw. Erlaubnisse für Uploads (Fotos, Logos, Grafiken, Musik, Audio, Video, Fonts, Templates, Brand Assets, Personenbilder, Stimmen) besitzen. Ein Upload überträgt kein Eigentum an NEXTER. Betriebliche Nutzungsbefugnisse (Speicherung, Verarbeitung, KI-Verarbeitung, Generierung, Bereitstellung) sind später in den finalen AGB juristisch zu beschreiben.',
    },
    {
      type: 'p',
      text: 'TODO — Copyright/Trademark Complaints: Meldungen zu Urheberrecht, Markenrecht, Persönlichkeits-/Bildnisrechten und Stimmen-/Identitätsrechten laufen über den technischen Meldeprozess (Support / Content-Rights-Reports). Juristische Detailausgestaltung: LEGAL REVIEW REQUIRED.',
    },
    {
      type: 'p',
      text: 'TODO — AI Generated Content: KI-generierte Ergebnisse sind nicht automatisch frei nutzbar. Es wird nicht zugesichert, dass Nutzende automatisch alle Rechte besitzen oder dass „KI-generiert“ kommerzielle Nutzung erlaubt.',
    },
    {
      type: 'p',
      text: 'TODO — Voice Consent: Katalog-TTS ist von Voice-Cloning zu trennen. Voice-Cloning einer realen Stimme ist derzeit nicht aktiv und darf nicht als erlaubt gelten, nur weil eine Stimme öffentlich, prominent oder als Clip vorhanden ist.',
    },
    {
      type: 'p',
      text: 'TODO — Commercial Use: Export, Download oder Merch-Mockup bedeuten keine Rechteklärung. Keine Aussage „Copyright Free“, „Trademark safe“ oder garantierte kommerzielle Nutzungsrechte, soweit nicht für den konkreten Inhalt, Input, Provider und die konkrete Lizenz nachweisbar.',
    },
    {
      type: 'p',
      text: 'TODO — Provider Terms: Nutzungsbedingungen von OpenAI, Replicate, Runway, ElevenLabs und weiteren im Repo tatsächlich verwendeten Providern sind providerseitig zu prüfen. Kommerzielle Nutzungsrechte: LEGAL/PROVIDER REVIEW REQUIRED.',
    },
    { type: 'h2', text: 'Coins' },
    {
      type: 'p',
      text: 'Coins sind internes App-Guthaben für Funktionen der Plattform (einschließlich Welcome-Bonus 50, Generierungskosten laut App-Katalog, Erstattungen bei technischen Fehlschlägen soweit der bestehende Mechanismus greift, Transaktionshistorie und Kostenvoranschläge). Coins sind keine Kryptowährung, kein Finanzprodukt und nicht auszahlbar. Ein Echtgeldkauf ist derzeit nicht verfügbar, solange Zahlungen deaktiviert sind.',
    },
    { type: 'h2', text: 'Kostenpflichtige Funktionen' },
    {
      type: 'p',
      text: 'Zahlungsintegrationen können vorbereitet sein. Solange Zahlungen deaktiviert sind, finden keine Stripe- oder PayPal-Käufe statt. Es wird keine automatische Abbuchung ohne späteren, gesonderten Kaufprozess behauptet.',
    },
    { type: 'h2', text: 'Änderungen und Varianten' },
    {
      type: 'p',
      text: 'Generierungen können Varianten erzeugen. Ergebnisse müssen nicht pixelgenau identisch oder dauerhaft reproduzierbar sein.',
    },
    { type: 'h2', text: 'Verfügbarkeit' },
    {
      type: 'p',
      text: 'Wartung, Provider-Ausfälle, Einladungsmodus oder lokale Entwicklungsmodi können den Dienst einschränken. Es wird keine ununterbrochene Verfügbarkeit zugesichert.',
    },
    { type: 'h2', text: 'Sperrung und Löschung' },
    {
      type: 'p',
      text: 'Konten können gesperrt oder über den bestehenden Löschflow deaktiviert und anonymisiert werden. Eine sofortige physische Löschung aller Sicherungen wird nicht zugesichert.',
    },
    { type: 'h2', text: 'Haftungshinweise' },
    {
      type: 'p',
      text: 'Haftungsumfang, Gewährleistung und Freistellung sind in diesem Entwurf nicht abschließend geregelt und bleiben der rechtlichen Prüfung vorbehalten. Keine Aussage zur vollständigen Rechtssicherheit.',
    },
    { type: 'h2', text: 'Rechte an Uploads' },
    {
      type: 'p',
      text: 'Rechte an eigenen Uploads verbleiben soweit gesetzlich vorgesehen bei den Rechteinhaberinnen und Rechteinhabern. Die Plattform benötigt nur die für den Betrieb erforderlichen Nutzungsbefugnisse. Eine darüber hinausgehende Rechteübertragung wird hier nicht erfunden.',
    },
    { type: 'h2', text: 'Verbotene Inhalte' },
    {
      type: 'p',
      text: 'Rechtswidrige, missbräuchliche oder sonst unzulässige Inhalte dürfen nicht eingestellt oder erzeugt werden. Ein vollständiges Moderationssystem wird damit nicht behauptet.',
    },
    { type: 'h2', text: 'Änderungen dieser Bedingungen' },
    {
      type: 'p',
      text: `Aktuelle Entwurfsversion: ${LEGAL_TERMS_VERSION}. Eine spätere finale Fassung kann eine erneute Zustimmung vorsehen. Solange der Status Entwurf ist, wird bestehende Beta-Nutzung nicht allein wegen dieser Versionierung gesperrt.`,
    },
    {
      type: 'links',
      items: [
        { href: '/legal/datenschutz', label: 'Datenschutz' },
        { href: '/legal/impressum', label: 'Impressum' },
      ],
    },
  ];
}

function withdrawalBlocks(): LegalBlock[] {
  return [
    {
      type: 'note',
      text: 'Platzhalter für NEXTER Creator Studio. Ein Widerrufstext wird erst aufgenommen, wenn er rechtlich vorliegt. Es werden keine Fristen oder Musterbelehrungen erfunden.',
    },
    { type: 'h2', text: 'Hinweis' },
    {
      type: 'p',
      text: `Kontakt für rechtliche Korrespondenz: ${displayOperatorValue(LEGAL_OPERATOR.contactEmail)}. Zahlungen sind derzeit deaktiviert; ein Kauf-Widerruf greift daher aktuell nicht als laufender Checkout-Prozess.`,
    },
  ];
}

function cookiesBlocks(): LegalBlock[] {
  return [
    {
      type: 'note',
      text: 'Technischer Entwurf zum tatsächlich vorhandenen Speicher in NEXTER Creator Studio. Kein Marketing-Cookie-Banner, weil aktuell keine optionalen Tracking-Dienste gesteuert werden.',
    },
    { type: 'h2', text: 'Cookies' },
    {
      type: 'p',
      text: 'Im Anwendungscode werden keine eigenen Marketing-Cookies gesetzt. Firebase Authentication kann herstellereigene Speicher- oder Cookie-Mechanismen nutzen. Deshalb steht hier nicht: wir verwenden keine Cookies.',
    },
    { type: 'h2', text: 'localStorage' },
    {
      type: 'ul',
      items: [
        'auth_token: Dev-/Altbestand; im Firebase-Pfad nicht die bevorzugte Tokenquelle',
        'Logo-Prompts und Favoriten',
        'PWA-Hinweis',
        'Darstellung kann zusätzlich über Nexter-Theme-Präferenzen (Konto) gesteuert werden',
      ],
    },
    { type: 'h2', text: 'sessionStorage' },
    {
      type: 'ul',
      items: [
        'pending_invite_code',
        'auth_error',
        'Onboarding- und Nexter-Setup-Entwürfe',
        'E-Mail-Bestätigung-Cooldown',
        'pending legal acceptance vor der ersten App-Synchronisation',
      ],
    },
    { type: 'h2', text: 'Analyse' },
    {
      type: 'p',
      text: 'Google Analytics, Meta Pixel oder vergleichbares Marketing-Tracking sind im aktuellen Frontend nicht eingebunden. Interne Admin-Zählwerte sind keine öffentliche Webanalyse.',
    },
    {
      type: 'links',
      items: [
        { href: '/legal/datenschutz', label: 'Datenschutz' },
        { href: '/legal/impressum', label: 'Impressum' },
      ],
    },
  ];
}

const PAGES: Record<LegalPublicSlug, () => LegalPagePayload> = {
  impressum: () =>
    page(
      'impressum',
      'Impressum',
      'Impressum-Entwurf von NEXTER Creator Studio. Bestätigte Angaben: Lars Gaube, NEXTER, Hamburg, Deutschland. Ladungsfähige Anschrift und Kontakt-E-Mail fehlen noch. Keine Finalfassung.',
      impressumBlocks()
    ),
  datenschutz: () =>
    page(
      'datenschutz',
      'Datenschutzerklärung',
      'Datenschutz-Entwurf von NEXTER Creator Studio. Beschreibt die aus dem Code erkennbaren Datenflüsse. Keine geprüfte Finalfassung.',
      privacyBlocks()
    ),
  agb: () =>
    page(
      'agb',
      'Nutzungsbedingungen',
      'Nutzungsbedingungen-Entwurf von NEXTER Creator Studio. Keine rechtsverbindliche Finalfassung.',
      termsBlocks()
    ),
  widerruf: () =>
    page(
      'widerruf',
      'Widerruf',
      'Widerruf-Platzhalter von NEXTER Creator Studio. Kein erfundener gesetzlichen Text.',
      withdrawalBlocks()
    ),
  cookies: () =>
    page(
      'cookies',
      'Speicher & Cookies',
      'Hinweis zu Cookies und lokalem Speicher in NEXTER Creator Studio. Entwurf, kein Marketing-Banner.',
      cookiesBlocks()
    ),
};

export function isLegalSlug(value: string | undefined): value is LegalPublicSlug {
  return Boolean(value && (LEGAL_PUBLIC_SLUGS as readonly string[]).includes(value));
}

export function getLegalPage(slug: string): LegalPagePayload | null {
  if (!isLegalSlug(slug)) return null;
  return PAGES[slug]();
}

export function listLegalSlugs(): LegalPublicSlug[] {
  return [...LEGAL_PUBLIC_SLUGS];
}

export function assertNewUserLegalAcceptance(input: LegalAcceptanceInput | undefined): void {
  if (isCurrentLegalAcceptance(input)) return;
  throw new AppError(
    400,
    'LEGAL_ACCEPTANCE_REQUIRED',
    'Bitte akzeptiere die Nutzungsbedingungen und bestätige, die Datenschutzerklärung gelesen zu haben.'
  );
}

export function newUserNeedsLegalAcceptance(): boolean {
  return true;
}

export function existingUserNeedsLegalReacceptance(record: LegalAcceptanceRecord | undefined): boolean {
  return shouldForceLegalReacceptance(record);
}

export function legalVersions() {
  const gate = evaluateLegalPublishGate({
    intendedStatus: currentLegalIntendedStatus(),
    operator: LEGAL_OPERATOR,
    lastUpdated: LEGAL_LAST_UPDATED,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    contentPresent: true,
    userFacingHtml: '',
  });
  return {
    status: gate.status,
    publicationStatus: gate.status,
    publishable: gate.publishable,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    lastUpdated: LEGAL_LAST_UPDATED,
    reacceptanceRequired: LEGAL_REACCEPTANCE_REQUIRED,
    draft: gate.status !== 'published',
    notice: pageNotice(gate.status, gate.missingOperatorFields),
    missingOperatorFields: gate.missingOperatorFields,
  };
}
