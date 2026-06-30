import type { MagikAiConversationSession } from '@ucbs/shared';

/** Platzhalter — Konversationen (Phase 3). */
export class MagikConversationService {
  async getSession(_userId: string): Promise<MagikAiConversationSession | null> {
    return null;
  }

  async sendMessage(_userId: string, _message: string): Promise<MagikAiConversationSession | null> {
    return null;
  }

  async clearSession(_userId: string): Promise<void> {
    return;
  }
}

export const magikConversationService = new MagikConversationService();
