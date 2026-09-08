import { AppError } from '../middleware/errorHandler.js';
import { dsGet, dsSet } from '../lib/data-store.js';
import { withDevLock } from '../lib/dev-mutex.js';

const COLLECTION = 'email_verification_resends';
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

export async function authorizeVerificationResend(params: {
  uid: string;
  emailVerified?: boolean | null;
  signInProvider?: string | null;
}): Promise<{ allowed: true }> {
  if (params.emailVerified === true) {
    throw new AppError(400, 'EMAIL_ALREADY_VERIFIED', 'Diese E-Mail ist bereits bestätigt.');
  }
  if (params.signInProvider && params.signInProvider !== 'password') {
    throw new AppError(
      400,
      'EMAIL_VERIFICATION_NOT_REQUIRED',
      'Für dieses Konto ist keine E-Mail-Bestätigung nötig.'
    );
  }

  return withDevLock(`email-resend:${params.uid}`, async () => {
    const rec = await dsGet(COLLECTION, params.uid);
    const last = rec?.sentAt ? Date.parse(String(rec.sentAt)) : 0;
    if (Number.isFinite(last) && Date.now() - last < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) {
      throw new AppError(429, 'RATE_LIMIT', 'Bitte warte, bevor du die Bestätigung erneut sendest.');
    }
    await dsSet(COLLECTION, params.uid, {
      id: params.uid,
      sentAt: new Date().toISOString(),
    });
    return { allowed: true as const };
  });
}
