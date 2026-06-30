/** UI- und Feature-Flags für die Vorbereitungsphase. */
export const MAGIK_AI_FEATURE_FLAGS = {
  assistantEnabled: false,
  showShell: true,
  showAvatar: false,
  showAnimations: false,
  showDialog: false,
  allowConversation: false,
} as const;

export const MAGIK_AI_UI = {
  position: 'bottom-right' as const,
  defaultMinimized: true,
  comingSoonLabel: 'Demnächst verfügbar',
} as const;
