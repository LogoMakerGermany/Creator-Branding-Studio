import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsList } from '../lib/data-store.js';
import { getActiveDna } from './dna.service.js';
import { getRtmpConfig, buildHlsPlaybackUrl } from '../config/env.js';

const SESSIONS_COLLECTION = 'liveStreamSessions';
const CONFIG_COLLECTION = 'liveStreamConfig';

export type StreamPlatform = 'twitch' | 'youtube' | 'tiktok' | 'kick' | 'facebook';
export type StreamStatus = 'offline' | 'starting' | 'live' | 'ended';

export interface LiveStreamConfig {
  userId: string;
  rtmpServer: string;
  streamKey: string;
  platforms: StreamPlatform[];
  overlayPackEnabled: boolean;
  alertsEnabled: boolean;
  chatOverlayEnabled: boolean;
  multistreamEnabled: boolean;
  updatedAt: string;
}

export interface LiveStreamSession {
  id: string;
  userId: string;
  title: string;
  platforms: StreamPlatform[];
  status: StreamStatus;
  viewerCount: number;
  startedAt?: string;
  endedAt?: string;
  rtmpUrl: string;
  dnaId?: string;
  checklist: { id: string; label: string; done: boolean }[];
  createdAt: string;
  hlsPlaybackUrl?: string;
}

const DEFAULT_CHECKLIST = [
  { id: '1', label: 'OBS/Streamlabs geöffnet', done: false },
  { id: '2', label: 'RTMP-Server konfiguriert', done: false },
  { id: '3', label: 'Overlays geladen', done: false },
  { id: '4', label: 'Alerts getestet', done: false },
  { id: '5', label: 'Creator DNA aktiv', done: false },
  { id: '6', label: 'Starting Soon Screen bereit', done: false },
];

export async function getStreamConfig(userId: string): Promise<LiveStreamConfig> {
  const stored = await dsGet(CONFIG_COLLECTION, userId);
  if (stored) return stored as unknown as LiveStreamConfig;

  const rtmp = getRtmpConfig();
  const config: LiveStreamConfig = {
    userId,
    rtmpServer: rtmp.server,
    streamKey: `ucbs_${userId.slice(0, 8)}_${randomUUID().slice(0, 8)}`,
    platforms: ['twitch', 'youtube'],
    overlayPackEnabled: true,
    alertsEnabled: true,
    chatOverlayEnabled: true,
    multistreamEnabled: false,
    updatedAt: new Date().toISOString(),
  };
  await dsSet(CONFIG_COLLECTION, userId, config as unknown as Record<string, unknown>);
  return config;
}

export async function updateStreamConfig(userId: string, data: Partial<LiveStreamConfig>): Promise<LiveStreamConfig> {
  const current = await getStreamConfig(userId);
  const updated = { ...current, ...data, userId, updatedAt: new Date().toISOString() };
  await dsSet(CONFIG_COLLECTION, userId, updated as unknown as Record<string, unknown>);
  return updated;
}

export async function regenerateStreamKey(userId: string): Promise<LiveStreamConfig> {
  return updateStreamConfig(userId, {
    streamKey: `ucbs_${userId.slice(0, 8)}_${randomUUID().slice(0, 8)}`,
  });
}

export async function listStreamSessions(userId: string): Promise<LiveStreamSession[]> {
  const sessions = await dsList(SESSIONS_COLLECTION, { userId, orderBy: 'createdAt', order: 'desc' });
  return sessions as unknown as LiveStreamSession[];
}

export async function createStreamSession(
  userId: string,
  title: string,
  platforms?: StreamPlatform[]
): Promise<LiveStreamSession> {
  const config = await getStreamConfig(userId);
  const dna = await getActiveDna(userId);
  const now = new Date().toISOString();

  const session: LiveStreamSession = {
    id: randomUUID(),
    userId,
    title,
    platforms: platforms ?? config.platforms,
    status: 'offline',
    viewerCount: 0,
    rtmpUrl: `${config.rtmpServer}/${config.streamKey}`,
    dnaId: dna?.id,
    checklist: DEFAULT_CHECKLIST.map((c) => ({ ...c })),
    createdAt: now,
  };

  await dsSet(SESSIONS_COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function getStreamSession(id: string, userId: string): Promise<LiveStreamSession | null> {
  const session = await dsGet(SESSIONS_COLLECTION, id);
  if (!session || session.userId !== userId) return null;
  return session as unknown as LiveStreamSession;
}

export async function updateChecklist(
  sessionId: string,
  userId: string,
  itemId: string,
  done: boolean
): Promise<LiveStreamSession> {
  const session = await getStreamSession(sessionId, userId);
  if (!session) throw new Error('Session nicht gefunden');

  session.checklist = session.checklist.map((c) => (c.id === itemId ? { ...c, done } : c));
  await dsSet(SESSIONS_COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function startStream(sessionId: string, userId: string): Promise<LiveStreamSession> {
  const session = await getStreamSession(sessionId, userId);
  if (!session) throw new Error('Session nicht gefunden');

  const config = await getStreamConfig(userId);

  session.status = 'live';
  session.startedAt = new Date().toISOString();
  session.hlsPlaybackUrl = buildHlsPlaybackUrl(config.streamKey);
  session.viewerCount = 0;

  await dsSet(SESSIONS_COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function endStream(sessionId: string, userId: string): Promise<LiveStreamSession> {
  const session = await getStreamSession(sessionId, userId);
  if (!session) throw new Error('Session nicht gefunden');

  session.status = 'ended';
  session.endedAt = new Date().toISOString();
  await dsSet(SESSIONS_COLLECTION, session.id, session as unknown as Record<string, unknown>);
  return session;
}

export async function getActiveSession(userId: string): Promise<LiveStreamSession | null> {
  const sessions = await listStreamSessions(userId);
  return sessions.find((s) => s.status === 'live' || s.status === 'starting') ?? null;
}
