import {
  LEGAL_DRAFT_NOTICE,
  LEGAL_OPERATOR,
  LEGAL_PRIVACY_VERSION,
  LEGAL_PUBLIC_SLUGS,
  LEGAL_REACCEPTANCE_REQUIRED,
  LEGAL_TERMS_VERSION,
  LEGAL_TEXT_STATUS,
  isCurrentLegalAcceptance,
  shouldForceLegalReacceptance,
  type LegalAcceptanceInput,
  type LegalAcceptanceRecord,
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
  draft: true;
  status: typeof LEGAL_TEXT_STATUS;
  notice: string;
  termsVersion: string;
  privacyVersion: string;
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

function page(
  slug: LegalPublicSlug,
  title: string,
  seoDescription: string,
  blocks: LegalBlock[]
): LegalPagePayload {
  return {
    slug,
    title,
    draft: true,
    status: LEGAL_TEXT_STATUS,
    notice: DRAFT_NOTICE,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    seoTitle: `${title} (Entwurf) — NEXTER Creator Studio`,
    seoDescription,
    blocks,
    html: blocksToHtml(blocks),
  };
}

const op = LEGAL_OPERATOR;

function impressumBlocks(): LegalBlock[] {
  return [
    {
      type: 'note',
      text: 'Technischer Entwurf. Keine anwaltliche Prüfung, keine rechtsverbindliche Finalfassung, keine Launch-Freigabe.',
    },
    { type: 'h2', text: 'Anbieter' },
    {
      type: 'p',
      text: 'NEXTER Creator Studio ist der Produktname der Anwendung. Die folgenden Betreiberangaben sind Platzhalter, solange echte Impressumsdaten nicht zentral hinterlegt sind. Es werden keine erfundenen Namen, Adressen oder Registerdaten verwendet.',
    },
    {
      type: 'ul',
      items: [
        `Name / Betreiber: ${op.operatorName}`,
        `Firma: ${op.companyName}`,
        `Rechtsform: ${op.legalForm}`,
        `Anschrift: ${op.street}, ${op.postalCode} ${op.city}, ${op.country}`,
        `E-Mail: ${op.contactEmail}`,
        `Telefon: ${op.contactPhone}`,
        `USt-IdNr.: ${op.vatId}`,
        `Registergericht: ${op.registerCourt}`,
        `Registernummer: ${op.registerNumber}`,
      ],
    },
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
      type: 'links',
      items: [
        { href: '/legal/datenschutz', label: 'Datenschutz' },
        { href: '/legal/agb', label: 'Nutzungsbedingungen' },
      ],
    },
  ];
}

function privacyBlocks(): LegalBlock[] {
  return [
    {
      type: 'note',
      text: 'Technischer Entwurf auf Basis des aktuellen Codes. Keine Aussage zur DSGVO-Zertifizierung, vollständigen Rechtskonformität oder anwaltlichen Prüfung.',
    },
    { type: 'h2', text: 'Verantwortliche Stelle' },
    {
      type: 'p',
      text: `Verantwortlich für die Verarbeitung ist der Betreiber: ${op.operatorName}, ${op.companyName} ${op.legalForm}, ${op.street}, ${op.postalCode} ${op.city}, ${op.country}, ${op.contactEmail}.`,
    },
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
      text: 'Google Login über Firebase Authentication ist vorhanden. Weitere OAuth-Anbieter können in der Oberfläche genannt, aber als nicht verfügbar gekennzeichnet sein. Es werden keine zusätzlichen Google-Marketingdienste erfunden.',
    },
    { type: 'h2', text: 'KI- und Medienanbieter' },
    {
      type: 'p',
      text: 'Im Code sind Integrationen vorbereitet, die nur greifen, wenn sie konfiguriert und die jeweilige Funktion genutzt wird. Ein Request geht nicht automatisch an jeden Anbieter.',
    },
    {
      type: 'ul',
      items: [
        'Vorbereitet / provider-gated: OpenAI, Google Gemini, Replicate, Runway, ElevenLabs (jeweils abhängig von vorhandener Konfiguration und Funktionsaufruf)',
        'Lokal/Test: Mock- und Gating-Pfade, ohne echte Provider-Aufrufe in der Testumgebung',
        'Suno: im Code erwähnt; der inoffizielle Endpunkt ist deaktiviert',
        'Voice: Stimmenpräferenz, lokale Preview und TTS-Generierung sind zu unterscheiden; TTS ist provider-gated',
        'Musik/Bild/Video: Verarbeitung nur, wenn der jeweilige Pfad aktiviert ist',
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
      text: 'Zahlungen sind derzeit deaktiviert. Stripe- und PayPal-Code kann vorbereitet sein, ohne dass aktuell Zahlungsaufrufe stattfinden. Coins sind internes App-Guthaben (Welcome-Bonus, Generierungskosten, Erstattungen, Historie, Quotes). Coins sind keine Kryptowährung und begründen keine Auszahlung.',
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
      text: 'Ein Konto entsteht über Firebase Authentication (E-Mail/Passwort oder Google) und die serverseitige App-Synchronisation. Der Zugang ist in der Regel nur mit Einladung möglich. Login-Daten sind geheim zu halten.',
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
    { type: 'h2', text: 'Coins' },
    {
      type: 'p',
      text: 'Coins sind internes App-Guthaben für Funktionen der Plattform (einschließlich Welcome-Bonus, Generierungskosten, Erstattungen bei technischen Fehlschlägen soweit der bestehende Mechanismus greift, Transaktionshistorie und Kostenvoranschläge). Coins sind keine Kryptowährung, kein Finanzprodukt und nicht auszahlbar. Ein Echtgeldkauf ist derzeit nicht verfügbar, solange Zahlungen deaktiviert sind.',
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
      text: 'Platzhalter. Ein Widerrufstext wird erst aufgenommen, wenn er rechtlich vorliegt. Es werden keine Fristen oder Musterbelehrungen erfunden.',
    },
    { type: 'h2', text: 'Hinweis' },
    {
      type: 'p',
      text: `Kontakt für rechtliche Korrespondenz, sobald hinterlegt: ${op.contactEmail}. Zahlungen sind derzeit deaktiviert; ein Kauf-Widerruf greift daher aktuell nicht als laufender Checkout-Prozess.`,
    },
  ];
}

function cookiesBlocks(): LegalBlock[] {
  return [
    {
      type: 'note',
      text: 'Technischer Entwurf zum tatsächlich vorhandenen Speicher. Kein Marketing-Cookie-Banner, weil aktuell keine optionalen Tracking-Dienste gesteuert werden.',
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
      'Impressum-Entwurf von NEXTER Creator Studio. Betreiberangaben sind Platzhalter, solange sie nicht hinterlegt sind.',
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
  return {
    status: LEGAL_TEXT_STATUS,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    reacceptanceRequired: LEGAL_REACCEPTANCE_REQUIRED,
    draft: true as const,
    notice: DRAFT_NOTICE,
  };
}
