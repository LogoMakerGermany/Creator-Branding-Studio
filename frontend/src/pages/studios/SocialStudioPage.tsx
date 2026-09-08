import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  COIN_COSTS,
  CONTENT_PLATFORMS,
  CoinSpendCategory,
  SOCIAL_TONES,
  TEXT_KINDS,
  buildSocialContentBrief,
  defaultSocialConfig,
  packageToPlainText,
  plannerStatusLabel,
  normalizePlannerStatus,
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
  type ContentPlatformId,
  type SocialTone,
  type TextKind,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import {
  api,
  ApiError,
  type GenerationJob,
  type SocialPlatform,
  type SocialPost,
  type TextStudioJob,
  type VideoProject,
} from '@/services/api';
import { DnaRequiredBanner } from '@/v2/components/StudioAlerts';
import { StudioErrorBanner } from '@/components/studio';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { GlassCard } from '@/v2/components/GlassCard';
import { formatCoins } from '@/lib/utils';

const BANNER_COST = COIN_COSTS[CoinSpendCategory.BANNER_GENERATION];
const TEXT_COST = COIN_COSTS[CoinSpendCategory.TEXT_GENERATION];

const FORMATS = [
  { id: 'thumbnail' as const, label: 'YouTube Thumbnail' },
  { id: 'post' as const, label: 'Feed-Post' },
  { id: 'story' as const, label: 'Story 9:16' },
  { id: 'announcement' as const, label: 'Ankündigung' },
];

const PLAN_PLATFORMS: SocialPlatform[] = ['tiktok', 'youtube', 'instagram', 'twitch', 'discord', 'twitter'];

const KIND_LABELS: Record<TextKind, string> = {
  package: 'Content-Paket',
  'video-title': 'Video-Titel',
  'video-description': 'YouTube-Beschreibung',
  'tiktok-caption': 'Caption',
  hook: 'Hook',
  hashtags: 'Hashtags',
  'twitch-title': 'Stream-Ankündigung',
  bio: 'Bio',
  script: 'Skript',
  ideas: 'Content-Ideen',
};

type Tab = 'content' | 'graphic' | 'planner';

async function copyPlain(value: string) {
  await navigator.clipboard.writeText(value);
}

