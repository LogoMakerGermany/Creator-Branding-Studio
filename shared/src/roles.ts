export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  /** Product role: normal customer (replaces CREATOR for new signups) */
  USER = 'user',
  /** Product role: closed beta tester with promotional credit */
  TESTER = 'tester',
  /** Optional support staff */
  SUPPORT = 'support',
  AGENCY_OWNER = 'agency_owner',
  AGENCY_MANAGER = 'agency_manager',
  AGENCY_EMPLOYEE = 'agency_employee',
  TEAM_LEADER = 'team_leader',
  TEAM_MEMBER = 'team_member',
  /** @deprecated Prefer USER — kept for existing profiles */
  CREATOR = 'creator',
  CLIENT = 'client',
  GUEST = 'guest',
}

/** Core product roles used for registration and admin tooling. */
export type ProductRole = UserRole.USER | UserRole.TESTER | UserRole.ADMIN | UserRole.SUPPORT;

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export function isTesterRole(role: UserRole): boolean {
  return role === UserRole.TESTER;
}

/** Normalize legacy CREATOR to USER for product-facing checks. */
export function normalizeProductRole(role: UserRole): UserRole {
  if (role === UserRole.CREATOR) return UserRole.USER;
  return role;
}

export interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
}

export enum Permission {
  // User
  MANAGE_USERS = 'manage_users',
  VIEW_USERS = 'view_users',
  MANAGE_INVITES = 'manage_invites',
  MANAGE_PRICING = 'manage_pricing',
  MANAGE_SYSTEM = 'manage_system',
  VIEW_ADMIN = 'view_admin',

  // Creator DNA
  CREATE_DNA = 'create_dna',
  EDIT_DNA = 'edit_dna',
  VIEW_DNA = 'view_dna',

  // Studios
  USE_LOGO_STUDIO = 'use_logo_studio',
  USE_BANNER_STUDIO = 'use_banner_studio',
  USE_FACECAM_STUDIO = 'use_facecam_studio',
  USE_OVERLAY_STUDIO = 'use_overlay_studio',
  USE_STICKER_STUDIO = 'use_sticker_studio',
  USE_LAYOUT_STUDIO = 'use_layout_studio',
  USE_VIDEO_STUDIO = 'use_video_studio',
  USE_VTUBER_STUDIO = 'use_vtuber_studio',

  // AI
  USE_AI_ASSISTANT = 'use_ai_assistant',
  USE_AI_IMAGE = 'use_ai_image',
  USE_AI_VIDEO = 'use_ai_video',
  USE_AI_MUSIC = 'use_ai_music',
  USE_AI_VOICE = 'use_ai_voice',

  // Agency
  MANAGE_AGENCY = 'manage_agency',
  MANAGE_CLIENTS = 'manage_clients',
  MANAGE_PROJECTS = 'manage_projects',
  MANAGE_EMPLOYEES = 'manage_employees',

  // Team
  MANAGE_TEAM = 'manage_team',
  MANAGE_TEAM_DNA = 'manage_team_dna',

  // Marketplace
  SELL_MARKETPLACE = 'sell_marketplace',
  BUY_MARKETPLACE = 'buy_marketplace',

  // Coins & Billing
  MANAGE_BILLING = 'manage_billing',
  PURCHASE_COINS = 'purchase_coins',

  // White Label
  MANAGE_WHITE_LABEL = 'manage_white_label',

  // Social & Content
  MANAGE_SOCIAL = 'manage_social',
  MANAGE_CALENDAR = 'manage_calendar',
  USE_TEAM_CHAT = 'use_team_chat',

  // Files
  UPLOAD_FILES = 'upload_files',
  MANAGE_FILES = 'manage_files',

  // Client Portal
  ACCESS_CLIENT_PORTAL = 'access_client_portal',

  // Phase 5
  USE_MOBILE_APP = 'use_mobile_app',
  USE_LIVE_STREAMING = 'use_live_streaming',
  USE_MOCKUP_STUDIO = 'use_mockup_studio',
  USE_TEXT_STUDIO = 'use_text_studio',
  SUBMIT_FEEDBACK = 'submit_feedback',
}

