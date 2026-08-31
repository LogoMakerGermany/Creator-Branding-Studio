import type { NexterSession } from '@ucbs/shared';
import {
  getOrCreateNexterSession,
  nexterChat,
  clearNexterSession,
} from './nexter/conversation.service.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AssistantSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

function toAssistant(session: NexterSession): AssistantSession {
  return {
    id: session.id,
    userId: session.userId,
    messages: session.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        createdAt: m.createdAt,
      })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/** Legacy `/assistant` routes share the Nexter conversation. */
export async function getOrCreateSession(userId: string): Promise<AssistantSession> {
  return toAssistant(await getOrCreateNexterSession(userId));
}

export async function chat(userId: string, message: string): Promise<AssistantSession> {
  return toAssistant(await nexterChat(userId, message));
}

export async function clearSession(userId: string): Promise<void> {
  await clearNexterSession(userId);
}
