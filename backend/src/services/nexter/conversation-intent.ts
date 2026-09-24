import {
  detectChangeIntent,
  detectOpenStudio,
  detectQuoteKind,
} from './tools.service.js';
import {
  isAccountSettingsMessage,
  isAmbiguousBareMessage,
  isAppHelpMessage,
  isCreatorAdviceMessage,
  isProjectAnalysisMessage,
  isSmalltalkMessage,
  isTopicResetMessage,
  looksLikeAssetEditFollowUp,
  looksLikeWorkflowResume,
} from './conversation-intent-patterns.js';
import { isBareAssetKindUtterance, isProjectMemoryUtterance, parseProjectAssetRoleFromText, parseProjectCommand } from '@ucbs/shared';

export type NexterConversationIntent =
  | 'SMALLTALK'
  | 'CREATOR_ADVICE'
  | 'PROJECT_ANALYSIS'
  | 'PROJECT_ACTION'
  | 'CREATE_ASSET'
  | 'MODIFY_ASSET'
  | 'NAVIGATION_ACTION'
  | 'APP_HELP'
  | 'ACCOUNT_OR_SETTINGS'
  | 'AMBIGUOUS';

export type NexterIntentConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type NexterIntentDecision = {
  intent: NexterConversationIntent;
  confidence: NexterIntentConfidence;
  reason: string;
};

export type NexterIntentHistoryTurn = { role: string; content: string };

const CREATE_VERB = /(mach|erstell|generier|erzeug|ich brauche|ich möchte|need |create |make me|make a new|for a new)/i;

