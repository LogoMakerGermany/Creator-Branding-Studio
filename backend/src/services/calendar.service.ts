import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsDelete, dsList } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { getProject } from './project.service.js';

const EVENTS_COLLECTION = 'calendarEvents';

export type CalendarEventType = 'post' | 'video' | 'stream' | 'campaign' | 'deadline';
export type CalendarEventStatus = 'planned' | 'in_progress' | 'done' | 'cancelled';

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  type: CalendarEventType;
  platform?: string;
  startAt: string;
  endAt?: string;
  status: CalendarEventStatus;
  color?: string;
  socialPostId?: string;
  packageId?: string;
  projectId?: string;
  contentType?: string;
  createdAt: string;
  updatedAt: string;
}

/** Past dates are stored as-is. Never silently rewrite. Invalid clock times are rejected. */
function parseIsoDate(value: string, field: string): string {
  const raw = String(value ?? '').trim();
  if (!raw || /^nan$/i.test(raw) || /^invalid date$/i.test(raw)) {
    throw new ServiceError(400, 'INVALID_DATE', `${field} ist kein gültiges Datum`);
  }
  const timePart = raw.match(/T(\d{1,2})(?::(\d{2}))?/);
  if (timePart) {
    const hour = Number(timePart[1]);
    const minute = timePart[2] != null ? Number(timePart[2]) : 0;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23 || !Number.isFinite(minute) || minute < 0 || minute > 59) {
      throw new ServiceError(400, 'INVALID_TIME', `${field} enthält eine ungültige Uhrzeit`);
    }
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ServiceError(400, 'INVALID_DATE', `${field} ist kein gültiges Datum`);
  }
  return date.toISOString();
}

export { parseIsoDate as parseCalendarIsoDate };

export async function listCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const events = await dsList(EVENTS_COLLECTION, { userId, orderBy: 'startAt', order: 'asc' });
  return events as unknown as CalendarEvent[];
}

export async function getCalendarEvent(id: string, userId: string): Promise<CalendarEvent | null> {
  const event = await dsGet(EVENTS_COLLECTION, id);
  if (!event || event.userId !== userId) return null;
  return event as unknown as CalendarEvent;
}

export async function createCalendarEvent(
  userId: string,
  data: {
    title: string;
    description?: string;
    type: CalendarEventType;
    platform?: string;
    startAt: string;
    endAt?: string;
    color?: string;
    socialPostId?: string;
    packageId?: string;
    projectId?: string;
    contentType?: string;
    status?: CalendarEventStatus;
  }
): Promise<CalendarEvent> {
  const now = new Date().toISOString();
  if (data.projectId) {
    const project = await getProject(data.projectId, userId);
    if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }
  const event: CalendarEvent = {
    id: randomUUID(),
    userId,
    title: data.title.trim(),
    description: data.description?.trim(),
    type: data.type,
    platform: data.platform,
    startAt: parseIsoDate(data.startAt, 'startAt'),
    endAt: data.endAt ? parseIsoDate(data.endAt, 'endAt') : undefined,
    status: data.status ?? 'planned',
    color: data.color ?? '#7C3AED',
    socialPostId: data.socialPostId,
    packageId: data.packageId,
    projectId: data.projectId,
    contentType: data.contentType,
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(EVENTS_COLLECTION, event.id, event as unknown as Record<string, unknown>);
  return event;
}

export async function updateCalendarEvent(
  id: string,
  userId: string,
  data: Partial<
    Pick<
      CalendarEvent,
      | 'title'
      | 'description'
      | 'type'
      | 'platform'
      | 'startAt'
      | 'endAt'
      | 'status'
      | 'color'
      | 'socialPostId'
      | 'packageId'
      | 'projectId'
      | 'contentType'
    >
  >
): Promise<CalendarEvent> {
  const event = await dsGet(EVENTS_COLLECTION, id);
  if (!event || event.userId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Termin nicht gefunden');
  }

  const updated = {
    ...event,
    ...data,
    startAt: data.startAt ? parseIsoDate(data.startAt, 'startAt') : event.startAt,
    endAt: data.endAt ? parseIsoDate(data.endAt, 'endAt') : event.endAt,
    updatedAt: new Date().toISOString(),
  };
  await dsSet(EVENTS_COLLECTION, id, updated);
  return updated as unknown as CalendarEvent;
}

export async function deleteCalendarEvent(id: string, userId: string): Promise<void> {
  const event = await dsGet(EVENTS_COLLECTION, id);
  if (!event || event.userId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Termin nicht gefunden');
  }
  await dsDelete(EVENTS_COLLECTION, id);
}

export async function getUpcomingEvents(userId: string, limit = 5): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const events = await listCalendarEvents(userId);
  return events.filter((e) => e.startAt >= now && e.status !== 'cancelled').slice(0, limit);
}

export async function findEventBySocialPostId(userId: string, socialPostId: string): Promise<CalendarEvent | null> {
  const events = await listCalendarEvents(userId);
  return events.find((e) => e.socialPostId === socialPostId) ?? null;
}

export async function upsertLinkedSocialCalendarEvent(
  userId: string,
  post: {
    id: string;
    content: string;
    platform: string;
    scheduledAt?: string;
    status: string;
    packageId?: string;
    projectId?: string;
    contentType?: string;
  }
): Promise<CalendarEvent | null> {
  const existing =
    (await findEventBySocialPostId(userId, post.id)) ??
    (post.scheduledAt
      ? (await listCalendarEvents(userId)).find(
          (e) => !e.socialPostId && e.type === 'post' && e.platform === post.platform && e.startAt === post.scheduledAt
        )
      : null);

  if (!post.scheduledAt) {
    if (existing) await deleteCalendarEvent(existing.id, userId);
    return null;
  }

  const calendarStatus: CalendarEventStatus =
    post.status === 'ready' || post.status === 'published' || post.status === 'done' ? 'done' : 'planned';
  const payload = {
    title: `[Intern] [${post.platform}] ${post.content.slice(0, 80)}`,
    description: `${post.content}\n\nNEXTER veröffentlicht diesen Beitrag noch nicht automatisch auf der Plattform.`,
    type: 'post' as const,
    platform: post.platform,
    startAt: post.scheduledAt,
    socialPostId: post.id,
    packageId: post.packageId,
    projectId: post.projectId,
    contentType: post.contentType,
    status: calendarStatus,
  };

  if (existing) {
    return updateCalendarEvent(existing.id, userId, payload);
  }
  return createCalendarEvent(userId, payload);
}
