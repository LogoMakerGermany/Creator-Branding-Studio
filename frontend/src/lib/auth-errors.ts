/** Map Firebase Auth error codes to user-friendly German messages. */
export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const message = err instanceof Error ? err.message : String(err);

  if (message === 'Failed to fetch' || code === 'NETWORK_ERROR') {
    return 'Backend nicht erreichbar. Starte im Projektordner: npm run dev';
  }

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Anmeldung abgebrochen. Bitte erneut klicken — du wirst zu Google weitergeleitet.';
    case 'auth/popup-blocked':
      return 'Popup wurde blockiert. Bitte Popups erlauben oder erneut klicken.';
    case 'auth/internal-error':
    case 'auth/unauthorized-domain':
    case 'auth/unauthorized-continue-uri':
    case 'auth/invalid-continue-uri':
      return 'Diese Domain ist in Firebase nicht autorisiert. Authorized domains in der Firebase Console ergänzen.';
    case 'auth/invalid-credential':
      return 'E-Mail oder Passwort falsch — oder der Account wurde mit Google/OAuth erstellt.';
    case 'auth/email-already-in-use':
      return 'Registrierung mit dieser E-Mail ist nicht möglich. Bitte anmelden oder Passwort zurücksetzen.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'E-Mail oder Passwort ist falsch.';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    case 'auth/too-many-requests':
    case 'RATE_LIMIT':
      return 'Zu viele Versuche. Bitte später erneut versuchen.';
    case 'auth/user-disabled':
    case 'ACCOUNT_DISABLED':
      return 'Dieses Konto ist deaktiviert.';
    case 'auth/expired-action-code':
      return 'Dieser Link ist abgelaufen. Bitte fordere eine neue E-Mail an.';
    case 'auth/invalid-action-code':
      return 'Dieser Link ist ungültig. Bitte fordere eine neue E-Mail an.';
    case 'auth/network-request-failed':
      return 'Netzwerkfehler. Die E-Mail wurde nicht gesendet. Bitte später erneut versuchen.';
    case 'auth/requires-recent-login':
      return 'Bitte melde dich erneut an, um dein Passwort zu ändern.';
    case 'auth/weak-password':
      return 'Das neue Passwort ist zu kurz. Bitte mindestens 6 Zeichen wählen.';
    case 'auth/operation-not-allowed':
      return 'Dieser Anmeldeanbieter ist derzeit nicht verfügbar.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
    case 'EMAIL_ALREADY_VERIFIED':
      return 'Diese E-Mail ist bereits bestätigt.';
    case 'EMAIL_VERIFICATION_NOT_REQUIRED':
      return 'Für dieses Konto ist keine E-Mail-Bestätigung nötig.';
    case 'INVALID_TOKEN':
    case 'AUTH_REQUIRED':
      return 'Sitzung abgelaufen. Bitte erneut anmelden.';
    case 'ACCESS_DENIED':
      return message || 'Zugriff verweigert.';
    case 'LEGAL_ACCEPTANCE_REQUIRED':
      return (
        message ||
        'Bitte akzeptiere die Nutzungsbedingungen und bestätige, die Datenschutzerklärung gelesen zu haben.'
      );
    default:
      if (message.includes('Weiterleitung')) return message;
      if (/auth\/popup-closed-by-user/i.test(message)) {
        return 'Anmeldung abgebrochen. Bitte erneut klicken — du wirst weitergeleitet.';
      }
      if (/stack|at Object\.|TypeError:/i.test(message) && message.length > 180) {
        return 'Anmeldung fehlgeschlagen. Bitte später erneut versuchen.';
      }
      return message.replace(/^Firebase: Error \(([^)]+)\)\.?$/i, 'Anmeldung fehlgeschlagen ($1).');
  }
}
