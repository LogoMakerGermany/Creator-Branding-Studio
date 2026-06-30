import { api } from '@/services/api';

/** Platzhalter — Conversation Service (Phase 3). */
export const magikConversationService = {
  async getSession() {
    return api.magikAi.getConversation();
  },
};
