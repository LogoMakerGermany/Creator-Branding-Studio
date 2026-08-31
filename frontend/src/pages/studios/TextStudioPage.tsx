import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  COIN_COSTS,
  CONTENT_PLATFORMS,
  CoinSpendCategory,
  packageToPlainText,
  type ContentPlatformId,
  type ContentSourceType,
  type TextKind,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type TextStudioJob, type VideoProject } from '@/services/api';
import { DnaRequiredBanner } from '@/v2/components/StudioAlerts';
import { StudioErrorBanner } from '@/components/studio';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { GlassCard } from '@/v2/components/GlassCard';
import { formatCoins } from '@/lib/utils';

const TEXT_COST = COIN_COSTS[CoinSpendCategory.TEXT_GENERATION];

const KINDS: { id: TextKind; label: string }[] = [
  { id: 'package', label: 'Content-Paket' },
  { id: 'hook', label: 'Hook' },
  { id: 'video-title', label: 'Titel' },
  { id: 'tiktok-caption', label: 'Caption' },
  { id: 'video-description', label: 'Beschreibung' },
  { id: 'hashtags', label: 'Hashtags' },
  { id: 'twitch-title', label: 'Twitch-Titel' },
  { id: 'bio', label: 'Bio' },
  { id: 'script', label: 'Skript' },
  { id: 'ideas', label: 'Ideen' },
];

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function TextStudioPage() {
  const { activeDna, refreshUser } = useAuth();
  const brandProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const [search] = useSearchParams();
  const [kind, setKind] = useState<TextKind>((search.get('kind') as TextKind) || 'package');
  const [topic, setTopic] = useState('');
  const [sourceType, setSourceType] = useState<ContentSourceType>(
    (search.get('source') as ContentSourceType) || 'topic'
  );
  const [projectId, setProjectId] = useState(search.get('projectId') || brandProjectId || '');
  const [videoProjectId, setVideoProjectId] = useState(search.get('videoProjectId') || '');
  const [shortJobId, setShortJobId] = useState(search.get('shortJobId') || '');
  const [platforms, setPlatforms] = useState<ContentPlatformId[]>(['tiktok']);
  const [jobs, setJobs] = useState<TextStudioJob[]>([]);
  const [current, setCurrent] = useState<TextStudioJob | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<{ id: string; coinCost: number } | null>(null);
  const [draft, setDraft] = useState({
    hook: '',
    title: '',
    caption: '',
    description: '',
    hashtags: '',
    callToAction: '',
  });

  useEffect(() => {
    api.textStudio
      .list()
      .then((r) => {
        setJobs(r.jobs);
        const qid = search.get('packageId');
        const match = r.jobs.find((j) => j.id === qid) ?? r.jobs[0];
        if (match) selectJob(match);
      })
      .catch(() => {});
    api.projects
      .list()
      .then((r) => setProjects(r.projects.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
    api.video
      .list()
      .then((r) => {
        setVideos(r.projects);
        if (!videoProjectId && r.projects[0]) setVideoProjectId(r.projects[0].id);
      })
      .catch(() => {});
  }, [search]);

  const selectedVideo = videos.find((v) => v.id === videoProjectId);

  function selectJob(job: TextStudioJob) {
    setCurrent(job);
    setDraft({
      hook: job.hook || '',
      title: job.title || '',
      caption: job.caption || '',
      description: job.description || '',
      hashtags: (job.hashtags ?? []).join(' '),
      callToAction: job.callToAction || '',
    });
  }

  function togglePlatform(id: ContentPlatformId) {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function saveDraft() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.textStudio.draft({
        kind,
        topic: topic.trim() || 'Entwurf',
        projectId: projectId || undefined,
        sourceType,
        videoProjectId: videoProjectId || undefined,
        shortJobId: shortJobId || undefined,
        sourceAssetId: shortJobId || videoProjectId || undefined,
      });
      setJobs((prev) => [res.job, ...prev]);
      selectJob(res.job);
      setStatus('Entwurf gespeichert — keine Coins.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Entwurf fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function requestQuote() {
    if (!topic.trim() && sourceType === 'topic') return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await api.textStudio.quote({
        kind,
        topic: topic.trim() || undefined,
        projectId: projectId || undefined,
        sourceType,
        videoProjectId: videoProjectId || undefined,
        shortJobId: shortJobId || undefined,
        sourceAssetId: shortJobId || videoProjectId || undefined,
        platforms,
        wantLastShort: sourceType === 'short' && !shortJobId,
      });
      setPendingQuote({ id: res.quote.id, coinCost: res.quote.coinCost });
      setStatus(`Angebot: ${formatCoins(res.quote.coinCost)} Coins. Noch kein Job, keine Abbuchung.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Angebot fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function confirmQuote() {
    if (!pendingQuote || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.nexter.confirmQuote(pendingQuote.id);
      const listed = await api.textStudio.list();
      setJobs(listed.jobs);
      if (listed.jobs[0]) selectJob(listed.jobs[0]);
      setPendingQuote(null);
      setStatus('Content-Paket gespeichert.');
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
      await refreshUser();
    } finally {
      setLoading(false);
    }
  }

  async function cancelQuote() {
    if (!pendingQuote) return;
    try {
      await api.nexter.cancelQuote(pendingQuote.id);
    } catch {
      /* still drop local quote */
    }
    setPendingQuote(null);
    setStatus('Abgebrochen — keine Coins abgezogen.');
  }

  async function saveEdits() {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.textStudio.update(current.id, {
        hook: draft.hook,
        title: draft.title,
        caption: draft.caption,
        description: draft.description,
        hashtags: draft.hashtags.split(/[\s,]+/).filter(Boolean),
        callToAction: draft.callToAction,
        projectId: projectId || undefined,
      });
      setCurrent(res.job);
      setJobs((prev) => prev.map((j) => (j.id === res.job.id ? res.job : j)));
      setStatus('Änderungen gespeichert.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function requestRevision(field: 'hook' | 'caption' | 'title', instruction: string, variantCount?: number) {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.textStudio.quote({
        packageId: current.id,
        projectId: current.projectId || projectId || undefined,
        revisionField: field,
        revisionInstruction: instruction,
        variantCount,
        kind: 'package',
      });
      setPendingQuote({ id: res.quote.id, coinCost: res.quote.coinCost });
      setStatus(`Revision: ${formatCoins(res.quote.coinCost)} Coins — nur ${field}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Angebot fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function downloadTxt() {
    if (!current) return;
    const res = await api.textStudio.export(current.id);
    const blob = new Blob([res.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewText = useMemo(
    () =>
      packageToPlainText({
        hook: draft.hook,
        title: draft.title,
        caption: draft.caption,
        description: draft.description,
        hashtags: draft.hashtags.split(/[\s,]+/).filter(Boolean),
        callToAction: draft.callToAction,
      }),
    [draft]
  );

  return (
    <StudioShell
      title="Text Studio"
      description="Content-Pakete aus Projekt, Short oder Thema. Creator DNA hat Vorrang. Kein Social-Publishing."
      coinCost={TEXT_COST}
      nexterHint="Text"
    >
      {!activeDna && (
        <DnaRequiredBanner message="Ohne DNA nutze ich nur dein Thema. Projekt-DNA hat Vorrang, wenn ein Projekt gewählt ist." />
      )}
      {error && <StudioErrorBanner message={error} />}
      {status && <p className="text-sm text-emerald-300">{status}</p>}

      <StudioWorkbench
        settingsTitle="Quelle & Typ"
        previewTitle="Content-Paket"
        settings={
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <StudioOptionPill key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.label}
                </StudioOptionPill>
              ))}
            </div>
            <label className="block text-xs text-zinc-500">
              Projekt
              <select
                className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-zinc-200"
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
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['topic', 'Thema'],
                  ['short', 'Short'],
                  ['video', 'Video'],
                  ['project', 'Projekt'],
                ] as const
              ).map(([id, label]) => (
                <StudioOptionPill key={id} active={sourceType === id} onClick={() => setSourceType(id)}>
                  {label}
                </StudioOptionPill>
              ))}
            </div>
            {(sourceType === 'short' || sourceType === 'video') && (
              <label className="block text-xs text-zinc-500">
                Video / Short
                <select
                  data-testid="text-source-video"
                  className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                  value={videoProjectId}
                  onChange={(e) => setVideoProjectId(e.target.value)}
                >
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                      {v.subtitles?.length ? ' · Transkript' : ' · kein Transkript'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {sourceType === 'short' && selectedVideo && (
              <label className="block text-xs text-zinc-500">
                Short-Export
                <select
                  className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                  value={shortJobId}
                  onChange={(e) => setShortJobId(e.target.value)}
                >
                  <option value="">Letztes eigenes Short</option>
                  {(selectedVideo.shorts ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || s.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <input
              data-testid="text-topic"
              className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Thema, Spiel, Stream-Idee…"
            />
            <p className="text-[11px] text-zinc-500">Plattformvarianten (nur Textvorlagen, kein Publishing)</p>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_PLATFORMS.map((p) => (
                <StudioOptionPill
                  key={p.id}
                  active={platforms.includes(p.id)}
                  onClick={() => togglePlatform(p.id)}
                >
                  {p.displayName}
                </StudioOptionPill>
              ))}
            </div>
            {!pendingQuote ? (
              <div className="space-y-2">
                <Button
                  data-testid="text-studio-generate"
                  className="w-full"
                  onClick={() => void requestQuote()}
                  loading={loading}
                  disabled={loading}
                >
                  Angebot einholen ({formatCoins(TEXT_COST)})
                </Button>
                <Button
                  data-testid="text-studio-draft"
                  className="w-full"
                  variant="outline"
                  onClick={() => void saveDraft()}
                  disabled={loading}
                >
                  Entwurf ohne KI
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-violet-500/40 bg-violet-500/10 p-3" data-testid="text-quote-bar">
                <p data-testid="text-quote-cost" className="text-sm text-violet-100">
                  {formatCoins(pendingQuote.coinCost)} Coins — startet erst nach Bestätigung.
                </p>
                <div className="flex gap-2">
                  <Button data-testid="text-studio-confirm" onClick={() => void confirmQuote()} loading={loading} disabled={loading}>
                    Erstellen
                  </Button>
                  <Button data-testid="text-studio-cancel" variant="outline" onClick={() => void cancelQuote()} disabled={loading}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}
          </div>
        }
        preview={
          current ? (
            <div className="space-y-3" data-testid="content-package">
              <p className="text-[11px] uppercase text-zinc-500">
                {current.kind} · {current.sourceLabel || current.sourceType} ·{' '}
                {current.usedTranscript ? 'Transkript verwendet' : current.transcriptMissingNote || 'kein Transkript'}
              </p>
              {(
                [
                  ['title', 'Titel'],
                  ['hook', 'Hook'],
                  ['caption', 'Caption'],
                  ['description', 'Beschreibung'],
                  ['hashtags', 'Hashtags'],
                  ['callToAction', 'CTA'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs text-zinc-500">
                  {label}
                  <textarea
                    data-testid={`content-${key}`}
                    className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-zinc-100"
                    rows={key === 'description' || key === 'caption' ? 3 : 2}
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-violet-300"
                    onClick={() => void copyText(draft[key])}
                  >
                    Kopieren
                  </button>
                </label>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button data-testid="content-save" size="sm" onClick={() => void saveEdits()} loading={loading}>
                  Speichern
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copyText(previewText)}>
                  Alles kopieren
                </Button>
                <Button size="sm" variant="outline" onClick={() => void downloadTxt()}>
                  TXT
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void requestRevision('caption', 'Mach die Caption kürzer')}
                >
                  Caption kürzer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void requestRevision('hook', '3 alternative Hooks', 3)}
                >
                  3 Hooks
                </Button>
                <Link
                  data-testid="content-plan-link"
                  to={`/social-studio?packageId=${current.id}`}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300"
                >
                  Intern planen
                </Link>
              </div>
              {current.alternatives?.length ? (
                <div>
                  <p className="text-xs text-zinc-500">Alternativen</p>
                  <ul className="mt-1 list-disc pl-4 text-sm text-zinc-300">
                    {current.alternatives.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-[11px] text-zinc-600">Interne Vorschau — keine Live-App-Simulation.</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/50 p-3 text-xs text-zinc-400">
                {previewText}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Noch kein Paket. Angebot einholen, dann bestätigen.</p>
          )
        }
        history={
          <GlassCard className="!p-4">
            <h3 className="mb-2 text-sm font-semibold">Verlauf</h3>
            <div className="space-y-2">
              {jobs.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className="block w-full rounded border border-white/10 p-2 text-left text-sm"
                  onClick={() => selectJob(j)}
                >
                  <span className="text-zinc-200">{j.title || j.hook || j.topic || j.kind}</span>
                  <span className="ml-2 text-[11px] text-zinc-500">
                    {new Date(j.createdAt).toLocaleString('de-DE')}
                  </span>
                </button>
              ))}
            </div>
          </GlassCard>
        }
      />
    </StudioShell>
  );
}