/** V1 product surface — no Agency / Marketplace / White-Label / Live / native Mobile. */
const V1_PRODUCT_PERMISSIONS: Permission[] = [
  Permission.CREATE_DNA,
  Permission.EDIT_DNA,
  Permission.VIEW_DNA,
  Permission.USE_LOGO_STUDIO,
  Permission.USE_BANNER_STUDIO,
  Permission.USE_FACECAM_STUDIO,
  Permission.USE_OVERLAY_STUDIO,
  Permission.USE_STICKER_STUDIO,
  Permission.USE_LAYOUT_STUDIO,
  Permission.USE_VIDEO_STUDIO,
  Permission.USE_AI_ASSISTANT,
  Permission.USE_AI_IMAGE,
  Permission.USE_AI_VIDEO,
  Permission.USE_AI_MUSIC,
  Permission.USE_AI_VOICE,
  Permission.MANAGE_PROJECTS,
  Permission.PURCHASE_COINS,
  Permission.MANAGE_SOCIAL,
  Permission.MANAGE_CALENDAR,
  Permission.UPLOAD_FILES,
  Permission.MANAGE_FILES,
  Permission.USE_MOCKUP_STUDIO,
  Permission.USE_TEXT_STUDIO,
  Permission.SUBMIT_FEEDBACK,
];

