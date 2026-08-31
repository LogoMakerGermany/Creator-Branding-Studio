import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  COIN_COSTS,
  CONTENT_PLATFORMS,
  CoinSpendCategory,
  plannerStatusLabel,
  normalizePlannerStatus,
  type ContentPlatformId,
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

type Tab = 'content' | 'graphic' | 'planner';

export function SocialStudioPage() {
  const { activeDna, refreshUser } = useAuth();
  const brandProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const [search] = useSearchParams();
  const [tab, setTab] = useState<Tab>('content');
  const [packages, setPackages] = useState<TextStudioJob[]>([]);
  const [current, setCurrent] = useState<TextStudioJob | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<ContentPlatformId>('tiktok');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>('tiktok');
  const [scheduledAt, setScheduledAt] = useState('');
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const [mediaAssetId, setMediaAssetId] = useState('');
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('thumbnail');
  const [graphicJob, setGraphicJob] = useState<GenerationJob | null>(null);
  const [graphicQuote, setGraphicQuote] = useState<{ id: string; coinCost: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const qTab = search.get('tab');
    if (qTab === 'planner' || qTab === 'graphic' || qTab === 'content') setTab(qTab);
  }, [search]);

  async function reload() {
    const [text, social, vids] = await Promise.all([
      api.textStudio.list().catch(() => ({ jobs: [] as TextStudioJob[] })),
      api.social.list().catch(() => ({ posts: [] as SocialPost[] })),
      api.video.list().catch(() => ({ projects: [] as VideoProject[] })),
    ]);
    setPackages(text.jobs);
    const qid = search.get('packageId');
    const match = text.jobs.find((j) => j.id === qid) ?? text.jobs[0] ?? null;
    setCurrent(match);
    setPosts(social.posts);
    setVideos(vids.projects);
  }

  useEffect(() => {
    void reload();
  }, [search]);

  const variant = current?.platformVariants?.[previewPlatform];
  const previewCaption = variant?.caption || current?.caption || '';
  const previewTitle = variant?.title || current?.title || '';
  const previewTags = (variant?.hashtags ?? current?.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');

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

  async function planInternal(as: 'draft' | 'scheduled') {
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const content = [previewTitle, previewCaption, previewTags, current.callToAction].filter(Boolean).join('\n');
      const postRes = await api.social.create({
        platform,
        content,
        scheduledAt: as === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        packageId: current.id,
        projectId: current.projectId || brandProjectId || undefined,
        mediaAssetId: mediaAssetId || undefined,
        mediaKind: mediaAssetId ? 'short' : undefined,
        status: as === 'scheduled' ? 'scheduled' : 'draft',
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
          settingsTitle="Paket"
          previewTitle="Interne Vorschau"
          settings={
            <div className="space-y-3">
              {packages.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Noch kein Content-Paket.{' '}
                  <Link to="/text-studio" className="text-violet-300">
                    Im Text Studio erstellen
                  </Link>
                </p>
              )}
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setCurrent(pkg)}
                  className={`block w-full rounded border p-2 text-left text-sm ${
                    current?.id === pkg.id ? 'border-violet-500 bg-violet-500/10' : 'border-white/10'
                  }`}
                >
                  {pkg.title || pkg.hook || pkg.topic}
                </button>
              ))}
              <p className="text-[11px] text-zinc-500">Plattform-Ziel (Vorlage)</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_PLATFORMS.map((p) => (
                  <StudioOptionPill
                    key={p.id}
                    active={previewPlatform === p.id}
                    onClick={() => setPreviewPlatform(p.id)}
                  >
                    {p.displayName}
                  </StudioOptionPill>
                ))}
              </div>
            </div>
          }
          preview={
            <div
              data-testid="social-preview"
              className="mx-auto aspect-[9/16] max-h-[420px] w-full max-w-[240px] overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950 p-4"
            >
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Interne Vorschau · {previewPlatform}</p>
              <p className="mt-3 text-sm font-semibold text-white">{previewTitle || 'Kein Titel'}</p>
              <p className="mt-2 text-xs text-zinc-300">{previewCaption || 'Keine Caption'}</p>
              <p className="mt-3 text-[11px] text-violet-300">{previewTags}</p>
              <p className="mt-4 text-[10px] text-zinc-600">Keine Live-App-Simulation.</p>
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
            <Button data-testid="social-graphic-quote" onClick={() => void quoteGraphic()} loading={loading} disabled={!activeDna}>
              Angebot für Grafik
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={() => void confirmGraphic()} loading={loading}>
                Erstellen – {formatCoins(graphicQuote.coinCost)} Coins
              </Button>
              <Button
                variant="outline"
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
              <img src={graphicJob.imageUrl} alt="" className="max-h-80 rounded-xl border border-white/10" />
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
            <Input
              type="datetime-local"
              data-testid="planner-datetime"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <label className="block text-xs text-zinc-500">
              Medium (eigenes Short/Video)
              <select
                data-testid="planner-media"
                className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
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
              <Button data-testid="planner-save-draft" size="sm" variant="outline" onClick={() => void planInternal('draft')} disabled={!current}>
                Entwurf speichern
              </Button>
              <Button
                data-testid="planner-schedule"
                size="sm"
                onClick={() => void planInternal('scheduled')}
                disabled={!current || !scheduledAt}
              >
                Intern planen
              </Button>
            </div>
          </GlassCard>
          <GlassCard className="!p-4">
            <h3 className="mb-2 text-sm font-semibold">Übersicht</h3>
            <ul className="space-y-2">
              {posts.map((p) => {
                const st = p.plannerStatus ?? normalizePlannerStatus(p.status);
                return (
                  <li key={p.id} className="rounded border border-white/10 p-2 text-sm" data-testid="planner-row">
                    <p className="text-zinc-200">{p.content.slice(0, 120)}</p>
                    <p className="text-[11px] text-zinc-500">
                      {p.platform}
                      {p.scheduledAt ? ` · ${new Date(p.scheduledAt).toLocaleString('de-DE')}` : ''}
                    </p>
                    <p data-testid="planner-status" className="text-xs text-amber-200">
                      {p.plannerLabel ?? plannerStatusLabel(st)}
                    </p>
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
