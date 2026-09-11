import type { User } from 'firebase/auth';

export const AUTH_PROVIDER_IDS = [
  'google',
  'discord',
  'twitch',
  'tiktok',
  'microsoft',
  'email',
] as const;

export type AuthProviderId = (typeof AUTH_PROVIDER_IDS)[number];

export function isFirebaseHostedOAuth(id: AuthProviderId): boolean {
  return id === 'google' || id === 'microsoft';
}

export function isBridgeOAuthProvider(id: AuthProviderId): boolean {
  return id === 'discord' || id === 'twitch' || id === 'tiktok';
}

export function resolveAuthProvider(user: User): AuthProviderId {
  const providerId = user.providerData[0]?.providerId || user.providerId;

  if (providerId === 'google.com') return 'google';
  if (providerId === 'microsoft.com') return 'microsoft';
  if (providerId === 'password') return 'email';

  if (providerId.includes('discord')) return 'discord';
  if (providerId.includes('twitch')) return 'twitch';
  if (providerId.includes('tiktok')) return 'tiktok';

  return 'email';
}
