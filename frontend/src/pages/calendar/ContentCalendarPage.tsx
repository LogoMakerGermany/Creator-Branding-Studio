import { useEffect, useState } from 'react';
import { PageHeader, Badge, Button, NeonCard, Input, StatCard } from '@/components/ui';
import { Calendar, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { api, ApiError, type CalendarEvent } from '@/services/api';
import { StudioErrorBanner, TypeOptionButton } from '@/components/studio';
import { cn } from '@/lib/utils';

const EVENT_TYPES = ['post', 'video', 'stream', 'campaign', 'deadline'] as const;

const TYPE_COLORS: Record<CalendarEvent['type'], string> = {
  post: '#22d3ee',
  video: '#a855f7',
  stream: '#ec4899',
  campaign: '#f59e0b',
  deadline: '#ef4444',
};

export function ContentCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CalendarEvent['type']>('post');
  const [startAt, setStartAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.calendar.list();
    setEvents(res.events);
    setUpcoming(res.upcoming);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startAt) return;
    setLoading(true);
    setError(null);
    try {
      await api.calendar.create({
        title: title.trim(),
        type,
        startAt: new Date(startAt).toISOString(),
        color: TYPE_COLORS[type],
      });
      setTitle('');
      setStartAt('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    await api.calendar.delete(id);
    await load();
  }

  async function handleMarkDone(event: CalendarEvent) {
    await api.calendar.update(event.id, { status: 'done' });
    await load();
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  }

  return (
    <div>
      <PageHeader
        title="Interner Content-Kalender"
        description="Nur interne Planung. NEXTER veröffentlicht Beiträge nicht automatisch auf TikTok, YouTube oder Instagram."
        badge={<Badge variant="brand">Intern</Badge>}
      />
      <p className="mb-4 text-sm text-amber-200">
        Einträge sind intern geplant oder erledigt — das ist kein externes Publishing und keine Plattform-Analytics.
      </p>

      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Termine" value={events.length} icon={<Calendar className="h-5 w-5" />} />
        <StatCard label="Anstehend" value={upcoming.length} />
        <StatCard label="Erledigt" value={events.filter((e) => e.status === 'done').length} />
      </div>

      {upcoming.length > 0 && (
        <NeonCard accent="cyan" className="mb-6" title="Als Nächstes">
          <div className="space-y-2">
            {upcoming.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2"
                style={{ borderLeftColor: event.color ?? TYPE_COLORS[event.type], borderLeftWidth: 4 }}
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{event.title}</p>
                  <p className="text-xs text-zinc-500">{formatDate(event.startAt)} · {event.type}</p>
                </div>
                <Button size="sm" variant="outline" aria-label="Termin erledigen" onClick={() => handleMarkDone(event)}>
                  <CheckCircle2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </NeonCard>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="purple" title={
          <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Termin hinzufügen</span>
        }>
          <form onSubmit={handleCreate} className="space-y-3">
            <Input id="cal-title" label="Titel" placeholder="Titel" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((t) => (
                <TypeOptionButton
                  key={t}
                  active={type === t}
                  onClick={() => setType(t)}
                  className="px-3 py-1 capitalize"
                >
                  {t}
                </TypeOptionButton>
              ))}
            </div>
            <Input id="cal-start" label="Beginn" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            <Button type="submit" loading={loading}>Termin erstellen</Button>
          </form>
        </NeonCard>

        <NeonCard accent="magenta" title="Alle Termine">
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-surface-950/50 p-3"
                style={{ borderLeftColor: event.color ?? TYPE_COLORS[event.type], borderLeftWidth: 4 }}
              >
                <div>
                  <p className={cn('text-sm font-medium', event.status === 'done' ? 'text-zinc-500 line-through' : 'text-zinc-200')}>
                    {event.title}
                  </p>
                  <p className="text-xs text-zinc-500">{formatDate(event.startAt)} · {event.type}</p>
                </div>
                <div className="flex gap-1">
                  {event.status !== 'done' && (
                    <Button variant="outline" size="sm" aria-label="Termin erledigen" onClick={() => handleMarkDone(event)}>
                      <CheckCircle2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button variant="outline" size="sm" aria-label="Termin löschen" onClick={() => handleDelete(event.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {events.length === 0 && <p className="text-sm text-zinc-500">Keine Termine geplant</p>}
          </div>
        </NeonCard>
      </div>
    </div>
  );
}
