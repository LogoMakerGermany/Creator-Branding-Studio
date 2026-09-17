/** Map Firebase Auth error codes to user-friendly German messages. */

const RETIRED_UCBS_HOST = ['creatorbrandingstudioultimate', 'production.up.railway.app'].join('-');
const RETIRED_FIREBASE_PROJECT = ['creatorstudio', '519eb'].join('-');

function currentAuthHost(): string {
  if (typeof window === 'undefined') return '';
  const host = window.location?.host?.trim() ?? '';
  if (!host) return '';
  if (host === RETIRED_UCBS_HOST || host.includes(RETIRED_FIREBASE_PROJECT)) return '';
  return host;
}

function unauthorizedDomainMessage(): string {
  const host = currentAuthHost();
  if (host) {
    return `Diese Domain (${host}) ist in Firebase nicht autorisiert. Authorized domains in der Firebase Console ergänzen.`;
  }
  return 'Diese Domain ist in Firebase nicht autorisiert. Authorized domains in der Firebase Console ergänzen.';
}

function scrubRetiredAuthOrigins(text: string): string {
  return text.split(RETIRED_UCBS_HOST).join('diese Domain').split(RETIRED_FIREBASE_PROJECT).join('das vorherige Projekt');
}

export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const message = err instanceof Error ? err.message : String(err);

  if (message === 'Failed to fetch' || code === 'NETWORK_ERROR') {
    return 'Backend nicht erreichbar. Starte im Projektordner: npm run dev';
  }

  let mapped: string;
  switch (code) {
    case 'auth/popup-closed-by-user':
      mapped = 'Anmeldung abgebrochen. Bitte erneut klicken — du wirst zu Google weitergeleitet.';
      break;
    case 'auth/popup-blocked':
      mapped = 'Popup wurde blockiert. Bitte Popups erlauben oder erneut klicken.';
      break;
    case 'auth/internal-error':
    case 'auth/unauthorized-domain':
    case 'auth/unauthorized-continue-uri':
    case 'auth/invalid-continue-uri':
      mapped = unauthorizedDomainMessage();
      break;
    case 'auth/invalid-credential':
      mapped = 'E-Mail oder Passwort falsch — oder der Account wurde mit Google/OAuth erstellt.';
      break;
    case 'auth/email-already-in-use':
      mapped = 'Registrierung mit dieser E-Mail ist nicht möglich. Bitte anmelden oder Passwort zurücksetzen.';
      break;
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      mapped = 'E-Mail oder Passwort ist falsch.';
      break;
    case 'auth/invalid-email':
    case 'auth/missing-email':
      mapped = 'Bitte gib eine gültige E-Mail-Adresse ein.';
      break;
    case 'auth/too-many-requests':
    case 'RATE_LIMIT':
      mapped = 'Zu viele Versuche. Bitte später erneut versuchen.';
      break;
    case 'auth/user-disabled':
    case 'ACCOUNT_DISABLED':
      mapped = 'Dieses Konto ist deaktiviert.';
      break;
    case 'auth/expired-action-code':
      mapped = 'Dieser Link ist abgelaufen. Bitte fordere eine neue E-Mail an.';
      break;
    case 'auth/invalid-action-code':
      mapped = 'Dieser Link ist ungültig. Bitte fordere eine neue E-Mail an.';
      break;
    case 'auth/network-request-failed':
      mapped = 'Netzwerkfehler. Die E-Mail wurde nicht gesendet. Bitte später erneut versuchen.';
      break;
    case 'auth/requires-recent-login':
      mapped = 'Bitte melde dich erneut an, um dein Passwort zu ändern.';
      break;
    case 'auth/weak-password':
      mapped = 'Das neue Passwort ist zu kurz. Bitte mindestens 6 Zeichen wählen.';
      break;
    case 'auth/operation-not-allowed':
      mapped = 'Dieser Anmeldeanbieter ist derzeit nicht verfügbar.';
      break;
    case 'EMAIL_NOT_VERIFIED':
      mapped = 'Bitte bestätige zuerst deine E-Mail-Adresse.';
      break;
    case 'EMAIL_ALREADY_VERIFIED':
      mapped = 'Diese E-Mail ist bereits bestätigt.';
      break;
    case 'EMAIL_VERIFICATION_NOT_REQUIRED':
      mapped = 'Für dieses Konto ist keine E-Mail-Bestätigung nötig.';
      break;
    case 'INVALID_TOKEN':
    case 'AUTH_REQUIRED':
      mapped = 'Sitzung abgelaufen. Bitte erneut anmelden.';
      break;
    case 'OAUTH_NOT_CONFIGURED':
      mapped = 'Dieser Anmeldeanbieter ist derzeit nicht verfügbar.';
      break;
    case 'ACCOUNT_COLLISION':
      mapped =
        'Zu dieser E-Mail existiert bereits ein Konto. Bitte zuerst damit anmelden und den Anbieter verknüpfen.';
      break;
    case 'OAUTH_LINK_CONFLICT':
      mapped = 'Dieser Anbieter ist bereits mit einem anderen Konto verknüpft.';
      break;
    case 'OAUTH_TICKET_INVALID':
    case 'OAUTH_TICKET_EXPIRED':
    case 'OAUTH_TICKET_REPLAY':
      mapped = 'Die Anmeldung ist abgelaufen. Bitte erneut versuchen.';
      break;
    case 'OAUTH_CANCELLED':
      mapped = 'Anmeldung abgebrochen.';
      break;
    case 'OAUTH_FAILED':
      mapped = 'Anmeldung beim Anbieter fehlgeschlagen. Bitte erneut versuchen.';
      break;
    case 'INVITE_REQUIRED':
      mapped = message || 'Einladungscode erforderlich — NEXTER ist derzeit nur mit Einladung zugänglich';
      break;
    case 'INVITE_INVALID':
      mapped = message || 'Ungültiger oder inaktiver Einladungscode';
      break;
    case 'INVITE_EXPIRED':
      mapped = message || 'Einladungscode ist abgelaufen';
      break;
    case 'INVITE_EXHAUSTED':
      mapped = message || 'Einladungscode wurde bereits zu oft verwendet';
      break;
    case 'INVITE_EMAIL_MISMATCH':
      mapped =
        message ||
        'Dieser Einladungscode ist an eine E-Mail-Adresse gebunden. Melde dich mit der eingeladenen E-Mail-Adresse an.';
      break;
    case 'INVITE_EMAIL_REQUIRED':
      mapped =
        message ||
        'Dieser Einladungscode ist an eine E-Mail-Adresse gebunden. Der gewählte Anbieter stellt für diese Anmeldung keine bestätigbare E-Mail-Adresse bereit. Melde dich zuerst mit der eingeladenen E-Mail-Adresse an und verknüpfe den Anbieter anschließend in deinen Einstellungen.';
      break;
    case 'ACCESS_DENIED':
      mapped = message || 'Zugriff verweigert.';
      break;
    case 'LEGAL_ACCEPTANCE_REQUIRED':
      mapped =
        message ||
        'Bitte akzeptiere die Nutzungsbedingungen und bestätige, die Datenschutzerklärung gelesen zu haben.';
      break;
    default:
      if (message.includes('Weiterleitung')) {
        mapped = message;
        break;
      }
      if (/auth\/popup-closed-by-user/i.test(message)) {
        mapped = 'Anmeldung abgebrochen. Bitte erneut klicken — du wirst weitergeleitet.';
        break;
      }
      if (/stack|at Object\.|TypeError:/i.test(message) && message.length > 180) {
        mapped = 'Anmeldung fehlgeschlagen. Bitte später erneut versuchen.';
        break;
      }
      mapped = message.replace(/^Firebase: Error \(([^)]+)\)\.?$/i, 'Anmeldung fehlgeschlagen ($1).');
  }

  return scrubRetiredAuthOrigins(mapped);
}
