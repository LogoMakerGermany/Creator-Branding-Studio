/** Map Firebase Auth error codes to user-friendly German messages. */
export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const message = err instanceof Error ? err.message : String(err);

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Anmeldung abgebrochen. Bitte erneut versuchen.';
    case 'auth/popup-blocked':
      return 'Popup wurde blockiert. Bitte Popups erlauben oder erneut klicken.';
    case 'auth/internal-error':
      return 'Google-Anmeldung fehlgeschlagen. Prüfe in Firebase Console unter Authentication → Settings → Authorized domains, ob diese Domain eingetragen ist: creatorbrandingstudioultimate-production.up.railway.app';
    case 'auth/unauthorized-domain':
      return 'Diese Domain ist in Firebase nicht autorisiert. Authorized domains in der Firebase Console ergänzen.';
    case 'auth/invalid-credential':
      return 'E-Mail oder Passwort falsch — oder der Account wurde mit Google/OAuth erstellt.';
    case 'auth/email-already-in-use':
      return 'Diese E-Mail ist bereits registriert. Bitte anmelden oder Google/OAuth nutzen.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'E-Mail oder Passwort ist falsch.';
    default:
      if (message.includes('Weiterleitung')) return message;
      return message.replace(/^Firebase: Error \(([^)]+)\)\.?$/i, 'Anmeldung fehlgeschlagen ($1).');
  }
}
