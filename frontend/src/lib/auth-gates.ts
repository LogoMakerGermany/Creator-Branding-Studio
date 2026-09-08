export type AuthGate = 'login' | 'verify-email' | 'onboarding' | 'nexter-setup' | 'app';

export function passwordProviderNeedsEmailVerification(
  signInProvider?: string | null,
  emailVerified?: boolean | null
): boolean {
  return signInProvider === 'password' && emailVerified !== true;
}

export function resolveAuthGate(user: {
  onboardingCompleted?: boolean;
  nexterPreferences?: { personalizationCompleted?: boolean } | null;
  needsEmailVerification?: boolean;
} | null): AuthGate {
  if (!user) return 'login';
  if (user.needsEmailVerification) return 'verify-email';
  if (!user.onboardingCompleted) return 'onboarding';
  if (user.nexterPreferences?.personalizationCompleted !== true) return 'nexter-setup';
  return 'app';
}

export const AUTH_GATE_PATH: Record<AuthGate, string> = {
  login: '/login',
  'verify-email': '/verify-email',
  onboarding: '/onboarding',
  'nexter-setup': '/nexter-setup',
  app: '/dashboard',
};

export function isPathAllowedForGate(pathname: string, gate: AuthGate): boolean {
  if (pathname.startsWith('/legal')) return true;
  if (gate === 'login') return false;
  if (gate === 'verify-email') return pathname.startsWith('/verify-email');
  if (gate === 'onboarding') return pathname.startsWith('/onboarding');
  if (gate === 'nexter-setup') return pathname.startsWith('/nexter-setup');
  return true;
}
