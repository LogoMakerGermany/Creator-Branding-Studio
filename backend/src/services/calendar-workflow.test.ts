import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimsExternalPublish,
  detectCalendarPlanningIntent,
  parseCalendarPlanningIntent,
  datetimeLocalValueToIso,
  isoToDatetimeLocalValue,
  localDayBoundsIso,
  localWeekBoundsIso,
  plannerStatusLabel,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { getActiveDna, upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { dsSet } from '../lib/data-store.js';
import {
  createSocialPost,
  getSocialPost,
  listSocialPosts,
  updateSocialPost,
  deleteSocialPost,
} from './social.service.js';
import { createCalendarEvent, listCalendarEvents, parseCalendarIsoDate } from './calendar.service.js';
import {
  filterPlanningItems,
  getUpcomingPlanningItems,
  listPlanningItems,
  listTodayPlanningItems,
  listWeekPlanningItems,
} from './planning.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { updateNexterPreferencesForUser } from './nexter/preferences.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@cal-close.test`, 'Cal');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    brandingStyle: 'esports',
    targetPlatforms: ['tiktok', 'twitch'],
  });
  const project = await createProject(user.id, { name: 'Cal Brand', type: 'social', dnaId: dna.id });
  return { user, dna, project };
}

function futureIso(hours = 2): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

describe('calendar closure — own planning and ownership', () => {
  it('plans own social post onto the calendar', async () => {
    const { user, project } = await seed();
    const when = futureIso();
    const post = await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'Raid heute',
      scheduledAt: when,
      projectId: project.id,
      contentType: 'tiktok-caption',
    });
    assert.equal(post.plannerStatus, 'scheduled');
    const items = await listPlanningItems(user.id);
    assert.ok(items.some((i) => i.socialPostId === post.id && i.scheduledAt === post.scheduledAt));
    const events = await listCalendarEvents(user.id);
    assert.equal(events.filter((e) => e.socialPostId === post.id).length, 1);
  });

  it('blocks foreign social post updates', async () => {
    const a = await seed();
    const b = await getOrCreateUser(randomUUID(), `${randomUUID()}@cal-b.test`, 'B');
    const post = await createSocialPost(a.user.id, {
      platform: 'tiktok',
      content: 'Nur A',
      scheduledAt: futureIso(),
    });
    await assert.rejects(() => updateSocialPost(post.id, b.id, { scheduledAt: futureIso(5) }));
    assert.equal(await getSocialPost(post.id, b.id), null);
    const bItems = await listPlanningItems(b.id);
    assert.equal(bItems.some((i) => i.socialPostId === post.id), false);
  });

  it('accepts own project on schedule', async () => {
    const { user, project } = await seed();
    const post = await createSocialPost(user.id, {
      platform: 'youtube',
      content: 'YT',
      scheduledAt: futureIso(),
      projectId: project.id,
    });
    assert.equal(post.projectId, project.id);
  });

  it('blocks foreign project on social and calendar create', async () => {
    const a = await seed();
    const b = await seed();
    await assert.rejects(
      () =>
        createSocialPost(a.user.id, {
          platform: 'tiktok',
          content: 'x',
          projectId: b.project.id,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NOT_FOUND'
    );
    await assert.rejects(
      () =>
        createCalendarEvent(a.user.id, {
          title: 'Fremd',
          type: 'post',
          startAt: futureIso(),
          projectId: b.project.id,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NOT_FOUND'
    );
  });
});

describe('calendar closure — schedule CRUD and validation', () => {
  it('creates, edits and removes a schedule on the same social record', async () => {
    const { user } = await seed();
    const created = await createSocialPost(user.id, {
      platform: 'instagram',
      content: 'Draft plan',
      status: 'draft',
    });
    assert.equal(created.plannerStatus, 'draft');
    const first = futureIso(3);
    const scheduled = await updateSocialPost(created.id, user.id, { scheduledAt: first });
    assert.equal(scheduled.plannerStatus, 'scheduled');
    assert.equal(scheduled.scheduledAt, parseCalendarIsoDate(first, 'scheduledAt'));
    const later = futureIso(10);
    const moved = await updateSocialPost(created.id, user.id, { scheduledAt: later });
    assert.equal(moved.scheduledAt, parseCalendarIsoDate(later, 'scheduledAt'));
    assert.equal((await listCalendarEvents(user.id)).filter((e) => e.socialPostId === created.id).length, 1);
    const cleared = await updateSocialPost(created.id, user.id, { clearSchedule: true });
    assert.equal(cleared.plannerStatus, 'draft');
    assert.equal(cleared.scheduledAt, undefined);
    assert.equal((await listCalendarEvents(user.id)).some((e) => e.socialPostId === created.id), false);
  });

  it('blocks invalid dates', async () => {
    const { user } = await seed();
    await assert.rejects(
      () => createSocialPost(user.id, { platform: 'tiktok', content: 'x', scheduledAt: 'not-a-date' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DATE'
    );
    await assert.rejects(
      () => createSocialPost(user.id, { platform: 'tiktok', content: 'x', scheduledAt: 'Invalid Date' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DATE'
    );
  });

  it('blocks invalid times', async () => {
    const { user } = await seed();
    await assert.rejects(
      () => createSocialPost(user.id, { platform: 'tiktok', content: 'x', scheduledAt: '2026-09-06T25:00:00Z' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_TIME'
    );
  });

  it('persists timezone as UTC ISO and round-trips local datetime-local values', async () => {
    const { user } = await seed();
    const localValue = '2026-09-08T18:00';
    const iso = datetimeLocalValueToIso(localValue);
    assert.ok(iso);
    const post = await createSocialPost(user.id, {
      platform: 'twitch',
      content: 'Going live',
      scheduledAt: iso,
    });
    assert.equal(post.scheduledAt, iso);
    const again = await getSocialPost(post.id, user.id);
    assert.equal(again?.scheduledAt, iso);
    assert.equal(isoToDatetimeLocalValue(again!.scheduledAt!), localValue);
  });

  it('allows past dates without rewriting them', async () => {
    const { user } = await seed();
    const past = new Date(Date.now() - 86400_000).toISOString();
    const post = await createSocialPost(user.id, {
      platform: 'discord',
      content: 'Gestern intern',
      scheduledAt: past,
    });
    assert.equal(post.scheduledAt, parseCalendarIsoDate(past, 'scheduledAt'));
  });

  it('does not duplicate identical planning writes', async () => {
    const { user } = await seed();
    const when = futureIso(4);
    const body = { platform: 'tiktok' as const, content: 'same slot', scheduledAt: when };
    const a = await createSocialPost(user.id, body);
    const b = await createSocialPost(user.id, body);
    assert.equal(a.id, b.id);
    const posts = await listSocialPosts(user.id);
    assert.equal(posts.filter((p) => p.content === 'same slot').length, 1);
    assert.equal((await listCalendarEvents(user.id)).filter((e) => e.socialPostId === a.id).length, 1);
  });
});

describe('calendar closure — filters, range, today, upcoming, empty', () => {
  it('filters by platform, content type and status', async () => {
    const { user } = await seed();
    await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'tt caption',
      scheduledAt: futureIso(),
      contentType: 'tiktok-caption',
    });
    await createSocialPost(user.id, {
      platform: 'youtube',
      content: 'yt desc',
      scheduledAt: futureIso(3),
      contentType: 'video-description',
      status: 'ready',
    });
    const tiktok = await listPlanningItems(user.id, { platform: 'tiktok' });
    assert.ok(tiktok.length >= 1 && tiktok.every((i) => i.platform === 'tiktok'));
    const captions = await listPlanningItems(user.id, { contentType: 'tiktok-caption' });
    assert.ok(captions.every((i) => i.contentType === 'tiktok-caption'));
    const planned = await listPlanningItems(user.id, { status: 'planned' });
    assert.ok(planned.every((i) => i.plannerStatus === 'scheduled'));
    const done = await listPlanningItems(user.id, { status: 'completed' });
    assert.ok(done.every((i) => i.plannerStatus === 'ready'));
    const search = await listPlanningItems(user.id, { q: 'yt desc' });
    assert.equal(search.length, 1);
  });

  it('limits calendar range and keeps today plus upcoming from persisted rows', async () => {
    const { user } = await seed();
    await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'heute',
      scheduledAt: new Date().toISOString(),
    });
    await createSocialPost(user.id, {
      platform: 'youtube',
      content: 'spaeter',
      scheduledAt: futureIso(48),
    });
    const { start, end } = localDayBoundsIso();
    const today = await listTodayPlanningItems(user.id);
    assert.ok(today.some((i) => i.content.includes('heute')));
    assert.ok(today.every((i) => i.scheduledAt && i.scheduledAt >= start && i.scheduledAt < end));
    const week = await listWeekPlanningItems(user.id, false);
    const bounds = localWeekBoundsIso();
    assert.ok(week.every((i) => i.scheduledAt && i.scheduledAt >= bounds.start && i.scheduledAt < bounds.end));
    const upcoming = await getUpcomingPlanningItems(user.id, 5);
    assert.ok(upcoming.length <= 5);
    assert.ok(upcoming.every((i) => i.plannerStatus === 'scheduled'));
  });

  it('returns an empty calendar for a user without posts', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@cal-empty.test`, 'Empty');
    assert.deepEqual(await listPlanningItems(user.id), []);
    assert.deepEqual(await listTodayPlanningItems(user.id), []);
    assert.deepEqual(await getUpcomingPlanningItems(user.id), []);
  });
});