export function SocialStudioPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const coins = user?.coinBalance ?? 0;
  const brandProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const [search] = useSearchParams();
  const [tab, setTab] = useState<Tab>('content');
  const [packages, setPackages] = useState<TextStudioJob[]>([]);
  const [current, setCurrent] = useState<TextStudioJob | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<ContentPlatformId>('tiktok');
  const [contentType, setContentType] = useState<TextKind>('package');
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [tone, setTone] = useState<SocialTone>('neutral');
  const [cta, setCta] = useState('');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>('tiktok');
  const [scheduledAt, setScheduledAt] = useState('');
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const [mediaAssetId, setMediaAssetId] = useState('');
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('thumbnail');
  const [graphicJob, setGraphicJob] = useState<GenerationJob | null>(null);
  const [graphicQuote, setGraphicQuote] = useState<{ id: string; coinCost: number } | null>(null);
  const [textQuote, setTextQuote] = useState<{ id: string; coinCost: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [editCta, setEditCta] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [editPostWhen, setEditPostWhen] = useState('');

  const socialConfig = useMemo(
    () =>
      defaultSocialConfig({
        platform: previewPlatform,
        contentType,
        topic: topic.trim() || activeDna?.name || '',
        goal: goal.trim() || undefined,
        tone,
        language: user?.nexterPreferences?.language,
        creatorName: activeDna?.name,
        callToAction: cta.trim() || undefined,
        sourceAssetId: mediaAssetId || undefined,
        sourceType: mediaAssetId ? 'short' : 'topic',
        projectId: brandProjectId || undefined,
        scheduledAt: scheduledAt || undefined,
      }),
    [previewPlatform, contentType, topic, goal, tone, cta, mediaAssetId, brandProjectId, scheduledAt, activeDna?.name, user?.nexterPreferences?.language]
  );
  const brief = socialConfig.summary || buildSocialContentBrief(socialConfig);

  useEffect(() => {
    const qTab = search.get('tab');
    if (qTab === 'planner' || qTab === 'graphic' || qTab === 'content') setTab(qTab);
  }, [search]);

  function selectPackage(pkg: TextStudioJob | null) {
    setCurrent(pkg);
    setEditCaption(pkg?.caption || '');
    setEditHashtags((pkg?.hashtags ?? []).join(' '));
    setEditCta(pkg?.callToAction || '');
    if (pkg?.topic) setTopic(pkg.topic);
  }

  async function reload() {
    const [text, social, vids] = await Promise.all([
      api.textStudio.list().catch(() => ({ jobs: [] as TextStudioJob[] })),
      api.social.list().catch(() => ({ posts: [] as SocialPost[] })),
      api.video.list().catch(() => ({ projects: [] as VideoProject[] })),
    ]);
    setPackages(text.jobs);
    const qid = search.get('packageId');
    const match = text.jobs.find((j) => j.id === qid) ?? text.jobs[0] ?? null;
    selectPackage(match);
    setPosts(social.posts);
    setVideos(vids.projects);
    const postId = search.get('postId');
    if (postId) {
      const p = social.posts.find((x) => x.id === postId);
      if (p) {
        setEditingPostId(p.id);
        setEditPostContent(p.content);
        setEditPostWhen(p.scheduledAt ? isoToDatetimeLocalValue(p.scheduledAt) : '');
      }
    }
  }

  useEffect(() => {
    void reload();
  }, [search]);

  const variant = current?.platformVariants?.[previewPlatform];
  const previewCaption = variant?.caption || current?.caption || '';
  const previewTitle = variant?.title || current?.title || '';
  const previewTags = (variant?.hashtags ?? current?.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const resultText = current
    ? packageToPlainText({
        hook: current.hook,
        title: current.title,
        caption: previewCaption || current.caption,
        description: current.description,
        hashtags: variant?.hashtags ?? current.hashtags ?? [],
        callToAction: current.callToAction,
      })
    : '';
  const versionLabel = `v${current?.version ?? Math.max(1, (current?.revisions?.length ?? 0) + 1)}`;

  async function quoteGraphic() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.socialStudio.quote(format, brandProjectId ?? undefined);
      setGraphicQuote({ id: res.quote.id, coinCost: res.quote.coinCost });
      setStatus(`Social-Grafik: ${formatCoins(res.quote.coinCost)} Coins (Banner-Pipeline). Kein Publishing.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Angebot fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function confirmGraphic() {
    if (!graphicQuote || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.nexter.confirmQuote(graphicQuote.id);
      setGraphicQuote(null);
      const jobs = await api.ai.listJobs();
      const found = jobs.jobs.find((j) => res.jobIds.includes(j.id)) ?? jobs.jobs[0] ?? null;
      setGraphicJob(found);
      setStatus('Grafik erzeugt — intern, nicht veröffentlicht.');
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Grafik fehlgeschlagen');
      await refreshUser();
    } finally {
      setLoading(false);
    }
  }

  async function quoteText(extra?: { packageId?: string; revisionField?: string; revisionInstruction?: string; variantCount?: number }) {
    if (!topic.trim() && !extra?.packageId && !activeDna?.name && !mediaAssetId) {
      setError('Thema, DNA-Name oder eigenes Asset angeben.');
      return;
    }
    setQuoteLoading(true);
    setError(null);
    try {
      const res = await api.textStudio.quote({
        kind: contentType,
        topic: topic.trim() || activeDna?.name || extra?.revisionInstruction || 'Social Content',
        projectId: brandProjectId || undefined,
        sourceType: mediaAssetId ? 'short' : extra?.packageId ? undefined : 'topic',
        shortJobId: mediaAssetId || undefined,
        platforms: [previewPlatform],
        tone,
        goal: goal.trim() || undefined,
        ...extra,
      });
      setTextQuote({ id: res.quote.id, coinCost: res.quote.coinCost });
      setStatus(`Angebot: ${formatCoins(res.quote.coinCost)} Coins. Startet erst nach Bestätigung.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Angebot fehlgeschlagen');
    } finally {
      setQuoteLoading(false);
    }
  }

  async function confirmText() {
    if (!textQuote || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.nexter.confirmQuote(textQuote.id);
      setTextQuote(null);
      await reload();
      if (res.jobIds[0]) {
        const job = await api.textStudio.get(res.jobIds[0]).catch(() => null);
        if (job?.job) selectPackage(job.job);
      }
      setStatus('Content erzeugt — intern gespeichert, nicht veröffentlicht.');
      await refreshUser();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'INSUFFICIENT_COINS') {
        setError(`Nicht genügend Coins. Dieses Angebot kostet ${formatCoins(textQuote.coinCost)} Coins.`);
      } else if (code === 'PRICE_CHANGED') {
        setError('Der Preis hat sich geändert. Bitte ein neues Angebot holen.');
        setTextQuote(null);
      } else {
        setError(err instanceof ApiError ? err.message : 'Erstellen fehlgeschlagen');
      }
      await refreshUser();
    } finally {
      setLoading(false);
    }
  }

  async function saveManualEdit() {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.textStudio.update(current.id, {
        caption: editCaption,
        hashtags: editHashtags.split(/[\s,]+/).filter(Boolean),
        callToAction: editCta,
      });
      selectPackage(res.job);
      setPackages((prev) => prev.map((j) => (j.id === res.job.id ? res.job : j)));
      setStatus('Manuelle Änderung gespeichert — 0 Coins.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function planInternal(as: 'draft' | 'scheduled') {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const content = [previewTitle, previewCaption, previewTags, current.callToAction].filter(Boolean).join('\n');
      const whenIso = as === 'scheduled' && scheduledAt ? datetimeLocalValueToIso(scheduledAt) : undefined;
      if (as === 'scheduled' && scheduledAt && !whenIso) {
        setError('Ungültiges Datum');
        return;
      }
      const postRes = await api.social.create({
        platform,
        content,
        scheduledAt: whenIso || undefined,
        packageId: current.id,
        projectId: current.projectId || brandProjectId || undefined,
        mediaAssetId: mediaAssetId || undefined,
        mediaKind: mediaAssetId ? 'short' : undefined,
        status: as === 'scheduled' ? 'scheduled' : 'draft',
        contentType,
      });
      setPosts((prev) => [postRes.post, ...prev]);
      setStatus(
        as === 'scheduled'
          ? 'Intern geplant. NEXTER veröffentlicht diesen Beitrag noch nicht automatisch auf der Plattform.'
          : 'Als Entwurf gespeichert.'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Planen fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function savePlannerEdit(id: string) {
    setLoading(true);
    setError(null);
    try {
      const whenIso = editPostWhen ? datetimeLocalValueToIso(editPostWhen) : undefined;
      if (editPostWhen && !whenIso) {
        setError('Ungültiges Datum');
        return;
      }
      const res = await api.social.update(id, {
        content: editPostContent,
        scheduledAt: whenIso || undefined,
        clearSchedule: !editPostWhen,
      });
      setPosts((prev) => prev.map((p) => (p.id === id ? res.post : p)));
      setEditingPostId(null);
      setStatus('Planer-Eintrag aktualisiert — nicht veröffentlicht.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Planer-Änderung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function removePlanner(id: string) {
    setLoading(true);
    setError(null);
    try {
      await api.social.delete(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setStatus('Internen Eintrag entfernt.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const shorts = useMemo(
    () => videos.flatMap((v) => (v.shorts ?? []).map((s) => ({ ...s, videoTitle: v.title }))),
    [videos]
  );

  return (
    <StudioShell
      title="Social Content Studio"
      description="Texte, Plattformvarianten und interne Planung. Direktes Publishing ist nicht verfügbar."
      coinCost={tab === 'graphic' ? BANNER_COST : TEXT_COST}
      nexterHint="Social"
    >
      <p data-testid="publishing-unavailable" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        Direktes Publishing noch nicht verfügbar. Intern geplant heißt nur: in NEXTER gespeichert — nicht auf TikTok, YouTube oder Instagram hochgeladen.
      </p>
      <p data-testid="no-platform-analytics" className="text-xs text-zinc-500">
        Keine Plattformdaten verbunden. Es gibt keine Likes, Views oder Follower-Zahlen.
      </p>
      {!activeDna && tab === 'content' && (
        <p data-testid="social-no-dna" className="text-sm text-zinc-400">
          Ohne Creator DNA nutze ich neutrale Defaults. Onboarding ist nicht nötig.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['content', 'Content'],
            ['graphic', 'Social-Grafik'],
            ['planner', 'Interner Planer'],
          ] as const
        ).map(([id, label]) => (
          <StudioOptionPill key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </StudioOptionPill>
        ))}
        <Link to="/content-calendar" className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400">
          Content-Kalender
        </Link>
        <Link to="/text-studio" className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400">
          Text Studio
        </Link>
      </div>

      {error && <StudioErrorBanner message={error} />}
      {status && <p className="text-sm text-emerald-300">{status}</p>}

      {tab === 'content' && (
        <StudioWorkbench
          settingsTitle="Content konfigurieren"
          previewTitle="CONTENT BRIEF / VORSCHAU"
          settings={
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Plattform</p>
              <div className="flex flex-wrap gap-1.5" data-testid="social-platforms">
                {CONTENT_PLATFORMS.map((p) => (
                  <StudioOptionPill
                    key={p.id}
                    active={previewPlatform === p.id}
                    onClick={() => {
                      setPreviewPlatform(p.id);
                      if (PLAN_PLATFORMS.includes(p.id as SocialPlatform)) setPlatform(p.id as SocialPlatform);
                    }}
                  >
                    {p.displayName}
                  </StudioOptionPill>
                ))}
              </div>
              <label className="block text-xs font-medium text-zinc-400" htmlFor="social-kind">
                Content-Typ
                <select
                  id="social-kind"
                  className="mt-1 min-h-11 w-full rounded border border-white/10 bg-black/40 px-2 py-2 text-sm"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as TextKind)}
                >
                  {TEXT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-zinc-400" htmlFor="social-topic">
                Thema
                <Input
                  id="social-topic"
                  data-testid="social-topic"
                  className="mt-1 min-h-11"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={activeDna?.name ? `z. B. ${activeDna.name} Stream` : 'Thema oder Ziel'}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-400" htmlFor="social-goal">
                Ziel (optional)
                <Input id="social-goal" className="mt-1 min-h-11" value={goal} onChange={(e) => setGoal(e.target.value)} />
              </label>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Ton</p>
              <div className="flex flex-wrap gap-1.5">
                {SOCIAL_TONES.map((t) => (
                  <StudioOptionPill key={t} active={tone === t} onClick={() => setTone(t)}>
                    {t}
                  </StudioOptionPill>
                ))}
              </div>
              <label className="block text-xs font-medium text-zinc-400" htmlFor="social-cta">
                Call-to-Action
                <Input id="social-cta" className="mt-1 min-h-11" value={cta} onChange={(e) => setCta(e.target.value)} />
              </label>
              <label className="block text-xs font-medium text-zinc-400" htmlFor="social-asset">
                Eigenes Short (optional)
                <select
                  id="social-asset"
                  className="mt-1 min-h-11 w-full rounded border border-white/10 bg-black/40 px-2 py-2 text-sm"
                  value={mediaAssetId}
                  onChange={(e) => setMediaAssetId(e.target.value)}
                >
                  <option value="">Kein Asset</option>
                  {shorts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || s.videoTitle} ({s.id.slice(0, 6)})
                    </option>
                  ))}
                </select>
              </label>
              {shorts.length === 0 && <p className="text-xs text-zinc-500">Keine eigenen Shorts. Assets sind optional.</p>}
              {quoteLoading && <p className="text-sm text-zinc-400">Angebot wird geladen…</p>}
              {!textQuote ? (
                <Button data-testid="social-quote" className="min-h-11" onClick={() => void quoteText()} loading={quoteLoading}>
                  Angebot einholen
                </Button>
              ) : (
                <div className="space-y-2 rounded-lg border border-white/10 p-3" data-testid="social-quote-summary">
                  <p className="text-sm text-zinc-200">
                    {KIND_LABELS[contentType]} für {previewPlatform} · {formatCoins(textQuote.coinCost)} Coins
                  </p>
                  <p className="text-xs text-zinc-400">
                    Bestand {formatCoins(coins)} · danach {formatCoins(Math.max(0, coins - textQuote.coinCost))}
                  </p>
                  {coins < textQuote.coinCost && (
                    <p className="text-sm text-amber-300" data-testid="social-insufficient-coins">
                      Nicht genügend Coins. Es wird nichts abgebucht.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button data-testid="social-confirm" className="min-h-11" onClick={() => void confirmText()} loading={loading} disabled={loading}>
                      Für {formatCoins(textQuote.coinCost)} Coins erstellen
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={async () => {
                        await api.nexter.cancelQuote(textQuote.id).catch(() => {});
                        setTextQuote(null);
                      }}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Gespeicherte Pakete</p>
              {packages.length === 0 && (
                <p className="text-sm text-zinc-500" data-testid="social-packages-empty">
                  Noch kein Content-Paket.
                </p>
              )}
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => selectPackage(pkg)}
                  className={`block min-h-11 w-full rounded border p-2 text-left text-sm ${
                    current?.id === pkg.id ? 'border-violet-500 bg-violet-500/10' : 'border-white/10'
                  }`}
                >
                  {pkg.title || pkg.hook || pkg.topic}
                </button>
              ))}
            </div>
          }
          preview={
            <div className="space-y-3">
              <div
                data-testid="social-content-brief"
                className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300"
                aria-label="Content Brief Vorschau"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">CONTENT BRIEF / VORSCHAU</p>
                <p className="mt-2">{brief}</p>
                <p className="mt-2 text-[11px] text-zinc-500">Keine fertige KI-Generierung. Vorschläge, keine Reichweitenversprechen.</p>
              </div>
              <div
                data-testid="social-preview"
                className="mx-auto aspect-[9/16] max-h-[420px] w-full max-w-[240px] overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950 p-4"
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Interne Vorschau · {previewPlatform}</p>
                {!current && <p className="mt-3 text-xs text-zinc-500">Noch kein Ergebnis.</p>}
                {current?.status === 'failed' && (
                  <p className="mt-3 text-xs text-amber-300">Generierung fehlgeschlagen. Coins werden erstattet, wenn die Policy greift.</p>
                )}
                <p className="mt-3 text-sm font-semibold text-white">{previewTitle || 'Kein Titel'}</p>
                <p className="mt-2 text-xs text-zinc-300">{previewCaption || 'Keine Caption'}</p>
                <p className="mt-3 text-[11px] text-violet-300">{previewTags}</p>
                {current?.callToAction && <p className="mt-2 text-[11px] text-zinc-400">CTA: {current.callToAction}</p>}
                {current && <p className="mt-3 text-[10px] text-zinc-500">{versionLabel}</p>}
                <p className="mt-4 text-[10px] text-zinc-600">Keine Live-App-Simulation. Kein Publishing.</p>
              </div>
              {current && (
                <div className="space-y-2" data-testid="social-result">
                  <label className="block text-xs font-medium text-zinc-400" htmlFor="social-edit-caption">
                    Caption bearbeiten
                    <textarea
                      id="social-edit-caption"
                      className="mt-1 min-h-[88px] w-full rounded border border-white/10 bg-black/40 p-2 text-sm"
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-medium text-zinc-400" htmlFor="social-edit-hashtags">
                    Hashtags
                    <Input id="social-edit-hashtags" className="mt-1 min-h-11" value={editHashtags} onChange={(e) => setEditHashtags(e.target.value)} />
                  </label>
                  <label className="block text-xs font-medium text-zinc-400" htmlFor="social-edit-cta">
                    CTA
                    <Input id="social-edit-cta" className="mt-1 min-h-11" value={editCta} onChange={(e) => setEditCta(e.target.value)} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="min-h-11" onClick={() => void saveManualEdit()} disabled={loading}>
                      Speichern
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      data-testid="social-copy"
                      onClick={() => void copyPlain(resultText).then(() => setStatus('Text kopiert — nicht veröffentlicht.'))}
                    >
                      Text kopieren
                    </Button>
                    <Button size="sm" variant="outline" className="min-h-11" onClick={() => setTab('planner')} disabled={!current}>
                      Zum Planer hinzufügen
                    </Button>
                  </div>
                  <label className="block text-xs font-medium text-zinc-400" htmlFor="social-change">
                    Änderung anfordern (KI, Angebot nötig)
                    <Input
                      id="social-change"
                      className="mt-1 min-h-11"
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                      placeholder="Kürzer. Mehr Humor. Andere Hashtags."
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="min-h-11"
                      disabled={!current || !changeNote.trim() || quoteLoading}
                      onClick={() =>
                        void quoteText({
                          packageId: current.id,
                          revisionField: /hashtag/i.test(changeNote) ? 'hashtags' : 'caption',
                          revisionInstruction: changeNote,
                        })
                      }
                    >
                      Änderung anbieten
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={!current || quoteLoading}
                      onClick={() =>
                        void quoteText({
                          packageId: current.id,
                          revisionField: 'caption',
                          revisionInstruction: 'Zweite Variante, gleicher Inhalt.',
                          variantCount: 2,
                        })
                      }
                    >
                      Variante anbieten
                    </Button>
                  </div>
                </div>
              )}
            </div>
          }
        />
      )}

      {tab === 'graphic' && (
        <div className="space-y-4">
          {!activeDna && <DnaRequiredBanner />}
          <p className="text-sm text-zinc-400">
            Social-Grafik nutzt die bestehende Banner-Pipeline ({formatCoins(BANNER_COST)} Coins) — getrennt von Text (
            {formatCoins(TEXT_COST)} Coins).
          </p>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <StudioOptionPill key={f.id} active={format === f.id} onClick={() => setFormat(f.id)}>
                {f.label}
              </StudioOptionPill>
            ))}
          </div>
          {!graphicQuote ? (
            <Button data-testid="social-graphic-quote" className="min-h-11" onClick={() => void quoteGraphic()} loading={loading} disabled={!activeDna}>
              Angebot für Grafik
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button className="min-h-11" onClick={() => void confirmGraphic()} loading={loading}>
                Erstellen – {formatCoins(graphicQuote.coinCost)} Coins
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={async () => {
                  await api.nexter.cancelQuote(graphicQuote.id).catch(() => {});
                  setGraphicQuote(null);
                }}
              >
                Abbrechen
              </Button>
            </div>
          )}
          {graphicJob?.imageUrl && (
            <div>
              <img src={graphicJob.imageUrl} alt="Erzeugte Social-Grafik, intern gespeichert" className="max-h-80 rounded-xl border border-white/10" />
              <a href={graphicJob.imageUrl} download className="mt-2 inline-block text-sm text-violet-300">
                Herunterladen
              </a>
            </div>
          )}
        </div>
      )}

      {tab === 'planner' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <GlassCard className="!p-4 space-y-3">
            <h3 className="text-sm font-semibold">Intern planen</h3>
            <p className="text-xs text-zinc-500">
              NEXTER veröffentlicht diesen Beitrag noch nicht automatisch auf der Plattform.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_PLATFORMS.map((p) => (
                <StudioOptionPill key={p} active={platform === p} onClick={() => setPlatform(p)}>
                  {p}
                </StudioOptionPill>
              ))}
            </div>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="planner-datetime">
              Datum und Uhrzeit
              <Input
                id="planner-datetime"
                type="datetime-local"
                data-testid="planner-datetime"
                className="mt-1 min-h-11"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="planner-media">
              Medium (eigenes Short/Video)
              <select
                id="planner-media"
                data-testid="planner-media"
                className="mt-1 min-h-11 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
                value={mediaAssetId}
                onChange={(e) => setMediaAssetId(e.target.value)}
              >
                <option value="">Kein Medium</option>
                {shorts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || s.videoTitle} ({s.id.slice(0, 6)})
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button data-testid="planner-save-draft" size="sm" variant="outline" className="min-h-11" onClick={() => void planInternal('draft')} disabled={!current}>
                Entwurf speichern
              </Button>
              <Button
                data-testid="planner-schedule"
                size="sm"
                className="min-h-11"
                onClick={() => void planInternal('scheduled')}
                disabled={!current || !scheduledAt}
              >
                Intern planen
              </Button>
            </div>
            {!current && <p className="text-xs text-zinc-500">Zuerst ein Content-Paket im Tab Content erzeugen oder wählen.</p>}
          </GlassCard>
          <GlassCard className="!p-4">
            <h3 className="mb-2 text-sm font-semibold">Übersicht</h3>
            {posts.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="planner-empty">
                Noch keine internen Einträge.
              </p>
            )}
            <ul className="space-y-2">
              {posts.map((p) => {
                const st = p.plannerStatus ?? normalizePlannerStatus(p.status);
                return (
                  <li key={p.id} className="rounded border border-white/10 p-2 text-sm" data-testid="planner-row">
                    {editingPostId === p.id ? (
                      <div className="space-y-2">
                        <label className="block text-xs text-zinc-400" htmlFor={`edit-post-${p.id}`}>
                          Inhalt
                          <textarea
                            id={`edit-post-${p.id}`}
                            className="mt-1 min-h-[72px] w-full rounded border border-white/10 bg-black/40 p-2 text-sm"
                            value={editPostContent}
                            onChange={(e) => setEditPostContent(e.target.value)}
                          />
                        </label>
                        <label className="block text-xs text-zinc-400" htmlFor={`edit-when-${p.id}`}>
                          Zeitpunkt
                          <Input
                            id={`edit-when-${p.id}`}
                            type="datetime-local"
                            className="mt-1 min-h-11"
                            value={editPostWhen}
                            onChange={(e) => setEditPostWhen(e.target.value)}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" className="min-h-11" onClick={() => void savePlannerEdit(p.id)}>
                            Speichern
                          </Button>
                          <Button size="sm" variant="outline" className="min-h-11" onClick={() => setEditingPostId(null)}>
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-zinc-200">{p.content.slice(0, 120)}</p>
                        <p className="text-[11px] text-zinc-500">
                          {p.platform}
                          {p.scheduledAt ? ` · ${new Date(p.scheduledAt).toLocaleString('de-DE')}` : ''}
                          {p.version ? ` · v${p.version}` : ''}
                        </p>
                        <p data-testid="planner-status" className="text-xs text-amber-200">
                          {p.plannerLabel ?? plannerStatusLabel(st)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => {
                              setEditingPostId(p.id);
                              setEditPostContent(p.content);
                              setEditPostWhen(p.scheduledAt ? isoToDatetimeLocalValue(p.scheduledAt) : '');
                            }}
                          >
                            Bearbeiten
                          </Button>
                          <Button size="sm" variant="outline" className="min-h-11" onClick={() => void removePlanner(p.id)}>
                            Entfernen
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            aria-label="Text kopieren"
                            onClick={() => void copyPlain(p.content)}
                          >
                            Text kopieren
                          </Button>
                          {st !== 'ready' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11"
                              aria-label="Als erledigt markieren"
                              onClick={() =>
                                void api.social.update(p.id, { status: 'ready' }).then((res) => {
                                  setPosts((prev) => prev.map((row) => (row.id === p.id ? res.post : row)));
                                  setStatus('Als erledigt markiert — nicht veröffentlicht.');
                                })
                              }
                            >
                              Erledigt
                            </Button>
                          )}
                          {p.scheduledAt && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11"
                              aria-label="Planung entfernen"
                              onClick={() =>
                                void api.social.update(p.id, { clearSchedule: true }).then((res) => {
                                  setPosts((prev) => prev.map((row) => (row.id === p.id ? res.post : row)));
                                  setStatus('Planung entfernt — wieder Entwurf.');
                                })
                              }
                            >
                              Planung entfernen
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        </div>
      )}
    </StudioShell>
  );
}
