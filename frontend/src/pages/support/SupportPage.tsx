import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Input } from '@/components/ui';
import { api, ApiError, getLastApiRequestId, type TesterFeedbackRow } from '@/services/api';

const TYPES = [
  { id: 'support', label: 'Support' },
  { id: 'bug', label: 'Fehler melden' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'feature_request', label: 'Feature-Wunsch' },
] as const;

const CATEGORIES = [
  { id: 'technical', label: 'Technisches Problem' },
  { id: 'generation', label: 'Generierung fehlgeschlagen' },
  { id: 'file', label: 'Datei / Download' },
  { id: 'coins', label: 'Coins' },
  { id: 'account', label: 'Account / Login' },
  { id: 'suggestion', label: 'Verbesserungsvorschlag' },
  { id: 'other', label: 'Sonstiges' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  new: 'Offen',
  reviewing: 'In Bearbeitung',
  resolved: 'Gelöst',
  closed: 'Geschlossen',
};

const TYPE_LABEL: Record<string, string> = {
  support: 'Support',
  bug: 'Fehler',
  feedback: 'Feedback',
  feature_request: 'Feature-Wunsch',
};

const HELP_LINKS = [
  { to: '/projects', label: 'Projekte' },
  { to: '/file-cloud', label: 'Datei-Cloud' },
  { to: '/coins', label: 'Coins' },
  { to: '/settings', label: 'Einstellungen' },
  { to: '/verify-email', label: 'E-Mail bestätigen' },
  { to: '/nexter', label: 'Nexter' },
  { to: '/streamset-studio', label: 'Streamsets' },
] as const;

function statusLabel(status?: string): string {
  return STATUS_LABEL[status ?? 'new'] ?? status ?? 'Offen';
}

export function SupportPage() {
  const [params] = useSearchParams();
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('support');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('other');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [projectId, setProjectId] = useState('');
  const [jobId, setJobId] = useState('');
  const [fileId, setFileId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [routeHint, setRouteHint] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);
  const [history, setHistory] = useState<TesterFeedbackRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<TesterFeedbackRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const prefill = useMemo(
    () => ({
      type: params.get('type'),
      category: params.get('category'),
      requestId: params.get('requestId'),
      projectId: params.get('projectId'),
      jobId: params.get('jobId'),
      fileId: params.get('fileId'),
      route: params.get('route'),
    }),
    [params]
  );

  useEffect(() => {
    if (TYPES.some((t) => t.id === prefill.type)) setType(prefill.type as (typeof TYPES)[number]['id']);
    if (CATEGORIES.some((c) => c.id === prefill.category)) {
      setCategory(prefill.category as (typeof CATEGORIES)[number]['id']);
    }
    if (prefill.requestId) setRequestId(prefill.requestId);
    else {
      const last = getLastApiRequestId();
      if (last) setRequestId(last);
    }
    if (prefill.projectId) setProjectId(prefill.projectId);
    if (prefill.jobId) setJobId(prefill.jobId);
    if (prefill.fileId) setFileId(prefill.fileId);
    if (prefill.route) setRouteHint(prefill.route);
    else if (typeof window !== 'undefined') setRouteHint(window.location.pathname);
  }, [prefill]);

  const loadHistory = useCallback(async (nextOffset = 0, append = false) => {
    setHistoryLoading(true);
    setLoadError(null);
    try {
      const page = await api.feedback.list({ limit: 20, offset: nextOffset });
      setHistory((prev) => (append ? [...prev, ...page.feedback] : page.feedback));
      setHasMore(Boolean(page.hasMore));
      setOffset(page.offset + page.feedback.length);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Anfragen konnten nicht geladen werden.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(0, false);
    api.projects
      .list({ limit: 20 })
      .then((r) => setProjects((r.projects ?? []).map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => undefined);
    api.files
      .list({ limit: 20, sort: 'newest' })
      .then((r) => setFiles((r.files ?? []).map((f) => ({ id: f.id, name: f.name }))))
      .catch(() => undefined);
  }, [loadHistory]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setSendError(null);
    setSendOk(null);
    try {
      await api.feedback.submit({
        module: routeHint || '/support',
        route: routeHint || '/support',
        type,
        category,
        subject: subject.trim(),
        message: message.trim(),
        projectId: projectId.trim() || undefined,
        jobId: jobId.trim() || undefined,
        fileId: fileId.trim() || undefined,
        requestId: requestId.trim() || undefined,
        idempotencyKey: `${Date.now()}-${subject.trim().slice(0, 24)}`,
      });
      setSubject('');
      setMessage('');
      setSendOk('Gesendet. Die Anfrage erscheint in deiner History. Es wird keine E-Mail verschickt.');
      await loadHistory(0, false);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Senden fehlgeschlagen.');
    } finally {
      setSending(false);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const row = await api.feedback.get(id);
      setSelected(row.feedback);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Eintrag konnte nicht geladen werden.');
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-white">NEXTER Support & Feedback</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Melde technische Probleme, sende Feedback oder einen Feature-Wunsch. Support kostet keine Coins. Es gibt
          kein zugesichertes Antwortfenster und keine E-Mail-Benachrichtigung.
        </p>
      </header>

      <section aria-labelledby="support-help" className="rounded-2xl border border-white/10 p-4 sm:p-6">
        <h2 id="support-help" className="font-semibold text-white">
          Hilfe-Themen
        </h2>
        <p className="mt-1 text-sm text-zinc-400">Direkt zu vorhandenen Bereichen der App.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {HELP_LINKS.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className="inline-flex min-h-11 items-center rounded-lg border border-white/10 px-3 text-sm text-[var(--ucbs-accent-cyan)] hover:underline"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="support-form" className="rounded-2xl border border-white/10 p-4 sm:p-6">
        <h2 id="support-form" className="font-semibold text-white">
          Anfrage senden
        </h2>
        <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
          <div>
            <label htmlFor="support-type" className="block text-sm font-medium text-zinc-300">
              Art
            </label>
            <select
              id="support-type"
              className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm text-white"
              value={type}
              onChange={(e) => setType(e.target.value as (typeof TYPES)[number]['id'])}
            >
              {TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="support-category" className="block text-sm font-medium text-zinc-300">
              Kategorie
            </label>
            <select
              id="support-category"
              className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm text-white"
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number]['id'])}
            >
              {CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            id="support-subject"
            label="Betreff"
            value={subject}
            maxLength={120}
            required
            onChange={(e) => setSubject(e.target.value)}
          />
          <div>
            <label htmlFor="support-message" className="block text-sm font-medium text-zinc-300">
              Nachricht
            </label>
            <textarea
              id="support-message"
              className="mt-1 min-h-[8rem] w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={message}
              maxLength={2000}
              required
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="support-project" className="block text-sm font-medium text-zinc-300">
                Projekt (optional)
              </label>
              <select
                id="support-project"
                className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm text-white"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Kein Projekt</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="support-file" className="block text-sm font-medium text-zinc-300">
                Datei aus der Datei-Cloud (optional)
              </label>
              <select
                id="support-file"
                className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm text-white"
                value={fileId}
                onChange={(e) => setFileId(e.target.value)}
              >
                <option value="">Keine Datei</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              id="support-job"
              label="Job-ID (optional)"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            />
            <Input
              id="support-request-id"
              label="Request-ID (optional)"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
            />
          </div>
          <p className="text-xs text-zinc-500">
            Anhänge nur über bereits hochgeladene Dateien in der Datei-Cloud. Support ändert keine Coins und löst
            keine Erstattung aus.
          </p>
          <Button type="submit" className="min-h-11" loading={sending} disabled={sending}>
            Absenden
          </Button>
          <div aria-live="polite">
            {sendOk && (
              <p className="text-sm text-emerald-300" role="status">
                {sendOk}
              </p>
            )}
            {sendError && (
              <p className="text-sm text-red-300" role="alert">
                {sendError}
              </p>
            )}
          </div>
        </form>
      </section>

      <section aria-labelledby="support-history" className="rounded-2xl border border-white/10 p-4 sm:p-6">
        <h2 id="support-history" className="font-semibold text-white">
          Eigene Anfragen
        </h2>
        {historyLoading && history.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400" role="status">
            Lade Anfragen …
          </p>
        )}
        {loadError && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {loadError}
          </p>
        )}
        {!historyLoading && !loadError && history.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400">Noch keine Anfragen. Gesendete Einträge erscheinen hier.</p>
        )}
        <ul className="mt-4 space-y-3">
          {history.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="w-full rounded-xl border border-white/10 p-3 text-left hover:bg-white/5"
                onClick={() => void openDetail(row.id)}
              >
                <p className="text-sm text-white">{row.subject || row.message}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {row.createdAt ? new Date(row.createdAt).toLocaleString('de-DE') : ''} ·{' '}
                  {TYPE_LABEL[row.type ?? 'support'] ?? row.type} · {statusLabel(row.status)}
                </p>
              </button>
            </li>
          ))}
        </ul>
        {hasMore && (
          <Button
            type="button"
            variant="secondary"
            className="mt-3 min-h-11"
            disabled={historyLoading}
            onClick={() => void loadHistory(offset, true)}
          >
            Weitere laden
          </Button>
        )}
        {detailLoading && (
          <p className="mt-3 text-sm text-zinc-400" role="status">
            Lade Details …
          </p>
        )}
        {selected && (
          <div className="mt-4 rounded-xl border border-white/10 p-4" aria-labelledby="support-detail">
            <h3 id="support-detail" className="font-medium text-white">
              {selected.subject || 'Anfrage'}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {TYPE_LABEL[selected.type ?? 'support'] ?? selected.type} · {statusLabel(selected.status)} ·{' '}
              {selected.createdAt ? new Date(selected.createdAt).toLocaleString('de-DE') : ''}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{selected.message}</p>
            <ul className="mt-3 space-y-1 text-xs text-zinc-500">
              {selected.requestId && <li>Request-ID: {selected.requestId}</li>}
              {selected.projectId && <li>Projekt: {selected.projectId}</li>}
              {selected.jobId && <li>Job: {selected.jobId}</li>}
              {selected.fileId && <li>Datei: {selected.fileId}</li>}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