describe('calendar closure — missing content, assets, persistence, completed', () => {
  it('shows missing linked posts without crashing', async () => {
    const { user } = await seed();
    await createCalendarEvent(user.id, {
      title: 'orphan',
      type: 'post',
      startAt: futureIso(),
      socialPostId: 'missing-post-id',
    });
    const items = await listPlanningItems(user.id);
    const missing = items.find((i) => i.socialPostId === 'missing-post-id');
    assert.equal(missing?.title, 'Inhalt nicht verfügbar');
    assert.equal(missing?.content, 'Inhalt nicht verfügbar');
  });

  it('lists posts with a deleted asset id without throwing', async () => {
    const { user } = await seed();
    const id = randomUUID();
    const now = new Date().toISOString();
    await dsSet('socialPosts', id, {
      id,
      userId: user.id,
      platform: 'tiktok',
      content: 'asset gone',
      mediaAssetId: 'deleted-asset',
      scheduledAt: futureIso(),
      status: 'scheduled',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const items = await listPlanningItems(user.id);
    assert.ok(items.some((i) => i.socialPostId === id && i.mediaAssetId === 'deleted-asset'));
  });

  it('keeps planning after reload and hides it from other users', async () => {
    const { user } = await seed();
    const post = await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'persist',
      scheduledAt: futureIso(),
    });
    const first = await listPlanningItems(user.id);
    const second = await listPlanningItems(user.id);
    assert.equal(first.length, second.length);
    assert.ok(second.some((i) => i.socialPostId === post.id));
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@cal-relogin.test`, 'Other');
    assert.equal((await listPlanningItems(other.id)).some((i) => i.socialPostId === post.id), false);
    assert.ok((await listPlanningItems(user.id)).some((i) => i.socialPostId === post.id));
  });

  it('marks planned posts completed without claiming publish', async () => {
    const { user } = await seed();
    const post = await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'done later',
      scheduledAt: futureIso(),
    });
    const done = await updateSocialPost(post.id, user.id, { status: 'ready' });
    assert.equal(done.plannerStatus, 'ready');
    assert.equal(done.plannerLabel, plannerStatusLabel('ready'));
    assert.equal(done.publishingAvailable, false);
    assert.match(done.plannerLabel, /nicht veröffentlicht/);
    assert.equal(claimsExternalPublish(done.plannerLabel), false);
  });

  it('treats planned as not published and uses current social version', async () => {
    const { user } = await seed();
    const post = await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'v1 text',
      scheduledAt: futureIso(),
    });
    const edited = await updateSocialPost(post.id, user.id, { content: 'v2 text' });
    assert.equal(edited.version, 2);
    const item = (await listPlanningItems(user.id)).find((i) => i.socialPostId === post.id);
    assert.equal(item?.content, 'v2 text');
    assert.equal(item?.publishingAvailable, false);
  });
});

describe('calendar closure — nexter planning commands', () => {
  it('shows this week and today without quoting', async () => {
    const { user } = await seed();
    await createSocialPost(user.id, {
      platform: 'tiktok',
      content: 'Wochenpost',
      scheduledAt: new Date().toISOString(),
    });
    const week = await nexterChat(user.id, 'Was habe ich diese Woche geplant?');
    const weekLast = week.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(weekLast?.content ?? '', /Wochenpost|intern geplant/i);
    assert.equal((weekLast?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
    const today = await nexterChat(user.id, 'Was steht heute an?');
    const todayLast = today.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(todayLast?.content ?? '', /heute|intern/i);
    assert.equal((todayLast?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('schedules an owned last tiktok post and blocks foreign posts', async () => {
    const a = await seed();
    const b = await seed();
    await createSocialPost(b.user.id, {
      platform: 'tiktok',
      content: 'fremd',
      scheduledAt: futureIso(),
    });
    const mine = await createSocialPost(a.user.id, {
      platform: 'tiktok',
      content: 'letzter eigener',
      status: 'draft',
    });
    const session = await nexterChat(a.user.id, 'Plane meinen letzten TikTok-Post für morgen um 18 Uhr.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
    const updated = await getSocialPost(mine.id, a.user.id);
    assert.equal(updated?.plannerStatus, 'scheduled');
    assert.ok(updated?.scheduledAt);
    const foreign = await listSocialPosts(b.user.id);
    assert.equal(foreign[0]?.content, 'fremd');
    await assert.rejects(() => updateSocialPost(foreign[0]!.id, a.user.id, { scheduledAt: futureIso() }));
    const empty = await getOrCreateUser(randomUUID(), `${randomUUID()}@cal-none.test`, 'None');
    const none = await nexterChat(empty.id, 'Plane meinen letzten TikTok-Post für morgen um 18 Uhr.');
    assert.match(none.messages.filter((m) => m.role === 'assistant').at(-1)?.content ?? '', /keinen eigenen Post/i);
  });

  it('reschedules an owned youtube post', async () => {
    const { user } = await seed();
    const post = await createSocialPost(user.id, {
      platform: 'youtube',
      content: 'YT Slot',
      scheduledAt: futureIso(2),
    });
    const session = await nexterChat(user.id, 'Verschiebe den YouTube-Post auf Freitag.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
    const moved = await getSocialPost(post.id, user.id);
    assert.ok(moved?.scheduledAt);
    assert.notEqual(moved?.scheduledAt, post.scheduledAt);
    assert.equal(new Date(moved!.scheduledAt!).getDay(), 5);
  });

  it('proposes a content plan without paid generation and keeps DNA plus preferences', async () => {
    const { user, dna } = await seed();
    await updateNexterPreferencesForUser(user.id, { platforms: ['tiktok', 'twitch'] });
    assert.equal(detectQuoteKind('Plane mir nächste Woche drei TikTok-Posts.'), null);
    assert.equal(detectCalendarPlanningIntent('Mach mir einen Contentplan für nächste Woche.'), true);
    const parsed = parseCalendarPlanningIntent('Plane mir nächste Woche drei TikTok-Posts.');
    assert.equal(parsed.kind, 'plan-proposal');
    const session = await nexterChat(user.id, 'Plane mir nächste Woche drei TikTok-Posts.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /CONTENT BRIEF|Wochenplan/i);
    assert.match(last?.content ?? '', /tiktok/i);
    assert.match(last?.content ?? '', /Vorlieben|Priorität/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
    assert.equal(claimsExternalPublish(last?.content ?? ''), false);
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, dna.version);
    assert.equal(after?.name, 'NightWolf');
  });
});

describe('calendar closure — ui, a11y, no fake publishing, no providers', () => {
  it('calendar page covers required mobile and accessibility controls', () => {
    const page = src('../../../frontend/src/pages/calendar/ContentCalendarPage.tsx');
    assert.match(page, /htmlFor/);
    assert.match(page, /min-h-11/);
    assert.match(page, /aria-label/);
    assert.match(page, /Heute/);
    assert.match(page, /Noch nichts geplant/);
    assert.match(page, /Keine Posts für diesen Filter/);
    assert.match(page, /Heute nichts geplant/);
    assert.match(page, /Keine Social Posts vorhanden/);
    assert.match(page, /Kalenderdaten werden geladen/);
    assert.match(page, /Text kopieren/);
    assert.match(page, /Als erledigt markieren/);
    assert.match(page, /Inhalt nicht verfügbar/);
    assert.match(page, /hidden md:grid/);
    assert.match(page, /AUTOMATIC PUBLISHING: NOT SUPPORTED/);
    assert.equal(page.includes('Auf TikTok posten'), false);
    assert.equal(page.includes('Auf Instagram veröffentlichen'), false);
    assert.equal(page.includes('YouTube automatisch hochladen'), false);
    assert.equal(page.includes('Jetzt auf TikTok posten'), false);
    const dash = src('../../../frontend/src/v2/pages/DashboardV2Page.tsx');
    assert.match(dash, /upcomingItems/);
  });

  it('does not call paid providers, payments or external social APIs', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const calendar = src('./calendar.service.ts');
    const planning = src('./planning.service.ts');
    const page = src('../../../frontend/src/pages/calendar/ContentCalendarPage.tsx');
    const conv = src('./nexter/conversation.service.ts');
    for (const file of [calendar, planning, page]) {
      assert.equal(file.includes('openai.com'), false);
      assert.equal(file.includes('api.stripe.com'), false);
      assert.equal(file.includes('paypal.com'), false);
      assert.equal(/tiktok\.com\/aweme|graph\.facebook|youtube\.googleapis|api\.twitter/.test(file), false);
    }
    assert.ok(conv.indexOf('detectCalendarPlanningIntent') < conv.indexOf('createQuote('));
    assert.equal(filterPlanningItems([], { platform: 'tiktok' }).length, 0);
  });
});
