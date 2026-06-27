export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
}

export interface PaginatedRequest {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AuthTokenPayload {
  uid: string;
  email: string;
  role: string;
  agencyId?: string;
  teamId?: string;
}

export const API_ROUTES = {
  AUTH: '/api/v1/auth',
  USERS: '/api/v1/users',
  DNA: '/api/v1/dna',
  LOGO: '/api/v1/logo',
  BANNER: '/api/v1/banner',
  FACECAM: '/api/v1/facecam',
  BRANDING: '/api/v1/branding',
  CHANGE_REQUEST: '/api/v1/change-request',
  LAYOUT: '/api/v1/layout',
  ASSISTANT: '/api/v1/assistant',
  TEAM: '/api/v1/team',
  AGENCY: '/api/v1/agency',
  VIDEO: '/api/v1/video',
  INTRO_OUTRO: '/api/v1/intro-outro',
  VTUBER: '/api/v1/vtuber',
  AI_IMAGE: '/api/v1/ai/image',
  AI_VIDEO: '/api/v1/ai/video',
  AI_MUSIC: '/api/v1/ai/music',
  AI_VOICE: '/api/v1/ai/voice',
  SOCIAL: '/api/v1/social',
  CALENDAR: '/api/v1/calendar',
  CHAT: '/api/v1/chat',
  CLIENT: '/api/v1/client',
  FILES: '/api/v1/files',
  MARKETPLACE: '/api/v1/marketplace',
  COINS: '/api/v1/coins',
  STRIPE: '/api/v1/stripe',
  PAYPAL: '/api/v1/paypal',
  WHITE_LABEL: '/api/v1/white-label',
  MOBILE: '/api/v1/mobile',
  LIVE_STREAM: '/api/v1/live-stream',
} as const;
