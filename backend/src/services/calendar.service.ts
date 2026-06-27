import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsDelete, dsList } from '../lib/data-store.js';

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
  createdAt: string;
  updatedAt: string;
}

export async function listCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const events = await dsList(EVENTS_COLLECTION, { userId, orderBy: 'startAt', order: 'asc' });
  return events as unknown as CalendarEvent[];
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
  }
): Promise<CalendarEvent> {
  const now = new Date().toISOString();
  const event: CalendarEvent = {
    id: randomUUID(),
    userId,
    title: data.title,
    description: data.description,
    type: data.type,
    platform: data.platform,
    startAt: data.startAt,
    endAt: data.endAt,
    status: 'planned',
    color: data.color ?? '#7C3AED',
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(EVENTS_COLLECTION, event.id, event as unknown as Record<string, unknown>);
  return event;
}

export async function updateCalendarEvent(
  id: string,
  userId: string,
  data: Partial<Pick<CalendarEvent, 'title' | 'description' | 'type' | 'platform' | 'startAt' | 'endAt' | 'status' | 'color'>>
): Promise<CalendarEvent> {
  const event = await dsGet(EVENTS_COLLECTION, id);
  if (!event || event.userId !== userId) throw new Error('Termin nicht gefunden');

  const updated = { ...event, ...data, updatedAt: new Date().toISOString() };
  await dsSet(EVENTS_COLLECTION, id, updated);
  return updated as unknown as CalendarEvent;
}

export async function deleteCalendarEvent(id: string, userId: string): Promise<void> {
  const event = await dsGet(EVENTS_COLLECTION, id);
  if (!event || event.userId !== userId) throw new Error('Termin nicht gefunden');
  await dsDelete(EVENTS_COLLECTION, id);
}

export async function getUpcomingEvents(userId: string, limit = 5): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const events = await listCalendarEvents(userId);
  return events
    .filter((e) => e.startAt >= now && e.status !== 'cancelled')
    .slice(0, limit);
}
