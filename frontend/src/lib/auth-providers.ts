import type { User } from 'firebase/auth';

export const AUTH_PROVIDER_IDS = [
  'google',
  'discord',
  'twitch',
  'tiktok',
  'github',
  'apple',
  'microsoft',
  'email',
] as const;

export type AuthProviderId = (typeof AUTH_PROVIDER_IDS)[number];

export function resolveAuthProvider(user: User): AuthProviderId {
  const providerId = user.providerData[0]?.providerId || user.providerId;

  if (providerId === 'google.com') return 'google';
  if (providerId === 'github.com') return 'github';
  if (providerId === 'apple.com') return 'apple';
  if (providerId === 'microsoft.com') return 'microsoft';
  if (providerId === 'password') return 'email';
  if (providerId === 'oidc.discord') return 'discord';
  if (providerId === 'oidc.twitch') return 'twitch';
  if (providerId === 'oidc.tiktok') return 'tiktok';

  if (providerId.includes('discord')) return 'discord';
  if (providerId.includes('twitch')) return 'twitch';
  if (providerId.includes('tiktok')) return 'tiktok';

  return 'email';
}
