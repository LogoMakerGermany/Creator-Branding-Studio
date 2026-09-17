/** User-facing legacy URL map. API /api/v1 stays. No Firestore/collection changes. */

export const LEGACY_REDIRECTS: Record<string, string> = {
  '/branding-studio': '/logo-studio',
  '/ai-creator': '/nexter',
  '/ai-assistant': '/nexter',
  '/social-media': '/social-studio',
  '/vtuber-studio': '/animation-studio',
  '/settings/magik-assistant': '/settings',
  '/mobile-app': '/settings',
  '/branding-generator': '/streamset-studio',
  '/ai-image': '/nexter',
  '/ultimate-creator': '/streamset-studio',
  '/export-center': '/projects',
};

export const LEGACY_UNAVAILABLE_PATHS = [
  '/marketplace',
  '/team-chat',
  '/team-dna',
  '/teams',
  '/agency-dna',
  '/agency-management',
  '/client-portal',
  '/white-label',
  '/live-streaming',
] as const;

export const ACTIVE_APP_PATHS = [
  '/dashboard',
  '/nexter',
  '/creator-dna',
  '/logo-studio',
  '/banner-studio',
  '/facecam-studio',
  '/overlay-studio',
  '/sticker-studio',
  '/streamset-studio',
  '/animation-studio',
  '/intro-outro',
  '/video-studio',
  '/ai-video',
  '/shorts-studio',
  '/ai-music',
  '/ai-voice',
  '/social-studio',
  '/content-calendar',
  '/text-studio',
  '/mockup-studio',
  '/layout-studio',
  '/change-request',
  '/projects',
  '/file-cloud',
  '/settings',
  '/support',
  '/coins',
  '/templates',
  '/admin',
  '/prompt-studio',
] as const;

export const PUBLIC_PATHS = ['/', '/login', '/login/oauth/complete'] as const;
export const AUTH_ACTION_PATHS = ['/verify-email'] as const;
export const ONBOARDING_PATHS = ['/onboarding', '/nexter-setup'] as const;
