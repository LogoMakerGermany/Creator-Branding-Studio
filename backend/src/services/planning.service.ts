import {
  localDayBoundsIso,
  localWeekBoundsIso,
  plannerStatusLabel,
  planningItemFromSocial,
  normalizePlannerStatus,
  type PlanningItem,
  type PlannerStatus,
} from '@ucbs/shared';
import { listCalendarEvents, type CalendarEvent } from './calendar.service.js';
import { listSocialPosts, type SocialPostView } from './social.service.js';

function itemFromEvent(event: CalendarEvent, post?: SocialPostView | null): PlanningItem {
  if (post) return planningItemFromSocial(post);
  const plannerStatus: PlannerStatus =
    event.status === 'done' ? 'ready' : event.status === 'cancelled' ? 'draft' : 'scheduled';
  const missing = Boolean(event.socialPostId) && !post;
  return {
    id: `event:${event.id}`,
    source: 'event',
    eventId: event.id,
    socialPostId: event.socialPostId,
    title: missing ? 'Inhalt nicht verfügbar' : event.title,
    content: missing ? 'Inhalt nicht verfügbar' : event.description || event.title,
    platform: event.platform,
    contentType: event.contentType,
    scheduledAt: event.startAt,
    plannerStatus,
    plannerLabel: missing ? 'Inhalt nicht verfügbar' : plannerStatusLabel(plannerStatus),
    projectId: event.projectId,
    packageId: event.packageId,
    publishingAvailable: false,
  };
}

export function filterPlanningItems(
  items: PlanningItem[],
  query?: {
    platform?: string;
    contentType?: string;
    status?: string;
    q?: string;
    from?: string;
    to?: string;
  }
): PlanningItem[] {
  const q = query?.q?.trim().toLowerCase();
  return items.filter((item) => {
    if (query?.platform && query.platform !== 'all' && item.platform !== query.platform) return false;
    if (query?.contentType && query.contentType !== 'all' && (item.contentType || 'package') !== query.contentType) {
      return false;
    }
    if (query?.status && query.status !== 'all') {
      const wanted =
        query.status === 'planned' ? 'scheduled' : query.status === 'completed' ? 'ready' : query.status;
      if (item.plannerStatus !== wanted) return false;
    }
    if (query?.from && (!item.scheduledAt || item.scheduledAt < query.from)) return false;
    if (query?.to && (!item.scheduledAt || item.scheduledAt >= query.to)) return false;
    if (q) {
      const hay = `${item.title} ${item.content} ${item.platform ?? ''} ${item.projectId ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function listPlanningItems(
  userId: string,
  query?: {
    platform?: string;
    contentType?: string;
    status?: string;
    q?: string;
    from?: string;
    to?: string;
  }
): Promise<PlanningItem[]> {
  const [posts, events] = await Promise.all([listSocialPosts(userId), listCalendarEvents(userId)]);
  const byPostId = new Map(posts.map((p) => [p.id, p]));
  const usedPostIds = new Set<string>();
  const items: PlanningItem[] = [];

  for (const post of posts) {
    items.push(planningItemFromSocial(post));
    usedPostIds.add(post.id);
  }
  for (const event of events) {
    if (event.socialPostId && usedPostIds.has(event.socialPostId)) continue;
    const linked = event.socialPostId ? byPostId.get(event.socialPostId) : undefined;
    items.push(itemFromEvent(event, linked ?? null));
  }

  items.sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''));
  return filterPlanningItems(items, query);
}

export async function getUpcomingPlanningItems(userId: string, limit = 5): Promise<PlanningItem[]> {
  const now = new Date().toISOString();
  const items = await listPlanningItems(userId);
  return items
    .filter((i) => i.scheduledAt && i.scheduledAt >= now && i.plannerStatus === 'scheduled')
    .slice(0, limit);
}

export async function listTodayPlanningItems(userId: string): Promise<PlanningItem[]> {
  const { start, end } = localDayBoundsIso();
  return listPlanningItems(userId, { from: start, to: end });
}

export async function listWeekPlanningItems(userId: string, nextWeek = false): Promise<PlanningItem[]> {
  const ref = new Date();
  if (nextWeek) ref.setDate(ref.getDate() + 7);
  const { start, end } = localWeekBoundsIso(ref);
  return listPlanningItems(userId, { from: start, to: end });
}

export function formatPlanningDigest(items: PlanningItem[], heading: string): string {
  if (!items.length) {
    return `${heading}\nNoch nichts intern geplant. NEXTER veröffentlicht nichts automatisch.`;
  }
  const lines = items.map((item) => {
    const when = item.scheduledAt
      ? new Date(item.scheduledAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
      : 'ohne Termin';
    return `- ${when} · ${item.platform || 'allgemein'} · ${item.plannerLabel}: ${item.title}`;
  });
  return `${heading}\n${lines.join('\n')}\nIntern geplant ≠ veröffentlicht.`;
}

export { normalizePlannerStatus };
