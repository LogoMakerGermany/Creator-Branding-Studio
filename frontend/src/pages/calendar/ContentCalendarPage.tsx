import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CONTENT_PLATFORMS,
  SOCIAL_PLANNER_PLATFORMS,
  TEXT_KINDS,
  datetimeLocalValueToIso,
  isoToDatetimeLocalValue,
  localWeekBoundsIso,
} from '@ucbs/shared';
import { Calendar, ChevronLeft, ChevronRight, Copy, Pencil } from 'lucide-react';
import { PageHeader, Badge, Button, NeonCard, Input, StatCard } from '@/components/ui';
import { api, ApiError, type PlanningItemDto, type SocialPlatform, type SocialPost } from '@/services/api';
import { StudioErrorBanner } from '@/components/studio';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
const KIND_LABELS: Record<string, string> = {
  package: 'Post',
  'video-title': 'YouTube-Titel',
  'video-description': 'YouTube-Beschreibung',
  'tiktok-caption': 'Caption',
  hook: 'Hook',
  hashtags: 'Hashtags',
  'twitch-title': 'Stream-Ankündigung',
  bio: 'Bio',
  script: 'Skript',
  ideas: 'Content-Idee',
};

type CalendarView = 'month' | 'week' | 'list';

function localDateKey(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatWhen(iso?: string): string {
  if (!iso) return 'ohne Termin';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'ungültiges Datum';
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function monthTitle(cursor: Date): string {
  return cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function shiftCursor(cursor: Date, view: CalendarView, dir: -1 | 1): Date {
  const next = new Date(cursor);
  if (view === 'week') next.setDate(next.getDate() + dir * 7);
  else next.setMonth(next.getMonth() + dir);
  return next;
}

function monthCells(cursor: Date): Date[] {
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const weekday = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - weekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function weekCells(cursor: Date): Date[] {
  const { start } = localWeekBoundsIso(cursor);
  const monday = new Date(start);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function mapCalendarError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Speichern fehlgeschlagen';
  if (err.code === 'NOT_FOUND' && /projekt/i.test(err.message)) return 'Projekt nicht gefunden';
  if (err.code === 'NOT_FOUND' && /post/i.test(err.message)) return 'Post nicht gefunden';
  if (err.code === 'NOT_FOUND') return err.message;
  if (err.code === 'INVALID_DATE') return 'Ungültiges Datum';
  if (err.code === 'INVALID_TIME') return 'Ungültige Uhrzeit';
  if (err.status === 403 || /nicht zu deinem/i.test(err.message)) return 'Fremder Post';
  if (/medium|asset/i.test(err.message)) return 'Gelöschtes Asset oder Medium nicht verfügbar';
  if (/netzwerk|failed to fetch|network/i.test(err.message)) return 'Network Error';
  return err.message || 'Speichern fehlgeschlagen';
}

export function ContentCalendarPage() {
  const [search, setSearch] = useSearchParams();
  const view = (search.get('view') as CalendarView) || 'list';
  const platform = search.get('platform') || 'all';
  const contentType = search.get('contentType') || 'all';
  const status = search.get('status') || 'all';
  const q = search.get('q') || '';

  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<PlanningItemDto[]>([]);
  const [todayItems, setTodayItems] = useState<PlanningItemDto[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<PlanningItemDto[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editWhen, setEditWhen] = useState('');
  const [planPostId, setPlanPostId] = useState('');
  const [planWhen, setPlanWhen] = useState('');
  const [planPlatform, setPlanPlatform] = useState<SocialPlatform>('tiktok');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(search);
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
      setSearch(next, { replace: true });
    },
    [search, setSearch]
  );

  const range = useMemo((): { start?: string; end?: string } => {
    if (view === 'week') return localWeekBoundsIso(cursor);
    if (view === 'month') {
      const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    return {};
  }, [cursor, view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cal, social, projectRes] = await Promise.all([
        api.calendar.list({
          platform: platform === 'all' ? undefined : platform,
          contentType: contentType === 'all' ? undefined : contentType,
          status: status === 'all' ? undefined : status,
          q: q || undefined,
        }),
        api.social.list(),
        api.projects.list(),
      ]);
      setItems(cal.items ?? []);
      setTodayItems(cal.today ?? []);
      setUpcomingItems(cal.upcomingItems ?? []);
      setPosts(social.posts);
      setProjects(projectRes.projects.map((p) => ({ id: p.id, name: p.name })));
    } catch (err) {
      setError(err instanceof ApiError && /fetch|network/i.test(err.message) ? 'Network Error' : mapCalendarError(err));
    } finally {
      setLoading(false);
    }
  }, [platform, contentType, status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectName = useCallback(
    (id?: string) => (id ? projects.find((p) => p.id === id)?.name : undefined),
    [projects]
  );

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const visibleItems = useMemo(() => {
    if (view === 'list') return items;
    return items.filter((item) => {
      if (!item.scheduledAt) return false;
      if (range.start && item.scheduledAt < range.start) return false;
      if (range.end && item.scheduledAt >= range.end) return false;
      return true;
    });
  }, [items, range.end, range.start, view]);

  const byDay = useMemo(() => {
    const map = new Map<string, PlanningItemDto[]>();
    for (const item of visibleItems) {
      const key = localDateKey(item.scheduledAt);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [visibleItems]);

  const todayKey = localDateKey(new Date().toISOString());
  const cells = view === 'week' ? weekCells(cursor) : monthCells(cursor);

  async function persistSchedule(postId: string, iso: string | null, extra?: { status?: SocialPost['status']; platform?: SocialPlatform; clearSchedule?: boolean }) {
    setSaving(true);
    setError(null);
    try {
      await api.social.update(postId, {
        scheduledAt: extra?.clearSchedule ? undefined : iso || undefined,
        clearSchedule: extra?.clearSchedule,
        status: extra?.status,
        platform: extra?.platform,
      });
      await load();
    } catch (err) {
      setError(mapCalendarError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePlanExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!planPostId || !planWhen) return;
    const iso = datetimeLocalValueToIso(planWhen);
    if (!iso) {
      setError('Ungültiges Datum');
      return;
    }
    await persistSchedule(planPostId, iso, { platform: planPlatform, status: 'scheduled' });
  }

  async function handleSaveSelectedWhen() {
    if (!selected?.socialPostId || !editWhen) return;
    const iso = datetimeLocalValueToIso(editWhen);
    if (!iso) {
      setError('Ungültiges Datum');
      return;
    }
    await persistSchedule(selected.socialPostId, iso);
  }

  async function copySelected() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Text kopieren fehlgeschlagen');
    }
  }

  const noSocial = !loading && posts.length === 0;
  const noPlanned = !loading && items.filter((i) => i.scheduledAt).length === 0;
  const filterEmpty = !loading && items.length === 0 && (platform !== 'all' || contentType !== 'all' || status !== 'all' || q);
  const todayEmpty = !loading && todayItems.length === 0;

  return (
    <div>
      <PageHeader
        title="Interner Content-Kalender"
        description="Nur interne Planung. AUTOMATIC PUBLISHING: NOT SUPPORTED — NEXTER veröffentlicht nichts auf TikTok, YouTube, Instagram, Twitch oder Discord."
        badge={<Badge variant="brand">Intern geplant ≠ veröffentlicht</Badge>}
      />

      {error && <StudioErrorBanner message={error} />}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Geplante Einträge" value={items.filter((i) => i.scheduledAt).length} icon={<Calendar className="h-5 w-5" />} />
        <StatCard label="Heute" value={todayItems.length} />
        <StatCard label="Als Nächstes" value={upcomingItems.length} />
      </div>

      <NeonCard accent="cyan" className="mb-4" title="Heute">
        {loading && <p className="text-sm text-zinc-500">Kalenderdaten werden geladen…</p>}
        {todayEmpty && (
          <p className="text-sm text-zinc-500" data-testid="calendar-today-empty">
            Heute nichts geplant.{' '}
            <Link to="/social-studio?tab=planner" className="text-cyan-300 underline">
              Post planen
            </Link>
          </p>
        )}
        <ul className="space-y-2">
          {todayItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="min-h-11 w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm"
                onClick={() => {
                  setSelectedId(item.id);
                  setEditWhen(item.scheduledAt ? isoToDatetimeLocalValue(item.scheduledAt) : '');
                }}
              >
                <span className="font-medium text-zinc-200">{item.title}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {formatWhen(item.scheduledAt)} · {item.platform || 'allgemein'} · {item.plannerLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </NeonCard>

      {upcomingItems.length > 0 && (
        <NeonCard accent="purple" className="mb-4" title="Als Nächstes">
          <ul className="space-y-2" data-testid="calendar-upcoming">
            {upcomingItems.map((item) => (
              <li key={item.id} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
                <p className="text-zinc-200">{item.title}</p>
                <p className="text-xs text-zinc-500">
                  {formatWhen(item.scheduledAt)} · {item.platform} · {item.plannerLabel}
                </p>
              </li>
            ))}
          </ul>
        </NeonCard>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-white/10 p-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kalenderansicht">
          {(['list', 'week', 'month'] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'primary' : 'outline'}
              className={cn('min-h-11 capitalize', v === 'month' && 'hidden md:inline-flex')}
              aria-pressed={view === v}
              onClick={() => setParam('view', v)}
            >
              {v === 'list' ? 'Liste' : v === 'week' ? 'Woche' : 'Monat'}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="min-h-11" aria-label="Heute anzeigen" onClick={() => setCursor(new Date())}>
            Heute
          </Button>
          <Button size="sm" variant="outline" className="min-h-11" aria-label="Vorheriger Zeitraum" onClick={() => setCursor((c) => shiftCursor(c, view === 'month' ? 'month' : 'week', -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="min-h-11" aria-label="Nächster Zeitraum" onClick={() => setCursor((c) => shiftCursor(c, view === 'month' ? 'month' : 'week', 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <p className="flex min-h-11 items-center text-sm text-zinc-300" aria-live="polite">
            {view === 'week' ? `Woche ab ${weekCells(cursor)[0]?.toLocaleDateString('de-DE')}` : monthTitle(cursor)}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="block text-xs font-medium text-zinc-400" htmlFor="cal-filter-platform">
            Plattform
            <select
              id="cal-filter-platform"
              aria-label="Plattformfilter"
              className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm"
              value={platform}
              onChange={(e) => setParam('platform', e.target.value)}
            >
              <option value="all">Alle</option>
              {SOCIAL_PLANNER_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {CONTENT_PLATFORMS.find((c) => c.id === p)?.displayName ?? p}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-zinc-400" htmlFor="cal-filter-type">
            Content-Typ
            <select
              id="cal-filter-type"
              aria-label="Content-Typ-Filter"
              className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm"
              value={contentType}
              onChange={(e) => setParam('contentType', e.target.value)}
            >
              <option value="all">Alle</option>
              {TEXT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k] ?? k}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-zinc-400" htmlFor="cal-filter-status">
            Status
            <select
              id="cal-filter-status"
              aria-label="Statusfilter"
              className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm"
              value={status}
              onChange={(e) => setParam('status', e.target.value)}
            >
              <option value="all">Alle</option>
              <option value="draft">Entwurf</option>
              <option value="planned">Intern geplant</option>
              <option value="completed">Erledigt (nicht veröffentlicht)</option>
            </select>
          </label>
          <Input
            id="cal-search"
            label="Suche"
            aria-label="Suche nach Titel, Thema, Inhalt oder Projekt"
            placeholder="Titel, Thema, Inhalt, Projekt"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            className="min-h-11"
          />
        </div>
      </div>

      {loading && <p className="mb-4 text-sm text-zinc-500">Kalenderdaten werden geladen…</p>}
      {noSocial && (
        <p className="mb-4 text-sm text-zinc-500" data-testid="calendar-no-posts">
          Keine Social Posts vorhanden.{' '}
          <Link to="/social-studio" className="text-cyan-300 underline">
            Content erstellen
          </Link>
        </p>
      )}
      {noPlanned && !filterEmpty && !noSocial && (
        <p className="mb-4 text-sm text-zinc-500" data-testid="calendar-empty">
          Noch nichts geplant.{' '}
          <Link to="/social-studio?tab=planner" className="text-cyan-300 underline">
            Post planen
          </Link>
        </p>
      )}
      {filterEmpty && (
        <p className="mb-4 text-sm text-zinc-500" data-testid="calendar-filter-empty">
          Keine Posts für diesen Filter.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {view === 'list' ? (
            <NeonCard accent="magenta" title="Agenda">
              <ul className="space-y-2">
                {visibleItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        'min-h-11 w-full rounded-lg border px-3 py-2 text-left text-sm',
                        selectedId === item.id ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-white/10'
                      )}
                      onClick={() => {
                        setSelectedId(item.id);
                        setEditWhen(item.scheduledAt ? isoToDatetimeLocalValue(item.scheduledAt) : '');
                      }}
                    >
                      <span className="font-medium text-zinc-200">{item.title || 'Inhalt nicht verfügbar'}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {formatWhen(item.scheduledAt)} · {item.platform || '—'} · {KIND_LABELS[item.contentType ?? ''] ?? item.contentType ?? 'Post'} · {item.plannerLabel}
                        {item.projectId ? ` · ${projectName(item.projectId) ?? 'eigenes Projekt'}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </NeonCard>
          ) : (
            <div className={cn('grid grid-cols-7 gap-1', view === 'month' && 'hidden md:grid')} data-testid={view === 'month' ? 'calendar-month' : 'calendar-week'}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-1 py-1 text-center text-[11px] font-medium text-zinc-500">
                  {d}
                </div>
              ))}
              {cells.map((day) => {
                const key = localDateKey(day.toISOString());
                const dayItems = byDay.get(key) ?? [];
                const inMonth = day.getMonth() === cursor.getMonth();
                const isToday = key === todayKey;
                return (
                  <div
                    key={key + day.toISOString()}
                    className={cn(
                      'min-h-[88px] rounded-lg border p-1',
                      isToday ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-white/10',
                      view === 'month' && !inMonth && 'opacity-40'
                    )}
                  >
                    <p className="px-1 text-xs text-zinc-400">{day.getDate()}</p>
                    <div className="space-y-1">
                      {dayItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="min-h-11 w-full rounded bg-black/30 px-1 py-1 text-left text-[11px] text-zinc-200"
                          onClick={() => {
                            setSelectedId(item.id);
                            setEditWhen(item.scheduledAt ? isoToDatetimeLocalValue(item.scheduledAt) : '');
                          }}
                        >
                          <span className="block truncate">{item.platform}</span>
                          <span className="block truncate text-zinc-500">{item.plannerLabel}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {view === 'month' && (
            <p className="text-xs text-zinc-500 md:hidden">Monatsraster auf dem Handy ausgeblendet — nutze Liste oder Woche.</p>
          )}
        </div>

        <div className="space-y-4">
          <NeonCard accent="cyan" title="Post intern planen">
            <form onSubmit={(e) => void handlePlanExisting(e)} className="space-y-3">
              <label className="block text-xs font-medium text-zinc-400" htmlFor="cal-plan-post">
                Social Post
                <select
                  id="cal-plan-post"
                  className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm"
                  value={planPostId}
                  onChange={(e) => {
                    setPlanPostId(e.target.value);
                    const post = posts.find((p) => p.id === e.target.value);
                    if (post) setPlanPlatform(post.platform);
                  }}
                >
                  <option value="">Post wählen</option>
                  {posts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.platform} · {p.content.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-zinc-400" htmlFor="cal-plan-platform">
                Plattform
                <select
                  id="cal-plan-platform"
                  className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm"
                  value={planPlatform}
                  onChange={(e) => setPlanPlatform(e.target.value as SocialPlatform)}
                >
                  {SOCIAL_PLANNER_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                id="cal-plan-when"
                label="Datum und Uhrzeit"
                type="datetime-local"
                className="min-h-11"
                value={planWhen}
                onChange={(e) => setPlanWhen(e.target.value)}
              />
              <Button type="submit" className="min-h-11" loading={saving} disabled={!planPostId || !planWhen}>
                Intern planen
              </Button>
              <p className="text-[11px] text-amber-200">Vergangene Termine sind erlaubt und werden nicht still korrigiert. Das ist kein Publishing.</p>
            </form>
          </NeonCard>

          <NeonCard accent="purple" title="Vorschau">
            {!selected && <p className="text-sm text-zinc-500">Eintrag öffnen, um Details zu sehen.</p>}
            {selected && (
              <div className="space-y-2 text-sm">
                {selected.title === 'Inhalt nicht verfügbar' ? (
                  <p className="text-amber-200">Inhalt nicht verfügbar</p>
                ) : (
                  <>
                    <p><span className="text-zinc-500">Plattform:</span> {selected.platform || '—'}</p>
                    <p><span className="text-zinc-500">Typ:</span> {KIND_LABELS[selected.contentType ?? ''] ?? selected.contentType ?? 'Post'}</p>
                    <p className="whitespace-pre-wrap text-zinc-200">{selected.content}</p>
                    <p><span className="text-zinc-500">Projekt:</span> {selected.projectId ? (
                      <Link className="text-cyan-300 underline" to="/projects">{projectName(selected.projectId) ?? 'Eigenes Projekt'}</Link>
                    ) : '—'}</p>
                    <p><span className="text-zinc-500">Asset:</span> {selected.mediaAssetId ? (selected.mediaUrl ? 'verknüpft' : 'nicht verfügbar') : '—'}</p>
                    {selected.mediaUrl && (
                      <img src={selected.mediaUrl} alt="" className="max-h-32 rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <p><span className="text-zinc-500">Termin:</span> {formatWhen(selected.scheduledAt)}</p>
                    <p><span className="text-zinc-500">Status:</span> {selected.plannerLabel}</p>
                    {selected.version ? <p className="text-xs text-zinc-500">Aktuelle Version v{selected.version}</p> : null}
                    <p className="text-[11px] text-amber-200">Intern geplant — nicht veröffentlicht.</p>
                  </>
                )}
                <Input
                  id="cal-edit-when"
                  label="Termin ändern"
                  type="datetime-local"
                  className="min-h-11"
                  value={editWhen}
                  onChange={(e) => setEditWhen(e.target.value)}
                  disabled={!selected.socialPostId}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="min-h-11" disabled={!selected.socialPostId || !editWhen} loading={saving} onClick={() => void handleSaveSelectedWhen()}>
                    Termin speichern
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-11" onClick={() => void copySelected()} aria-label="Text kopieren">
                    <Copy className="mr-1 h-3 w-3" /> Text kopieren
                  </Button>
                  {copied && <span className="self-center text-xs text-zinc-400">Kopiert</span>}
                  {selected.socialPostId && (
                    <Link to={`/social-studio?tab=planner&postId=${selected.socialPostId}${selected.packageId ? `&packageId=${selected.packageId}` : ''}`} className="inline-flex min-h-11 items-center rounded-lg border border-white/10 px-3 text-sm">
                      <Pencil className="mr-1 h-3 w-3" /> Inhalt bearbeiten
                    </Link>
                  )}
                  {selected.socialPostId && selected.plannerStatus !== 'ready' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      aria-label="Als erledigt markieren"
                      onClick={() => void persistSchedule(selected.socialPostId!, selected.scheduledAt || null, { status: 'ready' })}
                    >
                      Als erledigt markieren
                    </Button>
                  )}
                  {selected.socialPostId && selected.scheduledAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      aria-label="Planung entfernen"
                      onClick={() => void persistSchedule(selected.socialPostId!, null, { clearSchedule: true })}
                    >
                      Planung entfernen
                    </Button>
                  )}
                </div>
              </div>
            )}
          </NeonCard>
        </div>
      </div>
    </div>
  );
}
