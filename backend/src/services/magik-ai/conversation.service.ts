import type { MagikAiConversationSession } from '@ucbs/shared';
import {
  getOrCreateNexterSession,
  nexterChat,
  clearNexterSession,
} from '../nexter/conversation.service.js';

/** MAGIK-AI-Chat ist in Nexter aufgegangen — gleiche Unterhaltung, Nutzer sieht NEXTER. */
export class MagikConversationService {
  async getSession(userId: string): Promise<MagikAiConversationSession | null> {
    const session = await getOrCreateNexterSession(userId);
    return {
      id: session.id,
      userId: session.userId,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async sendMessage(userId: string, message: string): Promise<MagikAiConversationSession | null> {
    const session = await nexterChat(userId, message);
    return {
      id: session.id,
      userId: session.userId,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async clearSession(userId: string): Promise<void> {
    await clearNexterSession(userId);
  }
}

export const magikConversationService = new MagikConversationService();