export function resolveNexterConversationIntent(
  message: string,
  history: NexterIntentHistoryTurn[] = [],
  ctx?: { lastLogoId?: string; lastBannerId?: string; lastFacecamId?: string; lastOverlayId?: string }
): NexterIntentDecision {
  const text = String(message ?? '').trim();
  if (!text) {
    return { intent: 'AMBIGUOUS', confidence: 'LOW', reason: 'empty' };
  }

  if (isSmalltalkMessage(text) || isTopicResetMessage(text)) {
    return { intent: 'SMALLTALK', confidence: 'HIGH', reason: 'social-utterance' };
  }

  if (isProjectAnalysisMessage(text)) {
    return { intent: 'PROJECT_ANALYSIS', confidence: 'HIGH', reason: 'gap-or-inventory' };
  }

  if (isProjectMemoryUtterance(text)) {
    const action = parseProjectCommand(text).action;
    if (action === 'open' || action === 'use' || action === 'switch' || action === 'clear') {
      return { intent: 'NAVIGATION_ACTION', confidence: 'HIGH', reason: 'project-select' };
    }
    if (action === 'set_current') {
      return { intent: 'PROJECT_ACTION', confidence: 'HIGH', reason: 'project-mutate' };
    }
    return { intent: 'PROJECT_ANALYSIS', confidence: 'HIGH', reason: 'project-memory' };
  }

  if (isCreatorAdviceMessage(text)) {
    return { intent: 'CREATOR_ADVICE', confidence: 'HIGH', reason: 'brand-advice' };
  }

  if (isAppHelpMessage(text)) {
    return { intent: 'APP_HELP', confidence: 'HIGH', reason: 'product-help' };
  }

  if (isAccountSettingsMessage(text)) {
    return { intent: 'ACCOUNT_OR_SETTINGS', confidence: 'HIGH', reason: 'settings' };
  }

  const quoteKind = detectQuoteKind(text);
  const change = detectChangeIntent(text, ctx);
  if (
    !change &&
    /\b(change|änder)\b.{0,48}\b(current|aktuell)/i.test(text) &&
    parseProjectAssetRoleFromText(text)
  ) {
    return { intent: 'MODIFY_ASSET', confidence: 'HIGH', reason: 'current-asset-modify' };
  }
  if (quoteKind && CREATE_VERB.test(text) && !change) {
    return { intent: 'CREATE_ASSET', confidence: 'HIGH', reason: `quote-kind:${quoteKind}` };
  }
  if (quoteKind && /komplettset|streamset|3\s*teile/.test(text.toLowerCase())) {
    return { intent: 'CREATE_ASSET', confidence: 'HIGH', reason: 'streamset' };
  }

  if (detectOpenStudio(text)) {
    return { intent: 'NAVIGATION_ACTION', confidence: 'HIGH', reason: 'open-studio' };
  }

  if (change) {
    const hasTarget = Boolean(
      ctx?.lastLogoId || ctx?.lastBannerId || ctx?.lastFacecamId || ctx?.lastOverlayId || change.wantsLatest
    );
    if (!hasTarget && /^(ändere das|mach es|änder das)/i.test(text.trim())) {
      return { intent: 'AMBIGUOUS', confidence: 'HIGH', reason: 'edit-without-target' };
    }
    return { intent: 'MODIFY_ASSET', confidence: hasTarget ? 'HIGH' : 'MEDIUM', reason: 'change-intent' };
  }

  if (isAmbiguousBareMessage(text)) {
    return { intent: 'AMBIGUOUS', confidence: 'HIGH', reason: 'bare-prompt' };
  }

  if (looksLikeWorkflowResume(text)) {
    return { intent: 'CREATE_ASSET', confidence: 'MEDIUM', reason: 'resume-create' };
  }

  if (looksLikeAssetEditFollowUp(text) && !quoteKind) {
    const priorAsset = [...history].reverse().find((row) => row.role === 'user' && detectQuoteKind(row.content));
    if (priorAsset) {
      const hasTarget = Boolean(
        ctx?.lastLogoId || ctx?.lastBannerId || ctx?.lastFacecamId || ctx?.lastOverlayId
      );
      return { intent: 'MODIFY_ASSET', confidence: hasTarget ? 'HIGH' : 'MEDIUM', reason: 'edit-follow-up' };
    }
    return { intent: 'AMBIGUOUS', confidence: 'HIGH', reason: 'edit-without-target' };
  }

  const priorCreate = [...history].reverse().find((row) => row.role === 'user' && detectQuoteKind(row.content));
  if (priorCreate && quoteKind === null && !isSmalltalkMessage(text) && text.split(/\s+/).length <= 8) {
    return { intent: 'CREATE_ASSET', confidence: 'MEDIUM', reason: 'active-create-follow-up' };
  }

  if (quoteKind) {
    if (isBareAssetKindUtterance(text)) {
      return { intent: 'AMBIGUOUS', confidence: 'HIGH', reason: 'bare-asset-kind' };
    }
    return { intent: 'CREATE_ASSET', confidence: 'MEDIUM', reason: `kind-without-verb:${quoteKind}` };
  }

  return { intent: 'AMBIGUOUS', confidence: 'LOW', reason: 'unclassified' };
}

export function intentAllowsGapAnalysis(intent: NexterConversationIntent): boolean {
  return intent === 'PROJECT_ANALYSIS';
}

export function intentAllowsFormatFallback(intent: NexterConversationIntent): boolean {
  return intent === 'CREATE_ASSET' || intent === 'MODIFY_ASSET';
}

export function intentAllowsQuote(intent: NexterConversationIntent): boolean {
  return intent === 'CREATE_ASSET' || intent === 'MODIFY_ASSET';
}

export function intentAllowsDnaContext(intent: NexterConversationIntent): boolean {
  return (
    intent === 'CREATOR_ADVICE' ||
    intent === 'PROJECT_ANALYSIS' ||
    intent === 'CREATE_ASSET' ||
    intent === 'MODIFY_ASSET'
  );
}

export {
  isSmalltalkMessage,
  isTopicResetMessage,
  isCreatorAdviceMessage,
  isProjectAnalysisMessage,
  isAppHelpMessage,
  isAccountSettingsMessage,
  isAmbiguousBareMessage,
  looksLikeAssetEditFollowUp,
  looksLikeWorkflowResume,
  messageImpliesFormatNeed,
} from './conversation-intent-patterns.js';
