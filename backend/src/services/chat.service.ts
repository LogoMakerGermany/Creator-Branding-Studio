import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';

const CHANNELS_COLLECTION = 'chatChannels';
const MESSAGES_COLLECTION = 'chatMessages';

export interface ChatChannel {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export async function getOrCreateDefaultChannel(userId: string, userName: string): Promise<ChatChannel> {
  const existing = await dsListWhere(CHANNELS_COLLECTION, { ownerId: userId });
  if (existing[0]) return existing[0] as unknown as ChatChannel;

  const now = new Date().toISOString();
  const channel: ChatChannel = {
    id: randomUUID(),
    name: 'Team Chat',
    ownerId: userId,
    memberIds: [userId],
    createdAt: now,
  };
  await dsSet(CHANNELS_COLLECTION, channel.id, channel as unknown as Record<string, unknown>);

  const welcome: ChatMessage = {
    id: randomUUID(),
    channelId: channel.id,
    userId: 'system',
    userName: 'UCBS Bot',
    content: `Willkommen im Team Chat, ${userName}! Hier könnt ihr Aufgaben und Updates besprechen.`,
    createdAt: now,
  };
  await dsSet(MESSAGES_COLLECTION, welcome.id, welcome as unknown as Record<string, unknown>);

  return channel;
}

export async function listMessages(channelId: string, limit = 100): Promise<ChatMessage[]> {
  const messages = await dsListWhere(MESSAGES_COLLECTION, { channelId }, 'createdAt', 'asc');
  return messages.slice(-limit) as unknown as ChatMessage[];
}

export async function sendMessage(
  channelId: string,
  userId: string,
  userName: string,
  content: string
): Promise<ChatMessage> {
  const channel = await dsGet(CHANNELS_COLLECTION, channelId);
  if (!channel) throw new Error('Kanal nicht gefunden');

  const memberIds = (channel.memberIds as string[]) ?? [];
  if (channel.ownerId !== userId && !memberIds.includes(userId)) {
    throw new Error('Kein Zugriff auf diesen Kanal');
  }

  const message: ChatMessage = {
    id: randomUUID(),
    channelId,
    userId,
    userName,
    content,
    createdAt: new Date().toISOString(),
  };
  await dsSet(MESSAGES_COLLECTION, message.id, message as unknown as Record<string, unknown>);
  return message;
}

export async function getChannel(channelId: string): Promise<ChatChannel | null> {
  const channel = await dsGet(CHANNELS_COLLECTION, channelId);
  return channel ? (channel as unknown as ChatChannel) : null;
}