const CREATOR_PERMISSIONS: Permission[] = [
  ...V1_PRODUCT_PERMISSIONS,
  Permission.USE_VTUBER_STUDIO,
  Permission.MANAGE_TEAM,
  Permission.MANAGE_TEAM_DNA,
  Permission.MANAGE_AGENCY,
  Permission.MANAGE_CLIENTS,
  Permission.SELL_MARKETPLACE,
  Permission.BUY_MARKETPLACE,
  Permission.MANAGE_WHITE_LABEL,
  Permission.USE_TEAM_CHAT,
  Permission.ACCESS_CLIENT_PORTAL,
  Permission.USE_MOBILE_APP,
  Permission.USE_LIVE_STREAMING,
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(Permission),
  [UserRole.ADMIN]: Object.values(Permission).filter(
    (p) => p !== Permission.MANAGE_WHITE_LABEL
  ),
  [UserRole.USER]: [...V1_PRODUCT_PERMISSIONS],
  [UserRole.TESTER]: [...V1_PRODUCT_PERMISSIONS],
  [UserRole.SUPPORT]: [
    Permission.VIEW_USERS,
    Permission.VIEW_ADMIN,
    Permission.VIEW_DNA,
    Permission.MANAGE_PROJECTS,
  ],
  [UserRole.AGENCY_OWNER]: [
    Permission.VIEW_USERS,
    Permission.CREATE_DNA,
    Permission.EDIT_DNA,
    Permission.VIEW_DNA,
    Permission.USE_LOGO_STUDIO,
    Permission.USE_BANNER_STUDIO,
    Permission.USE_FACECAM_STUDIO,
    Permission.USE_OVERLAY_STUDIO,
    Permission.USE_STICKER_STUDIO,
    Permission.USE_LAYOUT_STUDIO,
    Permission.USE_VIDEO_STUDIO,
    Permission.USE_VTUBER_STUDIO,
    Permission.USE_AI_ASSISTANT,
    Permission.USE_AI_IMAGE,
    Permission.USE_AI_VIDEO,
    Permission.USE_AI_MUSIC,
    Permission.USE_AI_VOICE,
    Permission.MANAGE_AGENCY,
    Permission.MANAGE_CLIENTS,
    Permission.MANAGE_PROJECTS,
    Permission.MANAGE_EMPLOYEES,
    Permission.MANAGE_TEAM,
    Permission.MANAGE_TEAM_DNA,
    Permission.SELL_MARKETPLACE,
    Permission.BUY_MARKETPLACE,
    Permission.MANAGE_BILLING,
    Permission.PURCHASE_COINS,
    Permission.MANAGE_WHITE_LABEL,
    Permission.MANAGE_SOCIAL,
    Permission.MANAGE_CALENDAR,
    Permission.USE_TEAM_CHAT,
    Permission.UPLOAD_FILES,
    Permission.MANAGE_FILES,
    Permission.USE_MOBILE_APP,
    Permission.USE_LIVE_STREAMING,
  ],
  [UserRole.AGENCY_MANAGER]: [
    Permission.VIEW_USERS,
    Permission.CREATE_DNA,
    Permission.EDIT_DNA,
    Permission.VIEW_DNA,
    Permission.USE_LOGO_STUDIO,
    Permission.USE_BANNER_STUDIO,
    Permission.USE_FACECAM_STUDIO,
    Permission.USE_OVERLAY_STUDIO,
    Permission.USE_STICKER_STUDIO,
    Permission.USE_LAYOUT_STUDIO,
    Permission.USE_VIDEO_STUDIO,
    Permission.USE_VTUBER_STUDIO,
    Permission.USE_AI_ASSISTANT,
    Permission.USE_AI_IMAGE,
    Permission.USE_AI_VIDEO,
    Permission.USE_AI_MUSIC,
    Permission.USE_AI_VOICE,
    Permission.MANAGE_CLIENTS,
    Permission.MANAGE_PROJECTS,
    Permission.MANAGE_EMPLOYEES,
    Permission.MANAGE_TEAM,
    Permission.MANAGE_TEAM_DNA,
    Permission.SELL_MARKETPLACE,
    Permission.BUY_MARKETPLACE,
    Permission.PURCHASE_COINS,
    Permission.MANAGE_SOCIAL,
    Permission.MANAGE_CALENDAR,
    Permission.USE_TEAM_CHAT,
    Permission.UPLOAD_FILES,
    Permission.MANAGE_FILES,
    Permission.USE_MOBILE_APP,
    Permission.USE_LIVE_STREAMING,
  ],
  [UserRole.AGENCY_EMPLOYEE]: [
    Permission.VIEW_DNA,
    Permission.USE_LOGO_STUDIO,
    Permission.USE_BANNER_STUDIO,
    Permission.USE_FACECAM_STUDIO,
    Permission.USE_OVERLAY_STUDIO,
    Permission.USE_STICKER_STUDIO,
    Permission.USE_LAYOUT_STUDIO,
    Permission.USE_VIDEO_STUDIO,
    Permission.USE_VTUBER_STUDIO,
    Permission.USE_AI_ASSISTANT,
    Permission.USE_AI_IMAGE,
    Permission.USE_AI_VIDEO,
    Permission.USE_AI_MUSIC,
    Permission.USE_AI_VOICE,
    Permission.MANAGE_PROJECTS,
    Permission.BUY_MARKETPLACE,
    Permission.PURCHASE_COINS,
    Permission.USE_TEAM_CHAT,
    Permission.UPLOAD_FILES,
    Permission.USE_MOBILE_APP,
    Permission.USE_LIVE_STREAMING,
  ],
  [UserRole.TEAM_LEADER]: [
    Permission.CREATE_DNA,
    Permission.EDIT_DNA,
    Permission.VIEW_DNA,
    Permission.USE_LOGO_STUDIO,
    Permission.USE_BANNER_STUDIO,
    Permission.USE_FACECAM_STUDIO,
    Permission.USE_OVERLAY_STUDIO,
    Permission.USE_STICKER_STUDIO,
    Permission.USE_LAYOUT_STUDIO,
    Permission.USE_VIDEO_STUDIO,
    Permission.USE_VTUBER_STUDIO,
    Permission.USE_AI_ASSISTANT,
    Permission.USE_AI_IMAGE,
    Permission.USE_AI_VIDEO,
    Permission.USE_AI_MUSIC,
    Permission.USE_AI_VOICE,
    Permission.MANAGE_TEAM,
    Permission.MANAGE_TEAM_DNA,
    Permission.BUY_MARKETPLACE,
    Permission.PURCHASE_COINS,
    Permission.MANAGE_SOCIAL,
    Permission.MANAGE_CALENDAR,
    Permission.USE_TEAM_CHAT,
    Permission.UPLOAD_FILES,
    Permission.MANAGE_FILES,
    Permission.USE_MOBILE_APP,
    Permission.USE_LIVE_STREAMING,
  ],
  [UserRole.TEAM_MEMBER]: [
    Permission.VIEW_DNA,
    Permission.USE_LOGO_STUDIO,
    Permission.USE_BANNER_STUDIO,
    Permission.USE_FACECAM_STUDIO,
    Permission.USE_OVERLAY_STUDIO,
    Permission.USE_STICKER_STUDIO,
    Permission.USE_LAYOUT_STUDIO,
    Permission.USE_VIDEO_STUDIO,
    Permission.USE_VTUBER_STUDIO,
    Permission.USE_AI_ASSISTANT,
    Permission.USE_AI_IMAGE,
    Permission.USE_AI_VIDEO,
    Permission.USE_AI_MUSIC,
    Permission.USE_AI_VOICE,
    Permission.BUY_MARKETPLACE,
    Permission.PURCHASE_COINS,
    Permission.USE_TEAM_CHAT,
    Permission.UPLOAD_FILES,
    Permission.USE_MOBILE_APP,
    Permission.USE_LIVE_STREAMING,
  ],
  [UserRole.CREATOR]: [...CREATOR_PERMISSIONS],
  [UserRole.CLIENT]: [
    Permission.VIEW_DNA,
    Permission.ACCESS_CLIENT_PORTAL,
    Permission.UPLOAD_FILES,
  ],
  [UserRole.GUEST]: [],
};
