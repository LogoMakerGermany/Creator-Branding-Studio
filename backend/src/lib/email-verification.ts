export function passwordProviderNeedsEmailVerification(
  signInProvider?: string | null,
  emailVerified?: boolean | null
): boolean {
  return signInProvider === 'password' && emailVerified !== true;
}

export function isEmailVerificationExemptPath(method: string, baseUrl: string, path: string): boolean {
  const combined = `${baseUrl}${path}`.replace(/\/+$/, '') || '/';
  if (method === 'GET' && (combined.endsWith('/auth/me') || combined.endsWith('/auth/export'))) {
    return true;
  }
  if (method === 'POST' && combined.endsWith('/auth/account/delete')) {
    return true;
  }
  if (method === 'POST' && combined.endsWith('/auth/email-verification/resend')) {
    return true;
  }
  return false;
}
